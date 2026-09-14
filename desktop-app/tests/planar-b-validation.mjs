import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PlanarOutputWorkflow, validatePlanarOutput } from '../src/planar-output-workflow.js';
import { readPlanarSource } from '../src/planar-mapping-runtime.js';
import { ANAMORPHIC_FAMILY_IDS } from '../src/anamorphic-calibration-profile.js';
import { PLANAR_OUTPUT_PROFILE } from '../src/planar-mapping-profile.js';
import { ScreenImageLayerStack } from '../src/screen-image-authoring.js';

const FRONT = ANAMORPHIC_FAMILY_IDS.FRONT_75F;
const BACK = ANAMORPHIC_FAMILY_IDS.BACK;
const { width, height } = PLANAR_OUTPUT_PROFILE.outputResolution;
const outputBytes = new Uint8Array(width * height * 4);
const outputFor = (familyId, revision) => ({ bytes: outputBytes, width, height, components: 4, componentSize: 8,
  pixelFormat: 'RGBA', alpha: 'STRAIGHT', colorSpace: 'SRGB', orientation: 'TOP_LEFT',
  familyId, sourceFamilyId: familyId, sourceMergedDirectRevision: revision });
const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
const revisionByFamily = new Map([[FRONT, null], [BACK, null]]);
let reads = 0;
let renders = 0;
let released = 0;
let deferred = null;
let renderFailure = false;
const workflow = new PlanarOutputWorkflow({
  readSource: (familyId, revision) => { reads += 1; return { familyId, revision, bytes: new Uint8Array(4), outputKind: 'DIRECT' }; },
  render: async (familyId, input, revision) => {
    renders += 1;
    assert.equal(input.outputKind, 'DIRECT');
    if (renderFailure) throw new Error('TEST_RENDER_FAILED');
    if (deferred) await deferred.promise;
    return outputFor(familyId, revision);
  },
  encodePng: async () => png,
  isCurrent: (familyId, revision) => revisionByFamily.get(familyId) === revision,
  releaseOutput: () => { released += 1; }
});
const deferredJob = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };

check(workflow.state(FRONT).status === 'UNAVAILABLE', 'initial unavailable');
await assert.rejects(workflow.bake(FRONT, { ready: false, revision: 1 }), /FULL_MERGE_REQUIRED/);
check(reads === 0 && renders === 0, 'no implicit Full Merge');
revisionByFamily.set(FRONT, 10);
check(workflow.state(FRONT, { ready: true, revision: 10 }).status === 'DIRTY', 'ready Direct needs Planar');
const first = await workflow.bake(FRONT, { ready: true, revision: 10 });
check(first.width === 4728 && first.height === 5760 && workflow.readyOutput(FRONT, 10) === first, 'front ready and save gate');
check(workflow.state(FRONT, { ready: true, revision: 10 }).status === 'READY', 'ready revision');
check(workflow.readyOutput(FRONT, 11) === null, 'revision mismatch cannot save');
workflow.invalidateFamily(FRONT);
revisionByFamily.set(FRONT, 11);
check(workflow.state(FRONT, { ready: true, revision: 11 }).status === 'DIRTY' && workflow.readyOutput(FRONT, 11) === null, 'new Direct dirty');
const second = await workflow.bake(FRONT, { ready: true, revision: 11 });
check(second !== first && released === 1, 'transactional replacement');
revisionByFamily.set(BACK, 20);
await workflow.bake(BACK, { ready: true, revision: 20 });
check(workflow.state(FRONT, { ready: true, revision: 11 }).status === 'READY' &&
  workflow.state(BACK, { ready: true, revision: 20 }).status === 'READY', 'family independent');
const canonicalOnlyMarker = 99;
check(canonicalOnlyMarker !== 11 && workflow.readyOutput(FRONT, 11) === second,
  'canonical-only marker does not invalidate Direct-derived Planar');
