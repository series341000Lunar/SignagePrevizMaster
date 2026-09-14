import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { inspectAnamorphicGlb } from '../scripts/anamorphic-glb-inspection.mjs';
import { ANAMORPHIC_FAMILY_AVAILABILITY } from '../src/anamorphic-calibration-profile.js';
import { PLANAR_MAPPING_PROFILES, PLANAR_OUTPUT_PROFILE, getFamilyCompositeResolution, getPlanarMappingProfile } from '../src/planar-mapping-profile.js';
import { PlanarMappingRuntime, createPlanarBakerCamera, createPlanarSurfaceMaterial, readPlanarSource, validatePlanarSourceInput } from '../src/planar-mapping-runtime.js';
import { createPlanarAsymmetricFixture } from '../src/planar-asymmetric-fixture.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const build = path.join(root, 'desktop-app', 'build');
const manifest = JSON.parse(await readFile(path.join(build, 'assets-manifest.json'), 'utf8'));
const familyIds = ['ANAMORPHIC_FRONT_75F', 'ANAMORPHIC_BACK'];
assert.deepEqual(Object.keys(PLANAR_MAPPING_PROFILES), familyIds);
assert.equal(manifest.planarMapping.block, 'PLANAR-A');
assert.equal(PLANAR_OUTPUT_PROFILE.id, 'LUUX_PLANAR_MASTER');
assert.deepEqual(PLANAR_OUTPUT_PROFILE.outputResolution, { width: 4728, height: 5760 });
// The resolution resolver has no FRONT/BACK enum and follows any family profile.
assert.deepEqual(getFamilyCompositeResolution({ workingResolution: { width: 1234, height: 2345 } }), { width: 1234, height: 2345 });
assert.deepEqual(getFamilyCompositeResolution({ workingResolution: { width: 1, height: 2 }, compositeResolution: { width: 567, height: 890 } }), { width: 567, height: 890 });
assert.throws(() => getFamilyCompositeResolution({}), /PLANAR_FAMILY_RESOLUTION_UNAVAILABLE/);

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex').toUpperCase();
for (const familyId of familyIds) {
  const profile = getPlanarMappingProfile(familyId);
  const familyProfile = ANAMORPHIC_FAMILY_AVAILABILITY[familyId].profile;
  const manifestProfile = manifest.planarMapping.profiles[familyId];
  const sourcePath = path.join(root, profile.sourcePath);
  const packagedPath = path.join(build, 'assets', 'planar', profile.fileName);
  const source = await readFile(sourcePath);
  const packaged = await readFile(packagedPath);
  assert.equal((await stat(sourcePath)).size, profile.byteLength);
  assert.equal(sha256(source), profile.sha256);
  assert.equal(sha256(packaged), profile.sha256);
  assert.equal(packaged.length, source.length);
  assert.equal(manifestProfile.targetNode, profile.targetNode);
  assert.equal(manifestProfile.runtimeUrl, profile.runtimeUrl);
  assert.equal(manifestProfile.sourceVerified, true);
  assert.equal(manifestProfile.buildCopyVerified, true);
  assert.deepEqual(profile.sourceResolution, getFamilyCompositeResolution(familyProfile));
  assert.deepEqual(manifestProfile.sourceResolution, profile.sourceResolution);
  assert.deepEqual(profile.outputResolution, PLANAR_OUTPUT_PROFILE.outputResolution);
  assert.notDeepEqual(profile.sourceResolution, profile.outputResolution);
  const inspection = inspectAnamorphicGlb(source);
  assert.deepEqual(inspection.nodeRecords.filter((node) => node.meshIndex !== null).map((node) => node.name), [profile.targetNode]);
  assert.equal(inspection.cameras, 0);
}
assert.deepEqual(getPlanarMappingProfile(familyIds[0]).sourceResolution, { width: 3000, height: 3840 });
assert.deepEqual(getPlanarMappingProfile(familyIds[1]).sourceResolution, { width: 2100, height: 3840 });
assert.notEqual(PLANAR_MAPPING_PROFILES.ANAMORPHIC_FRONT_75F.targetNode, PLANAR_MAPPING_PROFILES.ANAMORPHIC_BACK.targetNode);
assert.notEqual(PLANAR_MAPPING_PROFILES.ANAMORPHIC_FRONT_75F.sha256, PLANAR_MAPPING_PROFILES.ANAMORPHIC_BACK.sha256);

