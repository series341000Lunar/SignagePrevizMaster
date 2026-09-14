import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { inspectAnamorphicGlb } from '../scripts/anamorphic-glb-inspection.mjs';
import { PLANAR_MAPPING_PROFILES, PLANAR_CANONICAL, getPlanarMappingProfile } from '../src/planar-mapping-profile.js';
import { PlanarMappingRuntime, createPlanarBakerCamera, createPlanarSurfaceMaterial, readPlanarCanonical, validatePlanarCanonicalInput } from '../src/planar-mapping-runtime.js';
import { createPlanarAsymmetricFixture } from '../src/planar-asymmetric-fixture.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const build = path.join(root, 'desktop-app', 'build');
const manifest = JSON.parse(await readFile(path.join(build, 'assets-manifest.json'), 'utf8'));
const familyIds = ['ANAMORPHIC_FRONT_75F', 'ANAMORPHIC_BACK'];
assert.deepEqual(Object.keys(PLANAR_MAPPING_PROFILES), familyIds);
assert.equal(manifest.planarMapping.block, 'PLANAR-A');
assert.deepEqual(PLANAR_CANONICAL, { width: 4728, height: 5760 });

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex').toUpperCase();
for (const familyId of familyIds) {
  const profile = getPlanarMappingProfile(familyId);
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
  const inspection = inspectAnamorphicGlb(source);
  assert.deepEqual(inspection.nodeRecords.filter((node) => node.meshIndex !== null).map((node) => node.name), [profile.targetNode]);
  assert.equal(inspection.cameras, 0);
}
assert.notEqual(PLANAR_MAPPING_PROFILES.ANAMORPHIC_FRONT_75F.targetNode, PLANAR_MAPPING_PROFILES.ANAMORPHIC_BACK.targetNode);
assert.notEqual(PLANAR_MAPPING_PROFILES.ANAMORPHIC_FRONT_75F.sha256, PLANAR_MAPPING_PROFILES.ANAMORPHIC_BACK.sha256);

const camera = createPlanarBakerCamera();
assert.ok(camera instanceof THREE.PerspectiveCamera);
assert.equal(camera.fov, 10);
assert.equal(camera.aspect, 4728 / 5760);
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

const input = createPlanarAsymmetricFixture(familyIds[0]);
assert.equal(input.bytes.length, 4728 * 5760 * 4);
const pixel = (x, y) => [...input.bytes.subarray((y * input.width + x) * 4, (y * input.width + x) * 4 + 4)];
assert.deepEqual(pixel(10, 10), [255, 0, 0, 255]);
assert.deepEqual(pixel(input.width - 10, 10), [0, 255, 0, 255]);
assert.deepEqual(pixel(10, input.height - 10), [0, 0, 255, 255]);
assert.deepEqual(pixel(input.width - 10, input.height - 10), [255, 255, 0, 255]);
assert.equal(pixel(Math.round(input.width * 0.35), Math.round(input.height * 0.35))[3], 0);
assert.equal(pixel(Math.round(input.width * 0.65), Math.round(input.height * 0.35))[3], 128);
assert.deepEqual(pixel(input.width / 2, input.height / 2), [255, 255, 255, 255]);
assert.equal(validatePlanarCanonicalInput(input, familyIds[0]), input);
assert.throws(() => validatePlanarCanonicalInput(input, familyIds[1]), /PLANAR_CANONICAL_CONTRACT_ERROR/);
for (const invalid of [
  { width: 3000, height: 3840 }, { width: 2100, height: 3840 },
  { components: 3 }, { componentSize: 16 }, { outputKind: 'DIRECT' },
  { orientation: 'BOTTOM_LEFT' }, { alpha: 'PREMULTIPLIED' }, { colorSpace: 'CMYK' },
  { bytes: new Uint8Array(4) }
]) {
  assert.throws(() => validatePlanarCanonicalInput({ ...input, ...invalid }, familyIds[0]), /PLANAR_CANONICAL_CONTRACT_ERROR/);
}
const mockFullMerge = {
  hasOutputs: (familyId) => familyId === familyIds[0],
  readOutputRgba: (familyId, outputKind) => {
    assert.equal(familyId, familyIds[0]);
    assert.equal(outputKind, 'CANONICAL');
    return input;
  }
};
assert.throws(() => readPlanarCanonical(mockFullMerge, familyIds[0], { ready: false, revision: 1 }), /PLANAR_CANONICAL_NOT_READY/);
assert.throws(() => readPlanarCanonical(mockFullMerge, familyIds[1], { ready: true, revision: 1 }), /PLANAR_CANONICAL_NOT_READY/);
assert.equal(readPlanarCanonical(mockFullMerge, familyIds[0], { ready: true, revision: 1 }).sourceCanonicalRevision, 1);
const stateRuntime = new PlanarMappingRuntime({});
assert.equal(stateRuntime.state(familyIds[0]).status, 'UNAVAILABLE');
assert.equal(stateRuntime.markCanonicalRevision(familyIds[0], 1).status, 'DIRTY');
assert.equal(stateRuntime.state(familyIds[1]).status, 'UNAVAILABLE');
assert.equal(stateRuntime.invalidateFamily(familyIds[0]).status, 'DIRTY');
assert.equal(stateRuntime.markCanonicalRevision(familyIds[0], 2).sourceCanonicalRevision, 2);
stateRuntime.disposeAll();
assert.equal(stateRuntime.state(familyIds[0]).status, 'UNAVAILABLE');
const rendererStub = {
  getRenderTarget: () => null,
  getViewport: () => new THREE.Vector4(),
  getScissor: () => new THREE.Vector4(),
  getScissorTest: () => false,
  getClearColor: () => new THREE.Color(),
  getClearAlpha: () => 0,
  getPixelRatio: () => 1,
  setPixelRatio() {}, setRenderTarget() {}, setViewport() {}, setScissor() {},
  setScissorTest() {}, setClearColor() {},
  toneMapping: THREE.NoToneMapping, outputColorSpace: THREE.SRGBColorSpace,
  autoClear: true, xr: { enabled: false }
};
const wrongNodeRuntime = new PlanarMappingRuntime(rendererStub, {
  loader: { loadAsync: async () => ({ scene: { traverse: (visit) => visit({ name: 'WRONG', isMesh: false }) } }) }
});
await assert.rejects(wrongNodeRuntime.render(familyIds[0], input, { sourceCanonicalRevision: 1 }), /PLANAR_ASSET_CONTRACT_ERROR/);
assert.equal(wrongNodeRuntime.state(familyIds[0]).status, 'ERROR');
const missingAssetRuntime = new PlanarMappingRuntime(rendererStub, { loader: { loadAsync: async () => { throw new Error('missing'); } } });
await assert.rejects(missingAssetRuntime.render(familyIds[1], { ...input, familyId: familyIds[1] }, { sourceCanonicalRevision: 1 }), /PLANAR_ASSET_CONTRACT_ERROR/);

const runtimeSource = await readFile(path.join(root, 'desktop-app', 'src', 'planar-mapping-runtime.js'), 'utf8');
const rendererSource = await readFile(path.join(root, 'desktop-app', 'src', 'renderer.js'), 'utf8');
assert.match(runtimeSource, /readOutputRgba\(familyId, 'CANONICAL'\)/);
assert.doesNotMatch(runtimeSource, /readOutputRgba\(familyId, 'DIRECT'\)/);
assert.match(rendererSource, /window\.runPlanarAFoundationSmoke/);
assert.doesNotMatch(rendererSource, /new PlanarMappingRuntime\(renderer\)[\s\S]*?BAKE PLANAR/);
console.log('Planar-A validation: PASS');
