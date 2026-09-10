const UNRESOLVED = 'UNRESOLVED';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const LEGACY_SOURCE = deepFreeze({
  sourceType: 'LEGACY_HTML',
  path: 'luux-mockup/index.html',
  byteLength: 97343,
  sha256: 'D25D1E264F4F46F13FB8A40B15B0DEF56AE4D0280D3C4BC6578DD267C4000269',
  extractedAt: '2026-09-10',
  cameraConstructorLines: [751, 751],
  sceneApplicationLines: [1104, 1123],
  projectionStateLines: [858, 860],
  projectionControlLines: [950, 980],
  photoBindingLines: [731, 738],
  photoLoadingLines: [1147, 1166]
});

export const PHOTO_NATIVE_FRAME = deepFreeze({
  nativeWidth: 8256,
  nativeHeight: 5504,
  nativeAspect: 1.5,
  aspectLabel: '3:2'
});

export const LEGACY_CAMERA_LOCK_POLICY = deepFreeze({
  defaultLocked: true,
  relockOnLegacyEntry: true,
  relockOnSceneChange: true,
  pointAllowedWhenLocked: true,
  cameraMutationRequiresUnlock: true
});

const cameraDefinitions = [
  {
    cameraId: 'photo-reference.front',
    sceneId: 'FRONT',
    label: 'Front',
    legacySceneName: 'front',
    declarationLines: [763, 770],
    fov: 52.4,
    position: [-8.587, 1.4, 12.33],
    eulerXyzDegrees: [16.5, -39.5, 10.3]
  },
  {
    cameraId: 'photo-reference.front-sweet',
    sceneId: 'FRONT_SWEET',
    label: 'Front_Sweet',
    legacySceneName: 'frontSweetSpot',
    declarationLines: [772, 779],
    fov: 49.2,
    position: [-7.243, -0.031, 12.76],
    eulerXyzDegrees: [22.3, -34.5, 13.1]
  },
  {
    cameraId: 'photo-reference.back',
    sceneId: 'BACK',
    label: 'Back',
    legacySceneName: 'back',
    declarationLines: [781, 788],
    fov: 46.4,
    position: [-9.869, 0.04, -9.425],
    eulerXyzDegrees: [-30.1, -130.95, -24.6]
  },
  {
    cameraId: 'photo-reference.night',
    sceneId: 'NIGHT',
    label: 'Night',
    legacySceneName: 'backNight',
    declarationLines: [790, 797],
    fov: 47.9,
    position: [-9.869, 0.04, -9.425],
    eulerXyzDegrees: [-29.3, -132.3, -21.9]
  }
];

function cameraValues(definition) {
  return {
    cameraType: 'PerspectiveCamera',
    coordinateSpace: 'THREE_WORLD',
    position: {
      x: definition.position[0],
      y: definition.position[1],
      z: definition.position[2]
    },
    target: null,
    orientation: {
      type: 'EULER_XYZ_DEGREES',
      x: definition.eulerXyzDegrees[0],
      y: definition.eulerXyzDegrees[1],
      z: definition.eulerXyzDegrees[2]
    },
    fov: definition.fov,
    fovBasis: 'VERTICAL_THREE',
    aspect: 1.5,
    zoom: 1,
    zoomModel: 'FOV_SCALE',
    lensShiftX: 0,
    lensShiftY: 0,
    lensShiftModel: 'VIEW_OFFSET',
    near: 0.1,
    far: 10000
  };
}

function cameraRecord(definition) {
  const legacyValues = deepFreeze(cameraValues(definition));
  return deepFreeze({
    cameraId: definition.cameraId,
    sceneId: definition.sceneId,
    label: definition.label,
    role: 'PHOTO_REFERENCE_CAMERA',
    legacySource: {
      ...LEGACY_SOURCE,
      sourceSceneName: definition.legacySceneName,
      declarationLines: definition.declarationLines
    },
    legacyValues,
    currentValues: clone(legacyValues),
    editable: true,
    lockPolicy: LEGACY_CAMERA_LOCK_POLICY
  });
}

export const CAMERA_RECORDS = deepFreeze(cameraDefinitions.map(cameraRecord));

