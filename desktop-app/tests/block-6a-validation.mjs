import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { ANAMORPHIC_FRONT_75F_PROFILE } from '../src/anamorphic-calibration-profile.js';
import {
  PROJECTION_BAKE_MATTE_ASSET,
  PROJECTION_BAKE_PROFILE,
  validateProjectionBakeProfile
} from '../src/projection-bake-profile.js';
import { inspectAnamorphicGlb } from '../scripts/anamorphic-glb-inspection.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(appRoot, '..');
const runtimeSource = await readFile(path.join(appRoot, 'src', 'projection-bake-runtime.js'), 'utf8');
const rendererSource = await readFile(path.join(appRoot, 'src', 'renderer.js'), 'utf8');
const buildSource = await readFile(path.join(appRoot, 'scripts', 'build.mjs'), 'utf8');
const mainSource = await readFile(path.join(appRoot, 'src', 'main.cjs'), 'utf8');
const indexSource = await readFile(path.join(appRoot, 'src', 'index.html'), 'utf8');
const maskPath = path.join(projectRoot, PROJECTION_BAKE_PROFILE.productionMask.sourcePath);
const maskBytes = await readFile(maskPath);
const matteBytes = await readFile(path.join(projectRoot, PROJECTION_BAKE_MATTE_ASSET.sourcePath));
const matteInspection = inspectAnamorphicGlb(matteBytes);
const maskMetadata = await sharp(maskBytes).metadata();
const { data: maskPixels, info: maskInfo } = await sharp(maskBytes)
  .raw({ depth: 'uchar' })
  .toBuffer({ resolveWithObject: true });

assert.equal(validateProjectionBakeProfile().valid, true);
assert.equal(PROJECTION_BAKE_PROFILE.familyId, 'ANAMORPHIC_FRONT_75F');
assert.equal(PROJECTION_BAKE_PROFILE.surfaceBinding.exactName, 'ANAM_SURFACE_FRONT75F');
assert.equal(PROJECTION_BAKE_PROFILE.surfaceBinding.uvPolicy, 'PRESERVE_AUTHORED_NO_REMAP');
assert.deepEqual(PROJECTION_BAKE_PROFILE.workingResolution, ANAMORPHIC_FRONT_75F_PROFILE.workingResolution);
assert.deepEqual(PROJECTION_BAKE_PROFILE.canonicalResolution, ANAMORPHIC_FRONT_75F_PROFILE.finalOutput);
assert.equal(PROJECTION_BAKE_PROFILE.calibrationCamera, ANAMORPHIC_FRONT_75F_PROFILE.camera);
assert.equal(PROJECTION_BAKE_PROFILE.validity.environmentDepthIncluded, false);
assert.equal(PROJECTION_BAKE_PROFILE.validity.dedicatedMatteDepthIncluded, true);
assert.deepEqual(PROJECTION_BAKE_PROFILE.validity.occluderBinding.exactNames, ['ANAM_BAKE_MATTE_INNER']);
assert.equal(PROJECTION_BAKE_PROFILE.validity.occluderBinding.loadScope, 'PROJECTION_BAKE_RUN_ONLY');
assert.equal(PROJECTION_BAKE_PROFILE.validity.occluderBinding.ordinarySceneAttachment, 'NEVER');
assert.equal(matteBytes.length, PROJECTION_BAKE_MATTE_ASSET.byteLength);
assert.equal(createHash('sha256').update(matteBytes).digest('hex').toUpperCase(), PROJECTION_BAKE_MATTE_ASSET.sha256);
assert.equal(matteInspection.sceneNodeCount, 1);
assert.equal(matteInspection.nodeRecords[0].name, 'ANAM_BAKE_MATTE_INNER');
assert.equal(matteInspection.nodeRecords[0].vertexCount, 2350);
assert.equal(matteInspection.nodeRecords[0].uv0Bounds, null);
assert.equal(PROJECTION_BAKE_PROFILE.productionMask.colorSpace, 'NO_COLOR_SPACE_LINEAR_SCALAR');
assert.equal(PROJECTION_BAKE_PROFILE.productionMask.width, 4728);
assert.equal(PROJECTION_BAKE_PROFILE.productionMask.height, 5760);
assert.equal(maskMetadata.width, 4728);
assert.equal(maskMetadata.height, 5760);
assert.equal(maskMetadata.depth, 'ushort');
assert.equal(maskMetadata.channels, 4);
assert.equal(
  createHash('sha256').update(maskBytes).digest('hex').toUpperCase(),
  PROJECTION_BAKE_PROFILE.productionMask.sha256
);

let black = 0;
let white = 0;
let gray = 0;
let nonGrayRgb = 0;
let nonOpaque = 0;
for (let offset = 0; offset < maskPixels.length; offset += maskInfo.channels) {
  const red = maskPixels[offset];
  const green = maskPixels[offset + 1];
  const blue = maskPixels[offset + 2];
  const alpha = maskPixels[offset + 3];
  if (red !== green || red !== blue) nonGrayRgb += 1;
  if (alpha !== 255) nonOpaque += 1;
  if (red === 0) black += 1;
  else if (red === 255) white += 1;
  else gray += 1;
}
assert.equal(nonGrayRgb, 0, 'Production validity mask must be grayscale data.');
assert.equal(nonOpaque, 0, 'Production validity mask source alpha must be opaque; grayscale carries validity.');
assert(black > 0, 'Production validity mask must contain invalid black pixels.');
assert(white > 0, 'Production validity mask must contain valid white pixels.');
assert(gray > 0, 'Production validity mask must contain gray feather pixels.');

