import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  ANAMORPHIC_BACK_PROFILE,
  BACK_ANAMORPHIC_CALIBRATION,
  ANAMORPHIC_FAMILY_AVAILABILITY,
  ANAMORPHIC_FAMILY_IDS,
  maxPositionToGltf
} from '../src/anamorphic-calibration-profile.js';
import { SITE_SCENE_PROFILE, resolveSurfaceSet } from '../src/site-scene-profile.js';
import { inspectAnamorphicGlb } from '../scripts/anamorphic-glb-inspection.mjs';

globalThis.self ??= globalThis;
globalThis.ProgressEvent ??= class ProgressEvent {
  constructor(type, properties = {}) {
    this.type = type;
    Object.assign(this, properties);
  }
};

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(appRoot, '..');
const profile = ANAMORPHIC_BACK_PROFILE;
const assetPath = path.join(projectRoot, ...profile.asset.sourcePath.split('/'));
const file = await readFile(assetPath);
const inspection = inspectAnamorphicGlb(file);
const records = new Map(inspection.nodeRecords.map((record) => [record.name, record]));
const approx = (actual, expected, epsilon = 1e-8) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
const vectorApprox = (actual, expected, epsilon = 1e-8) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => approx(value, expected[index], epsilon));
};

assert.equal(inspection.byteLength, profile.asset.observedBytes);
assert.equal(inspection.sha256, profile.asset.observedSha256);
assert.deepEqual(
  { scenes: inspection.scenes, nodes: inspection.nodes, meshes: inspection.meshes, materials: inspection.materials, cameras: inspection.cameras, animations: inspection.animations },
  { scenes: 1, nodes: 5, meshes: 5, materials: 1, cameras: 0, animations: 0 }
);
assert.deepEqual([...records.keys()].sort(), [...profile.asset.expectedExactNodes].sort());
assert.equal([...records.keys()].some((name) => name.includes('FRONT75F')), false);

const surface = records.get(profile.surface.surfaceNode);
const pivot = records.get('CALCAM_BACK_PIVOT');
const heading = records.get('CALCAM_BACK_HEADING');
const lookAt = records.get('CALCAM_BACK_LOOKAT');
const collision = records.get('CALCAM_BACK_LOOKAT_COLLISION');
for (const node of [surface, pivot, heading, lookAt, collision]) assert.ok(node);
assert.deepEqual(surface.uv0Bounds, profile.surface.observedUvBounds);
assert.deepEqual(surface.worldBounds, profile.surface.observedWorldBounds);
assert.equal(profile.surface.uvPolicy, 'PRESERVE_AUTHORED_NO_REMAP');
assert.equal(profile.surface.photoshopPointStatus, 'DEFERRED_CANONICAL_INVERSE_MAPPING_UNPROVEN');

vectorApprox(pivot.worldPosition, profile.camera.runtimePosition);
assert.equal(profile.camera.helperAxisMapping.helperScalePolicy, 'IGNORED');
const pointDirection = (from, to) => new THREE.Vector3().fromArray(to).sub(new THREE.Vector3().fromArray(from)).normalize();
const runtimeForward = new THREE.Vector3().fromArray(profile.camera.runtimeForward);
const lookAtDirection = pointDirection(pivot.worldPosition, lookAt.worldPosition);
const collisionDirection = pointDirection(pivot.worldPosition, collision.worldPosition);
assert.ok(lookAtDirection.angleTo(runtimeForward) < 0.00001);
assert.ok(collisionDirection.angleTo(runtimeForward) < 0.00001);
vectorApprox(pivot.worldAxes.x, profile.camera.runtimeRight, 2e-7);
vectorApprox(pivot.worldAxes.z.map((value) => -value), profile.camera.runtimeUp, 2e-7);
approx(new THREE.Vector3().fromArray(pivot.worldPosition).distanceTo(new THREE.Vector3().fromArray(lookAt.worldPosition)), profile.camera.helperWorldTransforms.lookAt.distanceFromPivot, 1e-10);
approx(new THREE.Vector3().fromArray(pivot.worldPosition).distanceTo(new THREE.Vector3().fromArray(collision.worldPosition)), profile.camera.helperWorldTransforms.collision.distanceFromPivot, 1e-10);
assert.equal(profile.camera.helperWorldTransforms.collision.distancePolicy, 'VARIABLE_NOT_CONTRACTUAL');

const expectedPosition = maxPositionToGltf(profile.camera.sourcePosition);
vectorApprox(expectedPosition, profile.camera.maxToGltfPositionExpected, 1e-12);
vectorApprox(pivot.worldPosition.map((value, index) => value - expectedPosition[index]), profile.camera.maxToGltfPositionObservedDelta, 1e-12);

