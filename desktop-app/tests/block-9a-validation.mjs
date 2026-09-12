import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { WebSocket } from 'ws';
import {
  PROJECT_SCHEMA_VERSION,
  PROJECT_SUPPORTED_SCHEMA_VERSIONS,
  createProjectSavePayload,
  prepareProjectLoad,
  validateProjectManifest
} from '../src/project-persistence.js';
import { encodeRgba8Png } from '../src/png-codec.js';
import { ScreenImageLayerStack } from '../src/screen-image-authoring.js';
import { mergeRgbaLayers } from '../src/full-merge-runtime.js';
import { selectionSnapshotInitialLayerState } from '../src/bitmap-source.js';

const require = createRequire(import.meta.url);
const config = require('../src/live-link-config.json');
const { createLiveLinkBroker, validateSnapshotMetadata } = require('../src/live-link-broker.cjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [rendererSource, brokerSource, uxpSource, mainSource, preloadSource, htmlSource] = await Promise.all([
  readFile(path.join(root, 'src', 'renderer.js'), 'utf8'),
  readFile(path.join(root, 'src', 'live-link-broker.cjs'), 'utf8'),
  readFile(path.join(root, '..', 'photoshop-uxp', 'luux-live-link', 'index.js'), 'utf8'),
  readFile(path.join(root, 'src', 'main.cjs'), 'utf8'),
  readFile(path.join(root, 'src', 'project-preload.cjs'), 'utf8'),
  readFile(path.join(root, 'src', 'index.html'), 'utf8')
]);

const width = 3;
const height = 2;
const rgba = new Uint8Array([
  17, 33, 65, 0, 220, 15, 90, 64, 3, 200, 77, 255,
  199, 88, 41, 1, 10, 20, 30, 128, 255, 254, 253, 255
]);
const pngBytes = await encodeRgba8Png(rgba, width, height);
const decoded = new Uint8Array(await sharp(pngBytes).ensureAlpha().raw().toBuffer());
assert.deepEqual(decoded, rgba, 'lossless PNG must preserve exact RGBA including RGB under alpha=0');

function runtimeSource({ sourceType, sourceId, filename, provenance, alphaContract }) {
  return {
    id: sourceId,
    sourceId,
    filename,
    name: filename,
    originalFilename: filename,
    sourceType,
    mimeType: 'image/png',
    type: 'image/png',
    width,
    height,
    hasAlpha: true,
    byteLength: pngBytes.byteLength,
    originalBytes: pngBytes,
    alphaContract,
    colorContract: sourceType === 'FILE' ? 'EMBEDDED_FILE_PROFILE' : 'SRGB_IEC61966_2_1_RGB8',
    provenance
  };
}

const fileSource = runtimeSource({
  sourceType: 'FILE', sourceId: 'file-source-1', filename: 'file.png', alphaContract: 'EMBEDDED_FILE_ALPHA',
  provenance: { type: 'FILE', originalFilename: 'file.png' }
});
const compositeSource = runtimeSource({
  sourceType: 'PHOTOSHOP_COMPOSITE_SNAPSHOT', sourceId: 'snapshot-composite-1', filename: 'composite.png', alphaContract: 'OPAQUE_RGB8',
  provenance: {
    type: 'PHOTOSHOP_COMPOSITE_SNAPSHOT', documentName: 'Source.psd', captureDocumentId: 101,
    documentWidth: 12, documentHeight: 10, captureBounds: { left: 2, top: 3, right: 5, bottom: 5 },
    captureTimestamp: '2026-09-12T12:00:00.000Z', captureMode: 'COMPOSITE'
  }
});
const selectionSource = runtimeSource({
  sourceType: 'PHOTOSHOP_SELECTION_SNAPSHOT', sourceId: 'snapshot-selection-1', filename: 'selection.png', alphaContract: 'PHOTOSHOP_IMAGING_RGBA8_PROBE_PENDING',
  provenance: {
    type: 'PHOTOSHOP_SELECTION_SNAPSHOT', documentName: 'Source.psd', captureDocumentId: 101,
    selectedLayerIds: [77], selectedLayerNames: ['Pixel Art'], documentWidth: 12, documentHeight: 10,
    captureBounds: { left: -1, top: 4, right: 2, bottom: 6 },
    captureTimestamp: '2026-09-12T12:01:00.000Z', captureMode: 'SINGLE_PIXEL_LAYER'
  }
});

