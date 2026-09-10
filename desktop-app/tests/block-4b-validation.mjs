import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import {
  CAMERA_INPUT_MODES,
  MAX_LIKE_ADAPTER_STATUS,
  commitCameraRecordTransaction,
  createMaxLikeCandidate,
  createThreeDirectCandidate,
  horizontalToVerticalFov,
  maxLikePointToThree,
  threePointToMaxLike,
  verticalToHorizontalFov
} from '../src/camera-input-adapter.js';
import { CAMERA_RECORDS, SITE_CALIBRATION_PROFILE, createEditableCameraRecords } from '../src/site-calibration-profile.js';
import { SITE_ASSETS } from '../src/site-scene-profile.js';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rendererSource = await readFile(path.join(appRoot, 'src', 'renderer.js'), 'utf8');
const htmlSource = await readFile(path.join(appRoot, 'src', 'index.html'), 'utf8');
const stylesSource = await readFile(path.join(appRoot, 'src', 'styles.css'), 'utf8');

function near(actual, expected, tolerance = 1e-10) {
  assert(Math.abs(actual - expected) <= tolerance, `${actual} must be within ${tolerance} of ${expected}`);
}

const samplePoints = [
  { x: 0, y: 0, z: 0 },
  { x: 1, y: 2, z: 3 },
  { x: -8.25, y: 11.5, z: -0.125 },
  { x: 4000, y: -2000, z: 900 }
];
for (const maxPoint of samplePoints) {
  const threePoint = maxLikePointToThree(maxPoint);
  assert.deepEqual(threePoint, { x: maxPoint.x, y: maxPoint.z, z: -maxPoint.y });
  assert.deepEqual(threePointToMaxLike(threePoint), maxPoint);
}

const fovCases = [
  { vertical: 52.4, aspect: 1.5 },
  { vertical: 35, aspect: 16 / 9 },
  { vertical: 90, aspect: 1 }
];
for (const sample of fovCases) {
  const horizontal = verticalToHorizontalFov(sample.vertical, sample.aspect);
  near(horizontalToVerticalFov(horizontal, sample.aspect), sample.vertical);
}
near(horizontalToVerticalFov(90, 1.5), 67.38013505195957);

assert.deepEqual(CAMERA_RECORDS.map((record) => record.sceneId), ['FRONT', 'FRONT_SWEET', 'BACK', 'NIGHT']);
assert(CAMERA_RECORDS.every((record) => Object.isFrozen(record.legacyValues)));
assert.equal(SITE_CALIBRATION_PROFILE.coordinatePolicy.maxLikeCameraInputAdapter.status, MAX_LIKE_ADAPTER_STATUS);
assert.equal(SITE_CALIBRATION_PROFILE.coordinatePolicy.maxLikeCameraInputAdapter.scope, 'CAMERA_INPUT_ONLY');
assert.equal(SITE_CALIBRATION_PROFILE.unresolved.maxLikeCalibration, 'BLOCK_4B_USER_GATE');
const editableRecords = createEditableCameraRecords();
assert.equal(new Set(editableRecords.map((record) => record.cameraId)).size, 4);

for (const record of editableRecords) {
  const legacy = record.legacyValues;
  const direct = createThreeDirectCandidate(record.currentValues, {
    position: legacy.position,
    eulerXyzDegrees: legacy.orientation,
    fov: legacy.fov
  });
  assert.deepEqual(direct, legacy);
}

const front = editableRecords.find((record) => record.sceneId === 'FRONT');
const legacyFront = structuredClone(front.legacyValues);
const directCandidate = createThreeDirectCandidate(front.currentValues, {
  position: { x: -7.5, y: 2.25, z: 11.75 },
  eulerXyzDegrees: { x: 12, y: -34, z: 5 },
  fov: 48
});
let appliedCandidate = null;
commitCameraRecordTransaction({
  record: front,
  nextValues: directCandidate,
  applyRuntime: (candidate) => { appliedCandidate = structuredClone(candidate); }
});
assert.deepEqual(front.currentValues, directCandidate);
assert.deepEqual(appliedCandidate, directCandidate);
assert.deepEqual(front.legacyValues, legacyFront);
assert.deepEqual(editableRecords.find((record) => record.sceneId === 'BACK').currentValues, CAMERA_RECORDS[2].legacyValues);

const beforeInvalid = structuredClone(front.currentValues);
for (const invalid of [
  { position: { x: 'NaN', y: 0, z: 0 }, eulerXyzDegrees: { x: 0, y: 0, z: 0 }, fov: 45 },
  { position: { x: 0, y: 0, z: 0 }, eulerXyzDegrees: { x: Infinity, y: 0, z: 0 }, fov: 45 },
  { position: { x: 0, y: 0, z: 0 }, eulerXyzDegrees: { x: 0, y: 0, z: 0 }, fov: 180 }
]) {
  assert.throws(() => createThreeDirectCandidate(front.currentValues, invalid));
  assert.deepEqual(front.currentValues, beforeInvalid);
}

let runtimeRestored = false;
assert.throws(() => commitCameraRecordTransaction({
  record: front,
  nextValues: front.legacyValues,
  applyRuntime: () => { throw new Error('synthetic runtime failure'); },
  restoreRuntime: () => { runtimeRestored = true; }
}), /synthetic runtime failure/);
assert.equal(runtimeRestored, true);
assert.deepEqual(front.currentValues, beforeInvalid);
assert.deepEqual(front.legacyValues, legacyFront);

