import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import liveLinkConfig from './live-link-config.json';
import {
  CANONICAL_COORDINATE_SYSTEM,
  canonicalToLocalPoint,
  canonicalToSurfaceLocalPoint,
  localPointToCanonical,
  normalizedPointToCanonical,
  surfaceLocalPointToCanonical
} from './canonical-coordinate.js';
import { LatestWinsPointerQueue } from './pointer-command-queue.js';
import { SITE_SCENE_PROFILE, resolveSurfaceSet } from './site-scene-profile.js';

const canvas = document.querySelector('#three-canvas');
const viewer = document.querySelector('#viewer');
const diagnosticsElement = document.querySelector('#diagnostics');
const statusElement = document.querySelector('#runtime-status');
const badgeElement = document.querySelector('#full-resolution-badge');
const sourceSelect = document.querySelector('#source-select');
const zoomReadout = document.querySelector('#zoom-readout');
const filterButton = document.querySelector('#filter-button');
const linkStatusElement = document.querySelector('#link-status');
const navigateButton = document.querySelector('#navigate-button');
const pointButton = document.querySelector('#point-button');
const clearPointerButton = document.querySelector('#clear-pointer-button');
const dragHint = document.querySelector('#drag-hint');
const pointerMarker = document.querySelector('#pointer-marker');
const view2dButton = document.querySelector('#view-2d-button');
const view3dPlaneButton = document.querySelector('#view-3d-plane-button');
const viewSite3dButton = document.querySelector('#view-site-3d-button');
const siteControls = [...document.querySelectorAll('.site-control')];
const siteWorldSelect = document.querySelector('#site-world-select');
const siteMappingSelect = document.querySelector('#site-mapping-select');
const siteSceneSelect = document.querySelector('#site-scene-select');
const legacyCameraLockButton = document.querySelector('#legacy-camera-lock-button');
const fitButton = document.querySelector('#fit-button');
const oneButton = document.querySelector('#one-button');
const twoButton = document.querySelector('#two-button');
const fourButton = document.querySelector('#four-button');

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
const scene3d = new THREE.Scene();
const sceneSite = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
camera.position.z = 1;
const camera3d = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
camera3d.position.set(0, 0, 3);
const cameraSite = new THREE.PerspectiveCamera(45, 1, 0.01, 10000);
cameraSite.position.set(7, 6, 11);
const raycaster = new THREE.Raycaster();
const controls3d = new OrbitControls(camera3d, canvas);
const controlsSite = new OrbitControls(cameraSite, canvas);

function configure3dControls(controls, minDistance, maxDistance) {
  controls.enabled = false;
  controls.enableDamping = false;
  controls.screenSpacePanning = true;
  controls.minDistance = minDistance;
  controls.maxDistance = maxDistance;
  controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
  controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
  controls.mouseButtons.RIGHT = null;
}

configure3dControls(controls3d, 0.8, 12);
configure3dControls(controlsSite, 0.1, 100);
controls3d.target.set(0, 0, 0);
controls3d.update();
controlsSite.target.set(0, 4, -1.5);
controlsSite.update();

const state = {
  manifest: null,
  asset: null,
  mesh: null,
  plane3d: null,
  plane3dFrame: null,
  plane3dWidth: 1,
  plane3dHeight: 1,
  texture: null,
  activeView: '2d',
  zoom: 1,
  viewMode: 'fit',
  filterMode: 'normal',
  interactionMode: 'navigate',
  dragging: false,
  dragPointerId: null,
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
  },
  pointer: {
    nextRequestId: 1,
    state: 'UNAVAILABLE',
    down: null,
    lastCanonical: null,
    requested: null,
    applied: null,
    coordinateError: null,
    lastAck: null,
    lastError: '',
    marker: null,
    markerVisible: false
  },
  site: {
    status: 'LOADING',
    error: '',
    roots: { world3d: null, legacy2d: null },
    meshesByWorld: { world3d: [], legacy2d: [] },
    meshes: [],
    bindings: [],
    activeBindings: [],
    missingMeshes: [],
    world: 'world3d',
    mappingMode: 'normal',
    scene: 'front',
    legacyCameraLocked: true,
    surfaceSetAvailable: false
  }
};

const pointerQueue = new LatestWinsPointerQueue((command) => sendLinkMessage(command));

function wire3dControlEvents(controls, view) {
  controls.addEventListener('start', () => {
    if (state.activeView === view) canvas.classList.add('dragging');
  });
  controls.addEventListener('change', () => {
    if (state.activeView !== view) return;
    updateZoomReadout();
    render();
  });
  controls.addEventListener('end', () => {
    canvas.classList.remove('dragging');
    if (state.activeView === view) updateDiagnostics();
  });
}

wire3dControlEvents(controls3d, '3d-plane');
wire3dControlEvents(controlsSite, 'site-3d');

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
  camera3d.aspect = width / height;
  camera3d.updateProjectionMatrix();
  cameraSite.aspect = width / height;
  cameraSite.updateProjectionMatrix();
  if (state.activeView === '2d' && state.viewMode === 'fit' && state.asset) applyFit();
  else render();
}

