import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const require = createRequire(import.meta.url);
const config = require('../src/live-link-config.json');
const { createLiveLinkBroker } = require('../src/live-link-broker.cjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [rendererSource, uxpSource, htmlSource, cssSource] = await Promise.all([
  readFile(path.join(root, 'src', 'renderer.js'), 'utf8'),
  readFile(path.join(root, '..', 'photoshop-uxp', 'luux-live-link', 'index.js'), 'utf8'),
  readFile(path.join(root, 'src', 'index.html'), 'utf8'),
  readFile(path.join(root, 'src', 'styles.css'), 'utf8')
]);

for (const id of ['snapshot-resolution-dialog', 'snapshot-resolution-no', 'snapshot-resolution-yes', 'snapshot-resolution-session']) {
  assert.match(htmlSource, new RegExp(`id="${id}"`));
}
assert.match(cssSource, /\.snapshot-resolution-dialog::backdrop/);
assert.match(rendererSource, /expectedDocumentWidth: profile\.workingResolution\.width/);
assert.match(rendererSource, /expectedDocumentHeight: profile\.workingResolution\.height/);
assert.match(rendererSource, /allowResolutionMismatchThisSession: false/);
assert.match(rendererSource, /answerSnapshotResolutionPrompt\('NO'\)/);
assert.match(rendererSource, /answerSnapshotResolutionPrompt\('YES'\)/);
assert.match(rendererSource, /answerSnapshotResolutionPrompt\('SESSION'\)/);
assert.match(rendererSource, /approval\.familyId !== familyId \|\| approval\.projectSessionId !== state\.authoring\.snapshot\.projectSessionId/);
assert.match(uxpSource, /SNAPSHOT_RESOLUTION_CONFIRMATION_REQUIRED/);
assert.match(uxpSource, /request\.approvedDocumentId !== doc\.id/);
assert.match(uxpSource, /captureSnapshot\(request, expectedDocument\)/);
assert.ok(uxpSource.indexOf('SNAPSHOT_RESOLUTION_CONFIRMATION_REQUIRED') < uxpSource.indexOf('const capture = await captureSnapshot(request, expectedDocument)'), 'resolution consent must be checked before capture');

function peer(endpoint) {
  const socket = new WebSocket(endpoint);
  const queue = [];
  const waiters = [];
  socket.on('message', (data) => {
    const value = JSON.parse(data.toString('utf8'));
    const index = waiters.findIndex((waiter) => waiter.predicate(value));
    if (index >= 0) {
      const waiter = waiters.splice(index, 1)[0];
      clearTimeout(waiter.timer);
      waiter.resolve(value);
    } else queue.push(value);
  });
  return {
    socket,
    open: () => once(socket, 'open'),
    send: (value) => socket.send(JSON.stringify(value)),
    wait(predicate, timeoutMs = 3000) {
      const index = queue.findIndex(predicate);
      if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = { predicate, resolve, timer: setTimeout(() => reject(new Error('Resolution-consent protocol wait timed out.')), timeoutMs) };
        waiters.push(waiter);
      });
    },
    close: () => socket.close()
  };
}

const broker = createLiveLinkBroker({ config: { ...config, port: 0, endpoint: 'ws://127.0.0.1:0' } });
await once(broker.server, 'listening');
const endpoint = `ws://127.0.0.1:${broker.server.address().port}`;
const renderer = peer(endpoint);
await renderer.open();
renderer.send({ type: 'HELLO', protocol: config.protocol, protocolVersion: config.protocolVersion, role: 'renderer' });
await renderer.wait((message) => message.type === 'HELLO_ACK');
const photoshop = peer(endpoint);
await photoshop.open();
photoshop.send({ type: 'HELLO', protocol: config.protocol, protocolVersion: config.protocolVersion, role: 'photoshop' });
await photoshop.wait((message) => message.type === 'HELLO_ACK');
await renderer.wait((message) => message.type === 'LINK_STATUS' && message.photoshopConnected);

const baseRequest = {
  type: 'SNAPSHOT_REQUEST', captureRequestId: 'resolution-request', projectSessionId: 'resolution-session',
  familyId: 'ANAMORPHIC_FRONT_75F', captureMode: 'COMPOSITE',
  expectedDocumentWidth: 3000, expectedDocumentHeight: 3840, allowResolutionMismatch: false
};
renderer.send({ ...baseRequest, snapshotJobId: 'resolution-job-1' });
assert.equal((await photoshop.wait((message) => message.type === 'SNAPSHOT_REQUEST')).expectedDocumentWidth, 3000);
photoshop.send({
  type: 'SNAPSHOT_ERROR', snapshotJobId: 'resolution-job-1', code: 'SNAPSHOT_RESOLUTION_CONFIRMATION_REQUIRED',
  message: 'Resolution differs.', documentId: 77, documentName: 'Wrong size.psd',
  documentWidth: 2048, documentHeight: 3840, expectedWidth: 3000, expectedHeight: 3840
});
const warning = await renderer.wait((message) => message.type === 'SNAPSHOT_ERROR' && message.snapshotJobId === 'resolution-job-1');
assert.equal(warning.code, 'SNAPSHOT_RESOLUTION_CONFIRMATION_REQUIRED');
assert.equal(warning.documentId, 77);
assert.equal(warning.documentWidth, 2048);
assert.equal(broker.getSnapshot().activeSnapshotJobId, null);

renderer.send({ ...baseRequest, snapshotJobId: 'resolution-job-2', allowResolutionMismatch: true,
  approvedDocumentId: 77, approvedDocumentWidth: 2048, approvedDocumentHeight: 3840 });
const accepted = await photoshop.wait((message) => message.type === 'SNAPSHOT_REQUEST' && message.snapshotJobId === 'resolution-job-2');
assert.equal(accepted.approvedDocumentId, 77);
assert.equal(accepted.allowResolutionMismatch, true);
photoshop.send({ type: 'SNAPSHOT_ERROR', snapshotJobId: 'resolution-job-2', code: 'TEST_STOP', message: 'No pixels captured in broker validation.' });
assert.equal((await renderer.wait((message) => message.type === 'SNAPSHOT_ERROR' && message.snapshotJobId === 'resolution-job-2')).code, 'TEST_STOP');

renderer.send({ ...baseRequest, snapshotJobId: 'resolution-job-invalid', allowResolutionMismatch: true, approvedDocumentId: 77 });
assert.equal((await renderer.wait((message) => message.type === 'SNAPSHOT_ERROR' && message.snapshotJobId === 'resolution-job-invalid')).code, 'INVALID_SNAPSHOT_REQUEST');

renderer.close();
photoshop.close();
await Promise.all([once(renderer.socket, 'close'), once(photoshop.socket, 'close')]);
await broker.close();

console.log(JSON.stringify({ feature: 'Snapshot resolution consent', technicalPass: true, mismatchPromptRelayed: true,
  approvalBoundToDocument: true, malformedApprovalRejected: true, userPhotoshopValidation: 'NOT_ASSERTED_BY_THIS_TEST' }));
