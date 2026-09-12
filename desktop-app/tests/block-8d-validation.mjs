import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { PROJECTION_BAKE_PROFILES } from '../src/projection-bake-profile.js';
import {
  PROJECT_SCHEMA_VERSION,
  createProjectSavePayload,
  prepareProjectLoad,
  sha256Hex,
  validateAssetReference,
  validateProjectManifest
} from '../src/project-persistence.js';
import { ScreenImageLayerStack } from '../src/screen-image-authoring.js';

const require = createRequire(import.meta.url);
const {
  loadProjectFromDirectory,
  projectDirectoryFromManifestPath,
  saveProjectToDirectory
} = require('../src/project-storage.cjs');
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rendererSource = await readFile(path.join(appRoot, 'src', 'renderer.js'), 'utf8');
const mainSource = await readFile(path.join(appRoot, 'src', 'main.cjs'), 'utf8');
const preloadSource = await readFile(path.join(appRoot, 'src', 'project-preload.cjs'), 'utf8');
const htmlSource = await readFile(path.join(appRoot, 'src', 'index.html'), 'utf8');

const pngBytes = new Uint8Array(await sharp({
  create: { width: 3, height: 2, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 0.5 } }
}).png().toBuffer());
const jpgBytes = new Uint8Array(await sharp({
  create: { width: 4, height: 3, channels: 3, background: { r: 120, g: 80, b: 40 } }
}).jpeg({ quality: 91 }).toBuffer());

function source(filename, mimeType, width, height, bytes, hasAlpha) {
  return {
    id: filename,
    filename,
    name: filename,
    originalFilename: filename,
    sourceType: 'FILE',
    mimeType,
    type: mimeType,
    width,
    height,
    byteLength: bytes.byteLength,
    hasAlpha
  };
}

function layer(layerId, familyId, order, asset, values) {
  return {
    layerId,
    familyId,
    order,
    visible: values.visible,
    source: source(asset.filename, asset.mimeType, asset.width, asset.height, asset.bytes, asset.hasAlpha),
    runtime: { originalBytes: asset.bytes, width: asset.width, height: asset.height, hasAlpha: asset.hasAlpha },
    mappingMode: 'SCREEN_PROJECTED',
    transform: { x: values.x, y: values.y, scale: values.scale, rotationDegrees: values.rotationDegrees },
    opacity: values.opacity,
    blendMode: values.blendMode,
    pixelRevision: 9,
    bakedPixelRevision: 9,
    metadataRevision: 7,
    metadataSyncedRevision: 7,
    bakedRevision: 9
  };
}

const png = { filename: '東京_front.png', mimeType: 'image/png', width: 3, height: 2, bytes: pngBytes, hasAlpha: true };
const jpg = { filename: 'Back_Photo_01.jpg', mimeType: 'image/jpeg', width: 4, height: 3, bytes: jpgBytes, hasAlpha: false };
const frontId = 'ANAMORPHIC_FRONT_75F';
const backId = 'ANAMORPHIC_BACK';
const stack = new ScreenImageLayerStack({ idPrefix: 'projection-layer' });
stack.restore({
  activeFamilyId: frontId,
  revision: 99,
  sequence: 5,
  selectedByFamily: [[frontId, 'projection-layer-0002'], [backId, 'projection-layer-0005']],
  stacks: [
    [frontId, [
      layer('projection-layer-0001', frontId, 0, png, { x: 0.12, y: 0.21, scale: 0.75, rotationDegrees: 12, opacity: 0.25, blendMode: 'NORMAL', visible: true }),
      layer('projection-layer-0002', frontId, 1, jpg, { x: 0.42, y: 0.51, scale: 1.15, rotationDegrees: 123, opacity: 0.5, blendMode: 'MULTIPLY', visible: false }),
      layer('projection-layer-0003', frontId, 2, png, { x: 0.72, y: 0.81, scale: 1.6, rotationDegrees: 278, opacity: 0.83, blendMode: 'SCREEN', visible: true })
    ]],
    [backId, [
      layer('projection-layer-0004', backId, 0, jpg, { x: -0.2, y: 0.3, scale: 0.65, rotationDegrees: 45, opacity: 0.4, blendMode: 'LINEAR_DODGE', visible: true }),
      layer('projection-layer-0005', backId, 1, png, { x: 1.1, y: 0.9, scale: 2.1, rotationDegrees: 315, opacity: 1, blendMode: 'NORMAL', visible: false })
    ]]
  ]
});

