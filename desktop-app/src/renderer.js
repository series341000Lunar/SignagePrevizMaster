import * as THREE from 'three';
import liveLinkConfig from './live-link-config.json';

const canvas = document.querySelector('#three-canvas');
const viewer = document.querySelector('#viewer');
const diagnosticsElement = document.querySelector('#diagnostics');
const statusElement = document.querySelector('#runtime-status');
const badgeElement = document.querySelector('#full-resolution-badge');
const sourceSelect = document.querySelector('#source-select');
const zoomReadout = document.querySelector('#zoom-readout');
const filterButton = document.querySelector('#filter-button');
const linkStatusElement = document.querySelector('#link-status');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  alpha: false,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: true
});
renderer.setClearColor(0x090a0d, 1);
renderer.setPixelRatio(window.devicePixelRatio);

const gl = renderer.getContext();
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
camera.position.z = 1;

const state = {
  manifest: null,
  asset: null,
  mesh: null,
  texture: null,
  zoom: 1,
  viewMode: 'fit',
  filterMode: 'normal',
  dragging: false,
  pointerX: 0,
  pointerY: 0,
  contextLossCount: 0,
  gpuUploadObserved: false,
  diagnostics: null,
  link: {
    socket: null,
    rendererHandshake: false,
    photoshopConnected: false,
    reconnectTimer: null,
    currentFrame: null,
    framesReceived: 0,
    framesDropped: 0,
    framesReplaced: 0,
    lastFrame: null,
    lastError: ''
  }
};

canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  state.contextLossCount += 1;
  updateDiagnostics();
});

function getGpuInfo() {
  const extension = gl.getExtension('WEBGL_debug_renderer_info');
  const rendererName = extension
    ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
    : gl.getParameter(gl.RENDERER);
  const softwareRenderer = /swiftshader|llvmpipe|software rasterizer/i.test(rendererName);
  return {
    webglVersion: gl.getParameter(gl.VERSION),
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    gpuRenderer: rendererName,
    softwareRenderer,
    hardwareRendering: !softwareRenderer
  };
}

