import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  CANONICAL_COORDINATE_SYSTEM,
  canonicalToSurfaceLocalPoint,
  surfaceLocalPointToCanonical
} from '../src/canonical-coordinate.js';

const pixelWidth = 4728;
const pixelHeight = 5760;
const planeWidth = 1;
const planeHeight = pixelHeight / pixelWidth;
const mesh = new THREE.Mesh(
  new THREE.PlaneGeometry(planeWidth, planeHeight),
  new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
);
const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.01, 100);
const raycaster = new THREE.Raycaster();

const points = [
  { name: 'CENTER', x: 2364, y: 2880 },
  { name: 'TOP_LEFT', x: 0, y: 0 },
  { name: 'TOP_RIGHT', x: 4727, y: 0 },
  { name: 'BOTTOM_LEFT', x: 0, y: 5759 },
  { name: 'BOTTOM_RIGHT', x: 4727, y: 5759 },
  { name: 'ARBITRARY', x: 1053, y: 739 }
];

const cameraStates = [
  { name: 'FRONT', position: [0, 0, 3], target: [0, 0, 0] },
  { name: 'LEFT_OBLIQUE', position: [-2, 0, 3], target: [0, 0, 0] },
  { name: 'RIGHT_OBLIQUE', position: [2, 0, 3], target: [0, 0, 0] },
  { name: 'TOP_OBLIQUE', position: [0, 2, 3], target: [0, 0, 0] },
  { name: 'BOTTOM_OBLIQUE', position: [0, -2, 3], target: [0, 0, 0] },
  { name: 'ZOOM_IN', position: [0, 0, 1.6], target: [0, 0, 0] },
  { name: 'ZOOM_OUT', position: [0, 0, 5], target: [0, 0, 0] },
  { name: 'PAN', position: [0.3, 0.2, 3], target: [0.3, 0.2, 0] }
];

const mappings = [];
for (const cameraState of cameraStates) {
  camera.position.fromArray(cameraState.position);
  camera.lookAt(new THREE.Vector3().fromArray(cameraState.target));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  mesh.updateMatrixWorld(true);

  for (const point of points) {
    const canonicalSeed = {
      u: (point.x + 0.25) / pixelWidth,
      v: (point.y + 0.25) / pixelHeight
    };
    const local = canonicalToSurfaceLocalPoint(canonicalSeed, planeWidth, planeHeight);
    const projected = mesh.localToWorld(new THREE.Vector3(local.x, local.y, 0)).project(camera);
    raycaster.setFromCamera(new THREE.Vector2(projected.x, projected.y), camera);
    const hit = raycaster.intersectObject(mesh, false)[0];
    assert.ok(hit, `${cameraState.name} ${point.name} must intersect the plane.`);
    const recovered = mesh.worldToLocal(hit.point.clone());
    const canonical = surfaceLocalPointToCanonical(
      recovered.x,
      recovered.y,
      planeWidth,
      planeHeight,
      pixelWidth,
      pixelHeight
    );
    const pixelError = Math.hypot(canonical.x - point.x, canonical.y - point.y);
    assert.ok(pixelError <= 1, `${cameraState.name} ${point.name} error ${pixelError} px exceeds 1 px.`);
    mappings.push({ camera: cameraState.name, point: point.name, x: canonical.x, y: canonical.y, pixelError });
  }
}

console.log(JSON.stringify({
  pass: true,
  coordinateSystem: CANONICAL_COORDINATE_SYSTEM,
  source: { width: pixelWidth, height: pixelHeight },
  plane: { width: planeWidth, height: planeHeight },
  cameraType: camera.type,
  cameraStates: cameraStates.map(({ name }) => name),
  points: points.map(({ name }) => name),
  mappings: mappings.length,
  maxPixelError: Math.max(...mappings.map(({ pixelError }) => pixelError))
}, null, 2));
