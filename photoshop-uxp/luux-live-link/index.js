'use strict';

const { action, app, constants, core, imaging } = require('photoshop');
const config = window.LUUX_LIVE_LINK_CONFIG;
const DISPLAY_COLOR_PROFILE = 'sRGB IEC61966-2.1';
const AUTO_SYNC_EVENTS = ['historyStateChanged'];
const AUTO_SYNC_DEBOUNCE_MS = 350;
const POINTER_LAYER_NAME = '__LUUX_POINTER__';
const POINTER_DIAMETER_PX = 25;

const elements = {
  documentName: document.querySelector('#document-name'),
  documentDimensions: document.querySelector('#document-dimensions'),
  documentMode: document.querySelector('#document-mode'),
  connectionState: document.querySelector('#connection-state'),
  connectButton: document.querySelector('#connect-button'),
  sendButton: document.querySelector('#send-button'),
  phase: document.querySelector('#phase'),
  frameId: document.querySelector('#frame-id'),
  captureSize: document.querySelector('#capture-size'),
  frameBytes: document.querySelector('#frame-bytes'),
  captureMs: document.querySelector('#capture-ms'),
  sendMs: document.querySelector('#send-ms'),
  ackMs: document.querySelector('#ack-ms'),
  lastError: document.querySelector('#last-error'),
  autoSync: document.querySelector('#auto-sync'),
  autoSyncState: document.querySelector('#auto-sync-state'),
  notificationsSeen: document.querySelector('#notifications-seen'),
  notificationsAccepted: document.querySelector('#notifications-accepted'),
  debouncedTriggers: document.querySelector('#debounced-triggers'),
  framesRequested: document.querySelector('#frames-requested'),
  framesSent: document.querySelector('#frames-sent'),
  dirtyReplacements: document.querySelector('#dirty-replacements'),
  lastAutoEvent: document.querySelector('#last-auto-event'),
  lastAutoEventTime: document.querySelector('#last-auto-event-time'),
  notifyCaptureMs: document.querySelector('#notify-capture-ms'),
  lastCaptureTime: document.querySelector('#last-capture-time'),
  pointerState: document.querySelector('#pointer-state'),
  pointerRequest: document.querySelector('#pointer-request'),
  pointerRequested: document.querySelector('#pointer-requested'),
  pointerApplied: document.querySelector('#pointer-applied'),
  pointerLayer: document.querySelector('#pointer-layer'),
  pointerResult: document.querySelector('#pointer-result'),
  pointerSelection: document.querySelector('#pointer-selection'),
  pointerError: document.querySelector('#pointer-error'),
  probeStart: document.querySelector('#probe-start'),
  probeStop: document.querySelector('#probe-stop'),
  probeOperation: document.querySelector('#probe-operation'),
  probeArm: document.querySelector('#probe-arm'),
  probeClear: document.querySelector('#probe-clear'),
  probeState: document.querySelector('#probe-state'),
  probeArmed: document.querySelector('#probe-armed'),
  probeSeen: document.querySelector('#probe-seen'),
  probeLastEvent: document.querySelector('#probe-last-event'),
  probeLastTime: document.querySelector('#probe-last-time'),
  probeResults: document.querySelector('#probe-results')
};

const PROBE_OPERATIONS = [
  'Paint',
  'Layer Visibility',
  'Move',
  'Transform',
  'Paste',
  'Layer Create',
  'Layer Delete',
  'Adjustment / Property'
];

const state = {
  socket: null,
  connectionState: 'DISCONNECTED',
  handshake: false,
  rendererConnected: false,
  reconnectTimer: null,
  phase: 'IDLE',
  dirty: false,
  dirtyReason: '',
  currentRequestReason: '',
  nextFrameId: 1,
  pendingAck: null,
  lastFrame: null,
  lastError: '',
  pointer: {
    processing: false,
    lastRequestId: null,
    requested: null,
    applied: null,
    layerName: '',
    result: '',
    selectionRestored: null,
    lastError: ''
  },
  autoSync: {
    enabled: false,
    listenerRegistered: false,
    transitionPending: false,
    debounceTimer: null,
    notificationsSeen: 0,
    notificationsAccepted: 0,
    debouncedTriggers: 0,
    framesRequested: 0,
    framesSent: 0,
    dirtyReplacements: 0,
    lastEvent: '',
    lastEventTime: '',
    latestNotificationAt: null,
    notificationToCaptureMs: null,
    lastCaptureTime: ''
  },
  probe: {
    listenerRegistered: false,
    activeOperation: '',
    notificationsSeen: 0,
    lastEvent: '',
    lastEventTime: '',
    countsByOperation: Object.create(null),
    recent: []
  }
};

