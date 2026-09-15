import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compositeStraightRgba, mergeRgbaLayers } from '../src/full-merge-runtime.js';
import { ScreenImageLayerStack } from '../src/screen-image-authoring.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [renderer, html, css, runtime] = await Promise.all([
  readFile(path.join(root, 'src', 'renderer.js'), 'utf8'),
  readFile(path.join(root, 'src', 'index.html'), 'utf8'),
  readFile(path.join(root, 'src', 'styles.css'), 'utf8'),
  readFile(path.join(root, 'src', 'full-merge-runtime.js'), 'utf8')
]);

const near = (actual, expected, epsilon = 1e-10) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
const backdrop = [0.2, 0.4, 0.6, 0.5];
const source = [0.8, 0.3, 0.1, 0.6];
const opacity = 0.45;
const expectedBlend = {
  NORMAL: source.slice(0, 3),
  MULTIPLY: [0.16, 0.12, 0.06],
  SCREEN: [0.84, 0.58, 0.64],
  LINEAR_DODGE: [1, 0.7, 0.7]
};
for (const mode of Object.keys(expectedBlend)) {
  const actual = compositeStraightRgba(backdrop, source, opacity, mode);
  const As = source[3] * opacity;
  const Ab = backdrop[3];
  const Ao = As + Ab - As * Ab;
  near(actual[3], Ao);
  for (let channel = 0; channel < 3; channel += 1) {
    const expected = ((1 - As) * backdrop[channel] * Ab + (1 - Ab) * source[channel] * As + As * Ab * expectedBlend[mode][channel]) / Ao;
    near(actual[channel], expected);
  }
}

const red = new Uint8Array([255, 0, 0, 128]);
const blue = new Uint8Array([0, 0, 255, 128]);
const green = new Uint8Array([0, 255, 0, 255]);
const forward = mergeRgbaLayers([
  { pixels: red, opacity: 0.5, blendMode: 'NORMAL', visible: true },
  { pixels: blue, opacity: 0.75, blendMode: 'SCREEN', visible: true },
  { pixels: green, opacity: 1, blendMode: 'NORMAL', visible: false }
], 1);
const reverse = mergeRgbaLayers([
  { pixels: blue, opacity: 0.75, blendMode: 'SCREEN', visible: true },
  { pixels: red, opacity: 0.5, blendMode: 'NORMAL', visible: true }
], 1);
assert.notDeepEqual(forward, reverse, 'layer order must affect the merged result');
assert.deepEqual(mergeRgbaLayers([{ pixels: green, visible: false }], 1), new Uint8ClampedArray(4), 'all hidden is transparent');
assert.deepEqual([...mergeRgbaLayers([{ pixels: red, opacity: 1, blendMode: 'NORMAL', visible: true }], 1)], [...red], 'single NORMAL 100% layer is equivalent');

const familyA = 'ANAMORPHIC_FRONT_75F';
const familyB = 'ANAMORPHIC_BACK';
const bytes = new Uint8Array([1, 2, 3, 4, 5]);
const hash = () => createHash('sha256').update(bytes).digest('hex');
const sourceHash = hash();
const makeRuntime = (name) => ({ id: name, filename: name, name, mimeType: 'image/png', type: 'image/png', width: 2, height: 2, hasAlpha: true, byteLength: bytes.length, originalBytes: bytes });
const stack = new ScreenImageLayerStack({ idPrefix: 'block8f' });
const a = stack.addLayer(makeRuntime('a.png'), familyA, makeRuntime('a.png'));
stack.markBaked();
stack.markMergedBaked();
assert.equal(stack.mergedState().dirty, false);
stack.selectLayer(a.layerId);
assert.equal(stack.mergedState().dirty, false, 'selection is UI-only');
stack.setLayerOpacity(a.layerId, 0.45);
assert.equal(stack.pixelDirty, false, 'opacity remains metadata-only for BAKE CURRENT');
assert.equal(stack.mergedState().dirty, true, 'opacity dirties Full Merge');
stack.markMergedBaked();
stack.setLayerBlendMode(a.layerId, 'MULTIPLY');
assert.equal(stack.mergedState().dirty, true);
stack.markMergedBaked();
stack.setLayerVisibility(a.layerId, false);
assert.equal(stack.mergedState().dirty, true);
stack.setLayerVisibility(a.layerId, true);
stack.markMergedBaked();
stack.setTransform({ x: 0.6 });
assert.equal(stack.pixelDirty, true);
assert.equal(stack.mergedState().dirty, true, 'pixel changes dirty both paths');
stack.activateFamily(familyB);
stack.addLayer(makeRuntime('b.png'), familyB, makeRuntime('b.png'));
stack.markMergedBaked();
stack.activateFamily(familyA);
assert.equal(stack.mergedState().dirty, true, 'family dirty state is isolated');
stack.activateFamily(familyB);
assert.equal(stack.mergedState().dirty, false, 'other family retains ready state');
const saved = stack.snapshot();
assert.ok(saved.mergedByFamily, 'runtime snapshot carries family-specific merge state');
delete saved.mergedByFamily;
const loaded = new ScreenImageLayerStack({ idPrefix: 'block8f' });
loaded.restore(saved);
assert.equal(loaded.mergedState().dirty, true, 'project-like restore never restores bake cache');
assert.equal(hash(), sourceHash, 'source bytes remain unchanged');

assert.match(html, /id="vector-mask-panel"[^>]*vector-mask-floating-panel/);
assert.match(html, /quick-bake-current[\s\S]*quick-send-direct[\s\S]*quick-bake-full-merged/);
assert.match(html, /data-full-merge-export="DIRECT"/);
assert.match(html, /data-full-merge-export="CANONICAL"/);
assert.doesNotMatch(html, /data-photoshop-output="FULL_MERGED"/);
assert.match(css, /\.vector-mask-floating-panel\s*\{[\s\S]*position:\s*absolute/);
assert.match(css, /\.vector-mask-panel-body\s*\{[\s\S]*overflow:\s*auto/);
assert.match(renderer, /outsideSignageIncluded:\s*false/);
assert.match(renderer, /fullMergeRuntime\.begin\(profile\)/);
assert.match(renderer, /autoPreview \? authoringSession\.ensureFamily\(profile\.familyId\) : authoringSession\.layers/);
assert.match(renderer, /\[\.\.\.familyLayers\]\.reverse\(\)\.filter\(\(layer\) => layer\.visible\)/);
assert.match(runtime, /retainedMergedTargets:\s*2/);
assert.match(runtime, /permanentPerLayerTargets:\s*0/);

console.log('Block 8F validation: PASS');
