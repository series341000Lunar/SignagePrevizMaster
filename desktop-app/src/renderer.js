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
import {
  CAMERA_INPUT_MODES,
  cloneCameraValues,
  commitCameraRecordTransaction,
  createMaxLikeCandidate,
  createThreeDirectCandidate,
  threePointToMaxLike
} from './camera-input-adapter.js';
import { createEditableCameraRecords, LOCATION_RECORDS, PHOTO_SCENE_RECORDS } from './site-calibration-profile.js';
import {
  createSiteReturnSnapshot,
  LatestWinsLocationNavigation,
  projectLocationToViewport,
  restoreCameraFromSiteSnapshot,
  validateLocationRecord
} from './location-navigation-runtime.js';
import {
  clientPointToContentNdc,
  computeContainedAspectRect,
  LatestWinsPhotoSceneController,
  PHOTO_CONTENT_ASPECT
} from './photo-scene-runtime.js';
import { SITE_SCENE_PROFILE, resolveSurfaceSet } from './site-scene-profile.js';
import { SITE_ENVIRONMENT_PROFILE } from './site-environment-profile.js';
import { ANAMORPHIC_FAMILY_AVAILABILITY, ANAMORPHIC_FAMILY_IDS } from './anamorphic-calibration-profile.js';
import {
  PROJECTION_BAKE_PROFILE,
  getProjectionBakeProfile,
  validateProjectionBakeProfile
} from './projection-bake-profile.js';
import { ProjectionBakeRuntime } from './projection-bake-runtime.js';

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
const siteAnamorphicFamilyControl = document.querySelector('#site-anamorphic-family-control');
const siteAnamorphicFamilySelect = document.querySelector('#site-anamorphic-family-select');
const siteSceneSelect = document.querySelector('#site-scene-select');
const environmentPresentationControl = document.querySelector('#environment-presentation-control');
const environmentPresentationSelect = document.querySelector('#environment-presentation-select');
const locationsToggleButton = document.querySelector('#locations-toggle-button');
const returnToSiteButton = document.querySelector('#return-to-site-button');
const locationOverlay = document.querySelector('#location-overlay');
const legacyCameraLockButton = document.querySelector('#legacy-camera-lock-button');
const anamorphicCameraResetButton = document.querySelector('#anamorphic-camera-reset-button');
const anamorphicFovControl = document.querySelector('#anamorphic-fov-control');
const anamorphicFovInput = document.querySelector('#anamorphic-fov-input');
const cameraEditor = document.querySelector('#camera-editor');
const cameraEditorTitle = document.querySelector('#camera-editor-title');
const cameraEditorLockState = document.querySelector('#camera-editor-lock-state');
const cameraInputMode = document.querySelector('#camera-input-mode');
const cameraThreeFields = document.querySelector('#camera-three-fields');
const cameraMaxFields = document.querySelector('#camera-max-fields');
const cameraApplyButton = document.querySelector('#camera-apply-button');
const cameraResetViewButton = document.querySelector('#camera-reset-view-button');
const cameraResetLegacyButton = document.querySelector('#camera-reset-legacy-button');
const cameraEditorStatus = document.querySelector('#camera-editor-status');
const projectionPoc = document.querySelector('#projection-poc');
const projectionPocTitle = document.querySelector('#projection-poc-title');
const projectionPocState = document.querySelector('#projection-poc-state');
const projectionPocRun = document.querySelector('#projection-poc-run');
const projectionMaskEnabled = document.querySelector('#projection-mask-enabled');
const projectionMaskState = document.querySelector('#projection-mask-state');
const projectionPocMetrics = document.querySelector('#projection-poc-metrics');
const projectionPocMessage = document.querySelector('#projection-poc-message');
const projectionPocSaveButtons = [...document.querySelectorAll('[data-projection-export]')];
const projectionPhotoshopButtons = [...document.querySelectorAll('[data-photoshop-output]')];
const projectionSourceDocument = document.querySelector('#projection-source-document');
const projectionBakeTarget = document.querySelector('#projection-bake-target');
const projectionPhotoshopState = document.querySelector('#projection-photoshop-state');
const projectionPreviewCanvases = {
  source: document.querySelector('#projection-source-preview'),
  direct: document.querySelector('#projection-direct-preview'),
  bake: document.querySelector('#projection-bake-preview'),
  reproject: document.querySelector('#projection-reproject-preview')
};
let projectionPngExporting = false;
const cameraThreeInputs = {
  position: {
    x: document.querySelector('#camera-three-position-x'),
    y: document.querySelector('#camera-three-position-y'),
    z: document.querySelector('#camera-three-position-z')
  },
  rotation: {
    x: document.querySelector('#camera-three-rotation-x'),
    y: document.querySelector('#camera-three-rotation-y'),
    z: document.querySelector('#camera-three-rotation-z')
  },
  fov: document.querySelector('#camera-three-fov')
};
const cameraMaxInputs = {
  position: {
    x: document.querySelector('#camera-max-position-x'),
    y: document.querySelector('#camera-max-position-y'),
    z: document.querySelector('#camera-max-position-z')
  },
  target: {
    x: document.querySelector('#camera-max-target-x'),
    y: document.querySelector('#camera-max-target-y'),
    z: document.querySelector('#camera-max-target-z')
  },
  fov: document.querySelector('#camera-max-fov'),
  fovBasis: document.querySelector('#camera-max-fov-basis')
};
const fitButton = document.querySelector('#fit-button');
const oneButton = document.querySelector('#one-button');
const twoButton = document.querySelector('#two-button');
const fourButton = document.querySelector('#four-button');
const DEFAULT_ACTIVE_VIEW = 'site-3d';

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  alpha: true,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: true
});
renderer.setClearColor(0x090a0d, 1);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.autoClear = false;
const projectionBakeRuntime = new ProjectionBakeRuntime(renderer);

const gl = renderer.getContext();
const scene = new THREE.Scene();
const scene3d = new THREE.Scene();
const sceneSite = new THREE.Scene();
const scenePhoto = new THREE.Scene();
const environmentHemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
const environmentDirectionalLight = new THREE.DirectionalLight(0xffffff, 1);
environmentDirectionalLight.position.set(8, 16, 12);
sceneSite.add(environmentHemisphereLight, environmentDirectionalLight);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
camera.position.z = 1;
const camera3d = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
camera3d.position.set(0, 0, 3);
const cameraSite = new THREE.PerspectiveCamera(45, 1, 0.01, 10000);
cameraSite.position.set(7, 6, 11);
const cameraPhoto = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
cameraPhoto.position.z = 1;
const photoPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.MeshBasicMaterial({ toneMapped: false, depthTest: false, depthWrite: false })
);
scenePhoto.add(photoPlane);
const raycaster = new THREE.Raycaster();
const controls3d = new OrbitControls(camera3d, canvas);
const controlsSite = new OrbitControls(cameraSite, canvas);
const CAMERA_RUNTIME_POSITION_EPSILON = 1e-9;
const CAMERA_RUNTIME_ROTATION_EPSILON = 1e-7;
const CAMERA_FORWARD_ANGLE_EPSILON = 2e-7;
const ANAMORPHIC_CALIBRATION_MATTE_COLOR = 0x20242c;
const ANAMORPHIC_CALIBRATION_MATTE_HEX = '#20242c';

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
  activeView: DEFAULT_ACTIVE_VIEW,
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
  projectionBake: {
    status: 'READY',
    running: false,
    result: null,
    error: '',
    maskEnabledByFamily: {
      [ANAMORPHIC_FAMILY_IDS.FRONT_75F]: false,
      [ANAMORPHIC_FAMILY_IDS.BACK]: false
    },
    userValidation: 'PASS_CLOSED',
    block6AFrontValidation: 'PASS_CLOSED'
  },
  reverseBake: {
    nextJobId: 1,
    state: 'IDLE',
    activeJobId: null,
    pending: null,
    target: null,
    lastApplied: null,
    lastError: ''
  },
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
  photo: {
    status: 'INACTIVE',
    sceneId: null,
    requestedSceneId: null,
    runtimeUrl: null,
    contentRect: null,
    activeResource: null,
    activationPromise: null,
    loadCount: 0,
    commitCount: 0,
    disposeCount: 0,
    error: ''
  },
  environment: {
    status: 'LOADING',
    error: '',
    root: null,
    meshes: [],
    visibleMeshes: [],
    excludedMeshes: [],
    unmatchedExclusions: [],
    presentation: SITE_ENVIRONMENT_PROFILE.defaultPresentation,
    loadCount: 0,
    sourceMaterialsDisposed: 0,
    sourceTexturesDisposed: 0,
    runtimeUrl: SITE_ENVIRONMENT_PROFILE.asset.runtimeUrl
  },
  locations: {
    visible: LOCATION_RECORDS.every((record) => record.marker.visibleByDefault),
    elements: new Map(),
    projections: new Map(),
    navigationStatus: 'IDLE',
    activeLocationId: null,
    lastResult: null,
    lastError: ''
  },
  site: {
    status: 'LOADING',
    error: '',
    roots: {},
    meshesByWorld: {},
    meshes: [],
    bindings: [],
    activeBindings: [],
    missingMeshes: [],
    world: 'world3d',
    mappingMode: 'normal',
    anamorphicFamily: 'front75f',
    anamorphicCameraMode: 'CALIBRATION',
    scene: 'front',
    legacyCameraLocked: true,
    surfaceSetAvailable: false,
    cameraRecords: createEditableCameraRecords().map((record) => ({
      ...record,
      runtimeTarget: null,
      lastInput: { mode: CAMERA_INPUT_MODES.THREE_DIRECT }
    })),
    cameraEditor: {
      inputMode: CAMERA_INPUT_MODES.THREE_DIRECT,
      lastAction: 'Legacy baseline loaded.',
      error: ''
    }
  }
};

const pointerQueue = new LatestWinsPointerQueue((command) => sendLinkMessage(command));

function photoSceneForLegacySelection() {
  if (state.site.world !== 'legacy2d' || state.site.mappingMode !== 'normal') return null;
  const legacyScene = SITE_SCENE_PROFILE.worlds.legacy2d.normalScenes
    .find((candidate) => candidate.id === state.site.scene);
  if (!legacyScene) return null;
  return PHOTO_SCENE_RECORDS.find((record) => record.sceneId === legacyScene.label.toUpperCase()) ?? null;
}

function isPhotoSceneContext() {
  return state.site.world === 'legacy2d' && state.site.mappingMode === 'normal';
}

function isPhotoViewportActive() {
  const selected = photoSceneForLegacySelection();
  return state.activeView === 'site-3d' && Boolean(selected) &&
    state.photo.status === 'READY' && state.photo.sceneId === selected.sceneId;
}

function updatePhotoContentRect() {
  const width = Math.max(1, viewer.clientWidth);
  const height = Math.max(1, viewer.clientHeight);
  const rect = computeContainedAspectRect(width, height, PHOTO_CONTENT_ASPECT);
  state.photo.contentRect = rect;
}

function createPhotoImageResource(record) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const runtimeUrl = new URL(record.photoAsset.runtimeUrl, import.meta.url).href;
    image.className = 'photo-background-image';
    image.alt = '';
    image.decoding = 'async';
    image.onload = () => {
      state.photo.loadCount += 1;
      const texture = new THREE.Texture(image);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.generateMipmaps = false;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
      resolve({
        image,
        texture,
        runtimeUrl,
        width: image.naturalWidth,
        height: image.naturalHeight,
        dispose() {
          texture.dispose();
          image.removeAttribute('src');
          state.photo.disposeCount += 1;
        }
      });
    };
    image.onerror = () => reject(new Error(`Photo unavailable: ${record.photoAsset.runtimeUrl}`));
    image.src = runtimeUrl;
  });
}

const photoController = new LatestWinsPhotoSceneController({
  load: (record) => createPhotoImageResource(record),
  validate: (record, resource) => {
    if (resource.width !== record.photoAsset.nativeWidth || resource.height !== record.photoAsset.nativeHeight) {
      throw new Error(`Photo dimensions do not match the contract for ${record.sceneId}.`);
    }
  },
  clear: () => {
    photoPlane.material.map = null;
    photoPlane.material.needsUpdate = true;
    state.photo.activeResource = null;
    state.photo.sceneId = null;
    state.photo.runtimeUrl = null;
  },
  commit: ({ record, resource }) => {
    state.photo.activeResource = resource;
    state.photo.sceneId = record.sceneId;
    state.photo.runtimeUrl = record.photoAsset.runtimeUrl;
    state.photo.status = 'READY';
    state.photo.error = '';
    state.photo.commitCount += 1;
    photoPlane.material.map = resource.texture;
    photoPlane.material.needsUpdate = true;
    if (isPhotoSceneContext() && photoSceneForLegacySelection()?.sceneId === record.sceneId) {
      for (const binding of state.site.activeBindings) binding.mesh.visible = true;
    }
    updatePhotoContentRect();
    updatePointerControls();
    render();
    updateDiagnostics();
  },
  fail: ({ record, error }) => {
    state.photo.status = 'UNAVAILABLE';
    state.photo.requestedSceneId = record.sceneId;
    state.photo.error = error.stack || error.message;
    updatePhotoContentRect();
    updatePointerControls();
    render();
    updateDiagnostics();
  }
});

function deactivatePhotoScene(reason = 'context-change') {
  photoController.cancel(reason);
  state.photo.status = 'INACTIVE';
  state.photo.requestedSceneId = null;
  state.photo.error = '';
  updatePhotoContentRect();
}

function activatePhotoScene(record) {
  state.photo.status = 'LOADING';
  state.photo.requestedSceneId = record.sceneId;
  state.photo.error = '';
  const activation = photoController.activate(record);
  state.photo.activationPromise = activation;
  return activation;
}

function locationRecordById(locationId) {
  return LOCATION_RECORDS.find((record) => record.locationId === locationId) ?? null;
}

function legacySceneIdForPhotoScene(photoSceneId) {
  const scene = SITE_SCENE_PROFILE.worlds.legacy2d.normalScenes
    .find((candidate) => candidate.label.toUpperCase() === photoSceneId);
  return scene?.id ?? null;
}

function isLocationMarkerContext() {
  return state.activeView === 'site-3d' && state.site.world === 'world3d' &&
    state.site.mappingMode === 'normal' && state.locations.visible;
}

function captureSiteReturnState() {
  if (!isLocationMarkerContext()) throw new Error('Location navigation requires SITE 3D / 3D WORLD / NORMAL.');
  return createSiteReturnSnapshot({
    activeView: state.activeView,
    siteWorldMode: state.site.world,
    mappingMode: state.site.mappingMode,
    camera: cameraSite,
    orbitTarget: controlsSite.target,
    environmentLightingMode: state.environment.presentation,
    markerVisibility: state.locations.visible
  });
}

function capturePhotoReturnRecoveryState() {
  return {
    activeView: state.activeView,
    world: state.site.world,
    mappingMode: state.site.mappingMode,
    scene: state.site.scene,
    camera: snapshotSiteCameraRuntime(),
    legacyCameraLocked: state.site.legacyCameraLocked
  };
}

async function activatePhotoForLocation(record, photoScene) {
  const sceneId = legacySceneIdForPhotoScene(photoScene.sceneId);
  if (!sceneId) return { status: 'UNAVAILABLE', error: new Error(`No Legacy scene for ${photoScene.sceneId}.`) };
  state.site.world = 'legacy2d';
  state.site.mappingMode = 'normal';
  state.site.scene = sceneId;
  siteWorldSelect.value = state.site.world;
  siteMappingSelect.value = state.site.mappingMode;
  siteSceneSelect.value = state.site.scene;
  lockLegacyCamera();
  applySiteSurfaceSelection({ resetCamera: false });
  return state.photo.activationPromise;
}

async function commitLocationPhoto(record) {
  if (photoSceneForLegacySelection()?.sceneId !== record.photoSceneId || !isPhotoViewportActive()) {
    throw new Error(`Location PhotoScene commit mismatch for ${record.locationId}.`);
  }
  applyCurrentCameraRecordToRuntime();
  lockLegacyCamera();
  state.locations.activeLocationId = record.locationId;
  render();
}

async function restoreSiteReturnState(snapshot) {
  if (!snapshot || snapshot.viewMode !== 'site-3d' || snapshot.siteWorldMode !== 'world3d' || snapshot.mappingMode !== 'normal') {
    throw new Error('SiteReturnSnapshot is incomplete or outside the Block 4E Site contract.');
  }
  state.site.world = snapshot.siteWorldMode;
  state.site.mappingMode = snapshot.mappingMode;
  siteWorldSelect.value = state.site.world;
  siteMappingSelect.value = state.site.mappingMode;
  state.environment.presentation = snapshot.environmentLightingMode;
  environmentPresentationSelect.value = state.environment.presentation;
  state.locations.visible = snapshot.markerVisibility;
  setActiveView(snapshot.viewMode);
  applyEnvironmentPresentation();
  applySiteSurfaceSelection({ resetCamera: false });
  restoreCameraFromSiteSnapshot(snapshot, cameraSite, controlsSite.target);
  controlsSite.update();
  restoreCameraFromSiteSnapshot(snapshot, cameraSite, controlsSite.target);
  state.locations.activeLocationId = null;
  syncLocationControls();
  render();
  updateDiagnostics();
}

async function restorePhotoRecoveryState(snapshot) {
  if (!snapshot) return;
  state.site.world = snapshot.world;
  state.site.mappingMode = snapshot.mappingMode;
  state.site.scene = snapshot.scene;
  siteWorldSelect.value = state.site.world;
  siteMappingSelect.value = state.site.mappingMode;
  siteSceneSelect.value = state.site.scene;
  setActiveView(snapshot.activeView);
  applySiteSurfaceSelection({ resetCamera: false });
  if (state.photo.activationPromise) await state.photo.activationPromise;
  restoreSiteCameraRuntime(snapshot.camera);
  state.site.legacyCameraLocked = snapshot.legacyCameraLocked;
  syncSiteCameraControls();
  render();
}