const camera = createPlanarBakerCamera();
assert.ok(camera instanceof THREE.PerspectiveCamera);
assert.equal(camera.fov, 10);
assert.equal(camera.aspect, 4728 / 5760); // output framing, not source aspect
assert.equal(camera.near, 0.01);
assert.equal(camera.far, 10000);
assert.deepEqual(camera.position.toArray(), [0, 342.9015690828403, 0]);
assert.equal(camera.rotation.order, 'XYZ');
assert.deepEqual([camera.rotation.x, camera.rotation.y, camera.rotation.z], [-Math.PI / 2, 0, 0]);
const material = createPlanarSurfaceMaterial(null);
assert.equal(material.isMeshBasicMaterial, true);
assert.equal(material.color.getHex(), 0xffffff);
assert.equal(material.side, THREE.DoubleSide);
assert.equal(material.transparent, true);
assert.equal(material.depthTest, true);
assert.equal(material.depthWrite, true);
assert.equal(material.toneMapped, false);
material.dispose();

const pixel = (input, x, y) => [...input.bytes.subarray((y * input.width + x) * 4, (y * input.width + x) * 4 + 4)];
for (const familyId of familyIds) {
  const input = createPlanarAsymmetricFixture(familyId);
  const { width, height } = getPlanarMappingProfile(familyId).sourceResolution;
  assert.deepEqual([input.width, input.height], [width, height]);
  assert.equal(input.bytes.length, width * height * 4);
  assert.equal(input.outputKind, 'DIRECT');
  assert.deepEqual(pixel(input, 10, 10), [255, 0, 0, 255]);
  assert.deepEqual(pixel(input, width - 10, 10), [0, 255, 0, 255]);
  assert.deepEqual(pixel(input, 10, height - 10), [0, 0, 255, 255]);
  assert.deepEqual(pixel(input, width - 10, height - 10), [255, 255, 0, 255]);
  assert.equal(pixel(input, Math.round(width * 0.35), Math.round(height * 0.35))[3], 0);
  assert.equal(pixel(input, Math.round(width * 0.65), Math.round(height * 0.35))[3], 128);
  assert.deepEqual(pixel(input, width / 2, height / 2), [255, 255, 255, 255]);
  assert.equal(validatePlanarSourceInput(input, familyId), input);
}

const front = createPlanarAsymmetricFixture(familyIds[0]);
const back = createPlanarAsymmetricFixture(familyIds[1]);
assert.throws(() => validatePlanarSourceInput(front, familyIds[1]), /PLANAR_SOURCE_CONTRACT_ERROR/);
assert.throws(() => validatePlanarSourceInput(back, familyIds[0]), /PLANAR_SOURCE_CONTRACT_ERROR/);
for (const invalid of [
  { width: 4728, height: 5760 }, { components: 3 }, { componentSize: 16 },
  { outputKind: 'CANONICAL' }, { orientation: 'BOTTOM_LEFT' },
  { alpha: 'PREMULTIPLIED' }, { colorSpace: 'CMYK' }, { bytes: new Uint8Array(4) }
]) {
  assert.throws(() => validatePlanarSourceInput({ ...front, ...invalid }, familyIds[0]), /PLANAR_SOURCE_CONTRACT_ERROR/);
}

const reads = [];
const mergedResult = { mergedRevision: 4, legacyCanonicalRevision: 10 };
const mockFullMerge = {
  hasOutputs: (familyId) => familyId === familyIds[0],
  result: (familyId) => familyId === familyIds[0] ? mergedResult : null,
  readOutputRgba: (familyId, outputKind) => {
    reads.push([familyId, outputKind]);
    return outputKind === 'DIRECT' ? front : { ...front, outputKind: 'CANONICAL' };
  }
};
assert.throws(() => readPlanarSource(mockFullMerge, familyIds[0], { ready: false, mergedDirectRevision: 1 }), /PLANAR_SOURCE_NOT_READY/);
assert.throws(() => readPlanarSource(mockFullMerge, familyIds[1], { ready: true, mergedDirectRevision: 1 }), /PLANAR_SOURCE_NOT_READY/);
assert.equal(reads.length, 0);
assert.equal(readPlanarSource(mockFullMerge, familyIds[0], { ready: true, mergedDirectRevision: 4, mergedCanonicalRevision: 10 }).sourceMergedDirectRevision, 4);
mergedResult.legacyCanonicalRevision = 11;
assert.equal(readPlanarSource(mockFullMerge, familyIds[0], { ready: true, mergedDirectRevision: 4, mergedCanonicalRevision: 11 }).sourceMergedDirectRevision, 4);
assert.deepEqual(reads, [[familyIds[0], 'DIRECT'], [familyIds[0], 'DIRECT']]);
assert.throws(() => readPlanarSource(mockFullMerge, familyIds[0], { ready: true, mergedDirectRevision: 5 }), /PLANAR_SOURCE_NOT_READY/);
mergedResult.mergedRevision = 5;
assert.equal(readPlanarSource(mockFullMerge, familyIds[0], { ready: true, mergedDirectRevision: 5 }).sourceMergedDirectRevision, 5);

