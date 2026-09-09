import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  CANONICAL_COORDINATE_SYSTEM,
  canonicalToLocalPoint,
  localPointToCanonical
} from '../src/canonical-coordinate.js';

const width = 4728;
const height = 5760;
const geometry = new THREE.PlaneGeometry(width, height);
const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
const camera = new THREE.OrthographicCamera(-720, 720, 480, -480, 0.1, 10);
camera.position.z = 1;
const raycaster = new THREE.Raycaster();

const points = [
  { name: 'CENTER', x: 2364, y: 2880 },
  { name: 'TOP_LEFT', x: 0, y: 0 },
  { name: 'TOP_RIGHT', x: 4727, y: 0 },
  { name: 'BOTTOM_LEFT', x: 0, y: 5759 },
  { name: 'BOTTOM_RIGHT', x: 4727, y: 5759 },
  { name: 'ARBITRARY', x: 2458, y: 1786 }
];

const cameraStates = [
  { name: 'FIT', zoom: 0.12, x: 0, y: 0 },
  { name: '1:1', zoom: 1, x: 0, y: 0 },
  { name: '200%', zoom: 2, x: 0, y: 0 },
  { name: '400%', zoom: 4, x: 0, y: 0 },
  { name: 'PAN', zoom: 4, x: 1700, y: -2100 }
];

function raycastCanonical(sourceX, sourceY) {
  camera.updateMatrixWorld(true);
  mesh.updateMatrixWorld(true);
  const local = new THREE.Vector3(sourceX - width / 2 + 0.25, height / 2 - sourceY - 0.25, 0);
  const world = mesh.localToWorld(local.clone());
  const ndc = world.clone().project(camera);
  raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
  const hit = raycaster.intersectObject(mesh, false)[0];
  assert.ok(hit, 'Projected source point must raycast back to the image plane.');
  const recovered = mesh.worldToLocal(hit.point.clone());
  return localPointToCanonical(recovered.x, recovered.y, width, height);
}

const mappings = [];
for (const cameraState of cameraStates) {
  camera.zoom = cameraState.zoom;
  camera.position.x = cameraState.x;
  camera.position.y = cameraState.y;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  for (const point of points) {
    const canonical = raycastCanonical(point.x, point.y);
    assert.equal(canonical.x, point.x, `${cameraState.name} ${point.name} x mismatch`);
    assert.equal(canonical.y, point.y, `${cameraState.name} ${point.name} y mismatch`);
    assert.ok(canonical.u >= 0 && canonical.u <= 1);
    assert.ok(canonical.v >= 0 && canonical.v <= 1);
    const markerLocal = canonicalToLocalPoint(canonical, width, height);
    const expectedLocal = new THREE.Vector2(point.x - width / 2 + 0.25, height / 2 - point.y - 0.25);
    assert.ok(new THREE.Vector2(markerLocal.x, markerLocal.y).distanceTo(expectedLocal) < 1e-9,
      `${cameraState.name} ${point.name} marker projection mismatch`);
    mappings.push({ camera: cameraState.name, point: point.name, x: canonical.x, y: canonical.y });
  }
}

const topLeftEdge = localPointToCanonical(-width / 2, height / 2, width, height);
const bottomRightEdge = localPointToCanonical(width / 2, -height / 2, width, height);
assert.deepEqual({ x: topLeftEdge.x, y: topLeftEdge.y, u: topLeftEdge.u, v: topLeftEdge.v }, { x: 0, y: 0, u: 0, v: 0 });
assert.deepEqual({ x: bottomRightEdge.x, y: bottomRightEdge.y, u: bottomRightEdge.u, v: bottomRightEdge.v }, { x: width - 1, y: height - 1, u: 1, v: 1 });

console.log(JSON.stringify({
  pass: true,
  coordinateSystem: CANONICAL_COORDINATE_SYSTEM,
  source: { width, height },
  cameraStates: cameraStates.map(({ name }) => name),
  points: points.map(({ name }) => name),
  assertions: mappings.length * 2 + 2,
  markerProjectionAssertions: mappings.length
}, null, 2));