const locationNavigation = new LatestWinsLocationNavigation({
  validate: (record) => validateLocationRecord(record, PHOTO_SCENE_RECORDS),
  captureSite: captureSiteReturnState,
  activatePhoto: activatePhotoForLocation,
  commitPhoto: commitLocationPhoto,
  restoreSite: restoreSiteReturnState,
  capturePhoto: capturePhotoReturnRecoveryState,
  restorePhoto: restorePhotoRecoveryState
});

function initializeLocationMarkers() {
  locationOverlay.replaceChildren();
  state.locations.elements.clear();
  for (const record of LOCATION_RECORDS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'location-anchor';
    button.dataset.locationId = record.locationId;
    button.setAttribute('aria-label', `Open ${record.photoSceneId} photo location`);
    const builtPhoto = state.manifest.photoAssets.find((candidate) => candidate.sceneId === record.photoSceneId);
    const thumbnail = builtPhoto?.thumbnail;
    if (thumbnail?.status === 'READY' && thumbnail.runtimeUrl) {
      const image = document.createElement('img');
      image.className = 'location-thumbnail';
      image.alt = '';
      image.decoding = 'async';
      image.src = new URL(thumbnail.runtimeUrl, import.meta.url).href;
      image.addEventListener('error', () => {
        image.replaceWith(Object.assign(document.createElement('span'), { className: 'location-thumbnail-placeholder' }));
        updateDiagnostics();
      }, { once: true });
      button.append(image);
    } else {
      const placeholder = document.createElement('span');
      placeholder.className = 'location-thumbnail-placeholder';
      placeholder.setAttribute('aria-hidden', 'true');
      button.append(placeholder);
    }
    const pin = document.createElement('span');
    pin.className = 'location-pin';
    pin.setAttribute('aria-hidden', 'true');
    button.append(pin);
    button.addEventListener('click', () => { void activateLocation(record.locationId); });
    locationOverlay.append(button);
    state.locations.elements.set(record.locationId, button);
  }
  updateLocationMarkers();
}

function updateLocationMarkers() {
  const contextVisible = isLocationMarkerContext();
  const viewport = { width: Math.max(1, viewer.clientWidth), height: Math.max(1, viewer.clientHeight) };
  state.locations.projections.clear();
  for (const record of LOCATION_RECORDS) {
    const element = state.locations.elements.get(record.locationId);
    if (!element) continue;
    const projection = contextVisible
      ? projectLocationToViewport(record.worldPosition, cameraSite, viewport, {
        x: record.marker.uiOffsetX,
        y: record.marker.uiOffsetY
      })
      : { visible: false, reason: 'CONTEXT_HIDDEN' };
    state.locations.projections.set(record.locationId, projection);
    element.hidden = !projection.visible;
    element.style.left = projection.visible ? `${projection.x}px` : '';
    element.style.top = projection.visible ? `${projection.y}px` : '';
    const interactive = projection.visible && state.interactionMode === 'navigate';
    element.classList.toggle('point-pass-through', !interactive);
    element.tabIndex = interactive ? 0 : -1;
    element.setAttribute('aria-disabled', String(!interactive));
  }
}

function syncLocationControls() {
  const markerScope = state.activeView === 'site-3d' && state.site.world === 'world3d' && state.site.mappingMode === 'normal';
  locationsToggleButton.hidden = !markerScope;
  locationsToggleButton.textContent = state.locations.visible ? 'LOCATIONS ON' : 'LOCATIONS OFF';
  locationsToggleButton.setAttribute('aria-pressed', String(state.locations.visible));
  locationsToggleButton.classList.toggle('active', state.locations.visible);
  const returnAvailable = Boolean(locationNavigation.siteSnapshot) && state.activeView === 'site-3d' && isPhotoSceneContext();
  returnToSiteButton.hidden = !returnAvailable;
  returnToSiteButton.disabled = state.locations.navigationStatus === 'BUSY';
  updateLocationMarkers();
}

async function activateLocation(locationId) {
  const record = locationRecordById(locationId);
  const rapidFollowupAllowed = state.locations.navigationStatus === 'BUSY' && Boolean(locationNavigation.siteSnapshot);
  if (!record || state.interactionMode !== 'navigate' || (!isLocationMarkerContext() && !rapidFollowupAllowed)) {
    return { status: 'REJECTED' };
  }
  state.locations.navigationStatus = 'BUSY';
  state.locations.lastError = '';
  syncLocationControls();
  try {
    const result = await locationNavigation.activate(record);
    if (result.token === locationNavigation.requestToken) {
      state.locations.lastResult = result.status;
      state.locations.navigationStatus = result.status === 'READY' ? 'PHOTO_READY' : 'IDLE';
      if (result.error) state.locations.lastError = result.error.message;
    }
    return result;
  } catch (error) {
    state.locations.navigationStatus = 'ERROR';
    state.locations.lastError = error.stack || error.message;
    return { status: 'ERROR', error };
  } finally {
    syncLocationControls();
    render();
    updateDiagnostics();
  }
}

async function returnToSite() {
  if (!locationNavigation.siteSnapshot) return { status: 'NO_SNAPSHOT' };
  state.locations.navigationStatus = 'BUSY';
  syncLocationControls();
  const result = await locationNavigation.returnToSite();
  state.locations.lastResult = result.status;
  state.locations.navigationStatus = result.status === 'RETURN_FAILED' ? 'ERROR' : 'IDLE';
  state.locations.lastError = result.error?.message || '';
  syncLocationControls();
  render();
  updateDiagnostics();
  return result;
}

function wire3dControlEvents(controls, view) {
  controls.addEventListener('start', () => {
    if (state.activeView === view) canvas.classList.add('dragging');
    if (view === 'site-3d' && isAnamorphicCalibrationContext()) markAnamorphicFreePreview();
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
  updatePhotoContentRect();
  camera.left = -width / 2;
  camera.right = width / 2;
  camera.top = height / 2;
  camera.bottom = -height / 2;
  camera.updateProjectionMatrix();
  camera3d.aspect = width / height;
  camera3d.updateProjectionMatrix();
  const legacyRecord = currentLegacyCameraRecord();
  cameraSite.aspect = isAnamorphicCalibrationFramingActive()
    ? currentAnamorphicFamily().cameraProfile.runtimeAspect
    : (isLegacyCameraContext() && legacyRecord ? legacyRecord.currentValues.aspect : width / height);
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
    if (!binding.textureEligible) continue;
    binding.mesh.material.map = texture;
    binding.mesh.material.needsUpdate = true;
  }
}

function selectedSiteContract() {
  const world = SITE_SCENE_PROFILE.worlds[state.site.world];
  if (state.site.mappingMode === 'anamorphic') {
    const family = currentAnamorphicFamily();
    return {
      contracts: state.site.world === 'world3d' && family?.available ? family.surfaces : null,
      camera: family?.cameraProfile ?? null,
      photoScene: null,
      assetId: family?.assetId ?? null,
      pointEnabled: false,
      label: family?.available ? `ANAMORPHIC / ${family.label}` : 'ANAMORPHIC / NOT AVAILABLE'
    };
  }
  if (state.site.world === 'world3d') {
    return { contracts: world.normalSurfaces, camera: null, photoScene: null, assetId: 'world3d', pointEnabled: true, label: '3D WORLD / NORMAL' };
  }
  const sceneContract = world.normalScenes.find((candidate) => candidate.id === state.site.scene) || world.normalScenes[0];
  return {
    contracts: sceneContract.surfaces,
    camera: sceneContract.camera,
    photoScene: PHOTO_SCENE_RECORDS.find((record) => record.sceneId === sceneContract.label.toUpperCase()) ?? null,
    assetId: 'legacy2d',
    pointEnabled: true,
    label: `LEGACY 2D WORLD / ${sceneContract.label}`
  };
}

function currentAnamorphicFamily() {
  return SITE_SCENE_PROFILE.worlds.world3d.anamorphicFamilies[state.site.anamorphicFamily] ?? null;
}

function anamorphicFamilyForAsset(assetId) {
  return Object.values(SITE_SCENE_PROFILE.worlds.world3d.anamorphicFamilies)
    .find((family) => family.available && family.assetId === assetId) ?? null;
}

function isAnamorphicCalibrationContext() {
  return state.activeView === 'site-3d' && state.site.world === 'world3d' &&
    state.site.mappingMode === 'anamorphic' && currentAnamorphicFamily()?.available === true;
}

function isAnamorphicCalibrationFramingActive() {
  return isAnamorphicCalibrationContext() && state.site.anamorphicCameraMode !== 'FREE_PREVIEW';
}

function selectedSiteAssetId() {
  return selectedSiteContract().assetId ?? state.site.world;
}

function syncAnamorphicControls() {
  const familyContext = state.activeView === 'site-3d' && state.site.world === 'world3d' &&
    state.site.mappingMode === 'anamorphic';
  siteAnamorphicFamilyControl.hidden = !familyContext;
  siteAnamorphicFamilySelect.disabled = !familyContext;
  anamorphicCameraResetButton.hidden = !isAnamorphicCalibrationContext();
  anamorphicCameraResetButton.disabled = !isAnamorphicCalibrationContext() || !state.site.surfaceSetAvailable;
  anamorphicFovControl.hidden = !isAnamorphicCalibrationFramingActive();
  anamorphicFovInput.disabled = !isAnamorphicCalibrationFramingActive() || !state.site.surfaceSetAvailable;
  const calibrationLabel = currentAnamorphicFamily()?.label ?? 'ANAMORPHIC';
  anamorphicCameraResetButton.textContent = state.site.anamorphicCameraMode === 'CALIBRATION'
    ? `${calibrationLabel} CALIBRATION`
    : `RETURN TO ${calibrationLabel} CALIBRATION`;
  anamorphicCameraResetButton.classList.toggle('locked', state.site.anamorphicCameraMode === 'CALIBRATION');
  anamorphicCameraResetButton.classList.toggle('unlocked', state.site.anamorphicCameraMode !== 'CALIBRATION');
  syncProjectionPocUi();
}

function isProjectionPocContext() {
  const profile = currentProjectionBakeProfile();
  return Boolean(isAnamorphicCalibrationFramingActive() && profile && state.site.surfaceSetAvailable &&
    state.site.activeBindings.some((binding) => binding.mesh.name === profile.surfaceBinding.exactName));
}

function currentProjectionBakeProfile() {
  return getProjectionBakeProfile(currentAnamorphicFamily()?.familyId);
}

function isProjectionMaskEnabled(profile = currentProjectionBakeProfile()) {
  return Boolean(profile && state.projectionBake.maskEnabledByFamily[profile.familyId]);
}

function clearProjectionPreviews() {
  for (const canvasElement of Object.values(projectionPreviewCanvases)) {
    const context = canvasElement.getContext('2d');
    context?.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasElement.width = 1;
    canvasElement.height = 1;
  }
}

function releaseProjectionBakeResources(reason = 'context-change') {
  projectionBakeRuntime.dispose();
  state.projectionBake.status = 'READY';
  state.projectionBake.running = false;
  state.projectionBake.result = null;
  state.projectionBake.error = '';
  state.projectionBake.releaseReason = reason;
  clearProjectionPreviews();
  window.block6AProjectionDiagnostics = {
    status: state.projectionBake.status,
    userValidation: state.projectionBake.userValidation,
    releaseReason: reason
  };
  window.block6BProjectionDiagnostics = window.block6AProjectionDiagnostics;
}

function syncProjectionPocUi() {
  const available = isProjectionPocContext();
  const profile = currentProjectionBakeProfile();
  const maskEnabled = isProjectionMaskEnabled(profile);
  const hasOutputs = available && projectionBakeRuntime.hasOutputs() &&
    projectionBakeRuntime.resources?.profileId === profile?.id;
  projectionPocTitle.textContent = `PROJECTION POC — ${profile?.label || 'CURRENT FAMILY'}`;
  projectionPoc.hidden = !available;
  projectionPocRun.disabled = !available || state.projectionBake.running || projectionPngExporting;
  projectionMaskEnabled.checked = maskEnabled;
  projectionMaskEnabled.disabled = !available || state.projectionBake.running || projectionPngExporting || state.reverseBake.activeJobId !== null;
  projectionMaskState.textContent = maskEnabled ? 'ON · PRODUCTION' : 'OFF · FULL SURFACE';
  projectionMaskEnabled.closest('.projection-mask-toggle')?.classList.toggle('mask-on', maskEnabled);
  for (const button of projectionPocSaveButtons) {
    button.disabled = !hasOutputs || state.projectionBake.running || projectionPngExporting;
  }
  const reverseBusy = state.reverseBake.activeJobId !== null;
  for (const button of projectionPhotoshopButtons) {
    button.disabled = !hasOutputs || !state.link.rendererHandshake || !state.link.photoshopConnected ||
      !state.reverseBake.target || state.reverseBake.target.status !== 'READY' || reverseBusy ||
      state.projectionBake.running || projectionPngExporting;
  }
  const source = state.link.lastFrame;
  if (projectionSourceDocument) projectionSourceDocument.textContent = source
    ? `${source.documentName} · ID ${source.documentId} · ${source.width} × ${source.height}`
    : 'No Photoshop source frame received';
  if (projectionBakeTarget) {
    const target = state.reverseBake.target;
    projectionBakeTarget.textContent = target
      ? `${target.documentName} · ID ${target.documentId} · ${target.width} × ${target.height} · ${target.status}`
      : 'Not set in Photoshop';
  }
  if (projectionPhotoshopState) projectionPhotoshopState.textContent = state.reverseBake.lastError ||
    (state.reverseBake.lastApplied ? `PHOTOSHOP APPLY COMPLETE · Job ${state.reverseBake.lastApplied.jobId} · Layer ${state.reverseBake.lastApplied.layerId}` : state.reverseBake.state);
  const busy = state.projectionBake.running || projectionPngExporting || reverseBusy;
  projectionPocState.textContent = projectionPngExporting ? 'EXPORTING' : (state.projectionBake.running ? 'RUNNING' : state.projectionBake.status);
  projectionPocState.className = `projection-poc-state${busy ? ' running' : ''}${state.projectionBake.status === 'ERROR' ? ' fail' : ''}`;
}

function waitForPhotoshopBakeApply(jobId) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      if (state.reverseBake.pending?.jobId === jobId) {
        state.reverseBake.pending = null;
        reject(new Error(`BAKE_APPLIED timeout for job ${jobId}.`));
      }
    }, liveLinkConfig.ackTimeoutMs);
    state.reverseBake.pending = { jobId, resolve, reject, timer };
  });
}

async function waitForLinkBackpressure(limit) {
  while (state.link.socket?.readyState === WebSocket.OPEN && state.link.socket.bufferedAmount > limit) {
    await new Promise((resolve) => window.setTimeout(resolve, 12));
  }
  if (state.link.socket?.readyState !== WebSocket.OPEN) throw new Error('Connection closed during Photoshop bake transfer.');
}