const maxInput = {
  position: { x: 10, y: 20, z: 30 },
  target: { x: 4, y: -2, z: 8 },
  fov: 90,
  fovBasis: 'HORIZONTAL'
};
const maxResult = createMaxLikeCandidate(front.currentValues, maxInput);
assert.deepEqual(maxResult.cameraValues.position, { x: 10, y: 30, z: -20 });
assert.deepEqual(maxResult.runtimeTarget, { x: 4, y: 8, z: 2 });
near(maxResult.cameraValues.fov, horizontalToVerticalFov(90, front.currentValues.aspect));
assert.equal(maxResult.lastInput.mode, CAMERA_INPUT_MODES.MAX_LIKE);
assert.equal(maxResult.lastInput.adapterStatus, MAX_LIKE_ADAPTER_STATUS);
commitCameraRecordTransaction({
  record: front,
  nextValues: maxResult.cameraValues,
  applyRuntime: () => {}
});
assert.deepEqual(front.currentValues, maxResult.cameraValues);
assert.deepEqual(front.legacyValues, legacyFront);

const probe = new THREE.PerspectiveCamera();
probe.position.set(
  maxResult.cameraValues.position.x,
  maxResult.cameraValues.position.y,
  maxResult.cameraValues.position.z
);
probe.rotation.order = 'XYZ';
probe.rotation.set(
  THREE.MathUtils.degToRad(maxResult.cameraValues.orientation.x),
  THREE.MathUtils.degToRad(maxResult.cameraValues.orientation.y),
  THREE.MathUtils.degToRad(maxResult.cameraValues.orientation.z)
);
const actualDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(probe.quaternion).normalize();
const expectedDirection = new THREE.Vector3(
  maxResult.runtimeTarget.x - maxResult.cameraValues.position.x,
  maxResult.runtimeTarget.y - maxResult.cameraValues.position.y,
  maxResult.runtimeTarget.z - maxResult.cameraValues.position.z
).normalize();
near(actualDirection.angleTo(expectedDirection), 0, 1e-7);
assert.throws(() => createMaxLikeCandidate(front.currentValues, {
  position: { x: 1, y: 2, z: 3 },
  target: { x: 1, y: 2, z: 3 },
  fov: 45,
  fovBasis: 'VERTICAL'
}), /different points/);
assert.deepEqual(front.legacyValues, legacyFront);

for (const id of [
  'camera-editor',
  'camera-input-mode',
  'camera-apply-button',
  'camera-reset-view-button',
  'camera-reset-legacy-button'
]) assert(htmlSource.includes(`id="${id}"`), `Missing Camera Editor control: ${id}`);
assert(htmlSource.includes('THREE DIRECT') && htmlSource.includes('3DS MAX-LIKE'));
assert(/\.camera-mode-fields\[hidden\]\s*\{\s*display:\s*none/.test(stylesSource));
assert(/cameraApplyButton\.disabled = locked \|\| !available/.test(rendererSource));
assert(/cameraResetLegacyButton\.disabled = locked \|\| !available/.test(rendererSource));
assert(/cameraResetViewButton\.disabled = !available/.test(rendererSource));
assert(/if \(!record \|\| state\.site\.legacyCameraLocked/.test(rendererSource));
assert(/enteringLegacy[\s\S]*state\.site\.legacyCameraLocked = true[\s\S]*applyCurrentCameraRecordToRuntime/.test(rendererSource));
assert(/siteSceneSelect\.addEventListener\('change',[\s\S]*lockLegacyCamera\(\)[\s\S]*applySiteSurfaceSelection\(\)/.test(rendererSource));
assert(/controlsSite\.target\.copy\(runtimeTarget/.test(rendererSource));
assert(/CAMERA_RUNTIME_ROTATION_EPSILON = 1e-7/.test(rendererSource));
assert(/cameraThreeInputs\.rotation\.x\.value = '33\.5'/.test(rendererSource));
assert(/window\.runBlock4BCameraEditorSmoke/.test(rendererSource));
assert(!/gltf\.scene\.(?:position|rotation|scale)\b/.test(rendererSource));

assert.equal(SITE_ASSETS.world3d.sha256, '5F86D3FFEB1AC5D6D5048DCC1E99525C3038BFACC63A7A07088BDBBF5A3908D3');
assert.equal(SITE_ASSETS.legacy2d.sha256, '125264CC2DF826F5F698330B7A37D5FAE372ED85AD462102DEBCA8B61D97F2C1');

console.log(JSON.stringify({
  pass: true,
  cameraIdentities: CAMERA_RECORDS.map((record) => record.sceneId),
  threeDirect: {
    exactLegacyReproduction: true,
    atomicApply: true,
    invalidInputPreservesState: true,
    runtimeFailureRollback: true,
    resetViewContract: 'currentValues -> runtime only',
    resetLegacyContract: 'legacyValues clone -> currentValues -> runtime'
  },
  maxLike: {
    status: MAX_LIKE_ADAPTER_STATUS,
    forward: 'Three.x=Max.x; Three.y=Max.z; Three.z=-Max.y',
    inverse: 'Max.x=Three.x; Max.y=-Three.z; Max.z=Three.y',
    pointRoundTrips: samplePoints.length,
    targetLookDirection: true,
    eulerImport: 'DEFERRED',
    roll: 'DEFERRED'
  },
  fov: {
    horizontalToVertical: '2 * atan(tan(horizontal / 2) / aspect)',
    roundTrips: fovCases.length,
    aspect: 1.5
  },
  lockGate: {
    numericReadOnlyWhenLocked: true,
    applyDisabledWhenLocked: true,
    resetLegacyDisabledWhenLocked: true,
    resetViewAllowedWhenLocked: true,
    pointIndependent: true
  },
  glbBasisConversion: false,
  block3FingerprintsPreserved: true,
  legacyVisualUserGate: 'OPEN',
  maxLikeCalibrationUserGate: 'OPEN'
}, null, 2));
