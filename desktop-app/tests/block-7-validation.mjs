import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { ANAMORPHIC_FAMILY_IDS } from '../src/anamorphic-calibration-profile.js';
import { getProjectionBakeProfile } from '../src/projection-bake-profile.js';

const require = createRequire(import.meta.url);
const config = require('../src/live-link-config.json');
const { createLiveLinkBroker, validateBakeMetadata } = require('../src/live-link-broker.cjs');
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(appRoot, '..');

function metadata(overrides = {}) {
  const width = overrides.width ?? 2;
  const height = overrides.height ?? 2;
  const totalBytes = overrides.totalBytes ?? width * height * 4;
  const chunkSize = overrides.chunkSize ?? 5;
  return {
    type: 'BAKE_BEGIN', jobId: 1, familyId: 'TEST_FAMILY', outputKind: 'DIRECT', outputId: 'TEST_FAMILY:DIRECT',
    targetDocumentId: 91, width, height, components: 4, componentSize: 8, pixelFormat: 'RGBA',
    colorSpace: 'RGB', alpha: 'STRAIGHT', orientation: 'TOP_LEFT', totalBytes, chunkSize,
    chunkCount: Math.ceil(totalBytes / chunkSize), requestedAtEpochMs: Date.now(), ...overrides
  };
}

function createPeer(endpoint) {
  const socket = new WebSocket(endpoint);
  const queue = [];
  const waiters = [];
  socket.on('message', (data, isBinary) => {
    const item = isBinary ? { binary: true, data: Buffer.from(data) } : { binary: false, data: JSON.parse(data.toString('utf8')) };
    const index = waiters.findIndex((waiter) => waiter.predicate(item));
    if (index >= 0) {
      const [waiter] = waiters.splice(index, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(item);
    } else queue.push(item);
  });
  return {
    socket,
    async open(role) {
      await once(socket, 'open');
      socket.send(JSON.stringify({ type: 'HELLO', protocol: config.protocol, protocolVersion: config.protocolVersion, role }));
      await this.wait((item) => item.data?.type === 'HELLO_ACK');
    },
    wait(predicate, timeoutMs = 3000) {
      const queued = queue.findIndex(predicate);
      if (queued >= 0) return Promise.resolve(queue.splice(queued, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = { predicate, resolve, reject, timer: null };
        waiter.timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error('Timed out waiting for Block 7 protocol message.'));
        }, timeoutMs);
        waiters.push(waiter);
      });
    },
    json(value) { socket.send(JSON.stringify(value)); },
    close() { socket.close(); }
  };
}

async function connectPair(endpoint) {
  const renderer = createPeer(endpoint);
  await renderer.open('renderer');
  const photoshop = createPeer(endpoint);
  await photoshop.open('photoshop');
  await renderer.wait((item) => item.data?.type === 'LINK_STATUS' && item.data.photoshopConnected);
  return { renderer, photoshop };
}

async function completeBake(renderer, photoshop, begin, bytes) {
  renderer.json(begin);
  assert.equal((await photoshop.wait((item) => item.data?.type === 'BAKE_BEGIN' && item.data.jobId === begin.jobId)).data.totalBytes, bytes.length);
  let chunkIndex = 0;
  for (let offset = 0; offset < bytes.length; offset += begin.chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + begin.chunkSize, bytes.length));
    renderer.json({ type: 'BAKE_CHUNK', jobId: begin.jobId, chunkIndex, byteLength: chunk.length });
    renderer.socket.send(chunk);
    assert.equal((await photoshop.wait((item) => item.data?.type === 'BAKE_CHUNK' && item.data.chunkIndex === chunkIndex)).data.byteLength, chunk.length);
    assert.deepEqual((await photoshop.wait((item) => item.binary)).data, chunk);
    chunkIndex += 1;
  }
  renderer.json({ type: 'BAKE_END', jobId: begin.jobId, receivedBytes: bytes.length, receivedChunks: chunkIndex });
  await photoshop.wait((item) => item.data?.type === 'BAKE_END' && item.data.jobId === begin.jobId);
  photoshop.json({ type: 'BAKE_RECEIVED', jobId: begin.jobId, receivedBytes: bytes.length, receivedChunks: chunkIndex });
  assert.equal((await renderer.wait((item) => item.data?.type === 'BAKE_RECEIVED')).data.jobId, begin.jobId);
  photoshop.json({ type: 'BAKE_APPLYING', jobId: begin.jobId });
  assert.equal((await renderer.wait((item) => item.data?.type === 'BAKE_APPLYING')).data.jobId, begin.jobId);
  photoshop.json({ type: 'BAKE_APPLIED', jobId: begin.jobId, targetDocumentId: begin.targetDocumentId, layerId: 501, layerName: '__LUUX_ANAMORPHIC__ TEST_FAMILY DIRECT' });
  assert.equal((await renderer.wait((item) => item.data?.type === 'BAKE_APPLIED')).data.layerId, 501);
}