async function sendProjectionToPhotoshop(outputKind) {
  if (state.reverseBake.activeJobId !== null) throw new Error('BAKE_BUSY: A full-image Photoshop write is already in progress.');
  if (!state.link.rendererHandshake || !state.link.photoshopConnected) throw new Error('UXP_DISCONNECTED: Photoshop UXP is not connected.');
  if (!state.reverseBake.target || state.reverseBake.target.status !== 'READY') throw new Error('TARGET_NOT_SET: Set an active Photoshop document as Bake Target first.');
  const output = projectionBakeRuntime.readOutputRgba(outputKind);
  const target = state.reverseBake.target;
  if (target.width !== output.width || target.height !== output.height) {
    throw new Error(`TARGET_DIMENSION_MISMATCH: ${output.outputKind} requires ${output.width} × ${output.height}; target is ${target.width} × ${target.height}.`);
  }
  if (target.documentMode !== 'RGB' || target.documentDepth !== 8) throw new Error('TARGET_UNSUPPORTED: Block 7 requires an RGB 8-bit Photoshop document.');
  const jobId = state.reverseBake.nextJobId++;
  const chunkSize = liveLinkConfig.chunkSizeBytes;
  const chunkCount = Math.ceil(output.bytes.byteLength / chunkSize);
  const metadata = {
    type: 'BAKE_BEGIN', jobId, familyId: output.familyId, outputKind: output.outputKind,
    outputId: `${output.familyId}:${output.outputKind}`, targetDocumentId: target.documentId,
    width: output.width, height: output.height, components: output.components, componentSize: output.componentSize,
    pixelFormat: output.pixelFormat, colorSpace: output.colorSpace, alpha: output.alpha, orientation: output.orientation,
    totalBytes: output.bytes.byteLength, chunkSize, chunkCount, requestedAtEpochMs: Date.now()
  };
  state.reverseBake.activeJobId = jobId;
  state.reverseBake.state = 'REQUESTED';
  state.reverseBake.lastError = '';
  projectionPocMessage.className = 'projection-poc-message';
  projectionPocMessage.textContent = `${output.outputKind} ${output.width} × ${output.height} raw RGBA8 → Photoshop target ${target.documentName}.`;
  syncProjectionPocUi();
  const completion = waitForPhotoshopBakeApply(jobId);
  try {
    if (!sendLinkMessage(metadata)) throw new Error('BROKER_DISCONNECTED: Could not begin Photoshop bake.');
    state.reverseBake.state = 'TRANSFERRING';
    for (let chunkIndex = 0, offset = 0; offset < output.bytes.byteLength; chunkIndex += 1, offset += chunkSize) {
      const chunk = output.bytes.subarray(offset, Math.min(offset + chunkSize, output.bytes.byteLength));
      await waitForLinkBackpressure(liveLinkConfig.backpressureHighWaterMarkBytes);
      sendLinkMessage({ type: 'BAKE_CHUNK', jobId, chunkIndex, byteLength: chunk.byteLength });
      state.link.socket.send(chunk);
    }
    await waitForLinkBackpressure(chunkSize);
    sendLinkMessage({ type: 'BAKE_END', jobId, receivedBytes: output.bytes.byteLength, receivedChunks: chunkCount });
    const applied = await completion;
    state.reverseBake.lastApplied = applied;
    state.reverseBake.state = 'APPLIED';
    projectionPocMessage.className = 'projection-poc-message pass';
    projectionPocMessage.textContent = `PHOTOSHOP APPLY COMPLETE · ${output.outputKind} · ${output.width} × ${output.height} · Layer ${applied.layerId}.`;
    return { metadata, applied };
  } catch (error) {
    if (state.reverseBake.pending?.jobId === jobId) {
      window.clearTimeout(state.reverseBake.pending.timer);
      state.reverseBake.pending = null;
    }
    state.reverseBake.state = /TARGET/.test(error.message) ? 'TARGET_ERROR' : (/APPLY/.test(error.message) ? 'APPLY_ERROR' : 'TRANSFER_ERROR');
    state.reverseBake.lastError = error.message || String(error);
    projectionPocMessage.className = 'projection-poc-message fail';
    projectionPocMessage.textContent = state.reverseBake.lastError;
    throw error;
  } finally {
    state.reverseBake.activeJobId = null;
    syncProjectionPocUi();
    updateDiagnostics();
  }
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function saveProjectionPng(kind) {
  if (projectionPngExporting) return;
  projectionPngExporting = true;
  projectionPocMessage.className = 'projection-poc-message';
  projectionPocMessage.textContent = `Encoding full-resolution ${kind.toUpperCase()} PNG. This may take a moment.`;
  syncProjectionPocUi();
  try {
    const exported = await projectionBakeRuntime.exportPng(kind);
    downloadBlob(exported.blob, exported.fileName);
    projectionPocMessage.className = 'projection-poc-message pass';
    projectionPocMessage.textContent = `${exported.fileName} (${exported.width} × ${exported.height}) download started.`;
    return exported;
  } catch (error) {
    projectionPocMessage.className = 'projection-poc-message fail';
    projectionPocMessage.textContent = error.message;
    throw error;
  } finally {
    projectionPngExporting = false;
    syncProjectionPocUi();
  }
}

function updateProjectionPocMetrics(result) {
  const profile = currentProjectionBakeProfile();
  const metricText = (metric) => metric
    ? `${metric.mae?.toFixed(3) ?? '—'} / ${metric.rmse?.toFixed(3) ?? '—'} / p95 ${metric.p95 ?? '—'}`
    : '—';
  const rows = result ? [
    ['Camera', `${result.camera.fov.toFixed(3)}° / ${result.camera.aspect.toFixed(6)}`],
    ['Working', `${result.sourceWidth} × ${result.sourceHeight}`],
    ['Direct', `${result.directWidth} × ${result.directHeight}`],
    ['Bake Texture', `${result.bakeWidth} × ${result.bakeHeight} RGBA`],
    ['Reproject', `${result.reprojectWidth} × ${result.reprojectHeight}`],
    ['Visibility', result.visibility.dedicatedMatteDepthIncluded ? `${result.visibility.method} + DEDICATED MATTE` : result.visibility.method],
    ['Silhouette IoU', result.visibilityAgreement.silhouetteIou.toFixed(6)],
    ['Hidden Candidates', result.visibilityDiagnostic.occludedPixelCount.toLocaleString()],
    ['Mask', result.mask.status],
    ['Valid Pixels', result.validCanonicalPixelCount.toLocaleString()],
    ['Coverage', `${(result.canonicalCoverage * 100).toFixed(3)}%`],
    ['Source / Direct', metricText(result.sourceVsDirect)],
    ['Direct / Reproject', metricText(result.directVsCanonicalReprojected)],
    ['Source / Reproject', metricText(result.sourceVsCanonicalReprojected)],
    ['Runs / Resources', `${result.resourcePolicy.runCount} / ${result.resourcePolicy.stableAcrossRuns ? 'STABLE' : 'CHECK'}`],
    ['Preview Display', 'FIT']
  ] : [
    ['Camera', `${profile?.label || 'FAMILY'} APPROVED`],
    ['Working', profile ? `${profile.workingResolution.width} × ${profile.workingResolution.height}` : '—'],
    ['Direct', profile ? `${profile.workingResolution.width} × ${profile.workingResolution.height}` : '—'],
    ['Bake Texture', '4728 × 5760 RGBA'],
    ['Mask', profile
      ? (isProjectionMaskEnabled(profile) ? `${profile.productionMask.status} · ON` : 'OFF · FULL SURFACE')
      : '—'],
    ['Preview Display', 'FIT']
  ];
  projectionPocMetrics.replaceChildren();
  for (const [label, value] of rows) {
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = label;
    detail.textContent = value;
    projectionPocMetrics.append(term, detail);
  }
}

async function loadProjectionBakeMatte(profile) {
  const contract = profile.validity.occluderBinding;
  const loader = new GLTFLoader();
  const runtimeUrl = new URL(contract.runtimeUrl, import.meta.url).href;
  const gltf = await loader.loadAsync(runtimeUrl);
  const meshes = [];
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((child) => {
    if (!child.isMesh) return;
    if (contract.exactNames.includes(child.name)) meshes.push(child);
    if (child.geometry) geometries.add(child.geometry);
    const childMaterials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of childMaterials) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  const receivedNames = meshes.map((mesh) => mesh.name);
  const allRenderableNames = [];
  gltf.scene.traverse((child) => { if (child.isMesh) allRenderableNames.push(child.name); });
  const exactMatch = receivedNames.length === contract.exactNames.length &&
    contract.exactNames.every((name) => receivedNames.includes(name)) &&
    allRenderableNames.length === receivedNames.length;
  const transformsFinite = meshes.every((mesh) => mesh.matrixWorld.elements.every(Number.isFinite));
  if (!exactMatch || !transformsFinite || meshes.some((mesh) => !mesh.geometry)) {
    for (const texture of textures) texture.dispose();
    for (const material of materials) material.dispose();
    for (const geometry of geometries) geometry.dispose();
    throw new Error(`Projection Bake dedicated matte binding mismatch: expected ${contract.exactNames.join(', ')}; received ${allRenderableNames.join(', ') || 'none'}.`);
  }
  let disposed = false;
  return {
    meshes,
    diagnostics: {
      assetLogicalId: contract.assetLogicalId,
      fileName: contract.fileName,
      runtimeUrl: contract.runtimeUrl,
      nodeNames: receivedNames,
      loadScope: contract.loadScope,
      ordinarySceneAttached: gltf.scene.parent !== null,
      transformsFinite,
      disposedAfterBake: false
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const texture of textures) texture.dispose();
      for (const material of materials) material.dispose();
      for (const geometry of geometries) geometry.dispose();
      gltf.scene.clear();
      this.diagnostics.disposedAfterBake = true;
    }
  };
}

async function runProjectionBake({ repetitions = 1, maskMode = null } = {}) {
  const profile = currentProjectionBakeProfile();
  if (!isProjectionPocContext() || !profile) throw new Error('Block 6B PoC requires an implemented anamorphic family calibration with its exact Surface.');
  const profileValidation = validateProjectionBakeProfile(profile);
  if (!profileValidation.valid) throw new Error(`ProjectionBakeProfile invalid: ${profileValidation.errors.join(', ')}`);
  const requestedMaskMode = maskMode || (isProjectionMaskEnabled(profile) ? 'production' : 'full-white');
  state.projectionBake.running = true;
  state.projectionBake.status = 'RUNNING';
  state.projectionBake.error = '';
  projectionPocMessage.className = 'projection-poc-message';
  projectionPocMessage.textContent = 'Native GPU Bake is running. Large 4728 × 5760 readback may take a moment.';
  syncProjectionPocUi();
  let matteAsset = null;
  try {
    matteAsset = await loadProjectionBakeMatte(profile);
    const result = await projectionBakeRuntime.run({
      profile,
      surfaceMeshes: state.site.activeBindings
        .filter((binding) => binding.mesh.name === profile.surfaceBinding.exactName)
        .map((binding) => binding.mesh),
      occluderMeshes: matteAsset.meshes,
      previewCanvases: projectionPreviewCanvases,
      repetitions,
      maskMode: requestedMaskMode
    });
    matteAsset.dispose();
    result.matteAsset = matteAsset.diagnostics;
    matteAsset = null;
    result.profileValid = profileValidation.valid;
    result.contextLossCount = state.contextLossCount;
    result.userValidation = state.projectionBake.userValidation;
    result.block6AFrontValidation = profile.block6AUserValidation;
    const maxSampleDelta = (sample, target) => Math.max(...sample.source.map((value, index) => Math.abs(value - sample[target][index])));
    const sampleMatchesIfVisible = (sample, target, maximumDelta) =>
      sample[target][3] === 0 || maxSampleDelta(sample, target) <= maximumDelta;
    result.technicalThresholds = {
      canonicalCoverage: requestedMaskMode === 'production' && profile.familyId === ANAMORPHIC_FAMILY_IDS.FRONT_75F
        ? { min: 0.5, max: 0.65 }
        : { min: 0.01, max: 1 },
      visibleScreenPixelCountMin: 100_000,
      maeMax: 1,
      rmseMax: 5,
      silhouetteIouMin: 0.999,
      directOnlyPixelCountMax: 1024,
      reprojectOnlyPixelCountMax: 0,
      centerRgbaDeltaMax: 1,
      alphaRgbaDeltaMax: 1
    };
    const inverseMaskActive = result.mask.exactLinearInversion === true;
    result.maskAdjustedSourceComparison = inverseMaskActive ? 'NOT_APPLICABLE_MASK_INVERTED' : 'SOURCE_EQUIVALENCE_REQUIRED';
    result.roundTripMetricsPass =
      result.canonicalCoverage >= result.technicalThresholds.canonicalCoverage.min &&
      result.canonicalCoverage <= result.technicalThresholds.canonicalCoverage.max &&
      result.visibleScreenPixelCount >= result.technicalThresholds.visibleScreenPixelCountMin &&
      result.directVsCanonicalReprojected.mae <= result.technicalThresholds.maeMax &&
      result.directVsCanonicalReprojected.rmse <= result.technicalThresholds.rmseMax &&
      result.visibilityAgreement.silhouetteIou >= result.technicalThresholds.silhouetteIouMin &&
      result.visibilityAgreement.directOnlyPixelCount <= result.technicalThresholds.directOnlyPixelCountMax &&
      result.visibilityAgreement.reprojectOnlyPixelCount <= result.technicalThresholds.reprojectOnlyPixelCountMax &&
      result.visibilityDiagnostic.occludedPixelCount > 0 &&
      (inverseMaskActive || (
        result.sourceVsDirect.mae <= result.technicalThresholds.maeMax &&
        result.sourceVsDirect.rmse <= result.technicalThresholds.rmseMax &&
        result.sourceVsCanonicalReprojected.mae <= result.technicalThresholds.maeMax &&
        result.sourceVsCanonicalReprojected.rmse <= result.technicalThresholds.rmseMax &&
        sampleMatchesIfVisible(result.centerSample, 'direct', result.technicalThresholds.centerRgbaDeltaMax) &&
        sampleMatchesIfVisible(result.centerSample, 'reprojected', result.technicalThresholds.centerRgbaDeltaMax) &&
        sampleMatchesIfVisible(result.alphaTest, 'direct', result.technicalThresholds.alphaRgbaDeltaMax) &&
        sampleMatchesIfVisible(result.alphaTest, 'reprojected', result.technicalThresholds.alphaRgbaDeltaMax)
      ));
    result.technicalPass = result.profileValid &&
      result.familyId === profile.familyId &&
      result.surfaceNames.length === 1 &&
      result.surfaceNames[0] === profile.surfaceBinding.exactName &&
      result.sourceWidth === profile.workingResolution.width && result.sourceHeight === profile.workingResolution.height &&
      result.directWidth === profile.workingResolution.width && result.directHeight === profile.workingResolution.height &&
      result.bakeWidth === profile.canonicalResolution.width && result.bakeHeight === profile.canonicalResolution.height &&
      result.reprojectWidth === profile.workingResolution.width && result.reprojectHeight === profile.workingResolution.height &&
      result.camera.fov === profile.calibrationCamera.runtimeFov &&
      result.camera.aspect === profile.calibrationCamera.runtimeAspect &&
      (requestedMaskMode === 'production'
        ? result.mask.enabled === true && result.mask.status === profile.productionMask.status && result.mask.scalarOperation === profile.productionMask.scalarOperation
        : result.mask.enabled === false && result.mask.mode === 'full-white') &&
      result.directProjection.sourceTexture === 'ORIGINAL_WORKING_SOURCE' &&
      result.directProjection.canonicalTextureReferenced === false &&
      result.directProjection.environmentIncluded === false &&
      result.directProjection.environmentColorIncluded === false &&
      result.directProjection.matteIncluded === true &&
      result.directProjection.matteScope === 'PROJECTION_BAKE_OFFSCREEN_ONLY' &&
      result.visibility.environmentDepthIncluded === false &&
      result.visibility.dedicatedMatteDepthIncluded === true &&
      result.visibility.method === 'PROJECTION_CAMERA_DEPTH_TEXTURE_FRONTMOST' &&
      result.visibility.depthSource === 'FAMILY_BOUND_SIGNAGE_SURFACE_PLUS_DEDICATED_INNER_MATTE' &&
      JSON.stringify(result.occluderNames) === JSON.stringify(profile.validity.occluderBinding.exactNames) &&
      result.visibility.occluderSelectorPolicy === 'EXACT_NAME_ONLY_DEPTH_ONLY_NO_COLOR' &&
      result.matteAsset.assetLogicalId === profile.validity.occluderBinding.assetLogicalId &&
      result.matteAsset.loadScope === 'PROJECTION_BAKE_RUN_ONLY' &&
      result.matteAsset.ordinarySceneAttached === false &&
      result.matteAsset.transformsFinite === true &&
      result.matteAsset.disposedAfterBake === true &&
      result.visibility.depthBits >= 16 &&
      result.visibility.depthEpsilonSteps === 4 &&
      result.visibility.facingPolicy === 'NO_NORMAL_THRESHOLD_DEPTH_PRIMARY_GRAZING_PRESERVED' &&
      result.uvPolicy === 'PRESERVE_AUTHORED_NO_REMAP' &&
      result.validCanonicalPixelCount > 0 &&
      result.transparentCanonicalPixelCount > 0 &&
      result.visibleScreenPixelCount > 0 &&
      result.roundTripMetricsPass &&
      result.resourcePolicy.stableAcrossRuns &&
      state.contextLossCount === 0;
    state.projectionBake.result = result;
    state.projectionBake.status = result.technicalPass ? 'TECHNICAL PASS' : 'TECHNICAL CHECK';
    projectionPocMessage.className = `projection-poc-message ${result.technicalPass ? 'pass' : 'fail'}`;
    projectionPocMessage.textContent = result.technicalPass
      ? `Technical diagnostics pass · Camera-depth visibility · Mask ${result.mask.enabled ? 'ON' : 'OFF'}.`
      : 'Technical checks need review. Calibration values were not modified.';
    updateProjectionPocMetrics(result);
    window.block6AProjectionDiagnostics = structuredClone(result);
    window.block6BProjectionDiagnostics = structuredClone(result);
    return result;
  } catch (error) {
    state.projectionBake.status = 'ERROR';
    state.projectionBake.error = error.stack || error.message;
    projectionPocMessage.className = 'projection-poc-message fail';
    projectionPocMessage.textContent = state.projectionBake.error;
    window.block6AProjectionDiagnostics = {
      status: 'ERROR',
      technicalPass: false,
      userValidation: state.projectionBake.userValidation,
      error: state.projectionBake.error
    };
    window.block6BProjectionDiagnostics = window.block6AProjectionDiagnostics;
    throw error;
  } finally {
    matteAsset?.dispose();
    state.projectionBake.running = false;
    syncProjectionPocUi();
    render();
    updateDiagnostics();
  }
}

function markAnamorphicFreePreview() {
  if (!isAnamorphicCalibrationContext() || state.site.anamorphicCameraMode === 'FREE_PREVIEW') return;
  state.site.anamorphicCameraMode = 'FREE_PREVIEW';
  releaseProjectionBakeResources('free-preview');
  fitSiteCameraToActiveSurfaces();
  syncAnamorphicControls();
  resizeRenderer();
  updateDiagnostics();
}

function applyAnamorphicCalibrationCamera() {
  if (!isAnamorphicCalibrationContext() || !state.site.surfaceSetAvailable) return false;
  const profile = currentAnamorphicFamily().cameraProfile;
  cameraSite.fov = profile.runtimeFov;
  anamorphicFovInput.value = String(profile.runtimeFov);
  cameraSite.aspect = profile.runtimeAspect;
  cameraSite.near = profile.near;
  cameraSite.far = profile.far;
  cameraSite.zoom = 1;
  if (cameraSite.view?.enabled) cameraSite.clearViewOffset();
  cameraSite.position.fromArray(profile.runtimePosition);
  cameraSite.up.fromArray(profile.runtimeUp);
  cameraSite.quaternion.fromArray(profile.runtimeQuaternion).normalize();
  controlsSite.target.fromArray(profile.runtimeTarget);
  cameraSite.updateProjectionMatrix();
  cameraSite.updateMatrixWorld(true);
  state.site.anamorphicCameraMode = 'CALIBRATION';
  syncAnamorphicControls();
  updateZoomReadout();
  render();
  updateDiagnostics();
  return true;
}

function applyAnamorphicFovValue(value) {
  if (!isAnamorphicCalibrationFramingActive() || !state.site.surfaceSetAvailable) return false;
  const nextFov = Number(value);
  if (!Number.isFinite(nextFov) || nextFov < 1 || nextFov > 179) {
    anamorphicFovInput.value = String(cameraSite.fov);
    return false;
  }
  cameraSite.fov = nextFov;
  cameraSite.updateProjectionMatrix();
  cameraSite.updateMatrixWorld(true);
  anamorphicFovInput.value = String(nextFov);
  const baselineFov = currentAnamorphicFamily().cameraProfile.runtimeFov;
  state.site.anamorphicCameraMode = Math.abs(nextFov - baselineFov) < 1e-9
    ? 'CALIBRATION'
    : 'FOV_ADJUSTED';
  syncAnamorphicControls();
  updateZoomReadout();
  render();
  updateDiagnostics();
  return true;
}

function fitSiteCameraToActiveSurfaces() {
  if (state.site.activeBindings.length === 0) return;
  const bounds = new THREE.Box3();
  for (const binding of state.site.activeBindings) bounds.expandByObject(binding.mesh);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(1, size.length() * 0.5);
  cameraSite.fov = 45;
  cameraSite.aspect = Math.max(1, viewer.clientWidth) / Math.max(1, viewer.clientHeight);
  cameraSite.near = 0.01;
  cameraSite.far = 10000;
  cameraSite.zoom = 1;
  if (cameraSite.view?.enabled) cameraSite.clearViewOffset();
  cameraSite.position.copy(center).add(new THREE.Vector3(radius * 1.15, radius * 0.45, radius * 1.9));
  cameraSite.up.set(0, 1, 0);
  cameraSite.rotation.set(0, 0, 0);
  cameraSite.updateProjectionMatrix();
  controlsSite.target.copy(center);
  controlsSite.update();
}

function currentLegacyCameraRecord() {
  if (state.site.world !== 'legacy2d' || state.site.mappingMode !== 'normal') return null;
  const sceneContract = SITE_SCENE_PROFILE.worlds.legacy2d.normalScenes
    .find((candidate) => candidate.id === state.site.scene);
  if (!sceneContract) return null;
  const sceneId = sceneContract.label.toUpperCase();
  return state.site.cameraRecords.find((record) => record.sceneId === sceneId) || null;
}

function deriveTargetFromCameraValues(values, distance = 10) {
  const orientation = values.orientation;
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(orientation.x),
    THREE.MathUtils.degToRad(orientation.y),
    THREE.MathUtils.degToRad(orientation.z),
    'XYZ'
  ));
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
  return new THREE.Vector3(values.position.x, values.position.y, values.position.z).addScaledVector(forward, distance);
}