function disposeCurrentTexture() {
  if (state.mesh) {
    scene.remove(state.mesh);
    state.mesh.geometry.dispose();
    state.mesh.material.dispose();
  }
  if (state.plane3d) {
    scene3d.remove(state.plane3d);
    state.plane3d.geometry.dispose();
    state.plane3d.material.dispose();
  }
  if (state.plane3dFrame) {
    scene3d.remove(state.plane3dFrame);
    state.plane3dFrame.geometry.dispose();
    state.plane3dFrame.material.dispose();
  }
  for (const binding of state.site.bindings) {
    if (binding.mesh.material?.map === state.texture) {
      binding.mesh.material.map = null;
      binding.mesh.material.needsUpdate = true;
    }
  }
  if (state.texture) state.texture.dispose();
  state.mesh = null;
  state.plane3d = null;
  state.plane3dFrame = null;
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
  const geometry2d = createGeometry(width, height, flipVerticalUv);
  const material2d = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  const mesh = new THREE.Mesh(geometry2d, material2d);
  scene.add(mesh);

  const planeWidth = 1;
  const planeHeight = height / width;
  const geometry3d = createGeometry(planeWidth, planeHeight, flipVerticalUv);
  const material3d = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
    toneMapped: false
  });
  const plane3d = new THREE.Mesh(geometry3d, material3d);
  plane3d.name = 'BLOCK_3A_SIGNAGE_PLANE';
  scene3d.add(plane3d);
  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry3d),
    new THREE.LineBasicMaterial({ color: 0x62daa1 })
  );
  frame.position.z = 0.001;
  scene3d.add(frame);

  state.texture = texture;
  state.mesh = mesh;
  state.plane3d = plane3d;
  state.plane3dFrame = frame;
  state.plane3dWidth = planeWidth;
  state.plane3dHeight = planeHeight;
  if (state.pointer.marker?.view === '3d-plane') state.pointer.marker.meshUuid = plane3d.uuid;
  for (const binding of state.site.bindings) {
    binding.mesh.material.map = texture;
    binding.mesh.material.needsUpdate = true;
  }
}

function selectedSiteContract() {
  const world = SITE_SCENE_PROFILE.worlds[state.site.world];
  if (state.site.mappingMode === 'anamorphic') {
    return {
      contracts: state.site.world === 'world3d' ? world.anamorphicSurfaces : null,
      camera: null,
      label: 'ANAMORPHIC'
    };
  }
  if (state.site.world === 'world3d') {
    return { contracts: world.normalSurfaces, camera: null, label: '3D WORLD / NORMAL' };
  }
  const sceneContract = world.normalScenes.find((candidate) => candidate.id === state.site.scene) || world.normalScenes[0];
  return { contracts: sceneContract.surfaces, camera: sceneContract.camera, label: `LEGACY 2D WORLD / ${sceneContract.label}` };
}

function fitSiteCameraToActiveSurfaces() {
  if (state.site.activeBindings.length === 0) return;
  const bounds = new THREE.Box3();
  for (const binding of state.site.activeBindings) bounds.expandByObject(binding.mesh);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(1, size.length() * 0.5);
  cameraSite.fov = 45;
  cameraSite.near = 0.01;
  cameraSite.far = 10000;
  cameraSite.position.copy(center).add(new THREE.Vector3(radius * 1.15, radius * 0.45, radius * 1.9));
  cameraSite.rotation.set(0, 0, 0);
  cameraSite.updateProjectionMatrix();
  controlsSite.target.copy(center);
  controlsSite.update();
}

function applyLegacySiteCamera(cameraContract) {
  cameraSite.fov = cameraContract.fov;
  cameraSite.near = cameraContract.near;
  cameraSite.far = cameraContract.far;
  cameraSite.position.fromArray(cameraContract.position);
  cameraSite.rotation.order = 'XYZ';
  cameraSite.rotation.set(...cameraContract.eulerXyzDegrees.map(THREE.MathUtils.degToRad));
  cameraSite.updateProjectionMatrix();
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraSite.quaternion);
  controlsSite.target.copy(cameraSite.position).addScaledVector(forward, 10);
}

function isLegacyCameraContext() {
  return state.activeView === 'site-3d' &&
    state.site.world === 'legacy2d' &&
    state.site.mappingMode === 'normal';
}

function syncSiteCameraControls() {
  const legacyContext = isLegacyCameraContext();
  legacyCameraLockButton.hidden = !legacyContext;
  legacyCameraLockButton.disabled = !legacyContext || !state.site.surfaceSetAvailable;
  legacyCameraLockButton.textContent = state.site.legacyCameraLocked ? 'CAMERA LOCKED' : 'CAMERA UNLOCKED';
  legacyCameraLockButton.setAttribute('aria-pressed', String(state.site.legacyCameraLocked));
  legacyCameraLockButton.classList.toggle('locked', state.site.legacyCameraLocked);
  legacyCameraLockButton.classList.toggle('unlocked', !state.site.legacyCameraLocked);
  controlsSite.enabled = state.activeView === 'site-3d' &&
    state.site.surfaceSetAvailable &&
    (!legacyContext || !state.site.legacyCameraLocked);
}

function lockLegacyCamera() {
  state.site.legacyCameraLocked = true;
  syncSiteCameraControls();
}

function toggleLegacyCameraLock() {
  if (!isLegacyCameraContext() || !state.site.surfaceSetAvailable) return;
  state.site.legacyCameraLocked = !state.site.legacyCameraLocked;
  syncSiteCameraControls();
  updatePointerControls();
  updateDiagnostics();
}

function applySiteSurfaceSelection({ resetCamera = true } = {}) {
  if (!state.site.roots.world3d || !state.site.roots.legacy2d) return;
  for (const mesh of state.site.meshes) mesh.visible = false;
  const selection = selectedSiteContract();
  if (!selection.contracts) {
    state.site.activeBindings = [];
    state.site.missingMeshes = ['Legacy 2D World anamorphic surface contract'];
    state.site.surfaceSetAvailable = false;
  } else {
    const resolution = resolveSurfaceSet(state.site.meshesByWorld[state.site.world], selection.contracts);
    state.site.missingMeshes = [...resolution.missing];
    state.site.surfaceSetAvailable = resolution.available;
    state.site.activeBindings = resolution.available ? [...resolution.resolved] : [];
    for (const binding of state.site.activeBindings) binding.mesh.visible = true;
  }

  if (state.pointer.marker?.view === 'site-3d') state.pointer.marker = null;
  if (resetCamera && state.site.surfaceSetAvailable) {
    if (selection.camera) applyLegacySiteCamera(selection.camera);
    else fitSiteCameraToActiveSurfaces();
  }
  syncSiteCameraControls();
  siteSceneSelect.disabled = state.site.world !== 'legacy2d' || state.site.mappingMode !== 'normal';
  updateZoomReadout();
  render();
  updateDiagnostics();
}

