import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizedPointToCanonical } from '../src/canonical-coordinate.js';
import { SITE_ASSETS, SITE_SCENE_PROFILE, resolveSurfaceSet } from '../src/site-scene-profile.js';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(appRoot, '..');
const assetPaths = {
  world3d: path.join(projectRoot, '3DAsset', 'Signage', SITE_ASSETS.world3d.fileName),
  legacy2d: path.join(appRoot, 'assets', 'site', SITE_ASSETS.legacy2d.fileName)
};
const verifiedAssets = {};
for (const [assetId, asset] of Object.entries(SITE_ASSETS)) {
  const assetBytes = await readFile(assetPaths[assetId]);
  const assetHash = createHash('sha256').update(assetBytes).digest('hex').toUpperCase();
  assert.equal(assetBytes.length, asset.byteLength);
  assert.equal(assetHash, asset.sha256);
  verifiedAssets[assetId] = { bytes: assetBytes, hash: assetHash };
}

assert.deepEqual(
  SITE_SCENE_PROFILE.worlds.world3d.normalSurfaces.map((surface) => surface.expectedNode),
  ['LUUX_Front_3Dworld_Basic', 'ILMIN_Back_3Dworld_Basic']
);
assert.deepEqual(
  SITE_SCENE_PROFILE.worlds.world3d.anamorphicSurfaces.map((surface) => surface.expectedNode),
  ['LUUX_Front_3Dworld_Anamorphic', 'ILMIN_Back_3Dworld_Anamorphic']
);
assert.equal(SITE_SCENE_PROFILE.mappingModes.anamorphic.available, false);
assert.equal(SITE_SCENE_PROFILE.worlds.legacy2d.anamorphicScenes, null);

const expectedLegacy = {
  front: ['LUUX_Front'],
  frontSweet: ['LUUX_F_Sweet'],
  back: ['LUUX_Back', 'ILMIN_Back'],
  night: ['LUUX_B_Night', 'ILMIN_B_Night']
};
for (const scene of SITE_SCENE_PROFILE.worlds.legacy2d.normalScenes) {
  assert.deepEqual(scene.surfaces.map((surface) => surface.expectedNode), expectedLegacy[scene.id]);
}
assert.equal(
  SITE_SCENE_PROFILE.worlds.legacy2d.normalScenes.find((scene) => scene.id === 'frontSweet').label,
  'Front_Sweet'
);

const bytes = verifiedAssets.world3d.bytes;
const glbJsonLength = bytes.readUInt32LE(12);
const glbJsonType = bytes.readUInt32LE(16);
assert.equal(glbJsonType, 0x4e4f534a);
const glb = JSON.parse(bytes.toString('utf8', 20, 20 + glbJsonLength).trimEnd());
const meshNames = glb.nodes.filter((node) => Number.isInteger(node.mesh)).map((node) => node.name);
const fakeMeshes = meshNames.map((name) => ({ name, isMesh: true }));
const normalResolution = resolveSurfaceSet(fakeMeshes, SITE_SCENE_PROFILE.worlds.world3d.normalSurfaces);
assert.equal(normalResolution.available, true);
assert.deepEqual(normalResolution.resolved.map((binding) => binding.mesh.name), ['LUUX_Front_3Dworld_Basic', 'ILMIN_Back_3Dworld_Basic']);
assert.equal(fakeMeshes.length, 2);
const futureMeshes = [...fakeMeshes, { name: 'LUUX_Front_3Dworld_Anamorphic', isMesh: true }, { name: 'ILMIN_Back_3Dworld_Anamorphic', isMesh: true }];
const futureNormalResolution = resolveSurfaceSet(futureMeshes, SITE_SCENE_PROFILE.worlds.world3d.normalSurfaces);
assert.deepEqual(futureNormalResolution.resolved.map((binding) => binding.mesh.name), ['LUUX_Front_3Dworld_Basic', 'ILMIN_Back_3Dworld_Basic']);
const futureAnamorphicResolution = resolveSurfaceSet(futureMeshes, SITE_SCENE_PROFILE.worlds.world3d.anamorphicSurfaces);
assert.deepEqual(futureAnamorphicResolution.resolved.map((binding) => binding.mesh.name), ['LUUX_Front_3Dworld_Anamorphic', 'ILMIN_Back_3Dworld_Anamorphic']);
const anamorphicResolution = resolveSurfaceSet(fakeMeshes, SITE_SCENE_PROFILE.worlds.world3d.anamorphicSurfaces);
assert.equal(anamorphicResolution.available, false);
assert.deepEqual(anamorphicResolution.resolved, []);
assert.deepEqual(anamorphicResolution.missing, ['LUUX_Front_3Dworld_Anamorphic', 'ILMIN_Back_3Dworld_Anamorphic']);

const width = 4728;
const height = 5760;
assert.deepEqual(
  { ...normalizedPointToCanonical(0, 0, width, height) },
  { x: 0, y: 0, u: 0, v: 0, width, height, origin: 'top-left' }
);
assert.equal(normalizedPointToCanonical(1, 1, width, height).x, width - 1);
assert.equal(normalizedPointToCanonical(1, 1, width, height).y, height - 1);
assert.equal(normalizedPointToCanonical(0.5, 0.5, width, height).x, 2364);
assert.equal(normalizedPointToCanonical(0.5, 0.5, width, height).y, 2880);

console.log(JSON.stringify({
  pass: true,
  siteAssets: Object.fromEntries(Object.entries(verifiedAssets).map(([assetId, asset]) => [assetId, { bytes: asset.bytes.length, sha256: asset.hash }])),
  meshNames,
  world3dNormal: normalResolution.resolved.map((binding) => binding.mesh.name),
  world3dAnamorphic: { available: anamorphicResolution.available, missing: anamorphicResolution.missing },
  legacyScenes: expectedLegacy,
  mapping: 'ordinary planar TEXCOORD_0 -> top-left canonical'
}, null, 2));
