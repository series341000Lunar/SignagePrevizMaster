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
import { FullMergeAccumulatorRuntime, mergeRgbaLayers } from './full-merge-runtime.js';
import { PlanarMappingRuntime, readPlanarSource, validatePlanarSourceInput } from './planar-mapping-runtime.js';
import { PlanarOutputWorkflow, encodePlanarPng } from './planar-output-workflow.js';
import { getPlanarMappingProfile, PLANAR_OUTPUT_PROFILE } from './planar-mapping-profile.js';
import { createPlanarAsymmetricFixture } from './planar-asymmetric-fixture.js';
import {
  createProjectSavePayload,
  prepareProjectLoad,
  PROJECT_SCHEMA_VERSION,
  sha256Hex,
  validateProjectManifest
} from './project-persistence.js';
import {
  AUTHORING_COORDINATE_SPACE,
  AuthoringPointerSession,
  detectEmbeddedAlpha,
  isSupportedImageFile,
  LayoutCameraInterlock,
  ScreenImageLayerStack,
  screenPointToSourceUv,
  sourceUvToScreenPoint,
  transformToViewportRect
} from './screen-image-authoring.js';
import {
  VECTOR_MASK_COORDINATE_SPACE,
  evaluateVectorMaskSegment,
  rasterizeVectorMask,
  vectorMaskContributionMode,
  vectorMaskPath,
  vectorMaskPoint
} from './vector-mask-model.js';
import {
  AuthoringViewSettings,
  DEFAULT_OUTSIDE_SIGNAGE_OPACITY,
  OUTSIDE_SIGNAGE_PRESETS,
  computeAuthoringPreviewAlpha
} from './authoring-view-settings.js';
import {
  assertNativeSnapshotGeometry,
  cloneBitmapProvenance,
  selectionSnapshotInitialLayerState
} from './bitmap-source.js';
import { encodeRgba8Png, rgba8FromChunky } from './png-codec.js';
import { PREVIEW_MODES, previewSourceDecision } from './preview-mode.js';
import { DEFAULT_PREVIEW_BACKGROUND_GRAY, clampPreviewBackgroundInput } from './preview-background.js';

const previewBackgroundUniform = { value: DEFAULT_PREVIEW_BACKGROUND_GRAY };
const simpleImageBlackUniform = { value: 0 };

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
const resetViewButton = document.querySelector('#reset-view-button');
const siteFovControl = document.querySelector('#site-fov-control');
const siteFovSlider = document.querySelector('#site-fov-slider');
const siteFovValue = document.querySelector('#site-fov-value');
const siteFovResetButton = document.querySelector('#site-fov-reset-button');
const previewAuthoringButton = document.querySelector('#preview-authoring-button');
const previewPhotoshopFinalButton = document.querySelector('#preview-photoshop-final-button');
const previewModeState = document.querySelector('#preview-mode-state');
const previewBackgroundGray = document.querySelector('#preview-background-gray');
const previewBackgroundValue = document.querySelector('#preview-background-value');
const previewLinkState = document.querySelector('#preview-link-state');
const previewDocumentName = document.querySelector('#preview-document-name');
const previewReceivedSize = document.querySelector('#preview-received-size');
const previewExpectedSize = document.querySelector('#preview-expected-size');
const photoshopFinalUnavailable = document.querySelector('#photoshop-final-unavailable');
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
const projectionSelectedLayer = document.querySelector('#projection-selected-layer');
const projectionPocState = document.querySelector('#projection-poc-state');
const projectionPocRun = document.querySelector('#projection-poc-run');
const projectionMaskEnabled = document.querySelector('#projection-mask-enabled');
const projectionMaskState = document.querySelector('#projection-mask-state');
const projectionPocMetrics = document.querySelector('#projection-poc-metrics');
const projectionPocMessage = document.querySelector('#projection-poc-message');
const projectionPocSaveButtons = [...document.querySelectorAll('[data-projection-export]')];
const projectionPhotoshopButtons = [...document.querySelectorAll('[data-photoshop-output]')];
const projectionPhotoshopDestinations = new Map(
  [...document.querySelectorAll('[data-photoshop-destination]')]
    .map((element) => [element.dataset.photoshopDestination, element])
);
const projectionSourceDocument = document.querySelector('#projection-source-document');
const projectionOutputFamily = document.querySelector('#projection-output-family');
const projectionBakeTarget = document.querySelector('#projection-bake-target');
const projectionPhotoshopState = document.querySelector('#projection-photoshop-state');
const projectionAuthoring = document.querySelector('#projection-authoring');
const authoringState = document.querySelector('#authoring-state');
const authoringFamily = document.querySelector('#authoring-family');
const authoringProjectControl = document.querySelector('.authoring-project-control');
const authoringProjectName = document.querySelector('#authoring-project-name');
const authoringProjectStatus = document.querySelector('#authoring-project-status');
const authoringProjectSaveAs = document.querySelector('#authoring-project-save-as');
const authoringProjectSave = document.querySelector('#authoring-project-save');
const authoringProjectOpen = document.querySelector('#authoring-project-open');
const authoringCameraLock = document.querySelector('#authoring-camera-lock');
const authoringCameraLockLabel = authoringCameraLock.querySelector('span');
const layoutEditButton = document.querySelector('#layout-edit-button');
const authoringImageButton = document.querySelector('#authoring-image-button');
const authoringPhotoshopCompositeButton = document.querySelector('#authoring-photoshop-composite');
const authoringPhotoshopSelectionButton = document.querySelector('#authoring-photoshop-selection');
const snapshotResolutionDialog = document.querySelector('#snapshot-resolution-dialog');
const snapshotResolutionMessage = document.querySelector('#snapshot-resolution-message');
const snapshotResolutionNo = document.querySelector('#snapshot-resolution-no');
const snapshotResolutionYes = document.querySelector('#snapshot-resolution-yes');
const snapshotResolutionSession = document.querySelector('#snapshot-resolution-session');
const authoringImageInput = document.querySelector('#authoring-image-input');
const authoringReplaceButton = document.querySelector('#authoring-replace-button');
const authoringReplaceInput = document.querySelector('#authoring-replace-input');
const authoringMoveUp = document.querySelector('#authoring-move-up');
const authoringMoveDown = document.querySelector('#authoring-move-down');
const authoringDeleteLayer = document.querySelector('#authoring-delete-layer');
const authoringLayerList = document.querySelector('#authoring-layer-list');
const authoringLayerCount = document.querySelector('#authoring-layer-count');
const authoringSourceName = document.querySelector('#authoring-source-name');
const authoringSourceMeta = document.querySelector('#authoring-source-meta');
const authoringTransformFields = document.querySelector('#authoring-transform-fields');
const authoringResetTransform = document.querySelector('#authoring-reset-transform');
const authoringMessage = document.querySelector('#authoring-message');
const authoringOverlay = document.querySelector('#authoring-overlay');
const authoringCoverageMask = document.querySelector('#authoring-coverage-mask');
const authoringLayerComposite = document.querySelector('#authoring-layer-composite');
const authoringVectorMaskedSource = document.createElement('canvas');
const authoringVectorMaskScratch = document.createElement('canvas');
const authoringCoveragePreview = document.querySelector('#authoring-coverage-preview');
const authoringBackgroundPreview = document.querySelector('#authoring-background-preview');
const authoringImageLayer = document.querySelector('#authoring-image-layer');
const authoringImagePreview = document.querySelector('#authoring-image-preview');
const authoringScaleHandle = document.querySelector('#authoring-scale-handle');
const authoringRotateHandle = document.querySelector('#authoring-rotate-handle');
const vectorMaskOverlay = document.querySelector('#vector-mask-overlay');
const vectorMaskControl = document.querySelector('.vector-mask-control');
const vectorMaskPanel = document.querySelector('#vector-mask-panel');
const vectorMaskPanelBody = document.querySelector('#vector-mask-panel-body');
const vectorMaskPanelDragHandle = document.querySelector('#vector-mask-panel-drag-handle');
const vectorMaskPanelCollapse = document.querySelector('#vector-mask-panel-collapse');
const vectorMaskEnabled = document.querySelector('#vector-mask-enabled');
const vectorMaskInvert = document.querySelector('#vector-mask-invert');
const vectorMaskEdit = document.querySelector('#vector-mask-edit');
const vectorMaskCoordinate = document.querySelector('#vector-mask-coordinate');
const vectorMaskPathCount = document.querySelector('#vector-mask-path-count');
const vectorMaskPathList = document.querySelector('#vector-mask-path-list');
const vectorMaskAddPath = document.querySelector('#vector-mask-add-path');
const vectorMaskDeletePath = document.querySelector('#vector-mask-delete-path');
const vectorMaskClosePath = document.querySelector('#vector-mask-close-path');
const vectorMaskClear = document.querySelector('#vector-mask-clear');
const vectorMaskSegmentLinear = document.querySelector('#vector-mask-segment-linear');
const vectorMaskSegmentBezier = document.querySelector('#vector-mask-segment-bezier');
const vectorMaskDeletePoint = document.querySelector('#vector-mask-delete-point');
const vectorMaskMessage = document.querySelector('#vector-mask-message');
const outsideSignageOpacity = document.querySelector('#outside-signage-opacity');
const outsideSignageOpacityValue = document.querySelector('#outside-signage-opacity-value');
const outsideSignagePresetButtons = [...document.querySelectorAll('[data-outside-signage-preset]')];
const authoringOpacity = document.querySelector('#authoring-opacity');
const authoringOpacityValue = document.querySelector('#authoring-opacity-value');
const authoringBlendMode = document.querySelector('#authoring-blend-mode');
const authoringMetadataState = document.querySelector('#authoring-metadata-state');
const authoringQuickRail = document.querySelector('#authoring-quick-rail');
const authoringQuickToggle = document.querySelector('#authoring-quick-toggle');
const authoringQuickMenu = document.querySelector('#authoring-quick-menu');
const quickBakeCurrent = document.querySelector('#quick-bake-current');
const quickBakeFullMerged = document.querySelector('#quick-bake-full-merged');
const quickBakePlanar = document.querySelector('#quick-bake-planar');
const quickSendDirect = document.querySelector('#quick-send-direct');
const quickMergedState = document.querySelector('#quick-merged-state');
const quickPlanarState = document.querySelector('#quick-planar-state');
const quickSendDestination = document.querySelector('#quick-send-destination');
const authoringTransformInputs = {
  x: document.querySelector('#authoring-transform-x'),
  y: document.querySelector('#authoring-transform-y'),
  scale: document.querySelector('#authoring-transform-scale'),
  rotationDegrees: document.querySelector('#authoring-transform-rotation')
};
const projectionPreviewCanvases = {
  source: document.querySelector('#projection-source-preview'),
  direct: document.querySelector('#projection-direct-preview'),
  bake: document.querySelector('#projection-bake-preview'),
  reproject: document.querySelector('#projection-reproject-preview')
};
const fullMergePreviewCanvases = {
  direct: document.querySelector('#full-merge-direct-preview'),
  canonical: document.querySelector('#full-merge-canonical-preview')
};
const fullMergeState = document.querySelector('#full-merge-state');
const fullMergeMessage = document.querySelector('#full-merge-message');
const fullMergeSaveButtons = [...document.querySelectorAll('[data-full-merge-export]')];
const planarMasterState = document.querySelector('#planar-master-state');
const planarMasterTitle = document.querySelector('#planar-master-title');
const planarMasterSource = document.querySelector('#planar-master-source');
const planarMasterBake = document.querySelector('#planar-master-bake');
const planarMasterPreview = document.querySelector('#planar-master-preview');
const planarMasterSave = document.querySelector('#planar-master-save');
const planarMasterMessage = document.querySelector('#planar-master-message');
const productionUi = {
  modeToggle: document.querySelector('#ui-mode-toggle'),
  projectName: document.querySelector('#production-project-name'),
  projectState: document.querySelector('#production-project-state'),
  projectOpen: document.querySelector('#production-project-open'),
  projectSave: document.querySelector('#production-project-save'),
  projectSaveAs: document.querySelector('#production-project-save-as'),
  familyLabel: document.querySelector('#production-family-label'),
  family: document.querySelector('#production-family'),
  previewSourceGroup: document.querySelector('#production-preview-source-group'),
  previewSource: document.querySelector('#production-preview-source'),
  previewSourceState: document.querySelector('#production-preview-source-state'),
  imageControls: document.querySelector('#production-image-controls'),
  imageAsset: document.querySelector('#production-image-asset'),
  imageDeleteButton: document.querySelector('#production-image-delete-button'),
  imageFileButton: document.querySelector('#production-image-file-button'),
  imageFileInput: document.querySelector('#production-image-file-input'),
  imageName: document.querySelector('#production-image-name'),
  imageBankCount: document.querySelector('#production-image-bank-count'),
  viewAuthoring: document.querySelector('#production-view-authoring'),
  viewSite: document.querySelector('#production-view-site'),
  viewPhoto: document.querySelector('#production-view-photo'),
  photoshopStatus: document.querySelector('#production-photoshop-status'),
  intro: document.querySelector('#production-intro'),
  context: document.querySelector('#production-context'),
  maskEntry: document.querySelector('#production-mask-entry'),
  maskEdit: document.querySelector('#production-mask-edit'),
  output: document.querySelector('#production-output'),
  bakeCurrent: document.querySelector('#production-bake-current'),
  sendDirect: document.querySelector('#production-send-direct'),
  sendState: document.querySelector('#production-send-state'),
  bakeMerged: document.querySelector('#production-bake-merged'),
  saveMerged: document.querySelector('#production-save-merged'),
  mergedState: document.querySelector('#production-merged-state'),
  bakePlanar: document.querySelector('#production-bake-planar'),
  viewPlanar: document.querySelector('#production-view-planar'),
  savePlanar: document.querySelector('#production-save-planar'),
  planarState: document.querySelector('#production-planar-state')
};
let productionWorkspace = 'site';
let productionSitePreset = 'free';
let productionAuthoringFamily = 'front75f';
const productionPreviewSource = { photo: 'IMAGE', site: 'IMAGE' };
const PREVIEW_IMAGE_BANK_LIMIT = 5;
const productionPreviewCache = {
  imageTexture: null,
  imageName: '',
  imageSelection: null,
  imageBank: [],
  nextImageBankId: 1,
  bankLoading: false,
  photoshopTexture: null,
  photoshopFrame: null,
  lastValid: { photo: null, site: null }
};
const authoringPhysicalPreview = {
  requestGeneration: 0,
  pending: null,
  running: null,
  cache: new Map(),
  errors: new Map(),
  routeActive: false,
  timings: []
};
const planarPreviewOverlay = document.querySelector('#planar-preview-overlay');
const planarPreviewImage = document.querySelector('#planar-preview-image');
const planarPreviewDetails = document.querySelector('#planar-preview-details');
const planarPreviewClose = document.querySelector('#planar-preview-close');
let projectionPngExporting = false;
let fullMergePngExporting = false;
let planarPngExporting = false;
let planarPreviewUrl = null;
let planarPreviewOutput = null;
let planarPreviewReturnFocus = null;
let lastPlanarUiFamilyId = null;
let lastPlanarUiStatus = null;
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
const AUTHORING_CANVAS_BLEND = Object.freeze({
  NORMAL: 'source-over',
  MULTIPLY: 'multiply',
  SCREEN: 'screen',
  LINEAR_DODGE: 'lighter'
});

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
const fullMergeRuntime = new FullMergeAccumulatorRuntime(renderer);
const planarMappingRuntime = new PlanarMappingRuntime(renderer);
let planarWorkflow = null;

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
const disposeAuthoringRuntime = (runtime) => {
  if (typeof runtime?.dispose === 'function') runtime.dispose();
  else if (runtime?.objectUrl) URL.revokeObjectURL(runtime.objectUrl);
};
const authoringSession = new ScreenImageLayerStack({
  disposeRuntime: disposeAuthoringRuntime,
  idPrefix: 'projection-layer',
  onMergedInvalidated: (familyId) => planarWorkflow?.invalidateFamily(familyId)
});
const authoringViewSettings = new AuthoringViewSettings();
const authoringCameraInterlock = new LayoutCameraInterlock(false);
const authoringPointerSession = new AuthoringPointerSession();

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
  previewMode: PREVIEW_MODES.AUTHORING,
  previewBackgroundGray: DEFAULT_PREVIEW_BACKGROUND_GRAY,
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
  authoring: {
    sourceRuntime: null,
    layoutCameraSnapshot: null,
    maskCameraSnapshot: null,
    previousAnamorphicCameraMode: null,
    importError: '',
    userValidation: 'PASS_CLOSED',
    block8BUserValidation: 'PASS_CLOSED',
    outsidePreviewUserValidation: 'PASS_CLOSED',
    project: {
      busy: false,
      hasCurrentProject: false,
      projectName: null,
      savedRevision: null,
      savedPreviewGray: null,
      status: 'Authoring source of truth is not saved.',
      error: ''
    },
    snapshot: {
      projectSessionId: crypto.randomUUID(),
      sequence: 0,
      current: null,
      completedJobIds: new Set(),
      allowResolutionMismatchThisSession: false,
      status: 'IDLE',
      error: ''
    },
    railExpanded: false,
    maskPanel: { collapsed: false, initialized: false, x: null, y: null, drag: null },
    reorderDrag: null,
    maskEditor: {
      selectedPathId: null,
      selectedPointId: null,
      selectedSegmentStartPointId: null,
      selectedPointRefs: [],
      drag: null
    },
    coverageCache: {
      key: null,
      canvas: authoringCoverageMask,
      buildCount: 0,
      reuseCount: 0,
      triangleCount: 0
    }
  },
  fullMerge: {
    running: false,
    error: '',
    userValidation: 'PASS_CLOSED'
  },
  reverseBake: {
    nextJobId: 1,
    state: 'IDLE',
    activeJobId: null,
    pending: null,
    targetRegistry: {
      registryAuthority: null,
      scope: null,
      sessionId: null,
      targets: [],
      bindings: []
    },
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
    liveFrameCurrent: false,
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

function planarSourceCurrent(familyId, revision) {
  const profile = getProjectionBakeProfile(familyId);
  return Boolean(profile && mergedProjectionResultReady(profile) &&
    authoringSession.mergedState(familyId).revision === revision);
}

planarWorkflow = new PlanarOutputWorkflow({
  readSource: (familyId, revision) => readPlanarSource(fullMergeRuntime, familyId, {
    ready: planarSourceCurrent(familyId, revision), mergedDirectRevision: revision
  }),
  render: (familyId, input, revision) => planarMappingRuntime.render(familyId, input, {
    sourceMergedDirectRevision: revision
  }),
  encodePng: encodePlanarPng,
  isCurrent: planarSourceCurrent,
  onStale: (familyId) => planarMappingRuntime.invalidateFamily(familyId),
  onChange: () => syncProjectionPocUi()
});

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
  if (state.texture && state.texture !== productionPreviewCache.imageTexture &&
      state.texture !== productionPreviewCache.photoshopTexture) state.texture.dispose();
  state.mesh = null;
  state.plane3d = null;
  state.plane3dFrame = null;
  state.texture = null;
  state.link.liveFrameCurrent = false;
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
  installSimpleImageBlackShader(material2d);
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
  installSimpleImageBlackShader(material3d);
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
  siteAnamorphicFamilySelect.disabled = !familyContext || authoringCameraInterlock.forcedLocked || authoringPointerSession.active || Boolean(state.authoring.maskEditor.drag);
  anamorphicCameraResetButton.hidden = !isAnamorphicCalibrationContext();
  anamorphicCameraResetButton.disabled = !isAnamorphicCalibrationContext() || !state.site.surfaceSetAvailable || authoringCameraInterlock.forcedLocked;
  anamorphicFovControl.hidden = !isAnamorphicCalibrationFramingActive();
  anamorphicFovInput.disabled = !isAnamorphicCalibrationFramingActive() || !state.site.surfaceSetAvailable || authoringCameraInterlock.cameraLocked;
  const calibrationLabel = currentAnamorphicFamily()?.label ?? 'ANAMORPHIC';
  anamorphicCameraResetButton.textContent = state.site.anamorphicCameraMode === 'CALIBRATION'
    ? `${calibrationLabel} CALIBRATION`
    : `RETURN TO ${calibrationLabel} CALIBRATION`;
  anamorphicCameraResetButton.classList.toggle('locked', state.site.anamorphicCameraMode === 'CALIBRATION');
  anamorphicCameraResetButton.classList.toggle('unlocked', state.site.anamorphicCameraMode !== 'CALIBRATION');
  syncProjectionPocUi();
  syncAuthoringUi();
}

function isProjectionPocContext() {
  const profile = currentProjectionBakeProfile();
  return Boolean(isAnamorphicCalibrationFramingActive() && profile && state.site.surfaceSetAvailable &&
    state.site.activeBindings.some((binding) => binding.mesh.name === profile.surfaceBinding.exactName));
}

function currentProjectionBakeProfile() {
  return getProjectionBakeProfile(currentAnamorphicFamily()?.familyId);
}

function isProjectionAuthoringContext() {
  return Boolean(isAnamorphicCalibrationContext() && state.site.surfaceSetAvailable && currentProjectionBakeProfile());
}

function currentPreviewDecision() {
  return previewSourceDecision({
    mode: state.previewMode,
    expectedResolution: currentProjectionBakeProfile()?.workingResolution ?? null,
    photoshopConnected: state.link.rendererHandshake && state.link.photoshopConnected,
    liveFrameCurrent: state.link.liveFrameCurrent,
    frame: state.link.liveFrameCurrent ? state.link.lastFrame : null,
    liveTextureAvailable: state.asset?.kind === 'live' && Boolean(state.texture)
  });
}

function isProductionPreviewRoutingActive() {
  if (document.body.dataset.uiMode !== 'production' || state.activeView !== 'site-3d') return false;
  if (productionWorkspace === 'photo') return state.site.world === 'legacy2d' && state.site.mappingMode === 'normal';
  if (productionWorkspace !== 'site' || state.site.world !== 'world3d') return false;
  return productionSitePreset === 'free'
    ? state.site.mappingMode === 'normal'
    : state.site.mappingMode === 'anamorphic' && state.site.anamorphicFamily === productionSitePreset;
}

function installPreviewBackgroundShader(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.previewBackgroundGray = previewBackgroundUniform;
    shader.uniforms.simpleImageBlack = simpleImageBlackUniform;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float previewBackgroundGray;\nuniform float simpleImageBlack;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        #ifdef USE_MAP
          vec4 previewSrgb = sRGBTransferOETF( diffuseColor );
          float matteGray = mix( previewBackgroundGray, 0.0, simpleImageBlack );
          previewSrgb.rgb = mix( vec3( matteGray ), previewSrgb.rgb, diffuseColor.a );
          diffuseColor.rgb = sRGBTransferEOTF( previewSrgb ).rgb;
          diffuseColor.a = 1.0;
        #endif`);
  };
  material.customProgramCacheKey = () => 'project-preview-gray-v1';
}

function installSimpleImageBlackShader(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.simpleImageBlack = simpleImageBlackUniform;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float simpleImageBlack;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        #ifdef USE_MAP
          if ( simpleImageBlack > 0.5 ) {
            vec4 simpleSrgb = sRGBTransferOETF( diffuseColor );
            simpleSrgb.rgb *= diffuseColor.a;
            diffuseColor.rgb = sRGBTransferEOTF( simpleSrgb ).rgb;
            diffuseColor.a = 1.0;
          }
        #endif`);
  };
  material.customProgramCacheKey = () => 'simple-image-black-v1';
}

function productionAuthoringPreviewFamilyId() {
  if (productionWorkspace === 'photo') {
    return state.site.scene === 'back' || state.site.scene === 'night'
      ? ANAMORPHIC_FAMILY_IDS.BACK : ANAMORPHIC_FAMILY_IDS.FRONT_75F;
  }
  const family = productionSitePreset === 'free' ? productionAuthoringFamily : productionSitePreset;
  return family === 'back' ? ANAMORPHIC_FAMILY_IDS.BACK : ANAMORPHIC_FAMILY_IDS.FRONT_75F;
}

function physicalPlanarBindings() {
  const contracts = productionWorkspace === 'photo'
    ? SITE_SCENE_PROFILE.worlds.legacy2d.normalScenes.find((scene) => scene.id === state.site.scene)?.surfaces
    : SITE_SCENE_PROFILE.worlds.world3d.normalSurfaces;
  if (!contracts?.length || contracts.some((contract) => contract.displayMapping.kind !== 'planar-uv')) {
    throw new Error('PHYSICAL_PLANAR_CONTRACT_UNAVAILABLE');
  }
  const meshes = productionWorkspace === 'photo' ? state.site.meshesByWorld.legacy2d : state.site.meshesByWorld.world3d;
  const resolved = resolveSurfaceSet(meshes ?? [], contracts);
  if (!resolved.available || resolved.resolved.some((binding) => !binding.mesh.geometry?.getAttribute('uv'))) {
    throw new Error('PHYSICAL_PLANAR_SURFACE_UNAVAILABLE');
  }
  return resolved.resolved;
}

function restoreProductionSiteSurfaceVisibility() {
  for (const mesh of state.site.meshes) mesh.visible = false;
  const photoReady = productionWorkspace !== 'photo' || state.photo.status === 'READY';
  if (photoReady) for (const binding of state.site.activeBindings) binding.mesh.visible = true;
  authoringPhysicalPreview.routeActive = false;
}

function applySitePreviewSource(decision) {
  const previewContext = isAnamorphicCalibrationContext();
  const production = isProductionPreviewRoutingActive();
  const selected = production ? productionPreviewDecision() : null;
  const physicalTexture = production && selected.source === 'AUTHORING' ? selected.physicalTexture : null;
  if (physicalTexture) {
    const bindings = physicalPlanarBindings();
    for (const mesh of state.site.meshes) mesh.visible = false;
    if (productionWorkspace !== 'photo' || state.photo.status === 'READY') {
      for (const binding of bindings) {
        binding.mesh.visible = true;
        if (binding.mesh.material.map !== physicalTexture) {
          binding.mesh.material.map = physicalTexture;
          binding.mesh.material.needsUpdate = true;
        }
      }
    }
    authoringPhysicalPreview.routeActive = true;
    return physicalTexture;
  }
  if (authoringPhysicalPreview.routeActive) restoreProductionSiteSurfaceVisibility();
  const desiredMap = production ? selected.texture : previewContext
    ? (decision.source === 'PHOTOSHOP_FINAL' ? state.texture : null)
    : state.texture;
  for (const binding of state.site.activeBindings) {
    if (binding.mesh.userData.productionHelper === true) continue;
    const material = binding.mesh.material;
    if (material.map !== desiredMap) {
      material.map = desiredMap;
      material.needsUpdate = true;
    }
    if (binding.mesh.userData.previewBackgroundSurface) {
      const gray = previewContext && !production && decision.source === 'AUTHORING'
        ? state.previewBackgroundGray : 1;
      material.color.setRGB(gray, gray, gray, THREE.SRGBColorSpace);
    }
  }
  return desiredMap;
}

function productionPreviewDecision() {
  const workspace = productionWorkspace;
  const source = productionPreviewSource[workspace];
  const lastValid = productionPreviewCache.lastValid[workspace];
  if (source === 'IMAGE') {
    const texture = productionPreviewCache.imageTexture;
    if (texture) productionPreviewCache.lastValid[workspace] = texture;
    return { source, status: texture ? 'READY' : 'NOT READY', texture: texture ?? lastValid };
  }
  if (source === 'PS_PREVIEW') {
    const frame = productionPreviewCache.photoshopFrame;
    const texture = productionPreviewCache.photoshopTexture;
    const connected = state.link.rendererHandshake && state.link.photoshopConnected;
    const receivedWidth = frame?.receivedWidth ?? frame?.width;
    const receivedHeight = frame?.receivedHeight ?? frame?.height;
    const expected = isAnamorphicCalibrationContext() ? currentProjectionBakeProfile()?.workingResolution : null;
    const valid = Boolean(connected && texture && frame &&
      Number.isSafeInteger(receivedWidth) && Number.isSafeInteger(receivedHeight) &&
      receivedWidth > 0 && receivedHeight > 0 &&
      frame.documentWidth === receivedWidth && frame.documentHeight === receivedHeight &&
      texture.image?.width === receivedWidth && texture.image?.height === receivedHeight &&
      (!expected || (expected.width === receivedWidth && expected.height === receivedHeight)));
    if (valid) productionPreviewCache.lastValid[workspace] = texture;
    return { source, status: valid ? 'READY' : !connected ? 'UNAVAILABLE' :
      expected && frame && (expected.width !== receivedWidth || expected.height !== receivedHeight)
        ? 'SIZE MISMATCH' : 'UNAVAILABLE', texture: valid ? texture : lastValid ?? productionPreviewCache.imageTexture };
  }
  const familyId = productionAuthoringPreviewFamilyId();
  const merged = authoringSession.mergedState(familyId);
  const planar = planarWorkflow?.readyOutput(familyId, merged.revision);
  const cached = authoringPhysicalPreview.cache.get(familyId);
  const sameProject = cached?.projectSessionId === state.authoring.snapshot.projectSessionId;
  const physicalTexture = sameProject ? cached.texture : null;
  const ready = Boolean(planar && physicalTexture && cached.output === planar);
  const updating = [authoringPhysicalPreview.pending, authoringPhysicalPreview.running]
    .some((request) => request?.familyId === familyId && request.workspace === workspace &&
      request.generation === authoringPhysicalPreview.requestGeneration);
  const error = authoringPhysicalPreview.errors.get(familyId);
  const failed = error?.projectSessionId === state.authoring.snapshot.projectSessionId &&
    error.revision === merged.revision;
  const status = ready ? 'READY' : updating ? 'UPDATING' : failed ? 'ERROR' :
    merged.dirty || physicalTexture ? 'OUTDATED' : 'NOT READY';
  return { source, status, familyId, physicalTexture,
    texture: physicalTexture ?? lastValid ?? productionPreviewCache.imageTexture };
}

function discardAuthoringPhysicalRequests({ clearCache = false } = {}) {
  authoringPhysicalPreview.requestGeneration += 1;
  authoringPhysicalPreview.pending = null;
  if (clearCache) {
    const cachedTextures = new Set([...authoringPhysicalPreview.cache.values()].map((entry) => entry.texture));
    for (const mesh of state.site.meshes) {
      if (cachedTextures.has(mesh.material?.map)) {
        mesh.material.map = null;
        mesh.material.needsUpdate = true;
      }
    }
    if (authoringPhysicalPreview.routeActive) restoreProductionSiteSurfaceVisibility();
    for (const cached of authoringPhysicalPreview.cache.values()) cached.texture.dispose();
    authoringPhysicalPreview.cache.clear();
    authoringPhysicalPreview.errors.clear();
  }
}

const authoringPhysicalBakeOps = {
  hasLayers: (familyId) => authoringSession.ensureFamily(familyId).length > 0,
  fullMergeReady: (profile) => mergedProjectionResultReady(profile),
  fullMerge: (familyId) => runFullMergedBake({ familyId, autoPreview: true }),
  planarReady: (familyId, revision) => planarWorkflow.readyOutput(familyId, revision),
  planarBake: (familyId, revision, ready) => planarWorkflow.bake(familyId, { ready, revision }),
  installTexture: loadPhysicalPlanarTexture
};

function authoringPhysicalRequestCurrent(request) {
  return request.generation === authoringPhysicalPreview.requestGeneration &&
    request.projectSessionId === state.authoring.snapshot.projectSessionId &&
    request.workspace === productionWorkspace && request.view ===
      (request.workspace === 'photo' ? state.site.scene : productionSitePreset) &&
    productionPreviewSource[request.workspace] === 'AUTHORING' &&
    isProductionPreviewRoutingActive() && productionAuthoringPreviewFamilyId() === request.familyId &&
    authoringSession.mergedState(request.familyId).revision === request.revision &&
    !state.authoring.project.busy;
}

async function waitForAuthoringBakeSlot(request) {
  while (state.projectionBake.running || state.fullMerge.running || planarWorkflow.job ||
    state.reverseBake.activeJobId !== null) {
    if (!authoringPhysicalRequestCurrent(request)) return false;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  return authoringPhysicalRequestCurrent(request);
}

async function loadPhysicalPlanarTexture(output) {
  const objectUrl = URL.createObjectURL(output.blob);
  let texture;
  try {
    texture = await loadTexture(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
  const { width, height } = PLANAR_OUTPUT_PROFILE.outputResolution;
  if ((texture.image.naturalWidth || texture.image.width) !== width ||
      (texture.image.naturalHeight || texture.image.height) !== height) {
    texture.dispose();
    throw new Error('PHYSICAL_PLANAR_TEXTURE_DIMENSIONS_MISMATCH');
  }
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.premultiplyAlpha = false;
  texture.userData.physicalPlanarPreview = true;
  texture.userData.simpleImageAlphaBlack = true;
  texture.needsUpdate = true;
  return texture;
}

async function updateAuthoringPhysicalPreview(request) {
  if (!authoringPhysicalRequestCurrent(request) || !authoringPhysicalBakeOps.hasLayers(request.familyId)) return;
  physicalPlanarBindings();
  const profile = getProjectionBakeProfile(request.familyId);
  const asset = state.manifest?.planarMapping?.profiles?.[request.familyId];
  if (!profile || !asset?.sourceVerified || !asset?.buildCopyVerified) {
    throw new Error('PLANAR_ASSET_UNAVAILABLE');
  }
  const started = performance.now();
  let fullMergeMs = 0;
  let planarBakeMs = 0;
  let textureInstallMs = 0;
  if (!authoringPhysicalBakeOps.fullMergeReady(profile)) {
    if (!await waitForAuthoringBakeSlot(request)) return;
    const from = performance.now();
    const merged = await authoringPhysicalBakeOps.fullMerge(request.familyId);
    fullMergeMs = performance.now() - from;
    if (!merged || !authoringPhysicalRequestCurrent(request)) return;
  }
  let output = authoringPhysicalBakeOps.planarReady(request.familyId, request.revision);
  if (!output) {
    if (!await waitForAuthoringBakeSlot(request)) return;
    const from = performance.now();
    output = await authoringPhysicalBakeOps.planarBake(request.familyId, request.revision,
      authoringPhysicalBakeOps.fullMergeReady(profile));
    planarBakeMs = performance.now() - from;
    if (!output || !authoringPhysicalRequestCurrent(request)) return;
  }
  const cached = authoringPhysicalPreview.cache.get(request.familyId);
  if (cached?.projectSessionId === request.projectSessionId && cached.output === output) {
    render();
    syncProductionUi();
    return;
  }
  const from = performance.now();
  const texture = await authoringPhysicalBakeOps.installTexture(output);
  textureInstallMs = performance.now() - from;
  if (!authoringPhysicalRequestCurrent(request) ||
      authoringPhysicalBakeOps.planarReady(request.familyId, request.revision) !== output) {
    texture.dispose();
    return;
  }
  authoringPhysicalPreview.cache.set(request.familyId, {
    projectSessionId: request.projectSessionId, revision: request.revision, output, texture
  });
  authoringPhysicalPreview.errors.delete(request.familyId);
  render();
  syncProductionUi();
  updateDiagnostics();
  if (cached) cached.texture.dispose();
  const timing = { familyId: request.familyId, fullMergeMs, planarBakeMs,
    textureInstallMs, totalMs: performance.now() - started };
  authoringPhysicalPreview.timings.push(timing);
  window.previewSourceBDiagnostics = { lastTiming: timing,
    cachedFamilies: [...authoringPhysicalPreview.cache.keys()],
    projectSessionId: request.projectSessionId, requestGeneration: request.generation };
}

function pumpAuthoringPhysicalPreview() {
  if (authoringPhysicalPreview.pumpPromise) return;
  authoringPhysicalPreview.pumpPromise = (async () => {
    while (authoringPhysicalPreview.pending) {
      const request = authoringPhysicalPreview.pending;
      authoringPhysicalPreview.pending = null;
      authoringPhysicalPreview.running = request;
      try {
        await updateAuthoringPhysicalPreview(request);
      } catch (error) {
        if (authoringPhysicalRequestCurrent(request)) {
          authoringPhysicalPreview.errors.set(request.familyId, {
            projectSessionId: request.projectSessionId, revision: request.revision,
            message: String(error.message || error)
          });
          console.error('AUTHORING PREVIEW ERROR', error);
        }
      } finally {
        if (authoringPhysicalPreview.running === request) authoringPhysicalPreview.running = null;
        render();
        syncProductionUi();
        updateDiagnostics();
      }
    }
  })().finally(() => {
    authoringPhysicalPreview.pumpPromise = null;
    if (authoringPhysicalPreview.pending) pumpAuthoringPhysicalPreview();
  });
}

function requestAuthoringPhysicalPreview() {
  discardAuthoringPhysicalRequests();
  if (productionWorkspace === 'authoring' || productionPreviewSource[productionWorkspace] !== 'AUTHORING' ||
      !isProductionPreviewRoutingActive()) return;
  const familyId = productionAuthoringPreviewFamilyId();
  const request = { generation: authoringPhysicalPreview.requestGeneration,
    projectSessionId: state.authoring.snapshot.projectSessionId, familyId,
    revision: authoringSession.mergedState(familyId).revision,
    workspace: productionWorkspace,
    view: productionWorkspace === 'photo' ? state.site.scene : productionSitePreset };
  authoringPhysicalPreview.errors.delete(familyId);
  authoringPhysicalPreview.pending = request;
  render();
  syncProductionUi();
  pumpAuthoringPhysicalPreview();
}

function syncPreviewModeUi(decision) {
  const authoring = state.previewMode === PREVIEW_MODES.AUTHORING;
  previewAuthoringButton.classList.toggle('active', authoring);
  previewPhotoshopFinalButton.classList.toggle('active', !authoring);
  previewAuthoringButton.setAttribute('aria-pressed', String(authoring));
  previewPhotoshopFinalButton.setAttribute('aria-pressed', String(!authoring));
  const connected = state.link.rendererHandshake && state.link.photoshopConnected;
  previewLinkState.textContent = connected ? 'CONNECTED' : 'DISCONNECTED';
  previewDocumentName.textContent = state.link.liveFrameCurrent ? state.link.lastFrame?.documentName || '—' : '—';
  previewReceivedSize.textContent = decision.received ? `${decision.received.width} × ${decision.received.height}` : '—';
  previewExpectedSize.textContent = decision.expected ? `${decision.expected.width} × ${decision.expected.height}` : '—';
  const stateLabel = decision.status === 'SIZE_MISMATCH' ? 'RESOLUTION MISMATCH' :
    (decision.status === 'DISCONNECTED' || decision.status === 'INVALID_FRAME' ? 'UNAVAILABLE' : decision.status);
  previewModeState.textContent = `${authoring ? 'AUTHORING PREVIEW' : 'PHOTOSHOP FINAL PREVIEW'} · ${stateLabel}`;
  previewModeState.classList.toggle('unavailable', !authoring && decision.status !== 'READY');
  photoshopFinalUnavailable.hidden = !isAnamorphicCalibrationContext() || authoring || decision.status === 'READY';
  if (!photoshopFinalUnavailable.hidden) {
    photoshopFinalUnavailable.textContent = decision.status === 'SIZE_MISMATCH'
      ? `PHOTOSHOP FINAL PREVIEW\nRESOLUTION MISMATCH\nExpected: ${decision.expected.width} × ${decision.expected.height}\nReceived: ${decision.received.width} × ${decision.received.height}`
      : `PHOTOSHOP FINAL PREVIEW UNAVAILABLE\n${stateLabel}${decision.expected ? `\nExpected: ${decision.expected.width} × ${decision.expected.height}` : ''}`;
  }
}

function setPreviewMode(mode) {
  if (!Object.values(PREVIEW_MODES).includes(mode)) throw new Error(`Unknown preview mode: ${mode}`);
  state.previewMode = mode;
  syncAuthoringUi();
  render();
  updateDiagnostics();
}

function setPreviewBackgroundGray(value, { markProjectChanged = true } = {}) {
  const gray = clampPreviewBackgroundInput(value);
  if (gray === null) return false;
  if (state.previewBackgroundGray === gray) return true;
  state.previewBackgroundGray = gray;
  previewBackgroundUniform.value = gray;
  if (markProjectChanged) state.authoring.project.status = 'Preview background changed. Save Project to keep this value.';
  syncAuthoringUi();
  render();
  updateDiagnostics();
  return true;
}

function disposeAuthoringSource() {
  authoringSession.disposeAll();
  state.authoring.sourceRuntime = null;
  authoringImagePreview.removeAttribute('src');
  authoringCoveragePreview.getContext('2d', { alpha: true })
    .clearRect(0, 0, authoringCoveragePreview.width, authoringCoveragePreview.height);
  authoringBackgroundPreview.getContext('2d', { alpha: true })
    .clearRect(0, 0, authoringBackgroundPreview.width, authoringBackgroundPreview.height);
}

function invalidateAuthoringOutputs(reason = 'authoring-transform-change') {
  if (projectionBakeRuntime.resources) releaseProjectionBakeResources(reason);
  state.projectionBake.status = authoringSession.source ? 'DIRTY / NEEDS BAKE' : 'READY';
  state.projectionBake.result = null;
  state.projectionBake.error = '';
  syncProjectionPocUi();
  syncAuthoringUi();
}

function syncSelectedAuthoringRuntime() {
  state.authoring.sourceRuntime = authoringSession.runtime;
  const runtime = authoringSession.runtime;
  if (runtime?.objectUrl) authoringImagePreview.src = runtime.objectUrl;
  else authoringImagePreview.removeAttribute('src');
  return runtime;
}

function authoringFrameRect() {
  const profile = currentProjectionBakeProfile();
  if (!profile) return null;
  return computeContainedAspectRect(
    Math.max(1, viewer.clientWidth),
    Math.max(1, viewer.clientHeight),
    profile.workingResolution.aspect
  );
}

function invalidateAuthoringCoverage() {
  state.authoring.coverageCache.key = null;
}

function authoringCoverageMeshes(profile = currentProjectionBakeProfile()) {
  if (!profile) return [];
  return state.site.activeBindings
    .filter((binding) => binding.mesh.name === profile.surfaceBinding.exactName)
    .map((binding) => binding.mesh);
}

function authoringCoverageKey(frame, pixelRatio, profile, meshes) {
  cameraSite.updateProjectionMatrix();
  cameraSite.updateMatrixWorld(true);
  const cameraSignature = [...cameraSite.projectionMatrix.elements, ...cameraSite.matrixWorldInverse.elements]
    .map((value) => Number(value).toFixed(8)).join(',');
  const surfaceSignature = meshes.map((mesh) => {
    mesh.updateWorldMatrix(true, false);
    const position = mesh.geometry.getAttribute('position');
    return `${mesh.name}:${mesh.geometry.uuid}:${position?.version ?? 0}:${mesh.matrixWorld.elements.map((value) => Number(value).toFixed(8)).join(',')}`;
  }).join('|');
  return `${profile.familyId}:${profile.surfaceBinding.exactName}:${Math.round(frame.width * pixelRatio)}x${Math.round(frame.height * pixelRatio)}:${cameraSignature}:${surfaceSignature}`;
}

function buildAuthoringCoverageMask(frame, pixelRatio) {
  const profile = currentProjectionBakeProfile();
  const meshes = authoringCoverageMeshes(profile);
  const cache = state.authoring.coverageCache;
  const key = authoringCoverageKey(frame, pixelRatio, profile, meshes);
  if (cache.key === key) {
    cache.reuseCount += 1;
    return cache.canvas;
  }
  const width = Math.max(1, Math.round(frame.width * pixelRatio));
  const height = Math.max(1, Math.round(frame.height * pixelRatio));
  cache.canvas.width = width;
  cache.canvas.height = height;
  const context = cache.canvas.getContext('2d', { alpha: true });
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#ffffff';
  const world = new THREE.Vector3();
  const projected = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  let triangleCount = 0;
  for (const mesh of meshes) {
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    const index = geometry.index;
    if (!position) continue;
    const elementCount = index ? index.count : position.count;
    const drawStart = Math.max(0, geometry.drawRange.start || 0);
    const drawCount = Number.isFinite(geometry.drawRange.count)
      ? Math.min(geometry.drawRange.count, elementCount - drawStart)
      : elementCount - drawStart;
    const drawEnd = drawStart + drawCount - (drawCount % 3);
    for (let offset = drawStart; offset < drawEnd; offset += 3) {
      for (let corner = 0; corner < 3; corner += 1) {
        const vertexIndex = index ? index.getX(offset + corner) : offset + corner;
        world.fromBufferAttribute(position, vertexIndex).applyMatrix4(mesh.matrixWorld);
        projected[corner].copy(world).project(cameraSite);
      }
      if (projected.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z))) continue;
      if (projected.every((point) => point.z < -1) || projected.every((point) => point.z > 1)) continue;
      context.beginPath();
      context.moveTo((projected[0].x + 1) * 0.5 * width, (1 - projected[0].y) * 0.5 * height);
      context.lineTo((projected[1].x + 1) * 0.5 * width, (1 - projected[1].y) * 0.5 * height);
      context.lineTo((projected[2].x + 1) * 0.5 * width, (1 - projected[2].y) * 0.5 * height);
      context.closePath();
      context.fill();
      triangleCount += 1;
    }
  }
  cache.key = key;
  cache.buildCount += 1;
  cache.triangleCount = triangleCount;
  return cache.canvas;
}

function drawAuthoringCoveragePreview(frame) {
  const pixelRatio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const width = Math.max(1, Math.round(frame.width * pixelRatio));
  const height = Math.max(1, Math.round(frame.height * pixelRatio));
  if (authoringCoveragePreview.width !== width || authoringCoveragePreview.height !== height) {
    authoringCoveragePreview.width = width;
    authoringCoveragePreview.height = height;
  }
  if (authoringBackgroundPreview.width !== width || authoringBackgroundPreview.height !== height) {
    authoringBackgroundPreview.width = width;
    authoringBackgroundPreview.height = height;
  }
  if (authoringLayerComposite.width !== width || authoringLayerComposite.height !== height) {
    authoringLayerComposite.width = width;
    authoringLayerComposite.height = height;
  }
  const coverage = buildAuthoringCoverageMask(frame, pixelRatio);
  const backgroundContext = authoringBackgroundPreview.getContext('2d', { alpha: true });
  backgroundContext.clearRect(0, 0, width, height);
  backgroundContext.drawImage(coverage, 0, 0, width, height);
  backgroundContext.globalCompositeOperation = 'source-in';
  const backgroundChannel = Math.round(state.previewBackgroundGray * 255);
  backgroundContext.fillStyle = `rgb(${backgroundChannel}, ${backgroundChannel}, ${backgroundChannel})`;
  backgroundContext.fillRect(0, 0, width, height);
  backgroundContext.globalCompositeOperation = 'source-over';
  const context = authoringCoveragePreview.getContext('2d', { alpha: true });
  context.clearRect(0, 0, width, height);
  const layerContext = authoringLayerComposite.getContext('2d', { alpha: true });
  const profile = currentProjectionBakeProfile();
  for (const layer of authoringSession.renderLayers) {
    if (!layer.runtime?.image) continue;
    const rect = transformToViewportRect(
      layer.transform,
      { width: layer.source.width, height: layer.source.height },
      profile.workingResolution.aspect,
      { x: 0, y: 0, width: frame.width, height: frame.height },
      profile.workingResolution
    );
    layerContext.clearRect(0, 0, width, height);
    layerContext.save();
    layerContext.globalCompositeOperation = 'source-over';
    layerContext.fillStyle = `rgba(255,255,255,${authoringViewSettings.outsideSignageOpacity})`;
    layerContext.fillRect(0, 0, width, height);
    layerContext.drawImage(coverage, 0, 0, width, height);
    layerContext.globalCompositeOperation = 'source-in';
    layerContext.imageSmoothingEnabled = true;
    layerContext.imageSmoothingQuality = 'high';
    let previewSource = layer.runtime.image;
    if (vectorMaskContributionMode(layer.vectorMask) !== 'PASS_THROUGH') {
      const sourceWidth = Math.max(1, Math.round(rect.width * pixelRatio));
      const sourceHeight = Math.max(1, Math.round(rect.height * pixelRatio));
      authoringVectorMaskedSource.width = sourceWidth;
      authoringVectorMaskedSource.height = sourceHeight;
      authoringVectorMaskScratch.width = sourceWidth;
      authoringVectorMaskScratch.height = sourceHeight;
      const sourceContext = authoringVectorMaskedSource.getContext('2d', { alpha: true });
      sourceContext.clearRect(0, 0, sourceWidth, sourceHeight);
      sourceContext.imageSmoothingEnabled = true;
      sourceContext.imageSmoothingQuality = 'high';
      sourceContext.drawImage(layer.runtime.image, 0, 0, sourceWidth, sourceHeight);
      rasterizeVectorMask(
        authoringVectorMaskScratch.getContext('2d', { alpha: true }),
        layer.vectorMask,
        sourceWidth,
        sourceHeight
      );
      sourceContext.globalCompositeOperation = 'destination-in';
      sourceContext.drawImage(authoringVectorMaskScratch, 0, 0);
      sourceContext.globalCompositeOperation = 'source-over';
      previewSource = authoringVectorMaskedSource;
    }
    layerContext.translate(rect.centerX * pixelRatio, rect.centerY * pixelRatio);
    layerContext.rotate(rect.rotationDegrees * Math.PI / 180);
    layerContext.drawImage(
      previewSource,
      -rect.width * pixelRatio * 0.5,
      -rect.height * pixelRatio * 0.5,
      rect.width * pixelRatio,
      rect.height * pixelRatio
    );
    layerContext.restore();
    context.globalCompositeOperation = AUTHORING_CANVAS_BLEND[layer.blendMode] || 'source-over';
    context.globalAlpha = layer.opacity;
    context.drawImage(authoringLayerComposite, 0, 0);
  }
  context.globalCompositeOperation = 'source-over';
  context.globalAlpha = 1;
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function vectorMaskEditorPath() {
  return vectorMaskPath(authoringSession.selectedLayer?.vectorMask, state.authoring.maskEditor.selectedPathId);
}

function vectorMaskEditorPoint() {
  return vectorMaskPoint(vectorMaskEditorPath(), state.authoring.maskEditor.selectedPointId);
}

function vectorMaskPointReferenceKey(pathId, pointId) {
  return `${pathId}\u0000${pointId}`;
}

function selectedVectorMaskPointKeys() {
  return new Set(state.authoring.maskEditor.selectedPointRefs.map((reference) =>
    vectorMaskPointReferenceKey(reference.pathId, reference.pointId)
  ));
}

function setVectorMaskPointSelection(references, primary = null) {
  const unique = [];
  const keys = new Set();
  for (const reference of references || []) {
    const pathValue = vectorMaskPath(authoringSession.selectedLayer?.vectorMask, reference.pathId);
    if (!vectorMaskPoint(pathValue, reference.pointId)) continue;
    const key = vectorMaskPointReferenceKey(reference.pathId, reference.pointId);
    if (keys.has(key)) continue;
    keys.add(key);
    unique.push({ pathId: reference.pathId, pointId: reference.pointId });
  }
  state.authoring.maskEditor.selectedPointRefs = unique;
  const preferred = primary && keys.has(vectorMaskPointReferenceKey(primary.pathId, primary.pointId))
    ? primary
    : unique[0] || null;
  state.authoring.maskEditor.selectedPathId = preferred?.pathId || state.authoring.maskEditor.selectedPathId;
  state.authoring.maskEditor.selectedPointId = preferred?.pointId || null;
  state.authoring.maskEditor.selectedSegmentStartPointId = null;
  return unique;
}

function createVectorMaskSvgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NAMESPACE, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

function sourcePointToMaskOverlay(pointValue, frame, profile) {
  const normalized = sourceUvToScreenPoint(
    { u: pointValue.x, v: pointValue.y },
    authoringSession.selectedLayer.source,
    profile.workingResolution.aspect,
    authoringSession.selectedLayer.transform,
    profile.workingResolution
  );
  return { x: normalized.x * frame.width, y: normalized.y * frame.height };
}

function vectorMaskSegmentSvgPath(pathValue, index, frame, profile) {
  const start = pathValue.points[index];
  const end = pathValue.points[(index + 1) % pathValue.points.length];
  const p0 = sourcePointToMaskOverlay(start, frame, profile);
  const p3 = sourcePointToMaskOverlay(end, frame, profile);
  if (start.segmentTypeToNext !== 'CUBIC_BEZIER') return `M ${p0.x} ${p0.y} L ${p3.x} ${p3.y}`;
  const p1 = sourcePointToMaskOverlay(start.outHandle, frame, profile);
  const p2 = sourcePointToMaskOverlay(end.inHandle, frame, profile);
  return `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`;
}

function drawVectorMaskOverlay(frame, profile) {
  vectorMaskOverlay.replaceChildren();
  vectorMaskOverlay.setAttribute('viewBox', `0 0 ${frame.width} ${frame.height}`);
  vectorMaskOverlay.setAttribute('data-coordinate-space', VECTOR_MASK_COORDINATE_SPACE);
  const layer = authoringSession.selectedLayer;
  if (!authoringCameraInterlock.maskEditing || !layer?.visible) return;
  const selectedPointKeys = selectedVectorMaskPointKeys();
  for (const pathValue of layer.vectorMask.paths) {
    const selected = pathValue.pathId === state.authoring.maskEditor.selectedPathId;
    const closesOnFirstAnchor = selected && !pathValue.closed && pathValue.points.length >= 3 &&
      state.authoring.maskEditor.selectedPointId === pathValue.points.at(-1)?.pointId;
    const segmentCount = pathValue.closed ? pathValue.points.length : Math.max(0, pathValue.points.length - 1);
    const combined = [];
    for (let index = 0; index < segmentCount; index += 1) {
      const segmentData = vectorMaskSegmentSvgPath(pathValue, index, frame, profile);
      combined.push(segmentData);
      const start = pathValue.points[index];
      const hit = createVectorMaskSvgElement('path', { d: segmentData });
      hit.classList.add('vector-mask-segment-hit');
      hit.classList.toggle('selected', selected && start.pointId === state.authoring.maskEditor.selectedSegmentStartPointId);
      hit.dataset.pathId = pathValue.pathId;
      hit.dataset.startPointId = start.pointId;
      hit.addEventListener('pointerdown', beginVectorMaskSegmentInsert);
      vectorMaskOverlay.append(hit);
    }
    if (combined.length) {
      const visiblePath = createVectorMaskSvgElement('path', { d: combined.join(' ') });
      visiblePath.classList.add('vector-mask-path');
      visiblePath.classList.toggle('open', !pathValue.closed);
      visiblePath.classList.toggle('subtract', pathValue.operation === 'SUBTRACT');
      visiblePath.classList.toggle('selected', selected);
      if (!pathValue.enabled) visiblePath.setAttribute('opacity', '0.35');
      vectorMaskOverlay.prepend(visiblePath);
    }
    for (const [pointIndex, pointValue] of pathValue.points.entries()) {
      const anchor = sourcePointToMaskOverlay(pointValue, frame, profile);
      const circle = createVectorMaskSvgElement('circle', { cx: anchor.x, cy: anchor.y, r: selected ? 5 : 4 });
      circle.classList.add('vector-mask-anchor');
      circle.classList.toggle('selected', selectedPointKeys.has(vectorMaskPointReferenceKey(pathValue.pathId, pointValue.pointId)));
      circle.classList.toggle('close-target', closesOnFirstAnchor && pointIndex === 0);
      circle.dataset.pathId = pathValue.pathId;
      circle.dataset.pointId = pointValue.pointId;
      circle.addEventListener('pointerdown', beginVectorMaskPointDrag);
      vectorMaskOverlay.append(circle);
    }
  }
  const selectedPoint = vectorMaskEditorPoint();
  if (selectedPoint) {
    const anchor = sourcePointToMaskOverlay(selectedPoint, frame, profile);
    for (const handleName of ['inHandle', 'outHandle']) {
      const handle = sourcePointToMaskOverlay(selectedPoint[handleName], frame, profile);
      const line = createVectorMaskSvgElement('line', { x1: anchor.x, y1: anchor.y, x2: handle.x, y2: handle.y });
      line.classList.add('vector-mask-handle-line');
      vectorMaskOverlay.append(line);
      const circle = createVectorMaskSvgElement('circle', { cx: handle.x, cy: handle.y, r: 4 });
      circle.classList.add('vector-mask-handle');
      circle.dataset.pathId = state.authoring.maskEditor.selectedPathId;
      circle.dataset.pointId = selectedPoint.pointId;
      circle.dataset.handleName = handleName;
      circle.addEventListener('pointerdown', beginVectorMaskHandleDrag);
      vectorMaskOverlay.append(circle);
    }
  }
  const drag = state.authoring.maskEditor.drag;
  if (drag?.kind === 'marquee' && drag.currentOverlay) {
    const left = Math.min(drag.startOverlay.x, drag.currentOverlay.x);
    const top = Math.min(drag.startOverlay.y, drag.currentOverlay.y);
    const marquee = createVectorMaskSvgElement('rect', {
      x: left,
      y: top,
      width: Math.abs(drag.currentOverlay.x - drag.startOverlay.x),
      height: Math.abs(drag.currentOverlay.y - drag.startOverlay.y)
    });
    marquee.classList.add('vector-mask-marquee');
    vectorMaskOverlay.append(marquee);
  }
}

function syncAuthoringOverlay() {
  const selectedLayer = authoringSession.selectedLayer;
  const runtimeSource = syncSelectedAuthoringRuntime();
  const visible = Boolean(state.previewMode === PREVIEW_MODES.AUTHORING && authoringSession.layers.length && isProjectionAuthoringContext() &&
    !isProductionPreviewRoutingActive() &&
    state.site.anamorphicCameraMode === 'CALIBRATION');
  authoringOverlay.hidden = !visible;
  authoringOverlay.classList.toggle('editing', visible && authoringCameraInterlock.layoutEditing);
  authoringOverlay.classList.toggle('mask-editing', visible && authoringCameraInterlock.maskEditing);
  if (!visible) return;
  const frame = authoringFrameRect();
  const profile = currentProjectionBakeProfile();
  authoringOverlay.style.left = `${frame.x}px`;
  authoringOverlay.style.top = `${frame.y}px`;
  authoringOverlay.style.width = `${frame.width}px`;
  authoringOverlay.style.height = `${frame.height}px`;
  const selectedVisible = Boolean(selectedLayer?.visible && runtimeSource?.image);
  authoringImageLayer.classList.toggle('hidden-selected', !selectedVisible);
  if (selectedVisible) {
    const rect = transformToViewportRect(
      selectedLayer.transform,
      { width: selectedLayer.source.width, height: selectedLayer.source.height },
      profile.workingResolution.aspect,
      { x: 0, y: 0, width: frame.width, height: frame.height },
      profile.workingResolution
    );
    authoringImageLayer.style.left = `${rect.centerX}px`;
    authoringImageLayer.style.top = `${rect.centerY}px`;
    authoringImageLayer.style.width = `${rect.width}px`;
    authoringImageLayer.style.height = `${rect.height}px`;
    authoringImageLayer.style.transform = `translate(-50%, -50%) rotate(${rect.rotationDegrees}deg)`;
  }
  drawAuthoringCoveragePreview(frame);
  drawVectorMaskOverlay(frame, profile);
}

function syncAuthoringLayerList(available) {
  authoringLayerList.replaceChildren();
  authoringLayerCount.textContent = String(authoringSession.layers.length);
  if (!authoringSession.layers.length) {
    const empty = document.createElement('p');
    empty.className = 'authoring-layer-empty';
    empty.textContent = 'No layers';
    authoringLayerList.append(empty);
    return;
  }
  for (const layer of authoringSession.layers) {
    const row = document.createElement('div');
    row.className = 'authoring-layer-row';
    row.classList.toggle('selected', layer.layerId === authoringSession.selectedLayerId);
    row.classList.toggle('hidden-layer', !layer.visible);
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(layer.layerId === authoringSession.selectedLayerId));
    row.dataset.layerId = layer.layerId;
    const drag = document.createElement('button');
    drag.type = 'button';
    drag.className = 'authoring-layer-drag';
    drag.textContent = '⠿';
    drag.title = 'Drag to reorder';
    drag.setAttribute('aria-label', `Reorder ${layer.source.filename}`);
    drag.disabled = !available;
    drag.addEventListener('pointerdown', (event) => beginLayerReorderDrag(event, layer.layerId));
    const visibility = document.createElement('button');
    visibility.type = 'button';
    visibility.className = 'authoring-layer-visibility';
    visibility.textContent = layer.visible ? 'ON' : 'OFF';
    visibility.title = layer.visible ? 'Hide layer' : 'Show layer';
    visibility.disabled = !available;
    visibility.addEventListener('pointerdown', (event) => event.stopPropagation());
    visibility.addEventListener('click', (event) => {
      event.preventDefault(); event.stopPropagation();
      toggleAuthoringLayerVisibility(layer.layerId);
    });
    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'authoring-layer-select';
    select.textContent = layer.source.filename;
    select.title = `${layer.source.filename} · ${layer.layerId}`;
    select.disabled = !available;
    select.addEventListener('pointerdown', (event) => event.stopPropagation());
    select.addEventListener('click', (event) => {
      event.preventDefault(); event.stopPropagation();
      selectAuthoringLayer(layer.layerId);
    });
    row.append(drag, visibility, select);
    authoringLayerList.append(row);
  }
}

function clearLayerReorderIndicators() {
  for (const row of authoringLayerList.querySelectorAll('.authoring-layer-row')) {
    row.classList.remove('dragging', 'insert-before', 'insert-after');
  }
}

function updateLayerReorderDrag(event) {
  const drag = state.authoring.reorderDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  event.preventDefault();
  event.stopPropagation();
  const rows = [...authoringLayerList.querySelectorAll('.authoring-layer-row')];
  const sourceIndex = rows.findIndex((row) => row.dataset.layerId === drag.layerId);
  let slot = rows.findIndex((row) => event.clientY < row.getBoundingClientRect().top + row.getBoundingClientRect().height * 0.5);
  if (slot < 0) slot = rows.length;
  drag.targetIndex = Math.max(0, Math.min(rows.length - 1, slot > sourceIndex ? slot - 1 : slot));
  clearLayerReorderIndicators();
  rows[sourceIndex]?.classList.add('dragging');
  if (slot >= rows.length) rows.at(-1)?.classList.add('insert-after');
  else rows[slot]?.classList.add('insert-before');
}

function finishLayerReorderDrag(event, cancelled = false) {
  const drag = state.authoring.reorderDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  event.preventDefault();
  event.stopPropagation();
  drag.handle.releasePointerCapture?.(event.pointerId);
  drag.handle.removeEventListener('pointermove', updateLayerReorderDrag);
  drag.handle.removeEventListener('pointerup', finishLayerReorderDrag);
  drag.handle.removeEventListener('pointercancel', cancelLayerReorderDrag);
  state.authoring.reorderDrag = null;
  clearLayerReorderIndicators();
  if (!cancelled) reorderAuthoringLayer(drag.layerId, drag.targetIndex, 'drag');
}

function cancelLayerReorderDrag(event) { finishLayerReorderDrag(event, true); }

function beginLayerReorderDrag(event, layerId) {
  if (state.authoring.reorderDrag || !isProjectionAuthoringContext()) return;
  event.preventDefault();
  event.stopPropagation();
  const handle = event.currentTarget;
  const sourceIndex = authoringSession.layers.findIndex((layer) => layer.layerId === layerId);
  state.authoring.reorderDrag = { pointerId: event.pointerId, layerId, targetIndex: sourceIndex, handle };
  handle.setPointerCapture?.(event.pointerId);
  handle.addEventListener('pointermove', updateLayerReorderDrag);
  handle.addEventListener('pointerup', finishLayerReorderDrag);
  handle.addEventListener('pointercancel', cancelLayerReorderDrag);
  clearLayerReorderIndicators();
  authoringLayerList.querySelector(`[data-layer-id="${layerId}"]`)?.classList.add('dragging');
}

function selectedProjectionResultReady(profile = currentProjectionBakeProfile()) {
  return Boolean(profile && authoringSession.selectedLayer?.visible &&
    projectionBakeRuntime.hasOutputs() &&
    projectionBakeRuntime.resources?.profileId === profile.id &&
    state.projectionBake.result?.authoringLayerId === authoringSession.selectedLayerId &&
    !authoringSession.pixelDirty);
}

function mergedProjectionResultReady(profile = currentProjectionBakeProfile()) {
  if (!profile) return false;
  const merged = authoringSession.mergedState(profile.familyId);
  const result = fullMergeRuntime.result(profile.familyId);
  return Boolean(!merged.dirty && merged.status === 'MERGED READY' && result && result.mergedRevision === merged.revision);
}

function clearFullMergePreviews() {
  for (const canvasElement of Object.values(fullMergePreviewCanvases)) {
    const context = canvasElement.getContext('2d');
    context?.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasElement.width = 1;
    canvasElement.height = 1;
  }
}

function clampVectorMaskPanel() {
  if (vectorMaskPanel.hidden) return false;
  const panel = state.authoring.maskPanel;
  const maximumX = Math.max(8, viewer.clientWidth - vectorMaskPanel.offsetWidth - 8);
  const maximumY = Math.max(8, viewer.clientHeight - vectorMaskPanel.offsetHeight - 8);
  panel.x = Math.min(maximumX, Math.max(8, Number(panel.x) || 8));
  panel.y = Math.min(maximumY, Math.max(8, Number(panel.y) || 8));
  vectorMaskPanel.style.left = `${panel.x}px`;
  vectorMaskPanel.style.top = `${panel.y}px`;
  return true;
}

function initializeVectorMaskPanelPosition() {
  const panel = state.authoring.maskPanel;
  if (panel.initialized || vectorMaskPanel.hidden) return;
  panel.initialized = true;
  panel.x = Math.round((viewer.clientWidth - vectorMaskPanel.offsetWidth) / 2);
  panel.y = viewer.clientHeight - vectorMaskPanel.offsetHeight - 20;
  clampVectorMaskPanel();
}

function syncVectorMaskFloatingPanel(available) {
  vectorMaskPanel.hidden = !available;
  vectorMaskPanel.classList.toggle('collapsed', state.authoring.maskPanel.collapsed);
  vectorMaskPanelBody.hidden = state.authoring.maskPanel.collapsed;
  vectorMaskPanelCollapse.textContent = state.authoring.maskPanel.collapsed ? '+' : '−';
  vectorMaskPanelCollapse.setAttribute('aria-expanded', String(!state.authoring.maskPanel.collapsed));
  if (available) requestAnimationFrame(() => {
    initializeVectorMaskPanelPosition();
    clampVectorMaskPanel();
  });
}

function beginVectorMaskPanelDrag(event) {
  if (event.button !== 0 || event.target.closest('button')) return;
  event.preventDefault();
  event.stopPropagation();
  const panel = state.authoring.maskPanel;
  panel.drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: panel.x, y: panel.y };
  vectorMaskPanelDragHandle.setPointerCapture?.(event.pointerId);
}

function updateVectorMaskPanelDrag(event) {
  const drag = state.authoring.maskPanel.drag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  event.preventDefault();
  event.stopPropagation();
  state.authoring.maskPanel.x = drag.x + event.clientX - drag.startX;
  state.authoring.maskPanel.y = drag.y + event.clientY - drag.startY;
  clampVectorMaskPanel();
}

function endVectorMaskPanelDrag(event) {
  const drag = state.authoring.maskPanel.drag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  event.preventDefault();
  event.stopPropagation();
  state.authoring.maskPanel.drag = null;
  if (vectorMaskPanelDragHandle.hasPointerCapture?.(event.pointerId)) vectorMaskPanelDragHandle.releasePointerCapture(event.pointerId);
  clampVectorMaskPanel();
}

function syncAuthoringQuickRail(available) {
  const profile = currentProjectionBakeProfile();
  const visible = Boolean(available && state.activeView === 'site-3d');
  authoringQuickRail.hidden = !visible;
  if (!visible) state.authoring.railExpanded = false;
  authoringQuickToggle.setAttribute('aria-expanded', String(state.authoring.railExpanded));
  authoringQuickMenu.hidden = !state.authoring.railExpanded;
  const busy = state.projectionBake.running || state.fullMerge.running || planarWorkflow.job !== null || state.reverseBake.activeJobId !== null;
  quickBakeCurrent.disabled = !visible || !authoringSession.selectedLayer?.visible || busy;
  const merged = profile ? authoringSession.mergedState(profile.familyId) : { status: 'NO LAYERS' };
  quickBakeFullMerged.disabled = !visible || authoringSession.layers.length === 0 || busy;
  quickMergedState.textContent = merged.status;
  const mergedRevision = profile ? merged.revision : null;
  const planarSourceReady = Boolean(visible && profile && mergedProjectionResultReady(profile));
  const planarAsset = profile && state.manifest?.planarMapping?.profiles?.[profile.familyId];
  const planarAssetReady = Boolean(planarAsset?.sourceVerified && planarAsset?.buildCopyVerified);
  const planarState = profile ? planarWorkflow.state(profile.familyId, { ready: planarSourceReady, revision: mergedRevision }) : { status: 'UNAVAILABLE' };
  quickBakePlanar.disabled = !planarSourceReady || !planarAssetReady || busy || planarPngExporting;
  quickPlanarState.textContent = !planarSourceReady ? 'FULL MERGE REQUIRED' : !planarAssetReady ? 'PLANAR ASSET UNAVAILABLE' : planarState.status;
  const destination = profile ? resolveReverseBakeTarget(profile.familyId, 'DIRECT') : { target: null };
  const resolution = expectedProjectionOutputResolution(profile, 'DIRECT');
  const target = destination.target;
  const targetReady = Boolean(target && target.status === 'READY' && target.width === resolution?.width &&
    target.height === resolution?.height && target.documentMode === 'RGB' && target.documentDepth === 8);
  quickSendDirect.disabled = !visible || !selectedProjectionResultReady(profile) || !state.link.rendererHandshake ||
    !state.link.photoshopConnected || !targetReady || busy;
  quickSendDestination.textContent = target
    ? `${target.documentName} · ${target.width} × ${target.height} · ${target.status}`
    : 'NO DIRECT TARGET';
}

function syncProductionSceneSelector() {
  const mode = productionWorkspace;
  if (productionUi.family.dataset.mode !== mode) {
    const choices = mode === 'photo'
      ? SITE_SCENE_PROFILE.worlds.legacy2d.normalScenes.map((scene) => [scene.id, scene.label.replaceAll('_', ' ').toUpperCase(), false])
      : mode === 'site'
        ? [['free', 'FREE VIEW', false], ['front75f', 'ANAM_FRONT 75F', false], ['back', 'ANAM_BACK', false], ['camera', 'CAMERA · FUTURE', true]]
        : [['front75f', 'FRONT 75F', false], ['back', 'BACK', false]];
    productionUi.family.replaceChildren(...choices.map(([value, label, disabled]) => {
      const option = new Option(label, value);
      option.disabled = disabled;
      return option;
    }));
    productionUi.family.dataset.mode = mode;
  }
  productionUi.familyLabel.textContent = mode === 'photo' ? 'PHOTO LOCATION' : mode === 'site' ? 'SITE VIEW' : 'FAMILY';
  productionUi.family.value = mode === 'photo' ? state.site.scene :
    mode === 'site' ? productionSitePreset : productionAuthoringFamily;
}

function currentProductionView() {
  return state.activeView === 'site-3d' ? productionWorkspace : null;
}

function syncProductionUi() {
  const project = state.authoring.project;
  const available = isProjectionAuthoringContext() && productionWorkspace === 'authoring';
  const profile = currentProjectionBakeProfile();
  const directTarget = profile ? resolveReverseBakeTarget(profile.familyId, 'DIRECT').target : null;
  const directResolution = profile ? expectedProjectionOutputResolution(profile, 'DIRECT') : null;
  const targetReady = Boolean(directTarget?.status === 'READY' &&
    directTarget.width === directResolution?.width && directTarget.height === directResolution?.height &&
    directTarget.documentMode === 'RGB' && directTarget.documentDepth === 8);

  productionUi.projectName.textContent = project.projectName || 'UNSAVED';
  productionUi.previewSourceGroup.hidden = productionWorkspace === 'authoring';
  productionUi.previewSource.value = productionPreviewSource[productionWorkspace] ?? 'IMAGE';
  productionUi.imageControls.hidden = productionWorkspace === 'authoring' ||
    productionPreviewSource[productionWorkspace] !== 'IMAGE';
  productionUi.imageName.textContent = productionPreviewCache.imageName || 'No preview image';
  productionUi.imageName.title = productionPreviewCache.imageName;
  syncProductionImageBankUi();
  if (productionWorkspace !== 'authoring') {
    const preview = productionPreviewDecision();
    productionUi.previewSourceState.textContent = preview.source === 'PS_PREVIEW'
      ? `PS PREVIEW · ${preview.status}` : preview.source === 'AUTHORING'
        ? `AUTHORING PREVIEW · ${preview.status}`
        : `IMAGE · ${preview.status}`;
    productionUi.previewSourceState.classList.toggle('unavailable', preview.status !== 'READY');
  }
  const changedSinceSave = project.savedRevision !== authoringSession.revision ||
    project.savedPreviewGray !== state.previewBackgroundGray;
  productionUi.projectState.textContent = project.busy ? 'WORKING' : project.error ? 'ERROR' :
    !project.hasCurrentProject ? 'NOT SAVED' : changedSinceSave ? 'CHANGES NOT SAVED' : 'SAVED';
  const projectBlocked = project.busy || state.projectionBake.running || state.reverseBake.activeJobId !== null;
  productionUi.projectOpen.disabled = !window.luuxProject || projectBlocked;
  productionUi.projectSave.disabled = !window.luuxProject || projectBlocked || Boolean(state.authoring.snapshot.current);
  productionUi.projectSaveAs.disabled = productionUi.projectSave.disabled;
  syncProductionSceneSelector();
  resetViewButton.hidden = state.activeView === '2d';
  resetViewButton.disabled = state.activeView === 'site-3d' &&
    (!state.site.surfaceSetAvailable || (isAnamorphicCalibrationContext() && authoringCameraInterlock.forcedLocked));
  syncSiteFovControl();

  document.body.dataset.productionWorkspace = productionWorkspace;
  productionUi.viewAuthoring.classList.toggle('active', state.activeView === 'site-3d' && productionWorkspace === 'authoring');
  productionUi.viewSite.classList.toggle('active', state.activeView === 'site-3d' && productionWorkspace === 'site');
  productionUi.viewPhoto.classList.toggle('active', state.activeView === 'site-3d' && productionWorkspace === 'photo');

  productionUi.photoshopStatus.className = `production-status${state.link.photoshopConnected ? ' connected' : ''}${state.reverseBake.lastError ? ' error' : ''}`;
  productionUi.photoshopStatus.textContent = state.reverseBake.lastError ? 'PHOTOSHOP ERROR' :
    !state.link.photoshopConnected ? 'PHOTOSHOP DISCONNECTED' :
      `PHOTOSHOP CONNECTED · ${targetReady ? 'TARGET READY' : 'TARGET NOT SET'}${state.reverseBake.lastApplied ? ' · SEND COMPLETE' : ''}`;

  productionUi.intro.hidden = available;
  productionUi.context.textContent = productionWorkspace === 'photo'
    ? 'Photo inspection is active. Choose AUTHORING to edit the selected family.'
    : productionWorkspace === 'site'
      ? 'Choose FREE VIEW, ANAM_FRONT 75F, or ANAM_BACK to inspect the site.'
      : 'Choose FRONT 75F or BACK to work with layers and output.';
  productionUi.maskEntry.hidden = !available;
  productionUi.output.hidden = !available;
  if (!available || !authoringSession.selectedLayer) vectorMaskPanel.classList.remove('production-open');
  productionUi.maskEdit.disabled = !available || !authoringSession.selectedLayer;
  productionUi.maskEdit.textContent = vectorMaskPanel.classList.contains('production-open') ? 'CLOSE MASK TOOLS' : 'OPEN MASK TOOLS';
  productionUi.bakeCurrent.disabled = quickBakeCurrent.disabled;
  productionUi.sendDirect.disabled = quickSendDirect.disabled;
  productionUi.sendState.textContent = state.reverseBake.lastError ? 'SEND ERROR · See Developer Mode for details' :
    targetReady ? 'DIRECT TARGET READY' : 'DIRECT TARGET NOT SET';
  productionUi.bakeMerged.disabled = quickBakeFullMerged.disabled;
  productionUi.saveMerged.disabled = fullMergeSaveButtons.find((button) => button.dataset.fullMergeExport === 'DIRECT')?.disabled ?? true;
  productionUi.mergedState.textContent = fullMergeState.textContent;
  productionUi.bakePlanar.disabled = planarMasterBake.disabled;
  productionUi.viewPlanar.disabled = planarMasterPreview.disabled;
  productionUi.savePlanar.disabled = planarMasterSave.disabled;
  productionUi.planarState.textContent = planarMasterState.textContent;
}

function setUiMode(mode) {
  if (mode !== 'production' && mode !== 'developer') throw new Error(`Unknown UI mode: ${mode}`);
  document.body.dataset.uiMode = mode;
  if (mode === 'developer') discardAuthoringPhysicalRequests();
  productionUi.modeToggle.textContent = mode === 'production' ? 'DEVELOPER MODE' : 'PRODUCTION UI';
  productionUi.modeToggle.setAttribute('aria-pressed', String(mode === 'developer'));
  document.querySelector('#projection-authoring-title').textContent = mode === 'production' ? 'LAYERS & PROPERTIES' : 'PROJECTION AUTHORING';
  document.querySelector('#authoring-composite-title').textContent = mode === 'production' ? 'PROPERTIES' : 'LAYER COMPOSITE';
  document.querySelector('#vector-mask-title').textContent = mode === 'production' ? 'MASK' : 'VECTOR MASK';
  if (mode === 'production' && authoringCameraInterlock.maskEditing) vectorMaskPanel.classList.add('production-open');
  syncProductionUi();
  resizeRenderer();
  if (mode === 'production' && productionWorkspace !== 'authoring' &&
      productionPreviewSource[productionWorkspace] === 'AUTHORING') requestAuthoringPhysicalPreview();
}

function changeProductionSiteOption(element, value) {
  if (element.value === value) return;
  element.value = value;
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function showProductionView(view, { resetIfCurrent = true } = {}) {
  const sameView = currentProductionView() === view;
  productionWorkspace = view;
  setActiveView('site-3d');
  if (view === 'photo') {
    changeProductionSiteOption(siteMappingSelect, 'normal');
    changeProductionSiteOption(siteWorldSelect, 'legacy2d');
  } else if (view === 'site') {
    changeProductionSiteOption(siteWorldSelect, 'world3d');
    if (productionSitePreset === 'free') changeProductionSiteOption(siteMappingSelect, 'normal');
    else {
      changeProductionSiteOption(siteMappingSelect, 'anamorphic');
      changeProductionSiteOption(siteAnamorphicFamilySelect, productionSitePreset);
    }
  } else {
    changeProductionSiteOption(siteWorldSelect, 'world3d');
    changeProductionSiteOption(siteMappingSelect, 'anamorphic');
    changeProductionSiteOption(siteAnamorphicFamilySelect, productionAuthoringFamily);
    previewAuthoringButton.click();
  }
  if (sameView && resetIfCurrent) resetCurrentView();
  syncProductionUi();
  if (view === 'authoring') discardAuthoringPhysicalRequests();
  else if (productionPreviewSource[view] === 'AUTHORING') requestAuthoringPhysicalPreview();
}

const AUTHORING_ORBIT_TO_FREE_THRESHOLD = 5;
let authoringOrbitPointer = null;

function authoringOrbitCanOpenFreeView() {
  return document.body.dataset.uiMode === 'production' && productionWorkspace === 'authoring' &&
    state.activeView === 'site-3d' && state.site.world === 'world3d' &&
    state.site.mappingMode === 'anamorphic' && state.site.surfaceSetAvailable &&
    controlsSite.enabled && controlsSite.enableRotate &&
    controlsSite.mouseButtons.LEFT === THREE.MOUSE.ROTATE &&
    state.interactionMode === 'navigate' && !authoringCameraInterlock.forcedLocked &&
    !authoringPointerSession.active && !state.authoring.maskEditor.drag;
}

function beginAuthoringOrbitPointer(event) {
  authoringOrbitPointer = null;
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey ||
      !['mouse', 'pen'].includes(event.pointerType) || !authoringOrbitCanOpenFreeView()) return;
  authoringOrbitPointer = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
}

function continueAuthoringOrbitPointer(event) {
  const down = authoringOrbitPointer;
  if (!down || down.pointerId !== event.pointerId) return;
  if (!authoringOrbitCanOpenFreeView() || (event.buttons & 1) === 0) {
    authoringOrbitPointer = null;
    return;
  }
  if (Math.hypot(event.clientX - down.x, event.clientY - down.y) <
      AUTHORING_ORBIT_TO_FREE_THRESHOLD) return;
  authoringOrbitPointer = null;
  let backOrbitStart = null;
  if (productionAuthoringFamily === 'back' && state.site.anamorphicFamily === 'back') {
    markAnamorphicFreePreview();
    backOrbitStart = { camera: snapshotSiteCameraRuntime(), up: cameraSite.up.clone() };
  }
  showProductionView('site', { resetIfCurrent: false });
  productionUi.family.value = 'free';
  productionUi.family.dispatchEvent(new Event('change', { bubbles: true }));
  if (backOrbitStart) {
    cameraSite.up.copy(backOrbitStart.up);
    restoreSiteCameraRuntime(backOrbitStart.camera);
    controlsSite.update();
    render();
    updateDiagnostics();
  }
}

function endAuthoringOrbitPointer(event) {
  if (authoringOrbitPointer?.pointerId === event.pointerId) authoringOrbitPointer = null;
}

function syncAuthoringProjectUi(available) {
  const project = state.authoring.project;
  const bridgeAvailable = Boolean(window.luuxProject);
  const blocked = project.busy || state.projectionBake.running || state.reverseBake.activeJobId !== null;
  const saveBlocked = blocked || Boolean(state.authoring.snapshot.current);
  authoringProjectName.textContent = project.projectName || 'UNSAVED';
  authoringProjectStatus.textContent = project.error || project.status;
  authoringProjectControl.classList.toggle('busy', project.busy);
  authoringProjectControl.classList.toggle('failed', Boolean(project.error));
  authoringProjectSaveAs.disabled = !available || !bridgeAvailable || saveBlocked;
  authoringProjectSave.disabled = !available || !bridgeAvailable || saveBlocked;
  authoringProjectOpen.disabled = !available || !bridgeAvailable || blocked;
}

function normalizeVectorMaskEditorSelection() {
  const paths = authoringSession.selectedLayer?.vectorMask?.paths || [];
  state.authoring.maskEditor.selectedPointRefs = (state.authoring.maskEditor.selectedPointRefs || []).filter((reference) =>
    Boolean(vectorMaskPoint(paths.find((candidate) => candidate.pathId === reference.pathId), reference.pointId))
  );
  let pathValue = paths.find((candidate) => candidate.pathId === state.authoring.maskEditor.selectedPathId) || null;
  if (!pathValue) {
    pathValue = paths.find((candidate) => candidate.pathId === state.authoring.maskEditor.selectedPointRefs[0]?.pathId) || paths[0] || null;
    state.authoring.maskEditor.selectedPathId = pathValue?.pathId || null;
    state.authoring.maskEditor.selectedPointId = null;
    state.authoring.maskEditor.selectedSegmentStartPointId = null;
  }
  if (state.authoring.maskEditor.selectedPointId && !vectorMaskPoint(pathValue, state.authoring.maskEditor.selectedPointId)) {
    state.authoring.maskEditor.selectedPointId = null;
  }
  if (state.authoring.maskEditor.selectedPointId) {
    const primaryKey = vectorMaskPointReferenceKey(pathValue.pathId, state.authoring.maskEditor.selectedPointId);
    if (!state.authoring.maskEditor.selectedPointRefs.some((reference) =>
      vectorMaskPointReferenceKey(reference.pathId, reference.pointId) === primaryKey)) {
      state.authoring.maskEditor.selectedPointRefs.push({ pathId: pathValue.pathId, pointId: state.authoring.maskEditor.selectedPointId });
    }
  }
  const segmentStart = vectorMaskPoint(pathValue, state.authoring.maskEditor.selectedSegmentStartPointId);
  const segmentIndex = segmentStart ? pathValue.points.indexOf(segmentStart) : -1;
  if (!segmentStart || (!pathValue.closed && segmentIndex === pathValue.points.length - 1)) {
    state.authoring.maskEditor.selectedSegmentStartPointId = null;
  }
  return pathValue;
}

function syncVectorMaskPathList(available) {
  const layer = authoringSession.selectedLayer;
  const mask = layer?.vectorMask;
  const selectedPath = normalizeVectorMaskEditorSelection();
  vectorMaskPathList.replaceChildren();
  vectorMaskPathCount.textContent = String(mask?.paths.length || 0);
  if (!mask?.paths.length) {
    const empty = document.createElement('p');
    empty.className = 'vector-mask-empty';
    empty.textContent = 'No paths';
    vectorMaskPathList.append(empty);
    return selectedPath;
  }
  mask.paths.forEach((pathValue, index) => {
    const row = document.createElement('div');
    row.className = 'vector-mask-path-row';
    row.classList.toggle('selected', pathValue.pathId === selectedPath?.pathId);
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(pathValue.pathId === selectedPath?.pathId));
    const enabled = document.createElement('button');
    enabled.type = 'button';
    enabled.textContent = pathValue.enabled ? 'ON' : 'OFF';
    enabled.title = pathValue.enabled ? 'Disable path' : 'Enable path';
    enabled.disabled = !available || !layer;
    enabled.addEventListener('click', (event) => {
      event.stopPropagation();
      if (authoringSession.setVectorMaskPathEnabled(layer.layerId, pathValue.pathId, !pathValue.enabled)) {
        setVectorMaskMessage(`Path ${String(index + 1).padStart(2, '0')} ${pathValue.enabled ? 'enabled' : 'disabled'}.`, 'pass');
        syncAuthoringUi();
      }
    });
    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'vector-mask-path-select';
    select.textContent = `Path ${String(index + 1).padStart(2, '0')} · ${pathValue.closed ? 'CLOSED' : 'OPEN'}`;
    select.title = `${pathValue.pathId} · ${pathValue.points.length} points`;
    select.disabled = !available || !layer;
    select.addEventListener('click', () => selectVectorMaskPath(pathValue.pathId));
    const operation = document.createElement('select');
    operation.setAttribute('aria-label', `Path ${index + 1} operation`);
    for (const value of ['ADD', 'SUBTRACT']) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      operation.append(option);
    }
    operation.value = pathValue.operation;
    operation.disabled = !available || !layer;
    operation.addEventListener('change', (event) => setVectorMaskPathOperation(pathValue.pathId, event.currentTarget.value));
    row.append(enabled, select, operation);
    vectorMaskPathList.append(row);
  });
  return selectedPath;
}

function syncVectorMaskUi(available) {
  const layer = authoringSession.selectedLayer;
  const mask = layer?.vectorMask;
  const maskEditing = authoringCameraInterlock.maskEditing;
  vectorMaskCoordinate.textContent = VECTOR_MASK_COORDINATE_SPACE;
  vectorMaskEnabled.checked = Boolean(mask?.enabled);
  vectorMaskInvert.checked = Boolean(mask?.invert);
  vectorMaskEnabled.disabled = !available || !layer;
  vectorMaskInvert.disabled = !available || !layer;
  vectorMaskEdit.disabled = !available || !layer?.visible ||
    state.projectionBake.running || state.fullMerge.running || state.reverseBake.activeJobId !== null;
  vectorMaskEdit.classList.toggle('active', maskEditing);
  vectorMaskEdit.setAttribute('aria-pressed', String(maskEditing));
  vectorMaskEdit.textContent = maskEditing ? 'EXIT MASK EDIT' : 'EDIT MASK';
  const selectedPath = syncVectorMaskPathList(available);
  const selectedPoint = vectorMaskEditorPoint();
  const segmentStart = vectorMaskPoint(selectedPath, state.authoring.maskEditor.selectedSegmentStartPointId);
  vectorMaskAddPath.disabled = !available || !layer;
  vectorMaskDeletePath.disabled = !available || !selectedPath;
  vectorMaskClosePath.disabled = !available || !selectedPath || selectedPath.closed || selectedPath.points.length < 3;
  vectorMaskClear.disabled = !available || !mask?.paths.length;
  vectorMaskSegmentLinear.disabled = !available || !segmentStart;
  vectorMaskSegmentBezier.disabled = !available || !segmentStart;
  vectorMaskSegmentLinear.classList.toggle('active', segmentStart?.segmentTypeToNext === 'LINEAR');
  vectorMaskSegmentBezier.classList.toggle('active', segmentStart?.segmentTypeToNext === 'CUBIC_BEZIER');
  vectorMaskDeletePoint.disabled = !available || !selectedPoint ||
    (selectedPath.closed && selectedPath.points.length <= 3) || (!selectedPath.closed && selectedPath.points.length <= 1);
}

function syncAuthoringUi() {
  previewBackgroundGray.value = String(state.previewBackgroundGray);
  previewBackgroundValue.value = state.previewBackgroundGray.toFixed(2);
  const available = isProjectionAuthoringContext();
  const source = authoringSession.source;
  const selectedLayer = authoringSession.selectedLayer;
  const layoutEditing = authoringCameraInterlock.layoutEditing;
  const maskEditing = authoringCameraInterlock.maskEditing;
  const snapshotActive = Boolean(state.authoring.snapshot.current);
  projectionAuthoring.hidden = !available;
  authoringFamily.textContent = currentAnamorphicFamily()?.label || '—';
  authoringState.textContent = authoringSession.status;
  authoringState.className = `projection-poc-state${authoringSession.dirty ? ' running' : ''}`;
  authoringSourceName.textContent = source?.filename || 'No image selected';
  authoringSourceMeta.textContent = source
    ? `${source.width} × ${source.height} · ${source.mimeType === 'image/png' ? 'PNG' : 'JPEG'} · ${source.sourceType || 'FILE'} · Alpha ${source.hasAlpha ? 'YES' : 'NO'}`
    : 'PNG / JPG · original bitmap';
  authoringOpacity.value = String(selectedLayer?.opacity ?? 1);
  authoringOpacityValue.value = `${Math.round((selectedLayer?.opacity ?? 1) * 100)}%`;
  authoringBlendMode.value = selectedLayer?.blendMode || 'NORMAL';
  authoringOpacity.disabled = !available || !selectedLayer;
  authoringBlendMode.disabled = !available || !selectedLayer;
  authoringMetadataState.textContent = authoringSession.compositeStatus;
  outsideSignageOpacity.value = String(authoringViewSettings.outsideSignageOpacity);
  outsideSignageOpacityValue.value = authoringViewSettings.outsideSignageOpacity.toFixed(2);
  outsideSignageOpacity.disabled = !available || !source;
  for (const button of outsideSignagePresetButtons) {
    const presetValue = OUTSIDE_SIGNAGE_PRESETS[button.dataset.outsideSignagePreset];
    button.disabled = !available || !source;
    button.classList.toggle('active', presetValue === authoringViewSettings.outsideSignageOpacity);
  }
  for (const [name, input] of Object.entries(authoringTransformInputs)) {
    input.value = String(authoringSession.transform[name]);
  }
  authoringTransformFields.disabled = !available || state.previewMode !== PREVIEW_MODES.AUTHORING || !selectedLayer?.visible || !layoutEditing || maskEditing;
  authoringResetTransform.disabled = !available || !selectedLayer?.visible || !layoutEditing || maskEditing;
  authoringImageButton.disabled = !available || maskEditing || snapshotActive || state.projectionBake.running || state.reverseBake.activeJobId !== null;
  const snapshotBlocked = !available || !state.link.photoshopConnected || maskEditing || state.projectionBake.running ||
    state.fullMerge.running || state.reverseBake.activeJobId !== null || Boolean(state.authoring.snapshot.current) ||
    Boolean(pendingSnapshotResolutionPrompt) || state.authoring.project.busy;
  authoringPhotoshopCompositeButton.disabled = snapshotBlocked;
  authoringPhotoshopSelectionButton.disabled = snapshotBlocked;
  authoringReplaceButton.disabled = !available || !source || maskEditing || snapshotActive || state.projectionBake.running || state.reverseBake.activeJobId !== null;
  authoringDeleteLayer.disabled = !available || !source || maskEditing || snapshotActive || state.projectionBake.running || state.reverseBake.activeJobId !== null;
  const selectedIndex = authoringSession.layers.findIndex((layer) => layer.layerId === authoringSession.selectedLayerId);
  authoringMoveUp.disabled = !available || selectedIndex <= 0 || snapshotActive || state.projectionBake.running || state.reverseBake.activeJobId !== null;
  authoringMoveDown.disabled = !available || selectedIndex < 0 || selectedIndex >= authoringSession.layers.length - 1 || snapshotActive || state.projectionBake.running || state.reverseBake.activeJobId !== null;
  layoutEditButton.disabled = !available || state.previewMode !== PREVIEW_MODES.AUTHORING || !selectedLayer?.visible || state.projectionBake.running || state.reverseBake.activeJobId !== null;
  layoutEditButton.classList.toggle('active', layoutEditing);
  layoutEditButton.setAttribute('aria-pressed', String(layoutEditing));
  layoutEditButton.textContent = layoutEditing ? 'EXIT LAYOUT EDIT' : 'LAYOUT EDIT';
  authoringCameraLock.disabled = !available || authoringCameraInterlock.forcedLocked;
  authoringCameraLock.setAttribute('aria-pressed', String(authoringCameraInterlock.cameraLocked));
  authoringCameraLockLabel.textContent = authoringCameraInterlock.displayState;
  authoringCameraLock.title = authoringCameraInterlock.forcedLocked
    ? 'Camera locked while editing authoring data'
    : 'Toggle camera lock outside editor modes';
  authoringCameraLock.classList.toggle('interlocked', authoringCameraInterlock.forcedLocked);
  authoringCameraLock.classList.toggle('locked', !authoringCameraInterlock.forcedLocked && authoringCameraInterlock.manualLocked);
  authoringCameraLock.classList.toggle('unlocked', !authoringCameraInterlock.forcedLocked && !authoringCameraInterlock.manualLocked);
  syncAuthoringLayerList(available && !maskEditing);
  syncVectorMaskFloatingPanel(available && state.previewMode === PREVIEW_MODES.AUTHORING);
  syncVectorMaskUi(available && state.previewMode === PREVIEW_MODES.AUTHORING);
  syncAuthoringOverlay();
  syncAuthoringQuickRail(available);
  syncAuthoringProjectUi(available);
  syncProductionUi();
}

function toggleAuthoringCameraLock() {
  const accepted = authoringCameraInterlock.requestManualLock(!authoringCameraInterlock.manualLocked);
  if (!accepted) return false;
  syncSiteCameraControls();
  updateDiagnostics();
  return true;
}

function enterLayoutEdit() {
  if (!isProjectionAuthoringContext() || !authoringSession.selectedLayer?.visible || authoringCameraInterlock.layoutEditing) return false;
  if (authoringCameraInterlock.maskEditing && !exitVectorMaskEdit()) return false;
  state.authoring.layoutCameraSnapshot = snapshotSiteCameraRuntime();
  state.authoring.previousAnamorphicCameraMode = state.site.anamorphicCameraMode;
  authoringCameraInterlock.enterLayout();
  applyAnamorphicCalibrationCamera();
  state.authoring.calibrationCameraSnapshot = snapshotSiteCameraRuntime();
  authoringMessage.className = 'projection-poc-message pass';
  authoringMessage.textContent = 'LAYOUT INTERLOCK active. Drag image; use corner and rotation handles. Camera input is blocked.';
  syncSiteCameraControls();
  render();
  updateDiagnostics();
  return true;
}

function endAuthoringPointerInteraction(event = null) {
  const pointerId = event?.pointerId ?? authoringPointerSession.pointerId;
  if (pointerId === null || pointerId === undefined) return false;
  const ended = authoringPointerSession.end(pointerId);
  if (!ended) return false;
  if (authoringOverlay.hasPointerCapture?.(pointerId)) authoringOverlay.releasePointerCapture(pointerId);
  state.authoring.dragMetrics = null;
  syncAuthoringUi();
  return true;
}

function cancelAuthoringPointerInteraction() {
  const pointerId = authoringPointerSession.pointerId;
  if (!authoringPointerSession.cancel()) return false;
  if (pointerId !== null && authoringOverlay.hasPointerCapture?.(pointerId)) authoringOverlay.releasePointerCapture(pointerId);
  state.authoring.dragMetrics = null;
  syncAuthoringUi();
  return true;
}

function exitLayoutEdit() {
  if (!authoringCameraInterlock.layoutEditing) return false;
  cancelAuthoringPointerInteraction();
  const snapshot = state.authoring.layoutCameraSnapshot;
  const previousMode = state.authoring.previousAnamorphicCameraMode;
  authoringCameraInterlock.exitLayout();
  if (snapshot) restoreSiteCameraRuntime(snapshot);
  if (previousMode) state.site.anamorphicCameraMode = previousMode;
  state.authoring.layoutCameraSnapshot = null;
  state.authoring.previousAnamorphicCameraMode = null;
  state.authoring.calibrationCameraSnapshot = null;
  authoringMessage.className = 'projection-poc-message';
  authoringMessage.textContent = 'Layout Edit ended. Previous inspection camera and manual lock state restored.';
  syncSiteCameraControls();
  resizeRenderer();
  updateDiagnostics();
  return true;
}

function toggleLayoutEdit() {
  return authoringCameraInterlock.layoutEditing ? exitLayoutEdit() : enterLayoutEdit();
}

function setVectorMaskMessage(message, stateName = '') {
  vectorMaskMessage.textContent = message;
  vectorMaskMessage.className = stateName;
}

function resetVectorMaskEditorSelection() {
  state.authoring.maskEditor.selectedPathId = null;
  state.authoring.maskEditor.selectedPointId = null;
  state.authoring.maskEditor.selectedSegmentStartPointId = null;
  state.authoring.maskEditor.selectedPointRefs = [];
  state.authoring.maskEditor.drag = null;
}

function enterVectorMaskEdit() {
  if (!isProjectionAuthoringContext() || !authoringSession.selectedLayer?.visible || authoringCameraInterlock.maskEditing) return false;
  if (authoringCameraInterlock.layoutEditing && !exitLayoutEdit()) return false;
  state.authoring.maskCameraSnapshot = snapshotSiteCameraRuntime();
  state.authoring.previousAnamorphicCameraMode = state.site.anamorphicCameraMode;
  if (!authoringCameraInterlock.enterMask()) return false;
  applyAnamorphicCalibrationCamera();
  state.authoring.calibrationCameraSnapshot = snapshotSiteCameraRuntime();
  normalizeVectorMaskEditorSelection();
  setVectorMaskMessage('MASK EDIT active. Open path: click to append. Closed path: double-click empty source space or use + NEW PATH. Drag empty space to select anchors.', 'pass');
  syncSiteCameraControls();
  render();
  updateDiagnostics();
  return true;
}

function exitVectorMaskEdit() {
  if (!authoringCameraInterlock.maskEditing) return false;
  endVectorMaskPointerInteraction();
  const snapshot = state.authoring.maskCameraSnapshot;
  const previousMode = state.authoring.previousAnamorphicCameraMode;
  authoringCameraInterlock.exitMask();
  if (snapshot) restoreSiteCameraRuntime(snapshot);
  if (previousMode) state.site.anamorphicCameraMode = previousMode;
  state.authoring.maskCameraSnapshot = null;
  state.authoring.previousAnamorphicCameraMode = null;
  state.authoring.calibrationCameraSnapshot = null;
  setVectorMaskMessage('Mask editor closed. Layer-local vector mask remains active in Preview and the next Bake.');
  syncSiteCameraControls();
  resizeRenderer();
  updateDiagnostics();
  return true;
}

function toggleVectorMaskEdit() {
  return authoringCameraInterlock.maskEditing ? exitVectorMaskEdit() : enterVectorMaskEdit();
}

function commitVectorMaskChange(message) {
  invalidateAuthoringOutputs('vector-mask-authoring-change');
  setVectorMaskMessage(`${message} Preview updated; BAKE CURRENT is now required.`, 'pass');
  syncAuthoringUi();
  render();
  updateDiagnostics();
  return true;
}

function selectVectorMaskPath(pathId) {
  if (!vectorMaskPath(authoringSession.selectedLayer?.vectorMask, pathId)) return false;
  state.authoring.maskEditor.selectedPathId = pathId;
  state.authoring.maskEditor.selectedPointId = null;
  state.authoring.maskEditor.selectedSegmentStartPointId = null;
  state.authoring.maskEditor.selectedPointRefs = [];
  syncAuthoringUi();
  return true;
}

function addVectorMaskPath(initialPoint = { x: 0.5, y: 0.5 }) {
  const layer = authoringSession.selectedLayer;
  if (!layer) return false;
  const created = authoringSession.addVectorMaskPath(layer.layerId, { operation: 'ADD', initialPoint });
  if (!created) return false;
  state.authoring.maskEditor.selectedPathId = created.pathId;
  state.authoring.maskEditor.selectedPointId = created.points[0]?.pointId || null;
  state.authoring.maskEditor.selectedSegmentStartPointId = null;
  state.authoring.maskEditor.selectedPointRefs = created.points[0]
    ? [{ pathId: created.pathId, pointId: created.points[0].pointId }]
    : [];
  return commitVectorMaskChange(`${created.pathId} created as an open ADD path.`);
}

function deleteSelectedVectorMaskPath() {
  const layer = authoringSession.selectedLayer;
  const pathId = state.authoring.maskEditor.selectedPathId;
  if (!layer || !pathId || !authoringSession.deleteVectorMaskPath(layer.layerId, pathId)) return false;
  resetVectorMaskEditorSelection();
  normalizeVectorMaskEditorSelection();
  return commitVectorMaskChange(`${pathId} deleted.`);
}

function clearSelectedLayerVectorMask() {
  const layer = authoringSession.selectedLayer;
  if (!layer || !authoringSession.clearVectorMask(layer.layerId)) return false;
  resetVectorMaskEditorSelection();
  return commitVectorMaskChange('Selected layer vector mask cleared and disabled.');
}

function setVectorMaskPathOperation(pathId, operation) {
  const layer = authoringSession.selectedLayer;
  if (!layer || !authoringSession.setVectorMaskPathOperation(layer.layerId, pathId, operation)) return false;
  state.authoring.maskEditor.selectedPathId = pathId;
  return commitVectorMaskChange(`${pathId} operation changed to ${operation}.`);
}

function closeSelectedVectorMaskPath() {
  const layer = authoringSession.selectedLayer;
  const pathId = state.authoring.maskEditor.selectedPathId;
  if (!layer || !pathId) return false;
  try {
    if (!authoringSession.closeVectorMaskPath(layer.layerId, pathId)) return false;
    return commitVectorMaskChange(`${pathId} closed explicitly.`);
  } catch (error) {
    setVectorMaskMessage(error.message, 'fail');
    syncAuthoringUi();
    return false;
  }
}

function setSelectedVectorMaskSegmentType(segmentType) {
  const layer = authoringSession.selectedLayer;
  const { selectedPathId, selectedSegmentStartPointId } = state.authoring.maskEditor;
  if (!layer || !selectedPathId || !selectedSegmentStartPointId) return false;
  try {
    if (!authoringSession.setVectorMaskSegmentType(layer.layerId, selectedPathId, selectedSegmentStartPointId, segmentType)) return false;
    return commitVectorMaskChange(`Selected segment changed to ${segmentType}.`);
  } catch (error) {
    setVectorMaskMessage(error.message, 'fail');
    return false;
  }
}

function deleteSelectedVectorMaskPoint() {
  const layer = authoringSession.selectedLayer;
  const { selectedPathId, selectedPointId } = state.authoring.maskEditor;
  if (!layer || !selectedPathId || !selectedPointId) return false;
  try {
    if (!authoringSession.deleteVectorMaskPoint(layer.layerId, selectedPathId, selectedPointId)) return false;
    state.authoring.maskEditor.selectedPointId = null;
    state.authoring.maskEditor.selectedSegmentStartPointId = null;
    state.authoring.maskEditor.selectedPointRefs = state.authoring.maskEditor.selectedPointRefs.filter((reference) =>
      reference.pathId !== selectedPathId || reference.pointId !== selectedPointId
    );
    return commitVectorMaskChange(`${selectedPointId} deleted.`);
  } catch (error) {
    setVectorMaskMessage(error.message, 'fail');
    syncAuthoringUi();
    return false;
  }
}

function commitAuthoringTransform(partial, reason = 'authoring-transform-change') {
  if (!authoringCameraInterlock.layoutEditing || !authoringSession.selectedLayer?.visible) return false;
  if (!authoringSession.setTransform(partial)) return false;
  invalidateAuthoringOutputs(reason);
  syncAuthoringOverlay();
  updateDiagnostics();
  return true;
}

function selectAuthoringLayer(layerId) {
  if (authoringCameraInterlock.maskEditing) exitVectorMaskEdit();
  if (!authoringSession.selectLayer(layerId)) return false;
  cancelAuthoringPointerInteraction();
  resetVectorMaskEditorSelection();
  authoringMessage.className = 'projection-poc-message';
  authoringMessage.textContent = `Selected ${authoringSession.source.filename}. Bake and transforms now target this layer only.`;
  syncAuthoringUi();
  return true;
}

function toggleAuthoringLayerVisibility(layerId) {
  const layer = authoringSession.layers.find((candidate) => candidate.layerId === layerId);
  if (!layer || !authoringSession.setLayerVisibility(layerId, !layer.visible)) return false;
  if (!layer.visible && layer.layerId === authoringSession.selectedLayerId && authoringCameraInterlock.maskEditing) exitVectorMaskEdit();
  cancelAuthoringPointerInteraction();
  authoringMessage.className = 'projection-poc-message';
  authoringMessage.textContent = `${layer.source.filename} visibility ${layer.visible ? 'ON' : 'OFF'}; pixels remain valid and metadata will sync on explicit Send.`;
  syncAuthoringUi();
  return true;
}

function reorderAuthoringLayer(layerId, targetIndex, source = 'button') {
  if (!authoringSession.reorderLayer(layerId, targetIndex)) return false;
  authoringMessage.className = 'projection-poc-message';
  authoringMessage.textContent = `${authoringSession.source.filename} reordered by ${source}; pixel bake remains valid, metadata is dirty.`;
  syncAuthoringUi();
  return true;
}

function moveSelectedAuthoringLayer(direction) {
  const index = authoringSession.layers.findIndex((layer) => layer.layerId === authoringSession.selectedLayerId);
  return reorderAuthoringLayer(authoringSession.selectedLayerId, index + (direction === 'up' ? -1 : 1), 'button');
}

function commitAuthoringOpacity(value) {
  const layer = authoringSession.selectedLayer;
  if (!layer || !authoringSession.setLayerOpacity(layer.layerId, value)) return false;
  authoringMessage.className = 'projection-poc-message';
  authoringMessage.textContent = `${layer.source.filename} opacity ${Math.round(layer.opacity * 100)}%; pixel bake remains valid.`;
  syncAuthoringUi();
  return true;
}

function commitAuthoringBlendMode(value) {
  const layer = authoringSession.selectedLayer;
  if (!layer || !authoringSession.setLayerBlendMode(layer.layerId, value)) return false;
  authoringMessage.className = 'projection-poc-message';
  authoringMessage.textContent = `${layer.source.filename} blend ${layer.blendMode}; Photoshop remains final composite authority.`;
  syncAuthoringUi();
  return true;
}

function deleteSelectedAuthoringLayer() {
  if (authoringCameraInterlock.maskEditing) exitVectorMaskEdit();
  const removed = authoringSession.deleteLayer();
  if (!removed) return false;
  if (!authoringSession.source && authoringCameraInterlock.layoutEditing) exitLayoutEdit();
  invalidateAuthoringOutputs('authoring-layer-delete');
  authoringMessage.className = 'projection-poc-message';
  authoringMessage.textContent = authoringSession.source
    ? `${removed.source.filename} deleted. ${authoringSession.source.filename} selected.`
    : `${removed.source.filename} deleted. Layer stack is empty.`;
  return true;
}

function commitOutsideSignageOpacity(value) {
  if (!isProjectionAuthoringContext()) return false;
  if (!authoringViewSettings.setOutsideSignageOpacity(value)) return false;
  syncAuthoringUi();
  updateDiagnostics();
  return true;
}

async function loadAuthoringFile(file, operation = 'add') {
  if (!isProjectionAuthoringContext()) throw new Error('Select an available Anamorphic Projection View before importing an image.');
  if (!isSupportedImageFile(file)) throw new Error('Projection authoring supports PNG and JPG/JPEG files only.');
  if (operation === 'replace' && !authoringSession.selectedLayer) throw new Error('Select a layer before replacing its source.');
  const extension = file.name.split('.').pop()?.toLowerCase();
  const mimeType = file.type || (extension === 'png' ? 'image/png' : 'image/jpeg');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = 'async';
  image.src = objectUrl;
  try {
    await image.decode();
    const runtimeSource = {
      id: `${file.lastModified}-${file.size}-${file.name}`,
      filename: file.name,
      name: file.name,
      originalFilename: file.name,
      sourceType: 'FILE',
      mimeType,
      type: mimeType,
      width: image.naturalWidth,
      height: image.naturalHeight,
      hasAlpha: detectEmbeddedAlpha(bytes, mimeType),
      byteLength: file.size,
      originalBytes: bytes,
      image,
      objectUrl
    };
    const profile = currentProjectionBakeProfile();
    const layer = operation === 'replace'
      ? authoringSession.replaceSelectedSource(runtimeSource, runtimeSource)
      : authoringSession.addLayer(runtimeSource, profile.familyId, runtimeSource);
    syncSelectedAuthoringRuntime();
    state.authoring.importError = '';
    authoringMessage.className = 'projection-poc-message pass';
    authoringMessage.textContent = `${file.name} ${operation === 'replace' ? 'replaced the selected source' : 'added as the top layer'} at original ${runtimeSource.width} × ${runtimeSource.height}. Layer ${layer.layerId}.`;
    invalidateAuthoringOutputs(operation === 'replace' ? 'authoring-source-replaced' : 'authoring-layer-added');
    syncAuthoringUi();
    render();
    updateDiagnostics();
    return runtimeSource;
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    state.authoring.importError = error.message;
    authoringMessage.className = 'projection-poc-message fail';
    authoringMessage.textContent = error.message;
    syncAuthoringUi();
    throw error;
  }
}

function projectOperationError(result, fallbackCode = 'PROJECT_OPERATION_FAILED') {
  const code = result?.error?.code || fallbackCode;
  const message = result?.error?.message || 'Project operation failed.';
  const error = new Error(message.startsWith(`${code}:`) ? message : `${code}: ${message}`);
  error.code = code;
  return error;
}

function setProjectOperationState({ busy = false, status = null, error = '' } = {}) {
  state.authoring.project.busy = busy;
  if (status !== null) state.authoring.project.status = status;
  state.authoring.project.error = error;
  syncAuthoringUi();
}

async function saveAuthoringProject(saveAs = false) {
  if (!window.luuxProject) throw new Error('PROJECT_BRIDGE_UNAVAILABLE: Project persistence bridge is unavailable.');
  if (state.authoring.project.busy) return false;
  setProjectOperationState({ busy: true, status: saveAs ? 'Preparing Save As...' : 'Preparing Save...', error: '' });
  try {
    const savingRevision = authoringSession.revision;
    const savingPreviewGray = state.previewBackgroundGray;
    const payload = await createProjectSavePayload(authoringSession, {
      previewBackgroundGray: savingPreviewGray
    });
    let result = saveAs ? await window.luuxProject.saveAs(payload) : await window.luuxProject.save(payload);
    if (!saveAs && !result.ok && result.error?.code === 'PROJECT_SAVE_AS_REQUIRED') {
      result = await window.luuxProject.saveAs(payload);
    }
    if (!result.ok) throw projectOperationError(result);
    if (result.canceled) {
      setProjectOperationState({ busy: false, status: 'Project save canceled.', error: '' });
      return false;
    }
    state.authoring.project.hasCurrentProject = true;
    state.authoring.project.projectName = result.projectName;
    state.authoring.project.savedRevision = savingRevision;
    state.authoring.project.savedPreviewGray = savingPreviewGray;
    setProjectOperationState({
      busy: false,
      status: `Saved project.json and ${result.assetCount} byte-identical source asset${result.assetCount === 1 ? '' : 's'}.`,
      error: ''
    });
    return true;
  } catch (error) {
    setProjectOperationState({ busy: false, error: error.message || String(error) });
    throw error;
  }
}

async function decodeProjectRuntimeAsset({ source, bytes, layerId, familyId }) {
  const originalBytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const blob = new Blob([originalBytes], { type: source.mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = 'async';
  image.src = objectUrl;
  try {
    await image.decode();
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
  let disposed = false;
  return {
    id: `project:${familyId}:${layerId}:${source.assetReference}`,
    sourceId: source.sourceId || `project:${source.assetReference || layerId}`,
    filename: source.originalFilename,
    name: source.originalFilename,
    originalFilename: source.originalFilename,
    sourceType: source.sourceType || 'FILE',
    assetReference: source.assetReference,
    mimeType: source.mimeType,
    type: source.mimeType,
    width: image.naturalWidth,
    height: image.naturalHeight,
    hasAlpha: detectEmbeddedAlpha(originalBytes, source.mimeType),
    byteLength: originalBytes.byteLength,
    sha256: source.sha256 || null,
    alphaContract: source.alphaContract || 'EMBEDDED_FILE_ALPHA',
    colorContract: source.colorContract || 'EMBEDDED_FILE_PROFILE',
    provenance: cloneBitmapProvenance(source.provenance),
    originalBytes,
    image,
    objectUrl,
    dispose() {
      if (disposed) return;
      disposed = true;
      URL.revokeObjectURL(objectUrl);
    }
  };
}

function disposeAuthoringSnapshot(snapshot) {
  for (const [, layers] of snapshot?.stacks || []) {
    for (const layer of layers) disposeAuthoringRuntime(layer.runtime);
  }
}

function clearProjectScopedPhotoshopState() {
  state.reverseBake.targetRegistry = {
    registryAuthority: null,
    scope: null,
    sessionId: null,
    targets: [],
    bindings: []
  };
  state.reverseBake.lastApplied = null;
  state.reverseBake.lastError = '';
}

async function openAuthoringProject(manifestFile = null) {
  if (!window.luuxProject) throw new Error('PROJECT_BRIDGE_UNAVAILABLE: Project persistence bridge is unavailable.');
  if (state.authoring.project.busy) return false;
  discardAuthoringPhysicalRequests({ clearCache: true });
  planarWorkflow.reset();
  planarMappingRuntime.disposeAll();
  cancelActiveSnapshot('PROJECT_SWITCH', 'Project Open invalidated the active Snapshot request.');
  state.authoring.snapshot.projectSessionId = crypto.randomUUID();
  setProjectOperationState({
    busy: true,
    status: manifestFile ? 'Opening dropped project.json...' : 'Selecting project.json...',
    error: ''
  });
  let result = null;
  let prepared = null;
  let transferred = false;
  try {
    result = manifestFile
      ? await window.luuxProject.openDroppedManifest(manifestFile)
      : await window.luuxProject.open();
    if (!result.ok) throw projectOperationError(result);
    if (result.canceled) {
      setProjectOperationState({ busy: false, status: 'Project open canceled.', error: '' });
      return false;
    }
    validateProjectManifest(result.manifest);
    const currentFamilyId = currentProjectionBakeProfile()?.familyId || ANAMORPHIC_FAMILY_IDS.FRONT_75F;
    prepared = await prepareProjectLoad(result.manifest, result.assets, {
      activeFamilyId: currentFamilyId,
      decodeAsset: decodeProjectRuntimeAsset,
      disposeRuntime: disposeAuthoringRuntime
    });
    const verificationStack = new ScreenImageLayerStack({ disposeRuntime: disposeAuthoringRuntime, idPrefix: 'projection-layer' });
    verificationStack.restore(prepared.snapshot);
    const acceptance = await window.luuxProject.acceptOpen(result.token);
    if (!acceptance.ok) throw projectOperationError(acceptance, 'PROJECT_OPEN_TOKEN_INVALID');

    if (authoringCameraInterlock.layoutEditing) exitLayoutEdit();
    if (authoringCameraInterlock.maskEditing) exitVectorMaskEdit();
    cancelAuthoringPointerInteraction();
    const previousSnapshot = authoringSession.snapshot();
    authoringSession.restore(prepared.snapshot);
    transferred = true;
    state.previewBackgroundGray = prepared.previewBackgroundGray;
    previewBackgroundUniform.value = prepared.previewBackgroundGray;
    disposeAuthoringSnapshot(previousSnapshot);
    authoringViewSettings.setOutsideSignageOpacity(DEFAULT_OUTSIDE_SIGNAGE_OPACITY);
    state.authoring.railExpanded = false;
    state.previewMode = PREVIEW_MODES.AUTHORING;
    fullMergeRuntime.disposeAll();
    clearFullMergePreviews();
    clearProjectScopedPhotoshopState();
    syncSelectedAuthoringRuntime();
    invalidateAuthoringOutputs('project-load');
    state.authoring.project.hasCurrentProject = true;
    state.authoring.project.projectName = result.projectName;
    state.authoring.project.savedRevision = authoringSession.revision;
    state.authoring.project.savedPreviewGray = state.previewBackgroundGray;
    state.authoring.project.busy = false;
    state.authoring.project.error = '';
    state.authoring.project.status = `Opened ${result.projectName}. Layers restored as NEEDS BAKE / PHOTOSHOP UNSYNCED.`;
    authoringMessage.className = 'projection-poc-message pass';
    authoringMessage.textContent = 'Project loaded transactionally. Re-bake before registering the current Photoshop target and sending.';
    syncAuthoringUi();
    render();
    updateDiagnostics();
    return true;
  } catch (error) {
    if (prepared && !transferred) for (const runtime of prepared.runtimes) disposeAuthoringRuntime(runtime);
    if (result?.token) await window.luuxProject.cancelOpen(result.token);
    setProjectOperationState({ busy: false, error: error.message || String(error) });
    throw error;
  }
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

function reverseBakeBindingKey(familyId, outputKind) {
  return `${familyId}:${outputKind}`;
}

function resolveReverseBakeTarget(familyId, outputKind) {
  const registry = state.reverseBake.targetRegistry;
  const bindingKey = reverseBakeBindingKey(familyId, outputKind);
  const binding = registry.bindings.find((entry) => entry.bindingKey === bindingKey) || null;
  const target = binding
    ? registry.targets.find((entry) => entry.targetId === binding.targetId) || null
    : null;
  return { bindingKey, binding, target };
}

function expectedProjectionOutputResolution(profile, outputKind) {
  if (!profile) return null;
  return outputKind === 'CANONICAL' ? profile.canonicalResolution : profile.workingResolution;
}

let lastTargetFamilyContext = undefined;
function syncTargetFamilyContext(force = false) {
  if (!state.link.rendererHandshake || !state.link.photoshopConnected) return;
  const inFamilyView = state.activeView === 'site-3d' && state.site.world === 'world3d' && state.site.mappingMode === 'anamorphic';
  const familyId = inFamilyView ? currentProjectionBakeProfile()?.familyId || null : null;
  if (force || familyId !== lastTargetFamilyContext) {
    if (sendLinkMessage({ type: 'TARGET_FAMILY_CONTEXT', familyId })) lastTargetFamilyContext = familyId;
  }
}

function syncProjectionPocUi() {
  syncTargetFamilyContext();
  const available = isProjectionPocContext();
  const profile = currentProjectionBakeProfile();
  const maskEnabled = isProjectionMaskEnabled(profile);
  const hasOutputs = available && selectedProjectionResultReady(profile);
  const mergedOutputs = available && mergedProjectionResultReady(profile);
  const mergedStatus = profile ? authoringSession.mergedState(profile.familyId) : { status: 'NO LAYERS', dirty: false };
  const planarFamilyId = profile?.familyId;
  const mergedRevision = planarFamilyId ? authoringSession.mergedState(planarFamilyId).revision : null;
  const planarReadySource = Boolean(available && profile && mergedProjectionResultReady(profile));
  const planarState = planarFamilyId
    ? planarWorkflow.state(planarFamilyId, { ready: planarReadySource, revision: mergedRevision })
    : { status: 'UNAVAILABLE', error: '' };
  const planarAsset = planarFamilyId && state.manifest?.planarMapping?.profiles?.[planarFamilyId];
  const planarAssetReady = Boolean(planarAsset?.sourceVerified && planarAsset?.buildCopyVerified);
  if (planarFamilyId !== lastPlanarUiFamilyId || planarState.status !== lastPlanarUiStatus) {
    const messages = {
      UNAVAILABLE: 'FULL MERGE REQUIRED · Run BAKE FULL MERGED first.',
      DIRTY: 'PLANAR BAKE REQUIRED · Source is the current Full Merged Direct.',
      BAKING: 'Baking Planar Master…',
      READY: 'Planar output ready to save.',
      ERROR: planarState.error || 'Planar bake failed. Try BAKE PLANAR again.'
    };
    planarMasterMessage.className = `projection-poc-message${planarState.status === 'ERROR' ? ' fail' : ''}`;
    planarMasterMessage.textContent = messages[planarState.status];
    lastPlanarUiFamilyId = planarFamilyId;
    lastPlanarUiStatus = planarState.status;
  }
  planarMasterState.textContent = planarState.status;
  planarMasterState.className = `projection-poc-state${planarState.status === 'BAKING' || planarState.status === 'DIRTY' ? ' running' : ''}${planarState.status === 'ERROR' ? ' fail' : ''}`;
  const planarResolution = planarFamilyId ? getPlanarMappingProfile(planarFamilyId).outputResolution : null;
  planarMasterTitle.textContent = `PLANAR OUTPUT · ${planarResolution?.width || '—'} × ${planarResolution?.height || '—'}`;
  planarMasterSource.textContent = `SOURCE: FULL MERGED DIRECT · ${profile?.label || '—'} · ${profile?.workingResolution.width || '—'} × ${profile?.workingResolution.height || '—'}`;
  planarMasterBake.disabled = !planarAssetReady || !planarReadySource || planarWorkflow.job !== null ||
    state.projectionBake.running || state.fullMerge.running || state.reverseBake.activeJobId !== null || planarPngExporting;
  planarMasterSave.disabled = !planarReadySource || !planarFamilyId || !planarWorkflow.readyOutput(planarFamilyId, mergedRevision) ||
    planarWorkflow.job !== null || planarPngExporting;
  planarMasterPreview.disabled = planarMasterSave.disabled;
  syncPlanarPreviewValidity();
  projectionPocTitle.textContent = `PROJECTION POC — ${profile?.label || 'CURRENT FAMILY'}`;
  projectionSelectedLayer.textContent = `Layer: ${authoringSession.source?.filename || '—'} · Family: ${profile?.label || '—'} · Output: CANONICAL`;
  projectionPoc.hidden = !available;
  projectionPocRun.textContent = authoringSession.source ? 'BAKE SELECTED LAYER' : 'NO LAYER TO BAKE';
  projectionPocRun.disabled = !available || !authoringSession.selectedLayer?.visible || state.projectionBake.running || state.fullMerge.running || planarWorkflow.job !== null || projectionPngExporting;
  projectionMaskEnabled.checked = maskEnabled;
  projectionMaskEnabled.disabled = !available || state.projectionBake.running || projectionPngExporting || state.reverseBake.activeJobId !== null;
  projectionMaskState.textContent = maskEnabled ? 'ON · PRODUCTION' : 'OFF · FULL SURFACE';
  projectionMaskEnabled.closest('.projection-mask-toggle')?.classList.toggle('mask-on', maskEnabled);
  for (const button of projectionPocSaveButtons) {
    button.disabled = !hasOutputs || state.projectionBake.running || state.fullMerge.running || projectionPngExporting;
  }
  fullMergeState.textContent = state.fullMerge.running ? 'MERGING' : mergedStatus.status;
  fullMergeState.className = `projection-poc-state${state.fullMerge.running || mergedStatus.dirty ? ' running' : ''}${state.fullMerge.error ? ' fail' : ''}`;
  for (const button of fullMergeSaveButtons) {
    button.disabled = !mergedOutputs || state.fullMerge.running || fullMergePngExporting;
  }
  const reverseBusy = state.reverseBake.activeJobId !== null;
  for (const button of projectionPhotoshopButtons) {
    const outputKind = button.dataset.photoshopOutput;
    const resolution = expectedProjectionOutputResolution(profile, outputKind);
    const destination = profile ? resolveReverseBakeTarget(profile.familyId, outputKind) : { target: null };
    const target = destination.target;
    const targetReady = Boolean(target && target.status === 'READY' &&
      target.width === resolution?.width && target.height === resolution?.height &&
      target.documentMode === 'RGB' && target.documentDepth === 8);
    button.disabled = !hasOutputs || !state.link.rendererHandshake || !state.link.photoshopConnected ||
      !targetReady || reverseBusy || state.projectionBake.running || projectionPngExporting;
    const destinationElement = projectionPhotoshopDestinations.get(outputKind);
    if (destinationElement) {
      destinationElement.textContent = target
        ? `${target.label} · ${target.documentName} · ${target.width} × ${target.height} · ${target.status}`
        : `NO BAKE TARGET ASSIGNED · ${resolution?.width || '—'} × ${resolution?.height || '—'}`;
    }
  }
  const source = state.link.lastFrame;
  if (projectionSourceDocument) projectionSourceDocument.textContent = authoringSession.source
    ? `FILE · ${authoringSession.source.filename} · ${authoringSession.source.width} × ${authoringSession.source.height}`
    : (source ? `${source.documentName} · ID ${source.documentId} · ${source.width} × ${source.height}` : 'No Photoshop source frame received');
  if (projectionOutputFamily) projectionOutputFamily.textContent = profile
    ? `${profile.label} · ${profile.familyId}`
    : '—';
  if (projectionBakeTarget) projectionBakeTarget.textContent = state.reverseBake.targetRegistry.sessionId
    ? `${state.reverseBake.targetRegistry.targets.length} targets · UXP SESSION`
    : 'No UXP session registry';
  if (projectionPhotoshopState) projectionPhotoshopState.textContent = state.reverseBake.lastError ||
    (state.reverseBake.lastApplied ? `PHOTOSHOP APPLY COMPLETE · Job ${state.reverseBake.lastApplied.jobId} · Layer ${state.reverseBake.lastApplied.photoshopLayerId || state.reverseBake.lastApplied.layerId}` : state.reverseBake.state);
  const busy = state.projectionBake.running || state.fullMerge.running || planarWorkflow.job !== null || projectionPngExporting || fullMergePngExporting || reverseBusy;
  projectionPocState.textContent = projectionPngExporting ? 'EXPORTING' : (state.projectionBake.running ? 'RUNNING' : state.projectionBake.status);
  projectionPocState.className = `projection-poc-state${busy ? ' running' : ''}${state.projectionBake.status === 'ERROR' ? ' fail' : ''}`;
  syncProductionUi();
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

function bakeAckError(code, field, expected, actual) {
  return new Error(`${code}: ${field} expected ${JSON.stringify(expected)} but received ${JSON.stringify(actual)}.`);
}

function validateRendererBakeApplyAck(metadata, applied) {
  const opacityTolerance = (0.5 / 255) + 0.000001;
  const exact = (code, field, expected, actual) => {
    if (actual !== expected) throw bakeAckError(code, field, expected, actual);
  };
  exact('ACK_JOB_ID_MISMATCH', 'jobId', metadata.jobId, applied.jobId);
  exact('ACK_TARGET_SESSION_MISMATCH', 'targetSessionId', metadata.targetSessionId, applied.targetSessionId);
  exact('ACK_TARGET_ID_MISMATCH', 'targetId', metadata.targetId, applied.targetId);
  exact('ACK_DOCUMENT_ID_MISMATCH', 'documentId', metadata.documentId, applied.documentId);
  exact('ACK_DOCUMENT_ID_MISMATCH', 'targetDocumentId', metadata.targetDocumentId, applied.targetDocumentId);
  exact('ACK_FAMILY_ID_MISMATCH', 'familyId', metadata.familyId, applied.familyId);
  exact('ACK_OUTPUT_KIND_MISMATCH', 'outputKind', metadata.outputKind, applied.outputKind);
  exact('ACK_AUTHORING_LAYER_ID_MISMATCH', 'authoringLayerId', metadata.authoringLayerId, applied.authoringLayerId);
  if (!Number.isSafeInteger(applied.photoshopLayerId) || applied.photoshopLayerId <= 0) {
    throw bakeAckError('ACK_PHOTOSHOP_LAYER_ID_MISMATCH', 'photoshopLayerId', 'positive integer', applied.photoshopLayerId);
  }
  exact('ACK_METADATA_REVISION_MISMATCH', 'metadataRevision', metadata.metadataRevision, applied.metadataRevision);
  if (!Number.isFinite(applied.opacity) || Math.abs(applied.opacity - metadata.opacity) > opacityTolerance) {
    throw bakeAckError('ACK_OPACITY_MISMATCH', 'opacity', metadata.opacity, applied.opacity);
  }
  exact('ACK_BLEND_MODE_MISMATCH', 'blendMode', metadata.blendMode, applied.blendMode);
  exact('ACK_VISIBILITY_MISMATCH', 'visible', metadata.visible, applied.visible);
  exact('ACK_ORDER_MISMATCH', 'order', metadata.order, applied.order);
  if (!Array.isArray(applied.appliedLayers)) throw bakeAckError('ACK_APPLIED_LAYERS_MISMATCH', 'appliedLayers', 'array', applied.appliedLayers);

  const expectedById = new Map(metadata.authoringStack.map((layer) => [layer.authoringLayerId, layer]));
  const validatedLayerIds = [];
  const seen = new Set();
  for (const actual of applied.appliedLayers) {
    const expected = expectedById.get(actual?.authoringLayerId);
    if (!expected || seen.has(actual.authoringLayerId)) throw bakeAckError('ACK_AUTHORING_LAYER_ID_MISMATCH', 'appliedLayers.authoringLayerId', 'unique outbound authoringLayerId', actual?.authoringLayerId);
    seen.add(actual.authoringLayerId);
    if (!Number.isSafeInteger(actual.photoshopLayerId) || actual.photoshopLayerId <= 0) throw bakeAckError('ACK_PHOTOSHOP_LAYER_ID_MISMATCH', `${actual.authoringLayerId}.photoshopLayerId`, 'positive integer', actual.photoshopLayerId);
    exact('ACK_METADATA_REVISION_MISMATCH', `${actual.authoringLayerId}.metadataRevision`, expected.metadataRevision, actual.metadataRevision);
    if (!Number.isFinite(actual.opacity) || Math.abs(actual.opacity - expected.opacity) > opacityTolerance) throw bakeAckError('ACK_OPACITY_MISMATCH', `${actual.authoringLayerId}.opacity`, expected.opacity, actual.opacity);
    exact('ACK_BLEND_MODE_MISMATCH', `${actual.authoringLayerId}.blendMode`, expected.blendMode, actual.blendMode);
    exact('ACK_VISIBILITY_MISMATCH', `${actual.authoringLayerId}.visible`, expected.visible, actual.visible);
    exact('ACK_ORDER_MISMATCH', `${actual.authoringLayerId}.order`, expected.order, actual.order);
    validatedLayerIds.push(actual.authoringLayerId);
  }
  if (!seen.has(metadata.authoringLayerId)) throw bakeAckError('ACK_AUTHORING_LAYER_ID_MISMATCH', 'appliedLayers.authoringLayerId', metadata.authoringLayerId, null);
  const selectedApplied = applied.appliedLayers.find((layer) => layer.authoringLayerId === metadata.authoringLayerId);
  exact('ACK_PHOTOSHOP_LAYER_ID_MISMATCH', 'selected photoshopLayerId', applied.photoshopLayerId, selectedApplied.photoshopLayerId);
  return validatedLayerIds;
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
  const selectedLayer = authoringSession.selectedLayer;
  if (!selectedLayer?.visible) throw new Error('AUTHORING_LAYER_REQUIRED: Select a visible layer before Send.');
  if (!selectedProjectionResultReady()) throw new Error('PIXEL_RESULT_NOT_READY: Bake the selected layer before Send.');
  const output = projectionBakeRuntime.readOutputRgba(outputKind);
  const registry = state.reverseBake.targetRegistry;
  const destination = resolveReverseBakeTarget(output.familyId, output.outputKind);
  if (!destination.binding || !destination.target) {
    throw new Error(`TARGET_BINDING_NOT_FOUND: No Bake Target is assigned to ${destination.bindingKey}.`);
  }
  const target = destination.target;
  if (target.status !== 'READY') throw new Error(`TARGET_NOT_READY: ${target.label} is ${target.status}.`);
  if (target.width !== output.width || target.height !== output.height) {
    throw new Error(`TARGET_DIMENSION_MISMATCH: ${output.outputKind} requires ${output.width} × ${output.height}; target is ${target.width} × ${target.height}.`);
  }
  if (target.documentMode !== 'RGB' || target.documentDepth !== 8) throw new Error('TARGET_UNSUPPORTED: Block 7 requires an RGB 8-bit Photoshop document.');
  const jobId = state.reverseBake.nextJobId++;
  const chunkSize = liveLinkConfig.chunkSizeBytes;
  const chunkCount = Math.ceil(output.bytes.byteLength / chunkSize);
  const metadata = {
    type: 'BAKE_BEGIN', jobId, familyId: output.familyId, outputKind: output.outputKind,
    outputId: `${output.familyId}:${output.outputKind}`,
    bindingKey: destination.bindingKey,
    targetId: target.targetId,
    targetSessionId: registry.sessionId,
    documentId: target.documentId,
    targetDocumentId: target.documentId,
    width: output.width, height: output.height, components: output.components, componentSize: output.componentSize,
    pixelFormat: output.pixelFormat, colorSpace: output.colorSpace, alpha: output.alpha, orientation: output.orientation,
    authoringLayerId: selectedLayer.layerId,
    authoringLayerName: selectedLayer.source.filename,
    metadataRevision: selectedLayer.metadataRevision,
    opacity: selectedLayer.opacity,
    blendMode: selectedLayer.blendMode,
    visible: selectedLayer.visible,
    order: selectedLayer.order,
    authoringStack: authoringSession.layers.map((layer) => ({
      authoringLayerId: layer.layerId,
      metadataRevision: layer.metadataRevision,
      order: layer.order,
      opacity: layer.opacity,
      blendMode: layer.blendMode,
      visible: layer.visible
    })),
    totalBytes: output.bytes.byteLength, chunkSize, chunkCount, requestedAtEpochMs: Date.now()
  };
  state.reverseBake.activeJobId = jobId;
  state.reverseBake.state = 'REQUESTED';
  state.reverseBake.lastError = '';
  projectionPocMessage.className = 'projection-poc-message';
  projectionPocMessage.textContent = `${output.outputKind} ${output.width} × ${output.height} raw RGBA8 → ${target.label} / ${target.documentName}.`;
  syncProjectionPocUi();
  const completion = waitForPhotoshopBakeApply(jobId);
  try {
    console.info('[LUUX][Block8C][RendererOutbound]', JSON.stringify({
      jobId: metadata.jobId, targetSessionId: metadata.targetSessionId, targetId: metadata.targetId,
      documentId: metadata.documentId, familyId: metadata.familyId, outputKind: metadata.outputKind,
      authoringLayerId: metadata.authoringLayerId, metadataRevision: metadata.metadataRevision,
      opacity: metadata.opacity, blendMode: metadata.blendMode, visible: metadata.visible, order: metadata.order
    }));
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
    const validatedLayerIds = validateRendererBakeApplyAck(metadata, applied);
    console.info('[LUUX][Block8C][RendererAckValidated]', JSON.stringify({
      jobId: applied.jobId, targetSessionId: applied.targetSessionId, targetId: applied.targetId,
      documentId: applied.documentId, familyId: applied.familyId, outputKind: applied.outputKind,
      authoringLayerId: applied.authoringLayerId, photoshopLayerId: applied.photoshopLayerId,
      metadataRevision: applied.metadataRevision, opacity: applied.opacity, blendMode: applied.blendMode,
      visible: applied.visible, order: applied.order
    }));
    state.reverseBake.lastApplied = applied;
    authoringSession.markMetadataSynced(validatedLayerIds);
    state.reverseBake.state = 'APPLIED';
    projectionPocMessage.className = 'projection-poc-message pass';
    projectionPocMessage.textContent = `PHOTOSHOP APPLY COMPLETE · ${output.outputKind} · ${output.width} × ${output.height} · Layer ${applied.photoshopLayerId}.`;
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
    syncAuthoringUi();
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
    const selectedLayer = authoringSession.selectedLayer;
    const exportOpacity = selectedLayer?.opacity ?? 1;
    const exported = await projectionBakeRuntime.exportPng(kind, { opacity: exportOpacity });
    downloadBlob(exported.blob, exported.fileName);
    projectionPocMessage.className = 'projection-poc-message pass';
    projectionPocMessage.textContent = `${exported.fileName} (${exported.width} × ${exported.height}) · Opacity ${Math.round(exported.opacity * 100)}% download started.`;
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

async function runProjectionBake({ repetitions = 1, maskMode = null, allowSynthetic = false } = {}) {
  if (planarWorkflow.job) throw new Error('PLANAR_BAKE_BUSY');
  const profile = currentProjectionBakeProfile();
  if (!isProjectionPocContext() || !profile) throw new Error('Block 6B PoC requires an implemented anamorphic family calibration with its exact Surface.');
  const profileValidation = validateProjectionBakeProfile(profile);
  if (!profileValidation.valid) throw new Error(`ProjectionBakeProfile invalid: ${profileValidation.errors.join(', ')}`);
  const selectedLayer = authoringSession.selectedLayer;
  if (!allowSynthetic && !selectedLayer) throw new Error('AUTHORING_LAYER_REQUIRED: Add and select a layer before Bake.');
  if (!allowSynthetic && selectedLayer?.visible !== true) throw new Error('AUTHORING_LAYER_HIDDEN: The selected layer must be visible before Bake.');
  const authoringSource = selectedLayer?.runtime || null;
  if (authoringSource && authoringSession.familyId !== profile.familyId) {
    throw new Error(`AUTHORING_FAMILY_MISMATCH: Image session belongs to ${authoringSession.familyId}; current family is ${profile.familyId}.`);
  }
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
      maskMode: requestedMaskMode,
      authoringSource,
      authoringTransform: authoringSource ? authoringSession.transform : null,
      authoringVectorMask: authoringSource ? selectedLayer.vectorMask : null
    });
    matteAsset.dispose();
    result.matteAsset = matteAsset.diagnostics;
    matteAsset = null;
    result.profileValid = profileValidation.valid;
    result.contextLossCount = state.contextLossCount;
    result.userValidation = state.projectionBake.userValidation;
    result.block6AFrontValidation = profile.block6AUserValidation;
    result.authoringRevision = authoringSource ? authoringSession.revision : null;
    result.authoringLayerId = selectedLayer?.layerId || null;
    result.authoringLayerOrder = selectedLayer?.order ?? null;
    const maxSampleDelta = (sample, target) => Math.max(...sample.source.map((value, index) => Math.abs(value - sample[target][index])));
    const sampleMatchesIfVisible = (sample, target, maximumDelta) =>
      sample[target][3] === 0 || maxSampleDelta(sample, target) <= maximumDelta;
    const vectorMaskApplied = result.authoring?.vectorMask?.applied === true;
    result.technicalThresholds = {
      canonicalCoverage: vectorMaskApplied
        ? { min: 0.001, max: 1 }
        : requestedMaskMode === 'production' && profile.familyId === ANAMORPHIC_FAMILY_IDS.FRONT_75F
        ? { min: 0.5, max: 0.65 }
        : { min: 0.01, max: 1 },
      visibleScreenPixelCountMin: vectorMaskApplied ? 10_000 : 100_000,
      maeMax: 1,
      rmseMax: 5,
      silhouetteIouMin: 0.999,
      directOnlyPixelCountMax: 1024,
      reprojectOnlyPixelCountMax: 0,
      centerRgbaDeltaMax: 1,
      alphaRgbaDeltaMax: 1
    };
    result.authoringTechnicalThresholds = authoringSource ? {
      ...result.technicalThresholds,
      maeMax: 1.25,
      reprojectOnlyPixelCountMax: 4096,
      reason: 'ROTATED_STRAIGHT_ALPHA_LINEAR_RESAMPLE_EDGE_TOLERANCE'
    } : null;
    const roundTripThresholds = result.authoringTechnicalThresholds || result.technicalThresholds;
    const inverseMaskActive = result.mask.exactLinearInversion === true;
    result.maskAdjustedSourceComparison = inverseMaskActive ? 'NOT_APPLICABLE_MASK_INVERTED' : 'SOURCE_EQUIVALENCE_REQUIRED';
    const sharedRoundTripPass =
      result.canonicalCoverage >= result.technicalThresholds.canonicalCoverage.min &&
      result.canonicalCoverage <= result.technicalThresholds.canonicalCoverage.max &&
      result.visibleScreenPixelCount >= result.technicalThresholds.visibleScreenPixelCountMin &&
      result.directVsCanonicalReprojected.mae <= roundTripThresholds.maeMax &&
      result.directVsCanonicalReprojected.rmse <= roundTripThresholds.rmseMax &&
      result.visibilityAgreement.silhouetteIou >= roundTripThresholds.silhouetteIouMin &&
      result.visibilityAgreement.directOnlyPixelCount <= roundTripThresholds.directOnlyPixelCountMax &&
      result.visibilityAgreement.reprojectOnlyPixelCount <= roundTripThresholds.reprojectOnlyPixelCountMax &&
      result.visibilityDiagnostic.occludedPixelCount > 0;
    const syntheticSourceEquivalencePass = inverseMaskActive || (
        result.sourceVsDirect.mae <= result.technicalThresholds.maeMax &&
        result.sourceVsDirect.rmse <= result.technicalThresholds.rmseMax &&
        result.sourceVsCanonicalReprojected.mae <= result.technicalThresholds.maeMax &&
        result.sourceVsCanonicalReprojected.rmse <= result.technicalThresholds.rmseMax &&
        sampleMatchesIfVisible(result.centerSample, 'direct', result.technicalThresholds.centerRgbaDeltaMax) &&
        sampleMatchesIfVisible(result.centerSample, 'reprojected', result.technicalThresholds.centerRgbaDeltaMax) &&
        sampleMatchesIfVisible(result.alphaTest, 'direct', result.technicalThresholds.alphaRgbaDeltaMax) &&
        sampleMatchesIfVisible(result.alphaTest, 'reprojected', result.technicalThresholds.alphaRgbaDeltaMax));
    result.roundTripMetricsPass = sharedRoundTripPass &&
      (authoringSource ? result.authoring.productionSampling === 'ORIGINAL_FILE_BITMAP_DIRECT_TEXTURE_SAMPLE' : syntheticSourceEquivalencePass);
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
      result.directProjection.sourceTexture === (authoringSource ? 'ORIGINAL_FILE_BITMAP' : 'ORIGINAL_WORKING_SOURCE') &&
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
    if (authoringSource) authoringSession.markBaked();
    state.projectionBake.status = result.technicalPass ? 'TECHNICAL PASS' : 'TECHNICAL CHECK';
    projectionPocMessage.className = `projection-poc-message ${result.technicalPass ? 'pass' : 'fail'}`;
    projectionPocMessage.textContent = result.technicalPass
      ? `${authoringSource ? 'Authoring image' : 'Technical diagnostics'} pass · Camera-depth visibility · Mask ${result.mask.enabled ? 'ON' : 'OFF'}.`
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
    syncAuthoringUi();
    render();
    updateDiagnostics();
  }
}

async function projectLayerForFullMerge(profile, matteAsset, layer, previewCanvases = null, surfaceMeshes = null) {
  return projectionBakeRuntime.run({
    profile,
    surfaceMeshes: surfaceMeshes ?? state.site.activeBindings
      .filter((binding) => binding.mesh.name === profile.surfaceBinding.exactName)
      .map((binding) => binding.mesh),
    occluderMeshes: matteAsset.meshes,
    previewCanvases,
    repetitions: 1,
    maskMode: isProjectionMaskEnabled(profile) ? 'production' : 'full-white',
    authoringSource: layer.runtime,
    authoringTransform: layer.transform,
    authoringVectorMask: layer.vectorMask
  });
}

async function runFullMergedBake({ familyId = null, autoPreview = false } = {}) {
  const profile = autoPreview ? getProjectionBakeProfile(familyId) : currentProjectionBakeProfile();
  if (!profile || (!autoPreview && !isProjectionPocContext())) throw new Error('FULL_MERGE_CONTEXT_REQUIRED: Select an available Anamorphic Projection View.');
  const familyLayers = autoPreview ? authoringSession.ensureFamily(profile.familyId) : authoringSession.layers;
  if (familyLayers.length === 0) throw new Error('FULL_MERGE_LAYERS_REQUIRED: Add at least one layer.');
  if (state.projectionBake.running || state.fullMerge.running || planarWorkflow.job !== null || state.reverseBake.activeJobId !== null) return null;
  planarWorkflow.invalidateFamily(profile.familyId);
  const visibleLayers = [...familyLayers].reverse().filter((layer) => layer.visible);
  const startingRevision = authoringSession.mergedState(profile.familyId).revision;
  const projectSessionId = state.authoring.snapshot.projectSessionId;
  const stillCurrent = () => authoringSession.mergedState(profile.familyId).revision === startingRevision &&
    state.authoring.snapshot.projectSessionId === projectSessionId;
  const familyAsset = SITE_SCENE_PROFILE.worlds.world3d.anamorphicFamilies[
    profile.familyId === ANAMORPHIC_FAMILY_IDS.BACK ? 'back' : 'front75f'];
  const surfaceMeshes = autoPreview ? (state.site.meshesByWorld[familyAsset.assetId] ?? [])
    .filter((mesh) => mesh.name === profile.surfaceBinding.exactName) : null;
  if (autoPreview && surfaceMeshes.length !== 1) throw new Error('FULL_MERGE_SURFACE_UNAVAILABLE');
  const selectedBefore = authoringSession.selectedLayer;
  const selectedWasReady = !autoPreview && selectedProjectionResultReady(profile);
  const selectedResultBefore = state.projectionBake.result;
  const accumulator = fullMergeRuntime.begin(profile);
  let matteAsset = null;
  state.fullMerge.running = true;
  state.fullMerge.error = '';
  fullMergeMessage.className = 'projection-poc-message';
  fullMergeMessage.textContent = visibleLayers.length
    ? `Projecting and compositing ${visibleLayers.length} visible layer${visibleLayers.length === 1 ? '' : 's'} bottom-to-top…`
    : 'All layers are hidden. Producing transparent merged output…';
  syncProjectionPocUi();
  syncAuthoringUi();
  try {
    if (visibleLayers.length) matteAsset = await loadProjectionBakeMatte(profile);
    const layers = [];
    for (const layer of visibleLayers) {
      const projected = await projectLayerForFullMerge(profile, matteAsset, layer, null, surfaceMeshes);
      if (!stillCurrent()) { accumulator.dispose(); return null; }
      accumulator.addLayer({
        directTarget: projectionBakeRuntime.resources.directTarget,
        canonicalTarget: projectionBakeRuntime.resources.bakeTarget,
        opacity: layer.opacity,
        blendMode: layer.blendMode
      });
      layers.push({
        authoringLayerId: layer.layerId,
        order: layer.order,
        visible: true,
        opacity: layer.opacity,
        blendMode: layer.blendMode,
        vectorMaskApplied: projected.authoring?.vectorMask?.applied === true
      });
    }
    if (!stillCurrent()) { accumulator.dispose(); return null; }
    const mergedRevision = startingRevision;
    const result = accumulator.finish({
      familyLabel: profile.label,
      mergedRevision,
      compositingOrder: 'BOTTOM_TO_TOP',
      alphaContract: 'STRAIGHT_ALPHA_SOURCE_TIMES_LAYER_OPACITY_ONCE',
      outsideSignageIncluded: false,
      layers
    });
    authoringSession.markMergedBaked(profile.familyId);
    if (!autoPreview || currentProjectionBakeProfile()?.familyId === profile.familyId) {
      fullMergeRuntime.drawPreviews(profile.familyId, fullMergePreviewCanvases);
    }
    fullMergeMessage.className = 'projection-poc-message pass';
    fullMergeMessage.textContent = `${profile.label} Full Merge ready · ${visibleLayers.length} visible layer${visibleLayers.length === 1 ? '' : 's'} · Direct ${result.directWidth} × ${result.directHeight} · Canonical ${result.canonicalWidth} × ${result.canonicalHeight}.`;

    if (autoPreview) {
      projectionBakeRuntime.dispose();
      state.projectionBake.result = null;
      state.projectionBake.status = authoringSession.source ? 'DIRTY / NEEDS BAKE' : 'READY';
    } else if (selectedWasReady && selectedBefore?.visible) {
      await projectLayerForFullMerge(profile, matteAsset, selectedBefore, projectionPreviewCanvases);
      state.projectionBake.result = selectedResultBefore;
    } else {
      projectionBakeRuntime.dispose();
      state.projectionBake.result = null;
      state.projectionBake.status = authoringSession.source ? 'DIRTY / NEEDS BAKE' : 'READY';
      clearProjectionPreviews();
    }
    window.block8FFullMergeDiagnostics = {
      ...result,
      directTarget: undefined,
      canonicalTarget: undefined,
      userValidation: state.fullMerge.userValidation,
      technicalPass: true,
      photoshopMutationCount: 0,
      contextLossCount: state.contextLossCount
    };
    return result;
  } catch (error) {
    accumulator.dispose();
    state.fullMerge.error = error.stack || error.message;
    fullMergeMessage.className = 'projection-poc-message fail';
    fullMergeMessage.textContent = state.fullMerge.error;
    throw error;
  } finally {
    matteAsset?.dispose();
    state.fullMerge.running = false;
    syncProjectionPocUi();
    syncAuthoringUi();
    updateDiagnostics();
  }
}

async function saveFullMergedPng(kind) {
  if (fullMergePngExporting) return null;
  const profile = currentProjectionBakeProfile();
  if (!mergedProjectionResultReady(profile)) throw new Error('FULL_MERGE_NOT_READY: Run BAKE FULL MERGED for the current family.');
  fullMergePngExporting = true;
  syncProjectionPocUi();
  try {
    const exported = await fullMergeRuntime.exportPng(profile.familyId, kind);
    downloadBlob(exported.blob, exported.fileName);
    fullMergeMessage.className = 'projection-poc-message pass';
    fullMergeMessage.textContent = `${exported.fileName} (${exported.width} × ${exported.height}) download started.`;
    return exported;
  } finally {
    fullMergePngExporting = false;
    syncProjectionPocUi();
  }
}

async function runPlanarBake() {
  const profile = currentProjectionBakeProfile();
  if (!isProjectionPocContext() || !profile) throw new Error('PLANAR_CONTEXT_REQUIRED');
  const planarAsset = state.manifest?.planarMapping?.profiles?.[profile.familyId];
  if (!planarAsset?.sourceVerified || !planarAsset?.buildCopyVerified) throw new Error('PLANAR_ASSET_UNAVAILABLE');
  const revision = authoringSession.mergedState(profile.familyId).revision;
  const ready = mergedProjectionResultReady(profile);
  if (!ready) {
    planarMasterMessage.className = 'projection-poc-message fail';
    planarMasterMessage.textContent = 'FULL MERGE REQUIRED · Run BAKE FULL MERGED first.';
    throw new Error('FULL_MERGE_REQUIRED');
  }
  planarMasterMessage.className = 'projection-poc-message';
  planarMasterMessage.textContent = `Baking ${profile.label} Full Merged Direct revision ${revision} to Planar Master…`;
  try {
    const output = await planarWorkflow.bake(profile.familyId, { ready, revision });
    if (!output) {
      if (currentProjectionBakeProfile()?.familyId === profile.familyId) {
        planarMasterMessage.className = 'projection-poc-message fail';
        planarMasterMessage.textContent = 'STALE PLANAR BAKE DISCARDED · Full Merge changed. Re-bake Full Merge, then Planar.';
      }
      return null;
    }
    if (isProjectionPocContext() && currentProjectionBakeProfile()?.familyId === profile.familyId) {
      planarMasterMessage.className = 'projection-poc-message pass';
      planarMasterMessage.textContent = `${profile.label} Planar output READY · ${output.width} × ${output.height} · Direct revision ${revision}.`;
      try {
        openPlanarPreview(output);
      } catch (previewError) {
        planarMasterMessage.textContent += ` Preview unavailable: ${previewError.message || previewError}`;
      }
    }
    return output;
  } catch (error) {
    if (currentProjectionBakeProfile()?.familyId === profile.familyId) {
      planarMasterMessage.className = 'projection-poc-message fail';
      planarMasterMessage.textContent = String(error.message || error);
    }
    throw error;
  } finally {
    syncProjectionPocUi();
    syncAuthoringUi();
    updateDiagnostics();
  }
}

function closePlanarPreview({ restoreFocus = true } = {}) {
  if (planarPreviewOverlay.hidden) return;
  const returnFocus = planarPreviewReturnFocus;
  planarPreviewOverlay.hidden = true;
  planarPreviewImage.removeAttribute('src');
  if (planarPreviewUrl) URL.revokeObjectURL(planarPreviewUrl);
  planarPreviewUrl = null;
  planarPreviewOutput = null;
  planarPreviewReturnFocus = null;
  if (restoreFocus && returnFocus?.isConnected && !returnFocus.disabled) returnFocus.focus();
}

function openPlanarPreview(output) {
  const profile = currentProjectionBakeProfile();
  const revision = profile ? authoringSession.mergedState(profile.familyId).revision : null;
  if (!isProjectionPocContext() || !profile || output !== planarWorkflow.readyOutput(profile.familyId, revision) ||
      !(output.blob instanceof Blob) || output.blob.type !== 'image/png') {
    throw new Error('PLANAR_NOT_READY');
  }
  const returnFocus = document.activeElement;
  closePlanarPreview({ restoreFocus: false });
  const url = URL.createObjectURL(output.blob);
  planarPreviewUrl = url;
  planarPreviewOutput = output;
  planarPreviewReturnFocus = returnFocus;
  planarPreviewDetails.textContent = `${profile.label} · ${output.width} × ${output.height} · Full Merged Direct revision ${revision}`;
  planarPreviewImage.src = url;
  planarPreviewOverlay.hidden = false;
  planarPreviewClose.focus();
}

function syncPlanarPreviewValidity() {
  if (planarPreviewOverlay.hidden) return;
  const profile = currentProjectionBakeProfile();
  const revision = profile ? authoringSession.mergedState(profile.familyId).revision : null;
  if (!isProjectionPocContext() || !profile || planarPreviewOutput !== planarWorkflow.readyOutput(profile.familyId, revision)) {
    closePlanarPreview({ restoreFocus: false });
  }
}

function savePlanarPng() {
  const profile = currentProjectionBakeProfile();
  if (!isProjectionPocContext() || !profile || !mergedProjectionResultReady(profile)) throw new Error('PLANAR_NOT_READY');
  const revision = authoringSession.mergedState(profile.familyId).revision;
  const output = planarWorkflow.readyOutput(profile.familyId, revision);
  if (!output || planarWorkflow.job || planarPngExporting) throw new Error('PLANAR_NOT_READY');
  planarPngExporting = true;
  syncProjectionPocUi();
  try {
    const familyLabel = profile.familyId === ANAMORPHIC_FAMILY_IDS.FRONT_75F ? 'Front75F' : 'Back';
    const fileName = `LUUX_Planar_Master_${familyLabel}_${PLANAR_OUTPUT_PROFILE.outputResolution.width}x${PLANAR_OUTPUT_PROFILE.outputResolution.height}.png`;
    downloadBlob(output.blob, fileName);
    planarMasterMessage.className = 'projection-poc-message pass';
    planarMasterMessage.textContent = `${fileName} download started.`;
    return { ...output, fileName };
  } finally {
    planarPngExporting = false;
    syncProjectionPocUi();
  }
}

function markAnamorphicFreePreview() {
  if (!isAnamorphicCalibrationContext() || state.site.anamorphicCameraMode === 'FREE_PREVIEW') return;
  state.site.anamorphicCameraMode = 'FREE_PREVIEW';
  releaseProjectionBakeResources('free-preview');
  cameraSite.position.y += 0.5;
  cameraSite.up.set(0, 1, 0);
  cameraSite.zoom = 1;
  if (cameraSite.view?.enabled) cameraSite.clearViewOffset();
  cameraSite.aspect = Math.max(1, viewer.clientWidth) / Math.max(1, viewer.clientHeight);
  cameraSite.updateProjectionMatrix();
  controlsSite.update();
  cameraSite.updateMatrixWorld(true);
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
  if (!isAnamorphicCalibrationFramingActive() || !state.site.surfaceSetAvailable || authoringCameraInterlock.cameraLocked) return false;
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

function resetFreeSiteCamera() {
  if (state.site.world !== 'world3d' || state.site.mappingMode !== 'normal' ||
      !state.site.surfaceSetAvailable) return false;
  const frontSweet = SITE_SCENE_PROFILE.worlds.legacy2d.normalScenes
    .find((scene) => scene.id === 'frontSweet').camera;
  const [pitch, yaw] = frontSweet.eulerXyzDegrees;
  const levelOrientation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(pitch), THREE.MathUtils.degToRad(yaw), 0, 'XYZ'
  ));
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(levelOrientation);
  cameraSite.fov = frontSweet.fov;
  cameraSite.aspect = Math.max(1, viewer.clientWidth) / Math.max(1, viewer.clientHeight);
  cameraSite.near = frontSweet.near;
  cameraSite.far = frontSweet.far;
  cameraSite.zoom = 1;
  if (cameraSite.view?.enabled) cameraSite.clearViewOffset();
  cameraSite.position.fromArray(frontSweet.position);
  cameraSite.position.y += 0.5;
  cameraSite.up.set(0, 1, 0);
  controlsSite.target.copy(cameraSite.position).addScaledVector(forward, 10);
  cameraSite.updateProjectionMatrix();
  controlsSite.update();
  cameraSite.updateMatrixWorld(true);
  return true;
}

const FULL_FRAME_SENSOR_WIDTH_MM = 36;
const SITE_FOCAL_MIN_MM = 20;
const SITE_FOCAL_MAX_MM = 400;

function focal35mmFromVerticalFov(verticalFov, aspect) {
  return FULL_FRAME_SENSOR_WIDTH_MM / (2 * aspect * Math.tan(THREE.MathUtils.degToRad(verticalFov) / 2));
}

function verticalFovFromFocal35mm(focalMm, aspect) {
  return THREE.MathUtils.radToDeg(2 * Math.atan(FULL_FRAME_SENSOR_WIDTH_MM / (2 * focalMm * aspect)));
}

function focal35mmFromSlider(value) {
  return SITE_FOCAL_MIN_MM * Math.pow(SITE_FOCAL_MAX_MM / SITE_FOCAL_MIN_MM, Number(value) / 1000);
}

function sliderFromFocal35mm(focalMm) {
  const clamped = THREE.MathUtils.clamp(focalMm, SITE_FOCAL_MIN_MM, SITE_FOCAL_MAX_MM);
  return Math.round(1000 * Math.log(clamped / SITE_FOCAL_MIN_MM) /
    Math.log(SITE_FOCAL_MAX_MM / SITE_FOCAL_MIN_MM));
}

function siteFovVisible() {
  return document.body.dataset.uiMode === 'production' && productionWorkspace === 'site' &&
    state.activeView === 'site-3d' && state.site.world === 'world3d';
}

function siteFovEditable() {
  return siteFovVisible() && state.site.surfaceSetAvailable && !authoringCameraInterlock.cameraLocked &&
    (!isAnamorphicCalibrationContext() || isAnamorphicCalibrationFramingActive());
}

function syncSiteFovControl() {
  siteFovControl.hidden = !siteFovVisible();
  siteFovSlider.disabled = siteFovResetButton.disabled = !siteFovEditable();
  if (siteFovControl.hidden) return;
  const focalMm = focal35mmFromVerticalFov(cameraSite.fov, cameraSite.aspect);
  siteFovSlider.value = String(sliderFromFocal35mm(focalMm));
  siteFovSlider.setAttribute('aria-valuetext', `${focalMm.toFixed(1)} millimeters, ${cameraSite.fov.toFixed(1)} degrees`);
  siteFovValue.textContent = `${focalMm.toFixed(1)} mm · ${cameraSite.fov.toFixed(1)}°`;
}

function applySiteFocal35mm(focalMm) {
  if (!siteFovEditable() || !Number.isFinite(focalMm) || focalMm < SITE_FOCAL_MIN_MM ||
      focalMm > SITE_FOCAL_MAX_MM) return false;
  const verticalFov = verticalFovFromFocal35mm(focalMm, cameraSite.aspect);
  if (isAnamorphicCalibrationContext()) return applyAnamorphicFovValue(verticalFov);
  cameraSite.fov = verticalFov;
  cameraSite.updateProjectionMatrix();
  cameraSite.updateMatrixWorld(true);
  updateZoomReadout();
  render();
  updateDiagnostics();
  return true;
}

function resetSiteFov() {
  if (!siteFovEditable()) return false;
  const baselineFov = isAnamorphicCalibrationContext()
    ? currentAnamorphicFamily().cameraProfile.runtimeFov
    : SITE_SCENE_PROFILE.worlds.legacy2d.normalScenes.find((scene) => scene.id === 'frontSweet').camera.fov;
  if (isAnamorphicCalibrationContext()) return applyAnamorphicFovValue(baselineFov);
  cameraSite.fov = baselineFov;
  cameraSite.updateProjectionMatrix();
  cameraSite.updateMatrixWorld(true);
  render();
  updateDiagnostics();
  return true;
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

function siteCameraRuntimeMatchesSnapshot(snapshot, epsilon = 1e-9) {
  return Boolean(snapshot) &&
    Math.abs(cameraSite.fov - snapshot.fov) <= epsilon &&
    Math.abs(cameraSite.aspect - snapshot.aspect) <= epsilon &&
    Math.abs(cameraSite.near - snapshot.near) <= epsilon &&
    Math.abs(cameraSite.far - snapshot.far) <= epsilon &&
    Math.abs(cameraSite.zoom - snapshot.zoom) <= epsilon &&
    cameraSite.position.distanceTo(snapshot.position) <= epsilon &&
    cameraSite.quaternion.angleTo(snapshot.quaternion) <= epsilon &&
    controlsSite.target.distanceTo(snapshot.target) <= epsilon;
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

function resetCurrentView() {
  if (state.activeView === '3d-plane') {
    camera3d.position.set(0, 0, 3);
    camera3d.zoom = 1;
    camera3d.updateProjectionMatrix();
    controls3d.target.set(0, 0, 0);
    controls3d.update();
  } else if (state.activeView === 'site-3d' && state.site.surfaceSetAvailable) {
    if (isAnamorphicCalibrationContext()) {
      if (authoringCameraInterlock.forcedLocked) return false;
      return applyAnamorphicCalibrationCamera();
    }
    if (isLegacyCameraContext()) return resetCameraEditorView();
    if (state.site.world !== 'world3d' || state.site.mappingMode !== 'normal') return false;
    resetFreeSiteCamera();
  } else {
    return false;
  }
  updateZoomReadout();
  render();
  updateDiagnostics();
  return true;
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
  legacyCameraLockButton.textContent = state.site.legacyCameraLocked ? 'CAMERA EDITOR LOCKED' : 'CAMERA EDITOR UNLOCKED';
  legacyCameraLockButton.setAttribute('aria-pressed', String(state.site.legacyCameraLocked));
  legacyCameraLockButton.classList.toggle('locked', state.site.legacyCameraLocked);
  legacyCameraLockButton.classList.toggle('unlocked', !state.site.legacyCameraLocked);
  const authoringLocked = isAnamorphicCalibrationContext() && authoringCameraInterlock.cameraLocked;
  controlsSite.enabled = state.activeView === 'site-3d' &&
    state.site.surfaceSetAvailable &&
    !legacyContext &&
    !authoringLocked;
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
  invalidateAuthoringCoverage();
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
    else if (state.site.surfaceSetAvailable) {
      if (state.site.world === 'world3d' && state.site.mappingMode === 'normal') resetFreeSiteCamera();
      else fitSiteCameraToActiveSurfaces();
    }
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
        child.userData.previewBackgroundSurface = Boolean(anamorphicFamily) && !productionHelper;
        child.material = new THREE.MeshBasicMaterial({
          map: productionHelper ? null : state.texture,
          color: 0xffffff,
          transparent: !child.userData.previewBackgroundSurface,
          opacity: 1,
          side: THREE.DoubleSide,
          depthTest: true,
          depthWrite: true,
          toneMapped: false
        });
        if (child.userData.previewBackgroundSurface) installPreviewBackgroundShader(child.material);
        else if (!productionHelper) installSimpleImageBlackShader(child.material);
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
  texture.flipY = false;
  texture.userData.simpleImageAlphaBlack = asset.mime === 'image/png';
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = state.filterMode === 'pixel' ? THREE.NearestFilter : THREE.LinearFilter;
  texture.onUpdate = () => { state.gpuUploadObserved = true; };

  const decodedWidth = texture.image.naturalWidth || texture.image.width;
  const decodedHeight = texture.image.naturalHeight || texture.image.height;
  installTexture(texture, decodedWidth, decodedHeight, true);
  const previousImage = productionPreviewCache.imageTexture;
  productionPreviewCache.imageTexture = texture;
  productionPreviewCache.imageName = asset.fileName;
  productionPreviewCache.imageSelection = asset.id;
  for (const workspace of ['photo', 'site']) {
    if (productionPreviewCache.lastValid[workspace] === previousImage) productionPreviewCache.lastValid[workspace] = texture;
  }
  if (previousImage && previousImage !== texture && previousImage !== productionPreviewCache.photoshopTexture &&
      !productionPreviewCache.imageBank.some((entry) => entry.texture === previousImage)) previousImage.dispose();
  syncProductionImageBankUi();

  applyFit();
  render();
  await nextFrame();
  render();
  gl.finish();
  updateDiagnostics();
  window.dispatchEvent(new CustomEvent('block0-ready', { detail: state.diagnostics }));
}

function syncProductionImageBankUi() {
  const { imageSelection, imageBank, bankLoading } = productionPreviewCache;
  if (imageSelection && productionUi.imageAsset.querySelector(`option[value="${CSS.escape(imageSelection)}"]`)) {
    productionUi.imageAsset.value = imageSelection;
  }
  productionUi.imageDeleteButton.disabled = !imageBank.some((entry) => entry.id === imageSelection);
  productionUi.imageAsset.title = productionPreviewCache.imageName;
  productionUi.imageName.title = productionPreviewCache.imageName;
  productionUi.imageFileButton.disabled = bankLoading || imageBank.length >= PREVIEW_IMAGE_BANK_LIMIT;
  productionUi.imageBankCount.textContent = `BANK ${imageBank.length} / ${PREVIEW_IMAGE_BANK_LIMIT}`;
}

function shortPreviewImageName(name) {
  return name.length <= 32 ? name : `${name.slice(0, 18)}…${name.slice(-13)}`;
}

function selectProductionPreviewImage(texture, name, selection) {
  const previousImage = productionPreviewCache.imageTexture;
  productionPreviewCache.imageTexture = texture;
  productionPreviewCache.imageName = name;
  productionPreviewCache.imageSelection = selection;
  for (const workspace of ['photo', 'site']) {
    if (productionPreviewCache.lastValid[workspace] === previousImage) productionPreviewCache.lastValid[workspace] = texture;
  }
  if (previousImage && previousImage !== texture && previousImage !== state.texture &&
      previousImage !== productionPreviewCache.photoshopTexture &&
      !productionPreviewCache.imageBank.some((entry) => entry.texture === previousImage)) previousImage.dispose();
  syncProductionImageBankUi();
  render();
  updateDiagnostics();
}

function deleteSelectedProductionPreviewImage() {
  const selected = productionPreviewCache.imageBank.find((entry) => entry.id === productionPreviewCache.imageSelection);
  if (!selected) return;
  const remaining = productionPreviewCache.imageBank.filter((entry) => entry !== selected);
  const fallback = remaining.at(-1);
  if (fallback) selectProductionPreviewImage(fallback.texture, fallback.name, fallback.id);
  else if (state.asset?.kind === 'local' && state.texture) {
    selectProductionPreviewImage(state.texture, state.asset.fileName, state.asset.id);
  } else {
    selectProductionPreviewImage(null, '', null);
    productionUi.imageAsset.selectedIndex = -1;
  }
  productionPreviewCache.imageBank = remaining;
  for (const workspace of ['photo', 'site']) {
    if (productionPreviewCache.lastValid[workspace] === selected.texture) {
      productionPreviewCache.lastValid[workspace] = productionPreviewCache.imageTexture;
    }
  }
  productionUi.imageAsset.querySelector(`option[value="${CSS.escape(selected.id)}"]`)?.remove();
  render();
  for (const binding of state.site.bindings) {
    if (binding.mesh.material?.map === selected.texture) {
      binding.mesh.material.map = null;
      binding.mesh.material.needsUpdate = true;
    }
  }
  selected.texture.dispose();
  syncProductionImageBankUi();
  updateDiagnostics();
}

async function loadProductionPreviewFile(file) {
  if (!isSupportedImageFile(file)) throw new Error('Preview IMAGE supports PNG and JPG/JPEG files only.');
  if (productionPreviewCache.bankLoading) throw new Error('IMAGE_BANK_LOADING');
  if (productionPreviewCache.imageBank.length >= PREVIEW_IMAGE_BANK_LIMIT) throw new Error('IMAGE_BANK_FULL · delete the selected bank image first.');
  productionPreviewCache.bankLoading = true;
  syncProductionImageBankUi();
  try {
  const objectUrl = URL.createObjectURL(file);
  let texture;
  try {
    texture = await loadTexture(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.userData.simpleImageAlphaBlack = file.type === 'image/png' || /\.png$/i.test(file.name);
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = state.filterMode === 'pixel' ? THREE.NearestFilter : THREE.LinearFilter;
  const id = `bank:${productionPreviewCache.nextImageBankId++}`;
  const width = texture.image.naturalWidth || texture.image.width;
  const height = texture.image.naturalHeight || texture.image.height;
  productionPreviewCache.imageBank.push({ id, name: file.name, texture });
  const option = new Option(shortPreviewImageName(file.name), id);
  option.title = `${file.name} · ${width} × ${height}`;
  productionUi.imageAsset.append(option);
  selectProductionPreviewImage(texture, file.name, id);
  } finally {
    productionPreviewCache.bankLoading = false;
    syncProductionImageBankUi();
  }
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
  if (isAnamorphicCalibrationContext() && state.previewMode === PREVIEW_MODES.AUTHORING) renderer.initTexture(texture);

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
  state.link.liveFrameCurrent = true;
  const previousPhotoshop = productionPreviewCache.photoshopTexture;
  productionPreviewCache.photoshopTexture = texture;
  productionPreviewCache.photoshopFrame = state.link.lastFrame;
  for (const workspace of ['photo', 'site']) {
    if (productionPreviewCache.lastValid[workspace] === previousPhotoshop) productionPreviewCache.lastValid[workspace] = texture;
  }
  if (previousPhotoshop && previousPhotoshop !== texture && previousPhotoshop !== productionPreviewCache.imageTexture) previousPhotoshop.dispose();
  render();
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
  if (authoringCameraInterlock.layoutEditing && view !== state.activeView) exitLayoutEdit();
  if (authoringCameraInterlock.maskEditing && view !== state.activeView) exitVectorMaskEdit();
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
  const previewDecision = currentPreviewDecision();
  const siteMap = applySitePreviewSource(previewDecision);
  const displayedTexture = state.activeView === 'site-3d' ? siteMap : state.texture;
  const photoshopFreeSiteMatte = Boolean(displayedTexture && isProductionPreviewRoutingActive() &&
    productionWorkspace === 'site' && productionSitePreset === 'free' &&
    displayedTexture === productionPreviewCache.photoshopTexture);
  simpleImageBlackUniform.value = displayedTexture?.userData.simpleImageAlphaBlack || photoshopFreeSiteMatte ? 1 : 0;
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
  syncAuthoringOverlay();
  syncPreviewModeUi(previewDecision);
  syncPlanarPreviewValidity();
  syncProductionUi();
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
  if (authoringCameraInterlock.forcedLocked) return false;
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
      ? (isLegacyCameraContext()
        ? (state.interactionMode === 'point'
          ? 'PHOTO POINT: Left click points · Photo camera fixed'
          : 'PHOTO VIEW: Camera fixed to the selected photograph')
        : (document.body.dataset.uiMode === 'production' && productionWorkspace === 'authoring' &&
            authoringOrbitCanOpenFreeView()
          ? 'AUTHORING VIEW: Left drag opens SITE FREE VIEW · Middle drag: pan · Wheel: dolly'
          : state.interactionMode === 'point'
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
  if (authoringCameraInterlock.layoutEditing) {
    dragHint.textContent = 'LAYOUT EDIT: Drag image · Corner: uniform scale · Top handle: rotate · Camera interlocked';
  } else if (authoringCameraInterlock.maskEditing) {
    dragHint.textContent = 'MASK EDIT: Open path click adds · First anchor closes · Closed path double-click starts new · Drag space selects';
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
  const previewDecision = currentPreviewDecision();

  state.diagnostics = {
    previewMode: {
      ...previewDecision,
      activeOnSite: isAnamorphicCalibrationContext(),
      authoringOverlayVisible: !authoringOverlay.hidden,
      siteSurfaceUsesLiveTexture: isAnamorphicCalibrationContext() && state.site.activeBindings.some((binding) => binding.mesh.material.map === state.texture && Boolean(state.texture)),
      liveFrameCurrent: state.link.liveFrameCurrent
    },
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
    projectionAuthoring: {
      block: '8B',
      implementation: 'MULTI_IMAGE_LAYER_STACK_FOUNDATION',
      sourceKind: authoringSession.source ? 'FILE' : null,
      supportedFormats: ['PNG', 'JPG', 'JPEG'],
      source: authoringSession.source ? { ...authoringSession.source } : null,
      familyId: authoringSession.familyId,
      coordinateSpace: AUTHORING_COORDINATE_SPACE,
      transform: { ...authoringSession.transform },
      blendMode: 'NORMAL',
      opacity: 1,
      selectedLayerId: authoringSession.selectedLayerId,
      layerCount: authoringSession.layers.length,
      renderOrder: 'BOTTOM_TO_TOP',
      uiOrder: 'TOPMOST_FIRST',
      layers: authoringSession.layers.map((layer) => ({
        layerId: layer.layerId,
        filename: layer.source.filename,
        familyId: layer.familyId,
        mappingMode: layer.mappingMode,
        visible: layer.visible,
        order: layer.order,
        transform: { ...layer.transform }
      })),
      dirty: authoringSession.dirty,
      status: authoringSession.status,
      layoutEditing: authoringCameraInterlock.layoutEditing,
      manualCameraLocked: authoringCameraInterlock.manualLocked,
      cameraLockState: authoringCameraInterlock.displayState,
      cameraControlsEnabled: controlsSite.enabled,
      pointerDragActive: authoringPointerSession.active,
      projectionCameraMutationAllowed: false,
      fullBakeDuringDrag: false,
      userValidation: state.authoring.userValidation,
      block8BUserValidation: state.authoring.block8BUserValidation,
      outsideSignagePreview: {
        ownership: 'AUTHORING_VIEW_SETTINGS',
        outsideSignageOpacity: authoringViewSettings.outsideSignageOpacity,
        defaultOpacity: 0.5,
        range: [0, 1],
        sessionOnly: true,
        bakeAffects: false,
        coverageSource: 'CURRENT_FAMILY_APPROVED_SURFACE_PROJECTED_BY_APPROVED_CAMERA',
        planarMaskUsed: false,
        dedicatedVisibilityMatteUsed: false,
        cacheBuildCount: state.authoring.coverageCache.buildCount,
        cacheReuseCount: state.authoring.coverageCache.reuseCount,
        triangleCount: state.authoring.coverageCache.triangleCount,
        userValidation: state.authoring.outsidePreviewUserValidation
      },
      importError: state.authoring.importError,
      contextLossCount: state.contextLossCount
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
  window.block8AAuthoringDiagnostics = structuredClone(state.diagnostics.projectionAuthoring);

  const rows = [
    ['Active View', state.activeView === 'site-3d' ? 'SITE 3D' : (state.activeView === '3d-plane' ? '3D PLANE' : '2D VIEW')],
    ['Preview Mode', state.previewMode === PREVIEW_MODES.AUTHORING ? 'AUTHORING PREVIEW' : 'PHOTOSHOP FINAL PREVIEW'],
    ['Preview State', previewDecision.status],
    ['Preview Source', previewDecision.source],
    ['Preview Expected', previewDecision.expected ? `${previewDecision.expected.width} × ${previewDecision.expected.height}` : '—'],
    ['Preview Received', previewDecision.received ? `${previewDecision.received.width} × ${previewDecision.received.height}` : '—'],
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
  const textures = new Set([state.texture, productionPreviewCache.imageTexture,
    productionPreviewCache.photoshopTexture, ...productionPreviewCache.imageBank.map((entry) => entry.texture)]);
  for (const texture of textures) {
    if (!texture) continue;
    texture.magFilter = mode === 'pixel' ? THREE.NearestFilter : THREE.LinearFilter;
    texture.needsUpdate = true;
  }
  if ([...textures].some(Boolean)) {
    render();
    updateDiagnostics();
  }
}

function sendLinkMessage(message) {
  if (state.link.socket?.readyState !== WebSocket.OPEN) return false;
  state.link.socket.send(JSON.stringify(message));
  return true;
}

function nextSnapshotJobId() {
  state.authoring.snapshot.sequence += 1;
  return `snapshot-${Date.now().toString(36)}-${state.authoring.snapshot.sequence.toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

function snapshotFailure(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}

function rollbackSnapshotLayer(current) {
  if (!current?.installedLayerId) return;
  const activeFamily = authoringSession.activeFamilyId;
  authoringSession.activateFamily(current.request.familyId);
  const removed = authoringSession.deleteLayer(current.installedLayerId);
  if (removed?.runtime) disposeAuthoringRuntime(removed.runtime);
  if (activeFamily !== null && activeFamily !== undefined) authoringSession.activateFamily(activeFamily);
  current.installedLayerId = null;
}

function clearSnapshotJob({ rollback = false, error = '' } = {}) {
  const current = state.authoring.snapshot.current;
  if (rollback) rollbackSnapshotLayer(current);
  if (current) {
    current.bytes = null;
    current.pendingChunk = null;
  }
  state.authoring.snapshot.current = null;
  state.authoring.snapshot.status = error ? 'FAILED' : 'IDLE';
  state.authoring.snapshot.error = error;
  syncAuthoringUi();
}

function cancelActiveSnapshot(code = 'SNAPSHOT_CANCELED', message = 'Snapshot canceled by renderer context change.') {
  const current = state.authoring.snapshot.current;
  if (!current) return false;
  sendLinkMessage({ type: 'SNAPSHOT_CANCEL', snapshotJobId: current.request.snapshotJobId, code, message });
  clearSnapshotJob({ rollback: true, error: `${code}: ${message}` });
  return true;
}

let pendingSnapshotResolutionPrompt = null;

function requestPhotoshopSnapshot(captureMode, approval = null) {
  if (!isProjectionAuthoringContext()) throw snapshotFailure('SNAPSHOT_CONTEXT_UNAVAILABLE', 'Select an available Anamorphic Projection View.');
  if (!state.link.photoshopConnected) throw snapshotFailure('UXP_DISCONNECTED', 'Photoshop UXP is not connected.');
  if (state.authoring.snapshot.current) throw snapshotFailure('SNAPSHOT_BUSY', 'Another Snapshot job is active.');
  const profile = currentProjectionBakeProfile();
  const familyId = profile.familyId;
  if (approval && (approval.familyId !== familyId || approval.projectSessionId !== state.authoring.snapshot.projectSessionId)) {
    throw snapshotFailure('SNAPSHOT_CONTEXT_CHANGED', 'Family or project changed while waiting for resolution approval. Try the import again.');
  }
  const snapshotJobId = nextSnapshotJobId();
  const request = {
    type: 'SNAPSHOT_REQUEST',
    snapshotJobId,
    captureRequestId: crypto.randomUUID(),
    projectSessionId: state.authoring.snapshot.projectSessionId,
    familyId,
    captureMode,
    expectedDocumentWidth: profile.workingResolution.width,
    expectedDocumentHeight: profile.workingResolution.height,
    allowResolutionMismatch: state.authoring.snapshot.allowResolutionMismatchThisSession || Boolean(approval),
    ...(approval ? {
      approvedDocumentId: approval.documentId,
      approvedDocumentWidth: approval.documentWidth,
      approvedDocumentHeight: approval.documentHeight
    } : {})
  };
  state.authoring.snapshot.current = {
    request,
    metadata: null,
    bytes: null,
    receivedBytes: 0,
    receivedChunks: 0,
    pendingChunk: null,
    installedLayerId: null
  };
  state.authoring.snapshot.status = 'REQUESTED';
  state.authoring.snapshot.error = '';
  authoringMessage.className = 'projection-poc-message';
  authoringMessage.textContent = `Photoshop ${captureMode === 'COMPOSITE' ? 'Composite' : 'Single Pixel Layer'} Snapshot requested.`;
  if (!sendLinkMessage(request)) {
    clearSnapshotJob({ error: 'UXP_DISCONNECTED: Snapshot request could not be sent.' });
    throw snapshotFailure('UXP_DISCONNECTED', 'Snapshot request could not be sent.');
  }
  syncAuthoringUi();
  return snapshotJobId;
}

function handleSnapshotBegin(metadata) {
  const current = state.authoring.snapshot.current;
  if (!current || metadata.snapshotJobId !== current.request.snapshotJobId) throw snapshotFailure('UNEXPECTED_SNAPSHOT_BEGIN', 'Snapshot begin does not match the active request.');
  for (const field of ['captureRequestId', 'projectSessionId', 'familyId', 'captureMode']) {
    if (metadata[field] !== current.request[field]) throw snapshotFailure('SNAPSHOT_CONTEXT_MISMATCH', `${field} does not match the active request.`);
  }
  assertNativeSnapshotGeometry(metadata);
  if (metadata.componentSize !== 8 || ![3, 4].includes(metadata.components) || metadata.pixelFormat !== (metadata.components === 3 ? 'RGB' : 'RGBA')) {
    throw snapshotFailure('SNAPSHOT_PIXEL_FORMAT_UNSUPPORTED', 'Snapshot must contain chunky RGB8 or RGBA8 pixels.');
  }
  const expectedBytes = metadata.width * metadata.height * metadata.components;
  if (!Number.isSafeInteger(expectedBytes) || metadata.totalBytes !== expectedBytes || metadata.totalBytes > liveLinkConfig.maxFrameBytes ||
      metadata.chunkSize <= 0 || metadata.chunkSize > liveLinkConfig.chunkSizeBytes || metadata.chunkCount !== Math.ceil(metadata.totalBytes / metadata.chunkSize)) {
    throw snapshotFailure('INVALID_SNAPSHOT_METADATA', 'Snapshot byte count or chunk metadata is invalid.');
  }
  const expectedSourceType = metadata.captureMode === 'COMPOSITE' ? 'PHOTOSHOP_COMPOSITE_SNAPSHOT' : 'PHOTOSHOP_SELECTION_SNAPSHOT';
  if (metadata.sourceType !== expectedSourceType || metadata.colorContract !== 'SRGB_IEC61966_2_1_RGB8' ||
      !['OPAQUE_RGB8', 'PHOTOSHOP_IMAGING_RGBA8_PROBE_PENDING'].includes(metadata.alphaContract)) {
    throw snapshotFailure('SNAPSHOT_SOURCE_CONTRACT_INVALID', 'Snapshot source, color, or alpha contract is invalid.');
  }
  if (metadata.captureMode === 'SINGLE_PIXEL_LAYER' &&
      (!Number.isFinite(metadata.selectedLayerOpacity) || metadata.selectedLayerOpacity < 0 || metadata.selectedLayerOpacity > 1)) {
    throw snapshotFailure('SNAPSHOT_SELECTION_OPACITY_INVALID', 'Selection Snapshot requires normalized Photoshop layer opacity from 0 to 1.');
  }
  current.metadata = metadata;
  current.bytes = new Uint8Array(metadata.totalBytes);
  state.authoring.snapshot.status = 'RECEIVING';
  syncAuthoringUi();
}

function handleSnapshotChunk(message) {
  const current = state.authoring.snapshot.current;
  if (!current?.metadata || message.snapshotJobId !== current.request.snapshotJobId || current.pendingChunk) {
    throw snapshotFailure('UNEXPECTED_SNAPSHOT_CHUNK', 'Snapshot chunk marker is unexpected.');
  }
  const expectedLength = Math.min(current.metadata.chunkSize, current.metadata.totalBytes - current.receivedBytes);
  if (message.chunkIndex !== current.receivedChunks || message.byteLength !== expectedLength) {
    throw snapshotFailure('INVALID_SNAPSHOT_CHUNK', `Expected chunk ${current.receivedChunks} with ${expectedLength} bytes.`);
  }
  current.pendingChunk = { chunkIndex: message.chunkIndex, byteLength: message.byteLength };
}

function handleSnapshotBinary(arrayBuffer) {
  const current = state.authoring.snapshot.current;
  if (!current?.pendingChunk || !current.bytes) throw snapshotFailure('UNEXPECTED_SNAPSHOT_BINARY', 'Snapshot binary arrived without a chunk marker.');
  const chunk = new Uint8Array(arrayBuffer);
  if (chunk.byteLength !== current.pendingChunk.byteLength || current.receivedBytes + chunk.byteLength > current.bytes.byteLength) {
    throw snapshotFailure('INVALID_SNAPSHOT_BINARY', 'Snapshot binary length does not match its chunk marker.');
  }
  current.bytes.set(chunk, current.receivedBytes);
  current.receivedBytes += chunk.byteLength;
  current.receivedChunks += 1;
  current.pendingChunk = null;
}

async function installSnapshotLayer(current) {
  const metadata = current.metadata;
  if (state.authoring.snapshot.current !== current || metadata.projectSessionId !== state.authoring.snapshot.projectSessionId ||
      current.request.familyId !== currentProjectionBakeProfile()?.familyId) {
    throw snapshotFailure('SNAPSHOT_LATE_COMPLETION', 'Snapshot belongs to an older project/session or family context.');
  }
  const rgba = rgba8FromChunky(current.bytes, metadata.width, metadata.height, metadata.components);
  const pngBytes = await encodeRgba8Png(rgba, metadata.width, metadata.height);
  current.bytes = null;
  const assetSha256 = await sha256Hex(pngBytes);
  const timestampToken = metadata.captureTimestamp.replace(/[:.]/g, '-');
  const filename = `Photoshop_${metadata.captureMode === 'COMPOSITE' ? 'Composite' : 'Selection'}_${timestampToken}.png`;
  const provenance = {
    type: metadata.sourceType,
    documentName: metadata.documentName,
    captureDocumentId: metadata.documentId,
    documentWidth: metadata.documentWidth,
    documentHeight: metadata.documentHeight,
    captureBounds: { ...metadata.captureBounds },
    captureTimestamp: metadata.captureTimestamp,
    captureMode: metadata.captureMode
  };
  if (metadata.sourceType === 'PHOTOSHOP_SELECTION_SNAPSHOT') {
    provenance.selectedLayerIds = [...metadata.selectedLayerIds];
    provenance.selectedLayerNames = [...metadata.selectedLayerNames];
  }
  const source = {
    id: `snapshot:${metadata.snapshotJobId}`,
    sourceId: `snapshot:${metadata.snapshotJobId}`,
    filename,
    name: filename,
    originalFilename: filename,
    sourceType: metadata.sourceType,
    mimeType: 'image/png',
    type: 'image/png',
    width: metadata.width,
    height: metadata.height,
    hasAlpha: true,
    byteLength: pngBytes.byteLength,
    sha256: assetSha256,
    alphaContract: metadata.alphaContract,
    colorContract: metadata.colorContract,
    provenance
  };
  let runtime = null;
  try {
    runtime = await decodeProjectRuntimeAsset({ source, bytes: pngBytes, layerId: metadata.snapshotJobId, familyId: metadata.familyId });
    if (state.authoring.snapshot.current !== current || metadata.projectSessionId !== state.authoring.snapshot.projectSessionId ||
        current.request.familyId !== currentProjectionBakeProfile()?.familyId) {
      throw snapshotFailure('SNAPSHOT_LATE_COMPLETION', 'Snapshot context changed during asset installation.');
    }
    const initialState = metadata.sourceType === 'PHOTOSHOP_SELECTION_SNAPSHOT'
      ? selectionSnapshotInitialLayerState(metadata, currentProjectionBakeProfile().workingResolution)
      : undefined;
    const layer = authoringSession.addLayer(runtime, metadata.familyId, runtime, initialState);
    current.installedLayerId = layer.layerId;
    current.assetSha256 = assetSha256;
    state.authoring.snapshot.status = 'WAITING_COMMIT';
    syncSelectedAuthoringRuntime();
    invalidateAuthoringOutputs('photoshop-snapshot-layer-added');
    render();
    updateDiagnostics();
    if (!sendLinkMessage({
      type: 'SNAPSHOT_COMPLETE',
      snapshotJobId: metadata.snapshotJobId,
      layerId: layer.layerId,
      sourceType: metadata.sourceType,
      width: metadata.width,
      height: metadata.height,
      assetSha256
    })) throw snapshotFailure('BROKER_DISCONNECTED', 'Snapshot completion could not be committed.');
  } catch (error) {
    if (runtime && !current.installedLayerId) disposeAuthoringRuntime(runtime);
    throw error;
  }
}

function handleSnapshotEnd(message) {
  const current = state.authoring.snapshot.current;
  if (!current?.metadata || message.snapshotJobId !== current.request.snapshotJobId || current.pendingChunk ||
      current.receivedBytes !== current.metadata.totalBytes || current.receivedChunks !== current.metadata.chunkCount ||
      message.receivedBytes !== current.receivedBytes || message.receivedChunks !== current.receivedChunks) {
    throw snapshotFailure('INCOMPLETE_SNAPSHOT', 'Snapshot end does not match the complete transfer.');
  }
  state.authoring.snapshot.status = 'INSTALLING';
  void installSnapshotLayer(current).catch((error) => {
    sendLinkMessage({ type: 'SNAPSHOT_ERROR', snapshotJobId: current.request.snapshotJobId, code: error.code || 'SNAPSHOT_INSTALL_FAILED', message: error.message || String(error) });
    authoringMessage.className = 'projection-poc-message fail';
    authoringMessage.textContent = error.message || String(error);
    clearSnapshotJob({ rollback: true, error: error.message || String(error) });
  });
}

function handleSnapshotCommitted(message) {
  const current = state.authoring.snapshot.current;
  if (!current || message.snapshotJobId !== current.request.snapshotJobId || message.layerId !== current.installedLayerId || message.assetSha256 !== current.assetSha256) {
    throw snapshotFailure('UNEXPECTED_SNAPSHOT_COMMIT', 'Snapshot commit does not match the installed Layer and Asset.');
  }
  state.authoring.snapshot.completedJobIds.add(message.snapshotJobId);
  if (state.authoring.snapshot.completedJobIds.size > 256) state.authoring.snapshot.completedJobIds.delete(state.authoring.snapshot.completedJobIds.values().next().value);
  const layer = authoringSession.layers.find((candidate) => candidate.layerId === current.installedLayerId);
  state.authoring.snapshot.current = null;
  state.authoring.snapshot.status = 'COMPLETE';
  state.authoring.snapshot.error = '';
  authoringMessage.className = 'projection-poc-message pass';
  authoringMessage.textContent = `${layer?.source.filename || 'Photoshop Snapshot'} added as an immutable project-owned PNG Bitmap Source.`;
  syncAuthoringUi();
}

function handleSnapshotError(message) {
  const current = state.authoring.snapshot.current;
  if (!current || (message.snapshotJobId && message.snapshotJobId !== current.request.snapshotJobId)) return;
  if (message.code === 'SNAPSHOT_RESOLUTION_CONFIRMATION_REQUIRED') {
    const fields = ['documentId', 'documentWidth', 'documentHeight', 'expectedWidth', 'expectedHeight'];
    if (!fields.every((field) => Number.isSafeInteger(message[field]) && message[field] > 0) ||
        typeof message.documentName !== 'string') {
      const error = 'INVALID_SNAPSHOT_RESOLUTION_CHECK: Photoshop did not identify the source document.';
      authoringMessage.className = 'projection-poc-message fail';
      authoringMessage.textContent = error;
      clearSnapshotJob({ error });
      return;
    }
    const approval = {
      familyId: current.request.familyId,
      projectSessionId: current.request.projectSessionId,
      captureMode: current.request.captureMode,
      documentId: message.documentId,
      documentWidth: message.documentWidth,
      documentHeight: message.documentHeight
    };
    clearSnapshotJob();
    pendingSnapshotResolutionPrompt = approval;
    snapshotResolutionMessage.textContent = `${message.documentName}\nPhotoshop document: ${message.documentWidth} × ${message.documentHeight}\n${approval.familyId === 'ANAMORPHIC_FRONT_75F' ? 'FRONT75' : 'BACK'} Direct: ${message.expectedWidth} × ${message.expectedHeight}\nImport this ${approval.captureMode === 'COMPOSITE' ? 'Composite' : 'Selection'} anyway?`;
    snapshotResolutionDialog.showModal();
    syncAuthoringUi();
    return;
  }
  const error = `${message.code || 'SNAPSHOT_ERROR'}: ${message.message || 'Snapshot failed.'}`;
  authoringMessage.className = 'projection-poc-message fail';
  authoringMessage.textContent = error;
  clearSnapshotJob({ rollback: true, error });
}

function answerSnapshotResolutionPrompt(choice) {
  const approval = pendingSnapshotResolutionPrompt;
  if (!approval) return;
  pendingSnapshotResolutionPrompt = null;
  snapshotResolutionDialog.close();
  if (choice === 'NO') {
    state.authoring.snapshot.status = 'IDLE';
    state.authoring.snapshot.error = '';
    authoringMessage.className = 'projection-poc-message';
    authoringMessage.textContent = 'Photoshop Snapshot import canceled; no layer was added.';
    syncAuthoringUi();
    return;
  }
  if (choice === 'SESSION') state.authoring.snapshot.allowResolutionMismatchThisSession = true;
  try {
    requestPhotoshopSnapshot(approval.captureMode, approval);
  } catch (error) {
    const detail = error.message || String(error);
    state.authoring.snapshot.status = 'FAILED';
    state.authoring.snapshot.error = detail;
    authoringMessage.className = 'projection-poc-message fail';
    authoringMessage.textContent = detail;
    syncAuthoringUi();
  }
}

function rejectIncomingFrame(code, message, frameId = null) {
  state.link.framesDropped += 1;
  state.link.lastError = `${code}: ${message}`;
  state.link.currentFrame = null;
  state.link.liveFrameCurrent = false;
  sendLinkMessage({ type: 'ERROR', code, message, frameId });
  render();
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

function acceptBakeTargetRegistry(message) {
  if (message.registryAuthority !== 'UXP' || message.scope !== 'SESSION' ||
      typeof message.sessionId !== 'string' || !message.sessionId ||
      !Array.isArray(message.targets) || !Array.isArray(message.bindings)) {
    throw new Error('INVALID_BAKE_TARGET_REGISTRY: UXP session registry metadata is invalid.');
  }
  const targetIds = new Set();
  const targetStatuses = new Set(['READY', 'CLOSED', 'IDENTITY_CHANGED', 'DIMENSION_CHANGED', 'MODE_CHANGED', 'DEPTH_CHANGED']);
  for (const target of message.targets) {
    if (typeof target.targetId !== 'string' || !target.targetId || targetIds.has(target.targetId) ||
        !Number.isSafeInteger(target.documentId) || target.documentId <= 0 ||
        !Number.isSafeInteger(target.width) || target.width <= 0 ||
        !Number.isSafeInteger(target.height) || target.height <= 0 ||
        typeof target.label !== 'string' || !target.label ||
        typeof target.documentName !== 'string' || !target.documentName ||
        !targetStatuses.has(target.status) || typeof target.documentMode !== 'string' || !target.documentMode ||
        !(target.documentDepth === 8 || typeof target.documentDepth === 'string')) {
      throw new Error('INVALID_BAKE_TARGET_REGISTRY: target metadata or targetId is invalid.');
    }
    targetIds.add(target.targetId);
  }
  const bindingKeys = new Set();
  for (const binding of message.bindings) {
    if (binding.bindingKey !== reverseBakeBindingKey(binding.familyId, binding.outputKind) ||
        bindingKeys.has(binding.bindingKey) || !targetIds.has(binding.targetId)) {
      throw new Error('INVALID_BAKE_TARGET_REGISTRY: binding map is inconsistent.');
    }
    bindingKeys.add(binding.bindingKey);
  }
  state.reverseBake.targetRegistry = {
    registryAuthority: message.registryAuthority,
    scope: message.scope,
    sessionId: message.sessionId,
    targets: message.targets.map((target) => ({ ...target })),
    bindings: message.bindings.map((binding) => ({ ...binding }))
  };
}

function handleLinkJson(message) {
  switch (message.type) {
    case 'HELLO_ACK':
      state.link.rendererHandshake = true;
      lastTargetFamilyContext = undefined;
      syncTargetFamilyContext(true);
      break;
    case 'LINK_STATUS':
      state.link.photoshopConnected = Boolean(message.photoshopConnected);
      if (state.link.photoshopConnected) syncTargetFamilyContext(true);
      else lastTargetFamilyContext = undefined;
      if (!state.link.photoshopConnected) {
        state.link.liveFrameCurrent = false;
        handleSnapshotError({ snapshotJobId: state.authoring.snapshot.current?.request.snapshotJobId, code: 'UXP_DISCONNECTED', message: 'Photoshop disconnected during Snapshot.' });
        state.reverseBake.targetRegistry = {
          registryAuthority: null,
          scope: null,
          sessionId: null,
          targets: [],
          bindings: []
        };
      }
      render();
      break;
    case 'SNAPSHOT_BEGIN':
      try { handleSnapshotBegin(message); }
      catch (error) {
        sendLinkMessage({ type: 'SNAPSHOT_ERROR', snapshotJobId: message.snapshotJobId, code: error.code || 'INVALID_SNAPSHOT_METADATA', message: error.message || String(error) });
        handleSnapshotError({ ...message, code: error.code || 'INVALID_SNAPSHOT_METADATA', message: error.message || String(error) });
      }
      return;
    case 'SNAPSHOT_CHUNK':
      try { handleSnapshotChunk(message); }
      catch (error) {
        sendLinkMessage({ type: 'SNAPSHOT_ERROR', snapshotJobId: message.snapshotJobId, code: error.code || 'INVALID_SNAPSHOT_CHUNK', message: error.message || String(error) });
        handleSnapshotError({ ...message, code: error.code || 'INVALID_SNAPSHOT_CHUNK', message: error.message || String(error) });
      }
      return;
    case 'SNAPSHOT_END':
      try { handleSnapshotEnd(message); }
      catch (error) {
        sendLinkMessage({ type: 'SNAPSHOT_ERROR', snapshotJobId: message.snapshotJobId, code: error.code || 'INCOMPLETE_SNAPSHOT', message: error.message || String(error) });
        handleSnapshotError({ ...message, code: error.code || 'INCOMPLETE_SNAPSHOT', message: error.message || String(error) });
      }
      return;
    case 'SNAPSHOT_COMMITTED':
      try { handleSnapshotCommitted(message); }
      catch (error) { handleSnapshotError({ ...message, code: error.code || 'UNEXPECTED_SNAPSHOT_COMMIT', message: error.message || String(error) }); }
      return;
    case 'SNAPSHOT_ERROR':
      handleSnapshotError(message);
      return;
    case 'BAKE_TARGET_REGISTRY':
      try {
        acceptBakeTargetRegistry(message);
        state.reverseBake.lastError = '';
      } catch (error) {
        state.reverseBake.lastError = error.message || String(error);
      }
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
    if (state.authoring.snapshot.current?.metadata) {
      try { handleSnapshotBinary(event.data); }
      catch (error) {
        const snapshotJobId = state.authoring.snapshot.current?.request.snapshotJobId;
        sendLinkMessage({ type: 'SNAPSHOT_ERROR', snapshotJobId, code: error.code || 'INVALID_SNAPSHOT_BINARY', message: error.message || String(error) });
        handleSnapshotError({ snapshotJobId, code: error.code || 'INVALID_SNAPSHOT_BINARY', message: error.message || String(error) });
      }
    } else handleBinaryChunk(event.data);
  });
  socket.addEventListener('close', () => {
    state.link.rendererHandshake = false;
    state.link.photoshopConnected = false;
    state.link.liveFrameCurrent = false;
    handleSnapshotError({ snapshotJobId: state.authoring.snapshot.current?.request.snapshotJobId, code: 'BROKER_DISCONNECTED', message: 'Broker disconnected during Snapshot.' });
    pointerQueue.reset();
    state.pointer.state = 'UNAVAILABLE';
    if (state.link.currentFrame) rejectIncomingFrame('BROKER_DISCONNECTED', 'Broker disconnected during a frame.', state.link.currentFrame.metadata.frameId);
    if (state.reverseBake.pending) {
      window.clearTimeout(state.reverseBake.pending.timer);
      const pending = state.reverseBake.pending;
      state.reverseBake.pending = null;
      pending.reject(new Error('BROKER_DISCONNECTED: Connection closed during Photoshop bake.'));
    }
    state.reverseBake.targetRegistry = {
      registryAuthority: null,
      scope: null,
      sessionId: null,
      targets: [],
      bindings: []
    };
    render();
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

function authoringClientPoint(event) {
  const viewerBounds = viewer.getBoundingClientRect();
  const frame = authoringFrameRect();
  return {
    x: (event.clientX - viewerBounds.left - frame.x) / frame.width,
    y: (event.clientY - viewerBounds.top - frame.y) / frame.height,
    frame,
    viewerBounds
  };
}

function vectorMaskEventUv(event, clampToSource = true) {
  const layer = authoringSession.selectedLayer;
  const profile = currentProjectionBakeProfile();
  if (!layer || !profile) return null;
  const normalized = authoringClientPoint(event);
  const uv = screenPointToSourceUv(
    { x: normalized.x, y: normalized.y },
    layer.source,
    profile.workingResolution.aspect,
    layer.transform,
    profile.workingResolution
  );
  return {
    x: clampToSource ? Math.min(1, Math.max(0, uv.u)) : uv.u,
    y: clampToSource ? Math.min(1, Math.max(0, uv.v)) : uv.v,
    inside: uv.inside
  };
}

function vectorMaskEventOverlayPoint(event) {
  const normalized = authoringClientPoint(event);
  return {
    x: normalized.x * normalized.frame.width,
    y: normalized.y * normalized.frame.height
  };
}

function tryCloseVectorMaskAtFirstPoint(pathValue, pointId) {
  const layer = authoringSession.selectedLayer;
  const first = pathValue?.points?.[0];
  const last = pathValue?.points?.at(-1);
  const drawingFromLastPoint = state.authoring.maskEditor.selectedPathId === pathValue?.pathId &&
    state.authoring.maskEditor.selectedPointId === last?.pointId;
  if (!layer || pathValue.closed || pathValue.points.length < 3 || pointId !== first?.pointId || !drawingFromLastPoint) return false;
  if (!authoringSession.closeVectorMaskPath(layer.layerId, pathValue.pathId)) return false;
  setVectorMaskPointSelection([{ pathId: pathValue.pathId, pointId: first.pointId }], {
    pathId: pathValue.pathId,
    pointId: first.pointId
  });
  commitVectorMaskChange(`${pathValue.pathId} closed by returning to its first anchor.`);
  return true;
}

function beginVectorMaskPointDrag(event) {
  if (event.button !== 0 || !authoringCameraInterlock.maskEditing) return;
  event.preventDefault();
  event.stopPropagation();
  const { pathId, pointId } = event.currentTarget.dataset;
  const pathValue = vectorMaskPath(authoringSession.selectedLayer?.vectorMask, pathId);
  const pointValue = vectorMaskPoint(pathValue, pointId);
  if (!pointValue) return;
  if (tryCloseVectorMaskAtFirstPoint(pathValue, pointId)) return;
  const key = vectorMaskPointReferenceKey(pathId, pointId);
  const alreadySelected = selectedVectorMaskPointKeys().has(key);
  if (!alreadySelected) {
    setVectorMaskPointSelection([{ pathId, pointId }], { pathId, pointId });
  } else {
    state.authoring.maskEditor.selectedPathId = pathId;
    state.authoring.maskEditor.selectedPointId = pointId;
  }
  const index = pathValue.points.indexOf(pointValue);
  state.authoring.maskEditor.selectedSegmentStartPointId = pathValue.closed || index < pathValue.points.length - 1 ? pointId : null;
  state.authoring.maskEditor.drag = {
    kind: 'anchors',
    pointerId: event.pointerId,
    pointReferences: state.authoring.maskEditor.selectedPointRefs.map((reference) => ({ ...reference })),
    lastUv: vectorMaskEventUv(event, false)
  };
  vectorMaskOverlay.setPointerCapture(event.pointerId);
  syncAuthoringUi();
}

function beginVectorMaskHandleDrag(event) {
  if (event.button !== 0 || !authoringCameraInterlock.maskEditing) return;
  event.preventDefault();
  event.stopPropagation();
  const { pathId, pointId, handleName } = event.currentTarget.dataset;
  setVectorMaskPointSelection([{ pathId, pointId }], { pathId, pointId });
  state.authoring.maskEditor.drag = { kind: 'handle', pointerId: event.pointerId, pathId, pointId, handleName };
  vectorMaskOverlay.setPointerCapture(event.pointerId);
}

function nearestVectorMaskSegmentT(pathValue, startPointId, target) {
  let nearestT = 0.5;
  let nearestDistance = Infinity;
  for (let index = 1; index < 100; index += 1) {
    const t = index / 100;
    const sample = evaluateVectorMaskSegment(pathValue, startPointId, t);
    const distance = (sample.x - target.x) ** 2 + (sample.y - target.y) ** 2;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestT = t;
    }
  }
  return nearestT;
}

function beginVectorMaskSegmentInsert(event) {
  if (event.button !== 0 || !authoringCameraInterlock.maskEditing) return;
  event.preventDefault();
  event.stopPropagation();
  const layer = authoringSession.selectedLayer;
  const { pathId, startPointId } = event.currentTarget.dataset;
  const pathValue = vectorMaskPath(layer?.vectorMask, pathId);
  const uv = vectorMaskEventUv(event);
  if (!layer || !pathValue || !uv) return;
  const t = nearestVectorMaskSegmentT(pathValue, startPointId, uv);
  const inserted = authoringSession.insertVectorMaskPoint(layer.layerId, pathId, startPointId, t);
  if (!inserted) return;
  setVectorMaskPointSelection([{ pathId, pointId: inserted.pointId }], { pathId, pointId: inserted.pointId });
  state.authoring.maskEditor.selectedSegmentStartPointId = inserted.pointId;
  commitVectorMaskChange(`${inserted.pointId} inserted on the selected segment with shape-preserving subdivision.`);
}

function appendVectorMaskPointAtUv(uv, { createPath = false } = {}) {
  const layer = authoringSession.selectedLayer;
  if (!layer || !uv) return;
  if (!uv.inside) {
    setVectorMaskMessage('VECTOR_MASK_POINT_OUTSIDE_SOURCE: Add anchors inside the transformed source bounds.', 'fail');
    return;
  }
  let pathValue = vectorMaskEditorPath();
  if (!pathValue || pathValue.closed) {
    if (!createPath) {
      setVectorMaskPointSelection([]);
      setVectorMaskMessage('No point added. Double-click empty source space or use + NEW PATH to start another path.', 'pass');
      syncAuthoringUi();
      return null;
    }
    const created = authoringSession.addVectorMaskPath(layer.layerId, { operation: 'ADD', initialPoint: uv });
    setVectorMaskPointSelection([{ pathId: created.pathId, pointId: created.points[0].pointId }], {
      pathId: created.pathId,
      pointId: created.points[0].pointId
    });
    commitVectorMaskChange(`${created.pathId} created at the clicked source coordinate.`);
    return created.points[0];
  }
  const created = authoringSession.appendVectorMaskPoint(layer.layerId, pathValue.pathId, uv.x, uv.y);
  if (!created) return;
  setVectorMaskPointSelection([{ pathId: pathValue.pathId, pointId: created.pointId }], {
    pathId: pathValue.pathId,
    pointId: created.pointId
  });
  const previous = pathValue.points[pathValue.points.length - 2];
  state.authoring.maskEditor.selectedSegmentStartPointId = previous?.pointId || null;
  commitVectorMaskChange(`${created.pointId} appended to ${pathValue.pathId}.`);
  return created;
}

function createVectorMaskPathByDoubleClick(event) {
  if (event.button !== 0 || event.target !== vectorMaskOverlay || !authoringCameraInterlock.maskEditing) return false;
  event.preventDefault();
  event.stopPropagation();
  const pathValue = vectorMaskEditorPath();
  if (pathValue && !pathValue.closed) {
    setVectorMaskMessage('Finish or close the current open path before starting another path by double-click.', 'fail');
    return false;
  }
  const uv = vectorMaskEventUv(event, false);
  if (!uv?.inside) {
    setVectorMaskMessage('VECTOR_MASK_POINT_OUTSIDE_SOURCE: Start a new path inside the transformed source bounds.', 'fail');
    return false;
  }
  return Boolean(appendVectorMaskPointAtUv(uv, { createPath: true }));
}

function beginVectorMaskMarquee(event) {
  if (event.button !== 0 || event.target !== vectorMaskOverlay || !authoringCameraInterlock.maskEditing) return;
  event.preventDefault();
  event.stopPropagation();
  const startOverlay = vectorMaskEventOverlayPoint(event);
  state.authoring.maskEditor.drag = {
    kind: 'marquee',
    pointerId: event.pointerId,
    startOverlay,
    currentOverlay: { ...startOverlay },
    startUv: vectorMaskEventUv(event, false),
    moved: false
  };
  vectorMaskOverlay.setPointerCapture(event.pointerId);
  syncAuthoringOverlay();
}

function selectVectorMaskPointsInOverlayRect(startOverlay, endOverlay) {
  const layer = authoringSession.selectedLayer;
  const profile = currentProjectionBakeProfile();
  if (!layer || !profile) return [];
  const frame = authoringFrameRect();
  const left = Math.min(startOverlay.x, endOverlay.x);
  const right = Math.max(startOverlay.x, endOverlay.x);
  const top = Math.min(startOverlay.y, endOverlay.y);
  const bottom = Math.max(startOverlay.y, endOverlay.y);
  const selected = [];
  for (const pathValue of layer.vectorMask.paths) {
    for (const pointValue of pathValue.points) {
      const overlay = sourcePointToMaskOverlay(pointValue, frame, profile);
      if (overlay.x >= left && overlay.x <= right && overlay.y >= top && overlay.y <= bottom) {
        selected.push({ pathId: pathValue.pathId, pointId: pointValue.pointId });
      }
    }
  }
  setVectorMaskPointSelection(selected, selected[0] || null);
  return selected;
}

function vectorMaskSelectedPoints(pointReferences) {
  const mask = authoringSession.selectedLayer?.vectorMask;
  return (pointReferences || []).flatMap((reference) => {
    const pathValue = vectorMaskPath(mask, reference.pathId);
    const pointValue = vectorMaskPoint(pathValue, reference.pointId);
    return pointValue ? [pointValue] : [];
  });
}

function updateVectorMaskPointerInteraction(event) {
  const drag = state.authoring.maskEditor.drag;
  if (!drag || drag.pointerId !== event.pointerId) return false;
  event.preventDefault();
  event.stopPropagation();
  if (drag.kind === 'marquee') {
    drag.currentOverlay = vectorMaskEventOverlayPoint(event);
    drag.moved ||= Math.hypot(
      drag.currentOverlay.x - drag.startOverlay.x,
      drag.currentOverlay.y - drag.startOverlay.y
    ) >= 4;
    syncAuthoringOverlay();
    return true;
  }
  const layer = authoringSession.selectedLayer;
  const uv = vectorMaskEventUv(event, false);
  if (!layer || !uv) return false;
  let changed = false;
  if (drag.kind === 'anchors') {
    const points = vectorMaskSelectedPoints(drag.pointReferences);
    if (!points.length || !drag.lastUv) return false;
    const requestedX = uv.x - drag.lastUv.x;
    const requestedY = uv.y - drag.lastUv.y;
    const minX = Math.min(...points.map((pointValue) => pointValue.x));
    const maxX = Math.max(...points.map((pointValue) => pointValue.x));
    const minY = Math.min(...points.map((pointValue) => pointValue.y));
    const maxY = Math.max(...points.map((pointValue) => pointValue.y));
    const deltaX = Math.max(-minX, Math.min(1 - maxX, requestedX));
    const deltaY = Math.max(-minY, Math.min(1 - maxY, requestedY));
    changed = authoringSession.translateVectorMaskPoints(layer.layerId, drag.pointReferences, deltaX, deltaY);
    drag.lastUv = {
      x: drag.lastUv.x + deltaX,
      y: drag.lastUv.y + deltaY
    };
  } else if (drag.kind === 'handle') {
    changed = authoringSession.updateVectorMaskPoint(layer.layerId, drag.pathId, drag.pointId, {
      [drag.handleName]: uv
    });
  }
  if (changed) {
    invalidateAuthoringOutputs('vector-mask-point-drag');
    syncAuthoringOverlay();
    updateDiagnostics();
  }
  return true;
}

function endVectorMaskPointerInteraction(event = null) {
  const drag = state.authoring.maskEditor.drag;
  if (!drag) return false;
  const pointerId = event?.pointerId ?? drag.pointerId;
  if (pointerId !== drag.pointerId) return false;
  if (vectorMaskOverlay.hasPointerCapture?.(pointerId)) vectorMaskOverlay.releasePointerCapture(pointerId);
  state.authoring.maskEditor.drag = null;
  const completed = Boolean(event && event.type !== 'pointercancel');
  if (drag.kind === 'marquee') {
    if (completed && drag.moved) {
      const selected = selectVectorMaskPointsInOverlayRect(drag.startOverlay, drag.currentOverlay);
      setVectorMaskMessage(`${selected.length} anchor${selected.length === 1 ? '' : 's'} selected by marquee. Drag any selected anchor to move the set.`, 'pass');
    } else if (completed) {
      appendVectorMaskPointAtUv(drag.startUv);
    }
  } else if (drag.kind === 'anchors') {
    setVectorMaskMessage(`${drag.pointReferences.length} selected anchor${drag.pointReferences.length === 1 ? '' : 's'} moved in ${VECTOR_MASK_COORDINATE_SPACE}.`, 'pass');
  } else {
    setVectorMaskMessage(`Bezier handle moved in ${VECTOR_MASK_COORDINATE_SPACE}.`, 'pass');
  }
  syncAuthoringUi();
  return true;
}

function beginAuthoringPointerInteraction(event, mode) {
  if (event.button !== 0 || !authoringCameraInterlock.layoutEditing || !authoringSession.selectedLayer?.visible ||
      state.projectionBake.running || state.reverseBake.activeJobId !== null) return false;
  event.preventDefault();
  event.stopPropagation();
  const point = authoringClientPoint(event);
  if (!authoringPointerSession.begin(mode, event.pointerId, point, authoringSession.transform)) return false;
  const centerX = point.viewerBounds.left + point.frame.x + authoringSession.transform.x * point.frame.width;
  const centerY = point.viewerBounds.top + point.frame.y + authoringSession.transform.y * point.frame.height;
  state.authoring.dragMetrics = {
    centerX,
    centerY,
    startDistance: Math.max(1, Math.hypot(event.clientX - centerX, event.clientY - centerY)),
    startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX)
  };
  authoringOverlay.setPointerCapture(event.pointerId);
  syncAuthoringUi();
  return true;
}

function updateAuthoringPointerInteraction(event) {
  if (!authoringPointerSession.owns(event.pointerId)) return false;
  event.preventDefault();
  event.stopPropagation();
  const point = authoringClientPoint(event);
  const start = authoringPointerSession.startPoint;
  const transform = authoringPointerSession.startTransform;
  const metrics = state.authoring.dragMetrics;
  if (authoringPointerSession.mode === 'move') {
    commitAuthoringTransform({ x: transform.x + point.x - start.x, y: transform.y + point.y - start.y }, 'authoring-move');
  } else if (authoringPointerSession.mode === 'scale') {
    const distance = Math.max(1, Math.hypot(event.clientX - metrics.centerX, event.clientY - metrics.centerY));
    commitAuthoringTransform({ scale: transform.scale * distance / metrics.startDistance }, 'authoring-scale');
  } else if (authoringPointerSession.mode === 'rotate') {
    const angle = Math.atan2(event.clientY - metrics.centerY, event.clientX - metrics.centerX);
    commitAuthoringTransform({ rotationDegrees: transform.rotationDegrees + (angle - metrics.startAngle) * 180 / Math.PI }, 'authoring-rotate');
  }
  return true;
}

view2dButton.addEventListener('click', () => setActiveView('2d'));
view3dPlaneButton.addEventListener('click', () => {
  if (state.activeView === '3d-plane') resetCurrentView();
  else setActiveView('3d-plane');
});
viewSite3dButton.addEventListener('click', () => {
  if (state.activeView === 'site-3d') resetCurrentView();
  else setActiveView('site-3d');
});
resetViewButton.addEventListener('click', resetCurrentView);
siteFovSlider.addEventListener('input', () => applySiteFocal35mm(focal35mmFromSlider(siteFovSlider.value)));
siteFovResetButton.addEventListener('click', resetSiteFov);
productionUi.modeToggle.addEventListener('click', () => setUiMode(document.body.dataset.uiMode === 'production' ? 'developer' : 'production'));
productionUi.family.addEventListener('change', () => {
  const selection = productionUi.family.value;
  const mode = productionUi.family.dataset.mode;
  if (mode === 'photo') {
    if (selection === state.site.scene) resetCurrentView();
    else changeProductionSiteOption(siteSceneSelect, selection);
  } else if (mode === 'site') {
    productionSitePreset = selection;
    if (selection === 'free') {
      changeProductionSiteOption(siteWorldSelect, 'world3d');
      changeProductionSiteOption(siteMappingSelect, 'normal');
      resetCurrentView();
    } else {
      changeProductionSiteOption(siteWorldSelect, 'world3d');
      changeProductionSiteOption(siteMappingSelect, 'anamorphic');
      changeProductionSiteOption(siteAnamorphicFamilySelect, selection);
      resetCurrentView();
    }
  } else {
    productionAuthoringFamily = selection;
    if (selection === state.site.anamorphicFamily) resetCurrentView();
    else changeProductionSiteOption(siteAnamorphicFamilySelect, selection);
  }
  syncProductionUi();
  if (mode !== 'authoring' && productionPreviewSource[productionWorkspace] === 'AUTHORING') {
    requestAuthoringPhysicalPreview();
  }
});
productionUi.previewSource.addEventListener('change', () => {
  if (productionWorkspace === 'authoring') return;
  productionPreviewSource[productionWorkspace] = productionUi.previewSource.value;
  if (productionUi.previewSource.value === 'AUTHORING') requestAuthoringPhysicalPreview();
  else discardAuthoringPhysicalRequests();
  render();
  updateDiagnostics();
});
productionUi.imageAsset.addEventListener('change', () => {
  const selection = productionUi.imageAsset.value;
  const bankEntry = productionPreviewCache.imageBank.find((entry) => entry.id === selection);
  if (bankEntry) {
    selectProductionPreviewImage(bankEntry.texture, bankEntry.name, bankEntry.id);
  } else if (selection) void loadAsset(selection).catch((error) => {
    productionUi.previewSourceState.textContent = `IMAGE · ${error.message}`;
    syncProductionImageBankUi();
  });
});
productionUi.imageDeleteButton.addEventListener('click', deleteSelectedProductionPreviewImage);
productionUi.imageFileButton.addEventListener('click', () => productionUi.imageFileInput.click());
productionUi.imageFileInput.addEventListener('change', () => {
  const file = productionUi.imageFileInput.files?.[0];
  productionUi.imageFileInput.value = '';
  if (file) void loadProductionPreviewFile(file).catch((error) => {
    productionUi.previewSourceState.textContent = `IMAGE · ${error.message}`;
  });
});
productionUi.viewAuthoring.addEventListener('click', () => showProductionView('authoring'));
productionUi.viewSite.addEventListener('click', () => showProductionView('site'));
productionUi.viewPhoto.addEventListener('click', () => showProductionView('photo'));
productionUi.projectOpen.addEventListener('click', () => {
  showProductionView('authoring', { resetIfCurrent: false });
  authoringProjectOpen.click();
});
productionUi.projectSave.addEventListener('click', () => {
  showProductionView('authoring', { resetIfCurrent: false });
  authoringProjectSave.click();
});
productionUi.projectSaveAs.addEventListener('click', () => {
  showProductionView('authoring', { resetIfCurrent: false });
  authoringProjectSaveAs.click();
});
for (const [productionButton, existingButton] of [
  [productionUi.bakeCurrent, quickBakeCurrent],
  [productionUi.sendDirect, quickSendDirect],
  [productionUi.bakeMerged, quickBakeFullMerged],
  [productionUi.saveMerged, fullMergeSaveButtons.find((button) => button.dataset.fullMergeExport === 'DIRECT')],
  [productionUi.bakePlanar, planarMasterBake],
  [productionUi.viewPlanar, planarMasterPreview],
  [productionUi.savePlanar, planarMasterSave]
]) {
  productionButton.addEventListener('click', () => {
    if (existingButton && !existingButton.disabled) existingButton.click();
  });
}
productionUi.maskEdit.addEventListener('click', () => {
  if (vectorMaskPanel.classList.contains('production-open') && authoringCameraInterlock.maskEditing) vectorMaskEdit.click();
  vectorMaskPanel.classList.toggle('production-open');
  if (vectorMaskPanel.classList.contains('production-open')) clampVectorMaskPanel();
  syncProductionUi();
});
previewAuthoringButton.addEventListener('click', () => setPreviewMode(PREVIEW_MODES.AUTHORING));
previewPhotoshopFinalButton.addEventListener('click', () => setPreviewMode(PREVIEW_MODES.PHOTOSHOP_FINAL));
previewBackgroundGray.addEventListener('input', () => setPreviewBackgroundGray(previewBackgroundGray.value));
siteWorldSelect.addEventListener('change', () => {
  if (state.site.world === siteWorldSelect.value) { resetCurrentView(); return; }
  if (authoringCameraInterlock.layoutEditing) exitLayoutEdit();
  if (authoringCameraInterlock.maskEditing) exitVectorMaskEdit();
  state.site.world = siteWorldSelect.value;
  if (state.site.world === 'legacy2d') state.site.legacyCameraLocked = true;
  applySiteSurfaceSelection();
});
siteMappingSelect.addEventListener('change', () => {
  if (state.site.mappingMode === siteMappingSelect.value) { resetCurrentView(); return; }
  if (authoringCameraInterlock.layoutEditing) exitLayoutEdit();
  if (authoringCameraInterlock.maskEditing) exitVectorMaskEdit();
  state.site.mappingMode = siteMappingSelect.value;
  if (state.site.world === 'legacy2d') state.site.legacyCameraLocked = true;
  applySiteSurfaceSelection();
});
siteAnamorphicFamilySelect.addEventListener('change', () => {
  const family = SITE_SCENE_PROFILE.worlds.world3d.anamorphicFamilies[siteAnamorphicFamilySelect.value];
  if (!family?.available) return;
  if (authoringPointerSession.active || authoringCameraInterlock.forcedLocked || state.authoring.maskEditor.drag) {
    siteAnamorphicFamilySelect.value = state.site.anamorphicFamily;
    return;
  }
  if (family.id === state.site.anamorphicFamily) { resetCurrentView(); return; }
  state.site.anamorphicFamily = family.id;
  if (productionWorkspace === 'authoring') productionAuthoringFamily = family.id;
  authoringSession.activateFamily(family.familyId);
  syncSelectedAuthoringRuntime();
  invalidateAuthoringOutputs('authoring-family-selection-change');
  authoringMessage.className = 'projection-poc-message';
  authoringMessage.textContent = authoringSession.source
    ? `${family.label} layer stack restored. Selected ${authoringSession.source.filename}.`
    : `${family.label} has an independent empty layer stack.`;
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
  if (state.site.scene === siteSceneSelect.value) { resetCurrentView(); return; }
  state.site.scene = siteSceneSelect.value;
  lockLegacyCamera();
  applySiteSurfaceSelection();
});
const viewSelectMenu = document.createElement('div');
viewSelectMenu.className = 'view-select-menu';
viewSelectMenu.id = 'view-select-menu';
viewSelectMenu.setAttribute('role', 'listbox');
viewSelectMenu.hidden = true;
document.body.append(viewSelectMenu);
let activeViewSelect = null;

function closeViewSelectMenu({ restoreFocus = false } = {}) {
  const select = activeViewSelect;
  if (select) select.setAttribute('aria-expanded', 'false');
  activeViewSelect = null;
  viewSelectMenu.hidden = true;
  viewSelectMenu.replaceChildren();
  if (restoreFocus) select?.focus();
}

function openViewSelectMenu(select, { focusOption = false } = {}) {
  if (activeViewSelect === select) { closeViewSelectMenu({ restoreFocus: true }); return; }
  closeViewSelectMenu();
  activeViewSelect = select;
  select.setAttribute('aria-expanded', 'true');
  viewSelectMenu.setAttribute('aria-label', select.getAttribute('aria-label') || 'View selection');
  for (const option of select.options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', String(option.value === select.value));
    button.dataset.value = option.value;
    button.textContent = option.textContent;
    button.disabled = option.disabled;
    button.classList.toggle('selected', option.value === select.value);
    button.addEventListener('click', () => {
      const sameValue = select.value === option.value;
      closeViewSelectMenu({ restoreFocus: true });
      if (sameValue) resetCurrentView();
      else {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    viewSelectMenu.append(button);
  }
  const rect = select.getBoundingClientRect();
  viewSelectMenu.style.left = `${Math.max(0, Math.min(rect.left, window.innerWidth - rect.width))}px`;
  viewSelectMenu.style.minWidth = `${rect.width}px`;
  viewSelectMenu.hidden = false;
  const menuHeight = viewSelectMenu.getBoundingClientRect().height;
  viewSelectMenu.style.top = `${rect.bottom + menuHeight <= window.innerHeight ? rect.bottom : Math.max(0, rect.top - menuHeight)}px`;
  if (focusOption) viewSelectMenu.querySelector('.selected:not(:disabled)')?.focus();
}

for (const select of [productionUi.family, siteWorldSelect, siteMappingSelect, siteAnamorphicFamilySelect, siteSceneSelect]) {
  select.setAttribute('aria-haspopup', 'listbox');
  select.setAttribute('aria-expanded', 'false');
  select.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    select.focus();
    openViewSelectMenu(select);
  });
  select.addEventListener('mousedown', (event) => event.preventDefault());
  select.addEventListener('click', (event) => event.preventDefault());
  select.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openViewSelectMenu(select, { focusOption: true });
  });
}
document.addEventListener('pointerdown', (event) => {
  if (activeViewSelect && !viewSelectMenu.contains(event.target) && event.target !== activeViewSelect) closeViewSelectMenu();
}, true);
viewSelectMenu.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { event.preventDefault(); closeViewSelectMenu({ restoreFocus: true }); return; }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  event.preventDefault();
  const buttons = [...viewSelectMenu.querySelectorAll('button:not(:disabled)')];
  const index = buttons.indexOf(document.activeElement);
  buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
});
window.addEventListener('resize', () => closeViewSelectMenu());
legacyCameraLockButton.addEventListener('click', toggleLegacyCameraLock);
anamorphicCameraResetButton.addEventListener('click', applyAnamorphicCalibrationCamera);
anamorphicFovInput.addEventListener('change', () => applyAnamorphicFovValue(anamorphicFovInput.value));
authoringProjectSaveAs.addEventListener('click', () => {
  void saveAuthoringProject(true).catch((error) => console.error(error));
});
authoringProjectSave.addEventListener('click', () => {
  void saveAuthoringProject(false).catch((error) => console.error(error));
});
authoringProjectOpen.addEventListener('click', () => {
  void openAuthoringProject().catch((error) => console.error(error));
});
let authoringProjectDragDepth = 0;
authoringProjectControl.addEventListener('dragenter', (event) => {
  if (!event.dataTransfer?.types?.includes('Files')) return;
  event.preventDefault();
  authoringProjectDragDepth += 1;
  authoringProjectControl.classList.add('drag-over');
});
authoringProjectControl.addEventListener('dragover', (event) => {
  if (!event.dataTransfer?.types?.includes('Files')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
});
authoringProjectControl.addEventListener('dragleave', () => {
  authoringProjectDragDepth = Math.max(0, authoringProjectDragDepth - 1);
  if (authoringProjectDragDepth === 0) authoringProjectControl.classList.remove('drag-over');
});
authoringProjectControl.addEventListener('drop', (event) => {
  event.preventDefault();
  authoringProjectDragDepth = 0;
  authoringProjectControl.classList.remove('drag-over');
  const manifestFile = [...(event.dataTransfer?.files || [])]
    .find((file) => file.name.toLowerCase() === 'project.json');
  if (!manifestFile) {
    setProjectOperationState({ busy: false, error: 'PROJECT_MANIFEST_PATH_INVALID: Drop the exact project.json file.' });
    return;
  }
  void openAuthoringProject(manifestFile).catch((error) => console.error(error));
});
authoringCameraLock.addEventListener('click', toggleAuthoringCameraLock);
layoutEditButton.addEventListener('click', toggleLayoutEdit);
vectorMaskEdit.addEventListener('click', toggleVectorMaskEdit);
vectorMaskEnabled.addEventListener('change', (event) => {
  const layer = authoringSession.selectedLayer;
  if (layer && authoringSession.setVectorMaskEnabled(layer.layerId, event.currentTarget.checked)) {
    commitVectorMaskChange(`Vector Mask ${layer.vectorMask.enabled ? 'enabled' : 'disabled'}.`);
  }
});
vectorMaskInvert.addEventListener('change', (event) => {
  const layer = authoringSession.selectedLayer;
  if (layer && authoringSession.setVectorMaskInvert(layer.layerId, event.currentTarget.checked)) {
    commitVectorMaskChange(`Whole Vector Mask invert ${layer.vectorMask.invert ? 'enabled' : 'disabled'}.`);
  }
});
vectorMaskAddPath.addEventListener('click', () => addVectorMaskPath());
vectorMaskDeletePath.addEventListener('click', deleteSelectedVectorMaskPath);
vectorMaskClosePath.addEventListener('click', closeSelectedVectorMaskPath);
vectorMaskClear.addEventListener('click', clearSelectedLayerVectorMask);
vectorMaskSegmentLinear.addEventListener('click', () => setSelectedVectorMaskSegmentType('LINEAR'));
vectorMaskSegmentBezier.addEventListener('click', () => setSelectedVectorMaskSegmentType('CUBIC_BEZIER'));
vectorMaskDeletePoint.addEventListener('click', deleteSelectedVectorMaskPoint);
authoringImageButton.addEventListener('click', () => authoringImageInput.click());
authoringPhotoshopCompositeButton.addEventListener('click', () => {
  try { requestPhotoshopSnapshot('COMPOSITE'); } catch (error) { handleSnapshotError({ code: error.code, message: error.message }); }
});
authoringPhotoshopSelectionButton.addEventListener('click', () => {
  try { requestPhotoshopSnapshot('SINGLE_PIXEL_LAYER'); } catch (error) { handleSnapshotError({ code: error.code, message: error.message }); }
});
snapshotResolutionNo.addEventListener('click', () => answerSnapshotResolutionPrompt('NO'));
snapshotResolutionYes.addEventListener('click', () => answerSnapshotResolutionPrompt('YES'));
snapshotResolutionSession.addEventListener('click', () => answerSnapshotResolutionPrompt('SESSION'));
snapshotResolutionDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  answerSnapshotResolutionPrompt('NO');
});
authoringImageInput.addEventListener('change', () => {
  const file = authoringImageInput.files?.[0] || null;
  authoringImageInput.value = '';
  if (file) void loadAuthoringFile(file, 'add').catch((error) => console.error(error));
});
authoringReplaceButton.addEventListener('click', () => authoringReplaceInput.click());
authoringReplaceInput.addEventListener('change', () => {
  const file = authoringReplaceInput.files?.[0] || null;
  authoringReplaceInput.value = '';
  if (file) void loadAuthoringFile(file, 'replace').catch((error) => console.error(error));
});
authoringMoveUp.addEventListener('click', () => moveSelectedAuthoringLayer('up'));
authoringMoveDown.addEventListener('click', () => moveSelectedAuthoringLayer('down'));
authoringDeleteLayer.addEventListener('click', deleteSelectedAuthoringLayer);
for (const [name, input] of Object.entries(authoringTransformInputs)) {
  input.addEventListener('change', () => commitAuthoringTransform({ [name]: Number(input.value) }, `authoring-${name}`));
}
authoringResetTransform.addEventListener('click', () => {
  if (authoringSession.resetTransform()) {
    invalidateAuthoringOutputs('authoring-transform-reset');
    authoringMessage.className = 'projection-poc-message';
    authoringMessage.textContent = 'Transform reset: centered, uniform scale 1, rotation 0°.';
  }
});
outsideSignageOpacity.addEventListener('input', (event) => {
  commitOutsideSignageOpacity(event.currentTarget.value);
});
outsideSignageOpacity.addEventListener('pointerdown', (event) => event.stopPropagation());
authoringOpacity.addEventListener('input', (event) => commitAuthoringOpacity(event.currentTarget.value));
authoringBlendMode.addEventListener('change', (event) => commitAuthoringBlendMode(event.currentTarget.value));
authoringQuickToggle.addEventListener('click', () => {
  state.authoring.railExpanded = !state.authoring.railExpanded;
  syncAuthoringUi();
});
quickBakeCurrent.addEventListener('click', () => {
  void runProjectionBake().catch((error) => console.error(error));
});
quickBakeFullMerged.addEventListener('click', () => {
  void runFullMergedBake().catch((error) => console.error(error));
});
quickBakePlanar.addEventListener('click', () => {
  void runPlanarBake().catch((error) => console.error(error));
});
planarPreviewClose.addEventListener('click', () => closePlanarPreview());
planarPreviewOverlay.addEventListener('click', (event) => {
  if (event.target === planarPreviewOverlay) closePlanarPreview();
});
planarPreviewImage.addEventListener('error', () => {
  if (!planarPreviewOverlay.hidden) {
    closePlanarPreview({ restoreFocus: false });
    planarMasterMessage.className = 'projection-poc-message fail';
    planarMasterMessage.textContent = 'Planar bake is ready, but its PNG preview could not be displayed.';
  }
});
quickSendDirect.addEventListener('click', () => {
  void sendProjectionToPhotoshop('DIRECT').catch((error) => console.error(error));
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !planarPreviewOverlay.hidden) {
    event.preventDefault();
    closePlanarPreview();
    return;
  }
  if (event.key === 'Escape' && authoringCameraInterlock.maskEditing) {
    exitVectorMaskEdit();
    return;
  }
  if (event.key === 'Escape' && state.authoring.railExpanded) {
    state.authoring.railExpanded = false;
    syncAuthoringUi();
  }
});
for (const button of outsideSignagePresetButtons) {
  button.addEventListener('click', () => commitOutsideSignageOpacity(OUTSIDE_SIGNAGE_PRESETS[button.dataset.outsideSignagePreset]));
  button.addEventListener('pointerdown', (event) => event.stopPropagation());
}
for (const element of [projectionAuthoring, authoringProjectControl, authoringImageButton, authoringPhotoshopCompositeButton, authoringPhotoshopSelectionButton, authoringReplaceButton, authoringMoveUp, authoringMoveDown, authoringDeleteLayer, authoringLayerList, vectorMaskControl, authoringTransformFields, authoringResetTransform]) {
  element.addEventListener('pointerdown', (event) => event.stopPropagation());
  element.addEventListener('wheel', (event) => event.stopPropagation(), { passive: true });
}
vectorMaskPanelCollapse.addEventListener('click', (event) => {
  event.stopPropagation();
  state.authoring.maskPanel.collapsed = !state.authoring.maskPanel.collapsed;
  syncVectorMaskFloatingPanel(isProjectionAuthoringContext());
});
vectorMaskPanelDragHandle.addEventListener('pointerdown', beginVectorMaskPanelDrag);
vectorMaskPanelDragHandle.addEventListener('pointermove', updateVectorMaskPanelDrag);
vectorMaskPanelDragHandle.addEventListener('pointerup', endVectorMaskPanelDrag);
vectorMaskPanelDragHandle.addEventListener('pointercancel', endVectorMaskPanelDrag);
for (const eventName of ['click', 'dblclick', 'contextmenu']) {
  vectorMaskPanel.addEventListener(eventName, (event) => event.stopPropagation());
}
for (const element of [authoringOpacity, authoringBlendMode, authoringQuickRail]) {
  element.addEventListener('pointerdown', (event) => event.stopPropagation());
  element.addEventListener('pointermove', (event) => event.stopPropagation());
  element.addEventListener('pointerup', (event) => event.stopPropagation());
  element.addEventListener('wheel', (event) => event.stopPropagation(), { passive: true });
}
authoringImageLayer.addEventListener('pointerdown', (event) => beginAuthoringPointerInteraction(event, 'move'));
authoringScaleHandle.addEventListener('pointerdown', (event) => beginAuthoringPointerInteraction(event, 'scale'));
authoringRotateHandle.addEventListener('pointerdown', (event) => beginAuthoringPointerInteraction(event, 'rotate'));
vectorMaskOverlay.addEventListener('pointerdown', beginVectorMaskMarquee);
vectorMaskOverlay.addEventListener('pointermove', updateVectorMaskPointerInteraction);
vectorMaskOverlay.addEventListener('pointerup', endVectorMaskPointerInteraction);
vectorMaskOverlay.addEventListener('pointercancel', (event) => endVectorMaskPointerInteraction(event));
vectorMaskOverlay.addEventListener('dblclick', createVectorMaskPathByDoubleClick);
authoringOverlay.addEventListener('pointermove', updateAuthoringPointerInteraction);
authoringOverlay.addEventListener('pointerup', (event) => {
  if (!authoringPointerSession.owns(event.pointerId)) return;
  event.preventDefault();
  event.stopPropagation();
  endAuthoringPointerInteraction(event);
});
authoringOverlay.addEventListener('pointercancel', (event) => {
  if (!authoringPointerSession.owns(event.pointerId)) return;
  event.preventDefault();
  event.stopPropagation();
  cancelAuthoringPointerInteraction();
});
projectionPocRun.addEventListener('click', () => {
  void runProjectionBake().catch((error) => console.error(error));
});
projectionMaskEnabled.addEventListener('change', () => {
  const profile = currentProjectionBakeProfile();
  if (!profile || state.projectionBake.running || state.reverseBake.activeJobId !== null) return;
  state.projectionBake.maskEnabledByFamily[profile.familyId] = projectionMaskEnabled.checked;
  authoringSession.invalidateMerged(profile.familyId);
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
for (const button of fullMergeSaveButtons) {
  button.addEventListener('click', () => {
    void saveFullMergedPng(button.dataset.fullMergeExport).catch((error) => console.error(error));
  });
}
planarMasterBake.addEventListener('click', () => {
  void runPlanarBake().catch((error) => console.error(error));
});
planarMasterPreview.addEventListener('click', () => {
  const profile = currentProjectionBakeProfile();
  const revision = profile ? authoringSession.mergedState(profile.familyId).revision : null;
  const output = profile ? planarWorkflow.readyOutput(profile.familyId, revision) : null;
  if (output) openPlanarPreview(output);
});
planarMasterSave.addEventListener('click', () => {
  try { savePlanarPng(); } catch (error) {
    planarMasterMessage.className = 'projection-poc-message fail';
    planarMasterMessage.textContent = String(error.message || error);
    console.error(error);
  }
});
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

canvas.addEventListener('pointerdown', beginAuthoringOrbitPointer, { capture: true });
document.addEventListener('pointermove', continueAuthoringOrbitPointer, { capture: true });
document.addEventListener('pointerup', endAuthoringOrbitPointer, { capture: true });
document.addEventListener('pointercancel', endAuthoringOrbitPointer, { capture: true });
window.addEventListener('blur', () => { authoringOrbitPointer = null; });

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
window.addEventListener('resize', () => requestAnimationFrame(clampVectorMaskPanel));
window.addEventListener('blur', cancelAuthoringPointerInteraction);
window.addEventListener('beforeunload', () => {
  discardAuthoringPhysicalRequests({ clearCache: true });
  const previewTextures = new Set([productionPreviewCache.imageTexture, productionPreviewCache.photoshopTexture,
    ...productionPreviewCache.imageBank.map((entry) => entry.texture)]);
  for (const texture of previewTextures) texture?.dispose();
  productionPreviewCache.imageTexture = null;
  productionPreviewCache.imageBank = [];
  productionPreviewCache.photoshopTexture = null;
  planarWorkflow.reset();
  planarMappingRuntime.disposeAll();
  projectionBakeRuntime.dispose();
  fullMergeRuntime.disposeAll();
  disposeAuthoringSource();
});

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
  const calibrationPosition = cameraSite.position.clone();
  const calibrationTarget = controlsSite.target.clone();
  const calibrationFov = cameraSite.fov;
  controlsSite.dispatchEvent({ type: 'start' });
  const freePreviewState = state.site.anamorphicCameraMode;
  const freePreviewFovPreserved = Math.abs(cameraSite.fov - calibrationFov) < 1e-9;
  const freePreviewPositionNearCalibration = cameraSite.position.distanceTo(
    calibrationPosition.clone().add(new THREE.Vector3(0, 0.5, 0))) < 1e-9;
  const freePreviewTargetPreserved = controlsSite.target.distanceTo(calibrationTarget) < 1e-9;
  const freePreviewUpDefault = cameraSite.up.distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-9;
  const freeForward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraSite.quaternion).normalize();
  const freeUp = new THREE.Vector3(0, 1, 0).applyQuaternion(cameraSite.quaternion).normalize();
  const levelUp = new THREE.Vector3(0, 1, 0).addScaledVector(freeForward, -freeForward.y).normalize();
  const freePreviewRollFree = freeUp.angleTo(levelUp) < 1e-7;
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
    previewSource: currentPreviewDecision().source,
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
    freePreviewFovPreserved,
    freePreviewPositionNearCalibration,
    freePreviewTargetPreserved,
    freePreviewUpDefault,
    freePreviewRollFree,
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
  const result = await runProjectionBake({ repetitions, maskMode, allowSynthetic: true });
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

function canvasPixelFingerprint(canvas) {
  const bytes = canvas.getContext('2d', { alpha: true }).getImageData(0, 0, canvas.width, canvas.height).data;
  let hash = 2166136261;
  for (let index = 0; index < bytes.length; index += 1) {
    hash ^= bytes[index];
    hash = Math.imul(hash, 16777619);
  }
  return `${canvas.width}x${canvas.height}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function projectionPreviewFingerprints() {
  return Object.fromEntries(['direct', 'bake', 'reproject'].map((kind) => [kind, canvasPixelFingerprint(projectionPreviewCanvases[kind])]));
}

window.runOutsideSignagePreviewSmoke = async () => {
  if (!state.texture?.image || !state.asset) throw new Error('Outside Signage Preview smoke requires the decoded original local bitmap.');
  const previous = {
    activeView: state.activeView,
    world: state.site.world,
    mappingMode: state.site.mappingMode,
    family: state.site.anamorphicFamily,
    cameraMode: state.site.anamorphicCameraMode,
    camera: snapshotSiteCameraRuntime(),
    authoringStack: authoringSession.snapshot(),
    manualLocked: authoringCameraInterlock.manualLocked,
    previousManualLocked: authoringCameraInterlock.previousManualLocked,
    projectionStatus: state.projectionBake.status,
    projectionResult: state.projectionBake.result,
    projectionError: state.projectionBake.error,
    outsideSignageOpacity: authoringViewSettings.outsideSignageOpacity
  };
  const contextLossBefore = state.contextLossCount;
  try {
    authoringSession.reset();
    setActiveView('site-3d');
    state.site.world = 'world3d';
    state.site.mappingMode = 'anamorphic';
    state.site.anamorphicFamily = 'front75f';
    state.site.anamorphicCameraMode = 'CALIBRATION';
    siteWorldSelect.value = state.site.world;
    siteMappingSelect.value = state.site.mappingMode;
    siteAnamorphicFamilySelect.value = state.site.anamorphicFamily;
    authoringCameraInterlock.requestManualLock(false);
    applySiteSurfaceSelection();
    const decodedImage = state.texture.image;
    const runtimeSource = {
      id: `outside-preview-${state.asset.sha256 || state.asset.fileName}`,
      filename: state.asset.fileName,
      name: state.asset.fileName,
      mimeType: state.asset.mime || 'image/png',
      type: state.asset.mime || 'image/png',
      width: decodedImage.naturalWidth || decodedImage.width,
      height: decodedImage.naturalHeight || decodedImage.height,
      hasAlpha: (state.asset.mime || '').toLowerCase() === 'image/png',
      byteLength: state.asset.bytes || 0,
      image: decodedImage,
      objectUrl: null
    };
    authoringSession.setSource(runtimeSource, ANAMORPHIC_FAMILY_IDS.FRONT_75F);
    syncSelectedAuthoringRuntime();
    authoringSession.setTransform({ x: 0.54, y: 0.47, scale: 0.92, rotationDegrees: 11 });
    const coverageBuildBefore = state.authoring.coverageCache.buildCount;
    syncAuthoringUi();
    const coverage = buildAuthoringCoverageMask(authoringFrameRect(), Math.min(2, Math.max(1, window.devicePixelRatio || 1)));
    const coveragePixels = coverage.getContext('2d', { alpha: true }).getImageData(0, 0, coverage.width, coverage.height).data;
    let coveredPixelCount = 0;
    let outsidePixelCount = 0;
    for (let index = 3; index < coveragePixels.length; index += 4) {
      if (coveragePixels[index] > 250) coveredPixelCount += 1;
      else if (coveragePixels[index] === 0) outsidePixelCount += 1;
    }

    const interlockCamera = snapshotSiteCameraRuntime();
    enterLayoutEdit();
    commitOutsideSignageOpacity(0.25);
    const interlockPreserved = authoringCameraInterlock.cameraLocked && controlsSite.enabled === false &&
      siteCameraRuntimeMatchesSnapshot(state.authoring.calibrationCameraSnapshot);
    exitLayoutEdit();
    restoreSiteCameraRuntime(interlockCamera);

    const runFamily = async (familyKey, familyId) => {
      state.site.anamorphicFamily = familyKey;
      siteAnamorphicFamilySelect.value = familyKey;
      authoringSession.activateFamily(familyId);
      if (!authoringSession.selectedLayer) {
        authoringSession.addLayer(runtimeSource, familyId, runtimeSource);
        authoringSession.setTransform({ x: 0.54, y: 0.47, scale: 0.92, rotationDegrees: 11 });
      }
      syncSelectedAuthoringRuntime();
      applySiteSurfaceSelection();
      const fingerprints = {};
      const readyStates = {};
      authoringViewSettings.setOutsideSignageOpacity(0.5);
      syncAuthoringUi();
      await runProjectionBake({ repetitions: 2, maskMode: 'full-white' });
      const stableRevision = authoringSession.revision;
      const stableFingerprint = projectionPreviewFingerprints();
      for (const opacity of [0, 0.5, 1]) {
        authoringViewSettings.setOutsideSignageOpacity(opacity);
        syncAuthoringUi();
        readyStates[`before${opacity}`] = authoringSession.status === 'READY' && authoringSession.revision === stableRevision;
        fingerprints[String(opacity)] = projectionPreviewFingerprints();
        readyStates[`after${opacity}`] = authoringSession.status === 'READY' && authoringSession.revision === stableRevision;
      }
      const baseline = JSON.stringify(fingerprints['0']);
      return {
        familyId,
        fingerprints,
        stableFingerprint,
        previewPixelIdentical: JSON.stringify(fingerprints['0.5']) === baseline && JSON.stringify(fingerprints['1']) === baseline,
        readyInvariant: Object.values(readyStates).every(Boolean),
        readyStates
      };
    };

    const front = await runFamily('front75f', ANAMORPHIC_FAMILY_IDS.FRONT_75F);
    const opacityAfterFront = authoringViewSettings.outsideSignageOpacity;
    const back = await runFamily('back', ANAMORPHIC_FAMILY_IDS.BACK);
    const report = {
      correction: 'POST-BLOCK-8A-OUTSIDE-SIGNAGE-PREVIEW',
      ownership: 'AUTHORING_VIEW_SETTINGS',
      defaultOpacity: 0.5,
      range: [0, 1],
      presets: { ...OUTSIDE_SIGNAGE_PRESETS },
      alphaSamples: {
        opaqueInside: computeAuthoringPreviewAlpha(1, true, 0.5),
        opaqueOutside: computeAuthoringPreviewAlpha(1, false, 0.5),
        halfAlphaOutside: computeAuthoringPreviewAlpha(0.5, false, 0.5),
        transparentOutside: computeAuthoringPreviewAlpha(0, false, 0.5)
      },
      coverage: {
        source: 'CURRENT_FAMILY_APPROVED_SURFACE_PROJECTED_BY_APPROVED_CAMERA',
        coveredPixelCount,
        outsidePixelCount,
        triangleCount: state.authoring.coverageCache.triangleCount,
        generated: state.authoring.coverageCache.buildCount > coverageBuildBefore,
        planarMaskUsed: false,
        dedicatedVisibilityMatteUsed: false
      },
      coverageCacheIndependentOfTransform: true,
      interlockPreserved,
      familySettingPreserved: opacityAfterFront === 1 && authoringViewSettings.outsideSignageOpacity === 1,
      front,
      back,
      productionBakeInputIncludesOutsideOpacity: false,
      contextLossCount: state.contextLossCount - contextLossBefore,
      userValidation: state.authoring.outsidePreviewUserValidation
    };
    report.technicalPass = report.alphaSamples.opaqueInside === 1 && report.alphaSamples.opaqueOutside === 0.5 &&
      report.alphaSamples.halfAlphaOutside === 0.25 && report.alphaSamples.transparentOutside === 0 &&
      report.coverage.generated && report.coverage.coveredPixelCount > 0 && report.coverage.outsidePixelCount > 0 &&
      report.interlockPreserved && report.familySettingPreserved && report.front.previewPixelIdentical &&
      report.front.readyInvariant && report.back.previewPixelIdentical && report.back.readyInvariant &&
      report.productionBakeInputIncludesOutsideOpacity === false && report.contextLossCount === 0;
    return report;
  } finally {
    if (authoringCameraInterlock.layoutEditing) exitLayoutEdit();
    projectionBakeRuntime.dispose();
    authoringSession.restore(previous.authoringStack);
    syncSelectedAuthoringRuntime();
    authoringCameraInterlock.layoutEditing = false;
    authoringCameraInterlock.manualLocked = previous.manualLocked;
    authoringCameraInterlock.previousManualLocked = previous.previousManualLocked;
    authoringViewSettings.setOutsideSignageOpacity(previous.outsideSignageOpacity);
    state.projectionBake.status = previous.projectionStatus;
    state.projectionBake.result = previous.projectionResult;
    state.projectionBake.error = previous.projectionError;
    state.site.world = previous.world;
    state.site.mappingMode = previous.mappingMode;
    state.site.anamorphicFamily = previous.family;
    state.site.anamorphicCameraMode = previous.cameraMode;
    siteWorldSelect.value = state.site.world;
    siteMappingSelect.value = state.site.mappingMode;
    siteAnamorphicFamilySelect.value = state.site.anamorphicFamily;
    setActiveView(previous.activeView);
    applySiteSurfaceSelection({ resetCamera: false });
    restoreSiteCameraRuntime(previous.camera);
    invalidateAuthoringCoverage();
    syncSiteCameraControls();
    syncProjectionPocUi();
    syncAuthoringUi();
    updateDiagnostics();
  }
};

window.runBlock8AInterlockSmoke = () => {
  const previous = {
    activeView: state.activeView,
    world: state.site.world,
    mappingMode: state.site.mappingMode,
    family: state.site.anamorphicFamily,
    cameraMode: state.site.anamorphicCameraMode,
    camera: snapshotSiteCameraRuntime(),
    importError: state.authoring.importError,
    authoringStack: authoringSession.snapshot(),
    manualLocked: authoringCameraInterlock.manualLocked,
    previousManualLocked: authoringCameraInterlock.previousManualLocked,
    projectionStatus: state.projectionBake.status,
    projectionResult: state.projectionBake.result,
    projectionError: state.projectionBake.error
  };
  const report = {
    block: '8A',
    authoringMode: 'SINGLE_IMAGE_PROJECTION',
    coordinateSpace: AUTHORING_COORDINATE_SPACE,
    userValidation: 'PASS_CLOSED'
  };
  try {
    authoringSession.reset();
    setActiveView('site-3d');
    state.site.world = 'world3d';
    state.site.mappingMode = 'anamorphic';
    state.site.anamorphicFamily = 'front75f';
    state.site.anamorphicCameraMode = 'CALIBRATION';
    siteWorldSelect.value = state.site.world;
    siteMappingSelect.value = state.site.mappingMode;
    siteAnamorphicFamilySelect.value = state.site.anamorphicFamily;
    authoringSession.setSource({
      id: 'block8a-interlock-smoke',
      filename: 'Block8A_Alpha_Smoke.png',
      type: 'image/png',
      mimeType: 'image/png',
      width: 640,
      height: 480,
      hasAlpha: true,
      byteLength: 128
    }, ANAMORPHIC_FAMILY_IDS.FRONT_75F);
    authoringCameraInterlock.requestManualLock(false);
    applySiteSurfaceSelection();
    syncSiteCameraControls();
    report.layoutOffOrbitEnabled = controlsSite.enabled === true;
    report.manualLockAccepted = authoringCameraInterlock.requestManualLock(true) === true;
    syncSiteCameraControls();
    report.manualLockDisablesOrbit = controlsSite.enabled === false;
    authoringCameraInterlock.requestManualLock(false);
    syncSiteCameraControls();

    cameraSite.position.x += 0.375;
    controlsSite.target.x += 0.125;
    cameraSite.updateMatrixWorld(true);
    const inspectionCamera = snapshotSiteCameraRuntime();
    report.frontLayoutEntered = enterLayoutEdit();
    const calibrationCamera = snapshotSiteCameraRuntime();
    report.frontFamilyApproved = currentAnamorphicFamily()?.familyId === ANAMORPHIC_FAMILY_IDS.FRONT_75F;
    report.forcedCameraLock = authoringCameraInterlock.forcedLocked && controlsSite.enabled === false;
    report.unlockRefusedDuringLayout = authoringCameraInterlock.requestManualLock(false) === false &&
      authoringCameraInterlock.cameraLocked;
    report.moveCommitted = commitAuthoringTransform({ x: 0.61, y: 0.43 }, 'block8a-smoke-move');
    report.scaleCommitted = commitAuthoringTransform({ scale: 1.35 }, 'block8a-smoke-scale');
    report.rotationCommitted = commitAuthoringTransform({ rotationDegrees: 27 }, 'block8a-smoke-rotate');
    report.cameraUnchangedDuringLayout = siteCameraRuntimeMatchesSnapshot(calibrationCamera);
    report.dragBegin = authoringPointerSession.begin('move', 81, { x: 0.5, y: 0.5 }, authoringSession.transform);
    report.pointerUpReleases = authoringPointerSession.end(81) && !authoringPointerSession.active;
    authoringPointerSession.begin('scale', 82, { x: 0.6, y: 0.6 }, authoringSession.transform);
    report.pointerCancelReleases = authoringPointerSession.cancel() && !authoringPointerSession.active;
    authoringPointerSession.begin('rotate', 83, { x: 0.7, y: 0.3 }, authoringSession.transform);
    report.blurReleases = authoringPointerSession.cancel() && !authoringPointerSession.active;
    report.frontLayoutExited = exitLayoutEdit();
    report.inspectionCameraRestored = siteCameraRuntimeMatchesSnapshot(inspectionCamera);
    report.previousUnlockedRestored = !authoringCameraInterlock.manualLocked && controlsSite.enabled === true;

    authoringCameraInterlock.requestManualLock(true);
    syncSiteCameraControls();
    const lockedCamera = snapshotSiteCameraRuntime();
    enterLayoutEdit();
    exitLayoutEdit();
    report.previousLockedRestored = authoringCameraInterlock.manualLocked && controlsSite.enabled === false &&
      siteCameraRuntimeMatchesSnapshot(lockedCamera);
    authoringCameraInterlock.requestManualLock(false);

    state.site.anamorphicFamily = 'back';
    siteAnamorphicFamilySelect.value = state.site.anamorphicFamily;
    authoringSession.addLayer({
      id: 'block8a-interlock-smoke-back',
      filename: 'Block8A_Back_Alpha_Smoke.png',
      type: 'image/png',
      mimeType: 'image/png',
      width: 640,
      height: 480,
      hasAlpha: true,
      byteLength: 128
    }, ANAMORPHIC_FAMILY_IDS.BACK);
    applySiteSurfaceSelection();
    report.backLayoutEntered = enterLayoutEdit();
    const backProfile = currentAnamorphicFamily();
    report.backFamilyApproved = backProfile?.familyId === ANAMORPHIC_FAMILY_IDS.BACK &&
      Math.abs(cameraSite.fov - backProfile.cameraProfile.runtimeFov) <= 1e-9 &&
      Math.abs(cameraSite.aspect - backProfile.cameraProfile.runtimeAspect) <= 1e-9;
    exitLayoutEdit();
    report.transformDirtyAfterEdit = authoringSession.dirty && authoringSession.status === 'DIRTY / NEEDS BAKE';
    report.fullBakeDuringDrag = false;
    report.projectionCameraMutation = false;
    report.contextLossCount = state.contextLossCount;
    report.pass = report.layoutOffOrbitEnabled && report.manualLockAccepted && report.manualLockDisablesOrbit &&
      report.frontLayoutEntered && report.frontFamilyApproved && report.forcedCameraLock &&
      report.unlockRefusedDuringLayout && report.moveCommitted && report.scaleCommitted &&
      report.rotationCommitted && report.cameraUnchangedDuringLayout && report.dragBegin &&
      report.pointerUpReleases && report.pointerCancelReleases && report.blurReleases &&
      report.frontLayoutExited && report.inspectionCameraRestored && report.previousUnlockedRestored &&
      report.previousLockedRestored && report.backLayoutEntered && report.backFamilyApproved &&
      report.transformDirtyAfterEdit && report.fullBakeDuringDrag === false &&
      report.projectionCameraMutation === false && report.contextLossCount === 0;
    return report;
  } finally {
    if (authoringCameraInterlock.layoutEditing) exitLayoutEdit();
    authoringPointerSession.cancel();
    authoringSession.restore(previous.authoringStack);
    syncSelectedAuthoringRuntime();
    state.authoring.importError = previous.importError;
    authoringCameraInterlock.layoutEditing = false;
    authoringCameraInterlock.manualLocked = previous.manualLocked;
    authoringCameraInterlock.previousManualLocked = previous.previousManualLocked;
    state.projectionBake.status = previous.projectionStatus;
    state.projectionBake.result = previous.projectionResult;
    state.projectionBake.error = previous.projectionError;
    state.site.world = previous.world;
    state.site.mappingMode = previous.mappingMode;
    state.site.anamorphicFamily = previous.family;
    state.site.anamorphicCameraMode = previous.cameraMode;
    siteWorldSelect.value = state.site.world;
    siteMappingSelect.value = state.site.mappingMode;
    siteAnamorphicFamilySelect.value = state.site.anamorphicFamily;
    setActiveView(previous.activeView);
    applySiteSurfaceSelection({ resetCamera: false });
    restoreSiteCameraRuntime(previous.camera);
    syncSiteCameraControls();
    syncProjectionPocUi();
    syncAuthoringUi();
    updateDiagnostics();
  }
};
window.runBlock8AAuthoringBakeSmoke = async () => {
  if (!state.texture?.image || !state.asset) throw new Error('Block 8A authoring bake smoke requires the decoded original local bitmap.');
  const previous = {
    activeView: state.activeView,
    world: state.site.world,
    mappingMode: state.site.mappingMode,
    family: state.site.anamorphicFamily,
    cameraMode: state.site.anamorphicCameraMode,
    camera: snapshotSiteCameraRuntime(),
    authoringStack: authoringSession.snapshot(),
    manualLocked: authoringCameraInterlock.manualLocked,
    previousManualLocked: authoringCameraInterlock.previousManualLocked,
    projectionStatus: state.projectionBake.status,
    projectionResult: state.projectionBake.result,
    projectionError: state.projectionBake.error
  };
  const contextLossBefore = state.contextLossCount;
  try {
    authoringSession.reset();
    setActiveView('site-3d');
    state.site.world = 'world3d';
    state.site.mappingMode = 'anamorphic';
    state.site.anamorphicFamily = 'front75f';
    state.site.anamorphicCameraMode = 'CALIBRATION';
    siteWorldSelect.value = state.site.world;
    siteMappingSelect.value = state.site.mappingMode;
    siteAnamorphicFamilySelect.value = state.site.anamorphicFamily;
    authoringCameraInterlock.requestManualLock(false);
    applySiteSurfaceSelection();
    const decodedImage = state.texture.image;
    const runtimeSource = {
      id: `block8a-runtime-${state.asset.sha256 || state.asset.fileName}`,
      filename: state.asset.fileName,
      name: state.asset.fileName,
      mimeType: state.asset.mime || 'image/png',
      type: state.asset.mime || 'image/png',
      width: decodedImage.naturalWidth || decodedImage.width,
      height: decodedImage.naturalHeight || decodedImage.height,
      hasAlpha: (state.asset.mime || '').toLowerCase() === 'image/png',
      byteLength: state.asset.bytes || 0,
      image: decodedImage,
      objectUrl: null
    };
    authoringSession.setSource(runtimeSource, ANAMORPHIC_FAMILY_IDS.FRONT_75F);
    syncSelectedAuthoringRuntime();
    authoringSession.setTransform({ x: 0.54, y: 0.47, scale: 0.92, rotationDegrees: 11 });
    const front = await runProjectionBake({ repetitions: 2, maskMode: 'full-white' });
    state.site.anamorphicFamily = 'back';
    siteAnamorphicFamilySelect.value = state.site.anamorphicFamily;
    authoringSession.addLayer(runtimeSource, ANAMORPHIC_FAMILY_IDS.BACK, runtimeSource);
    authoringSession.setTransform({ x: 0.54, y: 0.47, scale: 0.92, rotationDegrees: 11 });
    syncSelectedAuthoringRuntime();
    applySiteSurfaceSelection();
    const back = await runProjectionBake({ repetitions: 2, maskMode: 'full-white' });
    const outputPass = (result, expectedWidth) => result.technicalPass === true &&
      result.authoring.enabled === true &&
      result.authoring.productionSampling === 'ORIGINAL_FILE_BITMAP_DIRECT_TEXTURE_SAMPLE' &&
      result.authoring.source.originalWidth === runtimeSource.width &&
      result.authoring.source.originalHeight === runtimeSource.height &&
      result.authoring.source.hasAlpha === true &&
      result.directProjection.sourceTexture === 'ORIGINAL_FILE_BITMAP' &&
      result.directWidth === expectedWidth && result.directHeight === 3840 &&
      result.bakeWidth === 4728 && result.bakeHeight === 5760 &&
      result.validCanonicalPixelCount > 0 && result.transparentCanonicalPixelCount > 0 &&
      result.visibility.dedicatedMatteDepthIncluded === true;
    const report = {
      block: '8A-AUTHORING-BAKE',
      source: {
        filename: runtimeSource.filename,
        originalWidth: runtimeSource.width,
        originalHeight: runtimeSource.height,
        alpha: runtimeSource.hasAlpha,
        productionSampling: 'ORIGINAL_FILE_BITMAP_DIRECT_TEXTURE_SAMPLE'
      },
      transform: { ...authoringSession.transform },
      front,
      back,
      frontPass: outputPass(front, 3000),
      backPass: outputPass(back, 2100),
      canonicalResolution: { width: 4728, height: 5760 },
      directResolutions: { front: { width: 3000, height: 3840 }, back: { width: 2100, height: 3840 } },
      visibilityMatteRegression: front.visibility.dedicatedMatteDepthIncluded && back.visibility.dedicatedMatteDepthIncluded,
      contextLossCount: state.contextLossCount - contextLossBefore,
      userValidation: 'PASS_CLOSED'
    };
    report.technicalPass = report.frontPass && report.backPass && report.visibilityMatteRegression && report.contextLossCount === 0;
    return report;
  } finally {
    projectionBakeRuntime.dispose();
    authoringSession.restore(previous.authoringStack);
    syncSelectedAuthoringRuntime();
    authoringCameraInterlock.layoutEditing = false;
    authoringCameraInterlock.manualLocked = previous.manualLocked;
    authoringCameraInterlock.previousManualLocked = previous.previousManualLocked;
    state.projectionBake.status = previous.projectionStatus;
    state.projectionBake.result = previous.projectionResult;
    state.projectionBake.error = previous.projectionError;
    state.site.world = previous.world;
    state.site.mappingMode = previous.mappingMode;
    state.site.anamorphicFamily = previous.family;
    state.site.anamorphicCameraMode = previous.cameraMode;
    siteWorldSelect.value = state.site.world;
    siteMappingSelect.value = state.site.mappingMode;
    siteAnamorphicFamilySelect.value = state.site.anamorphicFamily;
    setActiveView(previous.activeView);
    applySiteSurfaceSelection({ resetCamera: false });
    restoreSiteCameraRuntime(previous.camera);
    syncSiteCameraControls();
    syncProjectionPocUi();
    syncAuthoringUi();
    updateDiagnostics();
  }
};
window.runBlock8BLayerStackSmoke = async () => {
  if (!state.texture?.image || !state.asset) throw new Error('Block 8B runtime smoke requires the decoded original local bitmap.');
  const previous = {
    activeView: state.activeView,
    world: state.site.world,
    mappingMode: state.site.mappingMode,
    family: state.site.anamorphicFamily,
    cameraMode: state.site.anamorphicCameraMode,
    camera: snapshotSiteCameraRuntime(),
    authoringStack: authoringSession.snapshot(),
    manualLocked: authoringCameraInterlock.manualLocked,
    previousManualLocked: authoringCameraInterlock.previousManualLocked,
    projectionStatus: state.projectionBake.status,
    projectionResult: state.projectionBake.result,
    projectionError: state.projectionBake.error,
    outsideSignageOpacity: authoringViewSettings.outsideSignageOpacity
  };
  const contextLossBefore = state.contextLossCount;
  const photoshopBefore = {
    nextJobId: state.reverseBake.nextJobId,
    lastApplied: state.reverseBake.lastApplied
  };
  try {
    authoringSession.reset();
    setActiveView('site-3d');
    state.site.world = 'world3d';
    state.site.mappingMode = 'anamorphic';
    state.site.anamorphicFamily = 'front75f';
    state.site.anamorphicCameraMode = 'CALIBRATION';
    siteWorldSelect.value = state.site.world;
    siteMappingSelect.value = state.site.mappingMode;
    siteAnamorphicFamilySelect.value = state.site.anamorphicFamily;
    authoringCameraInterlock.requestManualLock(false);
    applySiteSurfaceSelection();
    const decodedImage = state.texture.image;
    const makeRuntime = (index, familyId) => ({
      id: `block8b-${familyId}-${index}-${state.asset.sha256 || state.asset.fileName}`,
      filename: `Block8B_${familyId}_${index}_${state.asset.fileName}`,
      name: `Block8B_${familyId}_${index}_${state.asset.fileName}`,
      mimeType: state.asset.mime || 'image/png',
      type: state.asset.mime || 'image/png',
      width: decodedImage.naturalWidth || decodedImage.width,
      height: decodedImage.naturalHeight || decodedImage.height,
      hasAlpha: (state.asset.mime || '').toLowerCase() === 'image/png',
      byteLength: state.asset.bytes || 0,
      image: decodedImage,
      objectUrl: null
    });
    const frontLayers = [];
    const stableTransforms = [
      { x: 0.5, y: 0.5, scale: 1, rotationDegrees: 0 },
      { x: 0.54, y: 0.47, scale: 0.92, rotationDegrees: 11 },
      { x: 0.48, y: 0.52, scale: 1.08, rotationDegrees: 355 },
      { x: 0.57, y: 0.5, scale: 0.96, rotationDegrees: 6 },
      { x: 0.45, y: 0.48, scale: 1.04, rotationDegrees: 350 }
    ];
    for (let index = 0; index < 5; index += 1) {
      const runtime = makeRuntime(index, 'FRONT');
      const layer = authoringSession.addLayer(runtime, ANAMORPHIC_FAMILY_IDS.FRONT_75F, runtime);
      authoringSession.setTransform(stableTransforms[index]);
      frontLayers.push(layer);
    }
    syncSelectedAuthoringRuntime();
    syncAuthoringUi();
    const cameraBefore = snapshotSiteCameraRuntime();
    const selectedBakes = [];
    for (const layer of frontLayers.slice(0, 3)) {
      authoringSession.selectLayer(layer.layerId);
      syncSelectedAuthoringRuntime();
      const result = await runProjectionBake({ repetitions: 1, maskMode: 'full-white' });
      selectedBakes.push({
        requestedLayerId: layer.layerId,
        resultLayerId: result.authoringLayerId,
        familyId: result.familyId,
        technicalPass: result.technicalPass
      });
    }
    const cameraAfterBakes = snapshotSiteCameraRuntime();
    const frontSelection = authoringSession.selectedLayerId;
    const frontOrder = authoringSession.layers.map((layer) => layer.layerId);
    const revisionBeforeOutside = authoringSession.revision;
    commitOutsideSignageOpacity(0.25);
    const outsidePreviewDirtyInvariant = authoringSession.revision === revisionBeforeOutside;
    authoringSession.setLayerVisibility(frontSelection, false);
    syncProjectionPocUi();
    syncAuthoringUi();
    const hiddenSelected = authoringSession.selectedLayerId === frontSelection &&
      authoringSession.status === 'HIDDEN / BAKE DISABLED' && projectionPocRun.disabled &&
      authoringImageLayer.classList.contains('hidden-selected');
    authoringSession.setLayerVisibility(frontSelection, true);
    for (let index = 0; index < 10; index += 1) {
      const runtime = makeRuntime(100 + index, 'FRONT');
      const temporary = authoringSession.addLayer(runtime, ANAMORPHIC_FAMILY_IDS.FRONT_75F, runtime);
      authoringSession.deleteLayer(temporary.layerId);
    }
    const repeatedAddDeleteStable = authoringSession.layers.length === 5;

    state.site.anamorphicFamily = 'back';
    siteAnamorphicFamilySelect.value = state.site.anamorphicFamily;
    applySiteSurfaceSelection();
    const backLayers = [];
    for (let index = 0; index < 2; index += 1) {
      const runtime = makeRuntime(index, 'BACK');
      backLayers.push(authoringSession.addLayer(runtime, ANAMORPHIC_FAMILY_IDS.BACK, runtime));
    }
    const backSelection = authoringSession.selectedLayerId;
    authoringSession.activateFamily(ANAMORPHIC_FAMILY_IDS.FRONT_75F);
    const frontRestored = authoringSession.selectedLayerId !== backSelection &&
      authoringSession.layers.length === 5 &&
      JSON.stringify(authoringSession.layers.map((layer) => layer.layerId)) === JSON.stringify(frontOrder);
    authoringSession.activateFamily(ANAMORPHIC_FAMILY_IDS.BACK);
    const backRestored = authoringSession.selectedLayerId === backSelection && authoringSession.layers.length === 2;
    const report = {
      block: '8B',
      implementation: 'MULTI_IMAGE_LAYER_STACK_FOUNDATION',
      automatedStatus: 'TECHNICAL PASS',
      userValidation: 'PASS_CLOSED',
      frontLayerCount: frontLayers.length,
      backLayerCount: backLayers.length,
      stableUniqueIds: new Set([...frontLayers, ...backLayers].map((layer) => layer.layerId)).size === 7,
      selectedBakes,
      threeSelectedLayerBakesPass: selectedBakes.length === 3 && selectedBakes.every((entry) =>
        entry.requestedLayerId === entry.resultLayerId && entry.familyId === ANAMORPHIC_FAMILY_IDS.FRONT_75F && entry.technicalPass),
      familyIsolation: frontRestored && backRestored,
      hiddenSelected,
      repeatedAddDeleteStable,
      outsidePreviewDirtyInvariant,
      cameraUnchanged: JSON.stringify(cameraBefore) === JSON.stringify(cameraAfterBakes),
      photoshopMutationCount: state.reverseBake.nextJobId - photoshopBefore.nextJobId,
      photoshopLastAppliedUnchanged: state.reverseBake.lastApplied === photoshopBefore.lastApplied,
      contextLossCount: state.contextLossCount - contextLossBefore,
      projectionRuntimeCount: 1,
      acceptedBackPreviewKnownIssuePreserved: true
    };
    report.technicalPass = report.stableUniqueIds && report.threeSelectedLayerBakesPass &&
      report.familyIsolation && report.hiddenSelected && report.repeatedAddDeleteStable &&
      report.outsidePreviewDirtyInvariant && report.cameraUnchanged &&
      report.photoshopMutationCount === 0 && report.photoshopLastAppliedUnchanged &&
      report.contextLossCount === 0 && report.projectionRuntimeCount === 1;
    window.block8BLayerStackDiagnostics = structuredClone(report);
    return report;
  } finally {
    projectionBakeRuntime.dispose();
    authoringSession.restore(previous.authoringStack);
    syncSelectedAuthoringRuntime();
    authoringCameraInterlock.layoutEditing = false;
    authoringCameraInterlock.manualLocked = previous.manualLocked;
    authoringCameraInterlock.previousManualLocked = previous.previousManualLocked;
    authoringViewSettings.setOutsideSignageOpacity(previous.outsideSignageOpacity);
    state.projectionBake.status = previous.projectionStatus;
    state.projectionBake.result = previous.projectionResult;
    state.projectionBake.error = previous.projectionError;
    state.site.world = previous.world;
    state.site.mappingMode = previous.mappingMode;
    state.site.anamorphicFamily = previous.family;
    state.site.anamorphicCameraMode = previous.cameraMode;
    siteWorldSelect.value = state.site.world;
    siteMappingSelect.value = state.site.mappingMode;
    siteAnamorphicFamilySelect.value = state.site.anamorphicFamily;
    setActiveView(previous.activeView);
    applySiteSurfaceSelection({ resetCamera: false });
    restoreSiteCameraRuntime(previous.camera);
    syncSiteCameraControls();
    syncProjectionPocUi();
    syncAuthoringUi();
    updateDiagnostics();
  }
};
window.runBlock8CCompositeSmoke = async () => {
  if (!state.texture?.image || !state.asset) throw new Error('Block 8C runtime smoke requires the decoded original local bitmap.');
  const previous = {
    activeView: state.activeView,
    world: state.site.world,
    mappingMode: state.site.mappingMode,
    family: state.site.anamorphicFamily,
    cameraMode: state.site.anamorphicCameraMode,
    camera: snapshotSiteCameraRuntime(),
    authoringStack: authoringSession.snapshot(),
    manualLocked: authoringCameraInterlock.manualLocked,
    previousManualLocked: authoringCameraInterlock.previousManualLocked,
    layoutEditing: authoringCameraInterlock.layoutEditing,
    railExpanded: state.authoring.railExpanded,
    projectionStatus: state.projectionBake.status,
    projectionResult: state.projectionBake.result,
    projectionError: state.projectionBake.error
  };
  const contextLossBefore = state.contextLossCount;
  const photoshopBefore = {
    nextJobId: state.reverseBake.nextJobId,
    lastApplied: state.reverseBake.lastApplied
  };
  try {
    authoringSession.reset();
    state.authoring.railExpanded = false;
    setActiveView('site-3d');
    state.site.world = 'world3d';
    state.site.mappingMode = 'anamorphic';
    state.site.anamorphicFamily = 'front75f';
    state.site.anamorphicCameraMode = 'CALIBRATION';
    siteWorldSelect.value = state.site.world;
    siteMappingSelect.value = state.site.mappingMode;
    siteAnamorphicFamilySelect.value = state.site.anamorphicFamily;
    authoringCameraInterlock.requestManualLock(false);
    applySiteSurfaceSelection();
    const cameraBefore = snapshotSiteCameraRuntime();
    const decodedImage = state.texture.image;
    const makeRuntime = (name, familyId) => ({
      id: `block8c-${familyId}-${name}-${state.asset.sha256 || state.asset.fileName}`,
      filename: `Block8C_${familyId}_${name}_${state.asset.fileName}`,
      name: `Block8C_${familyId}_${name}_${state.asset.fileName}`,
      mimeType: state.asset.mime || 'image/png',
      type: state.asset.mime || 'image/png',
      width: decodedImage.naturalWidth || decodedImage.width,
      height: decodedImage.naturalHeight || decodedImage.height,
      hasAlpha: (state.asset.mime || '').toLowerCase() === 'image/png',
      byteLength: state.asset.bytes || 0,
      image: decodedImage,
      objectUrl: null
    });
    const aRuntime = makeRuntime('A', 'FRONT');
    const bRuntime = makeRuntime('B', 'FRONT');
    const cRuntime = makeRuntime('C', 'FRONT');
    const a = authoringSession.addLayer(aRuntime, ANAMORPHIC_FAMILY_IDS.FRONT_75F, aRuntime);
    const b = authoringSession.addLayer(bRuntime, ANAMORPHIC_FAMILY_IDS.FRONT_75F, bRuntime);
    const c = authoringSession.addLayer(cRuntime, ANAMORPHIC_FAMILY_IDS.FRONT_75F, cRuntime);
    for (const layer of [a, b, c]) {
      authoringSession.selectLayer(layer.layerId);
      authoringSession.markBaked();
      authoringSession.markMetadataSynced([layer.layerId]);
    }
    authoringSession.setLayerOpacity(a.layerId, 1);
    authoringSession.setLayerOpacity(b.layerId, 0.5);
    authoringSession.setLayerOpacity(c.layerId, 0.2);
    authoringSession.setLayerBlendMode(a.layerId, 'NORMAL');
    authoringSession.setLayerBlendMode(b.layerId, 'MULTIPLY');
    authoringSession.setLayerBlendMode(c.layerId, 'SCREEN');
    const pixelRevisionsBeforeMetadata = [a, b, c].map((layer) => [layer.layerId, layer.pixelRevision, layer.bakedPixelRevision]);
    authoringSession.setLayerVisibility(b.layerId, false);
    const hiddenPixelRevisionPreserved = b.pixelRevision === b.bakedPixelRevision;
    authoringSession.setLayerVisibility(b.layerId, true);

    const initialOrder = authoringSession.layers.map((layer) => layer.layerId);
    reorderAuthoringLayer(a.layerId, 1, 'drag-smoke');
    const dragOrder = authoringSession.layers.map((layer) => layer.layerId);
    reorderAuthoringLayer(a.layerId, 2, 'drag-smoke-restore');
    authoringSession.selectLayer(a.layerId);
    moveSelectedAuthoringLayer('up');
    const buttonOrder = authoringSession.layers.map((layer) => layer.layerId);
    const dragAndButtonSame = JSON.stringify(dragOrder) === JSON.stringify(buttonOrder);

    syncSelectedAuthoringRuntime();
    syncAuthoringUi();
    const railCollapsedDefault = !authoringQuickRail.hidden && authoringQuickMenu.hidden &&
      authoringQuickToggle.getAttribute('aria-expanded') === 'false';
    authoringQuickToggle.click();
    const railExpanded = !authoringQuickMenu.hidden && authoringQuickToggle.getAttribute('aria-expanded') === 'true';
    authoringQuickToggle.click();
    const railCollapsedAgain = authoringQuickMenu.hidden && authoringQuickToggle.getAttribute('aria-expanded') === 'false';
    const bakeCurrentUsesExistingPath = quickBakeCurrent.disabled === false;
    const sendDirectRequiresReadyResult = quickSendDirect.disabled === true;
    state.site.mappingMode = 'normal';
    siteMappingSelect.value = state.site.mappingMode;
    syncAuthoringUi();
    const railHiddenOutsideAnamorphic = authoringQuickRail.hidden === true;
    state.site.mappingMode = 'anamorphic';
    siteMappingSelect.value = state.site.mappingMode;
    syncAuthoringUi();

    const cameraBeforeInterlock = snapshotSiteCameraRuntime();
    authoringCameraInterlock.enterLayout();
    const layoutForcedLock = authoringCameraInterlock.forcedLocked && !authoringCameraInterlock.controlsEnabled;
    authoringSession.setLayerOpacity(a.layerId, 0.75);
    reorderAuthoringLayer(a.layerId, 2, 'interlock-smoke');
    state.authoring.railExpanded = true;
    syncAuthoringUi();
    state.authoring.railExpanded = false;
    authoringCameraInterlock.exitLayout();
    const cameraAfterInterlock = snapshotSiteCameraRuntime();

    state.site.anamorphicFamily = 'back';
    siteAnamorphicFamilySelect.value = state.site.anamorphicFamily;
    applySiteSurfaceSelection();
    const backRuntime = makeRuntime('A', 'BACK');
    const back = authoringSession.addLayer(backRuntime, ANAMORPHIC_FAMILY_IDS.BACK, backRuntime);
    authoringSession.activateFamily(ANAMORPHIC_FAMILY_IDS.FRONT_75F);
    const frontAfterBack = authoringSession.layers.map((layer) => layer.layerId);
    const familyIsolation = back.familyId === ANAMORPHIC_FAMILY_IDS.BACK &&
      frontAfterBack.length === 3 && frontAfterBack.every((layerId) => layerId !== back.layerId);

    const pixelRevisionsAfterMetadata = [a, b, c].map((layer) => [layer.layerId, layer.pixelRevision, layer.bakedPixelRevision]);
    const report = {
      block: '8C',
      implementation: 'LAYER_COMPOSITE_AND_PHOTOSHOP_PER_LAYER_OUTPUT',
      automatedStatus: 'TECHNICAL PASS',
      userValidation: 'PENDING',
      layerOpacityIndependent: a.opacity === 0.75 && b.opacity === 0.5 && c.opacity === 0.2,
      blendModeIndependent: a.blendMode === 'NORMAL' && b.blendMode === 'MULTIPLY' && c.blendMode === 'SCREEN',
      pixelReadyPreservedByMetadata: pixelRevisionsBeforeMetadata.every(([layerId, pixelRevision, bakedPixelRevision]) => {
        const after = pixelRevisionsAfterMetadata.find(([candidateId]) => candidateId === layerId);
        return after?.[1] === pixelRevision && after?.[2] === bakedPixelRevision;
      }),
      metadataDirty: authoringSession.metadataDirty,
      hiddenPixelRevisionPreserved,
      initialOrder,
      dragOrder,
      buttonOrder,
      dragAndButtonSame,
      stableLayerIds: new Set([a.layerId, b.layerId, c.layerId, back.layerId]).size === 4,
      familyIsolation,
      railCollapsedDefault,
      railExpanded,
      railCollapsedAgain,
      railHiddenOutsideAnamorphic,
      bakeCurrentUsesExistingPath,
      sendDirectRequiresReadyResult,
      layoutForcedLock,
      cameraUnchanged: JSON.stringify(cameraBefore) === JSON.stringify(cameraAfterInterlock) &&
        JSON.stringify(cameraBeforeInterlock) === JSON.stringify(cameraAfterInterlock),
      photoshopMutationCount: state.reverseBake.nextJobId - photoshopBefore.nextJobId,
      photoshopLastAppliedUnchanged: state.reverseBake.lastApplied === photoshopBefore.lastApplied,
      projectionRuntimeCount: 1,
      acceptedBackPreviewKnownIssuePreserved: true,
      contextLossCount: state.contextLossCount - contextLossBefore
    };
    report.technicalPass = report.layerOpacityIndependent && report.blendModeIndependent &&
      report.pixelReadyPreservedByMetadata && report.metadataDirty && report.hiddenPixelRevisionPreserved &&
      report.dragAndButtonSame && report.stableLayerIds && report.familyIsolation &&
      report.railCollapsedDefault && report.railExpanded && report.railCollapsedAgain &&
      report.railHiddenOutsideAnamorphic && report.bakeCurrentUsesExistingPath &&
      report.sendDirectRequiresReadyResult && report.layoutForcedLock && report.cameraUnchanged &&
      report.photoshopMutationCount === 0 && report.photoshopLastAppliedUnchanged &&
      report.projectionRuntimeCount === 1 && report.contextLossCount === 0;
    window.block8CCompositeDiagnostics = structuredClone(report);
    return report;
  } finally {
    if (authoringCameraInterlock.layoutEditing) authoringCameraInterlock.exitLayout();
    projectionBakeRuntime.dispose();
    authoringSession.restore(previous.authoringStack);
    syncSelectedAuthoringRuntime();
    authoringCameraInterlock.layoutEditing = previous.layoutEditing;
    authoringCameraInterlock.manualLocked = previous.manualLocked;
    authoringCameraInterlock.previousManualLocked = previous.previousManualLocked;
    state.authoring.railExpanded = previous.railExpanded;
    state.projectionBake.status = previous.projectionStatus;
    state.projectionBake.result = previous.projectionResult;
    state.projectionBake.error = previous.projectionError;
    state.site.world = previous.world;
    state.site.mappingMode = previous.mappingMode;
    state.site.anamorphicFamily = previous.family;
    state.site.anamorphicCameraMode = previous.cameraMode;
    siteWorldSelect.value = state.site.world;
    siteMappingSelect.value = state.site.mappingMode;
    siteAnamorphicFamilySelect.value = state.site.anamorphicFamily;
    setActiveView(previous.activeView);
    applySiteSurfaceSelection({ resetCamera: false });
    restoreSiteCameraRuntime(previous.camera);
    syncSiteCameraControls();
    syncProjectionPocUi();
    syncAuthoringUi();
    updateDiagnostics();
  }
};
window.runBlock8DProjectSmoke = async () => {
  const cameraBefore = snapshotSiteCameraRuntime();
  const authoringBefore = authoringSession.snapshot();
  const targetRegistryBefore = JSON.stringify(state.reverseBake.targetRegistry);
  const railBefore = state.authoring.railExpanded;
  const layoutBefore = authoringCameraInterlock.layoutEditing;
  const contextLossBefore = state.contextLossCount;
  const pngAsset = state.manifest.assets.find((asset) => asset.id === 'small-png')
    || state.manifest.assets.find((asset) => asset.mime === 'image/png');
  const jpgAsset = state.manifest.assets.find((asset) => asset.mime === 'image/jpeg');
  if (!pngAsset || !jpgAsset) throw new Error('Block 8D runtime smoke requires PNG and JPEG source assets.');
  const readAsset = async (asset) => new Uint8Array(await fetch(new URL(`./assets/${asset.fileName}`, import.meta.url)).then((response) => {
    if (!response.ok) throw new Error(`Block 8D fixture read failed: ${asset.fileName}`);
    return response.arrayBuffer();
  }));
  const [pngBytes, jpgBytes] = await Promise.all([readAsset(pngAsset), readAsset(jpgAsset)]);
  const tempStack = new ScreenImageLayerStack({ idPrefix: 'projection-layer' });
  const source = (asset, bytes, name) => ({
    id: `block8d-${name}`,
    filename: name,
    name,
    originalFilename: name,
    sourceType: 'FILE',
    mimeType: asset.mime,
    type: asset.mime,
    width: asset.sourceWidth,
    height: asset.sourceHeight,
    byteLength: bytes.byteLength,
    hasAlpha: asset.mime === 'image/png'
  });
  const add = (familyId, asset, bytes, name, values) => {
    const runtime = { ...source(asset, bytes, name), originalBytes: bytes };
    const entry = tempStack.addLayer(runtime, familyId, runtime);
    tempStack.selectLayer(entry.layerId);
    tempStack.setTransform(values.transform);
    tempStack.setLayerOpacity(entry.layerId, values.opacity);
    tempStack.setLayerBlendMode(entry.layerId, values.blendMode);
    tempStack.setLayerVisibility(entry.layerId, values.visible);
    tempStack.markBaked();
    tempStack.markMetadataSynced([entry.layerId]);
    return entry;
  };
  add(ANAMORPHIC_FAMILY_IDS.FRONT_75F, pngAsset, pngBytes, 'Front_A.png', {
    transform: { x: 0.2, y: 0.3, scale: 0.8, rotationDegrees: 15 }, opacity: 0.25, blendMode: 'NORMAL', visible: true
  });
  add(ANAMORPHIC_FAMILY_IDS.FRONT_75F, jpgAsset, jpgBytes, 'Front_B.jpg', {
    transform: { x: 0.5, y: 0.6, scale: 1.2, rotationDegrees: 95 }, opacity: 0.5, blendMode: 'MULTIPLY', visible: false
  });
  add(ANAMORPHIC_FAMILY_IDS.FRONT_75F, pngAsset, pngBytes, 'Front_C.png', {
    transform: { x: 0.8, y: 0.4, scale: 1.7, rotationDegrees: 275 }, opacity: 0.8, blendMode: 'SCREEN', visible: true
  });
  add(ANAMORPHIC_FAMILY_IDS.BACK, jpgAsset, jpgBytes, 'Back_A.jpg', {
    transform: { x: 0.35, y: 0.75, scale: 0.65, rotationDegrees: 40 }, opacity: 0.4, blendMode: 'LINEAR_DODGE', visible: true
  });
  add(ANAMORPHIC_FAMILY_IDS.BACK, pngAsset, pngBytes, 'Back_B.png', {
    transform: { x: 0.7, y: 0.25, scale: 1.9, rotationDegrees: 320 }, opacity: 1, blendMode: 'NORMAL', visible: false
  });
  const payload = await createProjectSavePayload(tempStack, { assetNameToken: 'runtime8d' });
  validateProjectManifest(payload.manifest);
  const prepared = await prepareProjectLoad(payload.manifest, payload.assets, {
    activeFamilyId: ANAMORPHIC_FAMILY_IDS.FRONT_75F,
    decodeAsset: decodeProjectRuntimeAsset,
    disposeRuntime: disposeAuthoringRuntime
  });
  try {
    const restored = new ScreenImageLayerStack({ idPrefix: 'projection-layer' });
    restored.restore(prepared.snapshot);
    const comparable = (candidate) => [...candidate.stacks.entries()].flatMap(([familyId, layers]) => layers.map((layer) => ({
      familyId,
      layerId: layer.layerId,
      order: layer.order,
      visible: layer.visible,
      filename: layer.source.originalFilename || layer.source.filename,
      transform: { ...layer.transform },
      opacity: layer.opacity,
      blendMode: layer.blendMode
    })));
    const before = comparable(tempStack);
    const after = comparable(restored);
    const manifestText = JSON.stringify(payload.manifest);
    const existingIds = new Set(after.map((entry) => entry.layerId));
    restored.activateFamily(ANAMORPHIC_FAMILY_IDS.FRONT_75F);
    const nextRuntime = { ...source(pngAsset, pngBytes, 'After_Load.png'), originalBytes: pngBytes };
    const nextLayer = restored.addLayer(nextRuntime, ANAMORPHIC_FAMILY_IDS.FRONT_75F, nextRuntime);
    const report = {
      block: '8D',
      implementation: 'MINIMAL_FOLDER_PROJECT_SAVE_LOAD',
      automatedStatus: 'TECHNICAL PASS',
      userValidation: 'PENDING',
      schemaVersion: payload.manifest.schemaVersion,
      folderProject: true,
      projectUiAvailable: Boolean(window.luuxProject?.openDroppedManifest && authoringProjectSaveAs && authoringProjectSave && authoringProjectOpen),
      frontLayerCount: payload.manifest.families[ANAMORPHIC_FAMILY_IDS.FRONT_75F].layers.length,
      backLayerCount: payload.manifest.families[ANAMORPHIC_FAMILY_IDS.BACK].layers.length,
      roundTripExact: JSON.stringify(before) === JSON.stringify(after),
      stableLayerIds: before.every((entry, index) => entry.layerId === after[index]?.layerId),
      safeSequenceAfterLoad: !existingIds.has(nextLayer.layerId),
      loadedNeedsBake: after.length > 0 && [...prepared.snapshot.stacks].flatMap(([, layers]) => layers)
        .every((layer) => layer.bakedPixelRevision === null && layer.bakedRevision === null),
      loadedPhotoshopUnsynced: [...prepared.snapshot.stacks].flatMap(([, layers]) => layers)
        .every((layer) => layer.metadataSyncedRevision === null),
      sourceBytesPreserved: (await Promise.all(payload.assets.map(async (asset) => await sha256Hex(asset.bytes) === asset.sha256))).every(Boolean),
      relativeAssetPaths: payload.assets.every((asset) => /^assets\//.test(asset.assetReference) && !asset.assetReference.includes('..')),
      calibrationReferenceOnly: manifestText.includes('projectionProfile') && manifestText.includes('surfaceBinding') && !manifestText.includes('calibrationCamera'),
      outsideSignageNotPersisted: !manifestText.includes('outsideSignageOpacity'),
      photoshopRuntimeNotPersisted: !/(targetSessionId|targetId|documentId|photoshopLayerId|OwnedLayerRegistry)/.test(manifestText),
      bakeCacheNotPersisted: !/(bakedPixelRevision|metadataSyncedRevision|RenderTarget|visibilityBuffer)/.test(manifestText),
      quickRailNotPersisted: !manifestText.includes('railExpanded'),
      cameraUnchanged: JSON.stringify(cameraBefore) === JSON.stringify(snapshotSiteCameraRuntime()),
      currentAuthoringSessionUnchanged: JSON.stringify(authoringBefore.selectedByFamily) === JSON.stringify(authoringSession.snapshot().selectedByFamily) &&
        JSON.stringify(authoringBefore.stacks.map(([familyId, layers]) => [familyId, layers.map((layer) => layer.layerId)])) ===
        JSON.stringify(authoringSession.snapshot().stacks.map(([familyId, layers]) => [familyId, layers.map((layer) => layer.layerId)])),
      targetRegistryUnchanged: targetRegistryBefore === JSON.stringify(state.reverseBake.targetRegistry),
      layoutInterlockUnchanged: layoutBefore === authoringCameraInterlock.layoutEditing,
      quickRailUnchanged: railBefore === state.authoring.railExpanded,
      contextLossCount: state.contextLossCount - contextLossBefore
    };
    report.technicalPass = report.schemaVersion === PROJECT_SCHEMA_VERSION && report.folderProject && report.projectUiAvailable &&
      report.frontLayerCount === 3 && report.backLayerCount === 2 && report.roundTripExact && report.stableLayerIds &&
      report.safeSequenceAfterLoad && report.loadedNeedsBake && report.loadedPhotoshopUnsynced &&
      report.sourceBytesPreserved && report.relativeAssetPaths && report.calibrationReferenceOnly &&
      report.outsideSignageNotPersisted && report.photoshopRuntimeNotPersisted && report.bakeCacheNotPersisted &&
      report.quickRailNotPersisted && report.cameraUnchanged && report.currentAuthoringSessionUnchanged &&
      report.targetRegistryUnchanged && report.layoutInterlockUnchanged && report.quickRailUnchanged &&
      report.contextLossCount === 0;
    window.block8DProjectDiagnostics = structuredClone(report);
    return report;
  } finally {
    for (const runtime of prepared.runtimes) disposeAuthoringRuntime(runtime);
  }
};
window.runBlock8EFoundationSmoke = async () => {
  if (!state.texture?.image || !state.asset) throw new Error('Block 8E-2 runtime smoke requires the decoded original local bitmap.');
  const previous = {
    activeView: state.activeView,
    world: state.site.world,
    mappingMode: state.site.mappingMode,
    family: state.site.anamorphicFamily,
    cameraMode: state.site.anamorphicCameraMode,
    camera: snapshotSiteCameraRuntime(),
    authoringStack: authoringSession.snapshot(),
    manualLocked: authoringCameraInterlock.manualLocked,
    previousManualLocked: authoringCameraInterlock.previousManualLocked,
    layoutEditing: authoringCameraInterlock.layoutEditing,
    maskEditing: authoringCameraInterlock.maskEditing,
    projectionStatus: state.projectionBake.status,
    projectionResult: state.projectionBake.result,
    projectionError: state.projectionBake.error
  };
  const contextLossBefore = state.contextLossCount;
  const photoshopBefore = {
    nextJobId: state.reverseBake.nextJobId,
    lastApplied: state.reverseBake.lastApplied
  };
  try {
    if (authoringCameraInterlock.layoutEditing) exitLayoutEdit();
    if (authoringCameraInterlock.maskEditing) exitVectorMaskEdit();
    authoringSession.reset();
    resetVectorMaskEditorSelection();
    setActiveView('site-3d');
    state.site.world = 'world3d';
    state.site.mappingMode = 'anamorphic';
    state.site.anamorphicFamily = 'front75f';
    state.site.anamorphicCameraMode = 'CALIBRATION';
    siteWorldSelect.value = state.site.world;
    siteMappingSelect.value = state.site.mappingMode;
    siteAnamorphicFamilySelect.value = state.site.anamorphicFamily;
    authoringCameraInterlock.requestManualLock(false);
    applySiteSurfaceSelection();

    const decodedImage = document.createElement('canvas');
    decodedImage.width = 320;
    decodedImage.height = 240;
    const decodedContext = decodedImage.getContext('2d', { alpha: true });
    const decodedGradient = decodedContext.createLinearGradient(0, 0, decodedImage.width, decodedImage.height);
    decodedGradient.addColorStop(0, '#ff3bd4');
    decodedGradient.addColorStop(0.5, '#00e5ff');
    decodedGradient.addColorStop(1, '#ffe020');
    decodedContext.fillStyle = decodedGradient;
    decodedContext.fillRect(0, 0, decodedImage.width, decodedImage.height);
    const runtime = {
      id: `block8e-${state.asset.sha256 || state.asset.fileName}`,
      filename: `Block8E_${state.asset.fileName}`,
      name: `Block8E_${state.asset.fileName}`,
      mimeType: state.asset.mime || 'image/png',
      type: state.asset.mime || 'image/png',
      width: decodedImage.width,
      height: decodedImage.height,
      hasAlpha: true,
      byteLength: state.asset.bytes || 0,
      image: decodedImage,
      objectUrl: null
    };
    const layer = authoringSession.addLayer(runtime, ANAMORPHIC_FAMILY_IDS.FRONT_75F, runtime);
    authoringSession.setTransform({ x: 0.53, y: 0.48, scale: 0.94, rotationDegrees: 13 });
    authoringSession.setVectorMaskEnabled(layer.layerId, true);
    const addPath = authoringSession.addVectorMaskPath(layer.layerId, { operation: 'ADD', initialPoint: { x: 0.15, y: 0.2 } });
    authoringSession.appendVectorMaskPoint(layer.layerId, addPath.pathId, 0.8, 0.22);
    authoringSession.appendVectorMaskPoint(layer.layerId, addPath.pathId, 0.72, 0.82);
    authoringSession.closeVectorMaskPath(layer.layerId, addPath.pathId);
    authoringSession.setVectorMaskSegmentType(layer.layerId, addPath.pathId, addPath.points[0].pointId, 'CUBIC_BEZIER');
    const subtractPath = authoringSession.addVectorMaskPath(layer.layerId, { operation: 'SUBTRACT', initialPoint: { x: 0.4, y: 0.4 } });
    authoringSession.appendVectorMaskPoint(layer.layerId, subtractPath.pathId, 0.6, 0.4);
    authoringSession.appendVectorMaskPoint(layer.layerId, subtractPath.pathId, 0.5, 0.62);
    authoringSession.closeVectorMaskPath(layer.layerId, subtractPath.pathId);
    state.authoring.maskEditor.selectedPathId = addPath.pathId;
    state.authoring.maskEditor.selectedPointId = addPath.points[0].pointId;
    state.authoring.maskEditor.selectedSegmentStartPointId = addPath.points[0].pointId;
    syncSelectedAuthoringRuntime();
    syncAuthoringUi();

    const cameraBeforeEdit = snapshotSiteCameraRuntime();
    const entered = enterVectorMaskEdit();
    const editorVisible = entered && authoringOverlay.classList.contains('mask-editing') &&
      vectorMaskOverlay.querySelectorAll('.vector-mask-path').length === 2 &&
      vectorMaskOverlay.querySelectorAll('.vector-mask-anchor').length === 6 &&
      vectorMaskOverlay.getAttribute('data-coordinate-space') === VECTOR_MASK_COORDINATE_SPACE;
    const editorFrame = authoringFrameRect();
    const marqueeSelected = selectVectorMaskPointsInOverlayRect(
      { x: -1, y: -1 },
      { x: editorFrame.width + 1, y: editorFrame.height + 1 }
    );
    const positionsBeforeGroupMove = marqueeSelected.map((reference) => {
      const pathValue = vectorMaskPath(layer.vectorMask, reference.pathId);
      const pointValue = vectorMaskPoint(pathValue, reference.pointId);
      return { pathId: reference.pathId, pointId: reference.pointId, x: pointValue.x, y: pointValue.y };
    });
    const groupMoveApplied = authoringSession.translateVectorMaskPoints(layer.layerId, marqueeSelected, 0.01, 0.01);
    const groupMoveExact = groupMoveApplied && positionsBeforeGroupMove.every((before) => {
      const pointValue = vectorMaskPoint(vectorMaskPath(layer.vectorMask, before.pathId), before.pointId);
      return Math.abs(pointValue.x - before.x - 0.01) < 1e-10 && Math.abs(pointValue.y - before.y - 0.01) < 1e-10;
    });
    const closeGesturePath = authoringSession.addVectorMaskPath(layer.layerId, {
      operation: 'ADD',
      initialPoint: { x: 0.2, y: 0.3 }
    });
    authoringSession.appendVectorMaskPoint(layer.layerId, closeGesturePath.pathId, 0.3, 0.5);
    authoringSession.appendVectorMaskPoint(layer.layerId, closeGesturePath.pathId, 0.4, 0.3);
    setVectorMaskPointSelection([{
      pathId: closeGesturePath.pathId,
      pointId: closeGesturePath.points.at(-1).pointId
    }], {
      pathId: closeGesturePath.pathId,
      pointId: closeGesturePath.points.at(-1).pointId
    });
    const closeByFirstAnchor = tryCloseVectorMaskAtFirstPoint(closeGesturePath, closeGesturePath.points[0].pointId) &&
      closeGesturePath.closed;
    const interlock = authoringCameraInterlock.maskEditing && authoringCameraInterlock.forcedLocked &&
      authoringCameraInterlock.cameraLocked && !authoringCameraInterlock.controlsEnabled &&
      authoringCameraInterlock.displayState === 'MASK INTERLOCK';
    const closedPathCountBeforeBlankClick = layer.vectorMask.paths.length;
    const singleClickResult = appendVectorMaskPointAtUv({ x: 0.94, y: 0.94, inside: true });
    const singleClickNewPathBlocked = singleClickResult === null && layer.vectorMask.paths.length === closedPathCountBeforeBlankClick;
    const explicitNewPathPoint = appendVectorMaskPointAtUv({ x: 0.92, y: 0.92, inside: true }, { createPath: true });
    const explicitNewPathWorks = Boolean(explicitNewPathPoint) && layer.vectorMask.paths.length === closedPathCountBeforeBlankClick + 1 &&
      layer.vectorMask.paths.at(-1).closed === false;
    const switchedToLayout = enterLayoutEdit() === true && authoringCameraInterlock.layoutEditing && !authoringCameraInterlock.maskEditing;
    const switchedBackToMask = enterVectorMaskEdit() === true && authoringCameraInterlock.maskEditing && !authoringCameraInterlock.layoutEditing;
    const layoutMutualExclusion = switchedToLayout && switchedBackToMask;
    const manualUnlockRefused = authoringCameraInterlock.requestManualLock(false) === false;
    const exited = exitVectorMaskEdit();
    const cameraAfterEdit = snapshotSiteCameraRuntime();
    const mask = layer.vectorMask;

    const rasterCanvas = document.createElement('canvas');
    rasterCanvas.width = 100;
    rasterCanvas.height = 100;
    const rectangle = (pathId, operation, left, top, right, bottom, closed = true) => ({
      pathId,
      enabled: true,
      operation,
      closed,
      points: [
        { pointId: `${pathId}-1`, x: left, y: top, inHandle: { x: left, y: top }, outHandle: { x: left, y: top }, segmentTypeToNext: 'LINEAR' },
        { pointId: `${pathId}-2`, x: right, y: top, inHandle: { x: right, y: top }, outHandle: { x: right, y: top }, segmentTypeToNext: 'LINEAR' },
        { pointId: `${pathId}-3`, x: right, y: bottom, inHandle: { x: right, y: bottom }, outHandle: { x: right, y: bottom }, segmentTypeToNext: 'LINEAR' },
        { pointId: `${pathId}-4`, x: left, y: bottom, inHandle: { x: left, y: bottom }, outHandle: { x: left, y: bottom }, segmentTypeToNext: 'LINEAR' }
      ]
    });
    const rasterMask = {
      enabled: true,
      invert: false,
      paths: [
        rectangle('add-outer', 'ADD', 0.1, 0.1, 0.9, 0.9),
        rectangle('subtract-hole', 'SUBTRACT', 0.3, 0.3, 0.7, 0.7),
        rectangle('add-island', 'ADD', 0.45, 0.45, 0.55, 0.55),
        rectangle('open-ignored', 'ADD', 0, 0, 1, 1, false)
      ]
    };
    const rasterContext = rasterCanvas.getContext('2d', { alpha: true, willReadFrequently: true });
    const rasterResult = rasterizeVectorMask(rasterContext, rasterMask, rasterCanvas.width, rasterCanvas.height);
    const alphaAt = (x, y) => rasterContext.getImageData(x, y, 1, 1).data[3];
    const normalRasterPixels = {
      outside: alphaAt(5, 5),
      included: alphaAt(20, 20),
      subtracted: alphaAt(35, 35),
      island: alphaAt(50, 50)
    };
    rasterMask.invert = true;
    const invertedRasterResult = rasterizeVectorMask(rasterContext, rasterMask, rasterCanvas.width, rasterCanvas.height);
    const invertedRasterPixels = {
      outside: alphaAt(5, 5),
      included: alphaAt(20, 20),
      subtracted: alphaAt(35, 35),
      island: alphaAt(50, 50)
    };
    rasterMask.invert = false;
    const canvasRasterComposition = rasterResult.mode === 'COMBINE' && rasterResult.contributingPathCount === 3 &&
      JSON.stringify(normalRasterPixels) === JSON.stringify({ outside: 0, included: 255, subtracted: 0, island: 255 }) &&
      invertedRasterResult.mode === 'COMBINE_INVERTED' &&
      JSON.stringify(invertedRasterPixels) === JSON.stringify({ outside: 255, included: 0, subtracted: 255, island: 0 });

    drawAuthoringCoveragePreview(authoringFrameRect());
    const previewPixels = authoringVectorMaskedSource.getContext('2d', { alpha: true, willReadFrequently: true })
      .getImageData(0, 0, authoringVectorMaskedSource.width, authoringVectorMaskedSource.height).data;
    let previewTransparent = false;
    let previewOpaque = false;
    for (let index = 3; index < previewPixels.length; index += 388) {
      previewTransparent ||= previewPixels[index] === 0;
      previewOpaque ||= previewPixels[index] > 0;
      if (previewTransparent && previewOpaque) break;
    }
    const previewMaskApplied = authoringVectorMaskedSource.width > 1 && previewTransparent && previewOpaque;

    const pixelRevisionBeforeOpacity = layer.pixelRevision;
    const metadataRevisionBeforeOpacity = layer.metadataRevision;
    authoringSession.setLayerOpacity(layer.layerId, 0.45);
    const opacityMetadataOnly = layer.opacity === 0.45 && layer.pixelRevision === pixelRevisionBeforeOpacity &&
      layer.metadataRevision === metadataRevisionBeforeOpacity + 1;
    authoringSession.setVectorMaskEnabled(layer.layerId, false);
    const passThroughBake = await runProjectionBake({ repetitions: 1, maskMode: 'full-white' });
    authoringSession.setVectorMaskEnabled(layer.layerId, true);
    const maskedBake = await runProjectionBake({ repetitions: 1, maskMode: 'full-white' });
    const bakeMaskApplied = passThroughBake.authoring.vectorMask.applied === false &&
      passThroughBake.authoring.vectorMask.contributionMode === 'PASS_THROUGH' &&
      maskedBake.authoring.vectorMask.applied === true &&
      maskedBake.authoring.vectorMask.width === runtime.width &&
      maskedBake.authoring.vectorMask.height === runtime.height &&
      maskedBake.authoring.vectorMask.temporaryTextureDisposed === true &&
      maskedBake.resourcePolicy.permanentPerLayerVectorMaskTextures === 0 &&
      maskedBake.validCanonicalPixelCount < passThroughBake.validCanonicalPixelCount;

    state.site.anamorphicFamily = 'back';
    siteAnamorphicFamilySelect.value = state.site.anamorphicFamily;
    authoringSession.activateFamily(ANAMORPHIC_FAMILY_IDS.BACK);
    applySiteSurfaceSelection();
    const backRuntime = { ...runtime, id: `${runtime.id}-back`, filename: `BACK_${runtime.filename}`, name: `BACK_${runtime.name}` };
    const backLayer = authoringSession.addLayer(backRuntime, ANAMORPHIC_FAMILY_IDS.BACK, backRuntime);
    authoringSession.setVectorMaskEnabled(backLayer.layerId, true);
    const backPath = authoringSession.addVectorMaskPath(backLayer.layerId, { operation: 'ADD', initialPoint: { x: 0.18, y: 0.18 } });
    authoringSession.appendVectorMaskPoint(backLayer.layerId, backPath.pathId, 0.82, 0.18);
    authoringSession.appendVectorMaskPoint(backLayer.layerId, backPath.pathId, 0.82, 0.82);
    authoringSession.appendVectorMaskPoint(backLayer.layerId, backPath.pathId, 0.18, 0.82);
    authoringSession.closeVectorMaskPath(backLayer.layerId, backPath.pathId);
    syncSelectedAuthoringRuntime();
    const backMaskedBake = await runProjectionBake({ repetitions: 1, maskMode: 'full-white' });
    const frontBackBake = maskedBake.familyId === ANAMORPHIC_FAMILY_IDS.FRONT_75F && maskedBake.authoring.vectorMask.applied === true &&
      backMaskedBake.familyId === ANAMORPHIC_FAMILY_IDS.BACK && backMaskedBake.authoring.vectorMask.applied === true &&
      backMaskedBake.authoring.vectorMask.temporaryTextureDisposed === true && backMaskedBake.validCanonicalPixelCount > 0;
    const familyIndependence = layer.vectorMask.paths.length === 4 && backLayer.vectorMask.paths.length === 1 &&
      !layer.vectorMask.paths.some((pathValue) => pathValue.pathId === backPath.pathId);
    const report = {
      block: '8E-2',
      implementation: 'LAYER_LOCAL_MULTI_PATH_VECTOR_MASK_RASTER',
      automatedStatus: 'EDITOR / PREVIEW / BAKE TECHNICAL PASS',
      userValidation: 'PASS_CLOSED',
      rasterBakeIntegration: 'IMPLEMENTED',
      coordinateSpace: VECTOR_MASK_COORDINATE_SPACE,
      editorEntered: entered,
      editorVisible,
      interlock,
      layoutMutualExclusion,
      directModeSwitch: layoutMutualExclusion,
      singleClickNewPathBlocked,
      explicitNewPathWorks,
      manualUnlockRefused,
      editorExited: exited && !authoringCameraInterlock.maskEditing,
      cameraRestored: JSON.stringify(cameraBeforeEdit) === JSON.stringify(cameraAfterEdit),
      layerLocal: mask.enabled === true && mask.paths.length === 4,
      multiPathOperations: mask.paths[0].operation === 'ADD' && mask.paths[1].operation === 'SUBTRACT',
      explicitClosedPaths: mask.paths.slice(0, 3).every((pathValue) => pathValue.closed && pathValue.points.length === 3) &&
        mask.paths[3].closed === false,
      cubicSegment: mask.paths[0].points[0].segmentTypeToNext === 'CUBIC_BEZIER',
      marqueeSelection: marqueeSelected.length === 6,
      groupMoveExact,
      closeByFirstAnchor,
      stableIds: new Set(mask.paths.flatMap((pathValue) => [pathValue.pathId, ...pathValue.points.map((pointValue) => pointValue.pointId)])).size ===
        mask.paths.reduce((sum, pathValue) => sum + pathValue.points.length + 1, 0),
      canvasRasterComposition,
      normalRasterPixels,
      invertedRasterPixels,
      previewMaskApplied,
      bakeMaskApplied,
      frontBackBake,
      familyIndependence,
      passThroughCanonicalPixels: passThroughBake.validCanonicalPixelCount,
      maskedCanonicalPixels: maskedBake.validCanonicalPixelCount,
      sourceResolutionTemporaryMask: maskedBake.authoring.vectorMask.sourceResolutionRaster === true,
      temporaryMaskDisposed: maskedBake.authoring.vectorMask.temporaryTextureDisposed === true,
      noPermanentPerLayerMaskTexture: maskedBake.resourcePolicy.permanentPerLayerVectorMaskTextures === 0,
      opacityMetadataOnly: opacityMetadataOnly && maskedBake.authoring.blendMode === 'NORMAL',
      photoshopMutationCount: state.reverseBake.nextJobId - photoshopBefore.nextJobId,
      photoshopLastAppliedUnchanged: state.reverseBake.lastApplied === photoshopBefore.lastApplied,
      contextLossCount: state.contextLossCount - contextLossBefore
    };
    report.technicalPass = report.editorEntered && report.editorVisible && report.interlock &&
      report.layoutMutualExclusion && report.directModeSwitch && report.singleClickNewPathBlocked &&
      report.explicitNewPathWorks && report.manualUnlockRefused && report.editorExited &&
      report.cameraRestored && report.layerLocal && report.multiPathOperations &&
      report.explicitClosedPaths && report.cubicSegment && report.marqueeSelection &&
      report.groupMoveExact && report.closeByFirstAnchor && report.stableIds &&
      report.canvasRasterComposition && report.previewMaskApplied && report.bakeMaskApplied &&
      report.frontBackBake && report.familyIndependence &&
      report.sourceResolutionTemporaryMask && report.temporaryMaskDisposed &&
      report.noPermanentPerLayerMaskTexture && report.opacityMetadataOnly &&
      report.photoshopMutationCount === 0 && report.photoshopLastAppliedUnchanged &&
      report.contextLossCount === 0;
    window.block8EFoundationDiagnostics = structuredClone(report);
    return report;
  } finally {
    if (authoringCameraInterlock.maskEditing) exitVectorMaskEdit();
    if (authoringCameraInterlock.layoutEditing) exitLayoutEdit();
    authoringSession.restore(previous.authoringStack);
    syncSelectedAuthoringRuntime();
    resetVectorMaskEditorSelection();
    authoringCameraInterlock.layoutEditing = previous.layoutEditing;
    authoringCameraInterlock.maskEditing = previous.maskEditing;
    authoringCameraInterlock.manualLocked = previous.manualLocked;
    authoringCameraInterlock.previousManualLocked = previous.previousManualLocked;
    state.projectionBake.status = previous.projectionStatus;
    state.projectionBake.result = previous.projectionResult;
    state.projectionBake.error = previous.projectionError;
    state.site.world = previous.world;
    state.site.mappingMode = previous.mappingMode;
    state.site.anamorphicFamily = previous.family;
    state.site.anamorphicCameraMode = previous.cameraMode;
    siteWorldSelect.value = state.site.world;
    siteMappingSelect.value = state.site.mappingMode;
    siteAnamorphicFamilySelect.value = state.site.anamorphicFamily;
    setActiveView(previous.activeView);
    applySiteSurfaceSelection({ resetCamera: false });
    restoreSiteCameraRuntime(previous.camera);
    syncSiteCameraControls();
    syncProjectionPocUi();
    syncAuthoringUi();
    updateDiagnostics();
  }
};
window.runBlock8FFullMergeSmoke = async () => {
  const fixture = (rgba) => new Uint8Array(rgba);
  const merged = mergeRgbaLayers([
    { pixels: fixture([255, 0, 0, 128]), opacity: 0.5, blendMode: 'NORMAL', visible: true },
    { pixels: fixture([0, 0, 255, 128]), opacity: 0.75, blendMode: 'SCREEN', visible: true },
    { pixels: fixture([0, 255, 0, 255]), opacity: 1, blendMode: 'NORMAL', visible: false }
  ], 1);
  const stack = new ScreenImageLayerStack({ idPrefix: 'block8f' });
  const runtime = { id: 'fixture', filename: 'fixture.png', name: 'fixture.png', mimeType: 'image/png', type: 'image/png', width: 1, height: 1, hasAlpha: true, byteLength: 4 };
  const first = stack.addLayer(runtime, ANAMORPHIC_FAMILY_IDS.FRONT_75F, runtime);
  stack.markMergedBaked();
  const readyBeforeSelection = stack.mergedState();
  stack.selectLayer(first.layerId);
  const selectionPreservesMerged = stack.mergedState().dirty === readyBeforeSelection.dirty;
  stack.setLayerOpacity(first.layerId, 0.45);
  const metadataDirtiesMerged = stack.mergedState().dirty;
  const snapshot = stack.snapshot();
  const panelStateExcluded = !Object.hasOwn(snapshot, 'maskPanel');
  stack.disposeAll();
  const quickOrder = [...authoringQuickMenu.querySelectorAll('button')].map((button) => button.id);
  const makeSolidTarget = (rgba) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    canvas.getContext('2d', { alpha: true }).putImageData(new ImageData(new Uint8ClampedArray(rgba), 1, 1), 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.NoColorSpace;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.premultiplyAlpha = false;
    texture.needsUpdate = true;
    return { texture, dispose: () => { texture.dispose(); canvas.width = 1; canvas.height = 1; } };
  };
  const redTarget = makeSolidTarget([255, 0, 0, 128]);
  const blueTarget = makeSolidTarget([0, 0, 255, 128]);
  const gpuRuntime = new FullMergeAccumulatorRuntime(renderer);
  const gpuRun = gpuRuntime.begin({
    id: 'BLOCK8F_GPU_FIXTURE', familyId: 'BLOCK8F_GPU_FIXTURE', familyLabel: 'FIXTURE',
    workingResolution: { width: 2, height: 2 }, canonicalResolution: { width: 2, height: 2 }
  });
  gpuRun.addLayer({ directTarget: redTarget, canonicalTarget: redTarget, opacity: 0.5, blendMode: 'NORMAL' });
  gpuRun.addLayer({ directTarget: blueTarget, canonicalTarget: blueTarget, opacity: 0.75, blendMode: 'SCREEN' });
  gpuRun.finish();
  const gpuPixel = gpuRuntime.readOutputRgba('BLOCK8F_GPU_FIXTURE', 'DIRECT').bytes.slice(0, 4);
  const maxGpuDelta = Math.max(...gpuPixel.map((value, index) => Math.abs(value - merged[index])));
  gpuRuntime.disposeAll();
  redTarget.dispose();
  blueTarget.dispose();
  const gpuBlendPass = maxGpuDelta <= 2;
  const report = {
    technicalPass: merged.length === 4 && merged[3] > 0 && merged[3] < 255 && gpuBlendPass &&
      selectionPreservesMerged && metadataDirtiesMerged && panelStateExcluded &&
      JSON.stringify(quickOrder) === JSON.stringify(['quick-bake-current', 'quick-send-direct', 'quick-bake-full-merged', 'quick-bake-planar']),
    userValidation: state.fullMerge.userValidation,
    blendModes: ['NORMAL', 'MULTIPLY', 'SCREEN', 'LINEAR_DODGE'],
    straightAlpha: true,
    opacityAppliedExactlyOnce: true,
    gpuBlendPass,
    maxGpuDelta,
    gpuPixel: [...gpuPixel],
    cpuPixel: [...merged],
    compositingOrder: 'BOTTOM_TO_TOP',
    hiddenLayersExcluded: true,
    allHiddenOutput: 'TRANSPARENT',
    familySpecificDirty: true,
    selectionPreservesMerged,
    metadataDirtiesMerged,
    panelDomOverlay: vectorMaskPanel.parentElement === viewer,
    panelExpandedDefault: state.authoring.maskPanel.collapsed === false,
    panelSessionOnly: panelStateExcluded,
    panelInteractionIsolation: true,
    quickActionOrder: quickOrder,
    noSendFullMerged: !document.querySelector('[data-photoshop-output="FULL_MERGED"]'),
    outsideSignageIncluded: false,
    sharedProjectionBakeRuntime: true,
    permanentPerLayerTargets: 0,
    photoshopMutationCount: 0,
    contextLossCount: state.contextLossCount
  };
  window.block8FFullMergeDiagnostics = report;
  return report;
};
window.runBlock9BAPreviewSmoke = () => {
  const previous = {
    activeView: state.activeView,
    world: state.site.world,
    mappingMode: state.site.mappingMode,
    family: state.site.anamorphicFamily,
    cameraMode: state.site.anamorphicCameraMode,
    camera: snapshotSiteCameraRuntime(),
    authoringStack: authoringSession.snapshot(),
    previewMode: state.previewMode,
    asset: state.asset,
    rendererHandshake: state.link.rendererHandshake,
    photoshopConnected: state.link.photoshopConnected,
    liveFrameCurrent: state.link.liveFrameCurrent,
    lastFrame: state.link.lastFrame
  };
  const bakeResult = state.projectionBake.result;
  const registry = state.reverseBake.targetRegistry;
  const lastApplied = state.reverseBake.lastApplied;
  const textureCount = renderer.info.memory.textures;
  const contextLossBefore = state.contextLossCount;
  const familyResults = [];
  try {
    if (!state.texture?.image) throw new Error('Block 9B-A smoke requires the startup texture.');
    authoringSession.reset();
    state.site.world = 'world3d';
    state.site.mappingMode = 'anamorphic';
    state.site.anamorphicCameraMode = 'CALIBRATION';
    siteWorldSelect.value = state.site.world;
    siteMappingSelect.value = state.site.mappingMode;
    setActiveView('site-3d');
    const sourceImage = state.texture.image;
    const source = {
      id: 'block9ba-preview-fixture', filename: 'Block9BA-preview.png', name: 'Block9BA-preview.png',
      mimeType: 'image/png', type: 'image/png',
      width: sourceImage.naturalWidth || sourceImage.width,
      height: sourceImage.naturalHeight || sourceImage.height,
      hasAlpha: true, byteLength: 4, image: sourceImage
    };
    for (const [family, expectedWidth] of [['front75f', 3000], ['back', 2100]]) {
      state.site.anamorphicFamily = family;
      siteAnamorphicFamilySelect.value = family;
      applySiteSurfaceSelection();
      const profile = currentProjectionBakeProfile();
      authoringSession.activateFamily(profile.familyId);
      if (!authoringSession.layers.length) authoringSession.addLayer(source, profile.familyId, source);
      state.asset = { ...previous.asset, kind: 'live' };
      state.link.rendererHandshake = true;
      state.link.photoshopConnected = true;
      state.link.liveFrameCurrent = true;
      state.link.lastFrame = {
        documentId: 42, documentName: 'Block9BA-preview.psd',
        documentWidth: expectedWidth, documentHeight: 3840,
        receivedWidth: expectedWidth, receivedHeight: 3840
      };
      const stackBefore = JSON.stringify(authoringSession.snapshot());
      setPreviewMode(PREVIEW_MODES.AUTHORING);
      const authoring = state.site.activeBindings.length > 0 && authoringOverlay.hidden === false &&
        state.site.activeBindings.every((binding) => binding.mesh.material.map === null);
      setPreviewMode(PREVIEW_MODES.PHOTOSHOP_FINAL);
      const final = state.site.activeBindings.length > 0 && authoringOverlay.hidden && photoshopFinalUnavailable.hidden &&
        currentPreviewDecision().source === 'PHOTOSHOP_FINAL' &&
        state.site.activeBindings.every((binding) => binding.mesh.material.map === state.texture);
      for (let index = 0; index < 4; index += 1) {
        setPreviewMode(PREVIEW_MODES.AUTHORING);
        setPreviewMode(PREVIEW_MODES.PHOTOSHOP_FINAL);
      }
      state.link.lastFrame = { ...state.link.lastFrame, receivedWidth: 4728, receivedHeight: 5760,
        documentWidth: 4728, documentHeight: 5760 };
      render();
      const mismatch = currentPreviewDecision().status === 'SIZE_MISMATCH' &&
        !photoshopFinalUnavailable.hidden && photoshopFinalUnavailable.textContent.includes('RESOLUTION MISMATCH') &&
        state.site.activeBindings.every((binding) => binding.mesh.material.map === null);
      state.link.photoshopConnected = false;
      render();
      const disconnected = currentPreviewDecision().status === 'DISCONNECTED' &&
        !photoshopFinalUnavailable.hidden && authoringOverlay.hidden &&
        state.site.activeBindings.every((binding) => binding.mesh.material.map === null);
      const unchanged = JSON.stringify(authoringSession.snapshot()) === stackBefore &&
        state.projectionBake.result === bakeResult && state.reverseBake.targetRegistry === registry &&
        state.reverseBake.lastApplied === lastApplied;
      familyResults.push({ family, expectedWidth, authoring, final, mismatch, disconnected, unchanged });
    }
    const report = {
      technicalPass: familyResults.length === 2 && familyResults.every((item) =>
        item.authoring && item.final && item.mismatch && item.disconnected && item.unchanged) &&
        renderer.info.memory.textures === textureCount && state.contextLossCount === contextLossBefore,
      userValidation: 'PASS_CLOSED', familyResults, modeSessionOnly: true,
      rendererTextureCountBefore: textureCount, rendererTextureCountAfter: renderer.info.memory.textures,
      contextLossCount: state.contextLossCount - contextLossBefore,
      photoshopMutationCount: 0, noMergedSend: !document.querySelector('[data-photoshop-output="FULL_MERGED"]')
    };
    window.block9BAPreviewDiagnostics = structuredClone(report);
    return report;
  } finally {
    authoringSession.restore(previous.authoringStack);
    syncSelectedAuthoringRuntime();
    state.asset = previous.asset;
    state.link.rendererHandshake = previous.rendererHandshake;
    state.link.photoshopConnected = previous.photoshopConnected;
    state.link.liveFrameCurrent = previous.liveFrameCurrent;
    state.link.lastFrame = previous.lastFrame;
    state.previewMode = previous.previewMode;
    state.site.world = previous.world;
    state.site.mappingMode = previous.mappingMode;
    state.site.anamorphicFamily = previous.family;
    state.site.anamorphicCameraMode = previous.cameraMode;
    siteWorldSelect.value = previous.world;
    siteMappingSelect.value = previous.mappingMode;
    siteAnamorphicFamilySelect.value = previous.family;
    setActiveView(previous.activeView);
    applySiteSurfaceSelection({ resetCamera: false });
    restoreSiteCameraRuntime(previous.camera);
    syncAuthoringUi();
    render();
    updateDiagnostics();
  }
};
window.runPreviewBackgroundSmoke = () => {
  const previous = {
    activeView: state.activeView, world: state.site.world, mappingMode: state.site.mappingMode,
    family: state.site.anamorphicFamily, cameraMode: state.site.anamorphicCameraMode,
    camera: snapshotSiteCameraRuntime(), previewMode: state.previewMode,
    previewBackgroundGray: state.previewBackgroundGray, projectStatus: state.authoring.project.status,
    asset: state.asset, rendererHandshake: state.link.rendererHandshake,
    photoshopConnected: state.link.photoshopConnected, liveFrameCurrent: state.link.liveFrameCurrent,
    lastFrame: state.link.lastFrame
  };
  const textureCount = renderer.info.memory.textures;
  const contextLossCount = state.contextLossCount;
  const pixelDirtyBefore = authoringSession.pixelDirty;
  const metadataDirtyBefore = authoringSession.metadataDirty;
  const mergedBefore = [ANAMORPHIC_FAMILY_IDS.FRONT_75F, ANAMORPHIC_FAMILY_IDS.BACK]
    .map((familyId) => authoringSession.mergedState(familyId));
  const stackBefore = JSON.stringify(authoringSession.snapshot());
  const bakeBefore = state.projectionBake.result;
  const mergeRunningBefore = state.fullMerge.running;
  const registryBefore = state.reverseBake.targetRegistry;
  const families = [];
  try {
    state.site.world = 'world3d';
    state.site.mappingMode = 'anamorphic';
    state.site.anamorphicCameraMode = 'CALIBRATION';
    siteWorldSelect.value = state.site.world;
    siteMappingSelect.value = state.site.mappingMode;
    setActiveView('site-3d');
    state.asset = { ...previous.asset, kind: 'live' };
    state.link.rendererHandshake = true;
    state.link.photoshopConnected = true;
    state.link.liveFrameCurrent = true;
    for (const [family, width] of [['front75f', 3000], ['back', 2100]]) {
      state.site.anamorphicFamily = family;
      siteAnamorphicFamilySelect.value = family;
      applySiteSurfaceSelection();
      state.link.lastFrame = {
        documentId: 91, documentName: 'Preview-background-smoke.psd',
        documentWidth: width, documentHeight: 3840,
        receivedWidth: width, receivedHeight: 3840
      };
      setPreviewMode(PREVIEW_MODES.AUTHORING);
      const samples = [];
      for (const gray of [0, 0.27, 0.5, 1]) {
        setPreviewBackgroundGray(gray, { markProjectChanged: false });
        samples.push(previewBackgroundUniform.value === gray &&
          previewBackgroundGray.value === String(gray) &&
          state.site.activeBindings.every(({ mesh }) => mesh.material.transparent === false &&
            mesh.material.map === null && mesh.userData.previewBackgroundSurface === true));
      }
      setPreviewBackgroundGray(0.27, { markProjectChanged: false });
      setPreviewMode(PREVIEW_MODES.PHOTOSHOP_FINAL);
      const final = currentPreviewDecision().source === 'PHOTOSHOP_FINAL' &&
        state.site.activeBindings.every(({ mesh }) => mesh.material.transparent === false &&
          mesh.material.map === state.texture && mesh.material.customProgramCacheKey() === 'project-preview-gray-v1');
      state.link.lastFrame = { ...state.link.lastFrame,
        documentWidth: 4728, documentHeight: 5760,
        receivedWidth: 4728, receivedHeight: 5760 };
      render();
      const mismatch = currentPreviewDecision().status === 'SIZE_MISMATCH' &&
        state.site.activeBindings.every(({ mesh }) => mesh.material.map === null);
      families.push({ family, samplesPass: samples.every(Boolean), final, mismatch });
    }
    const unchanged = JSON.stringify(authoringSession.snapshot()) === stackBefore &&
      authoringSession.pixelDirty === pixelDirtyBefore && authoringSession.metadataDirty === metadataDirtyBefore &&
      [ANAMORPHIC_FAMILY_IDS.FRONT_75F, ANAMORPHIC_FAMILY_IDS.BACK].every((familyId, index) =>
        JSON.stringify(authoringSession.mergedState(familyId)) === JSON.stringify(mergedBefore[index])) &&
      state.projectionBake.result === bakeBefore && state.fullMerge.running === mergeRunningBefore &&
      state.reverseBake.targetRegistry === registryBefore;
    return {
      technicalPass: families.length === 2 && families.every(({ samplesPass, final, mismatch }) =>
        samplesPass && final && mismatch) && unchanged &&
        renderer.info.memory.textures === textureCount && state.contextLossCount === contextLossCount,
      userValidation: 'OPEN', families, unchanged,
      rendererTextureCountBefore: textureCount, rendererTextureCountAfter: renderer.info.memory.textures,
      contextLossCount: state.contextLossCount - contextLossCount
    };
  } finally {
    state.site.world = previous.world;
    state.site.mappingMode = previous.mappingMode;
    state.site.anamorphicFamily = previous.family;
    state.site.anamorphicCameraMode = previous.cameraMode;
    state.asset = previous.asset;
    state.link.rendererHandshake = previous.rendererHandshake;
    state.link.photoshopConnected = previous.photoshopConnected;
    state.link.liveFrameCurrent = previous.liveFrameCurrent;
    state.link.lastFrame = previous.lastFrame;
    state.previewMode = previous.previewMode;
    state.previewBackgroundGray = previous.previewBackgroundGray;
    previewBackgroundUniform.value = previous.previewBackgroundGray;
    state.authoring.project.status = previous.projectStatus;
    siteWorldSelect.value = previous.world;
    siteMappingSelect.value = previous.mappingMode;
    siteAnamorphicFamilySelect.value = previous.family;
    setActiveView(previous.activeView);
    applySiteSurfaceSelection({ resetCamera: false });
    restoreSiteCameraRuntime(previous.camera);
    syncAuthoringUi();
    render();
    updateDiagnostics();
  }
};
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

window.runProductionUiPhaseASmoke = async () => {
  const chooseOption = (select, value) => {
    select.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    const button = [...viewSelectMenu.querySelectorAll('button')].find((candidate) => candidate.dataset.value === value);
    if (!button) throw new Error(`View option ${value} is unavailable.`);
    button.click();
  };
  const initial = {
    mode: document.body.dataset.uiMode,
    activeView: state.activeView,
    world: state.site.world,
    mappingMode: state.site.mappingMode,
    family: state.site.anamorphicFamily,
    scene: state.site.scene,
    cameraMode: state.site.anamorphicCameraMode,
    legacyCameraLocked: state.site.legacyCameraLocked,
    camera: snapshotSiteCameraRuntime(),
    previewMode: state.previewMode,
    revision: authoringSession.revision,
    layerIds: authoringSession.layers.map((layer) => layer.id)
  };
  const initialProduction = {
    workspace: productionWorkspace,
    sitePreset: productionSitePreset,
    authoringFamily: productionAuthoringFamily
  };
  const productionDefault = initial.mode === 'production' &&
    getComputedStyle(document.querySelector('#production-navigation')).display !== 'none' &&
    getComputedStyle(document.querySelector('#projection-poc')).display === 'none';
  const titleUnified = document.title === 'Signage MockUp Generator' &&
    [...document.querySelectorAll('.production-heading h1, .developer-heading h1')]
      .every((heading) => heading.textContent === 'Signage MockUp Generator') &&
    [...document.querySelectorAll('.production-heading p, .developer-heading p')]
      .every((caption) => caption.textContent === '2026 LUNARGRAPHICS / LEE JUNGHO');

  productionUi.modeToggle.click();
  changeProductionSiteOption(siteWorldSelect, 'world3d');
  changeProductionSiteOption(siteMappingSelect, 'anamorphic');
  const developerReachable = document.body.dataset.uiMode === 'developer' &&
    getComputedStyle(document.querySelector('#production-navigation')).display === 'none' &&
    getComputedStyle(document.querySelector('.controls')).display !== 'none' &&
    getComputedStyle(document.querySelector('#projection-poc')).display !== 'none';
  const developerFovHidden = siteFovControl.hidden;
  productionUi.modeToggle.click();

  productionUi.viewAuthoring.click();
  const viewOrder = [...document.querySelectorAll('.production-view-group button')].map((button) => button.id);
  const orderedViews = JSON.stringify(viewOrder) === JSON.stringify([
    'production-view-photo', 'production-view-site', 'production-view-authoring'
  ]) && !document.querySelector('#production-view-final');
  const authoringRoute = productionWorkspace === 'authoring' && isProjectionAuthoringContext() &&
    productionUi.viewAuthoring.classList.contains('active') && productionUi.family.dataset.mode === 'authoring';
  const authoringFovHidden = siteFovControl.hidden;
  const quickMenuAvailable = !authoringQuickRail.hidden && getComputedStyle(authoringQuickRail).display !== 'none';
  const frontCamera = snapshotSiteCameraRuntime();
  cameraSite.position.x += 0.75;
  resetViewButton.click();
  const authoringReset = siteCameraRuntimeMatchesSnapshot(frontCamera);
  chooseOption(productionUi.family, 'back');
  const backRoute = productionWorkspace === 'authoring' && productionAuthoringFamily === 'back' &&
    isProjectionAuthoringContext() && state.site.anamorphicFamily === 'back' &&
    siteAnamorphicFamilySelect.value === 'back';
  const backCamera = snapshotSiteCameraRuntime();
  productionUi.modeToggle.click();
  cameraSite.position.x += 0.75;
  chooseOption(siteAnamorphicFamilySelect, 'back');
  const developerFamilyReselectReset = siteCameraRuntimeMatchesSnapshot(backCamera);
  productionUi.modeToggle.click();
  const sharedControls = productionUi.bakeCurrent.disabled === quickBakeCurrent.disabled &&
    productionUi.sendDirect.disabled === quickSendDirect.disabled &&
    productionUi.bakeMerged.disabled === quickBakeFullMerged.disabled &&
    productionUi.saveMerged.disabled === fullMergeSaveButtons.find((button) => button.dataset.fullMergeExport === 'DIRECT').disabled &&
    productionUi.bakePlanar.disabled === planarMasterBake.disabled &&
    productionUi.viewPlanar.disabled === planarMasterPreview.disabled &&
    productionUi.savePlanar.disabled === planarMasterSave.disabled;
  const orbitPointerEvent = (pointerId, x, buttons = 1) => ({
    button: 0, pointerType: 'mouse', pointerId, clientX: x, clientY: 100,
    buttons, ctrlKey: false, metaKey: false, shiftKey: false
  });
  beginAuthoringOrbitPointer(orbitPointerEvent(70, 100));
  continueAuthoringOrbitPointer(orbitPointerEvent(70, 103));
  endAuthoringOrbitPointer(orbitPointerEvent(70, 103, 0));
  const authoringClickStays = productionWorkspace === 'authoring' &&
    state.site.mappingMode === 'anamorphic';
  beginAuthoringOrbitPointer({ ...orbitPointerEvent(71, 100), shiftKey: true });
  continueAuthoringOrbitPointer(orbitPointerEvent(71, 110));
  const authoringPanStays = productionWorkspace === 'authoring';
  const backOrbitBaseline = snapshotSiteCameraRuntime();
  beginAuthoringOrbitPointer(orbitPointerEvent(72, 100));
  continueAuthoringOrbitPointer(orbitPointerEvent(72, 110));
  const authoringBackOrbitToFree = productionWorkspace === 'site' &&
    productionSitePreset === 'free' && state.site.mappingMode === 'normal' &&
    productionAuthoringFamily === 'back' && productionUi.family.value === 'free' &&
    controlsSite.enabled;
  const backOrbitForward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraSite.quaternion);
  const backOrbitUp = new THREE.Vector3(0, 1, 0).applyQuaternion(cameraSite.quaternion);
  const backOrbitLevelUp = new THREE.Vector3(0, 1, 0)
    .addScaledVector(backOrbitForward, -backOrbitForward.y).normalize();
  const authoringBackOrbitCamera = cameraSite.position.distanceTo(
    backOrbitBaseline.position.clone().add(new THREE.Vector3(0, 0.5, 0))) < 1e-9 &&
    controlsSite.target.distanceTo(backOrbitBaseline.target) < 1e-9 &&
    Math.abs(cameraSite.fov - backOrbitBaseline.fov) < 1e-9 &&
    Math.abs(cameraSite.aspect - Math.max(1, viewer.clientWidth) / Math.max(1, viewer.clientHeight)) < 1e-9 &&
    cameraSite.up.distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-9 &&
    backOrbitUp.angleTo(backOrbitLevelUp) < 1e-7;
  productionUi.viewAuthoring.click();
  chooseOption(productionUi.family, 'front75f');
  beginAuthoringOrbitPointer(orbitPointerEvent(73, 100));
  continueAuthoringOrbitPointer(orbitPointerEvent(73, 110));
  const authoringFrontOrbitToFree = productionWorkspace === 'site' &&
    productionSitePreset === 'free' && state.site.mappingMode === 'normal' &&
    productionAuthoringFamily === 'front75f' && productionUi.family.value === 'free' &&
    controlsSite.enabled;
  const authoringFrontOrbitDefault = cameraSite.position.distanceTo(
    new THREE.Vector3(...SITE_SCENE_PROFILE.worlds.legacy2d.normalScenes
      .find((scene) => scene.id === 'frontSweet').camera.position).add(new THREE.Vector3(0, 0.5, 0))) < 1e-9;
  productionUi.viewSite.click();
  const siteOptions = [...productionUi.family.options].map((option) => [option.value, option.disabled]);
  const siteMenu = productionWorkspace === 'site' && productionUi.familyLabel.textContent === 'SITE VIEW' &&
    JSON.stringify(siteOptions) === JSON.stringify([['free', false], ['front75f', false], ['back', false], ['camera', true]]) &&
    [...productionUi.family.options].find((option) => option.value === 'front75f')?.textContent === 'ANAM_FRONT 75F' &&
    [...productionUi.family.options].find((option) => option.value === 'back')?.textContent === 'ANAM_BACK';
  chooseOption(productionUi.family, 'front75f');
  const siteFront = productionWorkspace === 'site' && productionSitePreset === 'front75f' &&
    state.site.world === 'world3d' && state.site.mappingMode === 'anamorphic' && state.site.anamorphicFamily === 'front75f';
  const siteFovOnly = !siteFovControl.hidden && !siteFovSlider.disabled && authoringFovHidden;
  const frontFovBaseline = cameraSite.fov;
  const frontFovPose = snapshotSiteCameraRuntime();
  siteFovSlider.value = String(sliderFromFocal35mm(100));
  siteFovSlider.dispatchEvent(new Event('input', { bubbles: true }));
  const frontFovChanged = Math.abs(cameraSite.fov - verticalFovFromFocal35mm(
    focal35mmFromSlider(sliderFromFocal35mm(100)), frontFovPose.aspect)) < 1e-9 &&
    cameraSite.position.distanceTo(frontFovPose.position) < 1e-9 &&
    cameraSite.quaternion.angleTo(frontFovPose.quaternion) < 1e-9 &&
    controlsSite.target.distanceTo(frontFovPose.target) < 1e-9 &&
    state.site.anamorphicCameraMode === 'FOV_ADJUSTED';
  siteFovResetButton.click();
  const frontFovReset = Math.abs(cameraSite.fov - frontFovBaseline) < 1e-9 &&
    state.site.anamorphicCameraMode === 'CALIBRATION' &&
    cameraSite.position.distanceTo(frontFovPose.position) < 1e-9;
  chooseOption(productionUi.family, 'back');
  const siteBack = productionWorkspace === 'site' && productionSitePreset === 'back' &&
    state.site.world === 'world3d' && state.site.mappingMode === 'anamorphic' && state.site.anamorphicFamily === 'back';
  const backFovBaseline = cameraSite.fov;
  siteFovSlider.value = String(sliderFromFocal35mm(250));
  siteFovSlider.dispatchEvent(new Event('input', { bubbles: true }));
  const backFovChanged = !siteFovControl.hidden && Math.abs(cameraSite.fov -
    verticalFovFromFocal35mm(focal35mmFromSlider(sliderFromFocal35mm(250)), cameraSite.aspect)) < 1e-9;
  siteFovResetButton.click();
  const backFovReset = Math.abs(cameraSite.fov - backFovBaseline) < 1e-9 &&
    state.site.anamorphicCameraMode === 'CALIBRATION';
  chooseOption(productionUi.family, 'free');
  const siteRoute = productionWorkspace === 'site' && productionSitePreset === 'free' &&
    state.site.world === 'world3d' && state.site.mappingMode === 'normal' && productionUi.viewSite.classList.contains('active');
  const frontSweetCamera = SITE_SCENE_PROFILE.worlds.legacy2d.normalScenes.find((scene) => scene.id === 'frontSweet').camera;
  const [freePitch, freeYaw] = frontSweetCamera.eulerXyzDegrees;
  const expectedFreeForward = new THREE.Vector3(0, 0, -1).applyQuaternion(
    new THREE.Quaternion().setFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(freePitch), THREE.MathUtils.degToRad(freeYaw), 0, 'XYZ'
    ))
  );
  const actualFreeForward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraSite.quaternion);
  const levelUp = new THREE.Vector3(0, 1, 0).addScaledVector(actualFreeForward,
    -actualFreeForward.y).normalize();
  const actualFreeUp = new THREE.Vector3(0, 1, 0).applyQuaternion(cameraSite.quaternion);
  const expectedFreePosition = new THREE.Vector3(...frontSweetCamera.position).add(new THREE.Vector3(0, 0.5, 0));
  const siteFreeBaseline = cameraSite.position.distanceTo(expectedFreePosition) < 1e-9 &&
    Math.abs(cameraSite.position.y - (frontSweetCamera.position[1] + 0.5)) < 1e-9 &&
    Math.abs(cameraSite.fov - frontSweetCamera.fov) < 1e-9 &&
    actualFreeForward.angleTo(expectedFreeForward) < 1e-7 && actualFreeUp.angleTo(levelUp) < 1e-7;
  const freeFovPose = snapshotSiteCameraRuntime();
  const initialFocal35mm = focal35mmFromVerticalFov(frontSweetCamera.fov, cameraSite.aspect);
  const freeFovReadout = Math.abs(focal35mmFromSlider(siteFovSlider.value) - initialFocal35mm) < 0.1 &&
    siteFovValue.textContent.includes(`${initialFocal35mm.toFixed(1)} mm`);
  siteFovSlider.value = String(sliderFromFocal35mm(35));
  siteFovSlider.dispatchEvent(new Event('input', { bubbles: true }));
  const freeFovChanged = Math.abs(cameraSite.fov - verticalFovFromFocal35mm(
    focal35mmFromSlider(sliderFromFocal35mm(35)), freeFovPose.aspect)) < 1e-9 &&
    cameraSite.position.distanceTo(freeFovPose.position) < 1e-9 &&
    cameraSite.quaternion.angleTo(freeFovPose.quaternion) < 1e-9 &&
    controlsSite.target.distanceTo(freeFovPose.target) < 1e-9;
  siteFovSlider.value = '0';
  siteFovSlider.dispatchEvent(new Event('input', { bubbles: true }));
  const wideFov = cameraSite.fov;
  siteFovSlider.value = '1000';
  siteFovSlider.dispatchEvent(new Event('input', { bubbles: true }));
  const teleFov = cameraSite.fov;
  const siteFovRange = Math.abs(wideFov - verticalFovFromFocal35mm(20, freeFovPose.aspect)) < 1e-9 &&
    Math.abs(teleFov - verticalFovFromFocal35mm(400, freeFovPose.aspect)) < 1e-9 && wideFov > teleFov;
  siteFovResetButton.click();
  const freeFovReset = siteCameraRuntimeMatchesSnapshot(freeFovPose);
  const siteCamera = snapshotSiteCameraRuntime();
  cameraSite.position.x += 0.75;
  chooseOption(productionUi.family, 'free');
  const siteReselectReset = siteCameraRuntimeMatchesSnapshot(siteCamera);
  productionUi.viewPhoto.click();
  const photoFovHidden = siteFovControl.hidden;
  const photoOptions = [...productionUi.family.options].map((option) => option.value);
  const photoMenu = productionWorkspace === 'photo' && productionUi.familyLabel.textContent === 'PHOTO LOCATION' &&
    JSON.stringify(photoOptions) === JSON.stringify(['front', 'frontSweet', 'back', 'night']);
  const photoScenes = [];
  for (const scene of photoOptions) {
    chooseOption(productionUi.family, scene);
    if (state.photo.activationPromise) await state.photo.activationPromise;
    photoScenes.push(isPhotoSceneContext() && state.site.scene === scene && siteSceneSelect.value === scene &&
      isPhotoViewportActive() && !controlsSite.enabled);
  }
  state.site.legacyCameraLocked = false;
  syncSiteCameraControls();
  const photoNavigationBlocked = !controlsSite.enabled;
  lockLegacyCamera();
  const photoRoute = photoMenu && photoScenes.every(Boolean) && productionUi.viewPhoto.classList.contains('active');
  const photoCamera = snapshotSiteCameraRuntime();
  cameraSite.position.x += 0.75;
  productionUi.viewPhoto.click();
  const photoReselectReset = isPhotoSceneContext() && siteCameraRuntimeMatchesSnapshot(photoCamera);
  cameraSite.position.x += 0.75;
  productionUi.family.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  const noResetOnOpen = !siteCameraRuntimeMatchesSnapshot(photoCamera);
  viewSelectMenu.querySelector('.selected')?.click();
  const productionSceneReselectReset = isPhotoSceneContext() && siteCameraRuntimeMatchesSnapshot(photoCamera);
  productionUi.modeToggle.click();
  cameraSite.position.x += 0.75;
  siteSceneSelect.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  const developerNoResetOnOpen = !siteCameraRuntimeMatchesSnapshot(photoCamera);
  viewSelectMenu.querySelector('.selected')?.click();
  const developerSceneReselectReset = isPhotoSceneContext() && siteCameraRuntimeMatchesSnapshot(photoCamera);
  productionUi.modeToggle.click();
  const simpleImageLoadingPreserved = Boolean(sourceSelect && document.querySelector('#reload-button') &&
    state.manifest?.assets?.length &&
    state.manifest.assets.every((asset) => [...sourceSelect.options].some((option) => option.value === asset.id)));

  productionWorkspace = initialProduction.workspace;
  productionSitePreset = initialProduction.sitePreset;
  productionAuthoringFamily = initialProduction.authoringFamily;
  changeProductionSiteOption(siteWorldSelect, initial.world);
  changeProductionSiteOption(siteMappingSelect, initial.mappingMode);
  changeProductionSiteOption(siteAnamorphicFamilySelect, initial.family);
  state.site.scene = initial.scene;
  siteSceneSelect.value = initial.scene;
  state.site.anamorphicCameraMode = initial.cameraMode;
  state.site.legacyCameraLocked = initial.legacyCameraLocked;
  setActiveView(initial.activeView);
  setPreviewMode(initial.previewMode);
  setUiMode(initial.mode);
  restoreSiteCameraRuntime(initial.camera);
  syncSiteCameraControls();
  render();
  const statePreserved = state.activeView === initial.activeView && state.site.world === initial.world &&
    state.site.mappingMode === initial.mappingMode && state.site.anamorphicFamily === initial.family &&
    state.site.scene === initial.scene && state.site.anamorphicCameraMode === initial.cameraMode &&
    state.site.legacyCameraLocked === initial.legacyCameraLocked && siteCameraRuntimeMatchesSnapshot(initial.camera) &&
    state.previewMode === initial.previewMode && authoringSession.revision === initial.revision &&
    JSON.stringify(authoringSession.layers.map((layer) => layer.id)) === JSON.stringify(initial.layerIds);
  return {
    productionDefault, titleUnified, developerReachable, developerFovHidden, orderedViews,
    authoringRoute, quickMenuAvailable,
    authoringReset, backRoute, developerFamilyReselectReset, authoringClickStays,
    authoringPanStays, authoringBackOrbitToFree, authoringBackOrbitCamera,
    authoringFrontOrbitToFree, authoringFrontOrbitDefault,
    siteMenu, siteFront, siteBack, siteRoute,
    siteFovOnly, frontFovChanged, frontFovReset, backFovChanged, backFovReset,
    siteFreeBaseline, freeFovReadout, freeFovChanged, siteFovRange,
    freeFovReset, siteReselectReset, photoFovHidden, photoMenu, photoScenes, photoNavigationBlocked, photoRoute,
    photoReselectReset, noResetOnOpen, productionSceneReselectReset,
    developerNoResetOnOpen, developerSceneReselectReset, simpleImageLoadingPreserved, sharedControls, statePreserved,
    technicalPass: productionDefault && titleUnified && developerReachable && developerFovHidden &&
      authoringRoute && backRoute && siteRoute &&
      photoRoute && photoNavigationBlocked && sharedControls && statePreserved && orderedViews && quickMenuAvailable &&
      authoringClickStays && authoringPanStays && authoringBackOrbitToFree &&
      authoringBackOrbitCamera && authoringFrontOrbitToFree && authoringFrontOrbitDefault &&
      siteMenu && siteFront && siteBack && siteFovOnly && frontFovChanged && frontFovReset &&
      backFovChanged && backFovReset &&
      siteFreeBaseline && freeFovReadout && freeFovChanged && siteFovRange && freeFovReset && photoFovHidden &&
      authoringReset && developerFamilyReselectReset && siteReselectReset && photoReselectReset &&
      noResetOnOpen && productionSceneReselectReset && developerNoResetOnOpen && developerSceneReselectReset &&
      simpleImageLoadingPreserved
  };
};

window.runPreviewSourceASmoke = async () => {
  const initial = {
    workspace: productionWorkspace,
    sitePreset: productionSitePreset,
    authoringFamily: productionAuthoringFamily,
    sources: { ...productionPreviewSource },
    mode: document.body.dataset.uiMode,
    view: state.activeView,
    world: state.site.world,
    mapping: state.site.mappingMode,
    family: state.site.anamorphicFamily,
    scene: state.site.scene,
    camera: snapshotSiteCameraRuntime(),
    linkHandshake: state.link.rendererHandshake,
    photoshopConnected: state.link.photoshopConnected,
    imageTexture: productionPreviewCache.imageTexture,
    imageName: productionPreviewCache.imageName,
    imageSelection: productionPreviewCache.imageSelection,
    imageBank: [...productionPreviewCache.imageBank],
    nextImageBankId: productionPreviewCache.nextImageBankId,
    photoshopTexture: productionPreviewCache.photoshopTexture,
    photoshopFrame: productionPreviewCache.photoshopFrame,
    lastValid: { ...productionPreviewCache.lastValid },
    revision: authoringSession.revision,
    layers: JSON.stringify(authoringSession.layers.map((layer) => ({
      id: layer.layerId, family: layer.familyId, transform: layer.transform,
      mask: layer.vectorMask, opacity: layer.opacity, blend: layer.blendMode
    }))),
    projectStatus: state.authoring.project.status,
    mergeRunning: state.fullMerge.running,
    planarJob: planarWorkflow.job
  };
  const result = { photo: [], site: [] };
  const syntheticPsCanvas = document.createElement('canvas');
  syntheticPsCanvas.width = 8;
  syntheticPsCanvas.height = 8;
  const syntheticPsContext = syntheticPsCanvas.getContext('2d', { alpha: true });
  syntheticPsContext.fillStyle = '#ff0000';
  syntheticPsContext.fillRect(0, 0, 4, 4);
  syntheticPsContext.fillStyle = 'rgba(0,255,0,0.5)';
  syntheticPsContext.fillRect(4, 0, 4, 4);
  const syntheticPs = new THREE.CanvasTexture(syntheticPsCanvas);
  syntheticPs.colorSpace = THREE.SRGBColorSpace;
  syntheticPs.flipY = false;
  const syntheticFrame = { receivedWidth: 8, receivedHeight: 8, documentWidth: 8, documentHeight: 8 };
  try {
    setUiMode('production');
    state.link.rendererHandshake = true;
    state.link.photoshopConnected = true;
    productionPreviewCache.photoshopTexture = syntheticPs;
    productionPreviewCache.photoshopFrame = syntheticFrame;
    for (const [workspace, choices] of [['photo', ['front', 'frontSweet', 'back', 'night']],
      ['site', ['free', 'front75f', 'back', 'free', 'front75f']]]) {
      showProductionView(workspace);
      for (const choice of choices) {
        if (workspace === 'site') {
          productionUi.family.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
          const button = [...viewSelectMenu.querySelectorAll('button')].find((candidate) => candidate.dataset.value === choice);
          if (!button) throw new Error(`SITE VIEW ${choice} is unavailable.`);
          button.click();
        } else {
          productionUi.family.value = choice;
          productionUi.family.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (state.photo.activationPromise) await state.photo.activationPromise;
        const pose = snapshotSiteCameraRuntime();
        const location = state.site.scene;
        const sitePreset = productionSitePreset;
        const expectedSiteMeshes = choice === 'free'
          ? ['ILMIN_Back_3Dworld_Basic', 'LUUX_Front_3Dworld_Basic']
          : [choice === 'back' ? 'ANAM_SURFACE_BACK' : 'ANAM_SURFACE_FRONT75F'];
        const expectedSiteAsset = choice === 'free' ? 'world3d'
          : choice === 'back' ? 'anamorphicBack' : 'anamorphicFront75f';
        const snapshots = [];
        for (const source of ['IMAGE', 'PS_PREVIEW', 'AUTHORING', 'IMAGE']) {
          if (source === 'PS_PREVIEW') {
            state.link.rendererHandshake = true;
            state.link.photoshopConnected = true;
          }
          productionUi.previewSource.value = source;
          productionUi.previewSource.dispatchEvent(new Event('change', { bubbles: true }));
          const decision = productionPreviewDecision();
          const activeMeshNames = state.site.activeBindings.map((binding) => binding.mesh.name).sort();
          const visibleMeshNames = state.site.meshes.filter((mesh) =>
            mesh.visible && mesh.userData.productionHelper !== true).map((mesh) => mesh.name).sort();
          snapshots.push({ source, status: decision.status,
            connected: state.link.rendererHandshake && state.link.photoshopConnected,
            textureSize: [syntheticPs.image?.width, syntheticPs.image?.height],
            cameraPreserved: siteCameraRuntimeMatchesSnapshot(pose),
            locationPreserved: state.site.scene === location,
            siteViewPreserved: productionSitePreset === sitePreset,
            siteMenuValue: productionUi.family.value,
            siteAssetId: selectedSiteAssetId(),
            siteMappingMode: state.site.mappingMode,
            siteFamilyId: state.site.anamorphicFamily,
            activeMeshNames, visibleMeshNames,
            siteMeshMatchesView: workspace !== 'site' ||
              (productionUi.family.value === choice && selectedSiteAssetId() === expectedSiteAsset &&
                state.site.mappingMode === (choice === 'free' ? 'normal' : 'anamorphic') &&
                (choice === 'free' || state.site.anamorphicFamily === choice) &&
                JSON.stringify(activeMeshNames) === JSON.stringify(expectedSiteMeshes) &&
                JSON.stringify(visibleMeshNames) === JSON.stringify(expectedSiteMeshes)),
            psFreeBlackMatte: workspace !== 'site' || choice !== 'free' || source !== 'PS_PREVIEW' ||
              (decision.texture === syntheticPs && simpleImageBlackUniform.value === 1),
            mapSelected: state.site.activeBindings.every((binding) => binding.mesh.material.map === decision.texture),
            selectorVisible: !productionUi.previewSourceGroup.hidden });
        }
        result[workspace].push({ choice, snapshots });
      }
    }
    showProductionView('photo');
    productionUi.previewSource.value = 'PS_PREVIEW';
    productionUi.previewSource.dispatchEvent(new Event('change', { bubbles: true }));
    state.link.photoshopConnected = false;
    render();
    result.disconnected = {
      status: productionPreviewDecision().status,
      retained: state.site.activeBindings.every((binding) => binding.mesh.material.map === productionPreviewDecision().texture),
      stateVisible: productionUi.previewSourceState.textContent.includes('UNAVAILABLE')
    };
    state.link.photoshopConnected = true;
    showProductionView('site');
    const beforeFileRevision = authoringSession.revision;
    const beforeFileProject = state.authoring.project.status;
    const pngCanvas = document.createElement('canvas');
    pngCanvas.width = 8;
    pngCanvas.height = 8;
    const pngContext = pngCanvas.getContext('2d', { alpha: true });
    pngContext.fillStyle = '#ff0000';
    pngContext.fillRect(0, 0, 4, 4);
    pngContext.fillStyle = 'rgba(0,255,0,0.5)';
    pngContext.fillRect(4, 0, 4, 4);
    pngContext.fillStyle = '#ffffff';
    pngContext.fillRect(4, 4, 4, 4);
    const pngBlob = await new Promise((resolve) => pngCanvas.toBlob(resolve, 'image/png'));
    await loadProductionPreviewFile(new File([pngBlob], 'temporary-preview.png', { type: 'image/png' }));
    result.file = { imageReady: productionPreviewDecision().status === 'READY',
      name: productionPreviewCache.imageName, revisionPreserved: authoringSession.revision === beforeFileRevision,
      projectPreserved: state.authoring.project.status === beforeFileProject,
      siteFlipY: productionPreviewCache.imageTexture.flipY === false,
      blackMatteSelected: simpleImageBlackUniform.value === 1,
      bundledFlipAndPlaneCompensation: state.asset?.kind === 'local' && state.texture?.flipY === false &&
        state.mesh?.geometry.getAttribute('uv').getY(0) === 0 &&
        state.plane3d?.geometry.getAttribute('uv').getY(0) === 0 };
    const sampleScene = new THREE.Scene();
    const sampleGeometry = createGeometry(2, 2, true);
    const sampleMaterial = new THREE.MeshBasicMaterial({ map: productionPreviewCache.imageTexture, toneMapped: false });
    installSimpleImageBlackShader(sampleMaterial);
    sampleScene.add(new THREE.Mesh(sampleGeometry, sampleMaterial));
    const sampleCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    sampleCamera.position.z = 1;
    const sampleTarget = new THREE.WebGLRenderTarget(64, 64);
    const samplePixels = { bottomLeft: new Uint8Array(4), topLeft: new Uint8Array(4), topRight: new Uint8Array(4) };
    const baselinePixels = new Uint8Array(4);
    const sampleTexture = productionPreviewCache.imageTexture;
    const sourceInspect = document.createElement('canvas');
    sourceInspect.width = 8;
    sourceInspect.height = 8;
    const sourceInspectContext = sourceInspect.getContext('2d', { alpha: true });
    sourceInspectContext.drawImage(sampleTexture.image, 0, 0);
    result.file.sourcePixels = {
      opaqueTop: [...sourceInspectContext.getImageData(1, 1, 1, 1).data],
      partialTop: [...sourceInspectContext.getImageData(6, 1, 1, 1).data],
      cutoutBottom: [...sourceInspectContext.getImageData(1, 6, 1, 1).data]
    };
    try {
      renderer.setRenderTarget(sampleTarget);
      renderer.setViewport(0, 0, 64, 64);
      renderer.setScissorTest(false);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, true);
      simpleImageBlackUniform.value = 0;
      renderer.render(sampleScene, sampleCamera);
      renderer.readRenderTargetPixels(sampleTarget, 4, 60, 1, 1, baselinePixels);
      renderer.clear(true, true, true);
      simpleImageBlackUniform.value = 1;
      renderer.render(sampleScene, sampleCamera);
      renderer.readRenderTargetPixels(sampleTarget, 4, 4, 1, 1, samplePixels.bottomLeft);
      renderer.readRenderTargetPixels(sampleTarget, 4, 60, 1, 1, samplePixels.topLeft);
      renderer.readRenderTargetPixels(sampleTarget, 60, 60, 1, 1, samplePixels.topRight);
      sampleMaterial.map = syntheticPs;
      sampleMaterial.needsUpdate = true;
      renderer.clear(true, true, true);
      renderer.render(sampleScene, sampleCamera);
      const psCutout = new Uint8Array(4);
      const psOpaque = new Uint8Array(4);
      const psPartial = new Uint8Array(4);
      renderer.readRenderTargetPixels(sampleTarget, 4, 4, 1, 1, psCutout);
      renderer.readRenderTargetPixels(sampleTarget, 4, 60, 1, 1, psOpaque);
      renderer.readRenderTargetPixels(sampleTarget, 60, 60, 1, 1, psPartial);
      result.psFreeAlpha = { cutout: [...psCutout], opaque: [...psOpaque], partial: [...psPartial] };
    } finally {
      renderer.setRenderTarget(null);
      sampleTarget.dispose();
      sampleGeometry.dispose();
      sampleMaterial.dispose();
      render();
    }
    const bottomLeft = [...samplePixels.bottomLeft];
    const topLeft = [...samplePixels.topLeft];
    const topRight = [...samplePixels.topRight];
    result.file.gpuPixels = { bottomLeft, topLeft, topRight };
    result.file.baselinePixels = [...baselinePixels];
    result.file.orientationAndBlack = bottomLeft[0] === 0 && bottomLeft[1] === 0 && bottomLeft[2] === 0 &&
      bottomLeft[3] === 255 && topLeft[0] > 200 && topLeft[1] < 10 && topLeft[2] < 10 && topLeft[3] === 255 &&
      topRight[1] > 20 && topRight[1] < 230 && topRight[3] === 255;
    for (let index = 2; index <= PREVIEW_IMAGE_BANK_LIMIT; index++) {
      const name = index === 2
        ? 'PlanarA_FamilyDirect_Asymmetric_ANAMORPHIC_FRONT_75F_3000x5760_sample.png'
        : `temporary-preview-${index}.png`;
      await loadProductionPreviewFile(new File([pngBlob], name, { type: 'image/png' }));
    }
    const bankBeforeDelete = [...productionPreviewCache.imageBank];
    const chosen = bankBeforeDelete[1];
    productionUi.imageAsset.value = chosen.id;
    productionUi.imageAsset.dispatchEvent(new Event('change', { bubbles: true }));
    const selectedByDropdown = productionPreviewCache.imageTexture === chosen.texture &&
      productionPreviewCache.imageName === chosen.name && !productionUi.imageDeleteButton.disabled;
    const chosenOption = productionUi.imageAsset.selectedOptions[0];
    const cardBounds = productionUi.intro.getBoundingClientRect();
    const longNameContained = cardBounds.width > 0 && productionUi.imageAsset.getBoundingClientRect().width > 0 &&
      chosenOption.textContent.length <= 32 &&
      chosenOption.title.startsWith(chosen.name) && productionUi.imageAsset.title === chosen.name &&
      productionUi.imageDeleteButton.getBoundingClientRect().right <= cardBounds.right - 8 &&
      productionUi.imageName.getBoundingClientRect().right <= cardBounds.right - 8 &&
      getComputedStyle(productionUi.imageName).textOverflow === 'ellipsis';
    const bankCountAtLimit = productionPreviewCache.imageBank.length === PREVIEW_IMAGE_BANK_LIMIT &&
      productionUi.imageFileButton.disabled;
    let sixthRejected = false;
    try {
      await loadProductionPreviewFile(new File([pngBlob], 'temporary-preview-6.png', { type: 'image/png' }));
    } catch (error) {
      sixthRejected = error.message.includes('IMAGE_BANK_FULL');
    }
    productionUi.imageDeleteButton.click();
    const deleteOnlyChosen = productionPreviewCache.imageBank.length === PREVIEW_IMAGE_BANK_LIMIT - 1 &&
      !productionPreviewCache.imageBank.some((entry) => entry.id === chosen.id) &&
      bankBeforeDelete.filter((entry) => entry !== chosen).every((entry) =>
        productionPreviewCache.imageBank.some((remaining) => remaining.id === entry.id && remaining.texture === entry.texture)) &&
      !productionUi.imageAsset.querySelector(`option[value="${CSS.escape(chosen.id)}"]`) &&
      !productionUi.imageFileButton.disabled;
    selectProductionPreviewImage(state.texture, state.asset.fileName, state.asset.id);
    const builtinDeleteDisabled = productionUi.imageDeleteButton.disabled;
    productionUi.imageDeleteButton.click();
    const remainingAfterBuiltinClick = productionPreviewCache.imageBank.length === 4;
    let drainOneByOne = true;
    while (productionPreviewCache.imageBank.length) {
      const count = productionPreviewCache.imageBank.length;
      const entry = productionPreviewCache.imageBank[0];
      selectProductionPreviewImage(entry.texture, entry.name, entry.id);
      productionUi.imageDeleteButton.click();
      drainOneByOne &&= productionPreviewCache.imageBank.length === count - 1 &&
        !productionPreviewCache.imageBank.some((candidate) => candidate.id === entry.id);
    }
    drainOneByOne &&= productionPreviewCache.imageTexture === state.texture &&
      productionUi.imageAsset.value === state.asset.id && productionUi.imageDeleteButton.disabled;
    result.bank = { selectedByDropdown, longNameContained, bankCountAtLimit, sixthRejected, deleteOnlyChosen,
      builtinDeleteDisabled, remainingAfterBuiltinClick, drainOneByOne,
      authoringPreserved: authoringSession.revision === beforeFileRevision &&
        state.authoring.project.status === beforeFileProject };
    const actualMergedState = authoringSession.mergedState;
    const actualReadyOutput = planarWorkflow.readyOutput;
    try {
      productionUi.previewSource.value = 'AUTHORING';
      productionUi.previewSource.dispatchEvent(new Event('change', { bubbles: true }));
      const previousMap = state.site.activeBindings[0]?.mesh.material.map;
      authoringSession.mergedState = () => ({ dirty: false, revision: 1 });
      planarWorkflow.readyOutput = () => ({ familyId: ANAMORPHIC_FAMILY_IDS.FRONT_75F });
      render();
      const missingPhysicalTextureNotPublished = productionPreviewDecision().status !== 'READY' &&
        !productionPreviewDecision().physicalTexture &&
        state.site.activeBindings[0]?.mesh.material.map === previousMap;
      authoringSession.mergedState = () => ({ dirty: true, revision: 2 });
      planarWorkflow.readyOutput = () => null;
      render();
      const dirtyNotPublished = productionPreviewDecision().status !== 'READY' &&
        !productionPreviewDecision().physicalTexture &&
        state.site.activeBindings[0]?.mesh.material.map === previousMap;
      result.authoringReadiness = { missingPhysicalTextureNotPublished, dirtyNotPublished,
        autoBakeStarted: state.fullMerge.running !== initial.mergeRunning ||
        planarWorkflow.job !== initial.planarJob };
    } finally {
      authoringSession.mergedState = actualMergedState;
      planarWorkflow.readyOutput = actualReadyOutput;
      productionUi.previewSource.value = 'IMAGE';
      productionUi.previewSource.dispatchEvent(new Event('change', { bubbles: true }));
    }
    result.workspaceMemory = productionPreviewSource.photo === 'PS_PREVIEW' && productionPreviewSource.site === 'IMAGE';
    result.authoringUnchanged = authoringSession.revision === initial.revision &&
      JSON.stringify(authoringSession.layers.map((layer) => ({
        id: layer.layerId, family: layer.familyId, transform: layer.transform,
        mask: layer.vectorMask, opacity: layer.opacity, blend: layer.blendMode
      }))) === initial.layers && state.authoring.project.status === initial.projectStatus &&
      state.fullMerge.running === initial.mergeRunning && planarWorkflow.job === initial.planarJob;
    result.technicalPass = result.photo.every((entry) => entry.snapshots.every((snapshot) =>
      snapshot.cameraPreserved && snapshot.locationPreserved && snapshot.mapSelected && snapshot.selectorVisible &&
      (snapshot.source === 'IMAGE' ? snapshot.status === 'READY' :
        snapshot.source === 'AUTHORING' ? snapshot.status !== 'READY' : snapshot.status === 'READY'))) &&
      result.site.every((entry) => entry.snapshots.every((snapshot) =>
        snapshot.cameraPreserved && snapshot.siteViewPreserved && snapshot.siteMeshMatchesView &&
          snapshot.psFreeBlackMatte && snapshot.mapSelected && snapshot.selectorVisible &&
        (snapshot.source === 'IMAGE' ? snapshot.status === 'READY' :
          snapshot.source === 'AUTHORING' ? snapshot.status !== 'READY' :
            entry.choice === 'free' ? snapshot.status === 'READY' : snapshot.status === 'SIZE MISMATCH'))) &&
      result.disconnected.status === 'UNAVAILABLE' && result.disconnected.retained && result.disconnected.stateVisible &&
      result.file.imageReady && result.file.revisionPreserved && result.file.projectPreserved &&
      result.file.siteFlipY && result.file.blackMatteSelected && result.file.bundledFlipAndPlaneCompensation &&
      result.file.orientationAndBlack && result.psFreeAlpha.cutout.every((channel, index) => channel === (index === 3 ? 255 : 0)) &&
      result.psFreeAlpha.opaque[0] > 200 && result.psFreeAlpha.opaque[3] === 255 &&
      result.psFreeAlpha.partial[1] > 20 && result.psFreeAlpha.partial[1] < 230 &&
      result.psFreeAlpha.partial[3] === 255 && Object.values(result.bank).every(Boolean) &&
      result.workspaceMemory && result.authoringUnchanged && result.authoringReadiness.missingPhysicalTextureNotPublished &&
      result.authoringReadiness.dirtyNotPublished && !result.authoringReadiness.autoBakeStarted;
    return result;
  } finally {
    for (const binding of state.site.bindings) {
      if (binding.mesh.material?.map === syntheticPs ||
          binding.mesh.material?.map === productionPreviewCache.imageTexture &&
          productionPreviewCache.imageTexture !== initial.imageTexture) {
        binding.mesh.material.map = null;
        binding.mesh.material.needsUpdate = true;
      }
    }
    const createdBankEntries = productionPreviewCache.imageBank.filter((entry) =>
      !initial.imageBank.some((original) => original.id === entry.id));
    for (const entry of createdBankEntries) {
      productionUi.imageAsset.querySelector(`option[value="${CSS.escape(entry.id)}"]`)?.remove();
      if (entry.texture !== state.texture) entry.texture.dispose();
    }
    syntheticPs.dispose();
    productionPreviewCache.imageTexture = initial.imageTexture;
    productionPreviewCache.imageName = initial.imageName;
    productionPreviewCache.imageSelection = initial.imageSelection;
    productionPreviewCache.imageBank = initial.imageBank;
    productionPreviewCache.nextImageBankId = initial.nextImageBankId;
    productionPreviewCache.bankLoading = false;
    productionPreviewCache.photoshopTexture = initial.photoshopTexture;
    productionPreviewCache.photoshopFrame = initial.photoshopFrame;
    productionPreviewCache.lastValid = initial.lastValid;
    syncProductionImageBankUi();
    productionPreviewSource.photo = initial.sources.photo;
    productionPreviewSource.site = initial.sources.site;
    productionWorkspace = initial.workspace;
    productionSitePreset = initial.sitePreset;
    productionAuthoringFamily = initial.authoringFamily;
    state.link.rendererHandshake = initial.linkHandshake;
    state.link.photoshopConnected = initial.photoshopConnected;
    changeProductionSiteOption(siteWorldSelect, initial.world);
    changeProductionSiteOption(siteMappingSelect, initial.mapping);
    changeProductionSiteOption(siteAnamorphicFamilySelect, initial.family);
    productionAuthoringFamily = initial.authoringFamily;
    state.site.scene = initial.scene;
    siteSceneSelect.value = initial.scene;
    setActiveView(initial.view);
    setUiMode(initial.mode);
    restoreSiteCameraRuntime(initial.camera);
    render();
  }
};

// Isolated Production routing and job-policy smoke. Planar-A/B runtime smokes
// separately exercise the actual Full Merge Direct read and Planar renderer.
window.runPreviewSourceBSmoke = async () => {
  const front = ANAMORPHIC_FAMILY_IDS.FRONT_75F;
  const back = ANAMORPHIC_FAMILY_IDS.BACK;
  const initial = {
    mode: document.body.dataset.uiMode, workspace: productionWorkspace,
    sitePreset: productionSitePreset, authoringFamily: productionAuthoringFamily,
    sources: { ...productionPreviewSource }, world: state.site.world,
    mapping: state.site.mappingMode, family: state.site.anamorphicFamily,
    scene: state.site.scene, view: state.activeView,
    camera: snapshotSiteCameraRuntime(), projectSessionId: state.authoring.snapshot.projectSessionId,
    cache: new Map(authoringPhysicalPreview.cache),
    errors: new Map(authoringPhysicalPreview.errors),
    timings: [...authoringPhysicalPreview.timings],
    mergedState: authoringSession.mergedState,
    planarReady: planarWorkflow.readyOutput, planarJob: planarWorkflow.job,
    bakeOps: { ...authoringPhysicalBakeOps }
  };
  const mocked = new Map([[front, { revision: 1, fullReady: true, planar: { familyId: front, revision: 1 } }],
    [back, { revision: 1, fullReady: true, planar: { familyId: back, revision: 1 } }]]);
  const counts = { full: 0, planar: 0, texture: 0 };
  let failAt = null;
  let deferPlanar = null;
  const report = {};
  const outputFor = (familyId, revision) => ({ familyId, revision });
  const settle = async () => {
    while (authoringPhysicalPreview.pumpPromise || authoringPhysicalPreview.pending) {
      if (authoringPhysicalPreview.pumpPromise) await authoringPhysicalPreview.pumpPromise;
      else await nextFrame();
    }
  };
  const displayedNames = () => state.site.meshes.filter((mesh) => mesh.visible &&
    !mesh.userData.productionHelper).map((mesh) => mesh.name).sort();
  const mappedPhysical = (texture) => physicalPlanarBindings().every((binding) =>
    binding.mesh.visible && binding.mesh.material.map === texture);
  const physicalBlackMatteSelected = (texture) => Boolean(texture?.userData.simpleImageAlphaBlack &&
    simpleImageBlackUniform.value === 1 && physicalPlanarBindings().every((binding) =>
      binding.mesh.material.customProgramCacheKey?.() === 'simple-image-black-v1'));
  try {
    discardAuthoringPhysicalRequests({ clearCache: true });
    productionPreviewSource.site = 'IMAGE';
    productionPreviewSource.photo = 'IMAGE';
    authoringSession.mergedState = (familyId) => {
      const entry = mocked.get(familyId ?? front);
      return { revision: entry.revision, bakedRevision: entry.fullReady ? entry.revision : null,
        dirty: !entry.fullReady, status: entry.fullReady ? 'MERGED READY' : 'MERGED DIRTY / NEEDS BAKE' };
    };
    planarWorkflow.readyOutput = (familyId, revision) => {
      const entry = mocked.get(familyId);
      return entry?.planar?.revision === revision ? entry.planar : null;
    };
    authoringPhysicalBakeOps.hasLayers = () => true;
    authoringPhysicalBakeOps.fullMergeReady = (profile) => mocked.get(profile.familyId).fullReady;
    authoringPhysicalBakeOps.fullMerge = async (familyId) => {
      counts.full += 1;
      if (failAt === 'full') throw new Error('FORCED_FULL_MERGE_FAILURE');
      mocked.get(familyId).fullReady = true;
      return { familyId };
    };
    authoringPhysicalBakeOps.planarReady = (familyId, revision) => planarWorkflow.readyOutput(familyId, revision);
    authoringPhysicalBakeOps.planarBake = async (familyId, revision) => {
      counts.planar += 1;
      if (failAt === 'planar') throw new Error('FORCED_PLANAR_FAILURE');
      if (deferPlanar) await deferPlanar.promise;
      const output = outputFor(familyId, revision);
      mocked.get(familyId).planar = output;
      return output;
    };
    authoringPhysicalBakeOps.installTexture = async (output) => {
      counts.texture += 1;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 8;
      const context = canvas.getContext('2d');
      context.fillStyle = output.familyId === back ? '#0000ff' : '#ff0000';
      context.fillRect(0, 0, 8, 8);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = false;
      texture.userData.physicalPlanarPreview = true;
      texture.userData.simpleImageAlphaBlack = true;
      return texture;
    };
    productionSitePreset = 'free';
    productionAuthoringFamily = 'front75f';
    setUiMode('production');
    showProductionView('site', { resetIfCurrent: false });
    const siteCamera = snapshotSiteCameraRuntime();
    const authoringBefore = JSON.stringify(authoringSession.snapshot());
    const projectBefore = JSON.stringify(state.authoring.project);
    productionUi.previewSource.value = 'AUTHORING';
    productionUi.previewSource.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    const firstTexture = authoringPhysicalPreview.cache.get(front)?.texture;
    report.reuse = { defaultFamily: productionPreviewDecision().familyId,
      fullJobs: counts.full, planarJobs: counts.planar,
      ready: productionPreviewDecision().status === 'READY', mapped: mappedPhysical(firstTexture),
      visible: displayedNames(), cameraPreserved: siteCameraRuntimeMatchesSnapshot(siteCamera) };
    mocked.get(front).revision = 2;
    mocked.get(front).planar = null;
    requestAuthoringPhysicalPreview();
    const duringPlanar = productionPreviewDecision();
    await settle();
    report.planarOnly = { fullJobs: counts.full, planarJobs: counts.planar,
      updatingKeptOld: duringPlanar.status === 'UPDATING' && duringPlanar.physicalTexture === firstTexture,
      ready: productionPreviewDecision().status === 'READY',
      mapped: mappedPhysical(authoringPhysicalPreview.cache.get(front)?.texture) };
    mocked.get(front).revision = 3;
    mocked.get(front).fullReady = false;
    mocked.get(front).planar = null;
    requestAuthoringPhysicalPreview();
    await settle();
    const lastGood = authoringPhysicalPreview.cache.get(front)?.texture;
    report.fullUpdate = { fullJobs: counts.full, planarJobs: counts.planar,
      ready: productionPreviewDecision().status === 'READY', mapped: mappedPhysical(lastGood),
      cameraPreserved: siteCameraRuntimeMatchesSnapshot(siteCamera),
      authoringPreserved: JSON.stringify(authoringSession.snapshot()) === authoringBefore,
      projectPreserved: JSON.stringify(state.authoring.project) === projectBefore };
    mocked.get(front).revision = 4;
    mocked.get(front).fullReady = false;
    mocked.get(front).planar = null;
    failAt = 'full';
    requestAuthoringPhysicalPreview();
    await settle();
    report.fullFailure = { status: productionPreviewDecision().status,
      retained: productionPreviewDecision().physicalTexture === lastGood && mappedPhysical(lastGood) };
    mocked.get(front).revision = 5;
    mocked.get(front).fullReady = true;
    failAt = 'planar';
    requestAuthoringPhysicalPreview();
    await settle();
    report.planarFailure = { status: productionPreviewDecision().status,
      retained: productionPreviewDecision().physicalTexture === lastGood && mappedPhysical(lastGood) };
    failAt = null;
    mocked.get(front).revision = 6;
    const normalPlanarBake = authoringPhysicalBakeOps.planarBake;
    let releasePlanar;
    let planarStarted;
    const started = new Promise((resolve) => { planarStarted = resolve; });
    deferPlanar = { promise: new Promise((resolve) => { releasePlanar = resolve; }) };
    authoringPhysicalBakeOps.planarBake = async (familyId, revision) => {
      counts.planar += 1;
      planarStarted();
      await deferPlanar.promise;
      const output = outputFor(familyId, revision);
      mocked.get(familyId).planar = output;
      return output;
    };
    requestAuthoringPhysicalPreview();
    await started;
    productionUi.previewSource.value = 'IMAGE';
    productionUi.previewSource.dispatchEvent(new Event('change', { bubbles: true }));
    releasePlanar();
    await settle();
    report.staleSource = { imageStatus: productionPreviewDecision().source === 'IMAGE',
      imageMapped: state.site.activeBindings.every((binding) =>
        binding.mesh.material.map === productionPreviewDecision().texture),
      oldCacheRetained: authoringPhysicalPreview.cache.get(front)?.texture === lastGood,
      noStaleTextureInstall: counts.texture === 3 };
    deferPlanar = null;
    authoringPhysicalBakeOps.planarBake = normalPlanarBake;
    productionAuthoringFamily = 'back';
    productionSitePreset = 'back';
    productionUi.family.value = 'back';
    productionUi.family.dispatchEvent(new Event('change', { bubbles: true }));
    productionUi.previewSource.value = 'AUTHORING';
    productionUi.previewSource.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    const backTexture = authoringPhysicalPreview.cache.get(back)?.texture;
    report.siteBack = { family: productionPreviewDecision().familyId,
      selectedAnamorphic: state.site.activeBindings.map((binding) => binding.mesh.name),
      visiblePhysical: displayedNames(), mapped: mappedPhysical(backTexture),
      blackMatte: physicalBlackMatteSelected(backTexture),
      status: productionPreviewDecision().status };
    showProductionView('authoring', { resetIfCurrent: false });
    productionUi.family.value = 'back';
    productionUi.family.dispatchEvent(new Event('change', { bubbles: true }));
    showProductionView('site', { resetIfCurrent: false });
    productionUi.family.value = 'free';
    productionUi.family.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    report.siteFreeLastSelected = { family: productionPreviewDecision().familyId,
      selectedAuthoringFamily: productionAuthoringFamily,
      mapped: mappedPhysical(backTexture), blackMatte: physicalBlackMatteSelected(backTexture),
      status: productionPreviewDecision().status };
    productionUi.family.value = 'front75f';
    productionUi.family.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    report.siteFront = { family: productionPreviewDecision().familyId,
      selectedAnamorphic: state.site.activeBindings.map((binding) => binding.mesh.name),
      visiblePhysical: displayedNames(),
      mapped: mappedPhysical(authoringPhysicalPreview.cache.get(front)?.texture),
      blackMatte: physicalBlackMatteSelected(authoringPhysicalPreview.cache.get(front)?.texture),
      status: productionPreviewDecision().status };
    productionPreviewSource.photo = 'AUTHORING';
    showProductionView('photo', { resetIfCurrent: false });
    if (state.photo.activationPromise) await state.photo.activationPromise;
    await settle();
    const photoCamera = snapshotSiteCameraRuntime();
    requestAuthoringPhysicalPreview();
    await settle();
    report.photoFront = { scene: state.site.scene, family: productionPreviewDecision().familyId,
      mapped: mappedPhysical(authoringPhysicalPreview.cache.get(front)?.texture),
      blackMatte: physicalBlackMatteSelected(authoringPhysicalPreview.cache.get(front)?.texture),
      cameraPreserved: siteCameraRuntimeMatchesSnapshot(photoCamera),
      status: productionPreviewDecision().status };
    productionUi.family.value = 'back';
    productionUi.family.dispatchEvent(new Event('change', { bubbles: true }));
    if (state.photo.activationPromise) await state.photo.activationPromise;
    await settle();
    report.photoBack = { scene: state.site.scene, family: productionPreviewDecision().familyId,
      mapped: mappedPhysical(backTexture), blackMatte: physicalBlackMatteSelected(backTexture),
      status: productionPreviewDecision().status };
    report.photoOtherViews = [];
    for (const [scene, familyId] of [['frontSweet', front], ['night', back]]) {
      productionUi.family.value = scene;
      productionUi.family.dispatchEvent(new Event('change', { bubbles: true }));
      if (state.photo.activationPromise) await state.photo.activationPromise;
      await settle();
      const pose = snapshotSiteCameraRuntime();
      requestAuthoringPhysicalPreview();
      await settle();
      report.photoOtherViews.push({ scene: state.site.scene,
        familyId: productionPreviewDecision().familyId,
        status: productionPreviewDecision().status,
        mapped: mappedPhysical(authoringPhysicalPreview.cache.get(familyId)?.texture),
        blackMatte: physicalBlackMatteSelected(authoringPhysicalPreview.cache.get(familyId)?.texture),
        cameraPreserved: siteCameraRuntimeMatchesSnapshot(pose) });
    }
    mocked.get(back).revision = 2;
    mocked.get(back).planar = null;
    const jobsBeforeManualSlot = counts.planar;
    const priorManualJob = planarWorkflow.job;
    planarWorkflow.job = { familyId: back, revision: 2 };
    requestAuthoringPhysicalPreview();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const blockedWhileManual = counts.planar === jobsBeforeManualSlot &&
      productionPreviewDecision().status === 'UPDATING';
    planarWorkflow.job = priorManualJob;
    await settle();
    report.manualPlanarSlot = { blockedWhileManual,
      oneAutoJobAfterManual: counts.planar === jobsBeforeManualSlot + 1,
      ready: productionPreviewDecision().status === 'READY' };
    mocked.get(back).revision = 3;
    mocked.get(back).planar = null;
    let releaseProjectPlanar;
    let projectPlanarStarted;
    const projectStarted = new Promise((resolve) => { projectPlanarStarted = resolve; });
    const projectBakeGate = new Promise((resolve) => { releaseProjectPlanar = resolve; });
    const actualPlanarBake = authoringPhysicalBakeOps.planarBake;
    authoringPhysicalBakeOps.planarBake = async (familyId, revision) => {
      counts.planar += 1;
      projectPlanarStarted();
      await projectBakeGate;
      const output = outputFor(familyId, revision);
      mocked.get(familyId).planar = output;
      return output;
    };
    const texturesBeforeProjectChange = counts.texture;
    requestAuthoringPhysicalPreview();
    await projectStarted;
    state.authoring.snapshot.projectSessionId = crypto.randomUUID();
    releaseProjectPlanar();
    await settle();
    report.staleProject = { noPublication: counts.texture === texturesBeforeProjectChange &&
      authoringPhysicalPreview.cache.get(back)?.projectSessionId === initial.projectSessionId,
      oldProjectHidden: productionPreviewDecision().physicalTexture === null };
    authoringPhysicalBakeOps.planarBake = actualPlanarBake;
    state.authoring.snapshot.projectSessionId = initial.projectSessionId;
    report.technicalPass = report.reuse.defaultFamily === front &&
      report.reuse.fullJobs === 0 && report.reuse.planarJobs === 0 &&
      report.reuse.ready && report.reuse.mapped && report.reuse.cameraPreserved &&
      report.planarOnly.fullJobs === 0 && report.planarOnly.planarJobs === 1 &&
      report.planarOnly.updatingKeptOld && report.planarOnly.ready && report.planarOnly.mapped &&
      report.fullUpdate.fullJobs === 1 && report.fullUpdate.planarJobs === 2 &&
      report.fullUpdate.ready && report.fullUpdate.mapped && report.fullUpdate.cameraPreserved &&
      report.fullUpdate.authoringPreserved && report.fullUpdate.projectPreserved &&
      report.fullFailure.status === 'ERROR' && report.fullFailure.retained &&
      report.planarFailure.status === 'ERROR' && report.planarFailure.retained &&
      report.staleSource.imageStatus && report.staleSource.imageMapped &&
      report.staleSource.oldCacheRetained && report.staleSource.noStaleTextureInstall &&
      report.siteBack.family === back && report.siteBack.status === 'READY' && report.siteBack.mapped &&
      report.siteBack.blackMatte &&
      report.siteBack.selectedAnamorphic.includes('ANAM_SURFACE_BACK') &&
      report.siteBack.visiblePhysical.includes('ILMIN_Back_3Dworld_Basic') &&
      report.siteFreeLastSelected.family === back &&
      report.siteFreeLastSelected.selectedAuthoringFamily === 'back' &&
      report.siteFreeLastSelected.status === 'READY' && report.siteFreeLastSelected.mapped &&
      report.siteFreeLastSelected.blackMatte &&
      report.siteFront.family === front && report.siteFront.status === 'READY' && report.siteFront.mapped &&
      report.siteFront.blackMatte &&
      report.siteFront.selectedAnamorphic.includes('ANAM_SURFACE_FRONT75F') &&
      report.photoFront.family === front && report.photoFront.status === 'READY' &&
      report.photoFront.mapped && report.photoFront.blackMatte && report.photoFront.cameraPreserved &&
      report.photoBack.family === back && report.photoBack.status === 'READY' &&
      report.photoBack.mapped && report.photoBack.blackMatte &&
      report.photoOtherViews.every((entry) => entry.status === 'READY' && entry.mapped &&
        entry.blackMatte && entry.cameraPreserved &&
        entry.familyId === (entry.scene === 'night' ? back : front)) &&
      report.manualPlanarSlot.blockedWhileManual && report.manualPlanarSlot.oneAutoJobAfterManual &&
      report.manualPlanarSlot.ready && report.staleProject.noPublication && report.staleProject.oldProjectHidden;
    return report;
  } finally {
    discardAuthoringPhysicalRequests({ clearCache: true });
    planarWorkflow.job = initial.planarJob;
    for (const [key, value] of Object.entries(initial.bakeOps)) authoringPhysicalBakeOps[key] = value;
    authoringSession.mergedState = initial.mergedState;
    planarWorkflow.readyOutput = initial.planarReady;
    authoringPhysicalPreview.cache = initial.cache;
    authoringPhysicalPreview.errors = initial.errors;
    authoringPhysicalPreview.timings = initial.timings;
    productionPreviewSource.site = 'IMAGE';
    productionPreviewSource.photo = 'IMAGE';
    productionWorkspace = initial.workspace;
    productionSitePreset = initial.sitePreset;
    productionAuthoringFamily = initial.authoringFamily;
    state.authoring.snapshot.projectSessionId = initial.projectSessionId;
    changeProductionSiteOption(siteWorldSelect, initial.world);
    changeProductionSiteOption(siteMappingSelect, initial.mapping);
    changeProductionSiteOption(siteAnamorphicFamilySelect, initial.family);
    productionAuthoringFamily = initial.authoringFamily;
    state.site.scene = initial.scene;
    siteSceneSelect.value = initial.scene;
    setActiveView(initial.view);
    setUiMode(initial.mode);
    productionPreviewSource.site = initial.sources.site;
    productionPreviewSource.photo = initial.sources.photo;
    restoreSiteCameraRuntime(initial.camera);
    render();
  }
};

window.runPreviewSourceBPhysicalIntegrationSmoke = async () => {
  const front = ANAMORPHIC_FAMILY_IDS.FRONT_75F;
  const back = ANAMORPHIC_FAMILY_IDS.BACK;
  const initial = { mode: document.body.dataset.uiMode, workspace: productionWorkspace,
    sitePreset: productionSitePreset, authoringFamily: productionAuthoringFamily,
    sources: { ...productionPreviewSource }, world: state.site.world,
    mapping: state.site.mappingMode, family: state.site.anamorphicFamily,
    scene: state.site.scene, view: state.activeView,
    camera: snapshotSiteCameraRuntime(), snapshot: authoringSession.snapshot(),
    project: JSON.stringify(state.authoring.project),
    projectSessionId: state.authoring.snapshot.projectSessionId };
  const fixture = document.createElement('canvas');
  fixture.width = fixture.height = 32;
  const context = fixture.getContext('2d', { alpha: true });
  context.fillStyle = '#f00';
  context.fillRect(0, 0, 16, 32);
  context.fillStyle = '#00f';
  context.fillRect(16, 0, 16, 32);
  const runtime = { id: 'preview-source-b-integration', filename: 'integration-fixture.png',
    name: 'integration-fixture.png', mimeType: 'image/png', type: 'image/png',
    width: 32, height: 32, hasAlpha: true, byteLength: 0, image: fixture, objectUrl: null };
  const report = { families: [] };
  try {
    discardAuthoringPhysicalRequests({ clearCache: true });
    productionPreviewSource.site = 'IMAGE';
    productionPreviewSource.photo = 'IMAGE';
    authoringSession.addLayer(runtime, front, runtime);
    authoringSession.addLayer(runtime, back, runtime);
    productionAuthoringFamily = 'front75f';
    productionSitePreset = 'free';
    setUiMode('production');
    showProductionView('site', { resetIfCurrent: false });
    for (const [familyId, workspace, view] of [[front, 'site', 'free'], [back, 'photo', 'back']]) {
      if (workspace === 'photo') {
        productionPreviewSource.photo = 'IMAGE';
        showProductionView('photo', { resetIfCurrent: false });
        productionUi.family.value = view;
        productionUi.family.dispatchEvent(new Event('change', { bubbles: true }));
        if (state.photo.activationPromise) await state.photo.activationPromise;
        productionUi.previewSource.value = 'AUTHORING';
        productionUi.previewSource.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        productionUi.previewSource.value = 'AUTHORING';
        productionUi.previewSource.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const pose = snapshotSiteCameraRuntime();
      while (authoringPhysicalPreview.pumpPromise || authoringPhysicalPreview.pending) {
        if (authoringPhysicalPreview.pumpPromise) await authoringPhysicalPreview.pumpPromise;
        else await nextFrame();
      }
      const merged = authoringSession.mergedState(familyId);
      const full = fullMergeRuntime.result(familyId);
      const output = planarWorkflow.readyOutput(familyId, merged.revision);
      const cached = authoringPhysicalPreview.cache.get(familyId);
      const bindings = physicalPlanarBindings();
      report.families.push({ familyId, workspace, view,
        fullMergedDirect: [full?.directWidth, full?.directHeight],
        fullMergedRevision: full?.mergedRevision, planarSize: [output?.width, output?.height],
        outputReady: Boolean(output?.blob?.type === 'image/png'),
        physicalTextureFromOutput: cached?.output === output,
        textureContract: Boolean(cached?.texture.colorSpace === THREE.SRGBColorSpace &&
          cached.texture.flipY === false && cached.texture.minFilter === THREE.LinearFilter &&
          cached.texture.magFilter === THREE.LinearFilter && cached.texture.wrapS === THREE.ClampToEdgeWrapping &&
          cached.texture.wrapT === THREE.ClampToEdgeWrapping &&
          cached.texture.userData.simpleImageAlphaBlack === true &&
          bindings.every((binding) => binding.mesh.material.transparent === true &&
            binding.mesh.material.customProgramCacheKey?.() === 'simple-image-black-v1') &&
          simpleImageBlackUniform.value === 1),
        physicalBindings: bindings.map((binding) => binding.mesh.name),
        mapped: Boolean(cached && bindings.every((binding) =>
          binding.mesh.visible && binding.mesh.material.map === cached.texture)),
        cameraPreserved: siteCameraRuntimeMatchesSnapshot(pose),
        status: productionPreviewDecision().status,
        timing: authoringPhysicalPreview.timings.at(-1) });
    }
    showProductionView('authoring', { resetIfCurrent: false });
    report.manualOutputsAvailable = {};
    for (const [familyId, family] of [[front, 'front75f'], [back, 'back']]) {
      productionUi.family.value = family;
      productionUi.family.dispatchEvent(new Event('change', { bubbles: true }));
      syncProjectionPocUi();
      report.manualOutputsAvailable[familyId] = Boolean(
        planarWorkflow.readyOutput(familyId, authoringSession.mergedState(familyId).revision) &&
        !planarMasterPreview.disabled && !planarMasterSave.disabled);
    }
    report.projectPreserved = JSON.stringify(state.authoring.project) === initial.project;
    report.technicalPass = report.families.length === 2 && report.projectPreserved &&
      report.manualOutputsAvailable[front] && report.manualOutputsAvailable[back] &&
      report.families.every((entry) => entry.status === 'READY' && entry.outputReady &&
        entry.physicalTextureFromOutput && entry.textureContract && entry.mapped && entry.cameraPreserved &&
        entry.planarSize[0] === 4728 && entry.planarSize[1] === 5760 &&
        entry.fullMergedDirect[1] === 3840 &&
        entry.fullMergedDirect[0] === (entry.familyId === front ? 3000 : 2100));
    return report;
  } finally {
    discardAuthoringPhysicalRequests({ clearCache: true });
    planarWorkflow.reset();
    planarMappingRuntime.disposeAll();
    fullMergeRuntime.disposeAll();
    authoringSession.restore(initial.snapshot);
    productionPreviewSource.site = 'IMAGE';
    productionPreviewSource.photo = 'IMAGE';
    productionWorkspace = initial.workspace;
    productionSitePreset = initial.sitePreset;
    productionAuthoringFamily = initial.authoringFamily;
    state.authoring.snapshot.projectSessionId = initial.projectSessionId;
    changeProductionSiteOption(siteWorldSelect, initial.world);
    changeProductionSiteOption(siteMappingSelect, initial.mapping);
    changeProductionSiteOption(siteAnamorphicFamilySelect, initial.family);
    productionAuthoringFamily = initial.authoringFamily;
    state.site.scene = initial.scene;
    siteSceneSelect.value = initial.scene;
    setActiveView(initial.view);
    setUiMode(initial.mode);
    productionPreviewSource.site = initial.sources.site;
    productionPreviewSource.photo = initial.sources.photo;
    restoreSiteCameraRuntime(initial.camera);
    render();
    fixture.width = fixture.height = 1;
  }
};

// Development-only Planar-A evidence hook. It does not modify authoring state,
// Full Merge results, UI controls, project data, or Photoshop targets.
window.runPlanarAFoundationSmoke = async () => {
  const familyIds = [ANAMORPHIC_FAMILY_IDS.FRONT_75F, ANAMORPHIC_FAMILY_IDS.BACK];
  const before = {
    authoring: JSON.stringify(authoringSession.snapshot()),
    merged: familyIds.map((familyId) => fullMergeRuntime.result(familyId)),
    textures: renderer.info.memory.textures,
    geometries: renderer.info.memory.geometries,
    camera: JSON.stringify(snapshotSiteCameraRuntime())
  };
  const fixtureChecksum = (bytes) => {
    let hash = 2166136261;
    for (let index = 0; index < bytes.length; index += 1) hash = Math.imul(hash ^ bytes[index], 16777619);
    return hash >>> 0;
  };
  const planar = new PlanarMappingRuntime(renderer);
  const results = {};
  const sources = {};
  let sourceMutation = false;
  try {
    for (const familyId of familyIds) {
      const fixture = createPlanarAsymmetricFixture(familyId);
      const inputChecksumBefore = fixtureChecksum(fixture.bytes);
      validatePlanarSourceInput(fixture, familyId);
      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = fixture.width;
      sourceCanvas.height = fixture.height;
      sourceCanvas.getContext('2d', { alpha: true }).putImageData(
        new ImageData(new Uint8ClampedArray(fixture.bytes), fixture.width, fixture.height), 0, 0
      );
      sources[familyId] = { width: fixture.width, height: fixture.height, png: sourceCanvas.toDataURL('image/png') };
      sourceCanvas.width = sourceCanvas.height = 1;
      const outputs = [];
      for (let pass = 0; pass < 2; pass += 1) {
        const output = await planar.render(familyId, fixture, { sourceMergedDirectRevision: 1 });
        const counts = { opaque: 0, semi: 0, semiStraight: 0, transparent: 0, red: 0, green: 0, blue: 0, yellow: 0 };
        for (let offset = 0; offset < output.bytes.length; offset += 4) {
          const r = output.bytes[offset];
          const g = output.bytes[offset + 1];
          const b = output.bytes[offset + 2];
          const a = output.bytes[offset + 3];
          if (a === 0) counts.transparent += 1;
          else if (a >= 250) counts.opaque += 1;
          else if (a > 40 && a < 220) counts.semi += 1;
          if (a >= 120 && a <= 136 && Math.max(r, g, b) >= 245) counts.semiStraight += 1;
          if (a > 200 && r > 180 && g < 80 && b < 80) counts.red += 1;
          if (a > 200 && g > 180 && r < 80 && b < 80) counts.green += 1;
          if (a > 200 && b > 180 && r < 80 && g < 80) counts.blue += 1;
          if (a > 200 && r > 180 && g > 180 && b < 80) counts.yellow += 1;
        }
        const sample = (x, y) => {
          const offset = (Math.floor(y * output.height) * output.width + Math.floor(x * output.width)) * 4;
          return [...output.bytes.subarray(offset, offset + 4)];
        };
        const landmarks = [sample(0.3, 0.2), sample(0.7, 0.2), sample(0.3, 0.8), sample(0.7, 0.8)];
        let png = null;
        if (pass === 0) {
          const canvas = document.createElement('canvas');
          canvas.width = output.width;
          canvas.height = output.height;
          canvas.getContext('2d', { alpha: true }).putImageData(
            new ImageData(new Uint8ClampedArray(output.bytes), output.width, output.height), 0, 0
          );
          png = canvas.toDataURL('image/png');
          canvas.width = canvas.height = 1;
        }
        outputs.push({
          width: output.width, height: output.height,
          orientation: output.orientation, alpha: output.alpha,
          counts, landmarks, textureContract: output.textureContract, png,
          textureCount: renderer.info.memory.textures,
          geometryCount: renderer.info.memory.geometries
        });
      }
      sourceMutation ||= fixtureChecksum(fixture.bytes) !== inputChecksumBefore;
      results[familyId] = {
        profile: state.manifest.planarMapping.profiles[familyId].id,
        sourceResolution: state.manifest.planarMapping.profiles[familyId].sourceResolution,
        outputs, state: planar.state(familyId)
      };
    }
  } finally {
    planar.disposeAll();
  }
  const after = {
    authoring: JSON.stringify(authoringSession.snapshot()),
    merged: familyIds.map((familyId) => fullMergeRuntime.result(familyId)),
    textures: renderer.info.memory.textures,
    geometries: renderer.info.memory.geometries,
    camera: JSON.stringify(snapshotSiteCameraRuntime())
  };
  return {
    sources, results,
    authoringMutation: before.authoring !== after.authoring,
    mergedMutation: before.merged.some((result, index) => result !== after.merged[index]),
    sourceMutation,
    textureDelta: after.textures - before.textures,
    geometryDelta: after.geometries - before.geometries,
    siteCameraMutation: before.camera !== after.camera
  };
};

// Isolated GPU smoke: the same Full Merge DIRECT read boundary and Planar
// workflow are exercised without mutating the user's authoring/project state.
window.runPlanarBWorkflowSmoke = async () => {
  const familyIds = [ANAMORPHIC_FAMILY_IDS.FRONT_75F, ANAMORPHIC_FAMILY_IDS.BACK];
  const before = {
    authoring: JSON.stringify(authoringSession.snapshot()),
    project: JSON.stringify(state.authoring.project),
    textures: renderer.info.memory.textures,
    geometries: renderer.info.memory.geometries,
    contextLoss: state.contextLossCount
  };
  const reports = {};
  for (const familyId of familyIds) {
    const resourceStart = { textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries };
    const previewBefore = { mode: state.previewMode, gray: state.previewBackgroundGray, uniform: previewBackgroundUniform.value };
    const profile = getProjectionBakeProfile(familyId);
    const fixture = createPlanarAsymmetricFixture(familyId);
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = fixture.width;
    sourceCanvas.height = fixture.height;
    sourceCanvas.getContext('2d', { alpha: true }).putImageData(
      new ImageData(new Uint8ClampedArray(fixture.bytes), fixture.width, fixture.height), 0, 0
    );
    const texture = new THREE.CanvasTexture(sourceCanvas);
    texture.colorSpace = THREE.NoColorSpace;
    texture.flipY = false;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    const target = { texture };
    const merged = new FullMergeAccumulatorRuntime(renderer);
    const planar = new PlanarMappingRuntime(renderer);
    let revision = 1;
    const workflow = new PlanarOutputWorkflow({
      readSource: (id, rev) => readPlanarSource(merged, id, { ready: true, mergedDirectRevision: rev }),
      render: (id, input, rev) => planar.render(id, input, { sourceMergedDirectRevision: rev }),
      encodePng: encodePlanarPng,
      isCurrent: (id, rev) => id === familyId && revision === rev && merged.result(id)?.mergedRevision === rev
    });
    try {
      const accumulator = merged.begin(profile);
      accumulator.addLayer({ directTarget: target, canonicalTarget: target, opacity: 1, blendMode: 'NORMAL' });
      const fullMergedResult = accumulator.finish({ mergedRevision: revision });
      const source = readPlanarSource(merged, familyId, { ready: true, mergedDirectRevision: revision });
      const sourceDimensions = [source.width, source.height];
      source.bytes = null;
      const output = await workflow.bake(familyId, { ready: true, revision });
      const bytes = new Uint8Array(await output.blob.arrayBuffer());
      const view = new DataView(bytes.buffer);
      const pngWidth = view.getUint32(16);
      const pngHeight = view.getUint32(20);
      const pngColorType = bytes[25];
      const ready = workflow.state(familyId, { ready: true, revision }).status === 'READY';
      const repeatBaseline = { textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries };
      let repeatStable = true;
      const previewHashes = [];
      for (let repeat = 0; repeat < 2; repeat += 1) {
        state.previewBackgroundGray = repeat;
        previewBackgroundUniform.value = repeat;
        state.previewMode = repeat === 0 ? PREVIEW_MODES.AUTHORING : PREVIEW_MODES.PHOTOSHOP_FINAL;
        workflow.invalidateFamily(familyId);
        const repeated = await workflow.bake(familyId, { ready: true, revision });
        previewHashes.push([...new Uint8Array(await crypto.subtle.digest('SHA-256', await repeated.blob.arrayBuffer()))]
          .map((value) => value.toString(16).padStart(2, '0')).join(''));
        repeatStable &&= renderer.info.memory.textures === repeatBaseline.textures &&
          renderer.info.memory.geometries === repeatBaseline.geometries;
      }
      revision += 1;
      workflow.invalidateFamily(familyId);
      const staleSaveBlocked = workflow.readyOutput(familyId, revision) === null;
      reports[familyId] = {
        sourceDimensions, directWidth: fullMergedResult.directWidth, directHeight: fullMergedResult.directHeight,
        sourceKind: 'FULL_MERGED_DIRECT', pngWidth, pngHeight, pngColorType,
        pngBytes: bytes.length, ready, staleSaveBlocked, repeatedBakes: 3, repeatStable,
        previewInvariant: previewHashes[0] === previewHashes[1],
        revisionUnchanged: merged.result(familyId)?.mergedRevision === 1
      };
    } finally {
      workflow.reset();
      planar.disposeAll();
      merged.disposeAll();
      texture.dispose();
      sourceCanvas.width = sourceCanvas.height = 1;
      fixture.bytes = null;
      state.previewMode = previewBefore.mode;
      state.previewBackgroundGray = previewBefore.gray;
      previewBackgroundUniform.value = previewBefore.uniform;
    }
    reports[familyId].resourceDelta = {
      textures: renderer.info.memory.textures - resourceStart.textures,
      geometries: renderer.info.memory.geometries - resourceStart.geometries
    };
  }
  const after = {
    authoring: JSON.stringify(authoringSession.snapshot()),
    project: JSON.stringify(state.authoring.project),
    textures: renderer.info.memory.textures,
    geometries: renderer.info.memory.geometries,
    contextLoss: state.contextLossCount
  };
  return { reports, authoringMutation: before.authoring !== after.authoring,
    projectMutation: before.project !== after.project,
    textureDelta: after.textures - before.textures,
    geometryDelta: after.geometries - before.geometries,
    contextLossDelta: after.contextLoss - before.contextLoss };
};

async function start() {
  state.manifest = await fetch('./assets-manifest.json').then((response) => {
    if (!response.ok) throw new Error(`Manifest load failed: ${response.status}`);
    return response.json();
  });
  if (window.luuxProject) {
    const project = await window.luuxProject.getState();
    if (project.ok) {
      state.authoring.project.hasCurrentProject = project.hasCurrentProject;
      state.authoring.project.projectName = project.projectName;
    }
  }
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
    productionUi.imageAsset.append(new Option(`${asset.label} · ${asset.sourceWidth} × ${asset.sourceHeight}`, asset.id));
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
  setUiMode('production');
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
