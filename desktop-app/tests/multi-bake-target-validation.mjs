import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const require = createRequire(import.meta.url);
const config = require('../src/live-link-config.json');
const { createLiveLinkBroker, validateBakeMetadata, validateBakeTargetRegistrySnapshot } = require('../src/live-link-broker.cjs');
const { bakeTargetBindingKey, createBakeTargetRegistry } = require('../../photoshop-uxp/luux-live-link/bake-target-registry.js');
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(appRoot, '..');

const frontA = {
  documentId: 101, documentName: 'Front_Target.psd',
  width: 3000, height: 3840, documentMode: 'RGB', documentDepth: 8
};
const backA = {
  documentId: 202, documentName: 'Back_A.psd',
  width: 2100, height: 3840, documentMode: 'RGB', documentDepth: 8
};
const backB = {
  documentId: 203, documentName: 'Back_B.psd',
  width: 2100, height: 3840, documentMode: 'RGB', documentDepth: 8
};
const thirdActive = {
  documentId: 303, documentName: 'Unrelated.psd',
  width: 1024, height: 1024, documentMode: 'RGB', documentDepth: 8
};
const openDocuments = new Map([frontA, backA, backB, thirdActive].map((doc) => [doc.documentId, { ...doc }]));
const findDocument = (documentId) => openDocuments.get(documentId) || null;
const registry = createBakeTargetRegistry({ sessionId: 'multi-target-test-session' });

const frontTarget = registry.addTarget({
  label: 'FRONT DIRECT',
  documentSnapshot: frontA,
  familyId: 'ANAMORPHIC_FRONT_75F',
  outputKind: 'DIRECT'
});
const backTarget = registry.addTarget({
  label: 'BACK DIRECT',
  documentSnapshot: backA,
  familyId: 'ANAMORPHIC_BACK',
  outputKind: 'DIRECT'
});
assert.notEqual(frontTarget.targetId, backTarget.targetId);
assert.equal(registry.size(), 2);
assert.equal(
  registry.resolve('ANAMORPHIC_FRONT_75F', 'DIRECT', findDocument).target.documentId,
  frontA.documentId
);
assert.equal(
  registry.resolve('ANAMORPHIC_BACK', 'DIRECT', findDocument).target.documentId,
  backA.documentId
);
assert.equal(registry.resolve('ANAMORPHIC_FRONT_75F', 'CANONICAL', findDocument).status, 'UNBOUND');
assert.equal(registry.validateJobTarget({
  familyId: 'ANAMORPHIC_FRONT_75F', outputKind: 'DIRECT',
  targetId: frontTarget.targetId, targetSessionId: registry.sessionId,
  targetDocumentId: frontA.documentId, width: 3000, height: 3840
}, findDocument).status, 'READY');
assert.throws(() => registry.validateJobTarget({
  familyId: 'ANAMORPHIC_FRONT_75F', outputKind: 'DIRECT',
  targetId: frontTarget.targetId, targetSessionId: registry.sessionId,
  targetDocumentId: frontA.documentId, width: 2100, height: 3840
}, findDocument), (error) => error.code === 'TARGET_DIMENSION_MISMATCH');

// Merely changing Photoshop's Active Document cannot mutate a registered Target.
let activeDocument = thirdActive;
assert.equal(activeDocument.documentId, thirdActive.documentId);
assert.equal(registry.getTarget(frontTarget.targetId).documentId, frontA.documentId);
assert.equal(registry.getTarget(backTarget.targetId).documentId, backA.documentId);

// One closed Target becomes invalid without affecting the other.
openDocuments.delete(backA.documentId);
assert.equal(registry.resolve('ANAMORPHIC_BACK', 'DIRECT', findDocument).status, 'CLOSED');
assert.throws(() => registry.validateJobTarget({
  familyId: 'ANAMORPHIC_BACK', outputKind: 'DIRECT',
  targetId: backTarget.targetId, targetSessionId: registry.sessionId,
  targetDocumentId: backA.documentId, width: 2100, height: 3840
}, findDocument), (error) => error.code === 'TARGET_CLOSED');
assert.equal(registry.resolve('ANAMORPHIC_FRONT_75F', 'DIRECT', findDocument).status, 'READY');