const payload = await createProjectSavePayload(stack, { assetNameToken: 'block8dtest' });
assert.equal(payload.manifest.schemaVersion, PROJECT_SCHEMA_VERSION);
assert.equal(payload.manifest.families[frontId].layers.length, 3);
assert.equal(payload.manifest.families[backId].layers.length, 2);
validateProjectManifest(payload.manifest);
for (const asset of payload.assets) {
  assert.match(asset.assetReference, /^assets\/asset-block8dtest-\d{4}\.(png|jpg)$/);
  assert.equal(/[^\x00-\x7F]/.test(asset.assetReference), false, 'project-owned asset names are ASCII');
  assert.equal(await sha256Hex(asset.bytes), asset.sha256, 'save payload keeps the exact original source bytes');
  validateAssetReference(asset.assetReference);
}
assert.equal(payload.manifest.families[frontId].layers[0].source.originalFilename, '東京_front.png');

const manifestText = JSON.stringify(payload.manifest);
for (const forbidden of [
  'outsideSignageOpacity', 'targetId', 'targetSessionId', 'documentId', 'photoshopLayerId',
  'OwnedLayerRegistry', 'bakedPixelRevision', 'metadataSyncedRevision', 'RenderTarget',
  'visibilityBuffer', 'calibrationCamera', 'cameraPosition', 'railExpanded', 'layoutEditing'
]) {
  assert.equal(manifestText.includes(forbidden), false, `${forbidden} must not be persisted`);
}
assert.match(manifestText, /"profileId":"FRONT_75F_NATIVE_CANONICAL_BAKE_POC"/);
assert.match(manifestText, /"exactName":"ANAM_SURFACE_FRONT75F"/);

let disposeCount = 0;
const decodeAsset = async ({ source: metadata, bytes }) => {
  const decoded = await sharp(bytes).metadata();
  return {
    width: decoded.width,
    height: decoded.height,
    hasAlpha: Boolean(decoded.hasAlpha),
    originalBytes: bytes,
    dispose() { disposeCount += 1; }
  };
};

