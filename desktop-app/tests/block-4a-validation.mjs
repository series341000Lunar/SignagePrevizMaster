import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CAMERA_RECORDS,
  LEGACY_CAMERA_LOCK_POLICY,
  LOCATION_RECORDS,
  PHOTO_NATIVE_FRAME,
  PHOTO_SCENE_RECORDS,
  SITE_CALIBRATION_PROFILE,
  createEditableCameraRecords,
  resetCameraRecordToLegacy
} from '../src/site-calibration-profile.js';
import { SITE_ASSETS, SITE_SCENE_PROFILE } from '../src/site-scene-profile.js';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(appRoot, '..');
const legacyRoot = path.join(projectRoot, 'luux-mockup');
const legacyHtmlPath = path.join(legacyRoot, 'index.html');
const rendererPath = path.join(appRoot, 'src', 'renderer.js');
const rendererHtmlPath = path.join(appRoot, 'src', 'index.html');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

function jpegDimensions(bytes) {
  assert.equal(bytes[0], 0xff, 'JPEG SOI marker byte 1');
  assert.equal(bytes[1], 0xd8, 'JPEG SOI marker byte 2');
  let offset = 2;
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    const length = bytes.readUInt16BE(offset);
    if (sofMarkers.has(marker)) {
      return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
    }
    offset += length;
  }
  throw new Error('JPEG dimensions were not found.');
}

function parseNumberList(source, fieldName) {
  const match = source.match(new RegExp(`${fieldName}\\s*:\\s*\\[([^\\]]+)\\]`));
  assert(match, `Missing ${fieldName} list in Legacy sceneData.`);
  return match[1].split(',').map((value) => Number(value.trim()));
}

function extractLegacyScene(sceneDataSource, legacySceneName) {
  const escapedName = legacySceneName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = sceneDataSource.match(new RegExp(`(?:^|\\n)\\s*${escapedName}\\s*:\\s*\\{([\\s\\S]*?)\\n\\s*\\}`, 'm'));
  assert(match, `Missing Legacy sceneData entry: ${legacySceneName}`);
  const source = match[1];
  const fovMatch = source.match(/fov\s*:\s*(-?[\d.]+)/);
  assert(fovMatch, `Missing Legacy FOV: ${legacySceneName}`);
  return {
    fov: Number(fovMatch[1]),
    position: parseNumberList(source, 'pos'),
    eulerXyzDegrees: parseNumberList(source, 'rot')
  };
}

const legacyHtmlBytes = await readFile(legacyHtmlPath);
const legacyHtml = legacyHtmlBytes.toString('utf8');
assert.equal(legacyHtmlBytes.length, SITE_CALIBRATION_PROFILE.source.byteLength);
assert.equal(sha256(legacyHtmlBytes), SITE_CALIBRATION_PROFILE.source.sha256);

