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
    const item = isBinary ? { binary: true, data: Buffer.from(data) } : { binary: false, data: JSON.parse(data.toString('utf8')) };
    const waiterIndex = waiters.findIndex((waiter) => waiter.predicate(item));
    if (waiterIndex >= 0) {
      const [waiter] = waiters.splice(waiterIndex, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(item);
    } else {
      queue.push(item);
    }
  });
  return {
    socket,
    async open() { await once(socket, 'open'); },
    wait(predicate, timeoutMs = 3000) {
      const queuedIndex = queue.findIndex(predicate);
      if (queuedIndex >= 0) return Promise.resolve(queue.splice(queuedIndex, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = { predicate, resolve, reject, timer: null };
        waiter.timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error('Timed out waiting for protocol message.'));
        }, timeoutMs);
        waiters.push(waiter);
      });
    },
    sendJson(message) { socket.send(JSON.stringify(message)); },
    close() { socket.close(); }
  };
}

const events = [];
const broker = createLiveLinkBroker({
  config: { ...baseConfig, port: 0, endpoint: 'ws://127.0.0.1:0' },
  onEvent: (event) => events.push(event)
});
await once(broker.server, 'listening');
const address = broker.server.address();
assert.equal(address.address, '127.0.0.1');
const endpoint = `ws://127.0.0.1:${address.port}`;

const renderer = createPeer(endpoint);
await renderer.open();
renderer.sendJson({ type: 'HELLO', protocol: baseConfig.protocol, protocolVersion: baseConfig.protocolVersion, role: 'renderer' });
assert.equal((await renderer.wait((item) => item.data?.type === 'HELLO_ACK')).data.role, 'renderer');

const photoshop = createPeer(endpoint);
await photoshop.open();
photoshop.sendJson({ type: 'HELLO', protocol: baseConfig.protocol, protocolVersion: baseConfig.protocolVersion, role: 'photoshop' });
assert.equal((await photoshop.wait((item) => item.data?.type === 'HELLO_ACK')).data.role, 'photoshop');
assert.equal((await renderer.wait((item) => item.data?.type === 'LINK_STATUS' && item.data.photoshopConnected)).data.photoshopConnected, true);

const pixels = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
const metadata = {
  type: 'FRAME_BEGIN',
  frameId: 1,
  documentId: 77,
  documentName: 'protocol-test.psd',
  documentWidth: 2,
  documentHeight: 2,
  width: 2,
  height: 2,
  components: 3,
  componentSize: 8,
  pixelFormat: 'RGB',
  colorSpace: 'RGB',
  colorProfile: 'sRGB IEC61966-2.1',
  totalBytes: pixels.byteLength,
  chunkSize: 5,
  chunkCount: 3,
  captureMs: 1,
  captureStartedAtEpochMs: Date.now(),
  captureEndedAtEpochMs: Date.now()
};
photoshop.sendJson(metadata);
photoshop.socket.send(pixels.subarray(0, 5));
photoshop.socket.send(pixels.subarray(5, 10));
photoshop.socket.send(pixels.subarray(10));
photoshop.sendJson({ type: 'FRAME_END', frameId: 1 });

const relayedBegin = (await renderer.wait((item) => item.data?.type === 'FRAME_BEGIN')).data;
assert.equal(relayedBegin.totalBytes, pixels.byteLength);
assert.equal(typeof relayedBegin.brokerReceivedAtEpochMs, 'number');
const chunks = [];
for (let index = 0; index < 3; index += 1) chunks.push((await renderer.wait((item) => item.binary)).data);
assert.deepEqual(Buffer.concat(chunks), pixels);
const relayedEnd = (await renderer.wait((item) => item.data?.type === 'FRAME_END')).data;
assert.equal(relayedEnd.receivedBytes, pixels.byteLength);
assert.equal(relayedEnd.receivedChunks, 3);

renderer.sendJson({
  type: 'FRAME_ACK',
  frameId: 1,
  receivedWidth: 2,
  receivedHeight: 2,
  textureWidth: 2,
  textureHeight: 2,
  receivedBytes: pixels.byteLength
});
const ack = (await photoshop.wait((item) => item.data?.type === 'FRAME_ACK')).data;
assert.equal(ack.textureWidth, 2);
assert.equal(broker.getSnapshot().activeFrameId, null);

photoshop.sendJson({ ...metadata, frameId: 2, totalBytes: pixels.byteLength - 1 });
const invalid = (await photoshop.wait((item) => item.data?.type === 'ERROR' && item.data.frameId === 2)).data;
assert.equal(invalid.code, 'INVALID_FRAME_METADATA');
assert(events.some((event) => event.type === 'frame-ack' && event.frameId === 1));

renderer.close();
photoshop.close();
await Promise.all([once(renderer.socket, 'close'), once(photoshop.socket, 'close')]);
await broker.close();

console.log(JSON.stringify({
  pass: true,
  bindAddress: address.address,
  protocol: baseConfig.protocol,
  protocolVersion: baseConfig.protocolVersion,
  validFrameBytes: pixels.byteLength,
  validFrameChunks: 3,
  invalidMetadataRejected: true,
  frameAckRelayed: true
}, null, 2));