const front = getProjectionBakeProfile(ANAMORPHIC_FAMILY_IDS.FRONT_75F);
const back = getProjectionBakeProfile(ANAMORPHIC_FAMILY_IDS.BACK);
assert.equal(front.canonicalResolution.width * front.canonicalResolution.height * 4, 108_933_120);
assert.equal(front.workingResolution.width * front.workingResolution.height * 4, 46_080_000);
assert.equal(back.workingResolution.width * back.workingResolution.height * 4, 32_256_000);
assert.equal(validateBakeMetadata(metadata({
  width: 4728, height: 5760, totalBytes: 108_933_120, chunkSize: config.chunkSizeBytes,
  chunkCount: Math.ceil(108_933_120 / config.chunkSizeBytes), outputKind: 'CANONICAL', outputId: 'ANAMORPHIC_FRONT_75F:CANONICAL', familyId: 'ANAMORPHIC_FRONT_75F'
}), config), 108_933_120);
assert.throws(() => validateBakeMetadata(metadata({ totalBytes: 17 }), config), /does not match calculated/);
assert.throws(() => validateBakeMetadata(metadata({ width: 20_000, height: 20_000, totalBytes: 1_600_000_000, chunkCount: 763 }), config), /maxFrameBytes/);

const events = [];
const broker = createLiveLinkBroker({ config: { ...config, port: 0, ackTimeoutMs: 150 }, onEvent: (event) => events.push(event) });
await once(broker.server, 'listening');
const endpoint = `ws://127.0.0.1:${broker.server.address().port}`;
let { renderer, photoshop } = await connectPair(endpoint);
photoshop.json({ type: 'BAKE_TARGET_STATUS', status: 'READY', documentId: 91, documentName: 'target.psd', width: 2, height: 2, documentMode: 'RGB', documentDepth: 8 });
assert.equal((await renderer.wait((item) => item.data?.type === 'BAKE_TARGET_STATUS')).data.documentName, 'target.psd');

const pixels = Buffer.from(Array.from({ length: 16 }, (_, index) => index));
await completeBake(renderer, photoshop, metadata(), pixels);
assert.equal(broker.getSnapshot().activeBakeJobId, null);
renderer.json(metadata());
assert.equal((await renderer.wait((item) => item.data?.type === 'BAKE_ERROR' && item.data.jobId === 1)).data.code, 'DUPLICATE_JOB');

renderer.json(metadata({ jobId: 2 }));
await photoshop.wait((item) => item.data?.type === 'BAKE_BEGIN' && item.data.jobId === 2);
renderer.json({ type: 'BAKE_CHUNK', jobId: 2, chunkIndex: 1, byteLength: 5 });
assert.equal((await renderer.wait((item) => item.data?.type === 'BAKE_ERROR' && item.data.jobId === 2)).data.code, 'INVALID_BAKE_CHUNK');
await photoshop.wait((item) => item.data?.type === 'BAKE_ABORT' && item.data.jobId === 2);

renderer.json(metadata({ jobId: 3 }));
await photoshop.wait((item) => item.data?.type === 'BAKE_BEGIN' && item.data.jobId === 3);
renderer.json({ type: 'BAKE_CHUNK', jobId: 3, chunkIndex: 0, byteLength: 5 });
renderer.socket.send(pixels.subarray(0, 5));
await photoshop.wait((item) => item.binary);
renderer.json({ type: 'BAKE_END', jobId: 3, receivedBytes: 5, receivedChunks: 1 });
assert.equal((await renderer.wait((item) => item.data?.type === 'BAKE_ERROR' && item.data.jobId === 3)).data.code, 'INCOMPLETE_BAKE');

