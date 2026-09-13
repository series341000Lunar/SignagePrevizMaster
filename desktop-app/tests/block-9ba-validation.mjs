import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PREVIEW_MODES, previewSourceDecision } from '../src/preview-mode.js';
import { ScreenImageLayerStack } from '../src/screen-image-authoring.js';
import { createProjectSavePayload, PROJECT_SCHEMA_VERSION } from '../src/project-persistence.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [html, renderer, css] = await Promise.all(['index.html', 'renderer.js', 'styles.css']
  .map((name) => readFile(path.join(root, 'src', name), 'utf8')));
const decide = (mode, width, height, overrides = {}) => previewSourceDecision({
  mode, expectedResolution: { width, height }, photoshopConnected: true,
  liveFrameCurrent: true, liveTextureAvailable: true,
  frame: { documentWidth: width, documentHeight: height, receivedWidth: width, receivedHeight: height },
  ...overrides
});

for (const [family, width] of [['FRONT_75F', 3000], ['BACK', 2100]]) {
  const authoring = decide(PREVIEW_MODES.AUTHORING, width, 3840);
  const final = decide(PREVIEW_MODES.PHOTOSHOP_FINAL, width, 3840);
  assert.equal(authoring.source, 'AUTHORING', `${family}: authoring source`);
  assert.equal(final.source, 'PHOTOSHOP_FINAL', `${family}: native Direct Photoshop source`);
  assert.deepEqual(final.expected, { width, height: 3840 });
  assert.equal(decide(PREVIEW_MODES.PHOTOSHOP_FINAL, width, 3840, {
    frame: { documentWidth: 4728, documentHeight: 5760, receivedWidth: 4728, receivedHeight: 5760 }
  }).status, 'SIZE_MISMATCH');
  assert.equal(decide(PREVIEW_MODES.PHOTOSHOP_FINAL, width, 3840, { photoshopConnected: false }).source, 'NONE');
  assert.equal(decide(PREVIEW_MODES.PHOTOSHOP_FINAL, width, 3840, { liveFrameCurrent: false }).status, 'WAITING');
  assert.equal(decide(PREVIEW_MODES.PHOTOSHOP_FINAL, width, 3840, {
    frame: { documentWidth: width, documentHeight: 3840, receivedWidth: width - 1, receivedHeight: 3840 }
  }).status, 'INVALID_FRAME');
}
assert.throws(() => decide('UNKNOWN', 3000, 3840), /Unknown preview mode/);

const stack = new ScreenImageLayerStack({ idPrefix: 'block9ba' });
const before = stack.snapshot();
const savedBefore = await createProjectSavePayload(stack);
let mode = PREVIEW_MODES.AUTHORING;
for (let index = 0; index < 10; index += 1) {
  mode = mode === PREVIEW_MODES.AUTHORING ? PREVIEW_MODES.PHOTOSHOP_FINAL : PREVIEW_MODES.AUTHORING;
  decide(mode, 3000, 3840);
}
const savedAfter = await createProjectSavePayload(stack);
assert.deepEqual(stack.snapshot(), before, 'preview toggles cannot mutate the authoring stack');
assert.deepEqual(savedAfter, savedBefore, 'preview mode must be absent from project persistence');
assert.equal(savedAfter.manifest.schemaVersion, PROJECT_SCHEMA_VERSION);
assert.equal(PROJECT_SCHEMA_VERSION, 3);

assert.match(html, /id="preview-mode-control"/);
assert.match(html, /id="preview-authoring-button"/);
assert.match(html, /id="preview-photoshop-final-button"/);
assert.match(html, /id="photoshop-final-unavailable"/);
assert.match(html, /quick-bake-current[\s\S]*quick-send-direct[\s\S]*quick-bake-full-merged/);
assert.match(html, /LAYER OUTPUT · SELECTED/);
assert.match(html, /FULL COMPOSITE · EXPORT ONLY/);
assert.match(html, /ANAMORPHIC MASTER · CANONICAL 4728 × 5760/);
assert.match(html, /PLANAR MASTER · FUTURE \/ NOT AVAILABLE YET/);
assert.doesNotMatch(html, /data-photoshop-output="FULL_MERGED"/);
assert.match(renderer, /previewMode: PREVIEW_MODES\.AUTHORING/);
assert.match(renderer, /state\.previewMode = PREVIEW_MODES\.AUTHORING/);
assert.match(renderer, /state\.previewMode === PREVIEW_MODES\.AUTHORING && authoringSession\.layers/);
assert.match(renderer, /decision\.source === 'PHOTOSHOP_FINAL' \? state\.texture : null/);
assert.match(renderer, /binding\.mesh\.userData\.productionHelper === true \|\| binding\.mesh\.material\.map === desiredMap/);
const previewApply = renderer.match(/function applySitePreviewSource\(decision\) \{([\s\S]*?)\n\}/)?.[1];
assert.ok(previewApply, 'preview source application must exist');
assert.doesNotMatch(previewApply, /!binding\.textureEligible/);
assert.match(renderer, /state\.site\.activeBindings\.length > 0 && authoringOverlay\.hidden === false/);
assert.match(renderer, /state\.site\.activeBindings\.every\(\(binding\) => binding\.mesh\.material\.map === null\)/);
assert.match(renderer, /liveFrameCurrent = false/);
assert.match(renderer, /window\.runBlock9BAPreviewSmoke/);
assert.match(css, /\.preview-mode-control/);
assert.match(css, /\.photoshop-final-unavailable/);

console.log('BLOCK9BA_VALIDATION=PASS');
console.log('BLOCK9BA_FRONT=3000x3840');
console.log('BLOCK9BA_BACK=2100x3840');
console.log('BLOCK9BA_PROJECT_SCHEMA=3_UNCHANGED');
console.log('BLOCK9BA_USER_VALIDATION=PASS_CLOSED');