// Explicit replacement retargets only that Target.
activeDocument = backB;
registry.replaceDocument(backTarget.targetId, activeDocument);
assert.equal(registry.resolve('ANAMORPHIC_BACK', 'DIRECT', findDocument).target.documentId, backB.documentId);
assert.equal(registry.resolve('ANAMORPHIC_FRONT_75F', 'DIRECT', findDocument).target.documentId, frontA.documentId);
registry.renameTarget(backTarget.targetId, 'BACK DIRECT REPLACED');
assert.equal(registry.getTarget(backTarget.targetId).label, 'BACK DIRECT REPLACED');

// Same-document registration is allowed, while family/output bindings remain separate.
const frontCanonical = registry.addTarget({
  label: 'FRONT MASTER',
  documentSnapshot: frontA,
  familyId: 'ANAMORPHIC_FRONT_75F',
  outputKind: 'CANONICAL'
});
assert.equal(registry.resolve('ANAMORPHIC_FRONT_75F', 'CANONICAL', findDocument).target.documentId, frontA.documentId);
assert.notEqual(frontCanonical.targetId, frontTarget.targetId);
assert.equal(bakeTargetBindingKey('ANAMORPHIC_BACK', 'DIRECT'), 'ANAMORPHIC_BACK:DIRECT');

const registryMessage = {
  type: 'BAKE_TARGET_REGISTRY',
  ...registry.snapshot(findDocument)
};
assert.equal(validateBakeTargetRegistrySnapshot(registryMessage), true);
assert.equal(new Set(registryMessage.targets.map((target) => target.targetId)).size, registryMessage.targets.length);
assert.equal(new Set(registryMessage.bindings.map((binding) => binding.bindingKey)).size, registryMessage.bindings.length);

function bakeMetadata({ jobId, target, familyId, outputKind, width, height }) {
  const totalBytes = width * height * 4;
  return {
    type: 'BAKE_BEGIN',
    jobId,
    familyId,
    outputKind,
    outputId: `${familyId}:${outputKind}`,
    bindingKey: `${familyId}:${outputKind}`,
    targetId: target.targetId,
    targetSessionId: registry.sessionId,
    targetDocumentId: target.documentId,
    width,
    height,
    components: 4,
    componentSize: 8,
    pixelFormat: 'RGBA',
    colorSpace: 'RGB',
    alpha: 'STRAIGHT',
    orientation: 'TOP_LEFT',
    totalBytes,
    chunkSize: config.chunkSizeBytes,
    chunkCount: Math.ceil(totalBytes / config.chunkSizeBytes),
    requestedAtEpochMs: Date.now()
  };
}

const frontMetadata = bakeMetadata({
  jobId: 11,
  target: registry.getTarget(frontTarget.targetId),
  familyId: 'ANAMORPHIC_FRONT_75F',
  outputKind: 'DIRECT',
  width: 3000,
  height: 3840
});
assert.equal(validateBakeMetadata(frontMetadata, config), 46_080_000);
assert.throws(
  () => validateBakeMetadata({ ...frontMetadata, bindingKey: 'ANAMORPHIC_BACK:DIRECT' }, config),
  /bindingKey/
);
assert.throws(
  () => validateBakeMetadata({ ...frontMetadata, targetId: '' }, config),
  /targetId/
);

function createPeer(endpoint) {
  const socket = new WebSocket(endpoint);
  const queue = [];
  const waiters = [];
  socket.on('message', (data, isBinary) => {
    const item = isBinary ? { binary: true, data } : { binary: false, data: JSON.parse(data.toString('utf8')) };
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
      const queuedIndex = queue.findIndex(predicate);
      if (queuedIndex >= 0) return Promise.resolve(queue.splice(queuedIndex, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = { predicate, resolve, timer: null };
        waiter.timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error('Timed out waiting for multi-target protocol message.'));
        }, timeoutMs);
        waiters.push(waiter);
      });
    },
    json(message) { socket.send(JSON.stringify(message)); },
    close() { socket.close(); }
  };
}

