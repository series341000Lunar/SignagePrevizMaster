import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROJECT_SCHEMA_VERSION,
  createProjectSavePayload,
  prepareProjectLoad,
  validateProjectManifest
} from '../src/project-persistence.js';
import {
  ScreenImageLayerStack,
  screenPointToSourceUv,
  sourceUvToScreenPoint
} from '../src/screen-image-authoring.js';
import {
  VECTOR_MASK_COORDINATE_SPACE,
  cloneVectorMask,
  createEmptyVectorMask,
  evaluateVectorMaskSegment,
  rasterizeVectorMask,
  vectorMaskContributionMode
} from '../src/vector-mask-model.js';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rendererSource = await readFile(path.join(appRoot, 'src', 'renderer.js'), 'utf8');
const htmlSource = await readFile(path.join(appRoot, 'src', 'index.html'), 'utf8');
const stylesSource = await readFile(path.join(appRoot, 'src', 'styles.css'), 'utf8');
const bakeSource = await readFile(path.join(appRoot, 'src', 'projection-bake-runtime.js'), 'utf8');

const frontId = 'ANAMORPHIC_FRONT_75F';
const backId = 'ANAMORPHIC_BACK';
const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
const makeSource = (name) => ({
  id: name,
  filename: name,
  name,
  originalFilename: name,
  sourceType: 'FILE',
  mimeType: 'image/png',
  type: 'image/png',
  width: 400,
  height: 200,
  byteLength: bytes.byteLength,
  hasAlpha: true
});
const makeRuntime = (name) => ({ ...makeSource(name), originalBytes: bytes });
const near = (a, b, epsilon = 1e-10) => Math.abs(a - b) <= epsilon;
const pointNear = (a, b, epsilon = 1e-10) => near(a.x, b.x, epsilon) && near(a.y, b.y, epsilon);
const recordingContext = () => {
  const operations = [];
  const context = {
    operations,
    save: () => operations.push(['save']),
    restore: () => operations.push(['restore']),
    setTransform: (...args) => operations.push(['setTransform', ...args]),
    clearRect: (...args) => operations.push(['clearRect', ...args]),
    fillRect: (...args) => operations.push(['fillRect', ...args]),
    beginPath: () => operations.push(['beginPath']),
    moveTo: (...args) => operations.push(['moveTo', ...args]),
    lineTo: (...args) => operations.push(['lineTo', ...args]),
    bezierCurveTo: (...args) => operations.push(['bezierCurveTo', ...args]),
    closePath: () => operations.push(['closePath']),
    fill: () => operations.push(['fill'])
  };
  for (const property of ['globalCompositeOperation', 'globalAlpha', 'fillStyle']) {
    Object.defineProperty(context, property, { set: (value) => operations.push([property, value]) });
  }
  return context;
};

const stack = new ScreenImageLayerStack({ idPrefix: 'projection-layer' });
const frontRuntime = makeRuntime('Front.png');
const frontLayer = stack.addLayer(frontRuntime, frontId, frontRuntime);
assert.deepEqual(frontLayer.vectorMask, createEmptyVectorMask(), 'new layers get an empty disabled mask');
assert.equal(vectorMaskContributionMode(frontLayer.vectorMask), 'PASS_THROUGH', 'empty enabled masks cannot hide the layer');
const disabledRasterContext = recordingContext();
const disabledRaster = rasterizeVectorMask(disabledRasterContext, frontLayer.vectorMask, 400, 200);
assert.equal(disabledRaster.mode, 'PASS_THROUGH');
assert.ok(disabledRasterContext.operations.some(([operation]) => operation === 'fillRect'), 'disabled mask raster is solid-white pass-through');
stack.markBaked();
const readyPixelRevision = frontLayer.pixelRevision;
const readyBakedPixelRevision = frontLayer.bakedPixelRevision;
const metadataRevisionBeforeOpacity = frontLayer.metadataRevision;
stack.setLayerOpacity(frontLayer.layerId, 0.73);
assert.equal(frontLayer.pixelRevision, readyPixelRevision, 'opacity remains metadata-only');
assert.equal(frontLayer.bakedPixelRevision, readyBakedPixelRevision, 'opacity does not invalidate baked pixels');
assert.equal(frontLayer.metadataRevision, metadataRevisionBeforeOpacity + 1);

