import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ScreenImageLayerStack, transformToViewportRect } from '../src/screen-image-authoring.js';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rendererSource = await readFile(path.join(appRoot, 'src', 'renderer.js'), 'utf8');
const htmlSource = await readFile(path.join(appRoot, 'src', 'index.html'), 'utf8');
const disposed = [];
const stack = new ScreenImageLayerStack({ disposeRuntime: (runtime) => disposed.push(runtime.token), idPrefix: 'test-layer' });
const source = (index, family = 'FRONT') => ({
  id: `same-source-${index % 2}`,
  filename: `${family}-${index}.png`,
  type: 'image/png',
  mimeType: 'image/png',
  width: family === 'BACK' ? 2100 : 3000,
  height: 3840,
  hasAlpha: true,
  byteLength: 100 + index
});
const runtime = (index) => ({ token: `runtime-${index}` });

stack.activateFamily('FRONT');
const frontLayers = [];
for (let index = 0; index < 5; index += 1) frontLayers.push(stack.addLayer(source(index), 'FRONT', runtime(index)));
assert.equal(stack.layers.length, 5);
assert.equal(new Set(stack.layers.map((layer) => layer.layerId)).size, 5);
assert.equal(stack.layers[0].layerId, frontLayers[4].layerId, 'new layer is topmost and selected');
assert.equal(stack.selectedLayerId, frontLayers[4].layerId);
assert.deepEqual(stack.layers.map((layer) => layer.order), [0, 1, 2, 3, 4]);
assert.deepEqual(stack.renderLayers.map((layer) => layer.layerId), [...stack.layers].reverse().map((layer) => layer.layerId));
assert.ok(stack.layers.every((layer) => layer.familyId === 'FRONT' && layer.mappingMode === 'SCREEN_PROJECTED' && layer.visible));

const transformTargets = [
  { x: 0.12, y: 0.23, scale: 0.8, rotationDegrees: 10 },
  { x: 0.42, y: 0.53, scale: 1.1, rotationDegrees: 20 },
  { x: 0.72, y: 0.63, scale: 1.4, rotationDegrees: 30 }
];
for (let index = 0; index < 3; index += 1) {
  stack.selectLayer(frontLayers[index].layerId);
  stack.setTransform(transformTargets[index]);
  assert.deepEqual(stack.selectedLayer.transform, transformTargets[index]);
  const frameA = { x: 0, y: 0, width: 800, height: 1024 };
  const frameB = { x: 0, y: 0, width: 1600, height: 2048 };
  const rectA = transformToViewportRect(stack.selectedLayer.transform, stack.selectedLayer.source, 3000 / 3840, frameA);
  const rectB = transformToViewportRect(stack.selectedLayer.transform, stack.selectedLayer.source, 3000 / 3840, frameB);
  assert.equal(rectA.centerX / frameA.width, rectB.centerX / frameB.width);
  assert.equal(rectA.centerY / frameA.height, rectB.centerY / frameB.height);
  assert.equal(rectA.width / frameA.width, rectB.width / frameB.width);
  assert.equal(rectA.height / frameA.height, rectB.height / frameB.height);
}

stack.selectLayer(frontLayers[2].layerId);
const beforeReplace = {
  layerId: stack.selectedLayer.layerId,
  familyId: stack.selectedLayer.familyId,
  visible: stack.selectedLayer.visible,
  transform: stack.selectedLayer.transform,
  index: stack.layers.indexOf(stack.selectedLayer)
};
stack.replaceSelectedSource(source(99), runtime(99));
assert.deepEqual({
  layerId: stack.selectedLayer.layerId,
  familyId: stack.selectedLayer.familyId,
  visible: stack.selectedLayer.visible,
  transform: stack.selectedLayer.transform,
  index: stack.layers.indexOf(stack.selectedLayer)
}, beforeReplace);
assert.ok(disposed.includes('runtime-2'));

const sourceBeforeFailedReplace = stack.selectedLayer.source;
assert.throws(() => stack.replaceSelectedSource({ name: 'broken.txt', type: 'text/plain', width: 0, height: 0 }, runtime(1000)));
assert.equal(stack.selectedLayer.source, sourceBeforeFailedReplace, 'failed replacement preserves selected source');

const selectedId = stack.selectedLayerId;
const beforeMoveSource = stack.selectedLayer.source;
const beforeMoveTransform = stack.selectedLayer.transform;
assert.equal(stack.moveLayer(selectedId, 'up'), true);
assert.deepEqual(stack.layers.map((layer) => layer.order), [0, 1, 2, 3, 4]);
assert.equal(stack.selectedLayer.source, beforeMoveSource);
assert.equal(stack.selectedLayer.transform, beforeMoveTransform);
assert.equal(stack.moveLayer(selectedId, 'down'), true);

stack.setLayerVisibility(selectedId, false);
const hiddenTransform = stack.selectedLayer.transform;
assert.equal(stack.selectedLayerId, selectedId);
assert.equal(stack.selectedLayer.visible, false);
assert.equal(stack.status, 'HIDDEN / BAKE DISABLED');
assert.ok(!stack.renderLayers.some((layer) => layer.layerId === selectedId));
stack.setLayerVisibility(selectedId, true);
assert.equal(stack.selectedLayer.transform, hiddenTransform);

