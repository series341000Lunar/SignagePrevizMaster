import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeAuthoringPreviewAlpha } from '../src/authoring-view-settings.js';
import { AUTHORING_BLEND_MODES, ScreenImageLayerStack } from '../src/screen-image-authoring.js';

const require = createRequire(import.meta.url);
const { validateBakeApplyAck, validateBakeMetadata } = require('../src/live-link-broker.cjs');
const { compactAuthoringOrderMap, createOwnedLayerRegistry, ownedLayerKey } = require('../../photoshop-uxp/luux-live-link/owned-layer-registry.js');
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(appRoot, '..');
const rendererSource = await readFile(path.join(appRoot, 'src', 'renderer.js'), 'utf8');
const htmlSource = await readFile(path.join(appRoot, 'src', 'index.html'), 'utf8');
const uxpSource = await readFile(path.join(projectRoot, 'photoshop-uxp', 'luux-live-link', 'index.js'), 'utf8');

const source = (name, family = 'ANAMORPHIC_FRONT_75F') => ({
  id: name, name: `${name}.png`, filename: `${name}.png`, type: 'image/png', mimeType: 'image/png',
  width: family.endsWith('BACK') ? 2100 : 3000, height: 3840, hasAlpha: true, byteLength: 16
});
const stack = new ScreenImageLayerStack({ idPrefix: 'block8c-layer' });
stack.activateFamily('ANAMORPHIC_FRONT_75F');
const a = stack.addLayer(source('A'), 'ANAMORPHIC_FRONT_75F');
const b = stack.addLayer(source('B'), 'ANAMORPHIC_FRONT_75F');
const c = stack.addLayer(source('C'), 'ANAMORPHIC_FRONT_75F');
assert.deepEqual(AUTHORING_BLEND_MODES, ['NORMAL', 'MULTIPLY', 'SCREEN', 'LINEAR_DODGE']);
assert.ok(stack.layers.every((layer) => layer.opacity === 1 && layer.blendMode === 'NORMAL'));

stack.selectLayer(b.layerId);
stack.markBaked();
const bakedPixelRevision = b.bakedPixelRevision;
const rawBake = new Uint8Array([12, 34, 56, 78]);
stack.setLayerOpacity(b.layerId, 0.5);
stack.setLayerBlendMode(b.layerId, 'MULTIPLY');
stack.setLayerVisibility(b.layerId, false);
stack.reorderLayer(b.layerId, 0);
assert.equal(b.pixelRevision, bakedPixelRevision);
assert.equal(b.bakedPixelRevision, bakedPixelRevision);
assert.equal(stack.pixelDirty, false);
assert.equal(stack.metadataDirty, true);
assert.deepEqual(rawBake, new Uint8Array([12, 34, 56, 78]), 'metadata changes leave raw bake bytes invariant');
assert.equal(computeAuthoringPreviewAlpha(0.8, true, 0.5, 0.5), 0.4);
assert.equal(computeAuthoringPreviewAlpha(0.8, false, 0.5, 0.5), 0.2);
stack.setLayerVisibility(b.layerId, true);
stack.setTransform({ x: 0.4 });
assert.equal(stack.pixelDirty, true, 'transform changes require a pixel bake');

const buttonStack = new ScreenImageLayerStack({ idPrefix: 'button' });
buttonStack.activateFamily('FRONT');
const buttonA = buttonStack.addLayer(source('A'), 'FRONT');
buttonStack.addLayer(source('B'), 'FRONT');
buttonStack.addLayer(source('C'), 'FRONT');
buttonStack.moveLayer(buttonA.layerId, 'up');
const buttonOrder = buttonStack.layers.map((layer) => layer.source.filename);
const dragStack = new ScreenImageLayerStack({ idPrefix: 'drag' });
dragStack.activateFamily('FRONT');
const dragA = dragStack.addLayer(source('A'), 'FRONT');
dragStack.addLayer(source('B'), 'FRONT');
dragStack.addLayer(source('C'), 'FRONT');
dragStack.reorderLayer(dragA.layerId, 1);
assert.deepEqual(dragStack.layers.map((layer) => layer.source.filename), buttonOrder);
dragStack.activateFamily('BACK');
dragStack.addLayer(source('A', 'ANAMORPHIC_BACK'), 'BACK');
dragStack.activateFamily('FRONT');
assert.deepEqual(dragStack.layers.map((layer) => layer.source.filename), buttonOrder, 'cross-family stacks remain isolated');