function snapshotSiteCameraRuntime() {
  return {
    fov: cameraSite.fov,
    aspect: cameraSite.aspect,
    near: cameraSite.near,
    far: cameraSite.far,
    zoom: cameraSite.zoom,
    position: cameraSite.position.clone(),
    quaternion: cameraSite.quaternion.clone(),
    rotationOrder: cameraSite.rotation.order,
    target: controlsSite.target.clone()
  };
}

function restoreSiteCameraRuntime(snapshot) {
  cameraSite.fov = snapshot.fov;
  cameraSite.aspect = snapshot.aspect;
  cameraSite.near = snapshot.near;
  cameraSite.far = snapshot.far;
  cameraSite.zoom = snapshot.zoom;
  cameraSite.position.copy(snapshot.position);
  cameraSite.rotation.order = snapshot.rotationOrder;
  cameraSite.quaternion.copy(snapshot.quaternion);
  controlsSite.target.copy(snapshot.target);
  cameraSite.updateProjectionMatrix();
  cameraSite.updateMatrixWorld(true);
}

function applyCameraValuesToRuntime(values, runtimeTarget = null) {
  cameraSite.fov = values.fov;
  cameraSite.aspect = values.aspect;
  cameraSite.near = values.near;
  cameraSite.far = values.far;
  cameraSite.zoom = 1;
  if (cameraSite.view?.enabled) cameraSite.clearViewOffset();
  cameraSite.position.set(values.position.x, values.position.y, values.position.z);
  cameraSite.rotation.order = 'XYZ';
  cameraSite.rotation.set(
    THREE.MathUtils.degToRad(values.orientation.x),
    THREE.MathUtils.degToRad(values.orientation.y),
    THREE.MathUtils.degToRad(values.orientation.z)
  );
  controlsSite.target.copy(runtimeTarget
    ? new THREE.Vector3(runtimeTarget.x, runtimeTarget.y, runtimeTarget.z)
    : deriveTargetFromCameraValues(values));
  cameraSite.updateProjectionMatrix();
  cameraSite.updateMatrixWorld(true);
}

function verifyCameraRuntime(values, runtimeTarget = null) {
  const expectedPosition = new THREE.Vector3(values.position.x, values.position.y, values.position.z);
  const expectedQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(values.orientation.x),
    THREE.MathUtils.degToRad(values.orientation.y),
    THREE.MathUtils.degToRad(values.orientation.z),
    'XYZ'
  ));
  if (cameraSite.position.distanceTo(expectedPosition) > CAMERA_RUNTIME_POSITION_EPSILON ||
      cameraSite.quaternion.angleTo(expectedQuaternion) > CAMERA_RUNTIME_ROTATION_EPSILON ||
      Math.abs(cameraSite.fov - values.fov) > CAMERA_RUNTIME_POSITION_EPSILON ||
      Math.abs(cameraSite.aspect - values.aspect) > CAMERA_RUNTIME_POSITION_EPSILON) {
    throw new Error('Runtime Camera did not accept the complete candidate state.');
  }
  if (runtimeTarget) {
    const expectedTarget = new THREE.Vector3(runtimeTarget.x, runtimeTarget.y, runtimeTarget.z);
    if (controlsSite.target.distanceTo(expectedTarget) > 1e-9) {
      throw new Error('Orbit target did not accept the Max-like target.');
    }
  }
}

function applyCurrentCameraRecordToRuntime(record = currentLegacyCameraRecord()) {
  if (!record) return false;
  applyCameraValuesToRuntime(record.currentValues, record.runtimeTarget);
  verifyCameraRuntime(record.currentValues, record.runtimeTarget);
  return true;
}

function setInputPoint(inputs, value) {
  inputs.x.value = String(value.x);
  inputs.y.value = String(value.y);
  inputs.z.value = String(value.z);
}

function readInputPoint(inputs) {
  return { x: inputs.x.value, y: inputs.y.value, z: inputs.z.value };
}

function setCameraEditorMessage(message, type = '') {
  state.site.cameraEditor.lastAction = message;
  state.site.cameraEditor.error = type === 'fail' ? message : '';
  cameraEditorStatus.textContent = message;
  cameraEditorStatus.className = `camera-editor-status${type ? ` ${type}` : ''}`;
}

function populateCameraEditorFromRecord() {
  const record = currentLegacyCameraRecord();
  if (!record) return;
  const values = record.currentValues;
  cameraEditorTitle.textContent = `CAMERA — ${record.label.toUpperCase()}`;
  setInputPoint(cameraThreeInputs.position, values.position);
  setInputPoint(cameraThreeInputs.rotation, values.orientation);
  cameraThreeInputs.fov.value = String(values.fov);

  if (record.lastInput?.mode === CAMERA_INPUT_MODES.MAX_LIKE) {
    setInputPoint(cameraMaxInputs.position, record.lastInput.position);
    setInputPoint(cameraMaxInputs.target, record.lastInput.target);
    cameraMaxInputs.fov.value = String(record.lastInput.fov);
    cameraMaxInputs.fovBasis.value = record.lastInput.fovBasis;
  } else {
    const maxPosition = threePointToMaxLike(values.position);
    const runtimeTarget = record.runtimeTarget || deriveTargetFromCameraValues(values);
    const maxTarget = threePointToMaxLike(runtimeTarget);
    setInputPoint(cameraMaxInputs.position, maxPosition);
    setInputPoint(cameraMaxInputs.target, maxTarget);
    cameraMaxInputs.fov.value = String(values.fov);
    cameraMaxInputs.fovBasis.value = 'VERTICAL';
  }
  cameraInputMode.value = state.site.cameraEditor.inputMode;
  cameraThreeFields.hidden = state.site.cameraEditor.inputMode !== CAMERA_INPUT_MODES.THREE_DIRECT;
  cameraMaxFields.hidden = state.site.cameraEditor.inputMode !== CAMERA_INPUT_MODES.MAX_LIKE;
}

function syncCameraEditorAvailability() {
  const legacyContext = isLegacyCameraContext();
  const available = legacyContext && state.site.surfaceSetAvailable && Boolean(currentLegacyCameraRecord());
  const locked = state.site.legacyCameraLocked;
  cameraEditor.hidden = !legacyContext;
  cameraEditorLockState.textContent = locked ? 'LOCKED' : 'UNLOCKED';
  cameraEditorLockState.className = `camera-editor-lock-state ${locked ? 'locked' : 'unlocked'}`;
  const numericInputs = [
    ...Object.values(cameraThreeInputs.position),
    ...Object.values(cameraThreeInputs.rotation),
    cameraThreeInputs.fov,
    ...Object.values(cameraMaxInputs.position),
    ...Object.values(cameraMaxInputs.target),
    cameraMaxInputs.fov
  ];
  for (const input of numericInputs) input.readOnly = locked || !available;
  cameraApplyButton.disabled = locked || !available;
  cameraResetLegacyButton.disabled = locked || !available;
  cameraResetViewButton.disabled = !available;
  cameraInputMode.disabled = !available;
  cameraMaxInputs.fovBasis.disabled = locked || !available;
}

function applyCameraEditorTransaction() {
  const record = currentLegacyCameraRecord();
  if (!record || state.site.legacyCameraLocked || !state.site.surfaceSetAvailable) return false;
  const runtimeSnapshot = snapshotSiteCameraRuntime();
  const previousRuntimeTarget = record.runtimeTarget ? { ...record.runtimeTarget } : null;
  const previousLastInput = cloneCameraValues(record.lastInput);
  try {
    let result;
    if (state.site.cameraEditor.inputMode === CAMERA_INPUT_MODES.THREE_DIRECT) {
      result = {
        cameraValues: createThreeDirectCandidate(record.currentValues, {
          position: readInputPoint(cameraThreeInputs.position),
          eulerXyzDegrees: readInputPoint(cameraThreeInputs.rotation),
          fov: cameraThreeInputs.fov.value
        }),
        runtimeTarget: null,
        lastInput: { mode: CAMERA_INPUT_MODES.THREE_DIRECT }
      };
    } else {
      result = createMaxLikeCandidate(record.currentValues, {
        position: readInputPoint(cameraMaxInputs.position),
        target: readInputPoint(cameraMaxInputs.target),
        fov: cameraMaxInputs.fov.value,
        fovBasis: cameraMaxInputs.fovBasis.value
      });
    }

    commitCameraRecordTransaction({
      record,
      nextValues: result.cameraValues,
      applyRuntime: (candidate) => {
        applyCameraValuesToRuntime(candidate, result.runtimeTarget);
        verifyCameraRuntime(candidate, result.runtimeTarget);
      },
      restoreRuntime: () => restoreSiteCameraRuntime(runtimeSnapshot)
    });
    record.runtimeTarget = result.runtimeTarget ? { ...result.runtimeTarget } : null;
    record.lastInput = cloneCameraValues(result.lastInput);
    populateCameraEditorFromRecord();
    setCameraEditorMessage(
      state.site.cameraEditor.inputMode === CAMERA_INPUT_MODES.MAX_LIKE
        ? 'Applied Max-like candidate. USER CALIBRATION remains open.'
        : 'Applied THREE DIRECT Camera values.',
      'pass'
    );
    updateZoomReadout();
    render();
    updateDiagnostics();
    return true;
  } catch (error) {
    record.runtimeTarget = previousRuntimeTarget;
    record.lastInput = previousLastInput;
    setCameraEditorMessage(error.message, 'fail');
    render();
    updateDiagnostics();
    return false;
  }
}

function resetCameraEditorView() {
  const record = currentLegacyCameraRecord();
  if (!record || !isLegacyCameraContext() || !state.site.surfaceSetAvailable) return false;
  const snapshot = snapshotSiteCameraRuntime();
  try {
    applyCurrentCameraRecordToRuntime(record);
    setCameraEditorMessage('Runtime view reset to currentValues.', 'pass');
    updateZoomReadout();
    render();
    updateDiagnostics();
    return true;
  } catch (error) {
    restoreSiteCameraRuntime(snapshot);
    setCameraEditorMessage(error.message, 'fail');
    return false;
  }
}