const aspect = Number(legacyHtml.match(/const TARGET_ASPECT\s*=\s*([\d.]+)\s*;/)?.[1]);
const cameraConstructor = legacyHtml.match(/new THREE\.PerspectiveCamera\([^,]+,\s*TARGET_ASPECT,\s*([\d.]+),\s*([\d.]+)\)/);
assert(cameraConstructor, 'Missing Legacy PerspectiveCamera constructor.');
const near = Number(cameraConstructor[1]);
const far = Number(cameraConstructor[2]);
const zoom = Number(legacyHtml.match(/let currentCameraZoom\s*=\s*([\d.]+)\s*;/)?.[1]);
const lensShiftX = Number(legacyHtml.match(/let currentLensShiftX\s*=\s*(-?[\d.]+)\s*;/)?.[1]);
const lensShiftY = Number(legacyHtml.match(/let currentLensShiftY\s*=\s*(-?[\d.]+)\s*;/)?.[1]);
assert.equal(aspect, 1.5);
assert.equal(near, 0.1);
assert.equal(far, 10000);
assert.equal(zoom, 1);
assert.equal(lensShiftX, 0);
assert.equal(lensShiftY, 0);
assert(/camera\.rotation\.set\([\s\S]*data\.rot\[0\][\s\S]*data\.rot\[2\]/.test(legacyHtml));
assert(!/\b(?:lookAt|OrbitControls|controls\.target)\b/.test(legacyHtml), 'Legacy camera must remain direct Euler with no target/orbit source.');
assert.deepEqual(LEGACY_CAMERA_LOCK_POLICY, {
  defaultLocked: true,
  relockOnLegacyEntry: true,
  relockOnSceneChange: true,
  pointAllowedWhenLocked: true,
  cameraMutationRequiresUnlock: true
});

const sceneDataStart = legacyHtml.indexOf('const sceneData = {');
const sceneDataEnd = legacyHtml.indexOf('const slots = [', sceneDataStart);
assert(sceneDataStart >= 0 && sceneDataEnd > sceneDataStart);
const sceneDataSource = legacyHtml.slice(sceneDataStart, sceneDataEnd);

const sceneIds = ['FRONT', 'FRONT_SWEET', 'BACK', 'NIGHT'];
assert.deepEqual(CAMERA_RECORDS.map((record) => record.sceneId), sceneIds);
assert.equal(new Set(CAMERA_RECORDS.map((record) => record.cameraId)).size, 4);
assert.equal(new Set(CAMERA_RECORDS.map((record) => record.legacySource.sourceSceneName)).size, 4);

const actualCameras = {};
for (const record of CAMERA_RECORDS) {
  const extracted = extractLegacyScene(sceneDataSource, record.legacySource.sourceSceneName);
  actualCameras[record.sceneId] = extracted;
  const values = record.legacyValues;
  assert.equal(values.cameraType, 'PerspectiveCamera');
  assert.equal(values.coordinateSpace, 'THREE_WORLD');
  assert.equal(values.fovBasis, 'VERTICAL_THREE');
  assert.equal(values.aspect, aspect);
  assert.equal(values.fov, extracted.fov);
  assert.deepEqual(Object.values(values.position), extracted.position);
  assert.equal(values.target, null);
  assert.deepEqual([values.orientation.x, values.orientation.y, values.orientation.z], extracted.eulerXyzDegrees);
  assert.equal(values.zoom, zoom);
  assert.equal(values.zoomModel, 'FOV_SCALE');
  assert.equal(values.lensShiftX, lensShiftX);
  assert.equal(values.lensShiftY, lensShiftY);
  assert.equal(values.lensShiftModel, 'VIEW_OFFSET');
  assert.equal(values.near, near);
  assert.equal(values.far, far);
  assert.deepEqual(record.lockPolicy, LEGACY_CAMERA_LOCK_POLICY);
  assert(Object.isFrozen(values) && Object.isFrozen(values.position) && Object.isFrozen(values.orientation));
  assert.notStrictEqual(record.legacyValues, record.currentValues);
  assert.notStrictEqual(record.legacyValues.position, record.currentValues.position);
  assert.deepEqual(record.currentValues, record.legacyValues);
}

const editableRecords = createEditableCameraRecords();
const frontState = editableRecords.find((record) => record.sceneId === 'FRONT');
const frontSweetState = editableRecords.find((record) => record.sceneId === 'FRONT_SWEET');
frontState.currentValues.position.x = 123;
assert.notEqual(frontState.currentValues.position.x, frontState.legacyValues.position.x);
assert.equal(frontSweetState.currentValues.position.x, frontSweetState.legacyValues.position.x);
assert.equal(CAMERA_RECORDS[0].legacyValues.position.x, -8.587);
assert(editableRecords.every((record) => record.lockPolicy === LEGACY_CAMERA_LOCK_POLICY));
resetCameraRecordToLegacy(frontState);
assert.deepEqual(frontState.currentValues, frontState.legacyValues);

const legacySceneById = Object.fromEntries(SITE_SCENE_PROFILE.worlds.legacy2d.normalScenes.map((scene) => [scene.label.toUpperCase(), scene]));
legacySceneById.FRONT_SWEET = SITE_SCENE_PROFILE.worlds.legacy2d.normalScenes.find((scene) => scene.label === 'Front_Sweet');
for (const record of CAMERA_RECORDS) {
  const scene = legacySceneById[record.sceneId];
  assert(scene, `Missing Block 3 scene contract for ${record.sceneId}.`);
  assert.equal(scene.camera.fov, record.legacyValues.fov);
  assert.deepEqual(scene.camera.position, Object.values(record.legacyValues.position));
  assert.deepEqual(scene.camera.eulerXyzDegrees, Object.values(record.legacyValues.orientation).slice(1));
}

assert.deepEqual(PHOTO_NATIVE_FRAME, { nativeWidth: 8256, nativeHeight: 5504, nativeAspect: 1.5, aspectLabel: '3:2' });
assert.deepEqual(PHOTO_SCENE_RECORDS.map((record) => record.sceneId), sceneIds);
assert.deepEqual(LOCATION_RECORDS.map((record) => record.sceneId), sceneIds);
assert.equal(new Set(PHOTO_SCENE_RECORDS.map((record) => record.cameraId)).size, 4);
assert.equal(new Set(LOCATION_RECORDS.map((record) => record.locationId)).size, 4);

const expectedMappings = {
  FRONT: ['LUUX_Front'],
  FRONT_SWEET: ['LUUX_F_Sweet'],
  BACK: ['LUUX_Back', 'ILMIN_Back'],
  NIGHT: ['LUUX_B_Night', 'ILMIN_B_Night']
};
const actualPhotos = {};
for (const record of PHOTO_SCENE_RECORDS) {
  assert.deepEqual(record.mapping.exactMeshNames, expectedMappings[record.sceneId]);
  assert.equal(record.mapping.strategy, 'LEGACY_MESH_MAPPING');
  assert.equal(record.mapping.legacyAssetId, 'legacy2d');
  assert.equal(record.pointSupport, true);
  assert.equal(record.pointRuntimeStatus, 'DEFERRED_BLOCK_4C');
  assert.equal(record.photoAsset.runtimeUrl, null);
  assert.equal(record.photoAsset.runtimeUrlStatus, 'UNRESOLVED');

  const projectPhoto = await readFile(path.join(projectRoot, record.photoAsset.path));
  const legacyPhoto = await readFile(path.join(legacyRoot, record.photoAsset.legacyPath.replace('./', '')));
  const dimensions = jpegDimensions(projectPhoto);
  assert.equal(projectPhoto.length, record.photoAsset.byteLength);
  assert.equal(sha256(projectPhoto), record.photoAsset.sha256);
  assert.equal(sha256(legacyPhoto), record.photoAsset.sha256);
  assert.deepEqual(dimensions, { width: PHOTO_NATIVE_FRAME.nativeWidth, height: PHOTO_NATIVE_FRAME.nativeHeight });
  actualPhotos[record.sceneId] = {
    legacyPath: record.photoAsset.legacyPath,
    projectPath: record.photoAsset.path,
    bytes: projectPhoto.length,
    width: dimensions.width,
    height: dimensions.height,
    sha256: record.photoAsset.sha256
  };
}

for (const record of LOCATION_RECORDS) {
  assert.equal(record.worldPosition, null);
  assert.equal(record.thumbnailAsset, null);
  assert.equal(record.uiOffset, null);
  assert.equal(record.enabled, false);
  assert.equal(record.resolutionStatus, 'UNRESOLVED');
}

assert.equal(SITE_CALIBRATION_PROFILE.coordinatePolicy.functionalSignageGlb, 'DIRECT_NO_CONVERSION');
assert.equal(SITE_CALIBRATION_PROFILE.coordinatePolicy.environmentGlb, 'DIRECT_NO_CONVERSION');
assert.equal(SITE_CALIBRATION_PROFILE.coordinatePolicy.legacyCamera, 'DIRECT_THREE_VALUES');
assert.equal(SITE_CALIBRATION_PROFILE.coordinatePolicy.maxLikeCameraInputAdapter, 'UNRESOLVED');
assert(CAMERA_RECORDS.every((record) => record.role === 'PHOTO_REFERENCE_CAMERA'));

const rendererSource = await readFile(rendererPath, 'utf8');
const rendererHtml = await readFile(rendererHtmlPath, 'utf8');
assert(/id="legacy-camera-lock-button"[^>]*aria-pressed="true"[^>]*hidden/.test(rendererHtml));
assert(/legacyCameraLocked:\s*true/.test(rendererSource));
assert(/enteringLegacy[\s\S]*state\.site\.legacyCameraLocked = true/.test(rendererSource));
assert(/siteSceneSelect\.addEventListener\('change',[\s\S]*lockLegacyCamera\(\)/.test(rendererSource));
assert(/!legacyContext \|\| !state\.site\.legacyCameraLocked/.test(rendererSource));
const pointerRequirementsSource = rendererSource.slice(
  rendererSource.indexOf('function pointerRequirementsSatisfied()'),
  rendererSource.indexOf('function updatePointerControls()')
);
assert(pointerRequirementsSource.includes('state.site.surfaceSetAvailable'));
assert(!pointerRequirementsSource.includes('controlsSite.enabled'), 'POINT availability must not depend on unlocked camera controls.');
assert(!/gltf\.scene\.(?:position|rotation|scale)\b/.test(rendererSource), 'Runtime must not apply basis conversion to either GLB root.');

const threePerspectiveSource = await readFile(path.join(appRoot, 'node_modules', 'three', 'src', 'cameras', 'PerspectiveCamera.js'), 'utf8');
assert(/vertical field of view/i.test(threePerspectiveSource), 'Installed Three.js source must confirm vertical PerspectiveCamera FOV.');

const baselineAssetPaths = {
  world3d: path.join(projectRoot, '3DAsset', 'Signage', SITE_ASSETS.world3d.fileName),
  legacy2d: path.join(appRoot, 'assets', 'site', SITE_ASSETS.legacy2d.fileName)
};
const block3Assets = {};
for (const [assetId, asset] of Object.entries(SITE_ASSETS)) {
  const bytes = await readFile(baselineAssetPaths[assetId]);
  assert.equal(bytes.length, asset.byteLength);
  assert.equal(sha256(bytes), asset.sha256);
  block3Assets[assetId] = { bytes: bytes.length, sha256: sha256(bytes) };
}

console.log(JSON.stringify({
  pass: true,
  source: {
    path: SITE_CALIBRATION_PROFILE.source.path,
    bytes: legacyHtmlBytes.length,
    sha256: sha256(legacyHtmlBytes),
    cameraApplication: 'direct THREE.Euler XYZ; no target/lookAt/OrbitControls'
  },
  cameraSharedValues: {
    type: 'PerspectiveCamera',
    aspect,
    near,
    far,
    zoom,
    lensShiftX,
    lensShiftY,
    fovBasis: 'VERTICAL_THREE'
  },
  cameras: actualCameras,
  photos: actualPhotos,
  mappings: expectedMappings,
  independentEditableRecords: true,
  resetToLegacy: true,
  lockPolicy: LEGACY_CAMERA_LOCK_POLICY,
  lockedPointAvailable: true,
  locations: '4 independent records; placement fields UNRESOLVED for Block 4E',
  maxLikeAdapter: 'UNRESOLVED for Block 4B',
  block3Assets,
  userVisualValidation: 'REQUIRED / NOT AUTO-PASSED'
}, null, 2));
