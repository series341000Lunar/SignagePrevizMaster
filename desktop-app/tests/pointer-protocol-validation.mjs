import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { WebSocket } from 'ws';

const require = createRequire(import.meta.url);
const baseConfig = require('../src/live-link-config.json');
const { createLiveLinkBroker } = require('../src/live-link-broker.cjs');

function createPeer(endpoint) {
  const socket = new WebSocket(endpoint);
  const queue = [];
  const waiters = [];
  socket.on('message', (data, isBinary) => {
    if (isBinary) return;
    const message = JSON.parse(data.toString('utf8'));
    const waiterIndex = waiters.findIndex((waiter) => waiter.predicate(message));
    if (waiterIndex >= 0) {
      const [waiter] = waiters.splice(waiterIndex, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    } else {
      queue.push(message);
    }
  });
  return {
    socket,
    async open() { await once(socket, 'open'); },
    send(message) { socket.send(JSON.stringify(message)); },
    wait(predicate, timeoutMs = 3000) {
      const index = queue.findIndex(predicate);
      if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = { predicate, resolve, timer: null };
        waiter.timer = setTimeout(() => {
          const pendingIndex = waiters.indexOf(waiter);
          if (pendingIndex >= 0) waiters.splice(pendingIndex, 1);
          reject(new Error('Timed out waiting for pointer protocol message.'));
        }, timeoutMs);
        waiters.push(waiter);
      });
    },
    close() { socket.close(); }
  };
}

function pointer(requestId, overrides = {}) {
  return {
    type: 'POINTER_SET',
    requestId,
    sourceFrameId: 108,
    documentId: 321,
    documentName: 'LUUX_Master.psd',
    width: 4728,
    height: 5760,
    x: 2458,
    y: 1786,
    u: 2458.25 / 4728,
    v: 1786.25 / 5760,
    ...overrides
  };
}

const events = [];
const broker = createLiveLinkBroker({
  config: { ...baseConfig, port: 0, endpoint: 'ws://127.0.0.1:0' },
  onEvent: (event) => events.push(event)
});
await once(broker.server, 'listening');
const address = broker.server.address();
const endpoint = `ws://127.0.0.1:${address.port}`;

const renderer = createPeer(endpoint);
await renderer.open();
renderer.send({ type: 'HELLO', protocol: baseConfig.protocol, protocolVersion: baseConfig.protocolVersion, role: 'renderer' });
await renderer.wait((message) => message.type === 'HELLO_ACK');

renderer.send(pointer(1));
assert.equal((await renderer.wait((message) => message.type === 'POINTER_ERROR' && message.requestId === 1)).code, 'UXP_DISCONNECTED');

const photoshop = createPeer(endpoint);
await photoshop.open();
photoshop.send({ type: 'HELLO', protocol: baseConfig.protocol, protocolVersion: baseConfig.protocolVersion, role: 'photoshop' });
await photoshop.wait((message) => message.type === 'HELLO_ACK');
await renderer.wait((message) => message.type === 'LINK_STATUS' && message.photoshopConnected);

renderer.send(pointer(2, { x: 4728, u: 1 }));
assert.equal((await renderer.wait((message) => message.type === 'POINTER_ERROR' && message.requestId === 2)).code, 'OUT_OF_RANGE');

const valid = pointer(3);
renderer.send(valid);
assert.deepEqual(await photoshop.wait((message) => message.type === 'POINTER_SET' && message.requestId === 3), valid);
assert.equal(broker.getSnapshot().activePointerRequestId, 3);

renderer.send(valid);
assert.equal((await renderer.wait((message) => message.type === 'POINTER_ERROR' && message.requestId === 3)).code, 'DUPLICATE_REQUEST');

const mismatch = {
  type: 'POINTER_ERROR',
  requestId: 3,
  documentId: 321,
  code: 'DOCUMENT_MISMATCH',
  message: 'Active document is not the source document.'
};
photoshop.send(mismatch);
assert.deepEqual(await renderer.wait((message) => message.type === 'POINTER_ERROR' && message.requestId === 3 && message.code === 'DOCUMENT_MISMATCH'), mismatch);

const clear = {
  type: 'POINTER_CLEAR',
  requestId: 4,
  sourceFrameId: 108,
  documentId: 321,
  documentName: 'LUUX_Master.psd',
  width: 4728,
  height: 5760
};
renderer.send(clear);
assert.deepEqual(await photoshop.wait((message) => message.type === 'POINTER_CLEAR' && message.requestId === 4), clear);
const clearAck = {
  type: 'POINTER_CLEAR_ACK',
  requestId: 4,
  documentId: 321,
  layerName: '__LUUX_POINTER__',
  clearedLayers: 1,
  selectionRestored: true
};
photoshop.send(clearAck);
assert.deepEqual(await renderer.wait((message) => message.type === 'POINTER_CLEAR_ACK' && message.requestId === 4), clearAck);

const validAckRequest = pointer(5);
renderer.send(validAckRequest);
await photoshop.wait((message) => message.type === 'POINTER_SET' && message.requestId === 5);
const pointerAck = {
  type: 'POINTER_ACK',
  requestId: 5,
  documentId: 321,
  requestedX: 2458,
  requestedY: 1786,
  appliedX: 2458,
  appliedY: 1786,
  layerName: '__LUUX_POINTER__',
  selectionRestored: true
};
photoshop.send(pointerAck);
assert.deepEqual(await renderer.wait((message) => message.type === 'POINTER_ACK' && message.requestId === 5), pointerAck);
assert.equal(broker.getSnapshot().activePointerRequestId, null);

photoshop.send(pointer(6));
assert.equal((await photoshop.wait((message) => message.type === 'POINTER_ERROR' && message.requestId === 6)).code, 'ROLE_VIOLATION');
assert.ok(events.some((event) => event.type === 'pointer-routed' && event.requestId === 5));

renderer.close();
photoshop.close();
await Promise.all([once(renderer.socket, 'close'), once(photoshop.socket, 'close')]);
await broker.close();

console.log(JSON.stringify({
  pass: true,
  bindAddress: address.address,
  photoshopDisconnectedRejected: true,
  outOfRangeRejected: true,
  duplicateRejected: true,
  documentMismatchRelayed: true,
  pointerAckRelayed: true,
  pointerClearAckRelayed: true,
  roleViolationRejected: true
}, null, 2));