function probeSummary() {
  const lines = [];
  for (const operation of PROBE_OPERATIONS) {
    const counts = state.probe.countsByOperation[operation] || {};
    const entries = Object.keys(counts)
      .sort()
      .map((eventName) => `${eventName}×${counts[eventName]}`);
    lines.push(`${operation}: ${entries.length ? entries.join(', ') : '—'}`);
  }
  if (state.probe.recent.length) {
    lines.push('', 'Recent notifications:');
    lines.push(...state.probe.recent);
  }
  return lines.join('\n');
}

function renderProbe() {
  const registered = state.probe.listenerRegistered;
  elements.probeStart.disabled = registered;
  elements.probeStop.disabled = !registered;
  elements.probeArm.disabled = !registered;
  elements.probeState.textContent = registered ? 'RECORDING' : 'STOPPED';
  elements.probeArmed.textContent = state.probe.activeOperation || '—';
  elements.probeSeen.textContent = String(state.probe.notificationsSeen);
  elements.probeLastEvent.textContent = state.probe.lastEvent || '—';
  elements.probeLastTime.textContent = state.probe.lastEventTime || '—';
  elements.probeResults.textContent = state.probe.notificationsSeen ? probeSummary() : 'No events observed.';
}

function probeNotificationListener(eventName, descriptor) {
  if (!state.probe.listenerRegistered) return;
  const operation = state.probe.activeOperation || 'Unassigned';
  if (!state.probe.countsByOperation[operation]) state.probe.countsByOperation[operation] = Object.create(null);
  const counts = state.probe.countsByOperation[operation];
  counts[eventName] = (counts[eventName] || 0) + 1;
  state.probe.notificationsSeen += 1;
  state.probe.lastEvent = eventName;
  state.probe.lastEventTime = new Date().toLocaleTimeString();
  const descriptorType = descriptor && descriptor._obj ? ` obj=${descriptor._obj}` : '';
  const descriptorKeys = descriptor
    ? Object.keys(descriptor).filter((key) => key !== '_target').slice(0, 6)
    : [];
  const keys = descriptorKeys.length ? ` keys=${descriptorKeys.join('|')}` : '';
  state.probe.recent.push(`${state.probe.lastEventTime} [${operation}] ${eventName}${descriptorType}${keys}`);
  if (state.probe.recent.length > 16) state.probe.recent.shift();
  renderProbe();
}

async function startEventProbe() {
  if (state.probe.listenerRegistered) return;
  try {
    await action.addNotificationListener(['all'], probeNotificationListener);
    state.probe.listenerRegistered = true;
    state.probe.activeOperation = elements.probeOperation.value;
    state.lastError = '';
  } catch (error) {
    state.lastError = `EVENT_PROBE_START_FAILED: ${error.message || String(error)}`;
  }
  render();
}

async function stopEventProbe() {
  if (!state.probe.listenerRegistered) return;
  try {
    await action.removeNotificationListener(['all'], probeNotificationListener);
    state.probe.listenerRegistered = false;
    state.probe.activeOperation = '';
  } catch (error) {
    state.lastError = `EVENT_PROBE_STOP_FAILED: ${error.message || String(error)}`;
  }
  render();
}

function clearEventProbe() {
  state.probe.notificationsSeen = 0;
  state.probe.lastEvent = '';
  state.probe.lastEventTime = '';
  state.probe.countsByOperation = Object.create(null);
  state.probe.recent = [];
  renderProbe();
}

function autoSyncNotificationListener(eventName) {
  const auto = state.autoSync;
  auto.notificationsSeen += 1;
  auto.lastEvent = eventName;
  auto.lastEventTime = new Date().toLocaleTimeString();
  if (!auto.enabled) {
    render();
    return;
  }

  auto.notificationsAccepted += 1;
  auto.latestNotificationAt = performance.now();
  if (auto.debounceTimer) clearTimeout(auto.debounceTimer);
  auto.debounceTimer = setTimeout(() => {
    auto.debounceTimer = null;
    if (!auto.enabled) return;
    auto.debouncedTriggers += 1;
    requestLatestFrame('auto');
  }, AUTO_SYNC_DEBOUNCE_MS);
  render();
}