stack.setVectorMaskEnabled(frontLayer.layerId, true);
assert.ok(frontLayer.pixelRevision > readyPixelRevision && frontLayer.bakedPixelRevision === null, 'mask enable marks pixels dirty');
assert.equal(vectorMaskContributionMode(frontLayer.vectorMask), 'PASS_THROUGH');
const emptyEnabledRasterContext = recordingContext();
assert.equal(rasterizeVectorMask(emptyEnabledRasterContext, frontLayer.vectorMask, 400, 200).mode, 'PASS_THROUGH');
assert.ok(emptyEnabledRasterContext.operations.some(([operation]) => operation === 'fillRect'), 'empty enabled mask is solid-white pass-through');
const addPath = stack.addVectorMaskPath(frontLayer.layerId, { initialPoint: { x: 0.1, y: 0.2 } });
stack.appendVectorMaskPoint(frontLayer.layerId, addPath.pathId, 0.8, 0.2);
stack.appendVectorMaskPoint(frontLayer.layerId, addPath.pathId, 0.7, 0.9);
assert.equal(addPath.operation, 'ADD');
assert.equal(addPath.closed, false, 'open path remains explicitly open');
assert.equal(vectorMaskContributionMode(frontLayer.vectorMask), 'PASS_THROUGH', 'open ADD does not contribute');
stack.closeVectorMaskPath(frontLayer.layerId, addPath.pathId);
stack.setVectorMaskSegmentType(frontLayer.layerId, addPath.pathId, addPath.points[0].pointId, 'CUBIC_BEZIER');
assert.equal(addPath.closed, true);
assert.equal(vectorMaskContributionMode(frontLayer.vectorMask), 'COMBINE');
stack.setVectorMaskInvert(frontLayer.layerId, true);
assert.equal(vectorMaskContributionMode(frontLayer.vectorMask), 'COMBINE_INVERTED');

const subtractPath = stack.addVectorMaskPath(frontLayer.layerId, {
  operation: 'SUBTRACT', initialPoint: { x: 0.25, y: 0.25 }
});
stack.appendVectorMaskPoint(frontLayer.layerId, subtractPath.pathId, 0.5, 0.25);
stack.appendVectorMaskPoint(frontLayer.layerId, subtractPath.pathId, 0.5, 0.5);
stack.closeVectorMaskPath(frontLayer.layerId, subtractPath.pathId);
assert.equal(frontLayer.vectorMask.paths.length, 2, 'one layer owns multiple independent paths');
assert.equal(subtractPath.operation, 'SUBTRACT');
const islandPath = stack.addVectorMaskPath(frontLayer.layerId, {
  operation: 'ADD', initialPoint: { x: 0.62, y: 0.62 }
});
stack.appendVectorMaskPoint(frontLayer.layerId, islandPath.pathId, 0.9, 0.62);
stack.appendVectorMaskPoint(frontLayer.layerId, islandPath.pathId, 0.78, 0.9);
stack.closeVectorMaskPath(frontLayer.layerId, islandPath.pathId);
const rasterContext = recordingContext();
const raster = rasterizeVectorMask(rasterContext, frontLayer.vectorMask, 400, 200);
assert.equal(raster.mode, 'COMBINE_INVERTED');
assert.equal(raster.contributingPathCount, 3, 'closed ADD/SUBTRACT/ADD paths contribute in order');
assert.ok(rasterContext.operations.some(([operation]) => operation === 'bezierCurveTo'), 'closed cubic segments use the shared cubic contract');
assert.ok(rasterContext.operations.some(([operation, value]) => operation === 'globalCompositeOperation' && value === 'destination-out'));
assert.ok(rasterContext.operations.some(([operation, value]) => operation === 'globalCompositeOperation' && value === 'xor'), 'whole-mask invert happens after path composition');
const groupReferences = [
  { pathId: addPath.pathId, pointId: addPath.points[0].pointId },
  { pathId: subtractPath.pathId, pointId: subtractPath.points[0].pointId }
];
const groupBefore = groupReferences.map((reference) => {
  const pathValue = frontLayer.vectorMask.paths.find((entry) => entry.pathId === reference.pathId);
  const pointValue = pathValue.points.find((entry) => entry.pointId === reference.pointId);
  return { anchor: { x: pointValue.x, y: pointValue.y }, inHandle: { ...pointValue.inHandle }, outHandle: { ...pointValue.outHandle } };
});
assert.equal(stack.translateVectorMaskPoints(frontLayer.layerId, groupReferences, 0.02, 0.03), true);
groupReferences.forEach((reference, index) => {
  const pathValue = frontLayer.vectorMask.paths.find((entry) => entry.pathId === reference.pathId);
  const pointValue = pathValue.points.find((entry) => entry.pointId === reference.pointId);
  assert.ok(pointNear(pointValue, { x: groupBefore[index].anchor.x + 0.02, y: groupBefore[index].anchor.y + 0.03 }));
  assert.ok(pointNear(pointValue.inHandle, { x: groupBefore[index].inHandle.x + 0.02, y: groupBefore[index].inHandle.y + 0.03 }));
  assert.ok(pointNear(pointValue.outHandle, { x: groupBefore[index].outHandle.x + 0.02, y: groupBefore[index].outHandle.y + 0.03 }));
});