function populateSiteSceneOptions() {
  siteSceneSelect.replaceChildren();
  for (const sceneContract of SITE_SCENE_PROFILE.worlds.legacy2d.normalScenes) {
    const option = document.createElement('option');
    option.value = sceneContract.id;
    option.textContent = sceneContract.label;
    siteSceneSelect.append(option);
  }
  siteSceneSelect.value = state.site.scene;
}

async function loadSiteScene() {
  const loader = new GLTFLoader();
  try {
    const assetEntries = Object.entries(SITE_SCENE_PROFILE.assets);
    const loadedAssets = await Promise.all(assetEntries.map(async ([assetId, asset]) => {
      const url = new URL(asset.relativeUrl, import.meta.url).href;
      return [assetId, await loader.loadAsync(url)];
    }));
    state.site.meshes = [];
    state.site.bindings = [];
    const oldMaterials = new Set();
    for (const [assetId, gltf] of loadedAssets) {
      state.site.roots[assetId] = gltf.scene;
      state.site.meshesByWorld[assetId] = [];
      gltf.scene.traverse((child) => {
        if (!child.isMesh) return;
        state.site.meshes.push(child);
        state.site.meshesByWorld[assetId].push(child);
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) if (material) oldMaterials.add(material);
        child.material = new THREE.MeshBasicMaterial({
          map: state.texture,
          color: 0xffffff,
          transparent: true,
          opacity: 1,
          side: THREE.DoubleSide,
          depthTest: true,
          depthWrite: true,
          toneMapped: false
        });
        child.visible = false;
      });
      gltf.scene.userData.siteAssetId = assetId;
      sceneSite.add(gltf.scene);
    }
    for (const material of oldMaterials) material.dispose();
    state.site.bindings = state.site.meshes.map((mesh) => ({ mesh }));
    state.site.status = 'READY';
    state.site.error = '';
    applySiteSurfaceSelection();
  } catch (error) {
    state.site.status = 'ERROR';
    state.site.error = error.stack || error.message;
    state.site.surfaceSetAvailable = false;
    updateDiagnostics();
  }
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
  render();
  await nextFrame();
  render();
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
  if (state.pointer.marker && (
    state.pointer.marker.documentId !== metadata.documentId ||
    state.pointer.marker.width !== metadata.documentWidth ||
    state.pointer.marker.height !== metadata.documentHeight
  )) {
    state.pointer.marker = null;
  }
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
  render();
  await nextFrame();
  render();
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
  if (state.activeView !== '2d') return;
  state.zoom = Math.min(8, Math.max(0.02, zoom));
  state.viewMode = viewMode;
  camera.zoom = state.zoom;
  camera.updateProjectionMatrix();
  zoomReadout.textContent = `Zoom ${(state.zoom * 100).toFixed(1)}%`;
  render();
  updateDiagnostics();
}

function applyFit() {
  if (!state.asset || state.activeView !== '2d') return;
  const width = Math.max(1, viewer.clientWidth);
  const height = Math.max(1, viewer.clientHeight);
  const fitZoom = Math.min(width / state.asset.sourceWidth, height / state.asset.sourceHeight) * 0.96;
  camera.position.x = 0;
  camera.position.y = 0;
  setZoom(fitZoom, 'fit');
}

function updateZoomReadout() {
  if (state.activeView === '3d-plane') {
    zoomReadout.textContent = `Dolly ${camera3d.position.distanceTo(controls3d.target).toFixed(2)}`;
  } else if (state.activeView === 'site-3d') {
    zoomReadout.textContent = state.site.surfaceSetAvailable
      ? `Dolly ${cameraSite.position.distanceTo(controlsSite.target).toFixed(2)}`
      : 'Surface NONE';
  } else {
    zoomReadout.textContent = `Zoom ${(state.zoom * 100).toFixed(1)}%`;
  }
}

function isThreeDimensionalView() {
  return state.activeView === '3d-plane' || state.activeView === 'site-3d';
}

function setActiveView(view) {
  if (!['2d', '3d-plane', 'site-3d'].includes(view)) throw new Error(`Unknown view: ${view}`);
  const enteringLegacy = view === 'site-3d' && state.activeView !== 'site-3d' &&
    state.site.world === 'legacy2d' && state.site.mappingMode === 'normal';
  state.activeView = view;
  if (enteringLegacy) state.site.legacyCameraLocked = true;
  controls3d.enabled = view === '3d-plane';
  view2dButton.classList.toggle('active', view === '2d');
  view3dPlaneButton.classList.toggle('active', view === '3d-plane');
  viewSite3dButton.classList.toggle('active', view === 'site-3d');
  for (const control of siteControls) control.hidden = view !== 'site-3d';
  syncSiteCameraControls();
  for (const button of [fitButton, oneButton, twoButton, fourButton]) button.disabled = view !== '2d';
  updateZoomReadout();
  render();
  updateDiagnostics();
}

function render() {
  if (state.activeView === 'site-3d') renderer.render(sceneSite, cameraSite);
  else if (state.activeView === '3d-plane') renderer.render(scene3d, camera3d);
  else renderer.render(scene, camera);
  updatePointerMarker();
}

