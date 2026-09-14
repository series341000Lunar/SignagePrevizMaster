import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { WebSocket } from 'ws';

const require = createRequire(import.meta.url);
const { createBakeTargetRegistry } = require('../../photoshop-uxp/luux-live-link/bake-target-registry.js');
const { FRONT, BACK, targetSpec, createTargetQuickCreate } = require('../../photoshop-uxp/luux-live-link/target-quick-create.js');
const { createLiveLinkBroker } = require('../src/live-link-broker.cjs');
const linkConfig = require('../src/live-link-config.json');

for (const [family, output, width, height] of [
  [FRONT, 'DIRECT', 3000, 3840], [BACK, 'DIRECT', 2100, 3840],
  [FRONT, 'CANONICAL', 4728, 5760], [BACK, 'CANONICAL', 4728, 5760]
]) {
  assert.deepEqual([targetSpec(family, output).width, targetSpec(family, output).height], [width, height]);
}
assert.equal(targetSpec(null, 'CANONICAL'), null);

function fixture({ createFailure = false, actualOverride = {}, registerFailure = false, gate = null, confirmContext = () => true } = {}) {
  const registry = createBakeTargetRegistry({ sessionId: '9bb-test' });
  const documents = new Map();
  let creates = 0;
  let release;
  const createGate = gate ? new Promise((resolve) => { release = resolve; }) : null;
  const createDocument = async (spec) => {
    creates++;
    if (createGate) await createGate;
    if (createFailure) throw new Error('Photoshop refused create');
    const id = 100 + creates;
    documents.set(id, {
      documentId: id, documentName: `LUUX ${spec.label}`, width: spec.width, height: spec.height,
      documentMode: 'RGB', documentDepth: 8, colorProfileName: 'sRGB IEC61966-2.1', hasBackgroundLayer: false,
      ...actualOverride
    });
    return { id };
  };
  const readDocumentById = (id) => documents.get(id) || null;
  const register = registerFailure ? { ...registry, addTarget: () => { throw new Error('Registry refused'); } } : registry;
  return { registry, controller: createTargetQuickCreate({ registry: register, createDocument, readDocumentById, confirmContext }), documents, release: () => release?.(), get creates() { return creates; } };
}

{
  const f = fixture();
  assert.equal((await f.controller.run(FRONT, 'DIRECT')).status, 'READY');
  assert.equal(f.registry.resolve(FRONT, 'DIRECT', (id) => f.documents.get(id)).status, 'READY');
  assert.equal((await f.controller.run(FRONT, 'DIRECT')).status, 'READY');
  assert.equal(f.creates, 1, 'READY must not create/replace again');
  assert.equal(f.registry.size(), 1);
  f.documents.clear();
  assert.equal(f.controller.status(FRONT, 'DIRECT').status, 'TARGET UNAVAILABLE');
  assert.equal((await f.controller.run(FRONT, 'DIRECT')).status, 'READY');
  assert.equal(f.creates, 2, 'closed target permits a new explicit create');
}
{
  const f = fixture();
  const wrong = { documentId: 44, documentName: 'Wrong canonical doc', width: 4728, height: 5760, documentMode: 'RGB', documentDepth: 8 };
  f.documents.set(44, wrong);
  f.registry.addTarget({ label: 'WRONG', documentSnapshot: wrong, familyId: BACK, outputKind: 'DIRECT' });
  assert.equal(f.controller.status(BACK, 'DIRECT').status, 'TARGET UNAVAILABLE');
  assert.equal((await f.controller.run(BACK, 'DIRECT')).status, 'READY');
  assert.equal(f.registry.resolve(BACK, 'DIRECT', (id) => f.documents.get(id)).target.width, 2100);
}
{
  const f = fixture({ createFailure: true });
  assert.equal((await f.controller.run(BACK, 'DIRECT')).status, 'CREATE FAILED');
  assert.equal(f.registry.size(), 0);
}
{
  const f = fixture({ actualOverride: { width: 4728 } });
  assert.equal((await f.controller.run(BACK, 'DIRECT')).status, 'REGISTRATION REFUSED');
  assert.equal(f.registry.size(), 0);
  assert.equal(f.documents.size, 1, 'failed validation does not close the created document');
}
{
  const f = fixture({ actualOverride: { documentDepth: 16 } });
  assert.equal((await f.controller.run(BACK, 'DIRECT')).status, 'REGISTRATION REFUSED');
  assert.equal(f.registry.size(), 0);
}
{
  const f = fixture({ actualOverride: { hasBackgroundLayer: true } });
  assert.equal((await f.controller.run(BACK, 'DIRECT')).status, 'REGISTRATION REFUSED');
  assert.equal(f.registry.size(), 0);
}
{
  const f = fixture({ actualOverride: { colorProfileName: 'Adobe RGB (1998)' } });
  assert.equal((await f.controller.run(FRONT, 'DIRECT')).status, 'REGISTRATION REFUSED');
  assert.equal(f.registry.size(), 0);
}
{
  const f = fixture({ actualOverride: { documentId: 999 } });
  assert.equal((await f.controller.run(FRONT, 'DIRECT')).status, 'REGISTRATION REFUSED');
  assert.equal(f.registry.size(), 0);
}
{
  const f = fixture({ registerFailure: true });
  assert.equal((await f.controller.run(BACK, 'DIRECT')).status, 'REGISTRATION FAILED');
  assert.equal(f.registry.size(), 0);
  assert.equal(f.documents.size, 1);
}
{
  const f = fixture({ gate: true });
  const first = f.controller.run(FRONT, 'DIRECT');
  assert.equal((await f.controller.run(FRONT, 'DIRECT')).status, 'CREATING');
  f.release();
  assert.equal((await first).status, 'READY');
  assert.equal(f.creates, 1);
}
{
  const f = fixture({ confirmContext: () => false });
  assert.equal((await f.controller.run(FRONT, 'CANONICAL')).status, 'REGISTRATION REFUSED');
  assert.equal(f.registry.size(), 0);
}