function resetCameraEditorToLegacy() {
  const record = currentLegacyCameraRecord();
  if (!record || state.site.legacyCameraLocked || !state.site.surfaceSetAvailable) return false;
  const runtimeSnapshot = snapshotSiteCameraRuntime();
  const previousRuntimeTarget = record.runtimeTarget ? { ...record.runtimeTarget } : null;
  const previousLastInput = cloneCameraValues(record.lastInput);
  try {
    commitCameraRecordTransaction({
      record,
      nextValues: record.legacyValues,
      applyRuntime: (candidate) => {
        applyCameraValuesToRuntime(candidate, null);
        verifyCameraRuntime(candidate, null);
      },
      restoreRuntime: () => restoreSiteCameraRuntime(runtimeSnapshot)
    });
    record.runtimeTarget = null;
    record.lastInput = { mode: CAMERA_INPUT_MODES.THREE_DIRECT };
    state.site.cameraEditor.inputMode = CAMERA_INPUT_MODES.THREE_DIRECT;
    populateCameraEditorFromRecord();
    setCameraEditorMessage('currentValues and Runtime reset to immutable Legacy baseline.', 'pass');
    updateZoomReadout();
    render();
    updateDiagnostics();
    return true;
  } catch (error) {
    record.runtimeTarget = previousRuntimeTarget;
    record.lastInput = previousLastInput;
    setCameraEditorMessage(error.message, 'fail');
    return false;
  }
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
  syncCameraEditorAvailability();
  syncAnamorphicControls();
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
  if (Object.keys(SITE_SCENE_PROFILE.assets).some((assetId) => !state.site.roots[assetId])) return;
  for (const mesh of state.site.meshes) mesh.visible = false;
  const selection = selectedSiteContract();
  if (!selection.contracts) {
    state.site.activeBindings = [];
    state.site.missingMeshes = ['Legacy 2D World anamorphic surface contract'];
    state.site.surfaceSetAvailable = false;
  } else {
    const resolution = resolveSurfaceSet(state.site.meshesByWorld[selection.assetId] ?? [], selection.contracts);
    state.site.missingMeshes = [...resolution.missing];
    state.site.surfaceSetAvailable = resolution.available;
    state.site.activeBindings = resolution.available ? [...resolution.resolved] : [];
    if (!selection.photoScene) {
      for (const binding of state.site.activeBindings) binding.mesh.visible = true;
    }
  }

  if (state.pointer.marker?.view === 'site-3d') state.pointer.marker = null;
  if (resetCamera) {
    if (isAnamorphicCalibrationContext()) applyAnamorphicCalibrationCamera();
    else if (selection.camera) applyCurrentCameraRecordToRuntime();
    else if (state.site.surfaceSetAvailable) fitSiteCameraToActiveSurfaces();
  }
  if (selection.camera) populateCameraEditorFromRecord();
  if (selection.photoScene) void activatePhotoScene(selection.photoScene);
  else deactivatePhotoScene('non-photo-site-selection');
  if (!isProjectionPocContext() && projectionBakeRuntime.resources) {
    releaseProjectionBakeResources('family-or-view-change');
  }
  applyEnvironmentVisibility();
  syncSiteCameraControls();
  syncLocationControls();
  siteAnamorphicFamilySelect.value = state.site.anamorphicFamily;
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
        const anamorphicFamily = anamorphicFamilyForAsset(assetId);
        const productionHelper = Boolean(anamorphicFamily) &&
          !anamorphicFamily.surfaces.some((surface) => surface.expectedNode === child.name);
        child.userData.productionHelper = productionHelper;
        child.userData.photoshopPointTarget = !productionHelper && !anamorphicFamily;
        child.material = new THREE.MeshBasicMaterial({
          map: productionHelper ? null : state.texture,
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
    state.site.bindings = state.site.meshes.map((mesh) => ({
      mesh,
      textureEligible: mesh.userData.productionHelper !== true
    }));
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

function environmentPresentationContract() {
  return SITE_ENVIRONMENT_PROFILE.presentations[state.environment.presentation] ||
    SITE_ENVIRONMENT_PROFILE.presentations[SITE_ENVIRONMENT_PROFILE.defaultPresentation];
}

function syncEnvironmentControls() {
  const available = state.activeView === 'site-3d' && state.site.world === 'world3d';
  environmentPresentationControl.hidden = !available;
  environmentPresentationSelect.disabled = !available || state.environment.status !== 'READY';
  environmentPresentationSelect.value = state.environment.presentation;
}

function applyEnvironmentPresentation() {
  const presentation = environmentPresentationContract();
  for (const mesh of state.environment.visibleMeshes) {
    mesh.material.color.setHex(presentation.materialColor);
    mesh.material.needsUpdate = true;
  }
  environmentHemisphereLight.color.setHex(presentation.hemisphereSkyColor);
  environmentHemisphereLight.groundColor.setHex(presentation.hemisphereGroundColor);
  environmentHemisphereLight.intensity = presentation.hemisphereIntensity;
  environmentDirectionalLight.color.setHex(presentation.directionalColor);
  environmentDirectionalLight.intensity = presentation.directionalIntensity;
}

function applyEnvironmentVisibility() {
  const environmentVisible = state.environment.status === 'READY' && state.site.world === 'world3d';
  if (state.environment.root) state.environment.root.visible = environmentVisible;
  for (const mesh of state.environment.visibleMeshes) mesh.visible = true;
  for (const mesh of state.environment.excludedMeshes) mesh.visible = false;
  environmentHemisphereLight.visible = environmentVisible;
  environmentDirectionalLight.visible = environmentVisible;
  syncEnvironmentControls();
}

function nodeTransformIsFinite(object) {
  return [...object.position.toArray(), ...object.quaternion.toArray(), ...object.scale.toArray()].every(Number.isFinite);
}

async function loadEnvironmentScene() {
  const loader = new GLTFLoader();
  try {
    const url = new URL(SITE_ENVIRONMENT_PROFILE.asset.runtimeUrl, import.meta.url).href;
    const gltf = await loader.loadAsync(url);
    if (!gltf.scene) throw new Error('Environment GLB has no runtime scene.');
    const exactExclusions = new Set(SITE_ENVIRONMENT_PROFILE.visibility.excludedExactNodes);
    const matchedExclusions = new Set();
    const sourceMaterials = new Set();
    const sourceTextures = new Set();
    const meshes = [];
    const visibleMeshes = [];
    const excludedMeshes = [];
    let transformsFinite = true;
    gltf.scene.traverse((child) => {
      transformsFinite = transformsFinite && nodeTransformIsFinite(child);
      if (!child.isMesh) return;
      meshes.push(child);
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (!material) continue;
        sourceMaterials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) sourceTextures.add(value);
      }
      const excluded = exactExclusions.has(child.name);
      child.userData.environmentRole = SITE_ENVIRONMENT_PROFILE.asset.assetRole;
      child.userData.environmentExcluded = excluded;
      child.raycast = () => {};
      if (excluded) {
        matchedExclusions.add(child.name);
        child.visible = false;
        excludedMeshes.push(child);
      } else {
        child.material = new THREE.MeshStandardMaterial({
          color: environmentPresentationContract().materialColor,
          roughness: SITE_ENVIRONMENT_PROFILE.material.roughness,
          metalness: SITE_ENVIRONMENT_PROFILE.material.metalness,
          side: THREE.DoubleSide,
          depthTest: true,
          depthWrite: true,
          toneMapped: false
        });
        visibleMeshes.push(child);
      }
    });
    if (!transformsFinite) throw new Error('Environment GLB contains a non-finite runtime transform.');
    if (meshes.length === 0 || visibleMeshes.length === 0) throw new Error('Environment GLB has no renderable environment mesh.');
    for (const texture of sourceTextures) texture.dispose();
    for (const material of sourceMaterials) material.dispose();
    gltf.scene.userData.environmentAssetId = SITE_ENVIRONMENT_PROFILE.asset.logicalId;
    gltf.scene.userData.coordinatePolicy = SITE_ENVIRONMENT_PROFILE.asset.coordinatePolicy;
    state.environment.root = gltf.scene;
    state.environment.meshes = meshes;
    state.environment.visibleMeshes = visibleMeshes;
    state.environment.excludedMeshes = excludedMeshes;
    state.environment.unmatchedExclusions = [...exactExclusions].filter((name) => !matchedExclusions.has(name));
    state.environment.sourceMaterialsDisposed = sourceMaterials.size;
    state.environment.sourceTexturesDisposed = sourceTextures.size;
    state.environment.loadCount += 1;
    state.environment.status = 'READY';
    state.environment.error = '';
    sceneSite.add(gltf.scene);
    applyEnvironmentPresentation();
    applyEnvironmentVisibility();
    render();
    updateDiagnostics();
  } catch (error) {
    state.environment.status = 'ERROR';
    state.environment.error = error.stack || error.message;
    applyEnvironmentVisibility();
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
  if (!isProjectionPocContext() && projectionBakeRuntime.resources) {
    releaseProjectionBakeResources('view-change');
  }
  if (enteringLegacy) {
    state.site.legacyCameraLocked = true;
    if (state.site.surfaceSetAvailable) applyCurrentCameraRecordToRuntime();
    populateCameraEditorFromRecord();
  }
  controls3d.enabled = view === '3d-plane';
  view2dButton.classList.toggle('active', view === '2d');
  view3dPlaneButton.classList.toggle('active', view === '3d-plane');
  viewSite3dButton.classList.toggle('active', view === 'site-3d');
  for (const control of siteControls) control.hidden = view !== 'site-3d';
  updatePhotoContentRect();
  syncSiteCameraControls();
  applyEnvironmentVisibility();
  syncLocationControls();
  for (const button of [fitButton, oneButton, twoButton, fourButton]) button.disabled = view !== '2d';
  updateZoomReadout();
  render();
  updateDiagnostics();
}

function render() {
  const width = Math.max(1, viewer.clientWidth);
  const height = Math.max(1, viewer.clientHeight);
  const photoActive = isPhotoViewportActive();
  const anamorphicCalibrationActive = isAnamorphicCalibrationFramingActive();
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, width, height);
  const environmentActive = state.activeView === 'site-3d' && state.site.world === 'world3d' &&
    state.environment.status === 'READY';
  const siteClearColor = environmentActive ? environmentPresentationContract().clearColor : 0x090a0d;
  renderer.setClearColor(
    anamorphicCalibrationActive ? ANAMORPHIC_CALIBRATION_MATTE_COLOR : siteClearColor,
    1
  );
  renderer.clear(true, true, true);
  if (state.activeView === 'site-3d' && photoActive) {
    const rect = state.photo.contentRect;
    const bottom = height - rect.y - rect.height;
    renderer.setScissor(rect.x, bottom, rect.width, rect.height);
    renderer.setViewport(rect.x, bottom, rect.width, rect.height);
    renderer.setScissorTest(true);
    renderer.render(scenePhoto, cameraPhoto);
    renderer.clearDepth();
    renderer.render(sceneSite, cameraSite);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, width, height);
  } else if (state.activeView === 'site-3d' && anamorphicCalibrationActive) {
    const rect = computeContainedAspectRect(width, height, currentAnamorphicFamily().workingResolution.aspect);
    const bottom = height - rect.y - rect.height;
    renderer.setScissor(rect.x, bottom, rect.width, rect.height);
    renderer.setViewport(rect.x, bottom, rect.width, rect.height);
    renderer.setScissorTest(true);
    renderer.setClearColor(siteClearColor, 1);
    renderer.clear(true, true, true);
    renderer.render(sceneSite, cameraSite);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, width, height);
    renderer.setClearColor(siteClearColor, 1);
  } else if (state.activeView === 'site-3d') renderer.render(sceneSite, cameraSite);
  else if (state.activeView === '3d-plane') renderer.render(scene3d, camera3d);
  else renderer.render(scene, camera);
  updatePointerMarker();
  updateLocationMarkers();
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
  if (marker.view === 'site-3d' && isPhotoViewportActive()) {
    const rect = state.photo.contentRect;
    pointerMarker.style.left = `${rect.x + ((projected.x + 1) * 0.5 * rect.width)}px`;
    pointerMarker.style.top = `${rect.y + ((1 - projected.y) * 0.5 * rect.height)}px`;
  } else {
    pointerMarker.style.left = `${(projected.x + 1) * 50}%`;
    pointerMarker.style.top = `${(1 - projected.y) * 50}%`;
  }
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
    ? state.site.surfaceSetAvailable && state.site.activeBindings.length > 0 &&
      selectedSiteContract().pointEnabled !== false &&
      (!isPhotoSceneContext() || isPhotoViewportActive())
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
  updateLocationMarkers();
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
  const photoNdc = state.activeView === 'site-3d' && isPhotoSceneContext()
    ? clientPointToContentNdc(clientX, clientY, bounds, state.photo.contentRect)
    : null;
  if (state.activeView === 'site-3d' && isPhotoSceneContext() && !photoNdc) return null;
  const ndc = new THREE.Vector2(
    photoNdc?.x ?? (((clientX - bounds.left) / bounds.width) * 2 - 1),
    photoNdc?.y ?? (-((clientY - bounds.top) / bounds.height) * 2 + 1)
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
    photoScene: {
      status: state.photo.status,
      ready: isPhotoViewportActive(),
      sceneId: state.photo.sceneId,
      requestedSceneId: state.photo.requestedSceneId,
      runtimeUrl: state.photo.runtimeUrl,
      nativeWidth: state.photo.activeResource?.width || null,
      nativeHeight: state.photo.activeResource?.height || null,
      contentRect: state.photo.contentRect ? { ...state.photo.contentRect } : null,
      resourceCount: state.photo.activeResource ? 1 : 0,
      loadCount: state.photo.loadCount,
      commitCount: state.photo.commitCount,
      disposeCount: state.photo.disposeCount,
      contextLossCount: state.contextLossCount,
      error: state.photo.error
    },
    locationNavigation: {
      visible: state.locations.visible,
      markerContext: isLocationMarkerContext(),
      navigationStatus: state.locations.navigationStatus,
      activeLocationId: state.locations.activeLocationId,
      lastResult: state.locations.lastResult,
      lastError: state.locations.lastError,
      returnSnapshotAvailable: Boolean(locationNavigation.siteSnapshot),
      returnButtonVisible: !returnToSiteButton.hidden,
      records: LOCATION_RECORDS.map((record) => {
        const element = state.locations.elements.get(record.locationId);
        const builtPhoto = state.manifest?.photoAssets?.find((candidate) => candidate.sceneId === record.photoSceneId);
        const projection = state.locations.projections.get(record.locationId) || null;
        return {
          locationId: record.locationId,
          photoSceneId: record.photoSceneId,
          worldPosition: { ...record.worldPosition },
          uiOffset: { x: record.marker.uiOffsetX, y: record.marker.uiOffsetY },
          resolutionStatus: record.resolutionStatus,
          calibrationStatus: record.calibrationStatus,
          proxyRuntimeUrl: record.thumbnail.proxyRuntimeUrl,
          proxyStatus: builtPhoto?.thumbnail?.status || 'UNAVAILABLE',
          projectedVisible: Boolean(projection?.visible),
          projectionReason: projection?.reason || null,
          domVisible: Boolean(element && !element.hidden),
          pointerEvents: element ? getComputedStyle(element).pointerEvents : 'none'
        };
      }),
      snapshot: locationNavigation.siteSnapshot ? structuredClone(locationNavigation.siteSnapshot) : null
    },
    environment: {
      status: state.environment.status,
      error: state.environment.error,
      assetRole: SITE_ENVIRONMENT_PROFILE.asset.assetRole,
      logicalId: SITE_ENVIRONMENT_PROFILE.asset.logicalId,
      revisionPolicy: SITE_ENVIRONMENT_PROFILE.asset.revisionPolicy,
      runtimeUrl: state.environment.runtimeUrl,
      coordinatePolicy: SITE_ENVIRONMENT_PROFILE.asset.coordinatePolicy,
      presentation: state.environment.presentation,
      meshCount: state.environment.meshes.length,
      visibleMeshCount: state.environment.visibleMeshes.length,
      excludedMeshCount: state.environment.excludedMeshes.length,
      excludedExactNodes: [...SITE_ENVIRONMENT_PROFILE.visibility.excludedExactNodes],
      matchedExcludedNodes: state.environment.excludedMeshes.map((mesh) => mesh.name),
      unmatchedExcludedNodes: [...state.environment.unmatchedExclusions],
      allRuntimeTransformsFinite: state.environment.root
        ? (() => {
            let finite = true;
            state.environment.root.traverse((object) => { finite = finite && nodeTransformIsFinite(object); });
            return finite;
          })()
        : false,
      rootTransformIdentity: Boolean(state.environment.root) &&
        state.environment.root.position.lengthSq() === 0 &&
        state.environment.root.quaternion.angleTo(new THREE.Quaternion()) === 0 &&
        state.environment.root.scale.distanceTo(new THREE.Vector3(1, 1, 1)) === 0,
      materialOverride: SITE_ENVIRONMENT_PROFILE.material,
      sourceMaterialsDisposed: state.environment.sourceMaterialsDisposed,
      sourceTexturesDisposed: state.environment.sourceTexturesDisposed,
      raycastTargetCount: state.site.activeBindings.filter((binding) => state.environment.meshes.includes(binding.mesh)).length,
      raycastDisabledCount: state.environment.meshes.filter((mesh) => mesh.userData.environmentRole && mesh.raycast).length,
      loadCount: state.environment.loadCount,
      observedFingerprint: state.manifest?.environmentAsset?.observedFingerprint || null,
      revisionChanged: state.manifest?.environmentAsset?.revisionChanged ?? null,
      pointPolicy: SITE_ENVIRONMENT_PROFILE.pointPolicy
    },
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
      assetFile: SITE_SCENE_PROFILE.assets[selectedSiteAssetId()].fileName,
      expectedSha256: SITE_SCENE_PROFILE.assets[selectedSiteAssetId()].sha256,
      loadedAssets: Object.values(SITE_SCENE_PROFILE.assets).map((asset) => asset.fileName),
      world: state.site.world,
      mappingMode: state.site.mappingMode,
      anamorphicFamily: state.site.mappingMode === 'anamorphic' ? currentAnamorphicFamily()?.familyId ?? null : null,
      anamorphicCameraMode: isAnamorphicCalibrationContext() ? state.site.anamorphicCameraMode : null,
      anamorphicCalibrationStatus: isAnamorphicCalibrationContext()
        ? currentAnamorphicFamily().cameraProfile.calibrationStatus
        : null,
      anamorphicVisualValidationState: isAnamorphicCalibrationContext()
        ? currentAnamorphicFamily().cameraProfile.visualValidationState
        : null,
      anamorphicWorkingResolution: isAnamorphicCalibrationFramingActive()
        ? { ...currentAnamorphicFamily().workingResolution }
        : null,
      anamorphicProjectionAspect: isAnamorphicCalibrationFramingActive()
        ? currentAnamorphicFamily().cameraProfile.runtimeAspect
        : null,
      anamorphicCalibrationMatte: {
        active: isAnamorphicCalibrationFramingActive(),
        color: ANAMORPHIC_CALIBRATION_MATTE_HEX,
        outsideWorkingCanvasOnly: true
      },
      helperVisibleCount: (state.site.meshesByWorld[selectedSiteAssetId()] ?? [])
        .filter((mesh) => mesh.userData.productionHelper && mesh.visible).length,
      helperTextureMapCount: (state.site.meshesByWorld[selectedSiteAssetId()] ?? [])
        .filter((mesh) => mesh.userData.productionHelper && mesh.material.map).length,
      legacyScene: state.site.world === 'legacy2d' ? state.site.scene : null,
      legacyCameraLocked: isLegacyCameraContext() ? state.site.legacyCameraLocked : null,
      cameraRecordId: currentLegacyCameraRecord()?.cameraId || null,
      cameraInputMode: isLegacyCameraContext() ? state.site.cameraEditor.inputMode : null,
      cameraCurrentValues: currentLegacyCameraRecord()
        ? cloneCameraValues(currentLegacyCameraRecord().currentValues)
        : null,
      cameraLegacyValuesImmutable: currentLegacyCameraRecord()
        ? Object.isFrozen(currentLegacyCameraRecord().legacyValues)
        : null,
      maxLikeCalibration: currentLegacyCameraRecord()?.lastInput?.mode === CAMERA_INPUT_MODES.MAX_LIKE
        ? currentLegacyCameraRecord().lastInput.adapterStatus
        : null,
      cameraControlsEnabled: controlsSite.enabled,
      surfaceSetAvailable: state.site.surfaceSetAvailable,
      missingMeshes: [...state.site.missingMeshes],
      meshCount: state.site.meshes.length,
      activeWorldMeshCount: (state.site.meshesByWorld[selectedSiteAssetId()] ?? []).length,
      activeSurfaces: state.site.activeBindings.map((binding) => ({
        role: binding.contract.role,
        meshName: binding.mesh.name,
        meshUuid: binding.mesh.uuid,
        textureShared: binding.mesh.material.map === state.texture
      })),
      cameraType: cameraSite.type,
      fov: cameraSite.fov,
      aspect: cameraSite.aspect,
      near: cameraSite.near,
      far: cameraSite.far,
      position: cameraSite.position.toArray(),
      target: controlsSite.target.toArray()
    },
    projectionBake: {
      profileId: currentProjectionBakeProfile()?.id || null,
      familyId: currentProjectionBakeProfile()?.familyId || null,
      status: state.projectionBake.status,
      running: state.projectionBake.running,
      available: isProjectionPocContext(),
      result: state.projectionBake.result ? structuredClone(state.projectionBake.result) : null,
      error: state.projectionBake.error,
      userValidation: state.projectionBake.userValidation
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
  window.block4CPhotoDiagnostics = structuredClone(state.diagnostics.photoScene);
  window.block4DEnvironmentDiagnostics = structuredClone(state.diagnostics.environment);
  window.block4ELocationDiagnostics = structuredClone(state.diagnostics.locationNavigation);
  window.block5AAnamorphicDiagnostics = structuredClone(state.diagnostics.site3d);
  window.block5BBackDiagnostics = structuredClone(state.diagnostics.site3d);
  window.block6AProjectionDiagnostics = state.projectionBake.result
    ? structuredClone(state.projectionBake.result)
    : structuredClone(state.diagnostics.projectionBake);

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
    ['Anamorphic Family', state.diagnostics.site3d.anamorphicFamily || '—'],
    ['Anamorphic Camera', state.diagnostics.site3d.anamorphicCameraMode || '—'],
    ['Camera FOV / Aspect', isAnamorphicCalibrationContext() ? `${cameraSite.fov.toFixed(3)} / ${cameraSite.aspect.toFixed(6)}` : '—'],
    ['Working Canvas', state.diagnostics.site3d.anamorphicWorkingResolution
      ? `${state.diagnostics.site3d.anamorphicWorkingResolution.width} × ${state.diagnostics.site3d.anamorphicWorkingResolution.height} / ${state.diagnostics.site3d.anamorphicWorkingResolution.aspect.toFixed(6)}`
      : '—'],
    ['Projection PoC', state.diagnostics.projectionBake.status],
    ['Projection Profile', state.diagnostics.projectionBake.profileId || 'NOT AVAILABLE'],
    ['Projection Mask', state.projectionBake.result?.mask?.status ||
      (currentProjectionBakeProfile()
        ? (isProjectionMaskEnabled() ? `${currentProjectionBakeProfile().productionMask.status} · ON` : 'OFF · FULL SURFACE')
        : 'NOT AVAILABLE')],
    ['Direct Projected', state.projectionBake.result ? `${state.projectionBake.result.directWidth} × ${state.projectionBake.result.directHeight}` : 'NOT RUN'],
    ['Canonical Bake', state.projectionBake.result ? `${state.projectionBake.result.bakeWidth} × ${state.projectionBake.result.bakeHeight}` : '4728 × 5760 / NOT RUN'],
    ['Site Scene', state.site.world === 'legacy2d' ? state.site.scene : '—'],
    ['Legacy Camera', isLegacyCameraContext() ? (state.site.legacyCameraLocked ? 'LOCKED' : 'UNLOCKED') : '—'],
    ['Camera Record', state.diagnostics.site3d.cameraRecordId || '—'],
    ['Camera Input', state.diagnostics.site3d.cameraInputMode || '—'],
    ['Max Calibration', state.diagnostics.site3d.maxLikeCalibration || '—'],
    ['Site Surface Set', state.site.surfaceSetAvailable ? 'READY' : 'NONE'],
    ['Site Active Surfaces', state.site.activeBindings.map((binding) => `${binding.contract.role}:${binding.mesh.name}`).join(' + ') || '—'],
    ['Site Missing Meshes', state.site.missingMeshes.join(', ') || '—'],
    ['Site Texture Shared', state.site.activeBindings.length > 0 && state.site.activeBindings.every((binding) => binding.mesh.material.map === state.texture) ? 'YES' : '—'],
    ['Photo Scene', state.diagnostics.photoScene.sceneId || state.diagnostics.photoScene.requestedSceneId || '—'],
    ['Photo Load', state.diagnostics.photoScene.status],
    ['Photo Runtime URL', state.diagnostics.photoScene.runtimeUrl || '—'],
    ['Photo Native Size', state.diagnostics.photoScene.nativeWidth ? `${state.diagnostics.photoScene.nativeWidth} × ${state.diagnostics.photoScene.nativeHeight}` : '—'],
    ['Photo Content Rect', state.photo.contentRect ? `${state.photo.contentRect.width.toFixed(1)} × ${state.photo.contentRect.height.toFixed(1)}` : '—'],
    ['Photo Resources', state.diagnostics.photoScene.resourceCount],
    ['Locations', state.locations.visible ? 'ON' : 'OFF'],
    ['Location Navigation', state.locations.navigationStatus],
    ['Location Return', locationNavigation.siteSnapshot ? 'AVAILABLE' : '—'],
    ['Location Markers Visible', state.diagnostics.locationNavigation.records.filter((record) => record.domVisible).length],
    ['Environment Load', state.diagnostics.environment.status],
    ['Environment Asset', SITE_ENVIRONMENT_PROFILE.asset.fileName],
    ['Environment Revision', state.diagnostics.environment.revisionChanged === false ? 'CURRENT' : 'CHANGED'],
    ['Environment Presentation', state.environment.presentation.toUpperCase()],
    ['Environment Meshes', `${state.environment.visibleMeshes.length} visible / ${state.environment.excludedMeshes.length} excluded`],
    ['Environment POINT Targets', state.diagnostics.environment.raycastTargetCount],
    ['Environment Coordinates', SITE_ENVIRONMENT_PROFILE.asset.coordinatePolicy],
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
    case 'BAKE_TARGET_STATUS':
      state.reverseBake.target = message.status === 'NOT_SET' ? null : {
        status: message.status,
        documentId: message.documentId,
        documentName: message.documentName,
        width: message.width,
        height: message.height,
        documentMode: message.documentMode,
        documentDepth: message.documentDepth
      };
      syncProjectionPocUi();
      break;
    case 'BAKE_RECEIVED':
      if (state.reverseBake.activeJobId === message.jobId) state.reverseBake.state = 'RECEIVED_COMPLETE';
      syncProjectionPocUi();
      break;
    case 'BAKE_APPLYING':
      if (state.reverseBake.activeJobId === message.jobId) state.reverseBake.state = 'APPLYING_TO_PHOTOSHOP';
      syncProjectionPocUi();
      break;
    case 'BAKE_APPLIED':
      if (state.reverseBake.pending?.jobId === message.jobId) {
        window.clearTimeout(state.reverseBake.pending.timer);
        const pending = state.reverseBake.pending;
        state.reverseBake.pending = null;
        pending.resolve(message);
      }
      return;
    case 'BAKE_ERROR':
      if (state.reverseBake.pending?.jobId === message.jobId) {
        window.clearTimeout(state.reverseBake.pending.timer);
        const pending = state.reverseBake.pending;
        state.reverseBake.pending = null;
        pending.reject(new Error(`${message.code || 'BAKE_ERROR'}: ${message.message || 'Photoshop bake failed.'}`));
      } else {
        state.reverseBake.lastError = `${message.code || 'BAKE_ERROR'}: ${message.message || 'Photoshop bake failed.'}`;
      }
      syncProjectionPocUi();
      return;
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
    if (state.reverseBake.pending) {
      window.clearTimeout(state.reverseBake.pending.timer);
      const pending = state.reverseBake.pending;
      state.reverseBake.pending = null;
      pending.reject(new Error('BROKER_DISCONNECTED: Connection closed during Photoshop bake.'));
    }
    state.reverseBake.target = null;
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
siteAnamorphicFamilySelect.addEventListener('change', () => {
  const family = SITE_SCENE_PROFILE.worlds.world3d.anamorphicFamilies[siteAnamorphicFamilySelect.value];
  if (!family?.available) return;
  state.site.anamorphicFamily = family.id;
  applySiteSurfaceSelection();
});
environmentPresentationSelect.addEventListener('change', () => {
  if (!SITE_ENVIRONMENT_PROFILE.presentations[environmentPresentationSelect.value]) return;
  state.environment.presentation = environmentPresentationSelect.value;
  applyEnvironmentPresentation();
  render();
  updateDiagnostics();
});
locationsToggleButton.addEventListener('click', () => {
  state.locations.visible = !state.locations.visible;
  syncLocationControls();
  render();
  updateDiagnostics();
});
returnToSiteButton.addEventListener('click', () => { void returnToSite(); });
siteSceneSelect.addEventListener('change', () => {
  state.site.scene = siteSceneSelect.value;
  lockLegacyCamera();
  applySiteSurfaceSelection();
});
legacyCameraLockButton.addEventListener('click', toggleLegacyCameraLock);
anamorphicCameraResetButton.addEventListener('click', applyAnamorphicCalibrationCamera);
anamorphicFovInput.addEventListener('change', () => applyAnamorphicFovValue(anamorphicFovInput.value));
projectionPocRun.addEventListener('click', () => {
  void runProjectionBake().catch((error) => console.error(error));
});
projectionMaskEnabled.addEventListener('change', () => {
  const profile = currentProjectionBakeProfile();
  if (!profile || state.projectionBake.running || state.reverseBake.activeJobId !== null) return;
  state.projectionBake.maskEnabledByFamily[profile.familyId] = projectionMaskEnabled.checked;
  releaseProjectionBakeResources('mask-mode-change');
  updateProjectionPocMetrics(null);
  projectionPocMessage.className = 'projection-poc-message';
  projectionPocMessage.textContent = `Production Mask ${projectionMaskEnabled.checked ? 'ON' : 'OFF'} for ${profile.label}. Run Test Bake to refresh all outputs.`;
  syncProjectionPocUi();
  updateDiagnostics();
});
for (const button of projectionPocSaveButtons) {
  button.addEventListener('click', () => {
    void saveProjectionPng(button.dataset.projectionExport).catch((error) => console.error(error));
  });
}
for (const button of projectionPhotoshopButtons) {
  button.addEventListener('click', () => {
    void sendProjectionToPhotoshop(button.dataset.photoshopOutput).catch((error) => console.error(error));
  });
}
cameraInputMode.addEventListener('change', () => {
  state.site.cameraEditor.inputMode = cameraInputMode.value;
  populateCameraEditorFromRecord();
  syncCameraEditorAvailability();
  setCameraEditorMessage(
    state.site.cameraEditor.inputMode === CAMERA_INPUT_MODES.MAX_LIKE
      ? 'Max-like adapter is a candidate until user calibration.'
      : 'THREE DIRECT uses the exact Runtime Camera contract.'
  );
});
cameraApplyButton.addEventListener('click', applyCameraEditorTransaction);
cameraResetViewButton.addEventListener('click', resetCameraEditorView);
cameraResetLegacyButton.addEventListener('click', resetCameraEditorToLegacy);
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
window.addEventListener('beforeunload', () => projectionBakeRuntime.dispose());

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

function runAnamorphicFamilySmoke(familyKey, expectedSurface) {
  setActiveView('site-3d');
  state.site.world = 'world3d';
  state.site.mappingMode = 'anamorphic';
  state.site.anamorphicFamily = familyKey;
  siteWorldSelect.value = state.site.world;
  siteMappingSelect.value = state.site.mappingMode;
  siteAnamorphicFamilySelect.value = state.site.anamorphicFamily;
  applySiteSurfaceSelection();
  const family = currentAnamorphicFamily();
  const expectedQuaternion = new THREE.Quaternion().fromArray(family.cameraProfile.runtimeQuaternion);
  const expectedForward = new THREE.Vector3().fromArray(family.cameraProfile.runtimeForward);
  const visibleMeshes = (state.site.meshesByWorld[family.assetId] ?? []).filter((mesh) => mesh.visible);
  const inactiveAnamorphicVisibleCount = Object.values(SITE_SCENE_PROFILE.worlds.world3d.anamorphicFamilies)
    .filter((candidate) => candidate.available && candidate.assetId !== family.assetId)
    .flatMap((candidate) => state.site.meshesByWorld[candidate.assetId] ?? [])
    .filter((mesh) => mesh.visible).length;
  const baselineVerticalFovMatches = Math.abs(cameraSite.fov - family.cameraProfile.runtimeFov) < 1e-9;
  const editableFov = family.cameraProfile.runtimeFov + 1.472;
  const editableFovApplied = applyAnamorphicFovValue(editableFov);
  const editableFovMatches = Math.abs(cameraSite.fov - editableFov) < 1e-9;
  const editableFovMode = state.site.anamorphicCameraMode;
  const fovResetReturned = applyAnamorphicCalibrationCamera();
  const fovResetMatches = Math.abs(cameraSite.fov - family.cameraProfile.runtimeFov) < 1e-9 &&
    anamorphicFovInput.value === String(family.cameraProfile.runtimeFov);
  controlsSite.dispatchEvent({ type: 'start' });
  const freePreviewState = state.site.anamorphicCameraMode;
  const freePreviewFovDefault = Math.abs(cameraSite.fov - 45) < 1e-9;
  const freePreviewUpDefault = cameraSite.up.distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-9;
  const freePreviewAspectUnrestricted = Math.abs(
    cameraSite.aspect - Math.max(1, viewer.clientWidth) / Math.max(1, viewer.clientHeight)
  ) < 1e-9;
  const freePreviewCanvasUnrestricted = !isAnamorphicCalibrationFramingActive();
  controlsSite.dispatchEvent({ type: 'end' });
  cameraSite.position.add(new THREE.Vector3(1, 0, 0));
  const resetReturned = applyAnamorphicCalibrationCamera();
  const rect = computeContainedAspectRect(
    Math.max(1, viewer.clientWidth),
    Math.max(1, viewer.clientHeight),
    family.workingResolution.aspect
  );
  const actualForward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraSite.quaternion).normalize();
  const normalizedExpectedForward = expectedForward.clone().normalize();
  const targetDirection = new THREE.Vector3().fromArray(family.cameraProfile.runtimeTarget)
    .sub(cameraSite.position)
    .normalize();
  const forwardDot = THREE.MathUtils.clamp(actualForward.dot(normalizedExpectedForward), -1, 1);
  const forwardAngleRadians = actualForward.angleTo(normalizedExpectedForward);
  const result = {
    familyId: family.familyId,
    assetId: family.assetId,
    surfaceSetAvailable: state.site.surfaceSetAvailable,
    activeSurfaceCount: state.site.activeBindings.length,
    visibleSurfaceCount: visibleMeshes.length,
    visibleSurfaceExact: visibleMeshes[0]?.name ?? null,
    expectedSurfaceExact: expectedSurface,
    inactiveAnamorphicVisibleCount,
    missingMeshes: [...state.site.missingMeshes],
    pointDisabled: pointButton.disabled,
    controlsEnabled: controlsSite.enabled,
    helperVisibleCount: state.diagnostics.site3d.helperVisibleCount,
    helperTextureMapCount: state.diagnostics.site3d.helperTextureMapCount,
    surfaceTextureShared: state.site.activeBindings[0]?.mesh.material.map === state.texture,
    cameraFinite: [...cameraSite.position.toArray(), ...cameraSite.quaternion.toArray(), cameraSite.fov, cameraSite.aspect].every(Number.isFinite),
    cameraQuaternionMatches: cameraSite.quaternion.angleTo(expectedQuaternion) < CAMERA_RUNTIME_ROTATION_EPSILON,
    cameraForwardMatches: forwardAngleRadians < CAMERA_FORWARD_ANGLE_EPSILON,
    cameraForwardAudit: {
      actualForward: actualForward.toArray(),
      expectedForward: normalizedExpectedForward.toArray(),
      targetDirection: targetDirection.toArray(),
      cameraPosition: cameraSite.position.toArray(),
      cameraQuaternion: cameraSite.quaternion.toArray(),
      lookAtTarget: family.cameraProfile.runtimeTarget,
      dotProduct: forwardDot,
      angleRadians: forwardAngleRadians,
      angleDegrees: THREE.MathUtils.radToDeg(forwardAngleRadians),
      toleranceRadians: CAMERA_FORWARD_ANGLE_EPSILON,
      comparison: 'THREE_CAMERA_LOCAL_NEGATIVE_Z_VS_NORMALIZED_RUNTIME_FORWARD',
      fovInvolved: false,
      aspectInvolved: false,
      projectionMatrixInvolved: false
    },
    runtimeProjectionAspectMatches: Math.abs(cameraSite.aspect - family.cameraProfile.runtimeAspect) < 1e-12,
    runtimeProjectionAspect: family.cameraProfile.runtimeAspect,
    workingCanvasAspect: family.workingResolution.aspect,
    projectionAndWorkingAspectSeparated: Math.abs(family.cameraProfile.runtimeAspect - family.workingResolution.aspect) > 1e-12,
    workingCanvasAspectMatches: Math.abs(rect.aspect - family.workingResolution.width / family.workingResolution.height) < 1e-12,
    baselineVerticalFovMatches,
    editableFovApplied,
    editableFovMatches,
    editableFovMode,
    fovResetReturned,
    fovResetMatches,
    freePreviewState,
    freePreviewFovDefault,
    freePreviewUpDefault,
    freePreviewAspectUnrestricted,
    freePreviewCanvasUnrestricted,
    resetReturned,
    resetMode: state.site.anamorphicCameraMode,
    calibrationMatteActive: isAnamorphicCalibrationFramingActive(),
    calibrationMatteColor: ANAMORPHIC_CALIBRATION_MATTE_HEX,
    visualValidationState: family.cameraProfile.visualValidationState,
    missingFamiliesUnavailable: Object.entries(ANAMORPHIC_FAMILY_AVAILABILITY)
      .filter(([familyId]) => ![ANAMORPHIC_FAMILY_IDS.FRONT_75F, ANAMORPHIC_FAMILY_IDS.BACK].includes(familyId))
      .every(([, availability]) => availability.available === false && availability.status === 'NOT_AVAILABLE'),
    contextLossCount: state.contextLossCount
  };
  state.site.mappingMode = 'normal';
  siteMappingSelect.value = state.site.mappingMode;
  applySiteSurfaceSelection();
  return result;
}

