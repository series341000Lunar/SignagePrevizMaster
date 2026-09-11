'use strict';

const { WebSocket, WebSocketServer } = require('ws');

const ROLES = new Set(['photoshop', 'renderer']);
const BAKE_OUTPUT_KINDS = new Set(['CANONICAL', 'DIRECT']);

function validateBakeMetadata(message, config) {
  const integerFields = ['jobId', 'targetDocumentId', 'width', 'height', 'components', 'componentSize', 'totalBytes', 'chunkSize', 'chunkCount'];
  for (const field of integerFields) {
    if (!Number.isSafeInteger(message[field]) || message[field] <= 0) throw new Error(`${field} must be a positive safe integer.`);
  }
  if (typeof message.familyId !== 'string' || !message.familyId || message.familyId.length > 128) throw new Error('familyId must be a non-empty string of at most 128 characters.');
  if (!BAKE_OUTPUT_KINDS.has(message.outputKind)) throw new Error('outputKind must be CANONICAL or DIRECT.');
  if (typeof message.outputId !== 'string' || !message.outputId || message.outputId.length > 256) throw new Error('outputId must be a non-empty string of at most 256 characters.');
  if (typeof message.targetId !== 'string' || !message.targetId || message.targetId.length > 128) throw new Error('targetId must be a non-empty string of at most 128 characters.');
  if (typeof message.targetSessionId !== 'string' || !message.targetSessionId || message.targetSessionId.length > 128) throw new Error('targetSessionId must be a non-empty string of at most 128 characters.');
  if (message.bindingKey !== `${message.familyId}:${message.outputKind}`) throw new Error('bindingKey must exactly match familyId:outputKind.');
  if (message.components !== 4 || message.componentSize !== 8 || message.pixelFormat !== 'RGBA') throw new Error('Block 7 accepts only RGBA8 output.');
  if (message.alpha !== 'STRAIGHT' || message.orientation !== 'TOP_LEFT') throw new Error('Block 7 requires straight alpha and TOP_LEFT orientation.');
  const expectedBytes = message.width * message.height * 4;
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0 || message.totalBytes !== expectedBytes) throw new Error(`totalBytes ${message.totalBytes} does not match calculated ${expectedBytes}.`);
  if (message.totalBytes > config.maxFrameBytes) throw new Error(`Bake exceeds maxFrameBytes ${config.maxFrameBytes}.`);
  if (message.chunkSize > config.chunkSizeBytes) throw new Error('chunkSize exceeds the configured limit.');
  if (message.chunkCount !== Math.ceil(message.totalBytes / message.chunkSize)) throw new Error('chunkCount does not match totalBytes/chunkSize.');
  return expectedBytes;
}

function validateBakeTargetRegistrySnapshot(message) {
  if (message.registryAuthority !== 'UXP' || message.scope !== 'SESSION') throw new Error('Bake Target Registry must be UXP-authoritative and session-scoped.');
  if (typeof message.sessionId !== 'string' || !message.sessionId || message.sessionId.length > 128) throw new Error('Bake Target Registry sessionId is invalid.');
  if (!Array.isArray(message.targets) || !Array.isArray(message.bindings)) throw new Error('Bake Target Registry targets and bindings must be arrays.');
  if (message.targets.length > 256 || message.bindings.length > 512) throw new Error('Bake Target Registry exceeds the bounded session capacity.');
  const targetIds = new Set();
  const targetStatuses = new Set(['READY', 'CLOSED', 'IDENTITY_CHANGED', 'DIMENSION_CHANGED', 'MODE_CHANGED', 'DEPTH_CHANGED']);
  for (const target of message.targets) {
    if (typeof target.targetId !== 'string' || !target.targetId || target.targetId.length > 128 || targetIds.has(target.targetId)) throw new Error('Bake Target Registry contains an invalid or duplicate targetId.');
    targetIds.add(target.targetId);
    for (const field of ['documentId', 'width', 'height']) {
      if (!Number.isSafeInteger(target[field]) || target[field] <= 0) throw new Error(`Bake Target ${target.targetId} has invalid ${field}.`);
    }
    if (typeof target.label !== 'string' || !target.label || typeof target.documentName !== 'string' || !target.documentName) throw new Error(`Bake Target ${target.targetId} identity is incomplete.`);
    if (!targetStatuses.has(target.status) || typeof target.documentMode !== 'string' || !target.documentMode || !(target.documentDepth === 8 || typeof target.documentDepth === 'string')) {
      throw new Error(`Bake Target ${target.targetId} status, mode, or depth is invalid.`);
    }
  }
  const bindingKeys = new Set();
  for (const binding of message.bindings) {
    const expectedKey = `${binding.familyId}:${binding.outputKind}`;
    if (!['DIRECT', 'CANONICAL'].includes(binding.outputKind) || binding.bindingKey !== expectedKey || bindingKeys.has(binding.bindingKey)) throw new Error('Bake Target Registry contains an invalid or duplicate binding.');
    if (!targetIds.has(binding.targetId)) throw new Error('Bake Target Registry binding references an unknown targetId.');
    bindingKeys.add(binding.bindingKey);
  }
  return true;
}