const stateRuntime = new PlanarMappingRuntime({});
assert.equal(stateRuntime.state(familyIds[0]).status, 'UNAVAILABLE');
assert.equal(stateRuntime.markMergedDirectRevision(familyIds[0], 4).status, 'DIRTY');
assert.equal(stateRuntime.state(familyIds[1]).status, 'UNAVAILABLE');
// Canonical-only changes have no API/dependency; the same Direct revision stays READY.
stateRuntime.states.set(familyIds[0], { familyId: familyIds[0], sourceFamilyId: familyIds[0], sourceMergedDirectRevision: 4, status: 'READY' });
assert.equal(stateRuntime.markMergedDirectRevision(familyIds[0], 4).status, 'READY');
assert.equal(stateRuntime.markMergedDirectRevision(familyIds[0], 5).status, 'DIRTY');
assert.equal(stateRuntime.state(familyIds[1]).status, 'UNAVAILABLE');
assert.equal(stateRuntime.invalidateFamily(familyIds[0]).status, 'DIRTY');
assert.equal(stateRuntime.state(familyIds[0]).sourceMergedDirectRevision, 5);
stateRuntime.disposeAll();
assert.equal(stateRuntime.state(familyIds[0]).status, 'UNAVAILABLE');

const rendererStub = {
  getRenderTarget: () => null, getViewport: () => new THREE.Vector4(), getScissor: () => new THREE.Vector4(),
  getScissorTest: () => false, getClearColor: () => new THREE.Color(), getClearAlpha: () => 0,
  getPixelRatio: () => 1, setPixelRatio() {}, setRenderTarget() {}, setViewport() {}, setScissor() {},
  setScissorTest() {}, setClearColor() {}, toneMapping: THREE.NoToneMapping,
  outputColorSpace: THREE.SRGBColorSpace, autoClear: true, xr: { enabled: false }
};
const wrongNodeRuntime = new PlanarMappingRuntime(rendererStub, {
  loader: { loadAsync: async () => ({ scene: { traverse: (visit) => visit({ name: 'WRONG', isMesh: false }) } }) }
});
await assert.rejects(wrongNodeRuntime.render(familyIds[0], front, { sourceMergedDirectRevision: 1 }), /PLANAR_ASSET_CONTRACT_ERROR/);
assert.equal(wrongNodeRuntime.state(familyIds[0]).status, 'ERROR');
const missingAssetRuntime = new PlanarMappingRuntime(rendererStub, { loader: { loadAsync: async () => { throw new Error('missing'); } } });
await assert.rejects(missingAssetRuntime.render(familyIds[1], back, { sourceMergedDirectRevision: 1 }), /PLANAR_ASSET_CONTRACT_ERROR/);
await assert.rejects(missingAssetRuntime.render(familyIds[1], front, { sourceMergedDirectRevision: 1 }), /PLANAR_SOURCE_CONTRACT_ERROR/);

const runtimeSource = await readFile(path.join(root, 'desktop-app', 'src', 'planar-mapping-runtime.js'), 'utf8');
const rendererSource = await readFile(path.join(root, 'desktop-app', 'src', 'renderer.js'), 'utf8');
assert.match(runtimeSource, /readOutputRgba\(familyId, 'DIRECT'\)/);
assert.doesNotMatch(runtimeSource, /readOutputRgba\(familyId, 'CANONICAL'\)/);
assert.match(runtimeSource, /canvas\.width = input\.width/);
assert.match(runtimeSource, /canvas\.height = input\.height/);
assert.match(rendererSource, /window\.runPlanarAFoundationSmoke/);
assert.doesNotMatch(rendererSource, /new PlanarMappingRuntime\(renderer\)[\s\S]*?BAKE PLANAR/);
console.log('Planar-A family-resolution contract validation: PASS');