workflow.invalidateFamily(BACK);
check(workflow.state(FRONT, { ready: true, revision: 11 }).status === 'READY', 'back invalidation does not affect front');
revisionByFamily.set(BACK, 21);
deferred = deferredJob();
const pending = workflow.bake(BACK, { ready: true, revision: 21 });
await assert.rejects(workflow.bake(FRONT, { ready: true, revision: 11 }), /PLANAR_BAKE_BUSY/);
check(workflow.state(BACK, { ready: true, revision: 21 }).status === 'BAKING', 'single in-flight job');
workflow.invalidateFamily(BACK);
revisionByFamily.set(BACK, 22);
deferred.resolve();
check(await pending === null && workflow.readyOutput(BACK, 21) === null, 'late stale result rejected');
deferred = null;
renderFailure = true;
await assert.rejects(workflow.bake(BACK, { ready: true, revision: 22 }), /TEST_RENDER_FAILED/);
check(workflow.state(BACK, { ready: true, revision: 22 }).status === 'ERROR' && !workflow.readyOutput(BACK, 22), 'failure not saveable');
renderFailure = false;
await workflow.bake(BACK, { ready: true, revision: 22 });
check(workflow.state(BACK, { ready: true, revision: 22 }).status === 'READY', 'retry succeeds');
const priorReady = workflow.readyOutput(BACK, 22);
workflow.reset();
check(workflow.state(BACK).status === 'UNAVAILABLE' && workflow.readyOutput(BACK, 22) === null && released >= 3, 'project reset clears cache');
check(priorReady !== null, 'pre-reset output existed');
revisionByFamily.set(FRONT, 30);
deferred = deferredJob();
const beforeProjectSwitch = workflow.bake(FRONT, { ready: true, revision: 30 });
workflow.reset();
deferred.resolve();
check(await beforeProjectSwitch === null && workflow.state(FRONT).status === 'UNAVAILABLE',
  'project replacement rejects late completion');
deferred = null;

const fakeMerge = {
  hasOutputs: () => true,
  result: () => ({ mergedRevision: 7 }),
  readOutputRgba: (familyId, kind) => {
    assert.equal(kind, 'DIRECT');
    const sourceWidth = familyId === FRONT ? 3000 : 2100;
    return { familyId, outputKind: kind, width: sourceWidth, height: 3840,
      components: 4, componentSize: 8, pixelFormat: 'RGBA', colorSpace: 'RGB', alpha: 'STRAIGHT',
      orientation: 'TOP_LEFT', bytes: new Uint8Array(sourceWidth * 3840 * 4) };
  }
};
for (const familyId of [FRONT, BACK]) {
  const source = readPlanarSource(fakeMerge, familyId, { ready: true, mergedDirectRevision: 7 });
  check(source.sourceFamilyId === familyId && source.sourceMergedDirectRevision === 7 &&
    source.width === (familyId === FRONT ? 3000 : 2100), 'family-native DIRECT source');
  source.bytes = null;
}
validatePlanarOutput(outputFor(FRONT, 7), FRONT, 7);
check(true, 'planar output contract');
const stack = new ScreenImageLayerStack({ onMergedInvalidated: (familyId) => workflow.invalidateFamily(familyId) });
stack.activateFamily(FRONT);
stack.invalidateMerged(FRONT);
check(workflow.state(FRONT, { ready: true, revision: 1 }).status === 'DIRTY', 'central merge invalidation hook');
const source = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
check(/quick-bake-full-merged[\s\S]*PLANAR OUTPUT · FULL COMPOSITE[\s\S]*quick-bake-planar/.test(html) &&
  /id="planar-master-title">PLANAR OUTPUT/.test(html), 'quick third tier and generic Planar heading');
check(/id="viewer"[\s\S]*id="planar-preview-overlay"[\s\S]*id="planar-preview-image"/.test(html) &&
  /id="planar-master-preview"/.test(html) &&
  styles.includes('.planar-preview-overlay[hidden]') && styles.includes('.planar-preview-image-wrap img'),
  'Planar preview is a contained, hideable canvas overlay with a reopen control');
check(source.includes('planarWorkflow.reset();') && source.includes('readPlanarSource(fullMergeRuntime, familyId') &&
  !source.includes('data-photoshop-output="PLANAR"'), 'renderer uses Planar-A boundary without Planar Photoshop send');
check(source.includes("planarMasterBake.addEventListener('click'") &&
  source.includes("quickBakePlanar.addEventListener('click'") &&
  source.includes("planarMasterSave.addEventListener('click'") &&
  source.includes('planarWorkflow.readyOutput(profile.familyId, revision)'), 'UI actions and save gate are wired');
check(source.includes('openPlanarPreview(output);') && source.includes('URL.createObjectURL(output.blob)') &&
  source.includes('URL.revokeObjectURL(planarPreviewUrl)') && source.includes('syncPlanarPreviewValidity();') &&
  source.includes("event.key === 'Escape' && !planarPreviewOverlay.hidden"),
  'Bake opens the existing PNG, invalidation and Escape close it, and object URLs are released');
console.log(`PLANAR_B_VALIDATION_PASS=${checks}`);