function createLiveLinkBroker({ config, onEvent = () => {}, serverFactory, replaceExistingRoles = false } = {}) {
  if (!config) throw new Error('Live-link config is required.');

  const makeServer = serverFactory || ((options) => new WebSocketServer(options));
  const clients = { photoshop: null, renderer: null };
  let activeFrame = null;
  let activeBake = null;
  let activePointerRequest = null;
  const seenPointerRequestIds = new Set();
  const seenPointerRequestOrder = [];
  const seenBakeJobIds = new Set();
  const seenBakeJobOrder = [];
  const server = makeServer({
    host: config.host,
    port: config.port,
    maxPayload: config.chunkSizeBytes + 1024
  });

  function emit(type, detail = {}) {
    onEvent({ type, at: new Date().toISOString(), ...detail });
  }

  function isOpen(socket) {
    return socket?.readyState === WebSocket.OPEN;
  }

  function sendJson(socket, message) {
    if (!isOpen(socket)) return false;
    socket.send(JSON.stringify(message));
    return true;
  }

  function sendError(socket, code, message, frameId = null) {
    sendJson(socket, { type: 'ERROR', code, message, frameId });
    emit('protocol-error', { role: socket?.luuxRole || 'unassigned', code, message, frameId });
  }

  function sendPointerError(socket, requestId, code, message) {
    sendJson(socket, { type: 'POINTER_ERROR', requestId: requestId ?? null, code, message });
    emit('pointer-error', { role: socket?.luuxRole || 'unassigned', requestId: requestId ?? null, code, message });
  }

  function linkStatus() {
    return {
      type: 'LINK_STATUS',
      photoshopConnected: isOpen(clients.photoshop),
      rendererConnected: isOpen(clients.renderer)
    };
  }

  function broadcastStatus() {
    const message = linkStatus();
    sendJson(clients.photoshop, message);
    sendJson(clients.renderer, message);
  }

  function abortActiveFrame(code, message) {
    if (!activeFrame) return;
    const frameId = activeFrame.metadata.frameId;
    sendJson(activeFrame.photoshop, { type: 'ERROR', code, message, frameId });
    sendJson(activeFrame.renderer, { type: 'FRAME_ABORT', code, message, frameId });
    emit('frame-aborted', { code, message, frameId });
    activeFrame = null;
  }

  function abortActivePointer(code, message) {
    if (!activePointerRequest) return;
    const { requestId, renderer, timer } = activePointerRequest;
    if (timer) clearTimeout(timer);
    sendPointerError(renderer, requestId, code, message);
    activePointerRequest = null;
  }

  function rememberBakeJobId(jobId) {
    seenBakeJobIds.add(jobId);
    seenBakeJobOrder.push(jobId);
    if (seenBakeJobOrder.length > 256) seenBakeJobIds.delete(seenBakeJobOrder.shift());
  }

  function abortActiveBake(code, message, notifyPhotoshop = true) {
    if (!activeBake) return;
    const { jobId } = activeBake.metadata;
    if (activeBake.timer) clearTimeout(activeBake.timer);
    sendJson(activeBake.renderer, { type: 'BAKE_ERROR', jobId, code, message });
    if (notifyPhotoshop) sendJson(activeBake.photoshop, { type: 'BAKE_ABORT', jobId, code, message });
    emit('bake-aborted', { jobId, code, message });
    activeBake = null;
  }

  function rejectActivePointerResponse(socket, code, message) {
    const requestId = activePointerRequest?.requestId ?? null;
    const rendererSocket = activePointerRequest?.renderer || null;
    if (activePointerRequest?.timer) clearTimeout(activePointerRequest.timer);
    activePointerRequest = null;
    if (rendererSocket) sendPointerError(rendererSocket, requestId, code, message);
    sendPointerError(socket, requestId, code, message);
  }

  function rememberPointerRequestId(requestId) {
    seenPointerRequestIds.add(requestId);
    seenPointerRequestOrder.push(requestId);
    if (seenPointerRequestOrder.length > 256) {
      seenPointerRequestIds.delete(seenPointerRequestOrder.shift());
    }
  }

  function validatePointerBase(message) {
    for (const field of ['requestId', 'sourceFrameId', 'documentId', 'width', 'height']) {
      if (!Number.isSafeInteger(message[field]) || message[field] <= 0) {
        throw new Error(`${field} must be a positive safe integer.`);
      }
    }
    if (typeof message.documentName !== 'string' || message.documentName.length === 0 || message.documentName.length > 1024) {
      throw new Error('documentName must be a non-empty string of at most 1024 characters.');
    }
  }

  function validatePointerCommand(message) {
    validatePointerBase(message);
    if (message.type === 'POINTER_SET') {
      if (!Number.isSafeInteger(message.x) || !Number.isSafeInteger(message.y)) {
        throw new Error('x and y must be safe integer pixels.');
      }
      if (message.x < 0 || message.x >= message.width || message.y < 0 || message.y >= message.height) {
        const error = new Error('Pointer pixel is outside the declared document dimensions.');
        error.code = 'OUT_OF_RANGE';
        throw error;
      }
      if (![message.u, message.v].every(Number.isFinite) || message.u < 0 || message.u > 1 || message.v < 0 || message.v > 1) {
        throw new Error('u and v must be finite normalized coordinates in the range 0..1.');
      }
      const normalizedX = Math.min(message.width - 1, Math.floor(message.u * message.width));
      const normalizedY = Math.min(message.height - 1, Math.floor(message.v * message.height));
      if (Math.abs(normalizedX - message.x) > 1 || Math.abs(normalizedY - message.y) > 1) {
        throw new Error('Canonical normalized and pixel coordinates disagree.');
      }
    }
  }

  function handlePointerCommand(socket, message) {
    if (socket !== clients.renderer) {
      sendPointerError(socket, message.requestId, 'ROLE_VIOLATION', 'Only the renderer may send pointer commands.');
      return;
    }
    try {
      if (!['POINTER_SET', 'POINTER_CLEAR'].includes(message.type)) throw new Error('Unsupported pointer command type.');
      validatePointerCommand(message);
      if (seenPointerRequestIds.has(message.requestId)) {
        sendPointerError(socket, message.requestId, 'DUPLICATE_REQUEST', 'Pointer requestId was already used in this renderer session.');
        return;
      }
      if (activePointerRequest) {
        sendPointerError(socket, message.requestId, 'POINTER_IN_FLIGHT', 'A pointer request is already awaiting Photoshop response.');
        return;
      }
      if (!isOpen(clients.photoshop)) {
        sendPointerError(socket, message.requestId, 'UXP_DISCONNECTED', 'Photoshop UXP is not connected.');
        return;
      }
      rememberPointerRequestId(message.requestId);
      activePointerRequest = {
        requestId: message.requestId,
        type: message.type,
        renderer: socket,
        photoshop: clients.photoshop,
        timer: setTimeout(() => {
          if (activePointerRequest?.requestId === message.requestId) {
            abortActivePointer('POINTER_TIMEOUT', `Photoshop did not respond within ${config.ackTimeoutMs} ms.`);
          }
        }, config.ackTimeoutMs)
      };
      sendJson(clients.photoshop, message);
      emit('pointer-routed', { requestId: message.requestId, command: message.type });
    } catch (error) {
      sendPointerError(socket, message.requestId, error.code || 'INVALID_POINTER', error.message);
    }
  }

  function handlePointerResponse(socket, message) {
    if (socket !== clients.photoshop) {
      sendPointerError(socket, message.requestId, 'ROLE_VIOLATION', 'Only Photoshop may respond to pointer commands.');
      return;
    }
    if (!activePointerRequest || activePointerRequest.photoshop !== socket || message.requestId !== activePointerRequest.requestId) {
      sendPointerError(socket, message.requestId, 'UNEXPECTED_POINTER_RESPONSE', 'Pointer response does not match the active request.');
      return;
    }
    if (message.type === 'POINTER_ACK') {
      for (const field of ['documentId', 'requestedX', 'requestedY', 'appliedX', 'appliedY']) {
        if (!Number.isSafeInteger(message[field]) || message[field] < 0) {
          rejectActivePointerResponse(socket, 'INVALID_POINTER_ACK', `${field} must be a non-negative safe integer.`);
          return;
        }
      }
      if (typeof message.layerName !== 'string' || message.layerName.length === 0) {
        rejectActivePointerResponse(socket, 'INVALID_POINTER_ACK', 'layerName is required.');
        return;
      }
    } else if (message.type === 'POINTER_CLEAR_ACK') {
      if (!Number.isSafeInteger(message.documentId) || message.documentId <= 0) {
        rejectActivePointerResponse(socket, 'INVALID_POINTER_ACK', 'documentId is required.');
        return;
      }
    } else if (typeof message.code !== 'string' || message.code.length === 0) {
      rejectActivePointerResponse(socket, 'INVALID_POINTER_ERROR', 'Pointer errors require a code.');
      return;
    }
    const rendererSocket = activePointerRequest.renderer;
    if (activePointerRequest.timer) clearTimeout(activePointerRequest.timer);
    activePointerRequest = null;
    sendJson(rendererSocket, message);
    emit('pointer-response', { requestId: message.requestId, response: message.type });
  }

  function validateFrameMetadata(message) {
    const integerFields = ['frameId', 'documentId', 'documentWidth', 'documentHeight', 'width', 'height', 'components', 'componentSize', 'totalBytes', 'chunkSize', 'chunkCount'];
    for (const field of integerFields) {
      if (!Number.isSafeInteger(message[field]) || message[field] < 0) {
        throw new Error(`${field} must be a non-negative safe integer.`);
      }
    }
    if (message.frameId === 0 || message.width === 0 || message.height === 0) {
      throw new Error('frameId, width, and height must be greater than zero.');
    }
    if (message.componentSize !== 8) throw new Error('Block 1 accepts only 8-bit components.');
    if (![3, 4].includes(message.components)) throw new Error('Block 1 accepts only RGB or RGBA data.');
    if (!['RGB', 'RGBA'].includes(message.pixelFormat)) throw new Error('pixelFormat must be RGB or RGBA.');
    if (message.pixelFormat.length !== message.components) throw new Error('pixelFormat and component count disagree.');
    if (message.documentWidth !== message.width || message.documentHeight !== message.height) {
      throw new Error('Document and capture dimensions must match.');
    }
    const expectedBytes = message.width * message.height * message.components * (message.componentSize / 8);
    if (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0) throw new Error('Calculated byte count is invalid.');
    if (message.totalBytes !== expectedBytes) throw new Error(`totalBytes ${message.totalBytes} does not match calculated ${expectedBytes}.`);
    if (message.totalBytes > config.maxFrameBytes) throw new Error(`Frame exceeds maxFrameBytes ${config.maxFrameBytes}.`);
    if (message.chunkSize <= 0 || message.chunkSize > config.chunkSizeBytes) throw new Error('chunkSize exceeds the configured limit.');
    if (message.chunkCount !== Math.ceil(message.totalBytes / message.chunkSize)) throw new Error('chunkCount does not match totalBytes/chunkSize.');
    return expectedBytes;
  }

  function handleBakeBegin(socket, message) {
    if (socket !== clients.renderer) return sendError(socket, 'ROLE_VIOLATION', 'Only the renderer may begin a Photoshop bake.');
    if (activeBake) return sendJson(socket, { type: 'BAKE_ERROR', jobId: message.jobId ?? null, code: 'BAKE_BUSY', message: 'A full-image Photoshop bake is already in progress.' });
    if (seenBakeJobIds.has(message.jobId)) return sendJson(socket, { type: 'BAKE_ERROR', jobId: message.jobId, code: 'DUPLICATE_JOB', message: 'Bake jobId was already used in this renderer session.' });
    if (!isOpen(clients.photoshop)) return sendJson(socket, { type: 'BAKE_ERROR', jobId: message.jobId ?? null, code: 'UXP_DISCONNECTED', message: 'Photoshop UXP is not connected.' });
    try {
      const expectedBytes = validateBakeMetadata(message, config);
      rememberBakeJobId(message.jobId);
      activeBake = {
        metadata: { ...message, brokerReceivedAtEpochMs: Date.now() }, expectedBytes,
        receivedBytes: 0, receivedChunks: 0, pendingChunk: null,
        renderer: socket, photoshop: clients.photoshop, ended: false, receiveAcknowledged: false,
        timer: setTimeout(() => {
          if (activeBake?.metadata.jobId === message.jobId) abortActiveBake('BAKE_TIMEOUT', `Photoshop bake did not complete within ${config.ackTimeoutMs} ms.`);
        }, config.ackTimeoutMs)
      };
      sendJson(activeBake.photoshop, activeBake.metadata);
      emit('bake-begin', { jobId: message.jobId, familyId: message.familyId, outputKind: message.outputKind, targetId: message.targetId, totalBytes: message.totalBytes });
    } catch (error) {
      sendJson(socket, { type: 'BAKE_ERROR', jobId: message.jobId ?? null, code: 'INVALID_BAKE_METADATA', message: error.message });
      emit('bake-rejected', { jobId: message.jobId ?? null, code: 'INVALID_BAKE_METADATA', message: error.message });
    }
  }

  function handleBakeChunk(socket, message) {
    if (!activeBake || socket !== activeBake.renderer || activeBake.ended || message.jobId !== activeBake.metadata.jobId) {
      if (activeBake) abortActiveBake('UNEXPECTED_BAKE_CHUNK', 'BAKE_CHUNK does not match the active bake.');
      else sendJson(socket, { type: 'BAKE_ERROR', jobId: message.jobId ?? null, code: 'UNEXPECTED_BAKE_CHUNK', message: 'BAKE_CHUNK arrived without a matching active bake.' });
      return;
    }
    const expectedIndex = activeBake.receivedChunks;
    const remaining = activeBake.expectedBytes - activeBake.receivedBytes;
    const expectedLength = Math.min(activeBake.metadata.chunkSize, remaining);
    if (activeBake.pendingChunk || message.chunkIndex !== expectedIndex || message.byteLength !== expectedLength) {
      abortActiveBake('INVALID_BAKE_CHUNK', `Expected chunk ${expectedIndex} with ${expectedLength} bytes.`);
      return;
    }
    activeBake.pendingChunk = { chunkIndex: message.chunkIndex, byteLength: message.byteLength };
    sendJson(activeBake.photoshop, message);
  }

  function handleBakeBinary(socket, data) {
    if (!activeBake || socket !== activeBake.renderer || activeBake.ended || !activeBake.pendingChunk) {
      if (activeBake) abortActiveBake('UNEXPECTED_BAKE_BINARY', 'Bake binary arrived without a valid BAKE_CHUNK marker.');
      else sendError(socket, 'UNEXPECTED_BINARY', 'Binary data arrived without an active transfer.');
      return;
    }
    const bytes = data.byteLength;
    if (bytes !== activeBake.pendingChunk.byteLength || activeBake.receivedBytes + bytes > activeBake.expectedBytes) {
      abortActiveBake('INVALID_BAKE_BINARY', `Bake binary length ${bytes} does not match the declared chunk.`);
      return;
    }
    if (!isOpen(activeBake.photoshop)) return abortActiveBake('UXP_DISCONNECTED', 'Photoshop disconnected during the bake.', false);
    activeBake.receivedBytes += bytes;
    activeBake.receivedChunks += 1;
    activeBake.pendingChunk = null;
    activeBake.photoshop.send(data, { binary: true });
    const photoshopTransport = activeBake.photoshop._socket;
    const rendererTransport = activeBake.renderer._socket;
    if (activeBake.photoshop.bufferedAmount > config.backpressureHighWaterMarkBytes && photoshopTransport && rendererTransport && !rendererTransport.isPaused()) {
      rendererTransport.pause();
      photoshopTransport.once('drain', () => {
        if (activeBake?.renderer === socket && !rendererTransport.destroyed) rendererTransport.resume();
      });
    }
  }

  function handleBakeEnd(socket, message) {
    if (!activeBake || socket !== activeBake.renderer || message.jobId !== activeBake.metadata.jobId) {
      if (activeBake) abortActiveBake('UNEXPECTED_BAKE_END', 'BAKE_END does not match the active bake.');
      else sendJson(socket, { type: 'BAKE_ERROR', jobId: message.jobId ?? null, code: 'UNEXPECTED_BAKE_END', message: 'BAKE_END arrived without a matching bake.' });
      return;
    }
    if (activeBake.pendingChunk || activeBake.receivedBytes !== activeBake.expectedBytes || activeBake.receivedChunks !== activeBake.metadata.chunkCount ||
        message.receivedBytes !== activeBake.receivedBytes || message.receivedChunks !== activeBake.receivedChunks) {
      abortActiveBake('INCOMPLETE_BAKE', `Received ${activeBake.receivedBytes}/${activeBake.expectedBytes} bytes and ${activeBake.receivedChunks}/${activeBake.metadata.chunkCount} chunks.`);
      return;
    }
    activeBake.ended = true;
    sendJson(activeBake.photoshop, { ...message, brokerFrameEndAtEpochMs: Date.now() });
    emit('bake-end', { jobId: message.jobId, receivedBytes: activeBake.receivedBytes, receivedChunks: activeBake.receivedChunks });
  }

  function handleBakeResponse(socket, message) {
    if (socket !== clients.photoshop || !activeBake || activeBake.photoshop !== socket || message.jobId !== activeBake.metadata.jobId) {
      sendJson(socket, { type: 'BAKE_ABORT', jobId: message.jobId ?? null, code: 'UNEXPECTED_BAKE_RESPONSE', message: 'Photoshop response does not match the active bake.' });
      return;
    }
    if (message.type === 'BAKE_RECEIVED') {
      if (!activeBake.ended || message.receivedBytes !== activeBake.expectedBytes || message.receivedChunks !== activeBake.metadata.chunkCount) return abortActiveBake('INVALID_BAKE_RECEIPT', 'Photoshop receipt does not match the transferred bake.');
      activeBake.receiveAcknowledged = true;
      sendJson(activeBake.renderer, message);
      emit('bake-received', { jobId: message.jobId });
      return;
    }
    if (message.type === 'BAKE_APPLYING') {
      if (!activeBake.receiveAcknowledged) return abortActiveBake('INVALID_BAKE_STATE', 'Photoshop cannot apply before acknowledging complete receipt.');
      sendJson(activeBake.renderer, message);
      emit('bake-applying', { jobId: message.jobId });
      return;
    }
    if (message.type === 'BAKE_APPLIED') {
      if (!activeBake.receiveAcknowledged ||
          message.targetId !== activeBake.metadata.targetId ||
          message.targetSessionId !== activeBake.metadata.targetSessionId ||
          message.targetDocumentId !== activeBake.metadata.targetDocumentId ||
          !Number.isSafeInteger(message.layerId) || message.layerId <= 0) {
        return abortActiveBake('INVALID_BAKE_APPLY_ACK', 'Photoshop apply acknowledgement is invalid.');
      }
      if (activeBake.timer) clearTimeout(activeBake.timer);
      sendJson(activeBake.renderer, message);
      emit('bake-applied', { jobId: message.jobId, targetId: message.targetId, targetDocumentId: message.targetDocumentId, layerId: message.layerId });
      activeBake = null;
      return;
    }
    abortActiveBake(message.code || 'APPLY_ERROR', message.message || 'Photoshop failed to apply the bake.', false);
  }

  function handleBakeTargetRegistry(socket, message) {
    if (socket !== clients.photoshop) return sendError(socket, 'ROLE_VIOLATION', 'Only Photoshop may report bake target status.');
    try {
      validateBakeTargetRegistrySnapshot(message);
      sendJson(clients.renderer, message);
      emit('bake-target-registry', { sessionId: message.sessionId, targetCount: message.targets.length, bindingCount: message.bindings.length });
    } catch (error) {
      sendError(socket, 'INVALID_BAKE_TARGET_REGISTRY', error.message);
    }
  }

  function handleHello(socket, message) {
    if (message.protocol !== config.protocol || message.protocolVersion !== config.protocolVersion || !ROLES.has(message.role)) {
      sendError(socket, 'BAD_HELLO', 'Protocol, version, or role is invalid.');
      socket.close(1008, 'Invalid HELLO');
      return;
    }
    if (isOpen(clients[message.role]) && clients[message.role] !== socket) {
      const incomingIsIsolatedTestClient = replaceExistingRoles && message.isolatedSmokeTestClient === true;
      if (!incomingIsIsolatedTestClient) {
        sendError(socket, 'ROLE_IN_USE', `The ${message.role} role is already connected.`);
        socket.close(1008, 'Role already connected');
        return;
      }
      const replaced = clients[message.role];
      if (activeFrame && (activeFrame.photoshop === replaced || activeFrame.renderer === replaced)) {
        abortActiveFrame('TEST_ROLE_REPLACED', `${message.role} was replaced by the isolated smoke-test client.`);
      }
      if (activePointerRequest && (activePointerRequest.photoshop === replaced || activePointerRequest.renderer === replaced)) {
        abortActivePointer('TEST_ROLE_REPLACED', `${message.role} was replaced by the isolated smoke-test client.`);
      }
      if (activeBake && (activeBake.photoshop === replaced || activeBake.renderer === replaced)) {
        abortActiveBake('TEST_ROLE_REPLACED', `${message.role} was replaced by the isolated smoke-test client.`, activeBake.photoshop !== replaced);
      }
      clients[message.role] = null;
      replaced.close(1012, 'Replaced by isolated smoke-test client');
      emit('client-replaced-for-test', { role: message.role });
    }
    socket.luuxRole = message.role;
    socket.luuxIsolatedSmokeTestClient = replaceExistingRoles && message.isolatedSmokeTestClient === true;
    clients[message.role] = socket;
    sendJson(socket, {
      type: 'HELLO_ACK',
      protocol: config.protocol,
      protocolVersion: config.protocolVersion,
      role: message.role
    });
    emit('client-connected', { role: message.role });
    broadcastStatus();
  }

  function handleFrameBegin(socket, message) {
    if (socket !== clients.photoshop) return sendError(socket, 'ROLE_VIOLATION', 'Only Photoshop may begin a frame.', message.frameId);
    if (activeFrame) return sendError(socket, 'FRAME_IN_FLIGHT', 'A frame is already awaiting completion or ACK.', message.frameId);
    if (!isOpen(clients.renderer)) return sendError(socket, 'RENDERER_DISCONNECTED', 'Electron renderer is not connected.', message.frameId);
    try {
      const expectedBytes = validateFrameMetadata(message);
      activeFrame = {
        metadata: { ...message, brokerReceivedAtEpochMs: Date.now() },
        expectedBytes,
        receivedBytes: 0,
        receivedChunks: 0,
        photoshop: socket,
        renderer: clients.renderer,
        ended: false
      };
      sendJson(activeFrame.renderer, activeFrame.metadata);
      emit('frame-begin', { frameId: message.frameId, totalBytes: message.totalBytes });
    } catch (error) {
      sendError(socket, 'INVALID_FRAME_METADATA', error.message, message.frameId);
    }
  }

  function handleBinary(socket, data) {
    if (!activeFrame || socket !== activeFrame.photoshop || activeFrame.ended) {
      sendError(socket, 'UNEXPECTED_BINARY', 'Binary data arrived without an active frame.');
      return;
    }
    const bytes = data.byteLength;
    if (bytes <= 0 || bytes > activeFrame.metadata.chunkSize) {
      abortActiveFrame('INVALID_CHUNK_SIZE', `Binary chunk size ${bytes} is invalid.`);
      return;
    }
    if (activeFrame.receivedBytes + bytes > activeFrame.expectedBytes) {
      abortActiveFrame('FRAME_OVERFLOW', 'Binary data exceeds the declared frame byte count.');
      return;
    }
    if (!isOpen(activeFrame.renderer)) {
      abortActiveFrame('RENDERER_DISCONNECTED', 'Renderer disconnected during frame transfer.');
      return;
    }

    activeFrame.receivedBytes += bytes;
    activeFrame.receivedChunks += 1;
    activeFrame.renderer.send(data, { binary: true });

    const rendererTransport = activeFrame.renderer._socket;
    const photoshopTransport = activeFrame.photoshop._socket;
    if (activeFrame.renderer.bufferedAmount > config.backpressureHighWaterMarkBytes && rendererTransport && photoshopTransport && !photoshopTransport.isPaused()) {
      photoshopTransport.pause();
      rendererTransport.once('drain', () => {
        if (activeFrame?.photoshop === socket && !photoshopTransport.destroyed) photoshopTransport.resume();
      });
    }
  }

  function handleFrameEnd(socket, message) {
    if (!activeFrame || socket !== activeFrame.photoshop || message.frameId !== activeFrame.metadata.frameId) {
      sendError(socket, 'UNEXPECTED_FRAME_END', 'FRAME_END does not match the active frame.', message.frameId);
      return;
    }
    if (activeFrame.receivedBytes !== activeFrame.expectedBytes || activeFrame.receivedChunks !== activeFrame.metadata.chunkCount) {
      abortActiveFrame('INCOMPLETE_FRAME', `Received ${activeFrame.receivedBytes}/${activeFrame.expectedBytes} bytes and ${activeFrame.receivedChunks}/${activeFrame.metadata.chunkCount} chunks.`);
      return;
    }
    activeFrame.ended = true;
    sendJson(activeFrame.renderer, {
      type: 'FRAME_END',
      frameId: message.frameId,
      receivedBytes: activeFrame.receivedBytes,
      receivedChunks: activeFrame.receivedChunks,
      brokerFrameEndAtEpochMs: Date.now()
    });
    emit('frame-end', { frameId: message.frameId, receivedBytes: activeFrame.receivedBytes });
  }

  function handleFrameAck(socket, message) {
    if (!activeFrame || socket !== activeFrame.renderer || !activeFrame.ended || message.frameId !== activeFrame.metadata.frameId) {
      sendError(socket, 'UNEXPECTED_FRAME_ACK', 'FRAME_ACK does not match the active frame.', message.frameId);
      return;
    }
    const { width, height } = activeFrame.metadata;
    if (message.receivedWidth !== width || message.receivedHeight !== height || message.textureWidth !== width || message.textureHeight !== height) {
      abortActiveFrame('ACK_DIMENSION_MISMATCH', 'Renderer ACK dimensions do not match the frame.');
      return;
    }
    sendJson(activeFrame.photoshop, message);
    emit('frame-ack', { frameId: message.frameId });
    activeFrame = null;
  }

  function handleJson(socket, message) {
    if (!socket.luuxRole) {
      if (message.type !== 'HELLO') {
        sendError(socket, 'HELLO_REQUIRED', 'HELLO must be the first message.');
        return;
      }
      handleHello(socket, message);
      return;
    }
    switch (message.type) {
      case 'FRAME_BEGIN': handleFrameBegin(socket, message); break;
      case 'FRAME_END': handleFrameEnd(socket, message); break;
      case 'FRAME_ACK': handleFrameAck(socket, message); break;
      case 'BAKE_BEGIN': handleBakeBegin(socket, message); break;
      case 'BAKE_CHUNK': handleBakeChunk(socket, message); break;
      case 'BAKE_END': handleBakeEnd(socket, message); break;
      case 'BAKE_RECEIVED':
      case 'BAKE_APPLYING':
      case 'BAKE_APPLIED':
      case 'BAKE_ERROR':
        handleBakeResponse(socket, message);
        break;
      case 'BAKE_TARGET_REGISTRY': handleBakeTargetRegistry(socket, message); break;
      case 'POINTER_SET':
      case 'POINTER_CLEAR':
        handlePointerCommand(socket, message);
        break;
      case 'POINTER_ACK':
      case 'POINTER_CLEAR_ACK':
      case 'POINTER_ERROR':
        handlePointerResponse(socket, message);
        break;
      case 'ERROR':
        if (activeFrame && message.frameId === activeFrame.metadata.frameId) abortActiveFrame(message.code || 'PEER_ERROR', message.message || 'Peer reported an error.');
        break;
      default: sendError(socket, 'UNKNOWN_MESSAGE', `Unknown message type: ${message.type || '<missing>'}.`, message.frameId);
    }
  }

  server.on('connection', (socket, request) => {
    const remoteAddress = request.socket.remoteAddress;
    if (!['127.0.0.1', '::ffff:127.0.0.1'].includes(remoteAddress)) {
      sendError(socket, 'NON_LOOPBACK_REJECTED', 'Only loopback clients are accepted.');
      socket.close(1008, 'Loopback only');
      return;
    }
    socket.on('message', (data, isBinary) => {
      try {
        if (isBinary) {
          if (activeBake && socket === activeBake.renderer) handleBakeBinary(socket, data);
          else handleBinary(socket, data);
          return;
        }
        handleJson(socket, JSON.parse(data.toString('utf8')));
      } catch (error) {
        sendError(socket, 'INVALID_MESSAGE', error.message);
      }
    });
    socket.on('close', () => {
      const role = socket.luuxRole;
      if (role && clients[role] === socket) clients[role] = null;
      if (activeFrame && (activeFrame.photoshop === socket || activeFrame.renderer === socket)) {
        abortActiveFrame('PEER_DISCONNECTED', `${role || 'Unassigned client'} disconnected during a frame.`);
      }
      if (activePointerRequest && (activePointerRequest.photoshop === socket || activePointerRequest.renderer === socket)) {
        abortActivePointer('PEER_DISCONNECTED', `${role || 'Unassigned client'} disconnected during a pointer request.`);
      }
      if (activeBake && (activeBake.photoshop === socket || activeBake.renderer === socket)) {
        abortActiveBake('PEER_DISCONNECTED', `${role || 'Unassigned client'} disconnected during a Photoshop bake.`, activeBake.photoshop !== socket);
      }
      if (role === 'renderer') {
        seenPointerRequestIds.clear();
        seenPointerRequestOrder.length = 0;
        seenBakeJobIds.clear();
        seenBakeJobOrder.length = 0;
      }
      if (role) emit('client-disconnected', { role });
      broadcastStatus();
    });
    socket.on('error', (error) => emit('client-error', { role: socket.luuxRole || 'unassigned', message: error.message }));
  });

  server.on('listening', () => emit('listening', { address: server.address() }));
  server.on('error', (error) => emit('server-error', { message: error.message }));

  return {
    server,
    getSnapshot: () => ({
      address: server.address(),
      photoshopConnected: isOpen(clients.photoshop),
      rendererConnected: isOpen(clients.renderer),
      activeFrameId: activeFrame?.metadata.frameId || null,
      activePointerRequestId: activePointerRequest?.requestId || null
      , activeBakeJobId: activeBake?.metadata.jobId || null
    }),
    close: () => new Promise((resolve) => {
      for (const socket of Object.values(clients)) {
        if (socket) socket.terminate();
      }
      server.close(() => resolve());
    })
  };
}

module.exports = { createLiveLinkBroker, validateBakeMetadata, validateBakeTargetRegistrySnapshot };