function resizeRenderer() {
  const width = Math.max(1, viewer.clientWidth);
  const height = Math.max(1, viewer.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(width, height, false);
  camera.left = -width / 2;
  camera.right = width / 2;
  camera.top = height / 2;
  camera.bottom = -height / 2;
  camera.updateProjectionMatrix();
  if (state.viewMode === 'fit' && state.asset) applyFit();
  else render();
}

function disposeCurrentTexture() {
  if (state.mesh) {
    scene.remove(state.mesh);
    state.mesh.geometry.dispose();
    state.mesh.material.dispose();
  }
  if (state.texture) state.texture.dispose();
  state.mesh = null;
  state.texture = null;
  renderer.renderLists.dispose();
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

async function loadTexture(textureUrl) {
  const loader = new THREE.TextureLoader();
  return new Promise((resolve, reject) => loader.load(textureUrl, resolve, undefined, reject));
}

function createGeometry(width, height, flipVerticalUv) {
  const geometry = new THREE.PlaneGeometry(width, height);
  if (flipVerticalUv) {
    const uv = geometry.getAttribute('uv');
    for (let index = 0; index < uv.count; index += 1) uv.setY(index, 1 - uv.getY(index));
    uv.needsUpdate = true;
  }
  return geometry;
}

function installTexture(texture, width, height, flipVerticalUv) {
  const geometry = createGeometry(width, height, flipVerticalUv);
  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  state.texture = texture;
  state.mesh = mesh;
}

async function loadAsset(assetId) {
  const asset = state.manifest.assets.find((candidate) => candidate.id === assetId);
  if (!asset) throw new Error(`Unknown asset: ${assetId}`);

  statusElement.className = 'status';
  statusElement.textContent = `Decoding ${asset.fileName}…`;
  badgeElement.className = 'badge pending';
  badgeElement.textContent = 'LOADING';
  disposeCurrentTexture();
  state.asset = { ...asset, kind: 'local' };
  state.gpuUploadObserved = false;
  sourceSelect.value = asset.id;

  const textureUrl = new URL(`./assets/${asset.fileName}`, import.meta.url).href;
  const texture = await loadTexture(textureUrl);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = state.filterMode === 'pixel' ? THREE.NearestFilter : THREE.LinearFilter;
  texture.onUpdate = () => { state.gpuUploadObserved = true; };

  const decodedWidth = texture.image.naturalWidth || texture.image.width;
  const decodedHeight = texture.image.naturalHeight || texture.image.height;
  installTexture(texture, decodedWidth, decodedHeight, false);

  applyFit();
  renderer.render(scene, camera);
  await nextFrame();
  renderer.render(scene, camera);
  gl.finish();
  updateDiagnostics();
  window.dispatchEvent(new CustomEvent('block0-ready', { detail: state.diagnostics }));
}

function effectiveColorProfile(metadata) {
  return metadata.colorProfile || metadata.requestedColorProfile || metadata.documentColorProfile || '';
}

function isSrgbProfile(metadata) {
  return metadata.colorSpace === 'RGB' && /\bsrgb\b/i.test(effectiveColorProfile(metadata));
}

function clearGlErrors() {
  while (gl.getError() !== gl.NO_ERROR) {
    // Clear stale errors so this frame's texture upload can be asserted.
  }
}

async function installLiveFrame(frame) {
  const metadata = frame.metadata;
  const replacingLiveTexture = state.asset?.kind === 'live' && Boolean(state.texture);
  const updateStartedAt = performance.now();
  disposeCurrentTexture();
  state.asset = {
    id: 'photoshop-live',
    kind: 'live',
    fileName: metadata.documentName,
    sourceWidth: metadata.documentWidth,
    sourceHeight: metadata.documentHeight,
    bytes: metadata.totalBytes,
    sha256: null
  };
  state.gpuUploadObserved = false;

  const format = metadata.components === 3 ? THREE.RGBFormat : THREE.RGBAFormat;
  const texture = new THREE.DataTexture(frame.bytes, metadata.width, metadata.height, format, THREE.UnsignedByteType);
  const sourceIsSrgb = isSrgbProfile(metadata);
  let colorHandling = 'Unmanaged source profile';
  if (metadata.components === 3) {
    texture.internalFormat = sourceIsSrgb ? 'SRGB8' : 'RGB8';
    texture.colorSpace = THREE.NoColorSpace;
    colorHandling = sourceIsSrgb
      ? 'Photoshop sRGB capture + GPU SRGB8 decode'
      : 'RGB8 without ICC conversion';
  } else {
    texture.colorSpace = sourceIsSrgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    colorHandling = sourceIsSrgb
      ? 'Photoshop sRGB capture + Three.js sRGB annotation'
      : 'RGBA8 without ICC conversion';
  }
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = state.filterMode === 'pixel' ? THREE.NearestFilter : THREE.LinearFilter;
  texture.unpackAlignment = 1;
  texture.flipY = false;
  texture.onUpdate = () => { state.gpuUploadObserved = true; };
  texture.needsUpdate = true;
  clearGlErrors();
  installTexture(texture, metadata.width, metadata.height, true);

  sourceSelect.value = 'photoshop-live';
  if (!replacingLiveTexture) applyFit();
  renderer.render(scene, camera);
  await nextFrame();
  renderer.render(scene, camera);
  gl.finish();

  const textureGlError = gl.getError();
  if (textureGlError !== gl.NO_ERROR) throw new Error(`WebGL texture upload failed with error 0x${textureGlError.toString(16)}.`);
  const centerPixel = new Uint8Array(4);
  gl.readPixels(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, centerPixel);

  const textureUpdateMs = performance.now() - updateStartedAt;
  const completedAtEpochMs = Date.now();
  state.link.framesReceived += 1;
  if (replacingLiveTexture) state.link.framesReplaced += 1;
  state.link.lastFrame = {
    ...metadata,
    receivedWidth: metadata.width,
    receivedHeight: metadata.height,
    textureWidth: texture.image.width,
    textureHeight: texture.image.height,
    receivedBytes: frame.receivedBytes,
    receivedChunks: frame.receivedChunks,
    textureUpdateMs,
    transferMs: completedAtEpochMs - metadata.captureEndedAtEpochMs,
    endToEndMs: completedAtEpochMs - metadata.captureStartedAtEpochMs,
    completedAtEpochMs,
    srgbAnnotated: sourceIsSrgb,
    colorHandling,
    verticalUvFlip: true,
    centerPixel: Array.from(centerPixel),
    textureGlError
  };
  updateDiagnostics();
  return state.link.lastFrame;
}

function setZoom(zoom, viewMode) {
  state.zoom = Math.min(8, Math.max(0.02, zoom));
  state.viewMode = viewMode;
  camera.zoom = state.zoom;
  camera.updateProjectionMatrix();
  zoomReadout.textContent = `Zoom ${(state.zoom * 100).toFixed(1)}%`;
  render();
  updateDiagnostics();
}

function applyFit() {
  if (!state.asset) return;
  const width = Math.max(1, viewer.clientWidth);
  const height = Math.max(1, viewer.clientHeight);
  const fitZoom = Math.min(width / state.asset.sourceWidth, height / state.asset.sourceHeight) * 0.96;
  camera.position.x = 0;
  camera.position.y = 0;
  setZoom(fitZoom, 'fit');
}

function render() {
  renderer.render(scene, camera);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  return `${(bytes / 1048576).toFixed(2)} MiB`;
}

function formatMs(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} ms` : '—';
}

function updateLinkStatus() {
  const connected = state.link.rendererHandshake && state.link.photoshopConnected;
  linkStatusElement.className = `link-status ${connected ? 'connected' : 'disconnected'}`;
  linkStatusElement.textContent = `Photoshop Link: ${connected ? 'CONNECTED' : 'DISCONNECTED'}`;
  const liveOption = sourceSelect.querySelector('option[value="photoshop-live"]');
  if (liveOption) liveOption.textContent = `Photoshop Live — ${connected ? 'CONNECTED' : 'DISCONNECTED'}`;
}

function updateDiagnostics() {
  const textureImage = state.texture?.image || null;
  const decodedWidth = textureImage ? (textureImage.naturalWidth || textureImage.width) : 0;
  const decodedHeight = textureImage ? (textureImage.naturalHeight || textureImage.height) : 0;
  const textureWidth = textureImage?.width || 0;
  const textureHeight = textureImage?.height || 0;
  const gpu = getGpuInfo();
  const dimensionsMatch = Boolean(state.asset) &&
    state.asset.sourceWidth === decodedWidth &&
    state.asset.sourceHeight === decodedHeight &&
    decodedWidth === textureWidth &&
    decodedHeight === textureHeight;
  const textureLimitPass = textureWidth > 0 && gpu.maxTextureSize >= Math.max(textureWidth, textureHeight);
  const fullResolution = dimensionsMatch && textureLimitPass && state.gpuUploadObserved;
  const live = state.link.lastFrame;

  state.diagnostics = {
    sourceKind: state.asset?.kind || 'none',
    sourceFile: state.asset?.fileName || 'Waiting for LUUX Live Link…',
    sourceBytes: state.asset?.bytes || 0,
    sourceSha256: state.asset?.sha256 || null,
    sourceWidth: state.asset?.sourceWidth || 0,
    sourceHeight: state.asset?.sourceHeight || 0,
    decodedWidth,
    decodedHeight,
    textureWidth,
    textureHeight,
    webglVersion: gpu.webglVersion,
    maxTextureSize: gpu.maxTextureSize,
    gpuRenderer: gpu.gpuRenderer,
    softwareRenderer: gpu.softwareRenderer,
    hardwareRendering: gpu.hardwareRendering,
    devicePixelRatio: window.devicePixelRatio,
    gpuUploadObserved: state.gpuUploadObserved,
    dimensionsMatch,
    textureLimitPass,
    fullResolution,
    zoom: state.zoom,
    viewMode: state.viewMode,
    filterMode: state.filterMode,
    contextLossCount: state.contextLossCount,
    rendererMemoryTextures: renderer.info.memory.textures,
    liveLink: {
      endpoint: liveLinkConfig.endpoint,
      rendererConnected: state.link.rendererHandshake,
      photoshopConnected: state.link.photoshopConnected,
      document: live?.documentName || null,
      documentId: live?.documentId || null,
      documentWidth: live?.documentWidth || null,
      documentHeight: live?.documentHeight || null,
      captureWidth: live?.width || null,
      captureHeight: live?.height || null,
      receivedWidth: live?.receivedWidth || null,
      receivedHeight: live?.receivedHeight || null,
      textureWidth: live?.textureWidth || null,
      textureHeight: live?.textureHeight || null,
      components: live?.components || null,
      componentSize: live?.componentSize || null,
      pixelFormat: live?.pixelFormat || null,
      colorSpace: live?.colorSpace || null,
      colorProfile: live ? (effectiveColorProfile(live) || null) : null,
      level: live?.level ?? null,
      frameId: live?.frameId || null,
      frameBytes: live?.receivedBytes || null,
      captureMs: live?.captureMs ?? null,
      transferMs: live?.transferMs ?? null,
      textureUpdateMs: live?.textureUpdateMs ?? null,
      endToEndMs: live?.endToEndMs ?? null,
      framesReceived: state.link.framesReceived,
      framesDropped: state.link.framesDropped,
      framesReplaced: state.link.framesReplaced,
      rendererTextureCount: renderer.info.memory.textures,
      contextLossCount: state.contextLossCount,
      srgbAnnotated: live?.srgbAnnotated || false,
      verticalUvFlip: live?.verticalUvFlip || false,
      colorHandling: live?.colorHandling || null,
      centerPixel: live?.centerPixel || null,
      textureGlError: live?.textureGlError ?? null,
      lastError: state.link.lastError
    }
  };
  window.block0Diagnostics = structuredClone(state.diagnostics);
  window.block1Diagnostics = structuredClone(state.diagnostics.liveLink);

  const rows = [
    ['Photoshop Link', state.link.photoshopConnected ? 'CONNECTED' : 'DISCONNECTED'],
    ['Endpoint', liveLinkConfig.endpoint],
    ['Document', live?.documentName || '—'],
    ['Document ID', live?.documentId || '—'],
    ['Document Size', live ? `${live.documentWidth} × ${live.documentHeight}` : '—'],
    ['Capture Size', live ? `${live.width} × ${live.height}` : '—'],
    ['Received Size', live ? `${live.receivedWidth} × ${live.receivedHeight}` : '—'],
    ['Texture Size', textureWidth ? `${textureWidth} × ${textureHeight}` : '—'],
    ['Components / Bits', live ? `${live.components} / ${live.componentSize}` : '—'],
    ['Pixel Format', live?.pixelFormat || '—'],
    ['Color Space', live?.colorSpace || '—'],
    ['Document Profile', live?.documentColorProfile || '—'],
    ['Capture Profile', live ? (effectiveColorProfile(live) || '—') : '—'],
    ['Color Handling', live?.colorHandling || '—'],
    ['Pyramid Level', live?.level ?? '—'],
    ['Frame ID / Bytes', live ? `${live.frameId} / ${formatBytes(live.receivedBytes)}` : '—'],
    ['Capture / Transfer', live ? `${formatMs(live.captureMs)} / ${formatMs(live.transferMs)}` : '—'],
    ['Texture / End-to-End', live ? `${formatMs(live.textureUpdateMs)} / ${formatMs(live.endToEndMs)}` : '—'],
    ['Frames Rcv / Drop / Repl', `${state.link.framesReceived} / ${state.link.framesDropped} / ${state.link.framesReplaced}`],
    ['Source File', state.diagnostics.sourceFile],
    ['Source Width', state.diagnostics.sourceWidth],
    ['Source Height', state.diagnostics.sourceHeight],
    ['Decoded Width', state.diagnostics.decodedWidth],
    ['Decoded Height', state.diagnostics.decodedHeight],
    ['WebGL Version', state.diagnostics.webglVersion],
    ['MAX_TEXTURE_SIZE', state.diagnostics.maxTextureSize],
    ['GPU Renderer', state.diagnostics.gpuRenderer],
    ['GPU Upload', state.diagnostics.gpuUploadObserved ? 'OBSERVED' : 'WAITING'],
    ['Texture Count', state.diagnostics.rendererMemoryTextures],
    ['Context Loss', state.diagnostics.contextLossCount],
    ['Filter', state.diagnostics.filterMode.toUpperCase()],
    ['Last Link Error', state.link.lastError || '—']
  ];
  diagnosticsElement.replaceChildren();
  for (const [label, value] of rows) {
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = label;
    detail.textContent = String(value);
    diagnosticsElement.append(term, detail);
  }

  updateLinkStatus();
  if (!state.asset) {
    badgeElement.className = 'badge pending';
    badgeElement.textContent = 'WAITING';
    statusElement.className = 'status';
    statusElement.textContent = 'Waiting for LUUX Live Link. Local Block 0 sources remain available.';
  } else {
    badgeElement.className = `badge ${fullResolution ? 'pass' : 'fail'}`;
    badgeElement.textContent = fullResolution ? 'FULL RES ●' : 'CHECK FAILED';
    statusElement.className = `status ${fullResolution ? 'pass' : 'fail'}`;
    statusElement.textContent = fullResolution
      ? `${state.asset.kind === 'live' ? 'Photoshop composite' : 'Source'}, decoded/received image, and GPU texture dimensions match. FIT changes display scale only.`
      : 'One or more full-resolution assertions failed. Review diagnostics.';
  }
}

function setFilterMode(mode) {
  state.filterMode = mode;
  filterButton.textContent = mode === 'pixel' ? 'PIXEL INSPECTION' : 'NORMAL';
  if (state.texture) {
    state.texture.magFilter = mode === 'pixel' ? THREE.NearestFilter : THREE.LinearFilter;
    state.texture.needsUpdate = true;
    render();
    updateDiagnostics();
  }
}

function sendLinkMessage(message) {
  if (state.link.socket?.readyState !== WebSocket.OPEN) return false;
  state.link.socket.send(JSON.stringify(message));
  return true;
}

function rejectIncomingFrame(code, message, frameId = null) {
  state.link.framesDropped += 1;
  state.link.lastError = `${code}: ${message}`;
  state.link.currentFrame = null;
  sendLinkMessage({ type: 'ERROR', code, message, frameId });
  updateDiagnostics();
}

function handleFrameBegin(metadata) {
  if (state.link.currentFrame) return rejectIncomingFrame('FRAME_IN_FLIGHT', 'Renderer already has a frame in flight.', metadata.frameId);
  const numeric = ['frameId', 'documentWidth', 'documentHeight', 'width', 'height', 'components', 'componentSize', 'totalBytes', 'chunkSize', 'chunkCount'];
  if (numeric.some((field) => !Number.isSafeInteger(metadata[field]) || metadata[field] < 0)) {
    return rejectIncomingFrame('INVALID_FRAME_METADATA', 'Frame metadata contains an invalid integer.', metadata.frameId);
  }
  const expectedBytes = metadata.width * metadata.height * metadata.components * (metadata.componentSize / 8);
  const valid =
    metadata.documentWidth === metadata.width &&
    metadata.documentHeight === metadata.height &&
    metadata.componentSize === 8 &&
    [3, 4].includes(metadata.components) &&
    metadata.pixelFormat === (metadata.components === 3 ? 'RGB' : 'RGBA') &&
    metadata.totalBytes === expectedBytes &&
    metadata.totalBytes <= liveLinkConfig.maxFrameBytes &&
    metadata.chunkSize > 0 && metadata.chunkSize <= liveLinkConfig.chunkSizeBytes &&
    metadata.chunkCount === Math.ceil(metadata.totalBytes / metadata.chunkSize);
  if (!valid) return rejectIncomingFrame('INVALID_FRAME_METADATA', 'Dimensions, format, byte count, or chunk count is inconsistent.', metadata.frameId);

  try {
    state.link.currentFrame = {
      metadata,
      bytes: new Uint8Array(metadata.totalBytes),
      receivedBytes: 0,
      receivedChunks: 0
    };
  } catch (error) {
    rejectIncomingFrame('FRAME_ALLOCATION_FAILED', error.message, metadata.frameId);
  }
}

function handleBinaryChunk(arrayBuffer) {
  const frame = state.link.currentFrame;
  if (!frame) return rejectIncomingFrame('UNEXPECTED_BINARY', 'Binary chunk arrived without FRAME_BEGIN.');
  const chunk = new Uint8Array(arrayBuffer);
  if (chunk.byteLength <= 0 || chunk.byteLength > frame.metadata.chunkSize || frame.receivedBytes + chunk.byteLength > frame.metadata.totalBytes) {
    return rejectIncomingFrame('INVALID_CHUNK', 'Chunk size or cumulative byte count is invalid.', frame.metadata.frameId);
  }
  frame.bytes.set(chunk, frame.receivedBytes);
  frame.receivedBytes += chunk.byteLength;
  frame.receivedChunks += 1;
}

async function handleFrameEnd(message) {
  const frame = state.link.currentFrame;
  if (!frame || message.frameId !== frame.metadata.frameId) return rejectIncomingFrame('UNEXPECTED_FRAME_END', 'FRAME_END does not match the active frame.', message.frameId);
  if (frame.receivedBytes !== frame.metadata.totalBytes || frame.receivedChunks !== frame.metadata.chunkCount || message.receivedBytes !== frame.receivedBytes || message.receivedChunks !== frame.receivedChunks) {
    return rejectIncomingFrame('INCOMPLETE_FRAME', 'Renderer byte or chunk count validation failed.', message.frameId);
  }
  state.link.currentFrame = null;
  try {
    const result = await installLiveFrame(frame);
    sendLinkMessage({
      type: 'FRAME_ACK',
      frameId: result.frameId,
      receivedWidth: result.receivedWidth,
      receivedHeight: result.receivedHeight,
      textureWidth: result.textureWidth,
      textureHeight: result.textureHeight,
      receivedBytes: result.receivedBytes,
      textureUpdateMs: result.textureUpdateMs,
      transferMs: result.transferMs,
      endToEndMs: result.endToEndMs,
      rendererTextureCount: renderer.info.memory.textures,
      contextLossCount: state.contextLossCount
    });
  } catch (error) {
    rejectIncomingFrame('TEXTURE_UPDATE_FAILED', error.message, message.frameId);
  }
}

function handleLinkJson(message) {
  switch (message.type) {
    case 'HELLO_ACK':
      state.link.rendererHandshake = true;
      break;
    case 'LINK_STATUS':
      state.link.photoshopConnected = Boolean(message.photoshopConnected);
      break;
    case 'FRAME_BEGIN':
      handleFrameBegin(message);
      break;
    case 'FRAME_END':
      void handleFrameEnd(message);
      return;
    case 'FRAME_ABORT':
      rejectIncomingFrame(message.code || 'FRAME_ABORT', message.message || 'Broker aborted the frame.', message.frameId);
      return;
    case 'ERROR':
      state.link.lastError = `${message.code || 'ERROR'}: ${message.message || 'Unknown link error.'}`;
      break;
    default:
      state.link.lastError = `UNKNOWN_MESSAGE: ${message.type || '<missing>'}`;
  }
  updateDiagnostics();
}

function scheduleReconnect() {
  if (state.link.reconnectTimer) return;
  state.link.reconnectTimer = setTimeout(() => {
    state.link.reconnectTimer = null;
    connectLiveLink();
  }, liveLinkConfig.reconnectDelayMs);
}

function connectLiveLink() {
  if (state.link.socket && [WebSocket.CONNECTING, WebSocket.OPEN].includes(state.link.socket.readyState)) return;
  const socket = new WebSocket(liveLinkConfig.endpoint);
  socket.binaryType = 'arraybuffer';
  state.link.socket = socket;
  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({
      type: 'HELLO',
      protocol: liveLinkConfig.protocol,
      protocolVersion: liveLinkConfig.protocolVersion,
      role: 'renderer'
    }));
  });
  socket.addEventListener('message', (event) => {
    if (typeof event.data === 'string') {
      try { handleLinkJson(JSON.parse(event.data)); }
      catch (error) {
        state.link.lastError = `INVALID_JSON: ${error.message}`;
        updateDiagnostics();
      }
      return;
    }
    handleBinaryChunk(event.data);
  });
  socket.addEventListener('close', () => {
    state.link.rendererHandshake = false;
    state.link.photoshopConnected = false;
    if (state.link.currentFrame) rejectIncomingFrame('BROKER_DISCONNECTED', 'Broker disconnected during a frame.', state.link.currentFrame.metadata.frameId);
    updateDiagnostics();
    scheduleReconnect();
  });
  socket.addEventListener('error', () => {
    state.link.lastError = 'BROKER_CONNECTION_ERROR: Waiting to reconnect.';
    updateDiagnostics();
  });
}

function selectLiveSource() {
  if (state.asset?.kind === 'live' && state.texture) return;
  disposeCurrentTexture();
  state.asset = null;
  state.gpuUploadObserved = false;
  render();
  updateDiagnostics();
}

document.querySelector('#fit-button').addEventListener('click', applyFit);
document.querySelector('#one-button').addEventListener('click', () => setZoom(1, '1:1'));
document.querySelector('#two-button').addEventListener('click', () => setZoom(2, '200%'));
document.querySelector('#four-button').addEventListener('click', () => setZoom(4, '400%'));
document.querySelector('#reload-button').addEventListener('click', () => {
  if (state.asset?.kind === 'local') void loadAsset(state.asset.id);
  else {
    statusElement.className = 'status';
    statusElement.textContent = 'Use SEND FULL RES in the Photoshop panel to refresh the live source.';
  }
});
filterButton.addEventListener('click', () => setFilterMode(state.filterMode === 'normal' ? 'pixel' : 'normal'));
sourceSelect.addEventListener('change', () => {
  if (sourceSelect.value === 'photoshop-live') selectLiveSource();
  else void loadAsset(sourceSelect.value);
});

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  const factor = Math.exp(-event.deltaY * 0.0015);
  setZoom(state.zoom * factor, 'wheel');
}, { passive: false });

canvas.addEventListener('pointerdown', (event) => {
  state.dragging = true;
  state.pointerX = event.clientX;
  state.pointerY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
  canvas.classList.add('dragging');
});

canvas.addEventListener('pointermove', (event) => {
  if (!state.dragging) return;
  const deltaX = event.clientX - state.pointerX;
  const deltaY = event.clientY - state.pointerY;
  state.pointerX = event.clientX;
  state.pointerY = event.clientY;
  camera.position.x -= deltaX / state.zoom;
  camera.position.y += deltaY / state.zoom;
  state.viewMode = 'pan';
  render();
  updateDiagnostics();
});

function endDrag(event) {
  state.dragging = false;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  canvas.classList.remove('dragging');
}

canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
window.addEventListener('resize', resizeRenderer);

window.runBlock0SmokeActions = async () => {
  const actions = {};
  applyFit();
  await nextFrame();
  actions.fit = state.viewMode === 'fit' && state.zoom > 0;
  setZoom(1, '1:1');
  await nextFrame();
  actions.oneToOne = state.zoom === 1;
  setZoom(2, '200%');
  await nextFrame();
  actions.zoom200 = state.zoom === 2;
  setZoom(4, '400%');
  await nextFrame();
  actions.zoom400 = state.zoom === 4;
  const beforePanX = camera.position.x;
  camera.position.x += 64 / state.zoom;
  camera.position.y += 48 / state.zoom;
  state.viewMode = 'pan';
  render();
  actions.pan = camera.position.x !== beforePanX;
  setFilterMode('pixel');
  await nextFrame();
  actions.pixelInspection = state.texture.magFilter === THREE.NearestFilter;

  const textureCounts = [renderer.info.memory.textures];
  for (let index = 0; index < 3; index += 1) {
    await loadAsset(state.asset.id);
    textureCounts.push(renderer.info.memory.textures);
  }
  actions.reload = textureCounts.length === 4;

  const sourceVariants = [];
  for (const asset of state.manifest.assets) {
    await loadAsset(asset.id);
    textureCounts.push(renderer.info.memory.textures);
    sourceVariants.push({
      id: asset.id,
      sourceWidth: state.diagnostics.sourceWidth,
      sourceHeight: state.diagnostics.sourceHeight,
      decodedWidth: state.diagnostics.decodedWidth,
      decodedHeight: state.diagnostics.decodedHeight,
      textureWidth: state.diagnostics.textureWidth,
      textureHeight: state.diagnostics.textureHeight,
      fullResolution: state.diagnostics.fullResolution
    });
  }
  actions.sourceSelection = sourceVariants.every((variant) => variant.fullResolution);
  await loadAsset(state.manifest.primaryAssetId);
  textureCounts.push(renderer.info.memory.textures);
  const memoryStable = Math.max(...textureCounts) - Math.min(...textureCounts) <= 1;
  const diagnostics = structuredClone(state.diagnostics);
  return {
    ...diagnostics,
    actions,
    sourceVariants,
    reloadTextureCounts: textureCounts,
    memoryStable
  };
};

async function start() {
  state.manifest = await fetch('./assets-manifest.json').then((response) => {
    if (!response.ok) throw new Error(`Manifest load failed: ${response.status}`);
    return response.json();
  });
  const liveOption = document.createElement('option');
  liveOption.value = 'photoshop-live';
  liveOption.textContent = 'Photoshop Live — DISCONNECTED';
  sourceSelect.append(liveOption);
  for (const asset of state.manifest.assets) {
    const option = document.createElement('option');
    option.value = asset.id;
    option.textContent = `${asset.label} — ${asset.sourceWidth} × ${asset.sourceHeight}`;
    sourceSelect.append(option);
  }
  resizeRenderer();
  connectLiveLink();
  await loadAsset(state.manifest.primaryAssetId);
}

start().catch((error) => {
  console.error(error);
  statusElement.className = 'status fail';
  statusElement.textContent = error.stack || error.message;
  badgeElement.className = 'badge fail';
  badgeElement.textContent = 'RUNTIME ERROR';
  window.block0Diagnostics = { ready: false, error: error.stack || error.message };
});