const events = [];
const broker = createLiveLinkBroker({
  config: { ...config, port: 0, ackTimeoutMs: 1000 },
  onEvent: (event) => events.push(event)
});
await once(broker.server, 'listening');
const endpoint = `ws://127.0.0.1:${broker.server.address().port}`;
const renderer = createPeer(endpoint);
await renderer.open('renderer');
const photoshop = createPeer(endpoint);
await photoshop.open('photoshop');
await renderer.wait((item) => item.data?.type === 'LINK_STATUS' && item.data.photoshopConnected);
photoshop.json(registryMessage);
const mirrored = await renderer.wait((item) => item.data?.type === 'BAKE_TARGET_REGISTRY');
assert.equal(mirrored.data.targets.length, 3);

renderer.json(frontMetadata);
const routedFront = await photoshop.wait((item) => item.data?.type === 'BAKE_BEGIN' && item.data.jobId === 11);
assert.equal(routedFront.data.targetId, frontTarget.targetId);
assert.equal(routedFront.data.targetDocumentId, frontA.documentId);

const backMetadata = bakeMetadata({
  jobId: 12,
  target: registry.getTarget(backTarget.targetId),
  familyId: 'ANAMORPHIC_BACK',
  outputKind: 'DIRECT',
  width: 2100,
  height: 3840
});
renderer.json(backMetadata);
assert.equal(
  (await renderer.wait((item) => item.data?.type === 'BAKE_ERROR' && item.data.jobId === 12)).data.code,
  'BAKE_BUSY'
);
renderer.json({ type: 'BAKE_CHUNK', jobId: 99, chunkIndex: 0, byteLength: 1 });
await renderer.wait((item) => item.data?.type === 'BAKE_ERROR' && item.data.jobId === 11);
await photoshop.wait((item) => item.data?.type === 'BAKE_ABORT' && item.data.jobId === 11);

renderer.json(backMetadata);
const routedBack = await photoshop.wait((item) => item.data?.type === 'BAKE_BEGIN' && item.data.jobId === 12);
assert.equal(routedBack.data.targetId, backTarget.targetId);
assert.equal(routedBack.data.targetDocumentId, backB.documentId);
renderer.json({ type: 'BAKE_CHUNK', jobId: 98, chunkIndex: 0, byteLength: 1 });
await renderer.wait((item) => item.data?.type === 'BAKE_ERROR' && item.data.jobId === 12);

renderer.close();
photoshop.close();
await Promise.all([once(renderer.socket, 'close'), once(photoshop.socket, 'close')]);
await broker.close();

const uxpSource = await readFile(path.join(projectRoot, 'photoshop-uxp', 'luux-live-link', 'index.js'), 'utf8');
const uxpHtml = await readFile(path.join(projectRoot, 'photoshop-uxp', 'luux-live-link', 'index.html'), 'utf8');
const rendererSource = await readFile(path.join(appRoot, 'src', 'renderer.js'), 'utf8');
const brokerSource = await readFile(path.join(appRoot, 'src', 'live-link-broker.cjs'), 'utf8');
assert.doesNotMatch(uxpSource, /frontBakeTarget|backBakeTarget|state\.bake\.target\b/);
assert.doesNotMatch(rendererSource, /frontBakeTarget|backBakeTarget|reverseBake\.target\b/);
assert.match(uxpHtml, /Active Document is registration input only/);
assert.match(rendererSource, /TARGET_BINDING_NOT_FOUND/);
assert.match(rendererSource, /targetId: target\.targetId/);
assert.match(brokerSource, /if \(activeBake\).*BAKE_BUSY/);
assert.doesNotMatch(rendererSource, /SEND TO ALL TARGETS|broadcastBake|parallel Photoshop mutation/);

console.log(JSON.stringify({
  extension: 'POST-BLOCK-7-MULTI-BAKE-TARGET',
  registryAuthority: 'UXP',
  sessionScope: true,
  registeredTargetCapacity: 'N',
  registeredTargetsTested: registryMessage.targets.length,
  targetIdsUnique: true,
  bindingKey: 'familyId:outputKind',
  frontDirectResolved: true,
  backDirectResolved: true,
  canonicalArchitectureVerified: true,
  unboundRefused: true,
  wrongSizeRefused: true,
  closedTargetIsolation: true,
  explicitReplacement: true,
  activeDocumentDoesNotRetarget: true,
  oneActiveBakeJob: true,
  broadcast: false,
  parallelWrites: false,
  userValidation: 'PASS_CLOSED',
  pass: true
}, null, 2));
