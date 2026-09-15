import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ScreenImageLayerStack } from '../src/screen-image-authoring.js';
import {
  createProjectSavePayload, prepareProjectLoad, validateProjectManifest,
  PROJECT_SCHEMA_VERSION, PROJECT_SUPPORTED_SCHEMA_VERSIONS
} from '../src/project-persistence.js';
import {
  DEFAULT_PREVIEW_BACKGROUND_GRAY, clampPreviewBackgroundInput,
  isPreviewBackgroundGray, previewBackgroundRgb
} from '../src/preview-background.js';

const renderer = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const stack = new ScreenImageLayerStack({ idPrefix: 'preview-background' });
const before = stack.snapshot();

assert.equal(DEFAULT_PREVIEW_BACKGROUND_GRAY, 0.5);
assert.deepEqual(PROJECT_SUPPORTED_SCHEMA_VERSIONS, [1, 2, 3, 4]);
assert.equal(PROJECT_SCHEMA_VERSION, 4);
for (const gray of [0, 0.23, 0.27, 0.5, 1]) {
  const payload = await createProjectSavePayload(stack, { previewBackgroundGray: gray });
  assert.equal(payload.manifest.preview.backgroundGray, gray);
  validateProjectManifest(payload.manifest);
  const prepared = await prepareProjectLoad(payload.manifest, payload.assets, {
    decodeAsset: async () => { throw new Error('Empty fixture must not decode assets.'); }
  });
  assert.equal(prepared.previewBackgroundGray, gray);
  assert.deepEqual(stack.snapshot(), before);
}
const base = (await createProjectSavePayload(stack)).manifest;
for (const version of [1, 2, 3]) {
  const legacy = structuredClone(base);
  legacy.schemaVersion = version;
  delete legacy.preview;
  const prepared = await prepareProjectLoad(legacy, [], { decodeAsset: async () => null });
  assert.equal(prepared.previewBackgroundGray, 0.5);
  assert.equal(legacy.preview, undefined, 'Legacy source manifest must remain untouched.');
  const illegalLegacy = structuredClone(legacy);
  illegalLegacy.preview = { backgroundGray: 0.2 };
  assert.throws(() => validateProjectManifest(illegalLegacy), (error) => error.code === 'PROJECT_MANIFEST_INVALID');
}
for (const value of [undefined, null, -0.01, 1.01, Number.NaN, Infinity, '0.5']) {
  const malformed = structuredClone(base);
  malformed.preview.backgroundGray = value;
  assert.throws(() => validateProjectManifest(malformed), (error) => error.code === 'PROJECT_PREVIEW_INVALID');
  assert.equal(isPreviewBackgroundGray(value), false);
}
for (const value of [-0.2, 0, 0.5, 1, 1.4]) {
  const clamped = clampPreviewBackgroundInput(value);
  assert.equal(clamped, Math.min(1, Math.max(0, value)));
}
assert.equal(clampPreviewBackgroundInput(''), null);
assert.deepEqual(previewBackgroundRgb([1, 0, 0], 0, 0.5), { rgb: [0.5, 0.5, 0.5], alpha: 1 });
assert.deepEqual(previewBackgroundRgb([1, 0, 0], 0.5, 0.5), { rgb: [0.75, 0.25, 0.25], alpha: 1 });
assert.deepEqual(previewBackgroundRgb([1, 0, 0], 1, 0.5), { rgb: [1, 0, 0], alpha: 1 });
for (const gray of [0, 0.5, 1]) {
  assert.deepEqual(previewBackgroundRgb([0.2, 0.6, 0.9], 1, gray),
    { rgb: [0.2, 0.6, 0.9], alpha: 1 }, 'Opaque color must ignore background gray.');
}
assert.match(html, /id="preview-background-gray"[^>]*min="0"[^>]*max="1"[^>]*step="0\.01"/);
assert.match(html, /id="authoring-background-preview"/);
assert.match(renderer, /function installPreviewBackgroundShader/);
assert.match(renderer, /float matteGray = mix\( previewBackgroundGray, 0\.0, simpleImageBlack \)/);
assert.match(renderer, /previewSrgb\.rgb = mix\( vec3\( matteGray \), previewSrgb\.rgb, diffuseColor\.a \)/);
assert.match(renderer, /transparent: !child\.userData\.previewBackgroundSurface/);
assert.match(renderer, /authoringBackgroundPreview\.getContext/);
assert.match(renderer, /previewBackgroundGray: state\.previewBackgroundGray/);
assert.match(renderer, /state\.previewBackgroundGray = prepared\.previewBackgroundGray/);
assert.doesNotMatch(renderer, /invalidateAuthoringOutputs\('preview-background/);

console.log(JSON.stringify({ block: 'POST-9B-A', technicalPass: true,
  schemaVersion: PROJECT_SCHEMA_VERSION, defaultGray: DEFAULT_PREVIEW_BACKGROUND_GRAY,
  persistenceRoundTrip: true, legacyDefault: true, rangeValidation: true,
  displayOnlyAlphaComposition: true, authoringStackUnchanged: true,
  userValidation: 'OPEN' }, null, 2));