const deleteIndex = stack.layers.findIndex((layer) => layer.layerId === selectedId);
const expectedBelow = stack.layers[deleteIndex + 1]?.layerId || stack.layers[deleteIndex - 1]?.layerId || null;
const deleted = stack.deleteLayer(selectedId);
assert.equal(deleted.layerId, selectedId);
assert.equal(stack.selectedLayerId, expectedBelow);
assert.ok(disposed.includes('runtime-99'));

const frontSnapshot = stack.layers.map((layer) => ({ id: layer.layerId, transform: layer.transform }));
stack.activateFamily('BACK');
assert.equal(stack.layers.length, 0);
const backA = stack.addLayer(source(10, 'BACK'), 'BACK', runtime(10));
const backB = stack.addLayer(source(11, 'BACK'), 'BACK', runtime(11));
stack.setTransform({ x: 0.81, y: 0.19, scale: 1.7, rotationDegrees: 43 });
assert.equal(stack.layers.length, 2);
assert.equal(stack.selectedLayerId, backB.layerId);
stack.activateFamily('FRONT');
assert.deepEqual(stack.layers.map((layer) => ({ id: layer.layerId, transform: layer.transform })), frontSnapshot);
stack.activateFamily('BACK');
assert.equal(stack.selectedLayerId, backB.layerId);
assert.deepEqual(stack.selectedLayer.transform, { x: 0.81, y: 0.19, scale: 1.7, rotationDegrees: 43 });
assert.equal(backA.familyId, 'BACK');

for (let cycle = 0; cycle < 4; cycle += 1) {
  const ids = [];
  for (let index = 0; index < 10; index += 1) ids.push(stack.addLayer(source(100 + cycle * 10 + index, 'BACK'), 'BACK', runtime(100 + cycle * 10 + index)).layerId);
  assert.equal(new Set(ids).size, 10);
  for (const id of ids) assert.ok(stack.deleteLayer(id));
}
assert.equal(stack.layers.length, 2);
assert.equal(disposed.filter((token) => token.startsWith('runtime-1')).length >= 10, true);

stack.selectLayer(backA.layerId);
stack.markBaked();
assert.equal(stack.status, 'READY');
const bakedRevision = stack.revision;
assert.equal(stack.selectLayer(backB.layerId), true);
assert.ok(stack.revision > bakedRevision, 'selection invalidates previous output conservatively');
assert.equal(stack.status, 'DIRTY / NEEDS BAKE');

const empty = new ScreenImageLayerStack();
empty.activateFamily('EMPTY');
assert.equal(empty.selectedLayer, null);
assert.equal(empty.status, 'NO IMAGE');
assert.equal(empty.deleteLayer(), null);

const colorStack = new ScreenImageLayerStack({ idPrefix: 'color-layer' });
colorStack.activateFamily('FRONT');
const red = colorStack.addLayer({ ...source(201), filename: 'RED.png' }, 'FRONT', runtime(201));
colorStack.addLayer({ ...source(202), filename: 'GREEN.png' }, 'FRONT', runtime(202));
colorStack.addLayer({ ...source(203), filename: 'BLUE.png' }, 'FRONT', runtime(203));
assert.deepEqual(colorStack.layers.map((layer) => layer.source.filename), ['BLUE.png', 'GREEN.png', 'RED.png']);
assert.deepEqual(colorStack.renderLayers.map((layer) => layer.source.filename), ['RED.png', 'GREEN.png', 'BLUE.png']);
colorStack.moveLayer(red.layerId, 'up');
colorStack.moveLayer(red.layerId, 'up');
assert.deepEqual(colorStack.layers.map((layer) => layer.source.filename), ['RED.png', 'BLUE.png', 'GREEN.png']);
assert.deepEqual(colorStack.renderLayers.map((layer) => layer.source.filename), ['GREEN.png', 'BLUE.png', 'RED.png']);

assert.match(rendererSource, /for \(const layer of authoringSession\.renderLayers\)/);
assert.match(rendererSource, /globalCompositeOperation = 'source-over'/);
assert.match(rendererSource, /AUTHORING_LAYER_HIDDEN/);
assert.match(rendererSource, /result\.authoringLayerId = selectedLayer\?\.layerId/);
assert.match(rendererSource, /authoringSession\.activateFamily\(family\.familyId\)/);
assert.equal([...rendererSource.matchAll(/new ProjectionBakeRuntime\(/g)].length, 1, 'one shared ProjectionBakeRuntime');
for (const id of ['authoring-layer-list', 'authoring-replace-button', 'authoring-move-up', 'authoring-move-down', 'authoring-delete-layer', 'projection-selected-layer']) {
  assert.match(htmlSource, new RegExp(`id="${id}"`));
}

console.log(JSON.stringify({
  block: '8B',
  implementation: 'MULTI_IMAGE_LAYER_STACK_FOUNDATION',
  technicalPass: true,
  userValidation: 'PASS_CLOSED',
  testedLayerCount: 5,
  repeatedAddDelete: '10_LAYERS_X_4_CYCLES',
  operations: ['ADD', 'DELETE', 'SELECT', 'REORDER', 'VISIBILITY', 'REPLACE_SOURCE'],
  familyIsolation: true,
  selectedLayerBakeContract: true,
  blendMode: 'NORMAL_SOURCE_OVER_FIXED_OPACITY_1'
}, null, 2));