const frontId = 'ANAMORPHIC_FRONT_75F';
const stack = new ScreenImageLayerStack({ idPrefix: 'projection-layer' });
const fileLayer = stack.addLayer(fileSource, frontId, fileSource);
const compositeLayer = stack.addLayer(compositeSource, frontId, compositeSource);
const selectionInitialState = selectionSnapshotInitialLayerState({
  captureMode: 'SINGLE_PIXEL_LAYER', sourceType: 'PHOTOSHOP_SELECTION_SNAPSHOT',
  documentWidth: 12, documentHeight: 10, width, height, level: 0,
  captureBounds: { left: -1, top: 4, right: 2, bottom: 6 }, selectedLayerOpacity: 0.62
}, { width: 12, height: 10 });
const selectionLayer = stack.addLayer(selectionSource, frontId, selectionSource, selectionInitialState);
assert.deepEqual(selectionLayer.transform, { x: 1 / 24, y: 0.5, scale: 1, rotationDegrees: 0 });
assert.equal(selectionLayer.opacity, 0.62);
stack.setVectorMaskEnabled(selectionLayer.layerId, true);
const maskPath = stack.addVectorMaskPath(selectionLayer.layerId, { operation: 'ADD', initialPoint: { x: 0.1, y: 0.1 } });
stack.appendVectorMaskPoint(selectionLayer.layerId, maskPath.pathId, 0.9, 0.1);
stack.appendVectorMaskPoint(selectionLayer.layerId, maskPath.pathId, 0.5, 0.9);
stack.closeVectorMaskPath(selectionLayer.layerId, maskPath.pathId);

const payload = await createProjectSavePayload(stack, { assetNameToken: 'block9a' });
assert.equal(PROJECT_SCHEMA_VERSION, 3);
assert.deepEqual(PROJECT_SUPPORTED_SCHEMA_VERSIONS, [1, 2, 3]);
validateProjectManifest(payload.manifest);
const savedLayers = payload.manifest.families[frontId].layers;
assert.deepEqual(savedLayers.map((layer) => layer.source.sourceType), [
  'PHOTOSHOP_SELECTION_SNAPSHOT', 'PHOTOSHOP_COMPOSITE_SNAPSHOT', 'FILE'
]);
assert.equal(savedLayers[0].source.provenance.selectedLayerIds[0], 77);
assert.notEqual(savedLayers[0].source.sourceId, savedLayers[0].layerId);
assert.notEqual(savedLayers[0].source.assetReference, savedLayers[0].source.sourceId);
assert.equal(JSON.stringify(payload.manifest).includes('photoshopLayerId'), false, 'capture provenance is not Photoshop output authority');
assert.ok(payload.assets.every((asset) => /^assets\/asset-block9a-\d{4}\.png$/.test(asset.assetReference)));