async function setAutoSyncEnabled(enabled) {
  const auto = state.autoSync;
  if (auto.transitionPending || enabled === auto.enabled) {
    render();
    return;
  }

  auto.transitionPending = true;
  render();
  try {
    if (enabled) {
      if (!auto.listenerRegistered) {
        await action.addNotificationListener(AUTO_SYNC_EVENTS, autoSyncNotificationListener);
        auto.listenerRegistered = true;
      }
      auto.enabled = true;
      state.lastError = '';
    } else {
      auto.enabled = false;
      if (auto.debounceTimer) clearTimeout(auto.debounceTimer);
      auto.debounceTimer = null;
      if (state.dirty && state.dirtyReason === 'auto') {
        state.dirty = false;
        state.dirtyReason = '';
      }
      if (auto.listenerRegistered) {
        await action.removeNotificationListener(AUTO_SYNC_EVENTS, autoSyncNotificationListener);
        auto.listenerRegistered = false;
      }
    }
  } catch (error) {
    auto.enabled = false;
    state.lastError = `AUTO_SYNC_LISTENER_FAILED: ${error.message || String(error)}`;
  } finally {
    auto.transitionPending = false;
    render();
  }
}

function isSocketOpen() {
  return state.socket && state.socket.readyState === 1;
}

function isReady() {
  return isSocketOpen() && state.handshake && state.rendererConnected;
}

function formatBytes(bytes) {
  return Number.isFinite(bytes) ? `${(bytes / 1048576).toFixed(2)} MiB` : '—';
}