const photoDefinitions = [
  {
    sceneId: 'FRONT',
    label: 'Front',
    assetId: 'photo.front',
    path: '2DAsset/Photograph/BG_Front.jpg',
    legacyPath: './assets/bg_front.jpg',
    byteLength: 9703784,
    sha256: '99DCAC1769226DAEDE7C4B3421FD7E11D4D82E38B1432E8E9BC520B74F4583EB',
    cameraId: 'photo-reference.front',
    exactMeshNames: ['LUUX_Front'],
    locationId: 'location.front'
  },
  {
    sceneId: 'FRONT_SWEET',
    label: 'Front_Sweet',
    assetId: 'photo.front-sweet',
    path: '2DAsset/Photograph/BG_FrontSweet.jpg',
    legacyPath: './assets/bg_sweet.jpg',
    byteLength: 9322540,
    sha256: 'A83BD5024DC5B8FE39DAB2917E291604F1530FCCB486819E821C01F0541AE1A9',
    cameraId: 'photo-reference.front-sweet',
    exactMeshNames: ['LUUX_F_Sweet'],
    locationId: 'location.front-sweet'
  },
  {
    sceneId: 'BACK',
    label: 'Back',
    assetId: 'photo.back',
    path: '2DAsset/Photograph/BG_Back.jpg',
    legacyPath: './assets/bg_back.jpg',
    byteLength: 12331761,
    sha256: '4F2DBA196AE5FCBB9D0F45D6A6D7FAB433D7A2C19371D42057A863B7312BB816',
    cameraId: 'photo-reference.back',
    exactMeshNames: ['LUUX_Back', 'ILMIN_Back'],
    locationId: 'location.back'
  },
  {
    sceneId: 'NIGHT',
    label: 'Night',
    assetId: 'photo.night',
    path: '2DAsset/Photograph/BG_Night.jpg',
    legacyPath: './assets/bg_night.jpg',
    byteLength: 10072925,
    sha256: 'B38AE38CEB929743803A61DA8AFA4D864A14ECDA4F3EDEFED11E4C7A04300873',
    cameraId: 'photo-reference.night',
    exactMeshNames: ['LUUX_B_Night', 'ILMIN_B_Night'],
    locationId: 'location.night'
  }
];

export const PHOTO_SCENE_RECORDS = deepFreeze(photoDefinitions.map((definition) => ({
  sceneId: definition.sceneId,
  label: definition.label,
  photoAsset: {
    assetId: definition.assetId,
    path: definition.path,
    legacyPath: definition.legacyPath,
    runtimeUrl: null,
    runtimeUrlStatus: UNRESOLVED,
    ...PHOTO_NATIVE_FRAME,
    byteLength: definition.byteLength,
    sha256: definition.sha256
  },
  cameraId: definition.cameraId,
  mapping: {
    strategy: 'LEGACY_MESH_MAPPING',
    legacyAssetId: 'legacy2d',
    exactMeshNames: definition.exactMeshNames
  },
  locationId: definition.locationId,
  pointSupport: true,
  pointRuntimeStatus: 'DEFERRED_BLOCK_4C'
})));

export const LOCATION_RECORDS = deepFreeze(photoDefinitions.map((definition) => ({
  locationId: definition.locationId,
  sceneId: definition.sceneId,
  worldPosition: null,
  thumbnailAsset: null,
  uiOffset: null,
  enabled: false,
  resolutionStatus: UNRESOLVED,
  unresolvedReason: 'Location placement and marker UI are deferred to Block 4E.'
})));

export const SITE_CALIBRATION_PROFILE = deepFreeze({
  id: 'luux-site-calibration-v1',
  schemaVersion: 1,
  ownership: 'APP_OWNED_SITE_CALIBRATION',
  source: LEGACY_SOURCE,
  coordinatePolicy: {
    functionalSignageGlb: 'DIRECT_NO_CONVERSION',
    environmentGlb: 'DIRECT_NO_CONVERSION',
    legacyCamera: 'DIRECT_THREE_VALUES',
    maxLikeCameraInputAdapter: {
      status: 'CANDIDATE_USER_CALIBRATION_OPEN',
      scope: 'CAMERA_INPUT_ONLY',
      forward: 'Three=(Max.x,Max.z,-Max.y)',
      inverse: 'Max=(Three.x,-Three.z,Three.y)',
      fov: 'VERTICAL_DIRECT_OR_HORIZONTAL_TO_VERTICAL',
      eulerImport: 'DEFERRED',
      roll: 'DEFERRED'
    }
  },
  photoNativeFrame: PHOTO_NATIVE_FRAME,
  cameraRecords: CAMERA_RECORDS,
  photoSceneRecords: PHOTO_SCENE_RECORDS,
  locationRecords: LOCATION_RECORDS,
  unresolved: {
    maxLikeCalibration: 'BLOCK_4B_USER_GATE',
    maxLikeEulerImport: 'DEFERRED',
    maxLikeRoll: 'DEFERRED',
    photoRuntimeUrl: 'BLOCK_4C',
    locationWorldPosition: 'BLOCK_4E',
    locationThumbnailAsset: 'BLOCK_4E',
    locationUiOffset: 'BLOCK_4E'
  }
});

export function getCameraRecordBySceneId(sceneId) {
  return CAMERA_RECORDS.find((record) => record.sceneId === sceneId) ?? null;
}

export function createEditableCameraRecords() {
  return CAMERA_RECORDS.map((record) => ({
    cameraId: record.cameraId,
    sceneId: record.sceneId,
    label: record.label,
    role: record.role,
    legacySource: record.legacySource,
    legacyValues: record.legacyValues,
    currentValues: clone(record.currentValues),
    editable: record.editable,
    lockPolicy: record.lockPolicy
  }));
}

export function resetCameraRecordToLegacy(record) {
  if (!record || !record.legacyValues) throw new TypeError('A camera record with legacyValues is required.');
  record.currentValues = clone(record.legacyValues);
  return record.currentValues;
}