window.runBlock5AAnamorphicSmoke = () => runAnamorphicFamilySmoke('front75f', 'ANAM_SURFACE_FRONT75F');
window.runBlock5BBackSmoke = () => runAnamorphicFamilySmoke('back', 'ANAM_SURFACE_BACK');
async function runProjectionFamilySmoke(familyKey, repetitions, maskMode = 'production') {
  setActiveView('site-3d');
  state.site.world = 'world3d';
  state.site.mappingMode = 'anamorphic';
  state.site.anamorphicFamily = familyKey;
  siteWorldSelect.value = state.site.world;
  siteMappingSelect.value = state.site.mappingMode;
  siteAnamorphicFamilySelect.value = state.site.anamorphicFamily;
  applySiteSurfaceSelection();
  const profile = currentProjectionBakeProfile();
  if (!profile) throw new Error(`No Block 6B projection profile for ${familyKey}.`);
  const before = {
    fov: cameraSite.fov,
    aspect: cameraSite.aspect,
    position: cameraSite.position.toArray(),
    quaternion: cameraSite.quaternion.toArray(),
    target: controlsSite.target.toArray(),
    surfaceGeometryUuid: state.site.activeBindings[0]?.mesh.geometry.uuid,
    surfaceMatrix: state.site.activeBindings[0]?.mesh.matrixWorld.toArray()
  };
  const result = await runProjectionBake({ repetitions, maskMode });
  const after = {
    fov: cameraSite.fov,
    aspect: cameraSite.aspect,
    position: cameraSite.position.toArray(),
    quaternion: cameraSite.quaternion.toArray(),
    target: controlsSite.target.toArray(),
    surfaceGeometryUuid: state.site.activeBindings[0]?.mesh.geometry.uuid,
    surfaceMatrix: state.site.activeBindings[0]?.mesh.matrixWorld.toArray()
  };
  result.calibrationCameraUnchanged = JSON.stringify(before) === JSON.stringify(after);
  const manifestProfile = state.manifest?.projectionBake?.profiles?.[profile.familyId];
  result.productionMaskManifestVerified = profile.productionMask.runtimeUrl
    ? manifestProfile?.mask?.sourceVerified === true &&
      manifestProfile?.mask?.buildCopyVerified === true &&
      manifestProfile?.mask?.sha256 === profile.productionMask.sha256
    : manifestProfile?.mask?.status === 'NOT_SUPPLIED' &&
      manifestProfile?.mask?.fallback === 'FULL_WHITE_DIAGNOSTIC';
  const manifestMatte = state.manifest?.projectionBake?.matte;
  result.dedicatedMatteManifestVerified = manifestMatte?.sourceVerified === true &&
    manifestMatte?.buildCopyVerified === true &&
    manifestMatte?.assetLogicalId === profile.validity.occluderBinding.assetLogicalId &&
    manifestMatte?.sha256 === profile.validity.occluderBinding.sha256 &&
    JSON.stringify(manifestMatte?.exactNames) === JSON.stringify(profile.validity.occluderBinding.exactNames);
  result.maskControlModes = ['production', 'full-white', 'synthetic'];
  result.photoshopWritePerformed = false;
  result.externalNetworkRequestCount = 0;
  result.technicalPass = result.technicalPass &&
    result.calibrationCameraUnchanged &&
    result.productionMaskManifestVerified &&
    result.dedicatedMatteManifestVerified &&
    (maskMode === 'production'
      ? result.mask.enabled === true && result.mask.mode === 'production' && result.mask.scalarOperation === profile.productionMask.scalarOperation
      : result.mask.enabled === false && result.mask.mode === 'full-white' && result.mask.exactLinearInversion === false) &&
    result.photoshopWritePerformed === false;
  state.projectionBake.result = result;
  state.projectionBake.status = result.technicalPass ? 'TECHNICAL PASS' : 'TECHNICAL CHECK';
  syncProjectionPocUi();
  updateProjectionPocMetrics(result);
  updateDiagnostics();
  return result;
}

