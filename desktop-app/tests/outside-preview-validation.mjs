import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AuthoringViewSettings,
  DEFAULT_OUTSIDE_SIGNAGE_OPACITY,
  OUTSIDE_SIGNAGE_OPACITY_RANGE,
  OUTSIDE_SIGNAGE_PRESETS,
  computeAuthoringPreviewAlpha,
  normalizeOutsideSignageOpacity
} from '../src/authoring-view-settings.js';
import { ScreenImageAuthoringSession } from '../src/screen-image-authoring.js';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rendererSource = await readFile(path.join(appRoot, 'src', 'renderer.js'), 'utf8');
const runtimeSource = await readFile(path.join(appRoot, 'src', 'projection-bake-runtime.js'), 'utf8');
const htmlSource = await readFile(path.join(appRoot, 'src', 'index.html'), 'utf8');

assert.equal(DEFAULT_OUTSIDE_SIGNAGE_OPACITY, 0.5);
assert.deepEqual(OUTSIDE_SIGNAGE_OPACITY_RANGE, { minimum: 0, maximum: 1, step: 0.01 });
assert.deepEqual(OUTSIDE_SIGNAGE_PRESETS, { HIDE: 0, '50%': 0.5, FULL: 1 });
assert.equal(normalizeOutsideSignageOpacity(-2), 0);
assert.equal(normalizeOutsideSignageOpacity(2), 1);
assert.equal(normalizeOutsideSignageOpacity('0.35'), 0.35);

for (const [sourceAlpha, expectedOutside] of [[1, 0.5], [0.5, 0.25], [0, 0]]) {
  assert.equal(computeAuthoringPreviewAlpha(sourceAlpha, true, 0.5), sourceAlpha);
  assert.equal(computeAuthoringPreviewAlpha(sourceAlpha, false, 0.5), expectedOutside);
}
assert.equal(computeAuthoringPreviewAlpha(0.75, false, 0), 0);
assert.equal(computeAuthoringPreviewAlpha(0.75, false, 1), 0.75);

const viewSettings = new AuthoringViewSettings();
const session = new ScreenImageAuthoringSession();
const sourceA = { id: 'a', filename: 'a.png', type: 'image/png', width: 3000, height: 3840, hasAlpha: true };
const sourceB = { id: 'b', filename: 'b.jpg', type: 'image/jpeg', width: 2100, height: 3840, hasAlpha: false };
session.setSource(sourceA, 'ANAMORPHIC_FRONT_75F');
session.markBaked();
const readyRevision = session.revision;
const readyBakedRevision = session.bakedRevision;
assert.equal(viewSettings.applyPreset('HIDE'), true);
assert.equal(session.status, 'READY');
assert.equal(session.revision, readyRevision);
assert.equal(session.bakedRevision, readyBakedRevision);
assert.equal(viewSettings.applyPreset('50%'), true);
assert.equal(viewSettings.applyPreset('FULL'), true);
assert.equal(session.status, 'READY');
assert.equal(session.revision, readyRevision);
session.setTransform({ x: 0.6 });
assert.equal(session.status, 'DIRTY / NEEDS BAKE');

viewSettings.setOutsideSignageOpacity(0.35);
const viewRevisionBeforeSourceReplace = viewSettings.revision;
session.setSource(sourceB, 'ANAMORPHIC_BACK');
assert.equal(viewSettings.outsideSignageOpacity, 0.35);
assert.equal(viewSettings.revision, viewRevisionBeforeSourceReplace);
session.bindFamily('ANAMORPHIC_FRONT_75F');
assert.equal(viewSettings.outsideSignageOpacity, 0.35);
session.resetTransform();
assert.equal(viewSettings.outsideSignageOpacity, 0.35);

assert.match(htmlSource, /id="outside-signage-opacity"[^>]*min="0"[^>]*max="1"[^>]*step="0\.01"[^>]*value="0\.5"/);
assert.match(htmlSource, /data-outside-signage-preset="HIDE"/);
assert.match(htmlSource, /data-outside-signage-preset="50%"/);
assert.match(htmlSource, /data-outside-signage-preset="FULL"/);
assert.match(rendererSource, /AuthoringViewSettings/);
assert.match(rendererSource, /buildAuthoringCoverageMask/);
assert.match(rendererSource, /profile\.surfaceBinding\.exactName/);
assert.match(rendererSource, /globalCompositeOperation = 'source-in'/);
assert.match(rendererSource, /window\.runOutsideSignagePreviewSmoke/);
assert.doesNotMatch(runtimeSource, /outsideSignageOpacity|outside-signage|outside preview/i);

console.log(JSON.stringify({
  correction: 'POST-BLOCK-8A-OUTSIDE-SIGNAGE-PREVIEW',
  technicalPass: true,
  ownership: 'AUTHORING_VIEW_SETTINGS',
  default: DEFAULT_OUTSIDE_SIGNAGE_OPACITY,
  range: OUTSIDE_SIGNAGE_OPACITY_RANGE,
  presets: OUTSIDE_SIGNAGE_PRESETS,
  alphaMultiplication: true,
  dirtyInvariant: true,
  sourceReplacePersistence: true,
  familySwitchPersistence: true,
  productionBakeIsolation: true,
  userValidation: 'PASS_CLOSED'
}, null, 2));
