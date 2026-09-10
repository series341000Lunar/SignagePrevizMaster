import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PHOTO_SCENE_RECORDS, PHOTO_NATIVE_FRAME } from '../src/site-calibration-profile.js';
import { SITE_SCENE_PROFILE } from '../src/site-scene-profile.js';
import {
  clientPointToContentNdc,
  computeContainedAspectRect,
  LatestWinsPhotoSceneController,
  PHOTO_CONTENT_ASPECT
} from '../src/photo-scene-runtime.js';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(appRoot, '..');
const manifest = JSON.parse(await readFile(path.join(appRoot, 'build', 'assets-manifest.json'), 'utf8'));

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

assert.equal(PHOTO_SCENE_RECORDS.length, 4);
assert.equal(PHOTO_NATIVE_FRAME.nativeAspect, PHOTO_CONTENT_ASPECT);
assert.equal(manifest.photoAssets.length, 4);

for (const record of PHOTO_SCENE_RECORDS) {
  const contract = record.photoAsset;
  assert.equal(contract.runtimeUrl, `./assets/photo/${contract.runtimeFileName}`);
  assert.equal(contract.runtimeUrlStatus, 'GENERATED_BUILD_ASSET');
  assert.equal(record.pointRuntimeStatus, 'ENABLED_BLOCK_4C');
  assert.equal(contract.nativeWidth / contract.nativeHeight, PHOTO_CONTENT_ASPECT);
  const sourceBytes = await readFile(path.join(projectRoot, contract.path));
  const builtPath = path.join(appRoot, 'build', 'assets', 'photo', contract.runtimeFileName);
  const builtBytes = await readFile(builtPath);
  assert.equal((await stat(builtPath)).size, contract.byteLength);
  assert.equal(sourceBytes.length, contract.byteLength);
  assert.equal(sha256(sourceBytes), contract.sha256);
  assert.equal(sha256(builtBytes), contract.sha256);
  assert.deepEqual(sourceBytes, builtBytes);

  const sceneContract = SITE_SCENE_PROFILE.worlds.legacy2d.normalScenes
    .find((candidate) => candidate.label.toUpperCase() === record.sceneId);
  assert.ok(sceneContract, `Missing Legacy scene for ${record.sceneId}`);
  assert.deepEqual(sceneContract.surfaces.map((surface) => surface.expectedNode), record.mapping.exactMeshNames);
}

const wide = computeContainedAspectRect(1600, 900);
assert.deepEqual(wide, { x: 125, y: 0, width: 1350, height: 900, aspect: 1.5 });
const tall = computeContainedAspectRect(900, 900);
assert.deepEqual(tall, { x: 0, y: 150, width: 900, height: 600, aspect: 1.5 });
const bounds = { left: 100, top: 50, width: 900, height: 900 };
assert.equal(clientPointToContentNdc(550, 100, bounds, tall), null);
assert.deepEqual(clientPointToContentNdc(550, 500, bounds, tall), { x: 0, y: 0 });
assert.deepEqual(clientPointToContentNdc(100, 200, bounds, tall), { x: -1, y: 1 });
assert.deepEqual(clientPointToContentNdc(1000, 800, bounds, tall), { x: 1, y: -1 });

const deferred = new Map();
const commits = [];
const clears = [];
const failures = [];
const disposed = [];
const controller = new LatestWinsPhotoSceneController({
  load: (record) => new Promise((resolve, reject) => deferred.set(record.sceneId, { resolve, reject })),
  validate: (record, resource) => assert.equal(resource.sceneId, record.sceneId),
  commit: ({ record }) => commits.push(record.sceneId),
  clear: ({ reason }) => clears.push(reason),
  fail: ({ record }) => failures.push(record.sceneId)
});
const frontRecord = PHOTO_SCENE_RECORDS[0];
const nightRecord = PHOTO_SCENE_RECORDS[3];
const first = controller.activate(frontRecord);
const latest = controller.activate(nightRecord);
deferred.get('NIGHT').resolve({ sceneId: 'NIGHT', dispose: () => disposed.push('NIGHT') });
assert.equal((await latest).status, 'READY');
deferred.get('FRONT').resolve({ sceneId: 'FRONT', dispose: () => disposed.push('FRONT') });
assert.equal((await first).status, 'STALE');
assert.deepEqual(commits, ['NIGHT']);
assert.deepEqual(disposed, ['FRONT']);
assert.equal(controller.active.record.sceneId, 'NIGHT');

const failed = controller.activate(frontRecord);
deferred.get('FRONT').reject(new Error('synthetic photo failure'));
assert.equal((await failed).status, 'UNAVAILABLE');
assert.deepEqual(failures, ['FRONT']);
assert.ok(disposed.includes('NIGHT'));
assert.equal(controller.active, null);
assert.ok(clears.includes('load-failure'));

console.log(JSON.stringify({
  pass: true,
  scenes: PHOTO_SCENE_RECORDS.map((record) => record.sceneId),
  photoBytesVerified: true,
  photoHashesVerified: true,
  nativeDimensions: `${PHOTO_NATIVE_FRAME.nativeWidth}x${PHOTO_NATIVE_FRAME.nativeHeight}`,
  contentAspect: PHOTO_CONTENT_ASPECT,
  outsideContentRejected: true,
  latestWins: true,
  failureClearsStalePhoto: true
}, null, 2));