const shortPath = stack.addVectorMaskPath(frontLayer.layerId, { initialPoint: { x: 0.2, y: 0.2 } });
stack.appendVectorMaskPoint(frontLayer.layerId, shortPath.pathId, 0.4, 0.4);
assert.throws(
  () => stack.closeVectorMaskPath(frontLayer.layerId, shortPath.pathId),
  /VECTOR_MASK_CLOSE_REQUIRES_THREE_POINTS/
);

const segmentPath = stack.addVectorMaskPath(frontLayer.layerId, { initialPoint: { x: 0.1, y: 0.5 } });
const segmentEnd = stack.appendVectorMaskPoint(frontLayer.layerId, segmentPath.pathId, 0.9, 0.5);
const segmentStart = segmentPath.points[0];
assert.equal(segmentStart.segmentTypeToNext, 'LINEAR');
stack.setVectorMaskSegmentType(frontLayer.layerId, segmentPath.pathId, segmentStart.pointId, 'CUBIC_BEZIER');
assert.ok(pointNear(segmentStart.outHandle, { x: 0.1 + 0.8 / 3, y: 0.5 }));
assert.ok(pointNear(segmentEnd.inHandle, { x: 0.1 + 1.6 / 3, y: 0.5 }));
stack.updateVectorMaskPoint(frontLayer.layerId, segmentPath.pathId, segmentStart.pointId, {
  outHandle: { x: 0.25, y: 0.1 }
});
stack.updateVectorMaskPoint(frontLayer.layerId, segmentPath.pathId, segmentEnd.pointId, {
  inHandle: { x: 0.7, y: 0.9 }
});
const original = cloneVectorMask({ enabled: true, invert: false, paths: [segmentPath] }).paths[0];
const inserted = stack.insertVectorMaskPoint(frontLayer.layerId, segmentPath.pathId, segmentStart.pointId, 0.5);
assert.ok(pointNear(evaluateVectorMaskSegment(segmentPath, segmentStart.pointId, 0.5), evaluateVectorMaskSegment(original, segmentStart.pointId, 0.25)));
assert.ok(pointNear(evaluateVectorMaskSegment(segmentPath, inserted.pointId, 0.5), evaluateVectorMaskSegment(original, segmentStart.pointId, 0.75)));
stack.setVectorMaskSegmentType(frontLayer.layerId, segmentPath.pathId, segmentStart.pointId, 'LINEAR');
assert.equal(segmentStart.segmentTypeToNext, 'LINEAR', 'segment conversion is point-to-next and local');

assert.throws(
  () => stack.deleteVectorMaskPoint(frontLayer.layerId, addPath.pathId, addPath.points[0].pointId),
  /VECTOR_MASK_DELETE_REJECTED/,
  'closed three-point paths reject point deletion'
);
const fourth = stack.insertVectorMaskPoint(frontLayer.layerId, addPath.pathId, addPath.points[0].pointId, 0.5);
assert.equal(stack.deleteVectorMaskPoint(frontLayer.layerId, addPath.pathId, fourth.pointId).pointId, fourth.pointId);

