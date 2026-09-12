'use strict';

const { action, app, constants, core, imaging } = require('photoshop');
const { createBakeTargetRegistry } = require('./bake-target-registry.js');
const { compactAuthoringOrderMap, createOwnedLayerRegistry, normalizeCompositeMetadata } = require('./owned-layer-registry.js');
const config = window.LUUX_LIVE_LINK_CONFIG;
const DISPLAY_COLOR_PROFILE = 'sRGB IEC61966-2.1';
const AUTO_SYNC_EVENTS = ['historyStateChanged'];
const AUTO_SYNC_DEBOUNCE_MS = 350;
const POINTER_LAYER_NAME = '__LUUX_POINTER__';
const POINTER_DIAMETER_PX = 25;
const BAKE_LAYER_PREFIX = '__LUUX_ANAMORPHIC__';
const BAKE_TARGET_SESSION_ID = `uxp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const PHOTOSHOP_BLEND_MODES = Object.freeze({
  NORMAL: constants.BlendMode.NORMAL,
  MULTIPLY: constants.BlendMode.MULTIPLY,
  SCREEN: constants.BlendMode.SCREEN,
  LINEAR_DODGE: constants.BlendMode.LINEARDODGE
});

const elements = {
  documentName: document.querySelector('#document-name'),
  documentDimensions: document.querySelector('#document-dimensions'),
  documentMode: document.querySelector('#document-mode'),
  bakeTargetCount: document.querySelector('#bake-target-count'),
  bakeTargetSession: document.querySelector('#bake-target-session'),
  bakeTargetLabelInput: document.querySelector('#bake-target-label-input'),
  bakeTargetFamilySelect: document.querySelector('#bake-target-family-select'),
  bakeTargetOutputSelect: document.querySelector('#bake-target-output-select'),
  addBakeTarget: document.querySelector('#add-bake-target'),
  bakeTargetList: document.querySelector('#bake-target-list'),
  bakeState: document.querySelector('#bake-state'),
  bakeJob: document.querySelector('#bake-job'),
  bakeOutput: document.querySelector('#bake-output'),
  bakeReceived: document.querySelector('#bake-received'),
  bakeLayer: document.querySelector('#bake-layer'),
  bakeSuppressed: document.querySelector('#bake-suppressed'),
  bakeError: document.querySelector('#bake-error'),
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
  snapshot: {
    processing: false,
    currentJobId: null,
    pendingAck: null,
    lastResult: null
  },
  bake: {
    registry: createBakeTargetRegistry({ sessionId: BAKE_TARGET_SESSION_ID }),
    ownedLayers: createOwnedLayerRegistry({ sessionId: BAKE_TARGET_SESSION_ID }),
    lastPublishedRegistry: '',
    current: null,
    processing: false,
    phase: 'IDLE',
    lastApplied: null,
    lastError: '',
    suppressAutoSyncUntil: 0,
    suppressedNotifications: 0
  },
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
  if (state.bake.processing || performance.now() < state.bake.suppressAutoSyncUntil) {
    state.bake.suppressedNotifications += 1;
    render();
    return;
  }
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
  if (!state.dirty || !isReady() || state.phase !== 'IDLE' || state.snapshot.processing) return;
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

function findOpenDocument(documentId) {
  return Array.from(app.documents || []).find((doc) => doc.id === documentId) || null;
}

function documentSnapshot(doc) {
  return {
    documentId: doc.id,
    documentName: doc.name,
    width: doc.width,
    height: doc.height,
    documentMode: doc.mode === constants.DocumentMode.RGB ? 'RGB' : enumLabel(doc.mode),
    documentDepth: doc.bitsPerChannel === constants.BitsPerChannelType.EIGHT ? 8 : enumLabel(doc.bitsPerChannel)
  };
}

function findOpenDocumentSnapshot(documentId) {
  const doc = findOpenDocument(documentId);
  return doc ? documentSnapshot(doc) : null;
}

function currentBakeTargetRegistrySnapshot() {
  return {
    type: 'BAKE_TARGET_REGISTRY',
    ...state.bake.registry.snapshot(findOpenDocumentSnapshot)
  };
}

function publishBakeTargetRegistry(force = false) {
  const message = currentBakeTargetRegistrySnapshot();
  const digest = JSON.stringify(message);
  if (isSocketOpen() && state.handshake && (force || digest !== state.bake.lastPublishedRegistry)) {
    sendJson(message);
    state.bake.lastPublishedRegistry = digest;
  }
  return message;
}

function appendBakeTargetDetail(parent, label, value) {
  const row = document.createElement('div');
  row.className = 'diagnostic-row';
  const labelElement = document.createElement('span');
  labelElement.className = 'label';
  labelElement.textContent = label;
  const valueElement = document.createElement('span');
  valueElement.className = 'value';
  valueElement.textContent = value;
  row.appendChild(labelElement);
  row.appendChild(valueElement);
  parent.appendChild(row);
}

function renderBakeTargets() {
  const snapshot = currentBakeTargetRegistrySnapshot();
  elements.bakeTargetCount.textContent = String(snapshot.targets.length);
  elements.bakeTargetSession.textContent = snapshot.sessionId;
  elements.addBakeTarget.disabled = state.bake.processing || !app.activeDocument;
  while (elements.bakeTargetList.firstChild) elements.bakeTargetList.removeChild(elements.bakeTargetList.firstChild);
  if (!snapshot.targets.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'No registered Bake Targets. Active Document is used only after explicit registration.';
    elements.bakeTargetList.appendChild(empty);
    return;
  }
  for (const target of snapshot.targets) {
    const card = document.createElement('div');
    card.className = `bake-target-card status-${target.status.toLowerCase()}`;
    const bindings = snapshot.bindings.filter((binding) => binding.targetId === target.targetId);
    appendBakeTargetDetail(card, 'Target ID', target.targetId);
    appendBakeTargetDetail(card, 'Binding', bindings.length
      ? bindings.map((binding) => `${binding.familyId} / ${binding.outputKind}`).join(', ')
      : 'UNBOUND');
    appendBakeTargetDetail(card, 'Document', target.documentName);
    appendBakeTargetDetail(card, 'Identity', String(target.documentId));
    appendBakeTargetDetail(card, 'Dimensions', `${target.width} × ${target.height}`);
    appendBakeTargetDetail(card, 'Mode / Depth', `${target.documentMode} / ${target.documentDepth}`);
    appendBakeTargetDetail(card, 'Status', target.status);

    const renameInput = document.createElement('input');
    renameInput.type = 'text';
    renameInput.value = target.label;
    renameInput.className = 'bake-target-rename-input';
    renameInput.setAttribute('aria-label', `Rename ${target.targetId}`);
    card.appendChild(renameInput);

    const actions = document.createElement('div');
    actions.className = 'bake-target-actions';
    const renameButton = document.createElement('button');
    renameButton.type = 'button';
    renameButton.textContent = 'RENAME';
    renameButton.disabled = state.bake.processing;
    renameButton.onclick = () => {
      if (state.bake.processing) return;
      try {
        state.bake.registry.renameTarget(target.targetId, renameInput.value);
        state.bake.lastError = '';
        publishBakeTargetRegistry(true);
      } catch (error) {
        state.bake.lastError = error.message || String(error);
      }
      render();
    };
    const setActiveButton = document.createElement('button');
    setActiveButton.type = 'button';
    setActiveButton.textContent = 'SET ACTIVE DOCUMENT';
    setActiveButton.disabled = state.bake.processing || !app.activeDocument;
    setActiveButton.onclick = () => {
      if (state.bake.processing) return;
      const doc = app.activeDocument;
      if (!doc) {
        state.bake.lastError = 'TARGET_NOT_SET: No active Photoshop document.';
        render();
        return;
      }
      state.bake.registry.replaceDocument(target.targetId, documentSnapshot(doc));
      state.bake.lastError = '';
      publishBakeTargetRegistry(true);
      render();
    };
    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.textContent = 'CLEAR';
    clearButton.disabled = state.bake.processing;
    clearButton.onclick = () => {
      if (state.bake.processing) return;
      state.bake.registry.clearTarget(target.targetId);
      state.bake.lastError = '';
      publishBakeTargetRegistry(true);
      render();
    };
    actions.appendChild(renameButton);
    actions.appendChild(setActiveButton);
    actions.appendChild(clearButton);
    card.appendChild(actions);
    elements.bakeTargetList.appendChild(card);
  }
}

function renderBake() {
  renderBakeTargets();
  elements.bakeState.textContent = state.bake.phase;
  elements.bakeJob.textContent = state.bake.current?.metadata?.jobId ? String(state.bake.current.metadata.jobId) : (state.bake.lastApplied?.jobId ? String(state.bake.lastApplied.jobId) : '—');
  const metadata = state.bake.current?.metadata || state.bake.lastApplied;
  elements.bakeOutput.textContent = metadata ? `${metadata.familyId} / ${metadata.outputKind}` : '—';
  elements.bakeReceived.textContent = state.bake.current ? `${formatBytes(state.bake.current.receivedBytes)} / ${formatBytes(state.bake.current.metadata.totalBytes)}` : '—';
  elements.bakeLayer.textContent = state.bake.lastApplied?.layerName || '—';
  elements.bakeSuppressed.textContent = String(state.bake.suppressedNotifications);
  elements.bakeError.className = `error ${state.bake.lastError ? 'active' : ''}`;
  elements.bakeError.textContent = state.bake.lastError || 'No bake error.';
}

function render() {
  const connected = isReady();
  elements.connectionState.className = `state ${connected ? 'connected' : 'disconnected'}`;
  elements.connectionState.textContent = `● ${connected ? 'CONNECTED' : state.connectionState}`;
  elements.connectButton.textContent = connected ? 'RECONNECT' : 'CONNECT';
  elements.sendButton.disabled = !connected || state.snapshot.processing;
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
  renderBake();
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

function rejectPendingSnapshotAck(error) {
  if (!state.snapshot.pendingAck) return;
  clearTimeout(state.snapshot.pendingAck.timer);
  const pending = state.snapshot.pendingAck;
  state.snapshot.pendingAck = null;
  pending.reject(error);
}

function waitForSnapshotAck(snapshotJobId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (state.snapshot.pendingAck?.snapshotJobId === snapshotJobId) {
        state.snapshot.pendingAck = null;
        reject(new Error(`SNAPSHOT_COMPLETE timeout for ${snapshotJobId}.`));
      }
    }, config.ackTimeoutMs);
    state.snapshot.pendingAck = { snapshotJobId, resolve, reject, timer };
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

function bakeFailure(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validateBakeBegin(message) {
  for (const field of ['jobId', 'targetDocumentId', 'width', 'height', 'components', 'componentSize', 'totalBytes', 'chunkSize', 'chunkCount']) {
    if (!Number.isSafeInteger(message[field]) || message[field] <= 0) throw bakeFailure('INVALID_BAKE_METADATA', `${field} must be a positive safe integer.`);
  }
  if (!['CANONICAL', 'DIRECT'].includes(message.outputKind) || typeof message.familyId !== 'string' || !message.familyId || typeof message.outputId !== 'string' || !message.outputId) {
    throw bakeFailure('INVALID_BAKE_METADATA', 'familyId, outputKind, and outputId are required.');
  }
  if (typeof message.targetId !== 'string' || !message.targetId || typeof message.targetSessionId !== 'string' || !message.targetSessionId) {
    throw bakeFailure('INVALID_BAKE_METADATA', 'targetId and targetSessionId are required.');
  }
  if (typeof message.authoringLayerId !== 'string' || !message.authoringLayerId || !Array.isArray(message.authoringStack)) {
    throw bakeFailure('INVALID_LAYER_METADATA', 'authoringLayerId and authoringStack are required.');
  }
  const layerIds = new Set();
  for (const layer of message.authoringStack) {
    if (typeof layer.authoringLayerId !== 'string' || !layer.authoringLayerId || layerIds.has(layer.authoringLayerId)) {
      throw bakeFailure('INVALID_LAYER_METADATA', 'authoringStack contains an invalid or duplicate layerId.');
    }
    if (!Number.isSafeInteger(layer.metadataRevision) || layer.metadataRevision <= 0) {
      throw bakeFailure('INVALID_LAYER_METADATA', 'authoringStack contains an invalid metadataRevision.');
    }
    layerIds.add(layer.authoringLayerId);
    try { normalizeCompositeMetadata(layer); } catch (error) { throw bakeFailure('INVALID_LAYER_METADATA', error.message); }
  }
  if (!layerIds.has(message.authoringLayerId)) throw bakeFailure('INVALID_LAYER_METADATA', 'Selected authoringLayerId is absent from authoringStack.');
  const selected = message.authoringStack.find((layer) => layer.authoringLayerId === message.authoringLayerId);
  if (message.documentId !== message.targetDocumentId || message.metadataRevision !== selected.metadataRevision || message.opacity !== selected.opacity || message.blendMode !== selected.blendMode || message.visible !== selected.visible || message.order !== selected.order) {
    throw bakeFailure('INVALID_LAYER_METADATA', 'Selected authoring metadata does not match the target document or authoringStack entry.');
  }
  if (message.components !== 4 || message.componentSize !== 8 || message.pixelFormat !== 'RGBA' || message.alpha !== 'STRAIGHT' || message.orientation !== 'TOP_LEFT') {
    throw bakeFailure('INVALID_BAKE_FORMAT', 'Block 7 requires top-left straight RGBA8.');
  }
  const expectedBytes = message.width * message.height * 4;
  if (!Number.isSafeInteger(expectedBytes) || message.totalBytes !== expectedBytes || message.totalBytes > config.maxFrameBytes) throw bakeFailure('INVALID_BAKE_BYTES', 'Bake byte count is invalid or exceeds the configured maximum.');
  if (message.chunkSize > config.chunkSizeBytes || message.chunkCount !== Math.ceil(message.totalBytes / message.chunkSize)) throw bakeFailure('INVALID_BAKE_CHUNKS', 'Bake chunk contract is invalid.');
  return state.bake.registry.validateJobTarget(message, findOpenDocumentSnapshot);
}

function findLayerById(doc, layerId) {
  return collectLayers(doc.layers).find((layer) => layer.id === layerId) || null;
}

function normalizedPhotoshopBlendMode(value) {
  for (const [name, photoshopValue] of Object.entries(PHOTOSHOP_BLEND_MODES)) if (value === photoshopValue) return name;
  const label = enumLabel(value);
  return label === 'LINEARDODGE' ? 'LINEAR_DODGE' : label;
}

function readPhotoshopComposite(layer, order = null) {
  return {
    opacity: Number(layer.opacity) / 100,
    blendMode: normalizedPhotoshopBlendMode(layer.blendMode),
    visible: Boolean(layer.visible),
    order
  };
}

function assertPhotoshopComposite(actual, requested, { includeOrder = false, expectedPhotoshopOrder = requested.order } = {}) {
  const opacityTolerance = (0.5 / 255) + 0.000001;
  if (!Number.isFinite(actual.opacity) || Math.abs(actual.opacity - requested.opacity) > opacityTolerance) {
    throw bakeFailure('PHOTOSHOP_OPACITY_APPLY_MISMATCH', `opacity requested ${requested.opacity} but Photoshop reports ${actual.opacity}.`);
  }
  if (actual.blendMode !== requested.blendMode) throw bakeFailure('PHOTOSHOP_BLEND_MODE_APPLY_MISMATCH', `blendMode requested ${requested.blendMode} but Photoshop reports ${actual.blendMode}.`);
  if (actual.visible !== requested.visible) throw bakeFailure('PHOTOSHOP_VISIBILITY_APPLY_MISMATCH', `visible requested ${requested.visible} but Photoshop reports ${actual.visible}.`);
  if (includeOrder && actual.order !== expectedPhotoshopOrder) {
    throw bakeFailure('PHOTOSHOP_ORDER_APPLY_MISMATCH', `Photoshop subset order requested ${expectedPhotoshopOrder} for authoring order ${requested.order}, but Photoshop reports ${actual.order}.`);
  }
}

function applyCompositeMetadata(layer, metadata, traceContext) {
  const normalized = normalizeCompositeMetadata(metadata);
  const photoshopBlendMode = PHOTOSHOP_BLEND_MODES[normalized.blendMode];
  if (!photoshopBlendMode) throw bakeFailure('UNSUPPORTED_BLEND_MODE', `Photoshop BlendMode mapping is unavailable for ${normalized.blendMode}.`);
  const before = readPhotoshopComposite(layer);
  layer.opacity = normalized.opacity * 100;
  layer.blendMode = photoshopBlendMode;
  layer.visible = normalized.visible;
  const after = readPhotoshopComposite(layer);
  console.info('[LUUX][Block8C][UXPMetadataApply]', JSON.stringify({
    ...traceContext,
    authoringLayerId: metadata.authoringLayerId,
    resolvedPhotoshopLayerId: layer.id,
    metadataRevision: metadata.metadataRevision,
    opacityBefore: before.opacity,
    requestedOpacity: normalized.opacity,
    opacityAfter: after.opacity,
    blendBefore: before.blendMode,
    requestedBlend: normalized.blendMode,
    blendAfter: after.blendMode,
    visibleBefore: before.visible,
    requestedVisible: normalized.visible,
    visibleAfter: after.visible,
    requestedOrder: normalized.order
  }));
  assertPhotoshopComposite(after, normalized);
  return { requested: normalized, before, after };
}

async function ensureOwnedBindingGroup(target, metadata) {
  const ownedLayers = state.bake.ownedLayers;
  const knownGroupId = ownedLayers.getGroup(metadata.targetId, metadata.familyId, metadata.outputKind);
  let group = knownGroupId ? findLayerById(target, knownGroupId) : null;
  if (!group) {
    group = await target.createLayerGroup({ name: `${BAKE_LAYER_PREFIX} ${metadata.familyId} ${metadata.outputKind}` });
    ownedLayers.registerGroup(metadata.targetId, metadata.familyId, metadata.outputKind, group.id);
    return { group, created: true };
  }
  return { group, created: false };
}

async function syncOwnedBindingMetadata(target, metadata, group) {
  const stackById = new Map(metadata.authoringStack.map((layer) => [layer.authoringLayerId, layer]));
  const resolved = state.bake.ownedLayers.listBinding(metadata.targetId, metadata.familyId, metadata.outputKind)
    .map((record) => ({ record, layer: findLayerById(target, record.photoshopLayerId), composite: stackById.get(record.authoringLayerId) }))
    .filter((entry) => entry.layer && entry.composite)
    .sort((a, b) => a.composite.order - b.composite.order);
  for (const entry of resolved) {
    applyCompositeMetadata(entry.layer, entry.composite, {
      jobId: metadata.jobId,
      targetSessionId: metadata.targetSessionId,
      targetId: metadata.targetId,
      documentId: target.id,
      familyId: metadata.familyId,
      outputKind: metadata.outputKind
    });
    state.bake.ownedLayers.register({ ...entry.record, composite: entry.composite });
    if (entry.layer.parent?.id !== group.id) await entry.layer.move(group, constants.ElementPlacement.PLACEINSIDE);
  }
  for (let index = resolved.length - 2; index >= 0; index -= 1) {
    await resolved[index].layer.move(resolved[index + 1].layer, constants.ElementPlacement.PLACEBEFORE);
  }
  const ownedPhotoshopLayerIds = new Set(resolved.map((entry) => entry.record.photoshopLayerId));
  const physicalOwnedLayers = Array.from(group.layers || []).filter((layer) => ownedPhotoshopLayerIds.has(layer.id));
  const physicalOrderById = new Map(physicalOwnedLayers.map((layer, index) => [layer.id, index]));
  const photoshopOrderByAuthoringOrder = compactAuthoringOrderMap(resolved.map((entry) => entry.composite.order));
  const appliedLayers = resolved.map((entry) => {
    const layer = findLayerById(target, entry.record.photoshopLayerId);
    const actual = readPhotoshopComposite(layer, physicalOrderById.get(layer.id));
    const expectedPhotoshopOrder = photoshopOrderByAuthoringOrder.get(entry.composite.order);
    assertPhotoshopComposite(actual, entry.composite, { includeOrder: true, expectedPhotoshopOrder });
    return {
      authoringLayerId: entry.record.authoringLayerId,
      photoshopLayerId: layer.id,
      metadataRevision: entry.composite.metadataRevision,
      opacity: actual.opacity,
      blendMode: actual.blendMode,
      visible: actual.visible,
      order: entry.composite.order,
      photoshopOrder: actual.order
    };
  });
  console.info('[LUUX][Block8C][UXPMetadataVerified]', JSON.stringify({
    jobId: metadata.jobId, targetSessionId: metadata.targetSessionId, targetId: metadata.targetId,
    documentId: target.id, familyId: metadata.familyId, outputKind: metadata.outputKind, appliedLayers
  }));
  return appliedLayers;
}

function sendBakeError(message, error) {
  const code = error.code || 'APPLY_ERROR';
  const detail = error.message || String(error);
  state.bake.phase = code.startsWith('TARGET_') ? 'TARGET_ERROR' : (code.includes('APPLY') ? 'APPLY_ERROR' : 'VALIDATION_ERROR');
  state.bake.lastError = `${code}: ${detail}`;
  if (isSocketOpen()) sendJson({
    type: 'BAKE_ERROR', jobId: message?.jobId ?? null, code, message: detail,
    authoringLayerId: message?.authoringLayerId ?? null,
    metadataRevision: message?.metadataRevision ?? null
  });
  state.bake.current = null;
  state.bake.processing = false;
  publishBakeTargetRegistry();
  render();
}

function handleBakeBegin(message) {
  if (state.bake.current || state.bake.processing) {
    if (isSocketOpen()) sendJson({ type: 'BAKE_ERROR', jobId: message.jobId ?? null, code: 'BAKE_BUSY', message: 'A full-image Photoshop bake is already in progress.' });
    return;
  }
  try {
    validateBakeBegin(message);
    console.info('[LUUX][Block8C][UXPReceived]', JSON.stringify({
      jobId: message.jobId, targetSessionId: message.targetSessionId, targetId: message.targetId,
      documentId: message.documentId, familyId: message.familyId, outputKind: message.outputKind,
      authoringLayerId: message.authoringLayerId, metadataRevision: message.metadataRevision,
      opacity: message.opacity, blendMode: message.blendMode, visible: message.visible, order: message.order
    }));
    state.bake.current = {
      metadata: message,
      bytes: new Uint8Array(message.totalBytes),
      receivedBytes: 0,
      receivedChunks: 0,
      pendingChunk: null
    };
    state.bake.phase = 'TRANSFERRING';
    state.bake.lastError = '';
  } catch (error) {
    sendBakeError(message, error);
  }
  render();
}

function handleBakeChunkMarker(message) {
  const frame = state.bake.current;
  if (!frame || message.jobId !== frame.metadata.jobId) return sendBakeError(message, bakeFailure('WRONG_JOB_ID', 'BAKE_CHUNK does not match the active job.'));
  const expectedIndex = frame.receivedChunks;
  const expectedLength = Math.min(frame.metadata.chunkSize, frame.metadata.totalBytes - frame.receivedBytes);
  if (frame.pendingChunk || message.chunkIndex !== expectedIndex || message.byteLength !== expectedLength) return sendBakeError(message, bakeFailure('INVALID_BAKE_CHUNK', `Expected chunk ${expectedIndex} with ${expectedLength} bytes.`));
  frame.pendingChunk = { chunkIndex: message.chunkIndex, byteLength: message.byteLength };
}

function handleBakeBinary(arrayBuffer) {
  const frame = state.bake.current;
  if (!frame || !frame.pendingChunk) return sendBakeError(frame?.metadata || null, bakeFailure('UNEXPECTED_BAKE_BINARY', 'Binary data arrived without a BAKE_CHUNK marker.'));
  const chunk = new Uint8Array(arrayBuffer);
  if (chunk.byteLength !== frame.pendingChunk.byteLength || frame.receivedBytes + chunk.byteLength > frame.metadata.totalBytes) return sendBakeError(frame.metadata, bakeFailure('INVALID_BAKE_BINARY', 'Binary chunk length does not match its marker.'));
  frame.bytes.set(chunk, frame.receivedBytes);
  frame.receivedBytes += chunk.byteLength;
  frame.receivedChunks += 1;
  frame.pendingChunk = null;
  renderBake();
}

async function activateDocument(documentId) {
  await action.batchPlay([{
    _obj: 'select',
    _target: [{ _ref: 'document', _id: documentId }],
    _options: { dialogOptions: 'dontDisplay' }
  }], {});
}

async function applyReceivedBake(frame) {
  const metadata = frame.metadata;
  const originalDocumentId = app.activeDocument?.id || null;
  let stagingLayer = null;
  let bindingGroup = null;
  let createdGroupThisApply = false;
  let createdLayerThisApply = false;
  let activeDocumentRestored = originalDocumentId === metadata.targetDocumentId;
  return core.executeAsModal(async () => {
    const registeredTarget = state.bake.registry.getTarget(metadata.targetId);
    if (!registeredTarget || registeredTarget.documentId !== metadata.targetDocumentId) {
      throw bakeFailure('TARGET_IDENTITY_MISMATCH', 'Registered Target no longer matches the Bake Job.');
    }
    const target = findOpenDocument(registeredTarget.documentId);
    if (!target) throw bakeFailure('TARGET_CLOSED', 'Bake Target was closed before apply.');
    const currentTarget = documentSnapshot(target);
    if (currentTarget.documentName !== registeredTarget.documentName || currentTarget.width !== metadata.width || currentTarget.height !== metadata.height || currentTarget.documentMode !== 'RGB' || currentTarget.documentDepth !== 8) {
      throw bakeFailure('TARGET_CHANGED', 'Bake Target identity, dimensions, mode, or depth changed before apply.');
    }
    if (originalDocumentId !== target.id) await activateDocument(target.id);
    const previousLayerIds = Array.from(target.activeLayers, (layer) => layer.id);
    const priorOwnership = state.bake.ownedLayers.get(metadata.targetId, metadata.familyId, metadata.outputKind, metadata.authoringLayerId);
    try {
      const groupResolution = await ensureOwnedBindingGroup(target, metadata);
      bindingGroup = groupResolution.group;
      createdGroupThisApply = groupResolution.created;
      const group = bindingGroup;
      stagingLayer = priorOwnership ? findLayerById(target, priorOwnership.photoshopLayerId) : null;
      console.info('[LUUX][Block8C][UXPLayerResolution]', JSON.stringify({
        jobId: metadata.jobId, targetSessionId: metadata.targetSessionId, targetId: metadata.targetId,
        documentId: target.id, familyId: metadata.familyId, outputKind: metadata.outputKind,
        authoringLayerId: metadata.authoringLayerId,
        priorPhotoshopLayerId: priorOwnership?.photoshopLayerId || null,
        resolvedPhotoshopLayerId: stagingLayer?.id || null
      }));
      if (!stagingLayer) {
        stagingLayer = await target.createLayer(constants.LayerKind.NORMAL, { name: `${BAKE_LAYER_PREFIX} ${metadata.authoringLayerName || metadata.authoringLayerId}` });
        createdLayerThisApply = true;
        await stagingLayer.move(group, constants.ElementPlacement.PLACEINSIDE);
      }
      const imageData = await imaging.createImageDataFromBuffer(frame.bytes, {
        width: metadata.width,
        height: metadata.height,
        components: 4,
        chunky: true,
        colorProfile: DISPLAY_COLOR_PROFILE,
        colorSpace: 'RGB'
      });
      try {
        await imaging.putPixels({
          documentID: target.id,
          layerID: stagingLayer.id,
          imageData,
          replace: true,
          targetBounds: { left: 0, top: 0 },
          commandName: `LUUX ${metadata.outputKind} Bake Output`
        });
      } finally {
        imageData.dispose();
      }
      const finalLayerName = `${BAKE_LAYER_PREFIX} ${metadata.authoringLayerName || metadata.authoringLayerId} [${metadata.authoringLayerId.slice(-8)}]`;
      stagingLayer.name = finalLayerName;
      const selectedComposite = metadata.authoringStack.find((layer) => layer.authoringLayerId === metadata.authoringLayerId);
      state.bake.ownedLayers.register({
        documentId: target.id,
        targetId: metadata.targetId,
        familyId: metadata.familyId,
        outputKind: metadata.outputKind,
        authoringLayerId: metadata.authoringLayerId,
        photoshopLayerId: stagingLayer.id,
        layerName: finalLayerName,
        composite: selectedComposite
      });
      const appliedLayers = await syncOwnedBindingMetadata(target, metadata, group);
      const selectedApplied = appliedLayers.find((layer) => layer.authoringLayerId === metadata.authoringLayerId);
      if (!selectedApplied) throw bakeFailure('PHOTOSHOP_LAYER_RESOLUTION_FAILED', 'Selected authoring layer was not resolved after metadata synchronization.');
      const selectionRestored = restoreActiveLayers(target, previousLayerIds);
      const result = {
        jobId: metadata.jobId,
        familyId: metadata.familyId,
        outputKind: metadata.outputKind,
        outputId: metadata.outputId,
        targetId: metadata.targetId,
        targetSessionId: metadata.targetSessionId,
        targetLabel: registeredTarget.label,
        documentId: target.id,
        targetDocumentId: target.id,
        width: metadata.width,
        height: metadata.height,
        receivedBytes: frame.receivedBytes,
        layerId: stagingLayer.id,
        photoshopLayerId: selectedApplied.photoshopLayerId,
        layerName: finalLayerName,
        authoringLayerId: metadata.authoringLayerId,
        metadataRevision: selectedApplied.metadataRevision,
        opacity: selectedApplied.opacity,
        blendMode: selectedApplied.blendMode,
        visible: selectedApplied.visible,
        order: selectedApplied.order,
        replacedOwnedLayerId: priorOwnership?.photoshopLayerId || null,
        synchronizedLayerIds: appliedLayers.map((layer) => layer.authoringLayerId),
        appliedLayers,
        selectionRestored,
        fullFrameReplace: true
      };
      stagingLayer = null;
      return result;
    } catch (error) {
      if (stagingLayer && createdLayerThisApply) {
        try { await stagingLayer.delete(); } catch { /* Preserve the prior confirmed output even if staging cleanup fails. */ }
      }
      if (bindingGroup && createdGroupThisApply && bindingGroup.layers.length === 0) {
        try { await bindingGroup.delete(); } catch { /* A failed apply must not hide the original field-level failure. */ }
      }
      throw error;
    } finally {
      if (originalDocumentId && originalDocumentId !== target.id && findOpenDocument(originalDocumentId)) {
        await activateDocument(originalDocumentId);
        activeDocumentRestored = app.activeDocument?.id === originalDocumentId;
      }
    }
  }, { commandName: `LUUX Block 7 ${metadata.outputKind} Bake` }).then((result) => ({ ...result, activeDocumentRestored }));
}

async function handleBakeEnd(message) {
  const frame = state.bake.current;
  if (!frame || message.jobId !== frame.metadata.jobId) return sendBakeError(message, bakeFailure('UNEXPECTED_BAKE_END', 'BAKE_END does not match the active job.'));
  if (frame.pendingChunk || frame.receivedBytes !== frame.metadata.totalBytes || frame.receivedChunks !== frame.metadata.chunkCount || message.receivedBytes !== frame.receivedBytes || message.receivedChunks !== frame.receivedChunks) {
    return sendBakeError(message, bakeFailure('INCOMPLETE_BAKE', 'Full-image byte or chunk count validation failed.'));
  }
  state.bake.phase = 'RECEIVED_COMPLETE';
  sendJson({ type: 'BAKE_RECEIVED', jobId: message.jobId, receivedBytes: frame.receivedBytes, receivedChunks: frame.receivedChunks });
  state.bake.processing = true;
  state.bake.phase = 'VALIDATED';
  render();
  try {
    validateBakeBegin(frame.metadata);
    state.bake.phase = 'APPLYING_TO_PHOTOSHOP';
    sendJson({ type: 'BAKE_APPLYING', jobId: message.jobId });
    render();
    const result = await applyReceivedBake(frame);
    state.bake.lastApplied = result;
    state.bake.phase = 'APPLIED';
    state.bake.lastError = '';
    state.bake.current = null;
    const acknowledgement = { type: 'BAKE_APPLIED', ...result };
    console.info('[LUUX][Block8C][UXPAck]', JSON.stringify({
      jobId: acknowledgement.jobId, targetSessionId: acknowledgement.targetSessionId,
      targetId: acknowledgement.targetId, documentId: acknowledgement.documentId,
      familyId: acknowledgement.familyId, outputKind: acknowledgement.outputKind,
      authoringLayerId: acknowledgement.authoringLayerId,
      photoshopLayerId: acknowledgement.photoshopLayerId,
      metadataRevision: acknowledgement.metadataRevision, opacity: acknowledgement.opacity,
      blendMode: acknowledgement.blendMode, visible: acknowledgement.visible, order: acknowledgement.order
    }));
    sendJson(acknowledgement);
  } catch (error) {
    sendBakeError(frame.metadata, error);
    return;
  } finally {
    state.bake.processing = false;
    state.bake.suppressAutoSyncUntil = performance.now() + 1000;
    publishBakeTargetRegistry();
    refreshDocumentInfo();
    render();
  }
}

function snapshotError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}

function integerPixel(value, label) {
  const number = Number(value && typeof value === 'object' && 'value' in value ? value.value : value);
  if (!Number.isSafeInteger(number)) throw snapshotError('SNAPSHOT_BOUNDS_INVALID', `${label} must be an integer pixel value.`);
  return number;
}

function snapshotBounds(value) {
  const bounds = {
    left: integerPixel(value?.left, 'left'),
    top: integerPixel(value?.top, 'top'),
    right: integerPixel(value?.right, 'right'),
    bottom: integerPixel(value?.bottom, 'bottom')
  };
  if (bounds.right <= bounds.left || bounds.bottom <= bounds.top) throw snapshotError('SNAPSHOT_EMPTY', 'Snapshot capture bounds have no pixel area.');
  return bounds;
}

async function captureSnapshot(request) {
  const captureStartedAtEpochMs = Date.now();
  const captureStartedAt = performance.now();
  return core.executeAsModal(async () => {
    const doc = app.activeDocument;
    if (!doc) throw snapshotError('SNAPSHOT_NO_DOCUMENT', 'No active Photoshop document.');
    validateDocument(doc);
    const documentId = doc.id;
    const documentName = doc.name;
    const documentWidth = doc.width;
    const documentHeight = doc.height;
    const historyStateIdBefore = doc.activeHistoryState?.id ?? null;
    let selectedLayers = [];
    let selectedLayerOpacity = null;
    let sourceBounds = { left: 0, top: 0, right: documentWidth, bottom: documentHeight };
    const options = {
      documentID: documentId,
      sourceBounds,
      colorSpace: 'RGB',
      colorProfile: DISPLAY_COLOR_PROFILE,
      componentSize: 8
    };
    if (request.captureMode === 'SINGLE_PIXEL_LAYER') {
      selectedLayers = Array.from(doc.activeLayers || []);
      if (selectedLayers.length !== 1) throw snapshotError('SNAPSHOT_SELECTION_UNSUPPORTED', 'Select exactly one Pixel Layer.');
      const layer = selectedLayers[0];
      if (layer.kind !== constants.LayerKind.NORMAL) {
        throw snapshotError('SNAPSHOT_SELECTION_UNSUPPORTED', `Block 9A Selection Snapshot accepts one Pixel Layer only; selected kind is ${enumLabel(layer.kind)}.`);
      }
      selectedLayerOpacity = Number(layer.opacity) / 100;
      if (!Number.isFinite(selectedLayerOpacity) || selectedLayerOpacity < 0 || selectedLayerOpacity > 1) {
        throw snapshotError('SNAPSHOT_SELECTION_OPACITY_INVALID', 'Selected Pixel Layer opacity could not be normalized from 0 to 1.');
      }
      sourceBounds = snapshotBounds(layer.boundsNoEffects);
      options.layerID = layer.id;
      options.sourceBounds = sourceBounds;
    } else if (request.captureMode !== 'COMPOSITE') {
      throw snapshotError('SNAPSHOT_MODE_UNSUPPORTED', `Unsupported capture mode: ${request.captureMode}`);
    }

    const selectedLayerIds = selectedLayers.map((layer) => layer.id);
    const selectedLayerNames = selectedLayers.map((layer) => layer.name);
    const result = await imaging.getPixels(options);
    const photoshopImageData = result.imageData;
    try {
      const bytes = await photoshopImageData.getData({ chunky: true });
      const width = photoshopImageData.width;
      const height = photoshopImageData.height;
      const components = photoshopImageData.components;
      const componentSize = photoshopImageData.componentSize;
      const captureBounds = snapshotBounds(result.sourceBounds || sourceBounds);
      if (result.level !== 0) throw snapshotError('SNAPSHOT_RESAMPLED_UNSUPPORTED', `Photoshop returned pyramid level ${result.level}; native level 0 is required.`);
      if (captureBounds.right - captureBounds.left !== width || captureBounds.bottom - captureBounds.top !== height) {
        throw snapshotError('SNAPSHOT_NATIVE_PIXEL_MISMATCH', 'Capture bounds do not match returned bitmap dimensions 1:1.');
      }
      if (componentSize !== 8 || !(bytes instanceof Uint8Array) || ![3, 4].includes(components) ||
          photoshopImageData.pixelFormat !== (components === 3 ? 'RGB' : 'RGBA')) {
        throw snapshotError('SNAPSHOT_PIXEL_FORMAT_UNSUPPORTED', 'Block 9A requires chunky RGB8 or RGBA8 pixels.');
      }
      if (bytes.byteLength !== width * height * components) throw snapshotError('SNAPSHOT_BYTE_COUNT_INVALID', 'Snapshot byte count does not match dimensions.');
      if (app.activeDocument?.id !== documentId) throw snapshotError('SNAPSHOT_STALE_DOCUMENT', 'Active Photoshop document changed during capture.');
      if (request.captureMode === 'SINGLE_PIXEL_LAYER') {
        const activeLayers = Array.from(doc.activeLayers || []);
        const activeIds = activeLayers.map((layer) => layer.id);
        if (activeIds.length !== 1 || activeIds[0] !== selectedLayerIds[0]) throw snapshotError('SNAPSHOT_STALE_SELECTION', 'Active Pixel Layer changed during capture.');
        const activeOpacity = Number(activeLayers[0].opacity) / 100;
        if (!Number.isFinite(activeOpacity) || Math.abs(activeOpacity - selectedLayerOpacity) > 0.000001) {
          throw snapshotError('SNAPSHOT_STALE_SELECTION', 'Selected Pixel Layer opacity changed during capture.');
        }
      }
      if ((doc.activeHistoryState?.id ?? null) !== historyStateIdBefore) throw snapshotError('SNAPSHOT_SOURCE_MUTATED', 'Photoshop history changed during Snapshot capture.');
      return {
        bytes,
        metadata: {
          type: 'SNAPSHOT_BEGIN',
          snapshotJobId: request.snapshotJobId,
          captureRequestId: request.captureRequestId,
          projectSessionId: request.projectSessionId,
          familyId: request.familyId,
          captureMode: request.captureMode,
          sourceType: request.captureMode === 'COMPOSITE' ? 'PHOTOSHOP_COMPOSITE_SNAPSHOT' : 'PHOTOSHOP_SELECTION_SNAPSHOT',
          documentId,
          documentName,
          documentWidth,
          documentHeight,
          selectedLayerIds,
          selectedLayerNames,
          selectedLayerOpacity,
          captureBounds,
          captureTimestamp: new Date().toISOString(),
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
          colorContract: 'SRGB_IEC61966_2_1_RGB8',
          hasAlpha: photoshopImageData.hasAlpha,
          alphaContract: photoshopImageData.hasAlpha ? 'PHOTOSHOP_IMAGING_RGBA8_PROBE_PENDING' : 'OPAQUE_RGB8',
          isChunky: true,
          level: result.level,
          totalBytes: bytes.byteLength,
          chunkSize: config.chunkSizeBytes,
          chunkCount: Math.ceil(bytes.byteLength / config.chunkSizeBytes),
          captureMs: performance.now() - captureStartedAt,
          captureStartedAtEpochMs,
          captureEndedAtEpochMs: Date.now(),
          nonDestructiveEvidence: 'HISTORY_STATE_ID_UNCHANGED'
        }
      };
    } finally {
      photoshopImageData.dispose();
    }
  }, { commandName: `LUUX Block 9A — ${request.captureMode === 'COMPOSITE' ? 'Composite' : 'Pixel Layer'} Snapshot` });
}

async function sendSnapshotCapture(capture) {
  const { bytes, metadata } = capture;
  sendJson(metadata);
  let chunkIndex = 0;
  for (let offset = 0; offset < bytes.byteLength; offset += config.chunkSizeBytes) {
    await waitForBufferedAmount(config.backpressureHighWaterMarkBytes);
    const chunk = bytes.subarray(offset, Math.min(offset + config.chunkSizeBytes, bytes.byteLength));
    sendJson({ type: 'SNAPSHOT_CHUNK', snapshotJobId: metadata.snapshotJobId, chunkIndex, byteLength: chunk.byteLength });
    state.socket.send(chunk);
    chunkIndex += 1;
  }
  await waitForBufferedAmount(config.chunkSizeBytes);
  sendJson({
    type: 'SNAPSHOT_END',
    snapshotJobId: metadata.snapshotJobId,
    receivedBytes: bytes.byteLength,
    receivedChunks: chunkIndex
  });
  return waitForSnapshotAck(metadata.snapshotJobId);
}

async function processSnapshotRequest(request) {
  if (state.snapshot.processing || state.phase !== 'IDLE' || state.bake.processing) {
    sendJson({ type: 'SNAPSHOT_ERROR', snapshotJobId: request.snapshotJobId, code: 'LARGE_TRANSFER_BUSY', message: 'Photoshop is already processing a Live, Snapshot, or Bake transfer.' });
    return;
  }
  state.snapshot.processing = true;
  state.snapshot.currentJobId = request.snapshotJobId;
  state.lastError = '';
  render();
  try {
    const capture = await captureSnapshot(request);
    const result = await sendSnapshotCapture(capture);
    state.snapshot.lastResult = result;
  } catch (error) {
    state.lastError = error.message || String(error);
    if (isSocketOpen()) {
      try { sendJson({ type: 'SNAPSHOT_ERROR', snapshotJobId: request.snapshotJobId, code: error.code || 'SNAPSHOT_CAPTURE_FAILED', message: state.lastError }); } catch {}
    }
    rejectPendingSnapshotAck(error);
  } finally {
    state.snapshot.processing = false;
    state.snapshot.currentJobId = null;
    refreshDocumentInfo();
    render();
    resumeDirtyFrameIfReady();
  }
}

function handleJson(message) {
  switch (message.type) {
    case 'HELLO_ACK':
      state.handshake = true;
      state.connectionState = state.rendererConnected ? 'CONNECTED' : 'WAITING FOR RENDERER';
      publishBakeTargetRegistry(true);
      break;
    case 'LINK_STATUS':
      state.rendererConnected = Boolean(message.rendererConnected);
      state.connectionState = state.rendererConnected && state.handshake ? 'CONNECTED' : 'WAITING FOR RENDERER';
      if (state.rendererConnected) publishBakeTargetRegistry(true);
      break;
    case 'BAKE_BEGIN':
      handleBakeBegin(message);
      return;
    case 'BAKE_CHUNK':
      handleBakeChunkMarker(message);
      return;
    case 'BAKE_END':
      void handleBakeEnd(message);
      return;
    case 'BAKE_ABORT':
      state.bake.current = null;
      state.bake.processing = false;
      state.bake.phase = 'TRANSFER_ERROR';
      state.bake.lastError = `${message.code || 'BAKE_ABORT'}: ${message.message || 'Broker aborted the bake.'}`;
      render();
      return;
    case 'FRAME_ACK':
      if (state.pendingAck && message.frameId === state.pendingAck.frameId) {
        clearTimeout(state.pendingAck.timer);
        const pending = state.pendingAck;
        state.pendingAck = null;
        pending.resolve({ ...message, ackMs: performance.now() - pending.waitingSince });
      }
      break;
    case 'SNAPSHOT_REQUEST':
      void processSnapshotRequest(message);
      return;
    case 'SNAPSHOT_COMPLETE':
      if (state.snapshot.pendingAck?.snapshotJobId === message.snapshotJobId) {
        clearTimeout(state.snapshot.pendingAck.timer);
        const pending = state.snapshot.pendingAck;
        state.snapshot.pendingAck = null;
        pending.resolve(message);
      }
      break;
    case 'SNAPSHOT_ERROR': {
      const error = snapshotError(message.code || 'SNAPSHOT_ERROR', message.message || 'Snapshot failed.');
      state.lastError = error.message;
      rejectPendingSnapshotAck(error);
      break;
    }
    case 'SNAPSHOT_CANCEL':
      rejectPendingSnapshotAck(snapshotError(message.code || 'SNAPSHOT_CANCELED', message.message || 'Snapshot canceled.'));
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
      handleBakeBinary(event.data);
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
    rejectPendingSnapshotAck(new Error('Connection closed while waiting for SNAPSHOT_COMPLETE.'));
    if (state.bake.current) {
      state.bake.current = null;
      state.bake.processing = false;
      state.bake.phase = 'TRANSFER_ERROR';
      state.bake.lastError = 'PEER_DISCONNECTED: Connection closed during full-image write; prior confirmed output was preserved.';
    }
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
  if (state.phase !== 'IDLE' || state.snapshot.processing) {
    markDirty(reason);
    render();
    return;
  }
  void runRequestedSend(reason);
}

async function runRequestedSend(reason = 'manual') {
  if (state.phase !== 'IDLE' || state.snapshot.processing) {
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
elements.addBakeTarget.onclick = () => {
  if (state.bake.processing) return;
  const doc = app.activeDocument;
  if (!doc) {
    state.bake.lastError = 'TARGET_NOT_SET: No active Photoshop document.';
    render();
    return;
  }
  try {
    const familyId = elements.bakeTargetFamilySelect.value;
    const outputKind = elements.bakeTargetOutputSelect.value;
    const defaultLabel = `${familyId.replace(/^ANAMORPHIC_/, '').replace(/_/g, ' ')} ${outputKind}`;
    state.bake.registry.addTarget({
      label: elements.bakeTargetLabelInput.value.trim() || defaultLabel,
      documentSnapshot: documentSnapshot(doc),
      familyId,
      outputKind
    });
    elements.bakeTargetLabelInput.value = '';
    state.bake.lastError = '';
    publishBakeTargetRegistry(true);
  } catch (error) {
    state.bake.lastError = error.message || String(error);
  }
  render();
};
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
setInterval(() => {
  renderBake();
  publishBakeTargetRegistry();
}, 1000);