renderer.json(metadata({ jobId: 4 }));
await photoshop.wait((item) => item.data?.type === 'BAKE_BEGIN' && item.data.jobId === 4);
renderer.json({ type: 'BAKE_CHUNK', jobId: 99, chunkIndex: 0, byteLength: 5 });
assert.equal((await renderer.wait((item) => item.data?.type === 'BAKE_ERROR' && item.data.jobId === 4)).data.code, 'UNEXPECTED_BAKE_CHUNK');

renderer.json(metadata({ jobId: 5 }));
await photoshop.wait((item) => item.data?.type === 'BAKE_BEGIN' && item.data.jobId === 5);
assert.equal((await renderer.wait((item) => item.data?.type === 'BAKE_ERROR' && item.data.jobId === 5, 1000)).data.code, 'BAKE_TIMEOUT');

renderer.close(); photoshop.close();
await Promise.all([once(renderer.socket, 'close'), once(photoshop.socket, 'close')]);
({ renderer, photoshop } = await connectPair(endpoint));
await completeBake(renderer, photoshop, metadata(), pixels);
assert(events.some((event) => event.type === 'bake-applied'));

const uxp = await readFile(path.join(projectRoot, 'photoshop-uxp', 'luux-live-link', 'index.js'), 'utf8');
const rendererSource = await readFile(path.join(appRoot, 'src', 'renderer.js'), 'utf8');
const runtime = await readFile(path.join(appRoot, 'src', 'projection-bake-runtime.js'), 'utf8');
const rendererHtml = await readFile(path.join(appRoot, 'src', 'index.html'), 'utf8');
assert.match(uxp, /TARGET_DIMENSION_MISMATCH/);
assert.match(uxp, /TARGET_CLOSED/);
assert.match(uxp, /TARGET_UNSUPPORTED/);
assert.match(uxp, /doc\.mode === constants\.DocumentMode\.RGB \? 'RGB'/);
assert.match(uxp, /snapshot\.documentMode === state\.bake\.target\.documentMode/);
assert.match(uxp, /snapshot\.documentDepth === state\.bake\.target\.documentDepth/);
assert.match(uxp, /ownedOutputs\.get/);
assert.match(uxp, /STAGING/);
assert.match(uxp, /await priorLayer\.delete\(\)/);
assert.match(uxp, /suppressAutoSyncUntil/);
assert.match(uxp, /activeDocumentRestored/);
assert.match(uxp, /replace: true/);
assert.match(rendererSource, /PHOTOSHOP APPLY COMPLETE/);
assert.match(rendererSource, /BAKE_RECEIVED/);
assert.match(runtime, /readOutputRgba/);
assert.match(runtime, /1\.0 - sampledMask/);
assert.match(rendererHtml, /id="projection-mask-enabled" type="checkbox"/);
assert.match(rendererSource, /\[ANAMORPHIC_FAMILY_IDS\.FRONT_75F\]: false/);
assert.match(rendererSource, /\[ANAMORPHIC_FAMILY_IDS\.BACK\]: false/);
assert.match(rendererSource, /runProjectionFamilySmoke\(familyKey, repetitions, maskMode = 'production'\)/);
assert.match(runtime, /DISABLED_FULL_WHITE_CONTROL/);
assert.equal(back.productionMask.sourcePath, front.productionMask.sourcePath);
assert.equal(back.productionMask.sha256, front.productionMask.sha256);
assert.equal(back.productionMask.scalarOperation, 'EXACT_LINEAR_ONE_MINUS_SHARED_PRODUCTION_MASK');

renderer.close(); photoshop.close();
await Promise.all([once(renderer.socket, 'close'), once(photoshop.socket, 'close')]);
await broker.close();

console.log(JSON.stringify({
  block: '7', protocolVersion: config.protocolVersion, chunkSize: config.chunkSizeBytes,
  canonicalBytes: 108_933_120, canonicalChunks: Math.ceil(108_933_120 / config.chunkSizeBytes),
  validRoundTrip: true, duplicateRejected: true, invalidOrderRejected: true, truncatedRejected: true,
  wrongJobRejected: true, timeoutRecovered: true, reconnectRetryPassed: true,
  targetSafetyStaticCoverage: true, ownershipStaticCoverage: true, sharedBackMaskExactInverse: true, pass: true
}, null, 2));