const source = { width: 400, height: 200 };
const transform = { x: 0.63, y: 0.37, scale: 1.8, rotationDegrees: 137 };
const sourceUv = { u: 0.23, v: 0.81 };
const screen = sourceUvToScreenPoint(sourceUv, source, 3000 / 3840, transform, { width: 3000, height: 3840 });
const roundTripUv = screenPointToSourceUv(screen, source, 3000 / 3840, transform, { width: 3000, height: 3840 });
assert.ok(near(roundTripUv.u, sourceUv.u) && near(roundTripUv.v, sourceUv.v), 'transformed Source UV round-trip is exact');
assert.equal(VECTOR_MASK_COORDINATE_SPACE, 'SOURCE_NORMALIZED_TOP_LEFT');
assert.match(rendererSource, /function beginVectorMaskMarquee/);
assert.match(rendererSource, /function selectVectorMaskPointsInOverlayRect/);
assert.match(rendererSource, /function tryCloseVectorMaskAtFirstPoint/);
assert.match(rendererSource, /kind: 'anchors'/);
assert.match(stylesSource, /\.vector-mask-marquee/);
assert.match(stylesSource, /\.vector-mask-anchor\.close-target/);

const maskBeforeReplace = JSON.stringify(frontLayer.vectorMask);
const replacement = makeRuntime('Replacement.png');
stack.replaceSelectedSource(replacement, replacement);
assert.equal(JSON.stringify(frontLayer.vectorMask), maskBeforeReplace, 'Replace Source preserves the layer-local mask');

const backRuntime = makeRuntime('Back.png');
const backLayer = stack.addLayer(backRuntime, backId, backRuntime);
const backPath = stack.addVectorMaskPath(backLayer.layerId, { initialPoint: { x: 0.4, y: 0.4 } });
assert.notEqual(backPath.pathId, addPath.pathId);
assert.equal(backLayer.vectorMask.paths.length, 1);
stack.activateFamily(frontId);
assert.equal(frontLayer.vectorMask.paths.length, 5, 'FRONT and BACK masks remain independent');

const identityBefore = {
  layerId: frontLayer.layerId,
  pathIds: frontLayer.vectorMask.paths.map((entry) => entry.pathId),
  pointIds: frontLayer.vectorMask.paths.flatMap((entry) => entry.points.map((pointValue) => pointValue.pointId))
};
const payload = await createProjectSavePayload(stack, { assetNameToken: 'block8e' });
assert.deepEqual(frontRuntime.originalBytes, bytes, 'vector authoring never rewrites original source bytes');
assert.equal(payload.manifest.schemaVersion, PROJECT_SCHEMA_VERSION);
validateProjectManifest(payload.manifest);
const preparedV2 = await prepareProjectLoad(payload.manifest, payload.assets, {
  activeFamilyId: frontId,
  decodeAsset: async ({ source: metadata }) => ({ width: metadata.width, height: metadata.height, hasAlpha: metadata.hasAlpha })
});
const restored = new ScreenImageLayerStack({ idPrefix: 'projection-layer' });
restored.restore(preparedV2.snapshot);
const restoredFront = restored.stacks.get(frontId).find((entry) => entry.layerId === frontLayer.layerId);
assert.deepEqual(restoredFront.vectorMask, frontLayer.vectorMask, 'v2 mask state round-trips exactly');
assert.deepEqual({
  layerId: restoredFront.layerId,
  pathIds: restoredFront.vectorMask.paths.map((entry) => entry.pathId),
  pointIds: restoredFront.vectorMask.paths.flatMap((entry) => entry.points.map((pointValue) => pointValue.pointId))
}, identityBefore, 'layerId/pathId/pointId are stable');
const loadedNewPath = restored.addVectorMaskPath(restoredFront.layerId, { initialPoint: { x: 0.5, y: 0.5 } });
const loadedNewPoint = restored.appendVectorMaskPoint(restoredFront.layerId, loadedNewPath.pathId, 0.6, 0.6);
assert.ok(!identityBefore.pathIds.includes(loadedNewPath.pathId));
assert.ok(!identityBefore.pointIds.includes(loadedNewPoint.pointId));

const v1 = structuredClone(payload.manifest);
v1.schemaVersion = 1;
for (const family of Object.values(v1.families)) for (const layer of family.layers) {
  delete layer.vectorMask;
  delete layer.source.sourceId;
  delete layer.source.alphaContract;
  delete layer.source.colorContract;
  delete layer.source.provenance;
}
validateProjectManifest(v1);
const preparedV1 = await prepareProjectLoad(v1, payload.assets, {
  activeFamilyId: frontId,
  decodeAsset: async ({ source: metadata }) => ({ width: metadata.width, height: metadata.height, hasAlpha: metadata.hasAlpha })
});
assert.ok(preparedV1.snapshot.stacks.flatMap(([, layers]) => layers).every((entry) =>
  JSON.stringify(entry.vectorMask) === JSON.stringify(createEmptyVectorMask())
), 'v1 loads deterministically with empty masks without rewriting the source manifest');
assert.equal(v1.schemaVersion, 1);

