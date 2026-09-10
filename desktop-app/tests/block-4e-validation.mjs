import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import * as THREE from 'three';
import {
  createSiteReturnSnapshot,
  LatestWinsLocationNavigation,
  projectLocationToViewport,
  restoreCameraFromSiteSnapshot,
  validateLocationRecord
} from '../src/location-navigation-runtime.js';
import { CAMERA_RECORDS, LOCATION_RECORDS, PHOTO_SCENE_RECORDS } from '../src/site-calibration-profile.js';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(appRoot, '..');
const manifest = JSON.parse(await readFile(path.join(appRoot, 'build', 'assets-manifest.json'), 'utf8'));
const rendererSource = await readFile(path.join(appRoot, 'src', 'renderer.js'), 'utf8');
const html = await readFile(path.join(appRoot, 'src', 'index.html'), 'utf8');
const css = await readFile(path.join(appRoot, 'src', 'styles.css'), 'utf8');

assert.equal(LOCATION_RECORDS.length, 4);
assert.equal(new Set(LOCATION_RECORDS.map((record) => record.locationId)).size, 4);
assert.deepEqual(LOCATION_RECORDS.map((record) => record.photoSceneId), ['FRONT', 'FRONT_SWEET', 'BACK', 'NIGHT']);
for (const record of LOCATION_RECORDS) {
  const photoScene = validateLocationRecord(record, PHOTO_SCENE_RECORDS);
  const camera = CAMERA_RECORDS.find((candidate) => candidate.sceneId === record.photoSceneId);
  assert.equal(photoScene.locationId, record.locationId);
  assert.notDeepEqual(record.worldPosition, camera.currentValues.position, 'Location must not inherit CameraRecord.position.');
  assert.equal(record.coordinateSpace, 'THREE_WORLD_DIRECT');
  assert.equal(record.resolutionStatus, 'RESOLVED');
  assert.equal(record.calibrationStatus, 'USER_VALIDATED');
  assert.equal(record.validationDate, '2026-09-11');
  assert.equal(record.thumbnail.ownership, 'DERIVED_BUILD_ASSET');
}

assert.equal(manifest.photoAssets.length, 4);
for (const photoAsset of manifest.photoAssets) {
  assert.equal(photoAsset.thumbnail.status, 'READY');
  assert.equal(photoAsset.thumbnail.width, 450);
  assert.equal(photoAsset.thumbnail.height, 300);
  assert.equal(photoAsset.thumbnail.aspect, 1.5);
  assert.equal(photoAsset.thumbnail.generation.fit, 'contain');
  assert.equal(photoAsset.thumbnail.generation.crop, false);
  assert.equal(photoAsset.thumbnail.generation.stretch, false);
  assert.equal(photoAsset.thumbnail.generation.jpegQuality, 82);
  assert.match(photoAsset.thumbnail.runtimeUrl, /^\.\/assets\/photo\/thumb\/.+-thumb\.jpg$/);
  const thumbnailPath = path.join(appRoot, 'build', photoAsset.thumbnail.runtimeUrl.replace('./', ''));
  const bytes = await readFile(thumbnailPath);
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.width, 450);
  assert.equal(metadata.height, 300);
  assert.equal(createHash('sha256').update(bytes).digest('hex').toUpperCase(), photoAsset.thumbnail.sha256);
  const source = await readFile(path.join(projectRoot, photoAsset.path));
  assert.equal(createHash('sha256').update(source).digest('hex').toUpperCase(), photoAsset.sha256);
}

const camera = new THREE.PerspectiveCamera(50, 1.5, 0.1, 1000);
camera.position.set(0, 0, 10);
camera.lookAt(0, 0, 0);
camera.updateProjectionMatrix();
camera.updateMatrixWorld(true);
const center = projectLocationToViewport({ x: 0, y: 0, z: 0 }, camera, { width: 900, height: 600 }, { x: 10, y: -20 });
assert.equal(center.visible, true);
assert.equal(center.x, 460);
assert.equal(center.y, 280);
assert.equal(projectLocationToViewport({ x: 0, y: 0, z: 20 }, camera, { width: 900, height: 600 }).reason, 'BEHIND_CAMERA');
assert.equal(projectLocationToViewport({ x: 100, y: 0, z: 0 }, camera, { width: 900, height: 600 }).reason, 'OFFSCREEN');

const orbitTarget = new THREE.Vector3(1, 2, 3);
camera.position.set(4.125, 5.25, 6.375);
camera.quaternion.setFromEuler(new THREE.Euler(0.2, -0.4, 0.1));
camera.fov = 53.75;
camera.zoom = 1.125;
camera.up.set(0, 1, 0);
const snapshot = createSiteReturnSnapshot({
  activeView: 'site-3d',
  siteWorldMode: 'world3d',
  mappingMode: 'normal',
  camera,
  orbitTarget,
  environmentLightingMode: 'night',
  markerVisibility: false
});
camera.position.set(0, 0, 0);
camera.quaternion.identity();
camera.fov = 20;
camera.zoom = 2;
orbitTarget.set(0, 0, 0);
restoreCameraFromSiteSnapshot(snapshot, camera, orbitTarget);
assert.deepEqual(camera.position.toArray(), snapshot.camera.position);
assert.deepEqual(camera.quaternion.toArray(), snapshot.camera.quaternion);
assert.equal(camera.fov, snapshot.camera.fov);
assert.equal(camera.zoom, snapshot.camera.zoom);
assert.deepEqual(orbitTarget.toArray(), snapshot.orbitControls.target);

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