function updatePointerMarker() {
  const marker = state.pointer.marker;
  const live = state.link.lastFrame;
  const markerMesh = marker?.view === 'site-3d'
    ? state.site.meshes.find((mesh) => mesh.uuid === marker.meshUuid)
    : (marker?.view === '3d-plane' ? state.plane3d : state.mesh);
  const markerCamera = marker?.view === 'site-3d' ? cameraSite : (marker?.view === '3d-plane' ? camera3d : camera);
  const matchesCurrentDocument = marker && marker.view === state.activeView &&
    state.asset?.kind === 'live' && markerMesh && live &&
    marker.documentId === live.documentId &&
    marker.width === live.documentWidth &&
    marker.height === live.documentHeight;
  if (!matchesCurrentDocument) {
    pointerMarker.className = 'pointer-marker';
    state.pointer.markerVisible = false;
    return;
  }

  const local = marker.localPoint || canonicalToLocalPoint(marker.canonical, marker.width, marker.height);
  const projected = markerMesh.localToWorld(new THREE.Vector3(local.x, local.y, local.z || 0)).project(markerCamera);
  const visible = projected.z >= -1 && projected.z <= 1 &&
    projected.x >= -1 && projected.x <= 1 && projected.y >= -1 && projected.y <= 1;
  pointerMarker.className = `pointer-marker ${marker.status}${visible ? ' visible' : ''}`;
  pointerMarker.style.left = `${(projected.x + 1) * 50}%`;
  pointerMarker.style.top = `${(1 - projected.y) * 50}%`;
  state.pointer.markerVisible = visible;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  return `${(bytes / 1048576).toFixed(2)} MiB`;
}