const runtimeQuaternion = new THREE.Quaternion().fromArray(profile.camera.runtimeQuaternion);
approx(runtimeQuaternion.length(), 1, 1e-8);
assert.ok(new THREE.Vector3(0, 0, -1).applyQuaternion(runtimeQuaternion).distanceTo(runtimeForward) < 2e-7);
assert.ok(new THREE.Vector3(0, 1, 0).applyQuaternion(runtimeQuaternion).distanceTo(new THREE.Vector3().fromArray(profile.camera.runtimeUp)) < 2e-7);
assert.deepEqual(profile.camera.sourceFovDegrees, { horizontal: 10.109, vertical: 18.374, diagonal: 20.889 });
assert.equal(profile.camera.runtimeFov, BACK_ANAMORPHIC_CALIBRATION.verticalFov);
assert.equal(profile.camera.runtimeAspect, BACK_ANAMORPHIC_CALIBRATION.aspect);
assert.equal(profile.camera.runtimeAspect, profile.workingResolution.aspect);
assert.equal(BACK_ANAMORPHIC_CALIBRATION.aspect, 0.546875);
approx(BACK_ANAMORPHIC_CALIBRATION.derivedHorizontalFov, 10.108984229243422, 1e-12);
approx(BACK_ANAMORPHIC_CALIBRATION.derivedDiagonalFov, 20.888949632438322, 1e-12);
assert.ok(Math.abs(BACK_ANAMORPHIC_CALIBRATION.derivedHorizontalFov - BACK_ANAMORPHIC_CALIBRATION.horizontalFov) <= BACK_ANAMORPHIC_CALIBRATION.consistencyToleranceDegrees);
assert.ok(Math.abs(BACK_ANAMORPHIC_CALIBRATION.derivedDiagonalFov - BACK_ANAMORPHIC_CALIBRATION.diagonalFov) <= BACK_ANAMORPHIC_CALIBRATION.consistencyToleranceDegrees);
assert.deepEqual(profile.workingResolution, { width: 2100, height: 3840, aspect: 0.546875 });
assert.deepEqual(profile.finalOutput, { id: 'LUUX_FINAL_MASTER', width: 4728, height: 5760, immutable: true });
assert.equal(profile.camera.calibrationStatus, 'APPROVED');
assert.equal(profile.camera.visualValidationState, 'PASS');
assert.equal(profile.camera.validationDate, '2026-09-11');

assert.equal(ANAMORPHIC_FAMILY_AVAILABILITY[ANAMORPHIC_FAMILY_IDS.BACK].profile, profile);
for (const familyId of [ANAMORPHIC_FAMILY_IDS.ILMIN_AQUBE, ANAMORPHIC_FAMILY_IDS.FRONT_90F]) {
  assert.deepEqual(ANAMORPHIC_FAMILY_AVAILABILITY[familyId], { available: false, status: 'NOT_AVAILABLE' });
}
const family = SITE_SCENE_PROFILE.worlds.world3d.anamorphicFamilies.back;
assert.equal(family.assetId, 'anamorphicBack');
assert.equal(family.surfaces.length, 1);
assert.equal(family.surfaces[0].selector.exactName, 'ANAM_SURFACE_BACK');
assert.equal(family.surfaces[0].pointEnabled, false);

const arrayBuffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
const gltf = await new GLTFLoader().parseAsync(arrayBuffer, '');
const meshes = [];
gltf.scene.traverse((child) => { if (child.isMesh) meshes.push(child); });
const resolution = resolveSurfaceSet(meshes, family.surfaces);
assert.equal(resolution.available, true);
assert.deepEqual(resolution.resolved.map((binding) => binding.mesh.name), ['ANAM_SURFACE_BACK']);
assert.equal(meshes.filter((mesh) => mesh.name.startsWith('CALCAM_')).length, 4);

console.log(JSON.stringify({
  block: '5B',
  status: 'PASS_CLOSED',
  asset: { path: profile.asset.sourcePath, bytes: inspection.byteLength, sha256: inspection.sha256 },
  alignment: {
    pivotToLookAtDegrees: THREE.MathUtils.radToDeg(lookAtDirection.angleTo(runtimeForward)),
    pivotToCollisionDegrees: THREE.MathUtils.radToDeg(collisionDirection.angleTo(runtimeForward)),
    lookAtDistance: profile.camera.helperWorldTransforms.lookAt.distanceFromPivot,
    collisionDistance: profile.camera.helperWorldTransforms.collision.distanceFromPivot
  },
  projection: {
    runtimeVerticalFov: profile.camera.runtimeFov,
    runtimeAspect: profile.camera.runtimeAspect,
    workingCanvasAspect: profile.workingResolution.aspect,
    separated: false,
    derivedHorizontalFov: BACK_ANAMORPHIC_CALIBRATION.derivedHorizontalFov,
    derivedDiagonalFov: BACK_ANAMORPHIC_CALIBRATION.derivedDiagonalFov,
    consistencyToleranceDegrees: BACK_ANAMORPHIC_CALIBRATION.consistencyToleranceDegrees
  },
  userValidation: 'PASS_CLOSED'
}, null, 2));