const decodeAsset = async ({ source, bytes }) => {
  const metadata = await sharp(bytes).metadata();
  return { ...source, width: metadata.width, height: metadata.height, hasAlpha: Boolean(metadata.hasAlpha), originalBytes: bytes, dispose() {} };
};
const prepared = await prepareProjectLoad(payload.manifest, payload.assets, { activeFamilyId: frontId, decodeAsset });
const restored = new ScreenImageLayerStack({ idPrefix: 'projection-layer' });
restored.restore(prepared.snapshot);
assert.deepEqual(restored.layers.map((layer) => layer.source.sourceType), savedLayers.map((layer) => layer.source.sourceType));
assert.deepEqual(restored.selectedLayer.vectorMask, selectionLayer.vectorMask, 'Snapshot uses the existing Vector Mask model');
assert.deepEqual(restored.selectedLayer.transform, selectionInitialState.transform, 'Selection document position survives project Save/Open');
assert.equal(restored.selectedLayer.opacity, 0.62, 'Selection Photoshop opacity survives project Save/Open');
const merged = mergeRgbaLayers(restored.renderLayers.map((layer) => ({ pixels: rgba, opacity: layer.opacity, blendMode: layer.blendMode, visible: layer.visible })), width * height);
assert.equal(merged.byteLength, rgba.byteLength, 'FILE and Snapshot layers share the existing Full Merge compositor');

const fileOnly = new ScreenImageLayerStack({ idPrefix: 'projection-layer' });
fileOnly.addLayer(fileSource, frontId, fileSource);
const filePayload = await createProjectSavePayload(fileOnly, { assetNameToken: 'legacy' });
for (const version of [1, 2]) {
  const legacy = structuredClone(filePayload.manifest);
  legacy.schemaVersion = version;
  for (const family of Object.values(legacy.families)) for (const layer of family.layers) {
    const source = layer.source;
    layer.source = {
      sourceType: 'FILE', assetReference: source.assetReference, originalFilename: source.originalFilename,
      width: source.width, height: source.height, mimeType: source.mimeType, byteLength: source.byteLength,
      sha256: source.sha256, hasAlpha: source.hasAlpha
    };
    if (version === 1) delete layer.vectorMask;
  }
  validateProjectManifest(legacy);
  const migrated = await prepareProjectLoad(legacy, filePayload.assets, { activeFamilyId: frontId, decodeAsset });
  const migratedSource = migrated.snapshot.stacks[0][1][0].source;
  assert.equal(migratedSource.sourceType, 'FILE');
  assert.equal(migratedSource.provenance.type, 'FILE');
  assert.equal(migratedSource.colorContract, 'EMBEDDED_FILE_PROFILE');
}
const future = structuredClone(payload.manifest);
future.schemaVersion = 4;
assert.throws(() => validateProjectManifest(future), (error) => error.code === 'PROJECT_SCHEMA_UNSUPPORTED');

const validMetadata = {
  type: 'SNAPSHOT_BEGIN', snapshotJobId: 'snapshot-protocol-1', captureRequestId: 'request-1', projectSessionId: 'session-1', familyId: frontId,
  captureMode: 'SINGLE_PIXEL_LAYER', sourceType: 'PHOTOSHOP_SELECTION_SNAPSHOT', documentId: 101, documentName: 'Source.psd',
  documentWidth: 12, documentHeight: 10, selectedLayerIds: [77], selectedLayerNames: ['Pixel Art'],
  selectedLayerOpacity: 0.62,
  captureBounds: { left: -1, top: 4, right: 2, bottom: 6 }, captureTimestamp: '2026-09-12T12:01:00.000Z',
  width, height, components: 4, componentSize: 8, pixelFormat: 'RGBA', level: 0,
  totalBytes: rgba.byteLength, chunkSize: 12, chunkCount: 2
};
assert.equal(validateSnapshotMetadata(validMetadata, config), rgba.byteLength);
assert.throws(() => validateSnapshotMetadata({ ...validMetadata, level: 1 }, config), /native Photoshop pyramid level 0/);
assert.throws(() => validateSnapshotMetadata({ ...validMetadata, captureBounds: { left: 0, top: 0, right: 2, bottom: 2 } }, config), /match bitmap dimensions/);
assert.throws(() => validateSnapshotMetadata({ ...validMetadata, selectedLayerOpacity: 1.01 }, config), /normalized Photoshop layer opacity/);

