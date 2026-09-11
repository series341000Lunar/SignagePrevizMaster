import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  ANAMORPHIC_FAMILY_AVAILABILITY,
  ANAMORPHIC_FAMILY_IDS,
  ANAMORPHIC_FRONT_75F_PROFILE,
  horizontalToVerticalFov,
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
const profile = ANAMORPHIC_FRONT_75F_PROFILE;
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
  {
    gltfVersion: inspection.gltfVersion,
    scenes: inspection.scenes,
    nodes: inspection.nodes,
    meshes: inspection.meshes,
    materials: inspection.materials,
    cameras: inspection.cameras,
    animations: inspection.animations
  },
  { gltfVersion: '2.0', scenes: 1, nodes: 5, meshes: 5, materials: 1, cameras: 0, animations: 0 }
);
assert.deepEqual([...records.keys()].sort(), [...profile.asset.expectedExactNodes].sort());

const surface = records.get(profile.surface.surfaceNode);
assert.ok(surface);
assert.deepEqual(surface.uv0Bounds, profile.surface.observedUvBounds);
assert.deepEqual(surface.worldBounds, profile.surface.observedWorldBounds);
assert.notDeepEqual(surface.uv0Bounds, { min: [0, 0], max: [1, 1] });
assert.equal(profile.surface.uvPolicy, 'PRESERVE_AUTHORED_NO_REMAP');
assert.equal(profile.surface.photoshopPointStatus, 'DEFERRED_CANONICAL_INVERSE_MAPPING_UNPROVEN');

const pivot = records.get('CALCAM_FRONT75F_PIVOT');
const heading = records.get('CALCAM_FRONT75F_HEADING');
const lookAt = records.get('CALCAM_FRONT75F_LOOKAT');
const collision = records.get('CALCAM_FRONT75F_LOOKAT_COLLISION');
for (const helper of [pivot, heading, lookAt, collision]) assert.ok(helper);
vectorApprox(pivot.worldPosition, profile.camera.runtimePosition);
assert.ok(pivot.scale.every((value) => Math.abs(value - 0.001) < 1e-8));
assert.equal(profile.camera.helperAxisMapping.helperScalePolicy, 'IGNORED');

const pointDirection = (from, to) => new THREE.Vector3().fromArray(to).sub(new THREE.Vector3().fromArray(from)).normalize();
const runtimeForward = new THREE.Vector3().fromArray(profile.camera.runtimeForward);
assert.ok(pointDirection(pivot.worldPosition, lookAt.worldPosition).angleTo(runtimeForward) < 0.000003);
assert.ok(pointDirection(pivot.worldPosition, collision.worldPosition).angleTo(runtimeForward) < 0.00012);
vectorApprox(pivot.worldAxes.x, profile.camera.runtimeRight, 2e-7);
vectorApprox(pivot.worldAxes.z.map((value) => -value), profile.camera.runtimeUp, 2e-7);

const expectedPosition = maxPositionToGltf(profile.camera.sourcePosition);
vectorApprox(expectedPosition, profile.camera.maxToGltfPositionExpected, 1e-12);
assert.ok(new THREE.Vector3().fromArray(pivot.worldPosition).distanceTo(new THREE.Vector3().fromArray(expectedPosition)) < 0.00005);

const runtimeQuaternion = new THREE.Quaternion().fromArray(profile.camera.runtimeQuaternion);
approx(runtimeQuaternion.length(), 1, 1e-8);
assert.ok(new THREE.Vector3(0, 0, -1).applyQuaternion(runtimeQuaternion).distanceTo(runtimeForward) < 2e-7);
assert.ok(new THREE.Vector3(0, 1, 0).applyQuaternion(runtimeQuaternion)
  .distanceTo(new THREE.Vector3().fromArray(profile.camera.runtimeUp)) < 2e-7);
approx(horizontalToVerticalFov(profile.camera.sourceFov, profile.camera.aspectUsed),
  profile.camera.fovCandidates.horizontalSourceToVerticalThree, 1e-12);