const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'luux-block8d-'));
const projectDirectory = path.join(tempRoot, 'MyProject');
try {
  const saved = await saveProjectToDirectory(projectDirectory, payload, { validateManifest: validateProjectManifest });
  assert.equal(saved.assetCount, 5);
  assert.equal(projectDirectoryFromManifestPath(path.join(projectDirectory, 'project.json')), path.resolve(projectDirectory));
  assert.throws(
    () => projectDirectoryFromManifestPath(path.join(projectDirectory, 'other.json')),
    (error) => error.code === 'PROJECT_MANIFEST_PATH_INVALID'
  );
  const onDiskManifestBeforeFailure = await readFile(path.join(projectDirectory, 'project.json'), 'utf8');
  for (const asset of payload.assets) {
    const projectBytes = await readFile(path.join(projectDirectory, ...asset.assetReference.split('/')));
    assert.equal(await sha256Hex(projectBytes), asset.sha256, 'project asset is byte-identical to the original source');
  }

  const loaded = await loadProjectFromDirectory(projectDirectory, { validateManifest: validateProjectManifest });
  const prepared = await prepareProjectLoad(loaded.manifest, loaded.assets, {
    activeFamilyId: frontId,
    decodeAsset,
    disposeRuntime: (runtime) => runtime.dispose()
  });
  const restored = new ScreenImageLayerStack({ idPrefix: 'projection-layer' });
  restored.restore(prepared.snapshot);
  const roundTrip = (candidate) => [...candidate.stacks.entries()].flatMap(([familyId, layers]) => layers.map((entry) => ({
    familyId,
    layerId: entry.layerId,
    order: entry.order,
    visible: entry.visible,
    originalFilename: entry.source.originalFilename || entry.source.filename,
    transform: { ...entry.transform },
    opacity: entry.opacity,
    blendMode: entry.blendMode
  })));
  assert.deepEqual(roundTrip(restored), roundTrip(stack), 'FRONT/BACK authoring state must round-trip exactly');
  assert.ok([...restored.stacks.values()].flat().every((entry) =>
    entry.bakedPixelRevision === null && entry.metadataSyncedRevision === null && entry.bakedRevision === null
  ), 'loaded layers must start NEEDS BAKE and PHOTOSHOP UNSYNCED');
  restored.activateFamily(frontId);
  const newLayer = restored.addLayer(source('new.png', 'image/png', 3, 2, pngBytes, true), frontId, {
    originalBytes: pngBytes, width: 3, height: 2, hasAlpha: true
  });
  assert.equal(newLayer.layerId, 'projection-layer-0006', 'ID sequence resumes after the highest loaded layer ID');

  const secondPayload = await createProjectSavePayload(stack, { assetNameToken: 'failedsave' });
  await assert.rejects(
    saveProjectToDirectory(projectDirectory, secondPayload, {
      validateManifest: validateProjectManifest,
      failurePoint: 'before-manifest-commit'
    }),
    (error) => error.code === 'PROJECT_SAVE_INJECTED_FAILURE'
  );
  assert.equal(await readFile(path.join(projectDirectory, 'project.json'), 'utf8'), onDiskManifestBeforeFailure,
    'failed Save preserves the previous valid project.json');
  await loadProjectFromDirectory(projectDirectory, { validateManifest: validateProjectManifest });

  const currentBeforeFailures = stack.snapshot();
  const currentIdentity = {
    activeFamilyId: currentBeforeFailures.activeFamilyId,
    selectedByFamily: currentBeforeFailures.selectedByFamily,
    layerIds: currentBeforeFailures.stacks.flatMap(([, layers]) => layers.map((entry) => entry.layerId)),
    runtimes: currentBeforeFailures.stacks.flatMap(([, layers]) => layers.map((entry) => entry.runtime))
  };
  const assertCurrentUnchanged = () => {
    const current = stack.snapshot();
    assert.equal(current.activeFamilyId, currentIdentity.activeFamilyId);
    assert.deepEqual(current.selectedByFamily, currentIdentity.selectedByFamily);
    assert.deepEqual(current.stacks.flatMap(([, layers]) => layers.map((entry) => entry.layerId)), currentIdentity.layerIds);
    assert.deepEqual(current.stacks.flatMap(([, layers]) => layers.map((entry) => entry.runtime)), currentIdentity.runtimes);
  };

  await assert.rejects(
    prepareProjectLoad(payload.manifest, payload.assets.slice(1), { decodeAsset }),
    (error) => error.code === 'PROJECT_ASSET_MISSING'
  );
  assertCurrentUnchanged();

  const unsupported = structuredClone(payload.manifest);
  unsupported.schemaVersion = 2;
  await assert.rejects(
    prepareProjectLoad(unsupported, payload.assets, { decodeAsset }),
    (error) => error.code === 'PROJECT_SCHEMA_UNSUPPORTED'
  );
  assertCurrentUnchanged();

  const traversal = structuredClone(payload.manifest);
  traversal.families[frontId].layers[0].source.assetReference = '../outside.png';
  await assert.rejects(
    prepareProjectLoad(traversal, payload.assets, { decodeAsset }),
    (error) => error.code === 'PROJECT_ASSET_PATH_INVALID'
  );
  assertCurrentUnchanged();

  const corruptBytes = new Uint8Array([1, 2, 3, 4, 5, 6]);
  const corrupt = structuredClone(payload.manifest);
  const corruptSource = corrupt.families[frontId].layers[1].source;
  corruptSource.byteLength = corruptBytes.byteLength;
  corruptSource.sha256 = await sha256Hex(corruptBytes);
  const corruptAssets = payload.assets.map((asset) => asset.assetReference === corruptSource.assetReference
    ? { assetReference: asset.assetReference, bytes: corruptBytes, sha256: corruptSource.sha256 }
    : asset);
  const disposedBeforeCorrupt = disposeCount;
  await assert.rejects(
    prepareProjectLoad(corrupt, corruptAssets, {
      decodeAsset,
      disposeRuntime: (runtime) => runtime.dispose()
    }),
    (error) => error.code === 'PROJECT_ASSET_DECODE_FAILED'
  );
  assert.ok(disposeCount > disposedBeforeCorrupt, 'temporary decoded resources are disposed after failed Load');
  assertCurrentUnchanged();

  const firstReference = payload.assets[0].assetReference;
  await unlink(path.join(projectDirectory, ...firstReference.split('/')));
  await assert.rejects(
    loadProjectFromDirectory(projectDirectory, { validateManifest: validateProjectManifest }),
    (error) => error.code === 'PROJECT_ASSET_MISSING' && error.details.assetReference === firstReference
  );
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

assert.match(rendererSource, /createProjectSavePayload\(authoringSession\)/);
assert.match(rendererSource, /prepareProjectLoad\(result\.manifest, result\.assets/);
assert.match(rendererSource, /authoringViewSettings\.setOutsideSignageOpacity\(DEFAULT_OUTSIDE_SIGNAGE_OPACITY\)/);
assert.match(rendererSource, /clearProjectScopedPhotoshopState\(\)/);
assert.match(rendererSource, /state\.authoring\.railExpanded = false/);
assert.match(mainSource, /nodeIntegration:\s*false/);
assert.match(mainSource, /contextIsolation:\s*true/);
assert.match(mainSource, /sandbox:\s*true/);
assert.match(mainSource, /preload:\s*path\.join\(__dirname, 'project-preload\.cjs'\)/);
assert.match(preloadSource, /luux-project:save-as/);
assert.match(preloadSource, /luux-project:save/);
assert.match(preloadSource, /luux-project:open/);
assert.match(preloadSource, /openDroppedManifest/);
assert.match(preloadSource, /webUtils\.getPathForFile/);
assert.match(mainSource, /properties:\s*\['openFile'\]/);
assert.match(mainSource, /extensions:\s*\['json'\]/);
assert.match(rendererSource, /addEventListener\('drop'/);
assert.match(rendererSource, /file\.name\.toLowerCase\(\) === 'project\.json'/);
assert.doesNotMatch(preloadSource, /readAnyPath|writeAnyPath|require\('node:fs/);
assert.match(htmlSource, /id="authoring-project-save-as"/);
assert.match(htmlSource, /id="authoring-project-save"/);
assert.match(htmlSource, /id="authoring-project-open"/);

console.log(JSON.stringify({
  block: '8D',
  technicalPass: true,
  projectFormat: 'FOLDER_PROJECT_JSON_ASSETS',
  schemaVersion: PROJECT_SCHEMA_VERSION,
  frontLayers: 3,
  backLayers: 2,
  stableLayerIds: true,
  sourceBytesPreserved: true,
  failedSavePreservesPreviousProject: true,
  failedLoadPreservesCurrentSession: true,
  loadedState: 'NEEDS_BAKE_PHOTOSHOP_UNSYNCED',
  photoshopRuntimePersisted: false,
  outsideSignagePersisted: false,
  userValidation: 'PENDING'
}, null, 2));