function formatMs(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} ms` : '—';
}

function pointerRequirementsSatisfied() {
  const live = state.link.lastFrame;
  const pointerSurfaceAvailable = state.activeView === 'site-3d'
    ? state.site.surfaceSetAvailable && state.site.activeBindings.length > 0
    : Boolean(state.activeView === '3d-plane' ? state.plane3d : state.mesh);
  return state.asset?.kind === 'live' &&
    state.link.rendererHandshake && state.link.photoshopConnected &&
    Number.isSafeInteger(live?.frameId) && live.frameId > 0 &&
    Number.isSafeInteger(live?.documentId) && live.documentId > 0 &&
    Number.isSafeInteger(live?.documentWidth) && live.documentWidth > 0 &&
    Number.isSafeInteger(live?.documentHeight) && live.documentHeight > 0 &&
    pointerSurfaceAvailable;
}

function updatePointerControls() {
  const available = Boolean(pointerRequirementsSatisfied());
  pointButton.disabled = !available;
  clearPointerButton.disabled = !available;
  if (!available && state.interactionMode === 'point') state.interactionMode = 'navigate';
  navigateButton.classList.toggle('active', state.interactionMode === 'navigate');
  pointButton.classList.toggle('active', state.interactionMode === 'point');
  canvas.classList.toggle('point-mode', state.interactionMode === 'point');
  if (state.activeView === 'site-3d') {
    dragHint.textContent = state.site.surfaceSetAvailable
      ? (isLegacyCameraContext() && state.site.legacyCameraLocked
        ? (state.interactionMode === 'point'
          ? 'LEGACY POINT · CAMERA LOCKED: Left click points · Unlock camera to orbit/pan/dolly'
          : 'LEGACY CAMERA LOCKED: Unlock camera to orbit/pan/dolly')
        : (state.interactionMode === 'point'
          ? 'SITE POINT: Left click · Left drag: orbit · Middle drag: pan · Wheel: dolly'
          : 'SITE NAVIGATE: Left drag: orbit · Middle drag: pan · Wheel: dolly'))
      : `SITE SURFACE: NONE · Missing: ${state.site.missingMeshes.join(', ') || 'contract unavailable'}`;
  } else if (state.activeView === '3d-plane') {
    dragHint.textContent = state.interactionMode === 'point'
      ? '3D POINT: Left click · Left drag: orbit · Middle drag: pan · Wheel: dolly'
      : '3D NAVIGATE: Left drag: orbit · Middle drag: pan · Wheel: dolly';
  } else {
    dragHint.textContent = state.interactionMode === 'point'
      ? '2D POINT: Left click · Middle drag: pan · Wheel: zoom'
      : '2D NAVIGATE: Left/Middle drag: pan · Wheel: zoom';
  }
  if (!available && !pointerQueue.snapshot().activeRequestId) state.pointer.state = 'UNAVAILABLE';
  else if (available && state.pointer.state === 'UNAVAILABLE') state.pointer.state = 'READY';
}

function setInteractionMode(mode) {
  if (!['navigate', 'point'].includes(mode)) throw new Error(`Unknown interaction mode: ${mode}`);
  if (mode === 'point' && !pointerRequirementsSatisfied()) {
    state.pointer.state = 'UNAVAILABLE';
    state.pointer.lastError = 'POINT unavailable — Photoshop Live required.';
    updateDiagnostics();
    return false;
  }
  state.interactionMode = mode;
  state.pointer.lastError = '';
  updateDiagnostics();
  return true;
}

function mapClientPointToSurfaceHit(clientX, clientY) {
  if (!pointerRequirementsSatisfied()) return null;
  const bounds = canvas.getBoundingClientRect();
  if (clientX < bounds.left || clientX > bounds.right || clientY < bounds.top || clientY > bounds.bottom) return null;
  const ndc = new THREE.Vector2(
    ((clientX - bounds.left) / bounds.width) * 2 - 1,
    -((clientY - bounds.top) / bounds.height) * 2 + 1
  );
  const pointerMeshes = state.activeView === 'site-3d'
    ? state.site.activeBindings.map((binding) => binding.mesh)
    : [state.activeView === '3d-plane' ? state.plane3d : state.mesh];
  const pointerCamera = state.activeView === 'site-3d' ? cameraSite : (state.activeView === '3d-plane' ? camera3d : camera);
  raycaster.setFromCamera(ndc, pointerCamera);
  const hit = state.activeView === 'site-3d'
    ? raycaster.intersectObjects(pointerMeshes, false)[0]
    : raycaster.intersectObject(pointerMeshes[0], false)[0];
  if (!hit) return null;
  if (state.activeView === 'site-3d' && !hit.uv) return null;
  const pointerMesh = hit.object;
  const local = pointerMesh.worldToLocal(hit.point.clone());
  const canonical = state.activeView === 'site-3d'
    ? normalizedPointToCanonical(hit.uv.x, hit.uv.y, state.asset.sourceWidth, state.asset.sourceHeight)
    : (state.activeView === '3d-plane'
      ? surfaceLocalPointToCanonical(
      local.x,
      local.y,
      state.plane3dWidth,
      state.plane3dHeight,
      state.asset.sourceWidth,
      state.asset.sourceHeight
    )
      : localPointToCanonical(local.x, local.y, state.asset.sourceWidth, state.asset.sourceHeight));
  const siteBinding = state.activeView === 'site-3d'
    ? state.site.activeBindings.find((binding) => binding.mesh === pointerMesh)
    : null;
  return {
    canonical,
    view: state.activeView,
    meshUuid: pointerMesh.uuid,
    meshName: pointerMesh.name,
    surfaceRole: siteBinding?.contract.role || null,
    localPoint: { x: local.x, y: local.y, z: local.z }
  };
}

function pointerCommandBase() {
  const live = state.link.lastFrame;
  return {
    requestId: state.pointer.nextRequestId++,
    sourceFrameId: live.frameId,
    documentId: live.documentId,
    documentName: live.documentName,
    width: live.documentWidth,
    height: live.documentHeight
  };
}

function queuePointerCommand(command) {
  if (!pointerRequirementsSatisfied()) {
    state.pointer.state = 'UNAVAILABLE';
    state.pointer.lastError = 'POINT unavailable — Photoshop Live required.';
    updateDiagnostics();
    return null;
  }
  const result = pointerQueue.request(command);
  if (!result.sent && !result.pending) {
    state.pointer.state = 'ERROR';
    state.pointer.lastError = 'Pointer command could not be sent.';
    if (state.pointer.marker?.requestId === command.requestId) {
      state.pointer.marker.status = 'error';
      updatePointerMarker();
    }
  } else {
    state.pointer.state = 'BUSY';
    state.pointer.lastError = '';
  }
  updateDiagnostics();
  return command;
}

function requestPointerAt(canonical, surfaceHit = null) {
  const command = {
    type: 'POINTER_SET',
    ...pointerCommandBase(),
    x: canonical.x,
    y: canonical.y,
    u: canonical.u,
    v: canonical.v
  };
  state.pointer.lastCanonical = canonical;
  state.pointer.requested = { x: canonical.x, y: canonical.y };
  state.pointer.applied = null;
  state.pointer.coordinateError = null;
  state.pointer.marker = {
    requestId: command.requestId,
    documentId: command.documentId,
    width: command.width,
    height: command.height,
    canonical,
    view: surfaceHit?.view || state.activeView,
    meshUuid: surfaceHit?.meshUuid || (state.activeView === '3d-plane' ? state.plane3d?.uuid : (state.activeView === 'site-3d' ? null : state.mesh?.uuid)),
    meshName: surfaceHit?.meshName || null,
    surfaceRole: surfaceHit?.surfaceRole || null,
    localPoint: surfaceHit?.localPoint || null,
    status: 'pending'
  };
  updatePointerMarker();
  return queuePointerCommand(command);
}

function requestPointerClear() {
  return queuePointerCommand({ type: 'POINTER_CLEAR', ...pointerCommandBase() });
}

function handlePointerResponse(message) {
  if (!pointerQueue.settle(message)) return;
  state.pointer.lastAck = message;
  if (message.type === 'POINTER_ACK') {
    state.pointer.requested = { x: message.requestedX, y: message.requestedY };
    state.pointer.applied = { x: message.appliedX, y: message.appliedY };
    state.pointer.coordinateError = Math.hypot(
      message.appliedX - message.requestedX,
      message.appliedY - message.requestedY
    );
    state.pointer.lastError = '';
    if (state.pointer.marker?.requestId === message.requestId) {
      state.pointer.marker.status = 'acknowledged';
    }
  } else if (message.type === 'POINTER_CLEAR_ACK') {
    state.pointer.applied = null;
    state.pointer.coordinateError = null;
    state.pointer.lastError = '';
    if (!state.pointer.marker || state.pointer.marker.requestId < message.requestId) {
      state.pointer.marker = null;
    }
  } else {
    state.pointer.lastError = `${message.code || 'POINTER_ERROR'}: ${message.message || 'Pointer command failed.'}`;
    if (state.pointer.marker?.requestId === message.requestId) {
      state.pointer.marker.status = 'error';
    }
  }
  const queueState = pointerQueue.snapshot();
  state.pointer.state = queueState.activeRequestId
    ? 'BUSY'
    : (message.type === 'POINTER_ERROR' ? 'ERROR' : 'READY');
  updatePointerMarker();
  updateDiagnostics();
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
    activeView: state.activeView,
    zoom: state.zoom,
    viewMode: state.viewMode,
    filterMode: state.filterMode,
    contextLossCount: state.contextLossCount,
    rendererMemoryTextures: renderer.info.memory.textures,
    plane3d: {
      cameraType: camera3d.type,
      fov: camera3d.fov,
      near: camera3d.near,
      far: camera3d.far,
      position: camera3d.position.toArray(),
      target: controls3d.target.toArray(),
      distance: camera3d.position.distanceTo(controls3d.target),
      width: state.plane3dWidth,
      height: state.plane3dHeight,
      aspect: state.plane3dWidth > 0 ? state.plane3dHeight / state.plane3dWidth : null,
      meshUuid: state.plane3d?.uuid || null,
      textureShared: Boolean(
        state.texture &&
        state.mesh?.material.map === state.texture &&
        state.plane3d?.material.map === state.texture
      )
    },
    site3d: {
      status: state.site.status,
      error: state.site.error,
      assetFile: SITE_SCENE_PROFILE.assets[state.site.world].fileName,
      expectedSha256: SITE_SCENE_PROFILE.assets[state.site.world].sha256,
      loadedAssets: Object.values(SITE_SCENE_PROFILE.assets).map((asset) => asset.fileName),
      world: state.site.world,
      mappingMode: state.site.mappingMode,
      legacyScene: state.site.world === 'legacy2d' ? state.site.scene : null,
      legacyCameraLocked: isLegacyCameraContext() ? state.site.legacyCameraLocked : null,
      cameraControlsEnabled: controlsSite.enabled,
      surfaceSetAvailable: state.site.surfaceSetAvailable,
      missingMeshes: [...state.site.missingMeshes],
      meshCount: state.site.meshes.length,
      activeWorldMeshCount: state.site.meshesByWorld[state.site.world].length,
      activeSurfaces: state.site.activeBindings.map((binding) => ({
        role: binding.contract.role,
        meshName: binding.mesh.name,
        meshUuid: binding.mesh.uuid,
        textureShared: binding.mesh.material.map === state.texture
      })),
      cameraType: cameraSite.type,
      fov: cameraSite.fov,
      near: cameraSite.near,
      far: cameraSite.far,
      position: cameraSite.position.toArray(),
      target: controlsSite.target.toArray()
    },
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
    },
    pointerLink: {
      coordinateSystem: CANONICAL_COORDINATE_SYSTEM.name,
      origin: CANONICAL_COORDINATE_SYSTEM.origin,
      interactionMode: state.interactionMode.toUpperCase(),
      state: state.pointer.state,
      canonical: state.pointer.lastCanonical,
      requested: state.pointer.requested,
      applied: state.pointer.applied,
      coordinateError: state.pointer.coordinateError,
      documentId: live?.documentId || null,
      sourceFrameId: live?.frameId || null,
      lastAck: state.pointer.lastAck,
      lastError: state.pointer.lastError,
      marker: state.pointer.marker ? {
        requestId: state.pointer.marker.requestId,
        documentId: state.pointer.marker.documentId,
        view: state.pointer.marker.view,
        meshUuid: state.pointer.marker.meshUuid,
        meshName: state.pointer.marker.meshName,
        surfaceRole: state.pointer.marker.surfaceRole,
        localPoint: state.pointer.marker.localPoint,
        status: state.pointer.marker.status,
        visible: state.pointer.markerVisible
      } : null,
      queue: pointerQueue.snapshot()
    }
  };
  window.block0Diagnostics = structuredClone(state.diagnostics);
  window.block1Diagnostics = structuredClone(state.diagnostics.liveLink);
  window.block2PointerDiagnostics = structuredClone(state.diagnostics.pointerLink);
  window.block3PlaneDiagnostics = structuredClone(state.diagnostics.plane3d);
  window.block3SiteDiagnostics = structuredClone(state.diagnostics.site3d);

  const rows = [
    ['Active View', state.activeView === 'site-3d' ? 'SITE 3D' : (state.activeView === '3d-plane' ? '3D PLANE' : '2D VIEW')],
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
    ['3D Camera', state.diagnostics.plane3d.cameraType],
    ['3D Plane W / H', `${state.plane3dWidth.toFixed(4)} / ${state.plane3dHeight.toFixed(4)}`],
    ['3D Texture Shared', state.diagnostics.plane3d.textureShared ? 'YES' : 'NO'],
    ['3D Camera Distance', state.diagnostics.plane3d.distance.toFixed(3)],
    ['Site Asset', state.diagnostics.site3d.assetFile],
    ['Site Load', state.diagnostics.site3d.status],
    ['Site World / Mapping', `${state.site.world.toUpperCase()} / ${state.site.mappingMode.toUpperCase()}`],
    ['Site Scene', state.site.world === 'legacy2d' ? state.site.scene : '—'],
    ['Legacy Camera', isLegacyCameraContext() ? (state.site.legacyCameraLocked ? 'LOCKED' : 'UNLOCKED') : '—'],
    ['Site Surface Set', state.site.surfaceSetAvailable ? 'READY' : 'NONE'],
    ['Site Active Surfaces', state.site.activeBindings.map((binding) => `${binding.contract.role}:${binding.mesh.name}`).join(' + ') || '—'],
    ['Site Missing Meshes', state.site.missingMeshes.join(', ') || '—'],
    ['Site Texture Shared', state.site.activeBindings.length > 0 && state.site.activeBindings.every((binding) => binding.mesh.material.map === state.texture) ? 'YES' : '—'],
    ['Filter', state.diagnostics.filterMode.toUpperCase()],
    ['Last Link Error', state.link.lastError || '—'],
    ['Interaction Mode', state.interactionMode.toUpperCase()],
    ['Pointer Link', state.pointer.state],
    ['Canonical u / v', state.pointer.lastCanonical ? `${state.pointer.lastCanonical.u.toFixed(6)} / ${state.pointer.lastCanonical.v.toFixed(6)}` : '—'],
    ['Requested Pixel', state.pointer.requested ? `${state.pointer.requested.x} / ${state.pointer.requested.y}` : '—'],
    ['Applied Pixel', state.pointer.applied ? `${state.pointer.applied.x} / ${state.pointer.applied.y}` : '—'],
    ['Coordinate Error', Number.isFinite(state.pointer.coordinateError) ? `${state.pointer.coordinateError.toFixed(3)} px` : '—'],
    ['Pointer Document ID', live?.documentId || '—'],
    ['Pointer Source Frame', live?.frameId || '—'],
    ['Pointer In Flight', pointerQueue.snapshot().activeRequestId || '—'],
    ['Pointer Pending', pointerQueue.snapshot().pendingRequestId || '—'],
    ['Pointer Replacements', pointerQueue.snapshot().replacements],
    ['Last Pointer ACK', state.pointer.lastAck?.type || '—'],
    ['Last Pointer Error', state.pointer.lastError || '—'],
    ['Pointer Surface', state.pointer.marker?.surfaceRole ? `${state.pointer.marker.surfaceRole} / ${state.pointer.marker.meshName}` : '—'],
    ['Previz Marker', state.pointer.marker ? `${state.pointer.marker.status.toUpperCase()} / ${state.pointer.markerVisible ? 'VISIBLE' : 'OFFSCREEN'}` : 'CLEARED']
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
  updatePointerControls();
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
    case 'POINTER_ACK':
    case 'POINTER_CLEAR_ACK':
    case 'POINTER_ERROR':
      handlePointerResponse(message);
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
    pointerQueue.reset();
    state.pointer.state = 'UNAVAILABLE';
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

view2dButton.addEventListener('click', () => setActiveView('2d'));
view3dPlaneButton.addEventListener('click', () => setActiveView('3d-plane'));
viewSite3dButton.addEventListener('click', () => setActiveView('site-3d'));
siteWorldSelect.addEventListener('change', () => {
  state.site.world = siteWorldSelect.value;
  if (state.site.world === 'legacy2d') state.site.legacyCameraLocked = true;
  applySiteSurfaceSelection();
});
siteMappingSelect.addEventListener('change', () => {
  state.site.mappingMode = siteMappingSelect.value;
  if (state.site.world === 'legacy2d') state.site.legacyCameraLocked = true;
  applySiteSurfaceSelection();
});
siteSceneSelect.addEventListener('change', () => {
  state.site.scene = siteSceneSelect.value;
  lockLegacyCamera();
  applySiteSurfaceSelection();
});
legacyCameraLockButton.addEventListener('click', toggleLegacyCameraLock);
fitButton.addEventListener('click', applyFit);
oneButton.addEventListener('click', () => setZoom(1, '1:1'));
twoButton.addEventListener('click', () => setZoom(2, '200%'));
fourButton.addEventListener('click', () => setZoom(4, '400%'));
document.querySelector('#reload-button').addEventListener('click', () => {
  if (state.asset?.kind === 'local') void loadAsset(state.asset.id);
  else {
    statusElement.className = 'status';
    statusElement.textContent = 'Use SEND FULL RES in the Photoshop panel to refresh the live source.';
  }
});
filterButton.addEventListener('click', () => setFilterMode(state.filterMode === 'normal' ? 'pixel' : 'normal'));
navigateButton.addEventListener('click', () => setInteractionMode('navigate'));
pointButton.addEventListener('click', () => setInteractionMode('point'));
clearPointerButton.addEventListener('click', requestPointerClear);
sourceSelect.addEventListener('change', () => {
  if (sourceSelect.value === 'photoshop-live') selectLiveSource();
  else void loadAsset(sourceSelect.value);
});

canvas.addEventListener('wheel', (event) => {
  if (isThreeDimensionalView()) return;
  event.preventDefault();
  const factor = Math.exp(-event.deltaY * 0.0015);
  setZoom(state.zoom * factor, 'wheel');
}, { passive: false });

function beginPan(event) {
  event.preventDefault();
  state.dragging = true;
  state.dragPointerId = event.pointerId;
  state.pointerX = event.clientX;
  state.pointerY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
  canvas.classList.add('dragging');
}

canvas.addEventListener('pointerdown', (event) => {
  if (isThreeDimensionalView()) {
    if (event.button === 0 && state.interactionMode === 'point') {
      state.pointer.down = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    }
    return;
  }
  if (event.button === 1) {
    beginPan(event);
    return;
  }
  if (event.button !== 0) return;
  if (state.interactionMode === 'point') {
    state.pointer.down = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
    return;
  }
  beginPan(event);
});

canvas.addEventListener('pointermove', (event) => {
  if (isThreeDimensionalView()) return;
  if (!state.dragging || state.dragPointerId !== event.pointerId) return;
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
  if (state.dragPointerId !== event.pointerId) return;
  state.dragging = false;
  state.dragPointerId = null;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  canvas.classList.remove('dragging');
}

canvas.addEventListener('pointerup', (event) => {
  if (isThreeDimensionalView()) {
    const down = state.pointer.down;
    if (state.interactionMode !== 'point' || !down || down.pointerId !== event.pointerId) return;
    state.pointer.down = null;
    const movement = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    if (movement > 4) return;
    const surfaceHit = mapClientPointToSurfaceHit(event.clientX, event.clientY);
    if (surfaceHit) requestPointerAt(surfaceHit.canonical, surfaceHit);
    return;
  }
  if (state.dragging && state.dragPointerId === event.pointerId) {
    endDrag(event);
    return;
  }
  if (state.interactionMode === 'point') {
    const down = state.pointer.down;
    state.pointer.down = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (!down || down.pointerId !== event.pointerId) return;
    const movement = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    if (movement > 4) return;
    const surfaceHit = mapClientPointToSurfaceHit(event.clientX, event.clientY);
    if (surfaceHit) requestPointerAt(surfaceHit.canonical, surfaceHit);
    return;
  }
});
canvas.addEventListener('pointercancel', (event) => {
  if (state.pointer.down?.pointerId === event.pointerId) state.pointer.down = null;
  endDrag(event);
});
canvas.addEventListener('auxclick', (event) => {
  if (event.button === 1) event.preventDefault();
});
window.addEventListener('resize', resizeRenderer);

window.runBlock2PointerSmokeRequest = () => {
  setActiveView('2d');
  if (!setInteractionMode('point')) throw new Error('Synthetic pointer smoke requires an active Photoshop Live source.');
  const sourceX = Math.floor(state.asset.sourceWidth / 2);
  const sourceY = Math.floor(state.asset.sourceHeight / 2);
  const local = new THREE.Vector3(
    sourceX - state.asset.sourceWidth / 2 + 0.25,
    state.asset.sourceHeight / 2 - sourceY - 0.25,
    0
  );
  const projected = state.mesh.localToWorld(local).project(camera);
  const bounds = canvas.getBoundingClientRect();
  const clientX = bounds.left + ((projected.x + 1) / 2) * bounds.width;
  const clientY = bounds.top + ((1 - projected.y) / 2) * bounds.height;
  const surfaceHit = mapClientPointToSurfaceHit(clientX, clientY);
  if (!surfaceHit) throw new Error('Synthetic pointer point did not intersect the image plane.');
  const command = requestPointerAt(surfaceHit.canonical, surfaceHit);
  return { command, canonical: surfaceHit.canonical };
};

window.runBlock3PlanePointerSmokeRequest = () => {
  setActiveView('3d-plane');
  if (!setInteractionMode('point')) throw new Error('Synthetic 3D pointer smoke requires an active Photoshop Live source.');
  const canonicalSeed = {
    u: (1053.25 / state.asset.sourceWidth),
    v: (739.25 / state.asset.sourceHeight)
  };
  const local = canonicalToSurfaceLocalPoint(canonicalSeed, state.plane3dWidth, state.plane3dHeight);
  const projected = state.plane3d.localToWorld(new THREE.Vector3(local.x, local.y, 0)).project(camera3d);
  const bounds = canvas.getBoundingClientRect();
  const clientX = bounds.left + ((projected.x + 1) / 2) * bounds.width;
  const clientY = bounds.top + ((1 - projected.y) / 2) * bounds.height;
  const surfaceHit = mapClientPointToSurfaceHit(clientX, clientY);
  if (!surfaceHit) throw new Error('Synthetic 3D pointer point did not intersect the plane.');
  const command = requestPointerAt(surfaceHit.canonical, surfaceHit);
  return { command, canonical: surfaceHit.canonical, surfaceHit };
};

window.runBlock3PlaneMarkerCameraSmoke = () => {
  if (state.activeView !== '3d-plane' || !state.pointer.marker || !state.pointer.markerVisible) {
    throw new Error('3D marker camera smoke requires a visible 3D marker.');
  }
  const before = {
    left: pointerMarker.style.left,
    top: pointerMarker.style.top,
    meshUuid: state.pointer.marker.meshUuid,
    canonical: state.pointer.marker.canonical
  };
  camera3d.position.set(-0.8, 0.35, 2.5);
  controls3d.target.set(0, 0, 0);
  controls3d.update();
  render();
  updateDiagnostics();
  const after = {
    left: pointerMarker.style.left,
    top: pointerMarker.style.top,
    visible: state.pointer.markerVisible,
    meshUuid: state.pointer.marker.meshUuid,
    canonical: state.pointer.marker.canonical
  };
  return {
    before,
    after,
    screenPositionChanged: before.left !== after.left || before.top !== after.top,
    canonicalPreserved: before.canonical.x === after.canonical.x && before.canonical.y === after.canonical.y
  };
};

window.runBlock3SitePointerSmokeRequest = () => {
  state.site.world = 'world3d';
  state.site.mappingMode = 'normal';
  siteWorldSelect.value = state.site.world;
  siteMappingSelect.value = state.site.mappingMode;
  applySiteSurfaceSelection();
  setActiveView('site-3d');
  if (!setInteractionMode('point')) throw new Error('Synthetic site pointer smoke requires an active Photoshop Live source.');
  const bounds = canvas.getBoundingClientRect();
  let surfaceHit = null;
  for (const yFraction of [0.5, 0.35, 0.65, 0.2, 0.8]) {
    for (const xFraction of [0.5, 0.35, 0.65, 0.2, 0.8]) {
      surfaceHit = mapClientPointToSurfaceHit(
        bounds.left + bounds.width * xFraction,
        bounds.top + bounds.height * yFraction
      );
      if (surfaceHit) break;
    }
    if (surfaceHit) break;
  }
  if (!surfaceHit) throw new Error('Synthetic site pointer scan did not intersect a registered signage mesh.');
  const command = requestPointerAt(surfaceHit.canonical, surfaceHit);
  return { command, canonical: surfaceHit.canonical, surfaceHit };
};

window.runBlock3SiteMarkerCameraSmoke = () => {
  if (state.activeView !== 'site-3d' || !state.pointer.marker || !state.pointer.markerVisible) {
    throw new Error('Site marker camera smoke requires a visible site marker.');
  }
  const before = {
    left: pointerMarker.style.left,
    top: pointerMarker.style.top,
    meshUuid: state.pointer.marker.meshUuid,
    canonical: state.pointer.marker.canonical
  };
  cameraSite.position.add(new THREE.Vector3(0.4, 0.2, -0.35));
  controlsSite.update();
  render();
  updateDiagnostics();
  const after = {
    left: pointerMarker.style.left,
    top: pointerMarker.style.top,
    visible: state.pointer.markerVisible,
    meshUuid: state.pointer.marker.meshUuid,
    canonical: state.pointer.marker.canonical
  };
  return {
    before,
    after,
    screenPositionChanged: before.left !== after.left || before.top !== after.top,
    canonicalPreserved: before.canonical.x === after.canonical.x && before.canonical.y === after.canonical.y,
    meshPreserved: before.meshUuid === after.meshUuid
  };
};

window.runBlock3MissingAnamorphicSmoke = () => {
  setActiveView('site-3d');
  state.site.world = 'world3d';
  state.site.mappingMode = 'anamorphic';
  siteWorldSelect.value = state.site.world;
  siteMappingSelect.value = state.site.mappingMode;
  applySiteSurfaceSelection();
  const result = {
    surfaceSetAvailable: state.site.surfaceSetAvailable,
    activeSurfaceCount: state.site.activeBindings.length,
    visibleSurfaceCount: state.site.meshes.filter((mesh) => mesh.visible).length,
    missingMeshes: [...state.site.missingMeshes],
    pointDisabled: pointButton.disabled,
    controlsDisabled: !controlsSite.enabled
  };
  state.site.mappingMode = 'normal';
  siteMappingSelect.value = state.site.mappingMode;
  applySiteSurfaceSelection();
  return result;
};

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
  populateSiteSceneOptions();
  siteWorldSelect.value = state.site.world;
  siteMappingSelect.value = state.site.mappingMode;
  resizeRenderer();
  connectLiveLink();
  await Promise.all([
    loadSiteScene(),
    loadAsset(state.manifest.primaryAssetId)
  ]);
}

start().catch((error) => {
  console.error(error);
  statusElement.className = 'status fail';
  statusElement.textContent = error.stack || error.message;
  badgeElement.className = 'badge fail';
  badgeElement.textContent = 'RUNTIME ERROR';
  window.block0Diagnostics = { ready: false, error: error.stack || error.message };
});
