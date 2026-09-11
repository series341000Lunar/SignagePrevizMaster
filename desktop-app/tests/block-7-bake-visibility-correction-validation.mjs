import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ANAMORPHIC_BACK_PROFILE,
  ANAMORPHIC_FAMILY_IDS,
  ANAMORPHIC_FRONT_75F_PROFILE
} from '../src/anamorphic-calibration-profile.js';
import { PROJECTION_BAKE_MATTE_ASSET, getProjectionBakeProfile } from '../src/projection-bake-profile.js';
import { inspectAnamorphicGlb } from '../scripts/anamorphic-glb-inspection.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(appRoot, '..');
const read = (relativePath) => readFile(path.join(projectRoot, relativePath), 'utf8');
const sha256 = async (relativePath) => createHash('sha256')
  .update(await readFile(path.join(projectRoot, relativePath)))
  .digest('hex')
  .toUpperCase();

const [runtime, renderer, main, profileSource, correctionDocument, handoffDocument, worldNormalComparison] = await Promise.all([
  read('desktop-app/src/projection-bake-runtime.js'),
  read('desktop-app/src/renderer.js'),
  read('desktop-app/src/main.cjs'),
  read('desktop-app/src/projection-bake-profile.js'),
  read('docs/BLOCK-7-BAKE-VISIBILITY-CORRECTION.md'),
  read('docs/POST-BLOCK-7-DEDICATED-MATTE-HANDOFF.md'),
  read('desktop-app/scripts/compare-world-normal-silhouette.mjs')
]);

const front = getProjectionBakeProfile(ANAMORPHIC_FAMILY_IDS.FRONT_75F);
const back = getProjectionBakeProfile(ANAMORPHIC_FAMILY_IDS.BACK);
const matteBytes = await readFile(path.join(projectRoot, PROJECTION_BAKE_MATTE_ASSET.sourcePath));
const matteInspection = inspectAnamorphicGlb(matteBytes);

assert.equal(front.surfaceBinding.exactName, 'ANAM_SURFACE_FRONT75F');
assert.equal(back.surfaceBinding.exactName, 'ANAM_SURFACE_BACK');
assert.equal(front.calibrationCamera, ANAMORPHIC_FRONT_75F_PROFILE.camera);
assert.equal(back.calibrationCamera, ANAMORPHIC_BACK_PROFILE.camera);
assert.equal(back.calibrationCamera.runtimeFov, 18.374);
assert.equal(back.calibrationCamera.runtimeAspect, 0.546875);
assert.equal(front.canonicalResolution.width, 4728);
assert.equal(front.canonicalResolution.height, 5760);
assert.equal(back.canonicalResolution.width, 4728);
assert.equal(back.canonicalResolution.height, 5760);
assert.equal(matteBytes.length, 82352);
assert.equal(PROJECTION_BAKE_MATTE_ASSET.sha256, '378B97CACCA9D43E5DC02876F279D154E637D558E7D1AAE3F33D51B42FFA0B0D');
assert.equal(matteInspection.sha256, PROJECTION_BAKE_MATTE_ASSET.sha256);
assert.deepEqual(matteInspection.nodeRecords.map((node) => node.name), ['ANAM_BAKE_MATTE_INNER']);
assert.equal(matteInspection.nodeRecords[0].vertexCount, 2350);

assert.equal(
  await sha256('3DAsset/Signage/Previz_3DWorld_Anamorphic_Front75F_v01.glb'),
  '47B2BD9256363E8FF7527E08A23B5AB31543D7019C123E80E9B1A7385D821EBF'
);
assert.equal(
  await sha256('3DAsset/Signage/Previz_3DWorld_Anamorphic_Back_v01.glb'),
  'C149B914836177BF4737FA11A03A2A6447F626D1E09700B4FD79C7C6EE027AA3'
);