const pending = new Map();
const commits = [];
let restores = 0;
const controller = new LatestWinsLocationNavigation({
  validate: (record) => record,
  captureSite: () => ({ exact: 'site-snapshot' }),
  activatePhoto: (record) => {
    const gate = deferred();
    pending.set(record.locationId, gate);
    return gate.promise;
  },
  commitPhoto: (record) => { commits.push(record.locationId); },
  restoreSite: () => { restores += 1; },
  capturePhoto: () => ({ exact: 'photo-snapshot' }),
  restorePhoto: () => {}
});
const rapidA = controller.activate(LOCATION_RECORDS[0]);
const rapidB = controller.activate(LOCATION_RECORDS[1]);
pending.get(LOCATION_RECORDS[0].locationId).resolve({ status: 'READY' });
pending.get(LOCATION_RECORDS[1].locationId).resolve({ status: 'READY' });
assert.deepEqual((await Promise.all([rapidA, rapidB])).map((result) => result.status), ['STALE', 'READY']);
assert.deepEqual(commits, [LOCATION_RECORDS[1].locationId]);
assert.deepEqual(controller.siteSnapshot, { exact: 'site-snapshot' });
assert.equal((await controller.returnToSite()).status, 'RETURNED');
assert.equal(controller.siteSnapshot, null);
assert.equal(restores, 1);

let failedRestorePhoto = 0;
const failedReturn = new LatestWinsLocationNavigation({
  validate: (record) => record,
  captureSite: () => ({ exact: 'site' }),
  activatePhoto: async () => ({ status: 'READY' }),
  commitPhoto: async () => {},
  restoreSite: async () => { throw new Error('synthetic return failure'); },
  capturePhoto: () => ({ exact: 'photo' }),
  restorePhoto: async () => { failedRestorePhoto += 1; }
});
assert.equal((await failedReturn.activate(LOCATION_RECORDS[0])).status, 'READY');
assert.equal((await failedReturn.returnToSite()).status, 'RETURN_FAILED');
assert.deepEqual(failedReturn.siteSnapshot, { exact: 'site' });
assert.equal(failedRestorePhoto, 1);

let failedActivationRestore = 0;
const failedActivation = new LatestWinsLocationNavigation({
  validate: (record) => record,
  captureSite: () => ({ exact: 'site' }),
  activatePhoto: async () => ({ status: 'UNAVAILABLE' }),
  commitPhoto: async () => {},
  restoreSite: async () => { failedActivationRestore += 1; }
});
assert.equal((await failedActivation.activate(LOCATION_RECORDS[0])).status, 'UNAVAILABLE');
assert.equal(failedActivationRestore, 1);
assert.equal(failedActivation.siteSnapshot, null);

assert.match(html, /id="locations-toggle-button"[^>]*>LOCATIONS ON<\/button>/);
assert.match(html, /id="return-to-site-button"[^>]*hidden>RETURN TO SITE<\/button>/);
assert.match(html, /id="location-overlay"/);
assert.match(css, /\.location-anchor\.point-pass-through\s*\{\s*pointer-events:\s*none;/);
assert.match(css, /\.location-anchor\s*\{[\s\S]*width:\s*clamp\(50px,\s*4\.333vw,\s*68px\);/);
assert.match(css, /\.location-anchor\s*\{[\s\S]*opacity:\s*0\.72;/);
assert.match(css, /\.location-thumbnail[\s\S]*object-fit:\s*contain;/);
assert.match(html, /<div id="location-overlay"[^>]*><\/div>/);
assert.doesNotMatch(rendererSource, /button\.textContent\s*=\s*record\.photoSceneId/);
assert.match(rendererSource, /function activateLocation\(locationId\)/);
assert.match(rendererSource, /projectLocationToViewport\(record\.worldPosition/);
assert.match(rendererSource, /state\.interactionMode === 'navigate'/);
assert.match(rendererSource, /locationNavigation\.returnToSite\(\)/);

console.log(JSON.stringify({
  pass: true,
  locationRecords: LOCATION_RECORDS,
  thumbnails: manifest.photoAssets.map(({ sceneId, thumbnail }) => ({ sceneId, thumbnail })),
  projection: { center, behind: 'hidden', offscreen: 'hidden' },
  snapshot,
  rapidLatestWins: true,
  failedActivationPreservesSite: true,
  failedReturnPreservesPhotoAndSnapshot: true,
  userValidation: 'PASS_CLOSED'
}, null, 2));