function formatMs(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} ms` : '—';
}

function renderAutoSync() {
  const auto = state.autoSync;
  elements.autoSync.checked = auto.enabled;
  elements.autoSync.disabled = auto.transitionPending;
  elements.autoSyncState.textContent = auto.transitionPending ? 'CHANGING' : (auto.enabled ? 'ON' : 'OFF');
  elements.notificationsSeen.textContent = String(auto.notificationsSeen);
  elements.notificationsAccepted.textContent = String(auto.notificationsAccepted);
  elements.debouncedTriggers.textContent = String(auto.debouncedTriggers);
  elements.framesRequested.textContent = String(auto.framesRequested);
  elements.framesSent.textContent = String(auto.framesSent);
  elements.dirtyReplacements.textContent = String(auto.dirtyReplacements);
  elements.lastAutoEvent.textContent = auto.lastEvent || '—';
  elements.lastAutoEventTime.textContent = auto.lastEventTime || '—';
  elements.notifyCaptureMs.textContent = formatMs(auto.notificationToCaptureMs);
  elements.lastCaptureTime.textContent = auto.lastCaptureTime || '—';
}

function markDirty(reason) {
  if (!state.dirty) {
    state.dirty = true;
    state.dirtyReason = reason;
    state.autoSync.dirtyReplacements += 1;
  } else if (reason === 'manual') {
    state.dirtyReason = 'manual';
  }
}

function resumeDirtyFrameIfReady() {
  if (!state.dirty || !isReady() || state.phase !== 'IDLE') return;
  void runRequestedSend(state.dirtyReason || 'reconnect');
}

function enumLabel(value) {
  const text = String(value);
  const tail = text.includes('.') ? text.slice(text.lastIndexOf('.') + 1) : text;
  return tail.toUpperCase();
}

function renderPointer() {
  const pointer = state.pointer;
  elements.pointerState.textContent = pointer.processing ? 'BUSY' : 'IDLE';
  elements.pointerRequest.textContent = pointer.lastRequestId ? String(pointer.lastRequestId) : '—';
  elements.pointerRequested.textContent = pointer.requested ? `${pointer.requested.x} / ${pointer.requested.y}` : '—';
  elements.pointerApplied.textContent = pointer.applied ? `${pointer.applied.x} / ${pointer.applied.y}` : '—';
  elements.pointerLayer.textContent = pointer.layerName || '—';
  elements.pointerResult.textContent = pointer.result || '—';
  elements.pointerSelection.textContent = pointer.selectionRestored === null ? '—' : (pointer.selectionRestored ? 'YES' : 'NO');
  elements.pointerError.className = `error ${pointer.lastError ? 'active' : ''}`;
  elements.pointerError.textContent = pointer.lastError || 'No pointer error.';
}

function render() {
  const connected = isReady();
  elements.connectionState.className = `state ${connected ? 'connected' : 'disconnected'}`;
  elements.connectionState.textContent = `● ${connected ? 'CONNECTED' : state.connectionState}`;
  elements.connectButton.textContent = connected ? 'RECONNECT' : 'CONNECT';
  elements.sendButton.disabled = !connected;
  elements.phase.textContent = state.phase;
  elements.frameId.textContent = state.lastFrame ? String(state.lastFrame.frameId) : '—';
  elements.captureSize.textContent = state.lastFrame ? `${state.lastFrame.width} × ${state.lastFrame.height}` : '—';
  elements.frameBytes.textContent = state.lastFrame ? formatBytes(state.lastFrame.totalBytes) : '—';
  elements.captureMs.textContent = state.lastFrame ? formatMs(state.lastFrame.captureMs) : '—';
  elements.sendMs.textContent = state.lastFrame ? formatMs(state.lastFrame.sendMs) : '—';
  elements.ackMs.textContent = state.lastFrame ? formatMs(state.lastFrame.ackMs) : '—';
  elements.lastError.className = `error ${state.lastError ? 'active' : ''}`;
  elements.lastError.textContent = state.lastError || 'No error.';
  renderAutoSync();
  renderProbe();
  renderPointer();
}

function refreshDocumentInfo() {
  const doc = app.activeDocument;
  if (!doc) {
    elements.documentName.textContent = 'No active document';
    elements.documentDimensions.textContent = '—';
    elements.documentMode.textContent = '—';
    return;
  }
  elements.documentName.textContent = doc.name;
  elements.documentDimensions.textContent = `${doc.width} × ${doc.height}`;
  elements.documentMode.textContent = `${enumLabel(doc.mode)} / ${enumLabel(doc.bitsPerChannel)}`;
}

function sendJson(message) {
  if (!isSocketOpen()) throw new Error('WebSocket is not open.');
  state.socket.send(JSON.stringify(message));
}

function rejectPendingAck(error) {
  if (!state.pendingAck) return;
  clearTimeout(state.pendingAck.timer);
  const pending = state.pendingAck;
  state.pendingAck = null;
  pending.reject(error);
}

function waitForAck(frameId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (state.pendingAck && state.pendingAck.frameId === frameId) {
        state.pendingAck = null;
        reject(new Error(`FRAME_ACK timeout for frame ${frameId}.`));
      }
    }, config.ackTimeoutMs);
    state.pendingAck = { frameId, resolve, reject, timer, waitingSince: performance.now() };
  });
}

function pointerFailure(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function collectLayers(layers, result = []) {
  for (const layer of layers) {
    result.push(layer);
    if (layer.layers && layer.layers.length) collectLayers(layer.layers, result);
  }
  return result;
}

function pointerLayers(doc) {
  return collectLayers(doc.layers).filter((layer) => layer.name === POINTER_LAYER_NAME);
}

function restoreActiveLayers(doc, layerIds) {
  if (!layerIds.length) return true;
  try {
    const byId = new Map(collectLayers(doc.layers).map((layer) => [layer.id, layer]));
    const layers = layerIds.map((id) => byId.get(id)).filter(Boolean);
    if (!layers.length) return false;
    doc.activeLayers = layers;
    return layers.length === layerIds.length;
  } catch {
    return false;
  }
}

function validatePointerDocument(message, requireCoordinate) {
  const doc = app.activeDocument;
  if (!doc || doc.id !== message.documentId || doc.width !== message.width || doc.height !== message.height) {
    throw pointerFailure(
      'DOCUMENT_MISMATCH',
      `Active document does not match request ${message.documentId} (${message.width} × ${message.height}).`
    );
  }
  if (requireCoordinate && (!Number.isSafeInteger(message.x) || !Number.isSafeInteger(message.y) ||
    message.x < 0 || message.x >= doc.width || message.y < 0 || message.y >= doc.height)) {
    throw pointerFailure('OUT_OF_RANGE', 'Requested pointer pixel is outside the active document.');
  }
  return doc;
}

async function getSinglePointerLayer(doc) {
  const matches = pointerLayers(doc);
  if (matches.some((layer) => layer.kind !== constants.LayerKind.NORMAL)) {
    throw pointerFailure('POINTER_LAYER_TYPE_MISMATCH', `${POINTER_LAYER_NAME} exists but is not a Pixel Layer.`);
  }
  const layer = matches[0] || await doc.createLayer(constants.LayerKind.NORMAL, { name: POINTER_LAYER_NAME });
  for (const duplicate of matches.slice(1)) duplicate.delete();
  layer.name = POINTER_LAYER_NAME;
  layer.visible = true;
  return layer;
}

function createClippedPointerPatch(x, y, documentWidth, documentHeight) {
  const radius = Math.floor(POINTER_DIAMETER_PX / 2);
  const left = Math.max(0, x - radius);
  const top = Math.max(0, y - radius);
  const right = Math.min(documentWidth - 1, x + radius);
  const bottom = Math.min(documentHeight - 1, y + radius);
  const width = right - left + 1;
  const height = bottom - top + 1;
  const bytes = new Uint8Array(width * height * 4);
  for (let patchY = 0; patchY < height; patchY += 1) {
    for (let patchX = 0; patchX < width; patchX += 1) {
      const documentX = left + patchX;
      const documentY = top + patchY;
      if (Math.hypot(documentX - x, documentY - y) > radius) continue;
      const offset = (patchY * width + patchX) * 4;
      bytes[offset] = 255;
      bytes[offset + 1] = 255;
      bytes[offset + 2] = 255;
      bytes[offset + 3] = 255;
    }
  }
  return { bytes, width, height, left, top };
}

async function applyPointerSet(message) {
  return core.executeAsModal(async () => {
    const doc = validatePointerDocument(message, true);
    const previousLayerIds = Array.from(doc.activeLayers, (layer) => layer.id);
    let selectionRestored = false;
    let result;
    try {
      const layer = await getSinglePointerLayer(doc);
      const patch = createClippedPointerPatch(message.x, message.y, doc.width, doc.height);
      const imageData = await imaging.createImageDataFromBuffer(patch.bytes, {
        width: patch.width,
        height: patch.height,
        components: 4,
        chunky: true,
        colorProfile: DISPLAY_COLOR_PROFILE,
        colorSpace: 'RGB'
      });
      try {
        await imaging.putPixels({
          documentID: doc.id,
          layerID: layer.id,
          imageData,
          replace: true,
          targetBounds: { left: patch.left, top: patch.top },
          commandName: 'LUUX Pointer Set'
        });
      } finally {
        imageData.dispose();
      }
      result = {
        documentId: doc.id,
        requestedX: message.x,
        requestedY: message.y,
        appliedX: message.x,
        appliedY: message.y,
        layerName: POINTER_LAYER_NAME,
        layerId: layer.id,
        patchWidth: patch.width,
        patchHeight: patch.height,
        patchLeft: patch.left,
        patchTop: patch.top,
        diameter: POINTER_DIAMETER_PX
      };
    } finally {
      selectionRestored = restoreActiveLayers(doc, previousLayerIds);
    }
    return { ...result, selectionRestored };
  }, { commandName: 'LUUX Pointer Set' });
}

async function applyPointerClear(message) {
  return core.executeAsModal(async () => {
    const doc = validatePointerDocument(message, false);
    const previousLayerIds = Array.from(doc.activeLayers, (layer) => layer.id);
    const matches = pointerLayers(doc);
    let selectionRestored = false;
    try {
      for (const layer of matches) layer.delete();
    } finally {
      selectionRestored = restoreActiveLayers(doc, previousLayerIds);
    }
    return {
      documentId: doc.id,
      layerName: POINTER_LAYER_NAME,
      clearedLayers: matches.length,
      selectionRestored
    };
  }, { commandName: 'LUUX Pointer Clear' });
}

function sendPointerError(message, error) {
  const code = error.code || 'POINTER_WRITE_FAILED';
  const detail = error.message || String(error);
  state.pointer.result = code;
  state.pointer.lastError = `${code}: ${detail}`;
  if (isSocketOpen()) {
    sendJson({
      type: 'POINTER_ERROR',
      requestId: message.requestId,
      documentId: message.documentId,
      code,
      message: detail
    });
  }
}

async function processPointerCommand(message) {
  if (state.pointer.processing) {
    sendPointerError(message, pointerFailure('POINTER_BUSY', 'A pointer mutation is already in progress.'));
    render();
    return;
  }
  state.pointer.processing = true;
  state.pointer.lastRequestId = message.requestId;
  state.pointer.requested = message.type === 'POINTER_SET' ? { x: message.x, y: message.y } : null;
  state.pointer.applied = null;
  state.pointer.layerName = POINTER_LAYER_NAME;
  state.pointer.result = 'PROCESSING';
  state.pointer.selectionRestored = null;
  state.pointer.lastError = '';
  render();
  try {
    const result = message.type === 'POINTER_SET'
      ? await applyPointerSet(message)
      : await applyPointerClear(message);
    state.pointer.applied = message.type === 'POINTER_SET' ? { x: result.appliedX, y: result.appliedY } : null;
    state.pointer.result = message.type === 'POINTER_SET' ? 'POINTER_ACK' : 'POINTER_CLEAR_ACK';
    state.pointer.selectionRestored = result.selectionRestored;
    sendJson({
      type: state.pointer.result,
      requestId: message.requestId,
      ...result
    });
  } catch (error) {
    sendPointerError(message, error);
  } finally {
    state.pointer.processing = false;
    refreshDocumentInfo();
    render();
  }
}

function handleJson(message) {
  switch (message.type) {
    case 'HELLO_ACK':
      state.handshake = true;
      state.connectionState = state.rendererConnected ? 'CONNECTED' : 'WAITING FOR RENDERER';
      break;
    case 'LINK_STATUS':
      state.rendererConnected = Boolean(message.rendererConnected);
      state.connectionState = state.rendererConnected && state.handshake ? 'CONNECTED' : 'WAITING FOR RENDERER';
      break;
    case 'FRAME_ACK':
      if (state.pendingAck && message.frameId === state.pendingAck.frameId) {
        clearTimeout(state.pendingAck.timer);
        const pending = state.pendingAck;
        state.pendingAck = null;
        pending.resolve({ ...message, ackMs: performance.now() - pending.waitingSince });
      }
      break;
    case 'POINTER_SET':
    case 'POINTER_CLEAR':
      void processPointerCommand(message);
      return;
    case 'ERROR': {
      const error = new Error(`${message.code || 'ERROR'}: ${message.message || 'Unknown live-link error.'}`);
      state.lastError = error.message;
      rejectPendingAck(error);
      break;
    }
    default:
      state.lastError = `UNKNOWN_MESSAGE: ${message.type || '<missing>'}`;
  }
  render();
  resumeDirtyFrameIfReady();
}

function scheduleReconnect() {
  if (state.reconnectTimer) return;
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    connect(false);
  }, config.reconnectDelayMs);
}

function connect(force) {
  if (state.socket && [0, 1].includes(state.socket.readyState)) {
    if (!force) return;
    state.socket.close();
  }
  state.handshake = false;
  state.rendererConnected = false;
  state.connectionState = 'CONNECTING';
  state.lastError = '';
  render();

  let socket;
  try {
    socket = new WebSocket(config.endpoint);
  } catch (error) {
    state.socket = null;
    state.connectionState = 'DISCONNECTED';
    state.lastError = `WEBSOCKET_CREATE_FAILED: ${error && (error.stack || error.message) ? (error.stack || error.message) : String(error)}; endpoint=${config.endpoint}`;
    render();
    scheduleReconnect();
    return;
  }
  socket.binaryType = 'arraybuffer';
  state.socket = socket;
  socket.onopen = () => {
    if (state.socket !== socket) return;
    state.connectionState = 'HANDSHAKING';
    state.lastError = '';
    sendJson({
      type: 'HELLO',
      protocol: config.protocol,
      protocolVersion: config.protocolVersion,
      role: 'photoshop'
    });
    render();
  };
  socket.onmessage = (event) => {
    if (state.socket !== socket) return;
    if (typeof event.data !== 'string') {
      state.lastError = 'UNEXPECTED_BINARY: Photoshop client does not receive frame data.';
      render();
      return;
    }
    try { handleJson(JSON.parse(event.data)); }
    catch (error) {
      state.lastError = `INVALID_JSON: ${error.message}`;
      render();
    }
  };
  socket.onclose = (event) => {
    if (state.socket !== socket) return;
    state.handshake = false;
    state.rendererConnected = false;
    state.connectionState = 'DISCONNECTED';
    if (state.phase !== 'IDLE') markDirty(state.currentRequestReason || 'reconnect');
    const closeCode = event && Number.isFinite(event.code) ? event.code : 'unknown';
    const closeReason = event && event.reason ? ` reason=${event.reason}` : '';
    state.lastError = `CONNECTION_CLOSED: code=${closeCode}${closeReason}; endpoint=${config.endpoint}`;
    rejectPendingAck(new Error('Connection closed while waiting for FRAME_ACK.'));
    render();
    scheduleReconnect();
  };
  socket.onerror = (event) => {
    if (state.socket !== socket) return;
    state.connectionState = 'DISCONNECTED';
    const detail = event && (event.message || event.data || event.type) ? (event.message || event.data || event.type) : 'unknown WebSocket error';
    state.lastError = `CONNECTION_ERROR: ${detail}; endpoint=${config.endpoint}; retrying in ${config.reconnectDelayMs} ms.`;
    render();
  };
  render();
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForBufferedAmount(limit) {
  while (isSocketOpen() && state.socket.bufferedAmount > limit) await delay(12);
  if (!isSocketOpen()) throw new Error('Connection closed during binary transfer.');
}

function validateDocument(doc) {
  if (doc.bitsPerChannel !== constants.BitsPerChannelType.EIGHT) {
    throw new Error('UNSUPPORTED SOURCE DEPTH FOR BLOCK 1 BASELINE');
  }
  if (doc.mode !== constants.DocumentMode.RGB) {
    throw new Error(`UNSUPPORTED SOURCE MODE FOR BLOCK 1 BASELINE: ${enumLabel(doc.mode)}`);
  }
  if (!Number.isSafeInteger(doc.width) || !Number.isSafeInteger(doc.height) || doc.width <= 0 || doc.height <= 0) {
    throw new Error('Document dimensions are not positive integer pixels.');
  }
}

async function captureComposite() {
  const doc = app.activeDocument;
  if (!doc) throw new Error('No active Photoshop document.');
  validateDocument(doc);
  refreshDocumentInfo();

  const captureStartedAtEpochMs = Date.now();
  const captureStartedAt = performance.now();
  return core.executeAsModal(async () => {
    const result = await imaging.getPixels({
      documentID: doc.id,
      colorSpace: 'RGB',
      colorProfile: DISPLAY_COLOR_PROFILE,
      componentSize: 8
    });
    const photoshopImageData = result.imageData;
    try {
      const bytes = await photoshopImageData.getData({ chunky: true });
      const width = photoshopImageData.width;
      const height = photoshopImageData.height;
      const components = photoshopImageData.components;
      const componentSize = photoshopImageData.componentSize;
      const expectedBytes = width * height * components * (componentSize / 8);
      if (doc.width !== width || doc.height !== height) throw new Error(`Capture dimensions ${width} × ${height} do not match document ${doc.width} × ${doc.height}.`);
      if (componentSize !== 8 || !(bytes instanceof Uint8Array)) throw new Error('UNSUPPORTED SOURCE DEPTH FOR BLOCK 1 BASELINE');
      if (![3, 4].includes(components) || !['RGB', 'RGBA'].includes(photoshopImageData.pixelFormat)) throw new Error(`Unsupported pixel format: ${photoshopImageData.pixelFormat} / ${components} components.`);
      if (bytes.byteLength !== expectedBytes) throw new Error(`Pixel byte count ${bytes.byteLength} does not match ${expectedBytes}.`);
      return {
        bytes,
        metadata: {
          type: 'FRAME_BEGIN',
          frameId: state.nextFrameId++,
          documentId: doc.id,
          documentName: doc.name,
          documentWidth: doc.width,
          documentHeight: doc.height,
          documentMode: enumLabel(doc.mode),
          documentDepth: 8,
          documentColorProfile: doc.colorProfileName,
          requestedColorProfile: DISPLAY_COLOR_PROFILE,
          width,
          height,
          components,
          componentSize,
          pixelFormat: photoshopImageData.pixelFormat,
          colorSpace: photoshopImageData.colorSpace,
          colorProfile: photoshopImageData.colorProfile,
          hasAlpha: photoshopImageData.hasAlpha,
          isChunky: true,
          level: result.level,
          totalBytes: bytes.byteLength,
          chunkSize: config.chunkSizeBytes,
          chunkCount: Math.ceil(bytes.byteLength / config.chunkSizeBytes),
          captureMs: performance.now() - captureStartedAt,
          captureStartedAtEpochMs,
          captureEndedAtEpochMs: Date.now()
        }
      };
    } finally {
      photoshopImageData.dispose();
    }
  }, { commandName: 'LUUX Live Link — Capture Composite' });
}

async function sendCapture(capture) {
  const { bytes, metadata } = capture;
  const sendStartedAt = performance.now();
  sendJson(metadata);
  for (let offset = 0; offset < bytes.byteLength; offset += config.chunkSizeBytes) {
    await waitForBufferedAmount(config.backpressureHighWaterMarkBytes);
    state.socket.send(bytes.subarray(offset, Math.min(offset + config.chunkSizeBytes, bytes.byteLength)));
  }
  await waitForBufferedAmount(config.chunkSizeBytes);
  sendJson({ type: 'FRAME_END', frameId: metadata.frameId });
  const sendMs = performance.now() - sendStartedAt;
  state.phase = 'WAITING_ACK';
  state.lastFrame = { ...metadata, sendMs, ackMs: null };
  render();
  const ack = await waitForAck(metadata.frameId);
  const dimensionMatch =
    ack.receivedWidth === metadata.width &&
    ack.receivedHeight === metadata.height &&
    ack.textureWidth === metadata.width &&
    ack.textureHeight === metadata.height;
  if (!dimensionMatch || ack.receivedBytes !== metadata.totalBytes) throw new Error('FRAME_ACK dimensions or byte count do not match the capture.');
  state.lastFrame = { ...state.lastFrame, ackMs: ack.ackMs, ack };
}

function requestLatestFrame(reason) {
  state.autoSync.framesRequested += 1;
  if (!isReady()) {
    markDirty(reason);
    state.lastError = 'Electron renderer is not connected. Latest frame is pending reconnect.';
    render();
    return;
  }
  if (state.phase !== 'IDLE') {
    markDirty(reason);
    render();
    return;
  }
  void runRequestedSend(reason);
}

async function runRequestedSend(reason = 'manual') {
  if (state.phase !== 'IDLE') {
    markDirty(reason);
    render();
    return;
  }
  if (!isReady()) {
    markDirty(reason);
    state.lastError = 'Electron renderer is not connected. Latest frame is pending reconnect.';
    render();
    return;
  }

  state.dirty = false;
  state.dirtyReason = '';
  state.currentRequestReason = reason;
  state.lastError = '';
  try {
    state.phase = 'CAPTURING';
    if (reason === 'auto' && Number.isFinite(state.autoSync.latestNotificationAt)) {
      state.autoSync.notificationToCaptureMs = performance.now() - state.autoSync.latestNotificationAt;
    }
    render();
    const capture = await captureComposite();
    state.lastFrame = { ...capture.metadata, sendMs: null, ackMs: null };
    state.phase = 'SENDING';
    render();
    await sendCapture(capture);
    state.autoSync.framesSent += 1;
    state.autoSync.lastCaptureTime = new Date().toLocaleTimeString();
  } catch (error) {
    state.lastError = error.message || String(error);
    if (isSocketOpen() && state.lastFrame?.frameId) {
      try {
        sendJson({ type: 'ERROR', code: 'SENDER_ABORT', message: state.lastError, frameId: state.lastFrame.frameId });
      } catch {
        // Connection lifecycle will reset the in-flight frame if the socket is gone.
      }
    }
  } finally {
    state.phase = 'IDLE';
    state.currentRequestReason = '';
    refreshDocumentInfo();
    render();
    resumeDirtyFrameIfReady();
  }
}

elements.connectButton.onclick = () => connect(true);
elements.sendButton.onclick = () => requestLatestFrame('manual');
elements.autoSync.onchange = () => { void setAutoSyncEnabled(elements.autoSync.checked); };
elements.probeStart.onclick = () => { void startEventProbe(); };
elements.probeStop.onclick = () => { void stopEventProbe(); };
elements.probeArm.onclick = () => {
  state.probe.activeOperation = elements.probeOperation.value;
  renderProbe();
};
elements.probeClear.onclick = clearEventProbe;

refreshDocumentInfo();
render();
connect(false);