assert.match(profileSource, /PROJECTION_CAMERA_DEPTH_FRONTMOST_MULTIPLY_OPTIONAL_BAKE_MASK/);
assert.match(profileSource, /FAMILY_BOUND_SIGNAGE_SURFACE_PLUS_DEDICATED_INNER_MATTE/);
assert.match(profileSource, /Previz_Anamorphic_BakeMatte_v01\.glb/);
assert.match(profileSource, /ANAM_BAKE_MATTE_INNER/);
assert.match(profileSource, /EXACT_NAME_ONLY_DEPTH_ONLY_NO_COLOR/);
assert.match(profileSource, /FOUR_ACTUAL_DEPTH_BUFFER_QUANTIZATION_STEPS/);
assert.match(runtime, /new THREE\.DepthTexture/);
assert.match(runtime, /visibilityTarget\.depthTexture/);
assert.match(runtime, /projectedDepth - frontmostDepth > visibilityDepthEpsilon/);
assert.match(runtime, /getParameter\(this\.renderer\.getContext\(\)\.DEPTH_BITS\)/);
assert.match(runtime, /VISIBILITY_DEPTH_EPSILON_STEPS = 4/);
assert.match(runtime, /PROJECTION_CAMERA_DEPTH_TEXTURE_FRONTMOST/);
assert.match(runtime, /FAMILY_BOUND_SIGNAGE_SURFACE_PLUS_DEDICATED_INNER_MATTE/);
assert.match(runtime, /colorWrite: false/);
assert.match(runtime, /matteIncluded: true/);
assert.match(runtime, /matteScope: 'PROJECTION_BAKE_OFFSCREEN_ONLY'/);
assert.match(runtime, /Projection Bake exact occluder binding mismatch/);
assert.match(runtime, /NO_NORMAL_THRESHOLD_DEPTH_PRIMARY_GRAZING_PRESERVED/);
assert.match(runtime, /visibilityDiagnosticFragmentShader/);
assert.match(runtime, /outputDataUrl\(outputKind\)/);
assert.match(runtime, /vec4\(0\.0, 1\.0, 0\.0, 1\.0\)/);
assert.match(runtime, /vec4\(1\.0, 0\.75, 0\.0, 1\.0\)/);
assert.match(runtime, /vec4\(1\.0, 0\.0, 0\.0, 1\.0\)/);
assert.doesNotMatch(runtime, /nearestUvDistance|visibilityUvEpsilon|visibilitySurfaceId/);
assert.doesNotMatch(runtime, /THREE\.FrontSide|CULL_FACE/);
assert.match(renderer, /runPostBlock7BakeVisibilityCorrectionSmoke/);
assert.match(renderer, /loadProjectionBakeMatte/);
assert.match(renderer, /gltf\.scene\.parent !== null/);
assert.match(renderer, /disposedAfterBake: false/);
assert.match(renderer, /runProjectionFamilySmoke\('front75f', 3, 'full-white'\)/);
assert.match(renderer, /runProjectionFamilySmoke\('back', 3, 'full-white'\)/);
assert.match(renderer, /runProjectionFamilySmoke\('front75f', 1, 'full-white'\)/);
assert.match(renderer, /result\.directProjection\.matteIncluded === true/);
assert.match(renderer, /reprojectOnlyPixelCount === 0/);
assert.match(renderer, /glbGeometryModified: false/);
assert.match(renderer, /result\.directProjection\.matteScope === 'PROJECTION_BAKE_OFFSCREEN_ONLY'/);
assert.match(main, /PostBlock7_FRONT75F_VisibilityDiagnostic\.png/);
assert.match(main, /PostBlock7_BACK_VisibilityDiagnostic\.png/);
assert.match(main, /PostBlock7_FRONT75F_Direct_3000x3840\.png/);
assert.match(main, /PostBlock7_FRONT75F_Canonical_4728x5760\.png/);
assert.match(main, /PostBlock7_FRONT75F_Reprojected_3000x3840\.png/);
assert.match(main, /PostBlock7_BACK_Direct_2100x3840\.png/);
assert.match(main, /PostBlock7_BACK_Canonical_4728x5760\.png/);
assert.match(main, /PostBlock7_BACK_Reprojected_2100x3840\.png/);
assert.match(main, /bakeVisibilityCorrection\.technicalPass === true/);
assert.match(correctionDocument, /USER VISUAL VALIDATION:\s*`PASS \/ CLOSED`/);
assert.match(correctionDocument, /USER REPORTED VISUAL FAIL/);
assert.match(correctionDocument, /Calibration_LUUX_Back_WorldNormal_\.png/);
assert.match(correctionDocument, /Calibration_LUUX_Front_WorldNormal_\.png/);
assert.match(correctionDocument, /22\.7 cm/);
assert.match(correctionDocument, /ANAM_BAKE_MATTE_INNER/);
assert.match(handoffDocument, /Status:\s*`PASS \/ CLOSED`/);
assert.match(handoffDocument, /Previz_Anamorphic_BakeMatte_v01\.glb/);
assert.match(handoffDocument, /anamorphic-to-planar/);
assert.match(worldNormalComparison, /VISUAL_EVIDENCE_ONLY_NOT_AN_AUTOMATIC_USER_PASS/);
assert.match(worldNormalComparison, /referenceOnlyBeyondOnePixel/);
assert.match(worldNormalComparison, /actualOnlyBeyondOnePixel/);

console.log(JSON.stringify({
  correction: 'POST-BLOCK-7-BAKE-VISIBILITY',
  mask: 'OFF',
  depthVisibility: 'PROJECTION_CAMERA_DEPTH_TEXTURE_FRONTMOST',
  depthSource: 'FAMILY_BOUND_SIGNAGE_SURFACE_PLUS_DEDICATED_INNER_MATTE',
  occluderNames: ['ANAM_BAKE_MATTE_INNER'],
  depthEpsilonSteps: 4,
  facingGuard: 'NONE',
  glbHashesUnchanged: true,
  familyCalibrationUnchanged: true,
  userVisualValidation: 'PASS_CLOSED',
  pass: true
}, null, 2));
