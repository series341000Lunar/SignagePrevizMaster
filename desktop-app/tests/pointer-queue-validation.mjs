import assert from 'node:assert/strict';
import { LatestWinsPointerQueue } from '../src/pointer-command-queue.js';

const sent = [];
const queue = new LatestWinsPointerQueue((command) => {
  sent.push(command.requestId);
  return true;
});

assert.deepEqual(queue.request({ type: 'POINTER_SET', requestId: 1 }), { sent: true, pending: false });
assert.deepEqual(queue.request({ type: 'POINTER_SET', requestId: 2 }), { sent: false, pending: true });
assert.deepEqual(queue.request({ type: 'POINTER_SET', requestId: 3 }), { sent: false, pending: true });
assert.deepEqual(queue.request({ type: 'POINTER_SET', requestId: 4 }), { sent: false, pending: true });
assert.deepEqual(sent, [1]);
assert.deepEqual(queue.snapshot(), { activeRequestId: 1, pendingRequestId: 4, replacements: 3 });
assert.equal(queue.settle({ type: 'POINTER_ACK', requestId: 1 }), true);
assert.deepEqual(sent, [1, 4]);
assert.deepEqual(queue.snapshot(), { activeRequestId: 4, pendingRequestId: null, replacements: 3 });
assert.equal(queue.settle({ type: 'POINTER_ACK', requestId: 999 }), false);
assert.equal(queue.settle({ type: 'POINTER_ACK', requestId: 4 }), true);
assert.deepEqual(queue.snapshot(), { activeRequestId: null, pendingRequestId: null, replacements: 3 });

console.log(JSON.stringify({ pass: true, sent, latestWins: true, replacements: 3 }, null, 2));