const html = readFileSync(new URL('../../photoshop-uxp/luux-live-link/index.html', import.meta.url), 'utf8');
const uxp = readFileSync(new URL('../../photoshop-uxp/luux-live-link/index.js', import.meta.url), 'utf8');
const broker = readFileSync(new URL('../src/live-link-broker.cjs', import.meta.url), 'utf8');
const renderer = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
assert.ok(html.indexOf('DIRECT TARGETS · PRIMARY') < html.indexOf('CANONICAL TARGET · SECONDARY'));
assert.ok(html.indexOf('quick-canonical') < html.indexOf('add-bake-target'));
assert.ok(html.includes('REGISTER ACTIVE TARGET'), 'existing manual registration remains');
assert.ok(uxp.includes("state.targetQuick.activeFamilyId, 'CANONICAL'"));
assert.ok(!uxp.includes('getByName('), 'no document-name scan');
assert.ok(!uxp.includes('autoBindTarget'), 'no automatic target scanner');
assert.ok(broker.includes("socket !== clients.renderer") && broker.includes("case 'TARGET_FAMILY_CONTEXT'"));
assert.ok(renderer.includes("sendLinkMessage({ type: 'TARGET_FAMILY_CONTEXT', familyId })"));
assert.ok(uxp.includes('state.targetQuick.activeFamilyId = message.familyId === FRONT || message.familyId === BACK'));

// The only new wire message is a small, role-checked Family context relay.
const brokerInstance = createLiveLinkBroker({ config: { ...linkConfig, port: 0 } });
await once(brokerInstance.server, 'listening');
const endpoint = `ws://127.0.0.1:${brokerInstance.server.address().port}`;
async function peer(role) {
  const socket = new WebSocket(endpoint);
  const queue = [];
  const waiters = [];
  socket.on('message', (bytes) => {
    const message = JSON.parse(bytes.toString('utf8'));
    const at = waiters.findIndex((waiter) => waiter.predicate(message));
    if (at >= 0) {
      const waiter = waiters.splice(at, 1)[0];
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    }
    else queue.push(message);
  });
  const wait = (predicate) => {
    const at = queue.findIndex(predicate);
    if (at >= 0) return Promise.resolve(queue.splice(at, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timer: null };
      waiters.push(waiter);
      waiter.timer = setTimeout(() => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) { waiters.splice(index, 1); reject(new Error(`Timed out waiting for ${role} message`)); }
      }, 3000);
    });
  };
  await once(socket, 'open');
  socket.send(JSON.stringify({ type: 'HELLO', protocol: linkConfig.protocol, protocolVersion: linkConfig.protocolVersion, role }));
  await wait((message) => message.type === 'HELLO_ACK');
  return { socket, wait, send: (message) => socket.send(JSON.stringify(message)) };
}
const rendererPeer = await peer('renderer');
const photoshopPeer = await peer('photoshop');
rendererPeer.send({ type: 'TARGET_FAMILY_CONTEXT', familyId: FRONT });
assert.deepEqual(await photoshopPeer.wait((message) => message.type === 'TARGET_FAMILY_CONTEXT'), { type: 'TARGET_FAMILY_CONTEXT', familyId: FRONT });
rendererPeer.send({ type: 'TARGET_FAMILY_CONTEXT', familyId: null });
assert.deepEqual(await photoshopPeer.wait((message) => message.type === 'TARGET_FAMILY_CONTEXT'), { type: 'TARGET_FAMILY_CONTEXT', familyId: null });
photoshopPeer.send({ type: 'TARGET_FAMILY_CONTEXT', familyId: BACK });
assert.equal((await photoshopPeer.wait((message) => message.type === 'ERROR' && message.code === 'ROLE_VIOLATION')).code, 'ROLE_VIOLATION');
rendererPeer.send({ type: 'TARGET_FAMILY_CONTEXT', familyId: 'OTHER' });
assert.equal((await rendererPeer.wait((message) => message.type === 'ERROR' && message.code === 'INVALID_TARGET_FAMILY_CONTEXT')).code, 'INVALID_TARGET_FAMILY_CONTEXT');
rendererPeer.socket.close();
photoshopPeer.socket.close();
await Promise.all([once(rendererPeer.socket, 'close'), once(photoshopPeer.socket, 'close')]);
await brokerInstance.close();
console.log('BLOCK 9B-B AUTOMATED VALIDATION: PASS');