const currentBeforeMalformed = JSON.stringify(stack.snapshot(), (key, value) => key === 'runtime' ? undefined : value);
const malformed = structuredClone(payload.manifest);
malformed.families[frontId].layers[0].vectorMask.paths[0].points[0].x = Number.NaN;
await assert.rejects(
  prepareProjectLoad(malformed, payload.assets, {
    decodeAsset: async ({ source: metadata }) => ({ width: metadata.width, height: metadata.height, hasAlpha: metadata.hasAlpha })
  }),
  (error) => error.code === 'PROJECT_VECTOR_MASK_COORDINATE_INVALID'
);
assert.equal(JSON.stringify(stack.snapshot(), (key, value) => key === 'runtime' ? undefined : value), currentBeforeMalformed,
  'malformed mask rejection preserves the current session');

stack.activateFamily(backId);
const removedBack = stack.deleteLayer(backLayer.layerId);
assert.equal(removedBack.vectorMask.paths[0].pathId, backPath.pathId, 'layer deletion owns and removes its mask without an orphan registry');
assert.equal(stack.layers.length, 0);

assert.match(htmlSource, /id="vector-mask-edit"/);
assert.match(htmlSource, /id="vector-mask-overlay"/);
assert.match(rendererSource, /enterVectorMaskEdit/);
assert.match(rendererSource, /screenPointToSourceUv/);
assert.match(rendererSource, /sourceUvToScreenPoint/);
assert.match(rendererSource, /beginVectorMaskSegmentInsert/);
assert.match(rendererSource, /MASK EDIT: Open path click adds · First anchor closes · Closed path double-click starts new/);
assert.match(rendererSource, /function createVectorMaskPathByDoubleClick/);
assert.match(rendererSource, /No point added\. Double-click empty source space or use \+ NEW PATH/);
assert.match(rendererSource, /authoringCameraInterlock\.maskEditing && !exitVectorMaskEdit\(\)/);
assert.match(rendererSource, /authoringCameraInterlock\.layoutEditing && !exitLayoutEdit\(\)/);
assert.match(rendererSource, /rasterizeVectorMask\([\s\S]*authoringVectorMaskScratch/);
assert.match(bakeSource, /authoringVectorMask/);
assert.match(bakeSource, /makeTemporaryVectorMaskTexture/);
assert.match(bakeSource, /source\.a \*= texture2D\(vectorMaskTexture, textureUv\)\.a/);
assert.match(bakeSource, /permanentPerLayerVectorMaskTextures: 0/);
assert.match(bakeSource, /temporaryVectorMask\?\.dispose\(\)/);

console.log(JSON.stringify({
  block: '8E-2',
  technicalPass: true,
  vectorMaskModel: 'LAYER_LOCAL_MULTI_PATH',
  coordinateSpace: VECTOR_MASK_COORDINATE_SPACE,
  operations: ['ADD', 'SUBTRACT'],
  segments: ['LINEAR', 'CUBIC_BEZIER'],
  bezierInsertion: 'DE_CASTELJAU',
  marqueeSelection: 'OPEN_AND_CLOSED_PATH_ANCHORS',
  groupMove: 'SELECTED_ANCHORS_WITH_HANDLES',
  closeGesture: 'RETURN_TO_FIRST_ANCHOR',
  newPathGesture: 'DOUBLE_CLICK_OR_NEW_PATH_BUTTON',
  editModeSwitch: 'LAYOUT_XOR_MASK_DIRECT_TRANSITION',
  preview: 'SHARED_HARD_EDGE_RASTER_CONTRACT',
  bake: 'ORIGINAL_BITMAP_PLUS_SOURCE_RESOLUTION_TEMPORARY_MASK',
  maskComposition: 'ADD_SUBTRACT_THEN_INVERT',
  opacityPolicy: 'METADATA_ONLY_NOT_BAKE_ALPHA',
  resourcePolicy: 'NO_PER_LAYER_FULL_RES_TEXTURE_TEMPORARY_DISPOSED',
  schemaVersion: PROJECT_SCHEMA_VERSION,
  v1Migration: 'DEFAULT_EMPTY_MASK',
  rasterBakeIntegration: 'IMPLEMENTED',
  userValidation: 'PASS_CLOSED'
}, null, 2));