assert.match(runtimeSource, /projectionMatrix \* modelViewMatrix \* vec4\(position, 1\.0\)/);
assert.match(runtimeSource, /visibilityDepth/);
assert.match(runtimeSource, /new THREE.DepthTexture/);
assert.match(runtimeSource, /THREE\.UnsignedIntType/);
assert.match(runtimeSource, /target\.depthTexture\.minFilter = THREE\.NearestFilter/);
assert.match(runtimeSource, /this\.renderer\.setPixelRatio\(1\)/);
assert.match(runtimeSource, /renderer\.setPixelRatio\(snapshot\.pixelRatio\)/);
assert.match(runtimeSource, /projectedDepth - frontmostDepth > visibilityDepthEpsilon/);
assert.match(runtimeSource, /PROJECTION_CAMERA_DEPTH_TEXTURE_FRONTMOST/);
assert.match(runtimeSource, /VISIBILITY_DEPTH_EPSILON_STEPS = 4/);
assert.match(runtimeSource, /NO_NORMAL_THRESHOLD_DEPTH_PRIMARY_GRAZING_PRESERVED/);
assert.doesNotMatch(runtimeSource, /nearestUvDistance|visibilityUvEpsilon|BLOCK6A_VISIBILITY_AUTHORED_UV_LOOKUP/);
assert.match(runtimeSource, /environmentDepthIncluded: false/);
assert.match(runtimeSource, /dedicatedMatteDepthIncluded: true/);
assert.match(runtimeSource, /FAMILY_BOUND_SIGNAGE_SURFACE_PLUS_DEDICATED_INNER_MATTE/);
assert.match(runtimeSource, /colorWrite: false/);
assert.match(rendererSource, /loadProjectionBakeMatte/);
assert.match(rendererSource, /ordinarySceneAttached: gltf\.scene\.parent !== null/);
assert.match(rendererSource, /matteAsset\.dispose\(\)/);
assert.match(runtimeSource, /gl_Position = vec4\(uv\.x \* 2\.0 - 1\.0, 1\.0 - uv\.y \* 2\.0/);
assert.match(runtimeSource, /canonicalTexture, vec2\(vCanonicalUv\.x, 1\.0 - vCanonicalUv\.y\)/);
assert.doesNotMatch(runtimeSource, /uvMin|uvMax|normalizeUv|normalizedUv/);
assert.match(runtimeSource, /source\.a \* maskWeight/);
assert.match(runtimeSource, /blending: THREE\.NoBlending/);
assert.match(runtimeSource, /THREE\.NoToneMapping/);
assert.match(runtimeSource, /THREE\.NoColorSpace/);
assert.match(runtimeSource, /BLOCK6A_FULL_WHITE_CONTROL_MASK/);
assert.match(runtimeSource, /BLOCK6A_SYNTHETIC_SCALAR_MASK/);
assert.match(runtimeSource, /\[0, 128, 255, 64\]/);
assert.match(runtimeSource, /resources\.visibilityTarget\.dispose\(\)/);
assert.match(runtimeSource, /resources\.bakeTarget\.dispose\(\)/);
assert.match(runtimeSource, /resources\.reprojectTarget\.dispose\(\)/);
assert.match(rendererSource, /RUN TEST BAKE|runProjectionBake/);
assert.match(indexSource, /SAVE SOURCE PNG/);
assert.match(indexSource, /SAVE DIRECT PNG/);
assert.match(indexSource, /SAVE BAKE PNG/);
assert.match(indexSource, /SAVE REPROJECTED PNG/);
assert.match(rendererSource, /inspectBlock6AExportPng/);
assert.match(runtimeSource, /Block6B_\$\{profile\.familySlug\}/);
assert.match(runtimeSource, /targetToTopLeftCanvas/);
assert.match(rendererSource, /roundTripMetricsPass/);
assert.match(rendererSource, /maeMax: 1/);
assert.match(rendererSource, /rmseMax: 5/);
assert.match(rendererSource, /block6AFrontValidation: 'PASS_CLOSED'/);
assert.match(rendererSource, /block6BUserValidation = 'PASS_CLOSED'/);
assert.match(rendererSource, /photoshopWritePerformed = false/);
assert.match(buildSource, /Projection validity mask source contract mismatch/);
assert.match(mainSource, /block6b-source-preview\.png/);
assert.match(indexSource, /CANONICAL BAKE/);
assert.match(indexSource, /REPROJECTED/);

console.log(JSON.stringify({
  block: '6A',
  profile: PROJECTION_BAKE_PROFILE.id,
  familyId: PROJECTION_BAKE_PROFILE.familyId,
  workingResolution: PROJECTION_BAKE_PROFILE.workingResolution,
  canonicalResolution: PROJECTION_BAKE_PROFILE.canonicalResolution,
  mask: {
    path: PROJECTION_BAKE_PROFILE.productionMask.sourcePath,
    sha256: PROJECTION_BAKE_PROFILE.productionMask.sha256,
    width: maskMetadata.width,
    height: maskMetadata.height,
    sourceDepth: maskMetadata.depth,
    black,
    white,
    gray,
    nonGrayRgb,
    nonOpaque
  },
  contracts: {
    syntheticNativeRgba: true,
    authoredUvPreserved: true,
    canonicalTopLeftExplicit: true,
    cameraDepthWithDedicatedInnerMatte: true,
    productionMaskLinearScalar: true,
    fullWhiteControlAvailable: true,
    syntheticMaskControlAvailable: true,
    nativeCanonicalTarget: true,
    sameCameraReprojection: true,
    manualRunOnly: true,
    photoshopWriteExcluded: true,
    userValidation: 'PASS_CLOSED'
  },
  pass: true
}, null, 2));
