import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectEnvironmentGlb } from '../scripts/glb-inspection.mjs';
import { ENVIRONMENT_ASSET, ENVIRONMENT_VISIBILITY, SITE_ENVIRONMENT_PROFILE } from '../src/site-environment-profile.js';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(appRoot, '..');
const sourcePath = path.join(projectRoot, ENVIRONMENT_ASSET.sourcePath);
const builtPath = path.join(appRoot, 'build', 'assets', 'environment', ENVIRONMENT_ASSET.fileName);
const manifest = JSON.parse(await readFile(path.join(appRoot, 'build', 'assets-manifest.json'), 'utf8'));
const sourceInspection = inspectEnvironmentGlb(await readFile(sourcePath));
const builtInspection = inspectEnvironmentGlb(await readFile(builtPath));

const expectedEnvironmentNodes = [
  'BD_LOWER_geoShape',
  'BD_TOP_geoShape',
  'BD_UP_geoShape001',
  'BuildingShape',
  'CheonggyeKorea_BDShape',
  'Conditionaire_geoShape',
  'DoorShape',
  'FloorShape',
  'KYOBOShape',
  'LOGO_DOWN_CHANNELShape',
  'LOGO_DOWN_KOREANDShape',
  'LOGO_TOP_DONGAShape',
  'LotteTourBDShape',
  'Main_buildingShape',
  'NONE_BDShape',
  'PremierPlace_BDShape',
  'THE_TOWERShape',
  'Top_PLACE_BDShape'
];

const failures = [];
function assert(condition, message) {
  if (!condition) failures.push(message);
}

assert(sourceInspection.parseable, 'Environment GLB must parse as GLB 2.0.');
assert(sourceInspection.scenePresent, 'Environment GLB must expose a reachable scene.');
assert(sourceInspection.renderableMeshPresent, 'Environment GLB must expose a renderable TRIANGLES mesh.');
assert(sourceInspection.nodeTransformsFinite, 'Environment GLB node transforms must be finite.');
assert(sourceInspection.byteLength === ENVIRONMENT_ASSET.observedFingerprint.byteLength, 'Current v02 byte length differs from the recorded revision.');
assert(sourceInspection.sha256 === ENVIRONMENT_ASSET.observedFingerprint.sha256, 'Current v02 SHA-256 differs from the recorded revision.');
assert(sourceInspection.nodes === 18 && sourceInspection.meshes === 18 && sourceInspection.primitives === 18, 'Corrected v02 must contain 18 environment meshes/primitives.');
assert(sourceInspection.materials === 1 && sourceInspection.cameras === 0 && sourceInspection.animations === 0, 'Corrected v02 inventory differs from the observed revision.');
assert(JSON.stringify(sourceInspection.renderableMeshNodeNames) === JSON.stringify(expectedEnvironmentNodes), 'Corrected v02 environment node inventory changed.');
assert(ENVIRONMENT_VISIBILITY.excludedExactNodes.every((name) => !sourceInspection.renderableMeshNodeNames.includes(name)), 'Corrected v02 still contains a known signage-like environment mesh.');
assert(sourceInspection.sha256 === builtInspection.sha256 && sourceInspection.byteLength === builtInspection.byteLength, 'Built environment copy differs from source.');
assert(manifest.environmentAsset.runtimeUrl === ENVIRONMENT_ASSET.runtimeUrl, 'Manifest runtime URL differs from the environment profile.');
assert(manifest.environmentAsset.revisionPolicy === 'MUTABLE_INFORMATIONAL_FINGERPRINT', 'Environment revision fingerprint must remain informational.');
assert(manifest.environmentAsset.revisionChanged === false, 'Current v02 revision must be reported as current.');
assert(SITE_ENVIRONMENT_PROFILE.material.roughness === 1 && SITE_ENVIRONMENT_PROFILE.material.metalness === 0, 'Neutral material must remain fully rough and non-metallic.');
assert(SITE_ENVIRONMENT_PROFILE.material.side === 'DoubleSide', 'Environment material must remain double-sided.');
assert(SITE_ENVIRONMENT_PROFILE.pointPolicy.raycastTarget === false && SITE_ENVIRONMENT_PROFILE.pointPolicy.occluder === false, 'Environment must remain outside Canonical POINT raycasting.');
assert(SITE_ENVIRONMENT_PROFILE.pointPolicy.visualDepth === true, 'Environment must retain visual depth/occlusion.');

const result = {
  pass: failures.length === 0,
  failures,
  asset: ENVIRONMENT_ASSET,
  sourceInspection,
  builtInspection,
  exactExclusionsPresent: [],
  visibleEnvironmentNodes: expectedEnvironmentNodes,
  material: SITE_ENVIRONMENT_PROFILE.material,
  pointPolicy: SITE_ENVIRONMENT_PROFILE.pointPolicy,
  topologyPolicy: 'INFORMATIONAL_ONLY_NO_AUTOMATIC_REPAIR'
};

console.log(JSON.stringify(result, null, 2));
if (failures.length > 0) process.exitCode = 1;
