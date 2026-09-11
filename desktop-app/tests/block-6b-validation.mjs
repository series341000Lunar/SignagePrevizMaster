import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANAMORPHIC_BACK_PROFILE, ANAMORPHIC_FAMILY_IDS, ANAMORPHIC_FRONT_75F_PROFILE } from '../src/anamorphic-calibration-profile.js';
import { PROJECTION_BAKE_PROFILES, PROJECTION_FAMILY_DELIVERY, getProjectionBakeProfile, validateProjectionBakeProfile } from '../src/projection-bake-profile.js';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(appRoot, '..');
const runtime = await readFile(path.join(appRoot, 'src', 'projection-bake-runtime.js'), 'utf8');
const renderer = await readFile(path.join(appRoot, 'src', 'renderer.js'), 'utf8');
const index = await readFile(path.join(appRoot, 'src', 'index.html'), 'utf8');
const main = await readFile(path.join(appRoot, 'src', 'main.cjs'), 'utf8');
const validation = await readFile(path.join(projectRoot, 'docs', 'BLOCK-6B-VALIDATION.md'), 'utf8');
const handoff = await readFile(path.join(projectRoot, 'docs', 'BLOCK-6B-HANDOFF.md'), 'utf8');

const front = getProjectionBakeProfile(ANAMORPHIC_FAMILY_IDS.FRONT_75F);
const back = getProjectionBakeProfile(ANAMORPHIC_FAMILY_IDS.BACK);
assert.equal(Object.keys(PROJECTION_BAKE_PROFILES).length, 2);
assert.equal(validateProjectionBakeProfile(front).valid, true);
assert.equal(validateProjectionBakeProfile(back).valid, true);
assert.equal(front.calibrationCamera, ANAMORPHIC_FRONT_75F_PROFILE.camera);
assert.equal(back.calibrationCamera, ANAMORPHIC_BACK_PROFILE.camera);
assert.deepEqual(front.workingResolution, { width: 3000, height: 3840, aspect: 0.78125 });
assert.deepEqual(back.workingResolution, { width: 2100, height: 3840, aspect: 0.546875 });
assert.equal(front.productionMask.status, 'PRODUCTION_REFERENCE_SUPPLIED');
assert.equal(back.productionMask.status, 'SHARED_PRODUCTION_REFERENCE_INVERTED');
assert.equal(back.productionMask.sourcePath, front.productionMask.sourcePath);
assert.equal(back.productionMask.scalarOperation, 'EXACT_LINEAR_ONE_MINUS_SHARED_PRODUCTION_MASK');
assert.equal(PROJECTION_FAMILY_DELIVERY[ANAMORPHIC_FAMILY_IDS.ILMIN_AQUBE], 'DEFERRED_EXTERNAL_VALIDATION');
assert.equal(PROJECTION_FAMILY_DELIVERY[ANAMORPHIC_FAMILY_IDS.FRONT_90F], 'DEFERRED_RECALIBRATION');
assert.equal(PROJECTION_FAMILY_DELIVERY.SYNC, 'NOT_SUPPLIED');

const directSection = runtime.slice(runtime.indexOf('const directVertexShader'), runtime.indexOf('const bakeVertexShader'));
assert.match(directSection, /sourceTexture/);
assert.match(directSection, /validityMask/);
assert.match(directSection, /gl_Position = vCameraClip/);
assert.doesNotMatch(directSection, /canonicalTexture/);
assert.match(runtime, /sourceVsDirect/);
assert.match(runtime, /directVsCanonicalReprojected/);
assert.match(runtime, /sourceVsCanonicalReprojected/);
assert.match(runtime, /p95/);
assert.match(runtime, /RAW_STRAIGHT_RGBA_NO_TONE_MAPPING_MASK_LINEAR_SCALAR/);
assert.match(runtime, /environmentIncluded: false/);
assert.match(runtime, /matteIncluded: false/);
assert.match(runtime, /resources\.directTarget\.dispose\(\)/);
assert.doesNotMatch(runtime, /uvMin|uvMax|normalizeUv|normalizedUv/);

assert.match(index, /DIRECT PROJECTED/);
assert.match(index, /CANONICAL REPROJECTED/);
assert.equal((index.match(/data-projection-export=/g) || []).length, 4);
assert.match(renderer, /runBlock6BProjectionSmoke/);
assert.match(renderer, /runProjectionFamilySmoke\('front75f', 3\)/);
assert.match(renderer, /runProjectionFamilySmoke\('back', 8\)/);
assert.match(renderer, /userValidation: 'PASS_CLOSED'/);
assert.match(main, /\['source', 'direct', 'bake', 'reproject'\]/);
assert.match(validation, /USER VISUAL VALIDATION[^\n]*(PASS|CLOSED)/i);
assert.match(validation, /BACK[^\n]*NOT_SUPPLIED/i);
assert.match(handoff, /NEXT THREAD ENTRY SNAPSHOT/);
assert.match(handoff, /PASS_CLOSED/);

console.log(JSON.stringify({
  block: '6B',
  profiles: Object.keys(PROJECTION_BAKE_PROFILES),
  outputs: ['SOURCE', 'DIRECT PROJECTED', 'CANONICAL BAKE', 'CANONICAL REPROJECTED'],
  backMask: back.productionMask,
  userVisualValidation: 'PASS_CLOSED',
  pass: true
}, null, 2));