window.runBlock6AProjectionSmoke = async () => {
  const result = await runProjectionFamilySmoke('front75f', 3);
  result.userValidation = 'PASS_CLOSED';
  result.block6BUserValidation = 'PASS_CLOSED';
  window.block6AProjectionDiagnostics = structuredClone(result);
  return result;
};

window.runBlock6BProjectionSmoke = async () => {
  const contextLossBefore = state.contextLossCount;
  const disposeBefore = projectionBakeRuntime.disposeCount;
  const frontInitial = await runProjectionFamilySmoke('front75f', 3, 'full-white');
  const back = await runProjectionFamilySmoke('back', 8, 'full-white');
  const frontReturn = await runProjectionFamilySmoke('front75f', 3, 'full-white');
  const sequence = [frontInitial.familyId, back.familyId, frontReturn.familyId];
  const report = {
    block: '6B',
    userValidation: 'PASS_CLOSED',
    normalBakeMaskMode: 'OFF_FULL_WHITE',
    sequence,
    familySwitchPass: JSON.stringify(sequence) === JSON.stringify([
      ANAMORPHIC_FAMILY_IDS.FRONT_75F,
      ANAMORPHIC_FAMILY_IDS.BACK,
      ANAMORPHIC_FAMILY_IDS.FRONT_75F
    ]),
    frontInitial,
    back,
    frontReturn,
    contextLossCount: state.contextLossCount - contextLossBefore,
    resourcesDisposedAcrossFamilySwitch: projectionBakeRuntime.disposeCount - disposeBefore,
    photoshopWritePerformed: false
  };
  report.technicalPass = report.familySwitchPass &&
    frontInitial.technicalPass && back.technicalPass && frontReturn.technicalPass &&
    frontInitial.resourcePolicy.stableAcrossRuns && back.resourcePolicy.stableAcrossRuns && frontReturn.resourcePolicy.stableAcrossRuns &&
    report.contextLossCount === 0 && report.resourcesDisposedAcrossFamilySwitch >= 2 && report.photoshopWritePerformed === false;
  state.projectionBake.result = frontReturn;
  state.projectionBake.status = report.technicalPass ? 'TECHNICAL PASS' : 'TECHNICAL CHECK';
  window.block6BProjectionDiagnostics = structuredClone(report);
  syncProjectionPocUi(); updateProjectionPocMetrics(frontReturn); updateDiagnostics();
  return report;
};
window.runBlock7MaskOffSmoke = async () => {
  const contextLossBefore = state.contextLossCount;
  state.projectionBake.maskEnabledByFamily[ANAMORPHIC_FAMILY_IDS.FRONT_75F] = false;
  state.projectionBake.maskEnabledByFamily[ANAMORPHIC_FAMILY_IDS.BACK] = false;
  const front = await runProjectionFamilySmoke('front75f', 1, 'full-white');
  const back = await runProjectionFamilySmoke('back', 1, 'full-white');
  const report = {
    block: '7-MASK-CORRECTION',
    defaultOff: state.projectionBake.maskEnabledByFamily[ANAMORPHIC_FAMILY_IDS.FRONT_75F] === false &&
      state.projectionBake.maskEnabledByFamily[ANAMORPHIC_FAMILY_IDS.BACK] === false,
    front,
    back,
    backCameraFamilyCorrect: back.familyId === ANAMORPHIC_FAMILY_IDS.BACK &&
      back.camera.fov === getProjectionBakeProfile(ANAMORPHIC_FAMILY_IDS.BACK).calibrationCamera.runtimeFov &&
      back.surfaceNames[0] === 'ANAM_SURFACE_BACK',
    contextLossCount: state.contextLossCount - contextLossBefore
  };
  report.technicalPass = report.defaultOff && front.technicalPass && back.technicalPass &&
    front.mask.enabled === false && back.mask.enabled === false &&
    front.mask.status === 'DISABLED_FULL_WHITE_CONTROL' && back.mask.status === 'DISABLED_FULL_WHITE_CONTROL' &&
    front.visibleScreenPixelCount > 0 && back.visibleScreenPixelCount > 0 &&
    report.backCameraFamilyCorrect && report.contextLossCount === 0;
  state.projectionBake.result = back;
  state.projectionBake.status = report.technicalPass ? 'TECHNICAL PASS' : 'TECHNICAL CHECK';
  window.block7MaskOffDiagnostics = structuredClone(report);
  syncProjectionPocUi(); updateProjectionPocMetrics(back); updateDiagnostics();
  return report;
};
window.runPostBlock7BakeVisibilityCorrectionSmoke = async () => {
  const contextLossBefore = state.contextLossCount;
  const disposeBefore = projectionBakeRuntime.disposeCount;
  state.projectionBake.maskEnabledByFamily[ANAMORPHIC_FAMILY_IDS.FRONT_75F] = false;
  state.projectionBake.maskEnabledByFamily[ANAMORPHIC_FAMILY_IDS.BACK] = false;
  const frontInitial = await runProjectionFamilySmoke('front75f', 3, 'full-white');
  const frontDiagnostic = projectionBakeRuntime.visibilityDiagnosticDataUrl();
  const frontArtifacts = {
    direct: projectionBakeRuntime.outputDataUrl('direct'),
    canonical: projectionBakeRuntime.outputDataUrl('canonical'),
    reprojected: projectionBakeRuntime.outputDataUrl('reprojected')
  };
  const back = await runProjectionFamilySmoke('back', 3, 'full-white');
  const backDiagnostic = projectionBakeRuntime.visibilityDiagnosticDataUrl();
  const backArtifacts = {
    direct: projectionBakeRuntime.outputDataUrl('direct'),
    canonical: projectionBakeRuntime.outputDataUrl('canonical'),
    reprojected: projectionBakeRuntime.outputDataUrl('reprojected')
  };
  const frontReturn = await runProjectionFamilySmoke('front75f', 1, 'full-white');
  const sequence = [frontInitial.familyId, back.familyId, frontReturn.familyId];
  const profileDepthPass = (result) => {
    const expectedOccluderNames = getProjectionBakeProfile(result.familyId)?.validity.occluderBinding.exactNames || [];
    return result.mask.enabled === false &&
      result.mask.mode === 'full-white' &&
      result.visibility.method === 'PROJECTION_CAMERA_DEPTH_TEXTURE_FRONTMOST' &&
      result.visibility.depthSource === 'FAMILY_BOUND_SIGNAGE_SURFACE_PLUS_DEDICATED_INNER_MATTE' &&
      result.visibility.environmentDepthIncluded === false &&
      result.visibility.dedicatedMatteDepthIncluded === true &&
      result.directProjection.matteIncluded === true &&
      result.directProjection.matteScope === 'PROJECTION_BAKE_OFFSCREEN_ONLY' &&
      result.directProjection.environmentColorIncluded === false &&
      result.visibility.occluderSelectorPolicy === 'EXACT_NAME_ONLY_DEPTH_ONLY_NO_COLOR' &&
      JSON.stringify(result.occluderNames) === JSON.stringify(expectedOccluderNames) &&
      result.matteAsset.assetLogicalId === 'anamorphic-bake-matte-inner' &&
      result.matteAsset.loadScope === 'PROJECTION_BAKE_RUN_ONLY' &&
      result.matteAsset.ordinarySceneAttached === false &&
      result.matteAsset.disposedAfterBake === true &&
      result.visibility.facingPolicy === 'NO_NORMAL_THRESHOLD_DEPTH_PRIMARY_GRAZING_PRESERVED' &&
      result.visibilityAgreement.reprojectOnlyPixelCount === 0 &&
      result.visibilityAgreement.silhouetteIou >= result.technicalThresholds.silhouetteIouMin &&
      result.visibilityDiagnostic.occludedPixelCount > 0 &&
      result.resourcePolicy.stableAcrossRuns === true;
  };
  const report = {
    correction: 'POST-BLOCK-7-BAKE-VISIBILITY',
    sequence,
    maskOff: true,
    visibilityArchitectureShared: frontInitial.visibility.method === back.visibility.method &&
      frontInitial.visibility.depthComparison === back.visibility.depthComparison,
    familyCalibrationUnchanged: frontInitial.calibrationCameraUnchanged &&
      back.calibrationCameraUnchanged && frontReturn.calibrationCameraUnchanged,
    glbGeometryModified: false,
    frontInitial,
    back,
    frontReturn,
    diagnostics: { frontDataUrl: frontDiagnostic, backDataUrl: backDiagnostic },
    resourcesDisposedAcrossFamilySwitch: projectionBakeRuntime.disposeCount - disposeBefore,
    contextLossCount: state.contextLossCount - contextLossBefore
  };
  report.technicalPass = JSON.stringify(sequence) === JSON.stringify([
    ANAMORPHIC_FAMILY_IDS.FRONT_75F,
    ANAMORPHIC_FAMILY_IDS.BACK,
    ANAMORPHIC_FAMILY_IDS.FRONT_75F
  ]) &&
    report.visibilityArchitectureShared &&
    report.familyCalibrationUnchanged &&
    report.glbGeometryModified === false &&
    profileDepthPass(frontInitial) && profileDepthPass(back) && profileDepthPass(frontReturn) &&
    report.resourcesDisposedAcrossFamilySwitch >= 2 &&
    report.contextLossCount === 0;
  delete report.diagnostics.frontDataUrl;
  delete report.diagnostics.backDataUrl;
  report.diagnostics.frontFileName = 'PostBlock7_FRONT75F_VisibilityDiagnostic.png';
  report.diagnostics.backFileName = 'PostBlock7_BACK_VisibilityDiagnostic.png';
  window.postBlock7BakeVisibilityCorrectionDiagnostics = structuredClone(report);
  window.__postBlock7VisibilityDiagnosticDataUrls = { front: frontDiagnostic, back: backDiagnostic };
  window.__postBlock7VisibilityCorrectionDataUrls = { front: frontArtifacts, back: backArtifacts };
  return report;
};
window.getPostBlock7VisibilityDiagnosticArtifacts = () => window.__postBlock7VisibilityDiagnosticDataUrls || null;
window.getPostBlock7VisibilityCorrectionArtifacts = () => window.__postBlock7VisibilityCorrectionDataUrls || null;
window.getBlock6APreviewArtifacts = () => projectionBakeRuntime.previewDataUrls(projectionPreviewCanvases);
window.getBlock6AFullSourceArtifact = () => projectionBakeRuntime.fullSourceDataUrl();
window.inspectBlock6AExportPng = async (kind) => {
  const { blob: _blob, ...metadata } = await projectionBakeRuntime.exportPng(kind);
  return metadata;
};
window.getBlock6BPreviewArtifacts = window.getBlock6APreviewArtifacts;
window.getBlock6BFullSourceArtifact = window.getBlock6AFullSourceArtifact;
window.inspectBlock6BExportPng = window.inspectBlock6AExportPng;

window.runBlock4BCameraEditorSmoke = () => {
  setActiveView('site-3d');
  state.site.world = 'legacy2d';
  state.site.mappingMode = 'normal';
  state.site.scene = 'front';
  siteWorldSelect.value = state.site.world;
  siteMappingSelect.value = state.site.mappingMode;
  siteSceneSelect.value = state.site.scene;
  state.site.legacyCameraLocked = true;
  applySiteSurfaceSelection();
  const record = currentLegacyCameraRecord();
  const legacyX = record.legacyValues.position.x;
  const baseline = cloneCameraValues(record.currentValues);

  toggleLegacyCameraLock();
  cameraInputMode.value = CAMERA_INPUT_MODES.THREE_DIRECT;
  state.site.cameraEditor.inputMode = CAMERA_INPUT_MODES.THREE_DIRECT;
  populateCameraEditorFromRecord();
  cameraThreeInputs.position.x.value = String(baseline.position.x + 0.125);
  cameraThreeInputs.rotation.x.value = '33.5';
  const directApplied = applyCameraEditorTransaction();
  const independentCurrent = record.currentValues.position.x === baseline.position.x + 0.125 &&
    record.currentValues.orientation.x === 33.5 &&
    record.legacyValues.position.x === legacyX;
  const directRotationApplied = Math.abs(THREE.MathUtils.radToDeg(cameraSite.rotation.x) - 33.5) < 1e-9;

  cameraSite.position.x += 2;
  const resetViewApplied = resetCameraEditorView();
  const resetViewExact = Math.abs(cameraSite.position.x - record.currentValues.position.x) < 1e-9;
  const resetLegacyApplied = resetCameraEditorToLegacy();
  const legacyExact = record.currentValues.position.x === legacyX && record.legacyValues.position.x === legacyX;

  lockLegacyCamera();
  cameraThreeInputs.position.x.value = String(legacyX + 5);
  const lockedMutationRejected = !applyCameraEditorTransaction() && record.currentValues.position.x === legacyX;
  populateCameraEditorFromRecord();
  updateDiagnostics();
  return {
    directApplied,
    directRotationApplied,
    independentCurrent,
    resetViewApplied,
    resetViewExact,
    resetLegacyApplied,
    legacyExact,
    lockedMutationRejected,
    finalLocked: state.site.legacyCameraLocked,
    threeFieldsVisible: getComputedStyle(cameraThreeFields).display !== 'none',
    maxFieldsHidden: getComputedStyle(cameraMaxFields).display === 'none'
  };
};

window.runBlock4CPhotoSceneSmoke = async () => {
  setActiveView('site-3d');
  const rendererTextureBaseline = renderer.info.memory.textures;
  const rendererTextureBudget = rendererTextureBaseline + 1;
  state.site.world = 'legacy2d';
  state.site.mappingMode = 'normal';
  siteWorldSelect.value = state.site.world;
  siteMappingSelect.value = state.site.mappingMode;
  const sceneResults = [];
  for (const sceneId of ['front', 'frontSweet', 'back', 'night']) {
    state.site.scene = sceneId;
    siteSceneSelect.value = sceneId;
    lockLegacyCamera();
    applySiteSurfaceSelection();
    const activation = await state.photo.activationPromise;
    updateDiagnostics();
    sceneResults.push({
      sceneId,
      activationStatus: activation.status,
      photoSceneId: state.photo.sceneId,
      ready: isPhotoViewportActive(),
      resourceCount: state.photo.activeResource ? 1 : 0,
      photoTextureInstalled: photoPlane.material.map === state.photo.activeResource?.texture,
      visibleSurfaceCount: state.site.activeBindings.filter((binding) => binding.mesh.visible).length,
      expectedSurfaceCount: state.site.activeBindings.length,
      cameraAspect: cameraSite.aspect,
      cameraLocked: state.site.legacyCameraLocked,
      runtimeUrl: state.photo.runtimeUrl
    });
  }

  state.site.scene = 'front';
  applySiteSurfaceSelection();
  const rapidFront = state.photo.activationPromise;
  state.site.scene = 'back';
  applySiteSurfaceSelection();
  const rapidBack = state.photo.activationPromise;
  state.site.scene = 'night';
  siteSceneSelect.value = 'night';
  applySiteSurfaceSelection();
  const rapidNight = state.photo.activationPromise;
  const rapidResults = await Promise.all([rapidFront, rapidBack, rapidNight]);
  updateDiagnostics();

  const stressPromises = [];
  const stressScenes = ['front', 'frontSweet', 'back', 'night'];
  for (let index = 0; index < 24; index += 1) {
    state.site.scene = stressScenes[index % stressScenes.length];
    siteSceneSelect.value = state.site.scene;
    applySiteSurfaceSelection();
    stressPromises.push(state.photo.activationPromise);
  }
  const stressResults = await Promise.all(stressPromises);
  await nextFrame();
  render();
  const stressFinalSceneId = photoSceneForLegacySelection()?.sceneId;
  const stressLatestWins = stressResults.at(-1)?.status === 'READY' &&
    stressResults.slice(0, -1).every((result) => result.status === 'STALE') &&
    state.photo.sceneId === stressFinalSceneId && state.photo.activeResource &&
    photoPlane.material.map === state.photo.activeResource.texture &&
    renderer.info.memory.textures <= rendererTextureBudget;

  const contentRect = { ...state.photo.contentRect };
  const bounds = canvas.getBoundingClientRect();
  const outside = contentRect.y > 0
    ? clientPointToContentNdc(
      bounds.left + contentRect.x + contentRect.width / 2,
      bounds.top + contentRect.y - 1,
      bounds,
      contentRect
    )
    : clientPointToContentNdc(
      bounds.left + contentRect.x - 1,
      bounds.top + contentRect.y + contentRect.height / 2,
      bounds,
      contentRect
    );
  const center = clientPointToContentNdc(
    bounds.left + contentRect.x + contentRect.width / 2,
    bounds.top + contentRect.y + contentRect.height / 2,
    bounds,
    contentRect
  );
  const beforePassiveRender = {
    loadCount: state.photo.loadCount,
    runtimeUrl: state.photo.runtimeUrl,
    sceneId: state.photo.sceneId,
    camera: snapshotSiteCameraRuntime()
  };
  render();
  const passiveRenderPreserved = state.photo.loadCount === beforePassiveRender.loadCount &&
    state.photo.runtimeUrl === beforePassiveRender.runtimeUrl &&
    state.photo.sceneId === beforePassiveRender.sceneId &&
    cameraSite.position.distanceTo(beforePassiveRender.camera.position) === 0 &&
    cameraSite.quaternion.angleTo(beforePassiveRender.camera.quaternion) === 0;

  return {
    allScenesReady: sceneResults.every((result) =>
      result.activationStatus === 'READY' && result.ready && result.resourceCount === 1 &&
      result.photoTextureInstalled && result.visibleSurfaceCount === result.expectedSurfaceCount &&
      result.cameraAspect === PHOTO_CONTENT_ASPECT && result.cameraLocked &&
      result.runtimeUrl?.startsWith('./assets/photo/')),
    sceneResults,
    rapidLatestWins: rapidResults[2].status === 'READY' &&
      rapidResults.slice(0, 2).every((result) => result.status === 'STALE') &&
      state.photo.sceneId === 'NIGHT' && photoPlane.material.map === state.photo.activeResource?.texture,
    rapidResults: rapidResults.map((result) => result.status),
    stressSwitchCount: stressResults.length,
    stressLatestWins,
    rendererTextureCountAfterStress: renderer.info.memory.textures,
    rendererTextureBaseline,
    rendererTextureBudget,
    contentAspectExact: contentRect.width / contentRect.height === PHOTO_CONTENT_ASPECT,
    outsideContentRejected: outside === null,
    centerNdcExact: center?.x === 0 && center?.y === 0,
    passiveRenderPreserved,
    photoResourceCount: state.photo.activeResource ? 1 : 0,
    photoRuntime: {
      imageComplete: Boolean(state.photo.activeResource?.image.complete),
      imageCurrentSrc: state.photo.activeResource?.image.currentSrc || '',
      imageWidth: state.photo.activeResource?.image.naturalWidth || 0,
      imageHeight: state.photo.activeResource?.image.naturalHeight || 0,
      textureInstalled: photoPlane.material.map === state.photo.activeResource?.texture
    },
    contextLossCount: state.contextLossCount
  };
};