const owned = createOwnedLayerRegistry({ sessionId: 'block8c-session' });
const base = { targetId: 'target-1', familyId: 'FRONT', outputKind: 'DIRECT', documentId: 100 };
for (const [index, layer] of [a, b, c].entries()) {
  owned.register({ ...base, authoringLayerId: layer.layerId, photoshopLayerId: 1000 + index, layerName: layer.source.filename, composite: { order: index, opacity: layer.opacity, blendMode: layer.blendMode, visible: layer.visible } });
}
assert.equal(owned.listBinding('target-1', 'FRONT', 'DIRECT').length, 3, 'three layers accumulate');
const before = owned.get('target-1', 'FRONT', 'DIRECT', b.layerId);
owned.register({ ...base, authoringLayerId: b.layerId, photoshopLayerId: before.photoshopLayerId, layerName: 'B updated', composite: { order: 0, opacity: 0.25, blendMode: 'SCREEN', visible: true } });
assert.equal(owned.listBinding('target-1', 'FRONT', 'DIRECT').length, 3);
assert.equal(owned.get('target-1', 'FRONT', 'DIRECT', b.layerId).photoshopLayerId, before.photoshopLayerId, 're-bake updates exact owned layer');
assert.notEqual(ownedLayerKey('target-1', 'FRONT', 'DIRECT', a.layerId), ownedLayerKey('target-1', 'BACK', 'DIRECT', a.layerId));
assert.deepEqual([...compactAuthoringOrderMap([2])], [[2, 0]], 'one transmitted layer maps its sparse authoring order to Photoshop order 0');
assert.deepEqual([...compactAuthoringOrderMap([2, 0])], [[0, 0], [2, 1]], 'partial transmission preserves relative authoring order with compact Photoshop indices');
assert.deepEqual([...compactAuthoringOrderMap([2, 1, 0])], [[0, 0], [1, 1], [2, 2]], 'complete transmission converges to identical authoring and Photoshop order');
assert.throws(() => compactAuthoringOrderMap([1, 1]), /unique non-negative/);

const brokerConfig = { maxFrameBytes: 1024, chunkSizeBytes: 1024 };
stack.setLayerOpacity(a.layerId, 0.45);
const brokerMetadata = {
  jobId: 1,
  documentId: 100,
  targetDocumentId: 100,
  width: 1,
  height: 1,
  components: 4,
  componentSize: 8,
  totalBytes: 4,
  chunkSize: 4,
  chunkCount: 1,
  familyId: 'ANAMORPHIC_FRONT_75F',
  outputKind: 'DIRECT',
  outputId: 'front-direct',
  targetId: 'target-1',
  targetSessionId: 'session-1',
  bindingKey: 'ANAMORPHIC_FRONT_75F:DIRECT',
  pixelFormat: 'RGBA',
  alpha: 'STRAIGHT',
  orientation: 'TOP_LEFT',
  authoringLayerId: a.layerId,
  metadataRevision: a.metadataRevision,
  opacity: a.opacity,
  blendMode: a.blendMode,
  visible: a.visible,
  order: a.order,
  authoringStack: [a, b, c].map((layer) => ({
    authoringLayerId: layer.layerId,
    metadataRevision: layer.metadataRevision,
    order: layer.order,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    visible: layer.visible
  }))
};
assert.equal(validateBakeMetadata(brokerMetadata, brokerConfig), 4);
assert.throws(() => validateBakeMetadata({ ...brokerMetadata, authoringStack: brokerMetadata.authoringStack.map((layer, index) => index === 0 ? { ...layer, opacity: 1.1 } : layer) }, brokerConfig), /composite metadata is invalid/);

const selectedExpected = brokerMetadata.authoringStack.find((layer) => layer.authoringLayerId === brokerMetadata.authoringLayerId);
const appliedAck = {
  type: 'BAKE_APPLIED',
  jobId: brokerMetadata.jobId,
  targetSessionId: brokerMetadata.targetSessionId,
  targetId: brokerMetadata.targetId,
  documentId: brokerMetadata.documentId,
  targetDocumentId: brokerMetadata.targetDocumentId,
  familyId: brokerMetadata.familyId,
  outputKind: brokerMetadata.outputKind,
  authoringLayerId: brokerMetadata.authoringLayerId,
  photoshopLayerId: 501,
  metadataRevision: selectedExpected.metadataRevision,
  opacity: selectedExpected.opacity,
  blendMode: selectedExpected.blendMode,
  visible: selectedExpected.visible,
  order: selectedExpected.order,
  photoshopOrder: 0,
  appliedLayers: [{ ...selectedExpected, photoshopLayerId: 501, photoshopOrder: 0 }]
};
assert.equal(validateBakeApplyAck(appliedAck, brokerMetadata, true), true);
assert.equal(appliedAck.order, 2, 'ACK retains the full authoring-stack order for a single sparse layer');
assert.equal(appliedAck.photoshopOrder, 0, 'ACK may report the compact physical order separately');
const quantizedOpacityAck = {
  ...appliedAck,
  opacity: 115 / 255,
  appliedLayers: [{ ...appliedAck.appliedLayers[0], opacity: 115 / 255 }]
};
assert.equal(validateBakeApplyAck(quantizedOpacityAck, brokerMetadata, true), true, 'Photoshop 8-bit opacity quantization is accepted');
assert.throws(() => validateBakeApplyAck({ ...appliedAck, targetId: 'wrong-target' }, brokerMetadata, true), (error) => error.code === 'ACK_TARGET_ID_MISMATCH');
assert.throws(() => validateBakeApplyAck({ ...appliedAck, authoringLayerId: 'wrong-authoring-layer' }, brokerMetadata, true), (error) => error.code === 'ACK_AUTHORING_LAYER_ID_MISMATCH');
assert.throws(() => validateBakeApplyAck({ ...appliedAck, photoshopLayerId: null }, brokerMetadata, true), (error) => error.code === 'ACK_PHOTOSHOP_LAYER_ID_MISMATCH');
assert.throws(() => validateBakeApplyAck({ ...appliedAck, metadataRevision: appliedAck.metadataRevision + 1 }, brokerMetadata, true), (error) => error.code === 'ACK_METADATA_REVISION_MISMATCH');
assert.throws(() => validateBakeApplyAck({ ...appliedAck, opacity: selectedExpected.opacity === 1 ? 0.45 : 1 }, brokerMetadata, true), (error) => error.code === 'ACK_OPACITY_MISMATCH');