function peer(endpoint) {
  const socket = new WebSocket(endpoint);
  const queue = [];
  const waiters = [];
  socket.on('message', (data, isBinary) => {
    const item = isBinary ? { binary: true, data: Buffer.from(data) } : { binary: false, data: JSON.parse(data.toString('utf8')) };
    const index = waiters.findIndex((waiter) => waiter.predicate(item));
    if (index >= 0) {
      const waiter = waiters.splice(index, 1)[0]; clearTimeout(waiter.timer); waiter.resolve(item);
    } else queue.push(item);
  });
  return {
    socket,
    open: () => once(socket, 'open'),
    sendJson: (value) => socket.send(JSON.stringify(value)),
    wait(predicate, timeoutMs = 3000) {
      const index = queue.findIndex(predicate);
      if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = { predicate, resolve, timer: setTimeout(() => reject(new Error('Protocol wait timeout.')), timeoutMs) };
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
renderer.sendJson({ type: 'HELLO', protocol: config.protocol, protocolVersion: config.protocolVersion, role: 'renderer' });
await renderer.wait((item) => item.data?.type === 'HELLO_ACK');
const photoshop = peer(endpoint);
await photoshop.open();
photoshop.sendJson({ type: 'HELLO', protocol: config.protocol, protocolVersion: config.protocolVersion, role: 'photoshop' });
await photoshop.wait((item) => item.data?.type === 'HELLO_ACK');
await renderer.wait((item) => item.data?.type === 'LINK_STATUS' && item.data.photoshopConnected);

const request = { type: 'SNAPSHOT_REQUEST', snapshotJobId: validMetadata.snapshotJobId, captureRequestId: validMetadata.captureRequestId, projectSessionId: validMetadata.projectSessionId, familyId: frontId, captureMode: validMetadata.captureMode };
renderer.sendJson(request);
assert.equal((await photoshop.wait((item) => item.data?.type === 'SNAPSHOT_REQUEST')).data.snapshotJobId, validMetadata.snapshotJobId);
photoshop.sendJson({ type: 'FRAME_BEGIN', frameId: 99, documentId: 101, documentName: 'busy.psd', documentWidth: 1, documentHeight: 1, width: 1, height: 1, components: 3, componentSize: 8, pixelFormat: 'RGB', totalBytes: 3, chunkSize: 3, chunkCount: 1 });
assert.equal((await photoshop.wait((item) => item.data?.type === 'ERROR' && item.data.frameId === 99)).data.code, 'LARGE_TRANSFER_BUSY');
photoshop.sendJson(validMetadata);
assert.equal((await renderer.wait((item) => item.data?.type === 'SNAPSHOT_BEGIN')).data.sourceType, validMetadata.sourceType);
for (let index = 0; index < 2; index += 1) {
  const chunk = rgba.subarray(index * 12, (index + 1) * 12);
  photoshop.sendJson({ type: 'SNAPSHOT_CHUNK', snapshotJobId: validMetadata.snapshotJobId, chunkIndex: index, byteLength: chunk.byteLength });
  photoshop.socket.send(chunk);
  assert.equal((await renderer.wait((item) => item.data?.type === 'SNAPSHOT_CHUNK')).data.chunkIndex, index);
  assert.deepEqual((await renderer.wait((item) => item.binary)).data, Buffer.from(chunk));
}
photoshop.sendJson({ type: 'SNAPSHOT_END', snapshotJobId: validMetadata.snapshotJobId, receivedBytes: rgba.byteLength, receivedChunks: 2 });
await renderer.wait((item) => item.data?.type === 'SNAPSHOT_END');
const assetSha256 = 'A'.repeat(64);
renderer.sendJson({ type: 'SNAPSHOT_COMPLETE', snapshotJobId: validMetadata.snapshotJobId, layerId: 'projection-layer-0001', sourceType: validMetadata.sourceType, width, height, assetSha256 });
assert.equal((await photoshop.wait((item) => item.data?.type === 'SNAPSHOT_COMPLETE')).data.layerId, 'projection-layer-0001');
assert.equal((await renderer.wait((item) => item.data?.type === 'SNAPSHOT_COMMITTED')).data.assetSha256, assetSha256);
assert.equal(broker.getSnapshot().activeSnapshotJobId, null);
renderer.sendJson(request);
assert.equal((await renderer.wait((item) => item.data?.type === 'SNAPSHOT_ERROR' && item.data.snapshotJobId === validMetadata.snapshotJobId)).data.code, 'DUPLICATE_SNAPSHOT_JOB');

renderer.close(); photoshop.close();
await Promise.all([once(renderer.socket, 'close'), once(photoshop.socket, 'close')]);
await broker.close();

assert.match(rendererSource, /encodeRgba8Png\(rgba, metadata\.width, metadata\.height\)/);
assert.match(rendererSource, /selectionSnapshotInitialLayerState\(metadata, currentProjectionBakeProfile\(\)\.workingResolution\)/);
assert.match(rendererSource, /authoringSession\.addLayer\(runtime, metadata\.familyId, runtime, initialState\)/);
assert.match(rendererSource, /opacity:\s*selectedLayer\.opacity/);
assert.ok(rendererSource.indexOf('encodeRgba8Png(rgba, metadata.width, metadata.height)') < rendererSource.indexOf('authoringSession.addLayer(runtime, metadata.familyId, runtime, initialState)'), 'Layer install is transactional after asset/runtime establishment');
assert.match(rendererSource, /handleSnapshotCommitted/);
assert.match(rendererSource, /SNAPSHOT_LATE_COMPLETION/);
assert.match(rendererSource, /rollbackSnapshotLayer/);
assert.match(rendererSource, /projectSessionId/);
assert.doesNotMatch(rendererSource, /SnapshotProjectionBakeRuntime|SnapshotVectorMask|SnapshotFullMerge/);
assert.match(brokerSource, /LARGE_TRANSFER_BUSY/);
assert.match(brokerSource, /DUPLICATE_SNAPSHOT_JOB/);
assert.match(uxpSource, /layer\.kind !== constants\.LayerKind\.NORMAL/);
assert.match(uxpSource, /result\.level !== 0/);
assert.match(uxpSource, /activeHistoryState/);
assert.match(uxpSource, /selectedLayerOpacity/);
assert.match(uxpSource, /layer\.opacity\s*=\s*normalized\.opacity\s*\*\s*100/);
assert.match(uxpSource, /state\.snapshot\.processing/);
assert.match(htmlSource, /id="authoring-photoshop-composite"/);
assert.match(htmlSource, /id="authoring-photoshop-selection"/);
assert.match(mainSource, /nodeIntegration:\s*false/);
assert.match(mainSource, /contextIsolation:\s*true/);
assert.match(mainSource, /sandbox:\s*true/);
assert.match(mainSource, /webSecurity:\s*true/);
assert.doesNotMatch(preloadSource, /require\('node:fs|arbitrary/i);

console.log(JSON.stringify({
  block: '9A', technicalPass: true, schemaVersion: 3, supportedSchemas: [1, 2, 3],
  sourceTypes: ['FILE', 'PHOTOSHOP_COMPOSITE_SNAPSHOT', 'PHOTOSHOP_SELECTION_SNAPSHOT'],
  exactRgbaPngRoundTrip: true, transparentRgbPreserved: true, nativeBoundsValidated: true,
  selectionDocumentPlacementRestored: true, selectionOpacityRoundTripMetadata: true,
  snapshotTransportSeparated: true, duplicateCompletionGuarded: true, liveSnapshotMutuallyExclusive: true,
  mixedStackPersistence: true, vectorMaskShared: true, bakeRuntimeShared: true,
  realPhotoshopProbe: 'USER_FAIL_REPRODUCED_FIX_PENDING_RETEST', userValidation: 'PARTIAL_PASS_SELECTION_RETEST_REQUIRED'
}, null, 2));
