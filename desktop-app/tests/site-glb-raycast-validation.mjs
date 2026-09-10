import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { normalizedPointToCanonical } from '../src/canonical-coordinate.js';
import { SITE_SCENE_PROFILE, resolveSurfaceSet } from '../src/site-scene-profile.js';

globalThis.self ??= globalThis;
globalThis.ProgressEvent ??= class ProgressEvent {
  constructor(type, properties = {}) {
    this.type = type;
    Object.assign(this, properties);
  }
};

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(appRoot, '..');
const assetPath = path.join(projectRoot, '3DAsset', 'Signage', SITE_SCENE_PROFILE.assets.world3d.fileName);
const file = await readFile(assetPath);
const arrayBuffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
const gltf = await new GLTFLoader().parseAsync(arrayBuffer, '');
const meshes = [];
gltf.scene.traverse((child) => {
  if (!child.isMesh) return;
  child.material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  child.visible = false;
  meshes.push(child);
});

const resolution = resolveSurfaceSet(meshes, SITE_SCENE_PROFILE.worlds.world3d.normalSurfaces);
assert.equal(resolution.available, true);
assert.equal(resolution.resolved.length, 2);
for (const binding of resolution.resolved) binding.mesh.visible = true;
gltf.scene.updateMatrixWorld(true);

const bounds = new THREE.Box3();
for (const binding of resolution.resolved) bounds.expandByObject(binding.mesh);
const center = bounds.getCenter(new THREE.Vector3());
const size = bounds.getSize(new THREE.Vector3());
const radius = Math.max(1, size.length() * 0.5);
const camera = new THREE.PerspectiveCamera(45, 1.5, 0.01, 10000);
camera.position.copy(center).add(new THREE.Vector3(radius * 1.15, radius * 0.45, radius * 1.9));
camera.lookAt(center);
camera.updateProjectionMatrix();
camera.updateMatrixWorld(true);

const raycaster = new THREE.Raycaster();
const results = [];
for (const binding of resolution.resolved) {
  const geometry = binding.mesh.geometry;
  const positions = geometry.getAttribute('position');
  const indices = geometry.index;
  let hit = null;
  for (let triangle = 0; triangle < indices.count / 3; triangle += Math.max(1, Math.floor(indices.count / 3000))) {
    const a = indices.getX(triangle * 3);
    const b = indices.getX(triangle * 3 + 1);
    const c = indices.getX(triangle * 3 + 2);
    const local = new THREE.Vector3(
      (positions.getX(a) + positions.getX(b) + positions.getX(c)) / 3,
      (positions.getY(a) + positions.getY(b) + positions.getY(c)) / 3,
      (positions.getZ(a) + positions.getZ(b) + positions.getZ(c)) / 3
    );
    const ndc = binding.mesh.localToWorld(local).project(camera);
    if (Math.abs(ndc.x) > 0.98 || Math.abs(ndc.y) > 0.98 || ndc.z < -1 || ndc.z > 1) continue;
    raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
    hit = raycaster.intersectObject(binding.mesh, false)[0] ?? null;
    if (hit?.uv) break;
  }
  assert.ok(hit?.uv, `${binding.mesh.name} must be raycastable through its actual GLB geometry.`);
  const canonical = normalizedPointToCanonical(hit.uv.x, hit.uv.y, 4728, 5760);
  assert.ok(canonical.x >= 0 && canonical.x < 4728);
  assert.ok(canonical.y >= 0 && canonical.y < 5760);
  const localMarker = binding.mesh.worldToLocal(hit.point.clone());
  const before = binding.mesh.localToWorld(localMarker.clone()).project(camera);
  camera.position.add(new THREE.Vector3(0.35, 0.15, -0.25));
  camera.lookAt(center);
  camera.updateMatrixWorld(true);
  const after = binding.mesh.localToWorld(localMarker.clone()).project(camera);
  assert.ok(before.distanceTo(after) > 0, 'Marker projection must move after a camera change.');
  results.push({
    role: binding.contract.role,
    mesh: binding.mesh.name,
    uv: [hit.uv.x, hit.uv.y],
    canonical: [canonical.x, canonical.y],
    markerProjectionMoved: true
  });
}

const inactiveMeshes = meshes.filter((mesh) => !resolution.resolved.some((binding) => binding.mesh === mesh));
assert.equal(inactiveMeshes.length, 0);
assert.equal(inactiveMeshes.every((mesh) => mesh.visible === false), true);
const anamorphic = resolveSurfaceSet(meshes, SITE_SCENE_PROFILE.worlds.world3d.anamorphicSurfaces);
assert.equal(anamorphic.available, false);
assert.equal(anamorphic.resolved.length, 0);

console.log(JSON.stringify({
  pass: true,
  glbMeshCount: meshes.length,
  activeSurfaceCount: resolution.resolved.length,
  inactiveSurfaceCount: inactiveMeshes.length,
  results,
  anamorphic: { available: anamorphic.available, missing: anamorphic.missing }
}, null, 2));