window.runBlock4CPhotoPointerSmokeRequest = async () => {
  setActiveView('site-3d');
  state.site.world = 'legacy2d';
  state.site.mappingMode = 'normal';
  state.site.scene = 'front';
  siteWorldSelect.value = state.site.world;
  siteMappingSelect.value = state.site.mappingMode;
  siteSceneSelect.value = state.site.scene;
  lockLegacyCamera();
  applySiteSurfaceSelection();
  const activation = await state.photo.activationPromise;
  if (activation.status !== 'READY' || !isPhotoViewportActive()) {
    throw new Error('Synthetic photo pointer smoke requires a ready FRONT photo scene.');
  }
  if (!setInteractionMode('point')) throw new Error('Synthetic photo pointer smoke requires an active Photoshop Live source.');
  const bounds = canvas.getBoundingClientRect();
  const rect = state.photo.contentRect;
  let surfaceHit = null;
  for (const yFraction of [0.5, 0.35, 0.65, 0.2, 0.8]) {
    for (const xFraction of [0.5, 0.35, 0.65, 0.2, 0.8]) {
      surfaceHit = mapClientPointToSurfaceHit(
        bounds.left + rect.x + rect.width * xFraction,
        bounds.top + rect.y + rect.height * yFraction
      );
      if (surfaceHit) break;
    }
    if (surfaceHit) break;
  }
  if (!surfaceHit) throw new Error('Synthetic photo pointer scan did not intersect the exact FRONT signage mesh.');
  const command = requestPointerAt(surfaceHit.canonical, surfaceHit);
  return {
    command,
    canonical: surfaceHit.canonical,
    surfaceHit,
    photoSceneId: state.photo.sceneId,
    photoResourceCount: state.photo.activeResource ? 1 : 0,
    contentRect: { ...state.photo.contentRect }
  };
};

async function waitForEnvironmentReady(timeoutMs = 15000) {
  const started = performance.now();
  while (state.environment.status === 'LOADING' && performance.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  if (state.environment.status !== 'READY') {
    throw new Error(state.environment.error || 'Environment runtime did not become ready.');
  }
}

window.runBlock4DEnvironmentSmoke = async () => {
  await waitForEnvironmentReady();
  setActiveView('site-3d');
  state.site.world = 'world3d';
  state.site.mappingMode = 'normal';
  siteWorldSelect.value = state.site.world;
  siteMappingSelect.value = state.site.mappingMode;
  applySiteSurfaceSelection();

  state.environment.presentation = 'day';
  applyEnvironmentPresentation();
  render();
  const day = {
    clearColor: renderer.getClearColor(new THREE.Color()).getHex(),
    hemisphereIntensity: environmentHemisphereLight.intensity,
    directionalIntensity: environmentDirectionalLight.intensity
  };
  state.environment.presentation = 'night';
  applyEnvironmentPresentation();
  render();
  const night = {
    clearColor: renderer.getClearColor(new THREE.Color()).getHex(),
    hemisphereIntensity: environmentHemisphereLight.intensity,
    directionalIntensity: environmentDirectionalLight.intensity
  };

  state.site.world = 'legacy2d';
  siteWorldSelect.value = state.site.world;
  applySiteSurfaceSelection();
  const hiddenOutsideWorld3d = state.environment.root.visible === false;
  state.site.world = 'world3d';
  siteWorldSelect.value = state.site.world;
  state.environment.presentation = SITE_ENVIRONMENT_PROFILE.defaultPresentation;
  applyEnvironmentPresentation();
  applySiteSurfaceSelection();
  updateDiagnostics();

  const materialOverrideExact = state.environment.visibleMeshes.every((mesh) =>
    mesh.material?.isMeshStandardMaterial && mesh.material.map === null &&
    mesh.material.roughness === SITE_ENVIRONMENT_PROFILE.material.roughness &&
    mesh.material.metalness === SITE_ENVIRONMENT_PROFILE.material.metalness &&
    mesh.material.side === THREE.DoubleSide);
  const rootTransformIdentity = state.environment.root.position.lengthSq() === 0 &&
    state.environment.root.quaternion.angleTo(new THREE.Quaternion()) === 0 &&
    state.environment.root.scale.distanceTo(new THREE.Vector3(1, 1, 1)) === 0;
  return {
    status: state.environment.status,
    assetFile: SITE_ENVIRONMENT_PROFILE.asset.fileName,
    revisionChanged: state.manifest.environmentAsset.revisionChanged,
    coordinatePolicy: SITE_ENVIRONMENT_PROFILE.asset.coordinatePolicy,
    meshCount: state.environment.meshes.length,
    visibleMeshCount: state.environment.visibleMeshes.length,
    excludedMeshCount: state.environment.excludedMeshes.length,
    unmatchedExclusions: [...state.environment.unmatchedExclusions],
    rootVisibleInWorld3d: state.environment.root.visible,
    hiddenOutsideWorld3d,
    rootTransformIdentity,
    allTransformsFinite: state.diagnostics.environment.allRuntimeTransformsFinite,
    materialOverrideExact,
    pointTargetCount: state.diagnostics.environment.raycastTargetCount,
    raycastDisabled: state.environment.meshes.every((mesh) => mesh.userData.environmentRole === 'SITE_ENVIRONMENT'),
    loadCount: state.environment.loadCount,
    day,
    night,
    nightDarker: night.hemisphereIntensity < day.hemisphereIntensity &&
      night.directionalIntensity < day.directionalIntensity,
    strictSignageStillActive: state.site.activeBindings.length === 2 &&
      state.site.activeBindings.every((binding) => !state.environment.meshes.includes(binding.mesh)),
    presentationControlVisible: !environmentPresentationControl.hidden
  };
};

function siteSnapshotMatchesRuntime(snapshot) {
  return cameraSite.position.toArray().every((value, index) => value === snapshot.camera.position[index]) &&
    cameraSite.quaternion.toArray().every((value, index) => value === snapshot.camera.quaternion[index]) &&
    cameraSite.up.toArray().every((value, index) => value === snapshot.camera.up[index]) &&
    controlsSite.target.toArray().every((value, index) => value === snapshot.orbitControls.target[index]) &&
    cameraSite.fov === snapshot.camera.fov && cameraSite.zoom === snapshot.camera.zoom &&
    cameraSite.near === snapshot.camera.near && cameraSite.far === snapshot.camera.far &&
    state.environment.presentation === snapshot.environmentLightingMode &&
    state.locations.visible === snapshot.markerVisibility;
}

window.runBlock4ELocationSmoke = async () => {
  await waitForEnvironmentReady();
  setActiveView('site-3d');
  state.site.world = 'world3d';
  state.site.mappingMode = 'normal';
  state.locations.visible = true;
  state.interactionMode = 'navigate';
  siteWorldSelect.value = state.site.world;
  siteMappingSelect.value = state.site.mappingMode;
  applySiteSurfaceSelection({ resetCamera: false });

  const bounds = new THREE.Box3();
  for (const record of LOCATION_RECORDS) {
    bounds.expandByPoint(new THREE.Vector3(record.worldPosition.x, record.worldPosition.y, record.worldPosition.z));
  }
  const center = bounds.getCenter(new THREE.Vector3());
  const radius = Math.max(1, bounds.getSize(new THREE.Vector3()).length() * 0.5);
  cameraSite.position.copy(center).add(new THREE.Vector3(radius * 0.9, radius * 1.05, radius * 1.5));
  cameraSite.fov = 50;
  cameraSite.zoom = 1;
  cameraSite.up.set(0, 1, 0);
  controlsSite.target.copy(center);
  controlsSite.update();
  state.environment.presentation = 'night';
  applyEnvironmentPresentation();
  render();
  updateDiagnostics();
  await Promise.all([...state.locations.elements.values()].map(async (element) => {
    const image = element.querySelector('img');
    if (image && !image.complete) await image.decode().catch(() => {});
  }));
  render();

  const visibleBeforeToggle = [...state.locations.elements.values()].filter((element) => !element.hidden).length;
  state.locations.visible = false;
  syncLocationControls();
  render();
  const allHiddenWhenOff = [...state.locations.elements.values()].every((element) => element.hidden);
  state.locations.visible = true;
  syncLocationControls();
  render();
  const visibleAfterToggle = [...state.locations.elements.values()].filter((element) => !element.hidden).length;

  state.interactionMode = 'point';
  updateLocationMarkers();
  const pointPassThrough = [...state.locations.elements.values()].every((element) => getComputedStyle(element).pointerEvents === 'none');
  state.interactionMode = 'navigate';
  updateLocationMarkers();

  const initialSiteSnapshot = captureSiteReturnState();
  const sceneResults = [];
  for (const record of LOCATION_RECORDS) {
    const activation = await activateLocation(record.locationId);
    const photoSceneId = state.photo.sceneId;
    const locked = state.site.legacyCameraLocked;
    const returnResult = await returnToSite();
    sceneResults.push({
      locationId: record.locationId,
      expectedPhotoSceneId: record.photoSceneId,
      photoSceneId,
      activationStatus: activation.status,
      locked,
      returnStatus: returnResult.status,
      exactReturn: siteSnapshotMatchesRuntime(initialSiteSnapshot)
    });
  }

  const rapidA = activateLocation(LOCATION_RECORDS[0].locationId);
  const rapidB = activateLocation(LOCATION_RECORDS[3].locationId);
  const rapidResults = await Promise.all([rapidA, rapidB]);
  const rapidLatestWins = rapidResults[0].status === 'STALE' && rapidResults[1].status === 'READY' &&
    state.photo.sceneId === LOCATION_RECORDS[3].photoSceneId;
  const rapidReturn = await returnToSite();

  state.site.world = 'legacy2d';
  state.site.mappingMode = 'normal';
  state.site.scene = 'front';
  siteWorldSelect.value = state.site.world;
  siteMappingSelect.value = state.site.mappingMode;
  siteSceneSelect.value = state.site.scene;
  applySiteSurfaceSelection();
  await state.photo.activationPromise;
  syncLocationControls();
  const directEntryHasNoFakeReturn = !locationNavigation.siteSnapshot && returnToSiteButton.hidden;
  await restoreSiteReturnState(initialSiteSnapshot);

  const records = LOCATION_RECORDS.map((record) => {
    const builtPhoto = state.manifest.photoAssets.find((candidate) => candidate.sceneId === record.photoSceneId);
    const element = state.locations.elements.get(record.locationId);
    const image = element?.querySelector('img');
    return {
      locationId: record.locationId,
      photoSceneId: record.photoSceneId,
      proxyReady: builtPhoto?.thumbnail?.status === 'READY' && image?.naturalWidth === 450 && image?.naturalHeight === 300,
      visualTextLabel: element?.textContent.trim() || ''
    };
  });
  updateDiagnostics();
  return {
    records,
    fourIndependent: records.length === 4 && new Set(records.map((record) => record.locationId)).size === 4,
    allProxiesReady: records.every((record) => record.proxyReady),
    noVisualTextLabels: records.every((record) => record.visualTextLabel === ''),
    visibleBeforeToggle,
    allHiddenWhenOff,
    visibleAfterToggle,
    pointPassThrough,
    sceneResults,
    allLocationsNavigate: sceneResults.every((result) => result.activationStatus === 'READY' &&
      result.photoSceneId === result.expectedPhotoSceneId && result.locked),
    exactReturns: sceneResults.every((result) => result.returnStatus === 'RETURNED' && result.exactReturn),
    rapidResults: rapidResults.map((result) => result.status),
    rapidLatestWins,
    rapidReturn: rapidReturn.status,
    directEntryHasNoFakeReturn,
    finalSiteExact: siteSnapshotMatchesRuntime(initialSiteSnapshot),
    contextLossCount: state.contextLossCount,
    userValidation: 'REQUIRED_OPEN'
  };
};

window.runBlock0SmokeActions = async () => {
  const previousView = state.activeView;
  setActiveView('2d');
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
  setActiveView(previousView);
  return {
    ...diagnostics,
    actions,
    sourceVariants,
    reloadTextureCounts: textureCounts,
    memoryStable
  };
};

window.runBlock4FStartupViewSmoke = async () => {
  const startup = {
    activeView: state.activeView,
    siteButtonActive: viewSite3dButton.classList.contains('active'),
    twoDButtonActive: view2dButton.classList.contains('active'),
    siteStatus: state.site.status,
    surfaceSetAvailable: state.site.surfaceSetAvailable,
    activeSurfaceCount: state.site.activeBindings.length,
    environmentStatus: state.environment.status,
    environmentVisible: Boolean(state.environment.root?.visible),
    locationsControlVisible: !locationsToggleButton.hidden,
    locationsVisible: state.locations.visible,
    rendererTextureCount: renderer.info.memory.textures,
    contextLossCount: state.contextLossCount
  };

  setActiveView('2d');
  await nextFrame();
  const twoD = {
    activeView: state.activeView,
    buttonActive: view2dButton.classList.contains('active'),
    fullResolution: state.diagnostics.fullResolution,
    sourceMatchesTexture: state.diagnostics.sourceWidth === state.diagnostics.textureWidth &&
      state.diagnostics.sourceHeight === state.diagnostics.textureHeight,
    controlsEnabled: [fitButton, oneButton, twoButton, fourButton].every((button) => !button.disabled),
    rendererTextureCount: renderer.info.memory.textures
  };

  setActiveView(DEFAULT_ACTIVE_VIEW);
  await nextFrame();
  const reentry = {
    activeView: state.activeView,
    siteButtonActive: viewSite3dButton.classList.contains('active'),
    siteStatus: state.site.status,
    surfaceSetAvailable: state.site.surfaceSetAvailable,
    activeSurfaceCount: state.site.activeBindings.length,
    environmentVisible: Boolean(state.environment.root?.visible),
    locationsControlVisible: !locationsToggleButton.hidden,
    rendererTextureCount: renderer.info.memory.textures,
    contextLossCount: state.contextLossCount
  };

  return {
    defaultActiveView: DEFAULT_ACTIVE_VIEW,
    startup,
    twoD,
    reentry,
    pass: startup.activeView === DEFAULT_ACTIVE_VIEW && startup.siteButtonActive && !startup.twoDButtonActive &&
      startup.siteStatus === 'READY' && startup.surfaceSetAvailable && startup.activeSurfaceCount === 2 &&
      startup.environmentStatus === 'READY' && startup.environmentVisible && startup.locationsControlVisible &&
      startup.contextLossCount === 0 && twoD.activeView === '2d' && twoD.buttonActive &&
      twoD.fullResolution && twoD.sourceMatchesTexture && twoD.controlsEnabled &&
      twoD.rendererTextureCount === startup.rendererTextureCount &&
      reentry.activeView === DEFAULT_ACTIVE_VIEW && reentry.siteButtonActive && reentry.siteStatus === 'READY' &&
      reentry.surfaceSetAvailable && reentry.activeSurfaceCount === 2 && reentry.environmentVisible &&
      reentry.locationsControlVisible && reentry.rendererTextureCount === startup.rendererTextureCount &&
      reentry.contextLossCount === 0
  };
};

async function start() {
  state.manifest = await fetch('./assets-manifest.json').then((response) => {
    if (!response.ok) throw new Error(`Manifest load failed: ${response.status}`);
    return response.json();
  });
  initializeLocationMarkers();
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
  environmentPresentationSelect.value = state.environment.presentation;
  resizeRenderer();
  connectLiveLink();
  await Promise.all([
    loadSiteScene(),
    loadEnvironmentScene(),
    loadAsset(state.manifest.primaryAssetId)
  ]);
  setActiveView(DEFAULT_ACTIVE_VIEW);
}

start().catch((error) => {
  console.error(error);
  statusElement.className = 'status fail';
  statusElement.textContent = error.stack || error.message;
  badgeElement.className = 'badge fail';
  badgeElement.textContent = 'RUNTIME ERROR';
  window.block0Diagnostics = { ready: false, error: error.stack || error.message };
});