assert.match(rendererSource, /function reorderAuthoringLayer\(/);
assert.match(rendererSource, /reorderAuthoringLayer\(authoringSession\.selectedLayerId/);
assert.match(rendererSource, /reorderAuthoringLayer\(drag\.layerId/);
assert.match(rendererSource, /AUTHORING_CANVAS_BLEND/);
assert.match(rendererSource, /sendProjectionToPhotoshop\('DIRECT'\)/);
assert.match(rendererSource, /state\.projectionBake\.result\?\.authoringLayerId === authoringSession\.selectedLayerId/);
assert.match(rendererSource, /window\.runBlock8CCompositeSmoke/);
assert.match(uxpSource, /constants\.BlendMode\.LINEARDODGE/);
assert.match(uxpSource, /createOwnedLayerRegistry/);
assert.match(uxpSource, /constants\.ElementPlacement\.PLACEINSIDE/);
assert.match(uxpSource, /layer\.opacity = normalized\.opacity \* 100/);
assert.match(uxpSource, /layer\.blendMode = photoshopBlendMode/);
assert.match(uxpSource, /layer\.visible = normalized\.visible/);
assert.match(uxpSource, /opacityBefore: before\.opacity/);
assert.match(uxpSource, /resolvedPhotoshopLayerId: layer\.id/);
assert.match(uxpSource, /photoshopLayerId: selectedApplied\.photoshopLayerId/);
assert.match(rendererSource, /metadataRevision: selectedLayer\.metadataRevision/);
assert.match(rendererSource, /validateRendererBakeApplyAck\(metadata, applied\)/);
assert.match(rendererSource, /exportPng\(kind, \{ opacity: exportOpacity \}\)/);
assert.match(uxpSource, /\(0\.5 \/ 255\) \+ 0\.000001/);
assert.match(uxpSource, /\.sort\(\(a, b\) => a\.composite\.order - b\.composite\.order\)/);
assert.match(uxpSource, /compactAuthoringOrderMap\(resolved\.map\(\(entry\) => entry\.composite\.order\)\)/);
assert.match(uxpSource, /order:\s*entry\.composite\.order/);
assert.match(uxpSource, /photoshopOrder:\s*actual\.order/);
assert.doesNotMatch(uxpSource, /getByName\(|find\(.*\.name === metadata\.authoringLayerName/);
for (const id of ['authoring-opacity', 'authoring-blend-mode', 'authoring-quick-rail', 'quick-bake-current', 'quick-send-direct']) assert.match(htmlSource, new RegExp(`id="${id}"`));
assert.doesNotMatch(htmlSource, /data-photoshop-output="FULL_MERGED"/, 'later Full Merge must not alter Block 8C per-layer Photoshop send');

console.log(JSON.stringify({
  block: '8C',
  technicalPass: true,
  opacity: { range: [0, 1], default: 1, previewAlphaMultiplication: true },
  blendModes: AUTHORING_BLEND_MODES,
  pixelMetadataSplit: true,
  perLayerOwnership: true,
  threeLayersAccumulate: true,
  sparsePerLayerSendOrder: true,
  exactRebakeIsolation: true,
  dragAndButtonSharedReorder: true,
  crossFamilyDrag: 'BLOCKED_BY_ACTIVE_STACK',
  quickRail: { collapsedDefault: true, bakeUsesExistingPath: true, sendDirectUsesExistingTransport: true },
  fullMerged: false,
  userValidation: 'PENDING'
}, null, 2));