assert.equal(profile.camera.sourceFovBasis, 'HORIZONTAL_3DS_MAX_DEFAULT_CAMERA_USER_CONFIRMED');
assert.deepEqual(profile.camera.sourceFovDegrees, {
  horizontal: 15.52,
  vertical: 19.778,
  diagonal: 24.962
});
assert.equal(profile.camera.runtimeFov, 19.778);
assert.equal(profile.camera.runtimeFovBasis, 'VERTICAL_THREE_FROM_3DS_MAX_USER_CONFIRMED');
assert.equal(profile.camera.fovCandidates.maxReportedVertical, 19.778);
assert.equal(profile.camera.fovCandidates.maxReportedDiagonal, 24.962);
assert.equal(profile.camera.visualValidationState, 'PASS');
assert.equal(profile.camera.calibrationStatus, 'USER_VALIDATED');
assert.equal(profile.camera.validationDate, '2026-09-11');
assert.deepEqual(profile.workingResolution, { width: 3000, height: 3840, aspect: 0.78125 });
assert.deepEqual(profile.finalOutput, { id: 'LUUX_FINAL_MASTER', width: 4728, height: 5760, immutable: true });

for (const familyId of [ANAMORPHIC_FAMILY_IDS.BACK, ANAMORPHIC_FAMILY_IDS.ILMIN_AQUBE, ANAMORPHIC_FAMILY_IDS.FRONT_90F]) {
  assert.deepEqual(ANAMORPHIC_FAMILY_AVAILABILITY[familyId], { available: false, status: 'NOT_AVAILABLE' });
}

const family = SITE_SCENE_PROFILE.worlds.world3d.anamorphicFamilies.front75f;
assert.equal(family.assetId, 'anamorphicFront75f');
assert.equal(family.surfaces.length, 1);
assert.equal(family.surfaces[0].selector.exactName, profile.surface.surfaceNode);
assert.equal(family.surfaces[0].selector.prefixIncludes, null);
assert.equal(family.surfaces[0].pointEnabled, false);

const arrayBuffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
const gltf = await new GLTFLoader().parseAsync(arrayBuffer, '');
const meshes = [];
gltf.scene.traverse((child) => { if (child.isMesh) meshes.push(child); });
const resolution = resolveSurfaceSet(meshes, family.surfaces);
assert.equal(resolution.available, true);
assert.deepEqual(resolution.resolved.map((binding) => binding.mesh.name), ['ANAM_SURFACE_FRONT75F']);
assert.equal(meshes.filter((mesh) => mesh.name.startsWith('CALCAM_')).length, 4);
assert.equal(meshes.some((mesh) => mesh.name.includes('LUUX_Front_3Dworld_Anamorphic')), false);

console.log(JSON.stringify({
  block: '5A',
  status: 'AUTOMATED_TECHNICAL_PASS',
  asset: {
    path: profile.asset.sourcePath,
    bytes: inspection.byteLength,
    sha256: inspection.sha256,
    inventory: { scenes: 1, nodes: 5, meshes: 5, materials: 1, cameras: 0, animations: 0 }
  },
  surface: {
    node: surface.name,
    uvBounds: surface.uv0Bounds,
    worldBounds: surface.worldBounds,
    uvRemapped: false
  },
  camera: {
    position: profile.camera.runtimePosition,
    forward: profile.camera.runtimeForward,
    up: profile.camera.runtimeUp,
    quaternion: profile.camera.runtimeQuaternion,
    sourceFov: profile.camera.sourceFov,
    sourceFovBasis: profile.camera.sourceFovBasis,
    runtimeFov: profile.camera.runtimeFov,
    runtimeFovBasis: profile.camera.runtimeFovBasis,
    visualValidationState: profile.camera.visualValidationState
  },
  missingFamilies: 'NOT_AVAILABLE',
  userValidation: 'PASS'
}, null, 2));
