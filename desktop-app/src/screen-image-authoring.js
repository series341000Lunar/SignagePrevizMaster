import {
  cloneVectorMask,
  closeVectorMaskPath,
  createEmptyVectorMask,
  createVectorMaskPath,
  createVectorMaskPoint,
  deleteVectorMaskPoint,
  setVectorMaskSegmentType,
  splitVectorMaskSegment,
  translateVectorMaskPoints,
  updateVectorMaskPoint,
  vectorMaskPath
} from './vector-mask-model.js';
import { cloneBitmapProvenance, commonFileSource } from './bitmap-source.js';

const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg']);
const SUPPORTED_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg']);

export const AUTHORING_COORDINATE_SPACE = 'PROJECTION_FRAME_NORMALIZED_TOP_LEFT';
export const AUTHORING_BLEND_MODE = 'NORMAL';
export const AUTHORING_BLEND_MODES = Object.freeze(['NORMAL', 'MULTIPLY', 'SCREEN', 'LINEAR_DODGE']);
export const DEFAULT_AUTHORING_TRANSFORM = Object.freeze({
  x: 0.5,
  y: 0.5,
  scale: 1,
  rotationDegrees: 0
});

const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export function normalizeBitmapSource(source) {
  if (!source || !(source.width > 0 && source.height > 0) || !isSupportedImageFile(source)) {
    throw new Error('Projection authoring accepts only decoded PNG or JPG/JPEG files with original dimensions.');
  }
  const common = source.sourceType === 'FILE' || !source.sourceType ? commonFileSource(source) : source;
  const normalized = {
    id: String(common.id),
    sourceId: String(common.sourceId || common.id),
    filename: String(common.filename || common.name),
    name: String(common.filename || common.name),
    mimeType: String(common.mimeType || common.type).toLowerCase(),
    type: String(common.mimeType || common.type).toLowerCase(),
    width: Number(common.width),
    height: Number(common.height),
    hasAlpha: Boolean(common.hasAlpha),
    byteLength: Number(common.byteLength || 0),
    sourceType: String(common.sourceType || 'FILE'),
    alphaContract: String(common.alphaContract || 'EMBEDDED_FILE_ALPHA'),
    colorContract: String(common.colorContract || 'EMBEDDED_FILE_PROFILE'),
    provenance: cloneBitmapProvenance(common.provenance)
  };
  if (common.assetReference) normalized.assetReference = String(common.assetReference);
  if (common.originalFilename) normalized.originalFilename = String(common.originalFilename);
  if (common.sha256) normalized.sha256 = String(common.sha256);
  return Object.freeze(normalized);
}

const normalizeSource = normalizeBitmapSource;

export function isSupportedImageFile({ name = '', type = '' } = {}) {
  const extension = String(name).split('.').pop()?.toLowerCase() || '';
  return SUPPORTED_IMAGE_TYPES.has(String(type).toLowerCase()) || SUPPORTED_IMAGE_EXTENSIONS.has(extension);
}

export function detectEmbeddedAlpha(bytes, mimeType = '') {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  if (String(mimeType).toLowerCase() !== 'image/png' || data.length < 33) return false;
  const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!pngSignature.every((value, index) => data[index] === value)) return false;
  const colorType = data[25];
  if (colorType === 4 || colorType === 6) return true;
  if (colorType !== 3) return false;
  for (let offset = 8; offset + 12 <= data.length;) {
    const length = ((data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]) >>> 0;
    const type = String.fromCharCode(...data.subarray(offset + 4, offset + 8));
    if (type === 'tRNS') return true;
    if (type === 'IEND') break;
    offset += 12 + length;
  }
  return false;
}

export function normalizeAuthoringTransform(value = DEFAULT_AUTHORING_TRANSFORM) {
  return Object.freeze({
    x: clamp(finite(value.x, DEFAULT_AUTHORING_TRANSFORM.x), -2, 3),
    y: clamp(finite(value.y, DEFAULT_AUTHORING_TRANSFORM.y), -2, 3),
    scale: clamp(finite(value.scale, DEFAULT_AUTHORING_TRANSFORM.scale), 0.01, 20),
    rotationDegrees: ((finite(value.rotationDegrees, 0) % 360) + 360) % 360
  });
}

export function computeNormalizedImageSize({ sourceWidth, sourceHeight, frameWidth, frameHeight, frameAspect, scale = 1 }) {
  if (!(sourceWidth > 0 && sourceHeight > 0)) throw new Error('Source dimensions must be positive.');
  const normalizedScale = clamp(finite(scale, 1), 0.01, 20);
  if (frameWidth > 0 && frameHeight > 0) {
    return Object.freeze({
      width: sourceWidth / frameWidth * normalizedScale,
      height: sourceHeight / frameHeight * normalizedScale
    });
  }
  if (!(frameAspect > 0)) throw new Error('Frame dimensions or frame aspect must be positive.');
  const sourceAspect = sourceWidth / sourceHeight;
  return sourceAspect >= frameAspect
    ? Object.freeze({ width: normalizedScale, height: normalizedScale * frameAspect / sourceAspect })
    : Object.freeze({ width: normalizedScale * sourceAspect / frameAspect, height: normalizedScale });
}

export function screenPointToSourceUv(point, source, frameAspect, transform = DEFAULT_AUTHORING_TRANSFORM, frameResolution = null) {
  const current = normalizeAuthoringTransform(transform);
  const size = computeNormalizedImageSize({
    sourceWidth: source.width,
    sourceHeight: source.height,
    frameWidth: frameResolution?.width,
    frameHeight: frameResolution?.height,
    frameAspect,
    scale: current.scale
  });
  const radians = current.rotationDegrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const deltaX = finite(point.x, 0) - current.x;
  const deltaY = finite(point.y, 0) - current.y;
  const localX = cosine * deltaX + sine * deltaY;
  const localY = -sine * deltaX + cosine * deltaY;
  const u = localX / size.width + 0.5;
  const v = localY / size.height + 0.5;
  return Object.freeze({ u, v, inside: u >= 0 && u <= 1 && v >= 0 && v <= 1 });
}

export function sourceUvToScreenPoint(uv, source, frameAspect, transform = DEFAULT_AUTHORING_TRANSFORM, frameResolution = null) {
  const current = normalizeAuthoringTransform(transform);
  const size = computeNormalizedImageSize({
    sourceWidth: source.width,
    sourceHeight: source.height,
    frameWidth: frameResolution?.width,
    frameHeight: frameResolution?.height,
    frameAspect,
    scale: current.scale
  });
  const localX = (finite(uv.u, 0) - 0.5) * size.width;
  const localY = (finite(uv.v, 0) - 0.5) * size.height;
  const radians = current.rotationDegrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return Object.freeze({
    x: current.x + cosine * localX - sine * localY,
    y: current.y + sine * localX + cosine * localY
  });
}

export function transformToViewportRect(transform, source, frameAspect, viewport, frameResolution = null) {
  const current = normalizeAuthoringTransform(transform);
  const size = computeNormalizedImageSize({
    sourceWidth: source.width,
    sourceHeight: source.height,
    frameWidth: frameResolution?.width,
    frameHeight: frameResolution?.height,
    frameAspect,
    scale: current.scale
  });
  return Object.freeze({
    centerX: viewport.x + current.x * viewport.width,
    centerY: viewport.y + current.y * viewport.height,
    width: size.width * viewport.width,
    height: size.height * viewport.height,
    rotationDegrees: current.rotationDegrees
  });
}

export class LayoutCameraInterlock {
  constructor(manualLocked = false) {
    this.manualLocked = Boolean(manualLocked);
    this.layoutEditing = false;
    this.maskEditing = false;
    this.previousManualLocked = this.manualLocked;
  }

  requestManualLock(locked) {
    if (this.forcedLocked) return false;
    this.manualLocked = Boolean(locked);
    return true;
  }

  enterLayout() {
    if (this.forcedLocked) return false;
    this.previousManualLocked = this.manualLocked;
    this.layoutEditing = true;
    return true;
  }

  exitLayout() {
    if (!this.layoutEditing) return false;
    this.layoutEditing = false;
    this.manualLocked = this.previousManualLocked;
    return true;
  }

  enterMask() {
    if (this.forcedLocked) return false;
    this.previousManualLocked = this.manualLocked;
    this.maskEditing = true;
    return true;
  }

  exitMask() {
    if (!this.maskEditing) return false;
    this.maskEditing = false;
    this.manualLocked = this.previousManualLocked;
    return true;
  }

  get forcedLocked() { return this.layoutEditing || this.maskEditing; }
  get cameraLocked() { return this.forcedLocked || this.manualLocked; }
  get controlsEnabled() { return !this.cameraLocked; }
  get displayState() {
    if (this.layoutEditing) return 'LAYOUT INTERLOCK';
    if (this.maskEditing) return 'MASK INTERLOCK';
    return this.manualLocked ? 'LOCKED' : 'FREE';
  }
}

export class AuthoringPointerSession {
  constructor() { this.reset(); }

  begin(mode, pointerId, startPoint, startTransform) {
    if (this.active) return false;
    if (!['move', 'scale', 'rotate'].includes(mode)) throw new Error(`Unsupported authoring drag mode: ${mode}`);
    this.active = true;
    this.mode = mode;
    this.pointerId = pointerId;
    this.startPoint = Object.freeze({ x: finite(startPoint.x, 0), y: finite(startPoint.y, 0) });
    this.startTransform = normalizeAuthoringTransform(startTransform);
    return true;
  }

  owns(pointerId) { return this.active && this.pointerId === pointerId; }
  end(pointerId) { if (!this.owns(pointerId)) return false; this.reset(); return true; }
  cancel() { const wasActive = this.active; this.reset(); return wasActive; }
  reset() { this.active = false; this.mode = null; this.pointerId = null; this.startPoint = null; this.startTransform = null; }
}

export class ScreenImageAuthoringSession {
  constructor() {
    this.source = null;
    this.familyId = null;
    this.transform = DEFAULT_AUTHORING_TRANSFORM;
    this.revision = 0;
    this.bakedRevision = null;
  }

  setSource(source, familyId) {
    this.source = normalizeSource(source);
    this.familyId = String(familyId);
    this.transform = DEFAULT_AUTHORING_TRANSFORM;
    this.invalidate();
    return this.source;
  }

  bindFamily(familyId) {
    const next = String(familyId);
    if (this.familyId === next) return false;
    this.familyId = next;
    this.invalidate();
    return true;
  }

  setTransform(partial) {
    const next = normalizeAuthoringTransform({ ...this.transform, ...partial });
    const changed = Object.keys(next).some((key) => next[key] !== this.transform[key]);
    if (!changed) return false;
    this.transform = next;
    this.invalidate();
    return true;
  }

  resetTransform() { return this.setTransform(DEFAULT_AUTHORING_TRANSFORM); }
  invalidate() { this.revision += 1; this.bakedRevision = null; }
  markBaked() { this.bakedRevision = this.revision; }
  get dirty() { return Boolean(this.source) && this.bakedRevision !== this.revision; }
  get status() { return !this.source ? 'NO IMAGE' : (this.dirty ? 'DIRTY / NEEDS BAKE' : 'READY'); }
}

export class ScreenImageLayerStack {
  constructor({ disposeRuntime = null, idPrefix = 'layer', onMergedInvalidated = null } = {}) {
    this.activeFamilyId = null;
    this.stacks = new Map();
    this.selectedByFamily = new Map();
    this.mergedByFamily = new Map();
    this.revision = 0;
    this.sequence = 0;
    this.maskPathSequence = 0;
    this.maskPointSequence = 0;
    this.idPrefix = String(idPrefix);
    this.disposeRuntime = typeof disposeRuntime === 'function' ? disposeRuntime : () => {};
    this.onMergedInvalidated = typeof onMergedInvalidated === 'function' ? onMergedInvalidated : () => {};
  }

  ensureFamily(familyId) {
    const key = String(familyId);
    if (!this.stacks.has(key)) this.stacks.set(key, []);
    if (!this.selectedByFamily.has(key)) this.selectedByFamily.set(key, null);
    if (!this.mergedByFamily.has(key)) this.mergedByFamily.set(key, { revision: 0, bakedRevision: null });
    return this.stacks.get(key);
  }

  ensureMergedFamily(familyId) {
    this.ensureFamily(familyId);
    return this.mergedByFamily.get(String(familyId));
  }

  invalidateMerged(familyId = this.activeFamilyId) {
    if (familyId === null || familyId === undefined) return false;
    const merged = this.ensureMergedFamily(familyId);
    merged.revision += 1;
    merged.bakedRevision = null;
    this.onMergedInvalidated(String(familyId), merged.revision);
    return true;
  }

  activateFamily(familyId) {
    const next = String(familyId);
    const changed = this.activeFamilyId !== next;
    this.activeFamilyId = next;
    this.ensureFamily(next);
    return changed;
  }

  bindFamily(familyId) { return this.activateFamily(familyId); }

  nextLayerId() {
    const existing = new Set([...this.stacks.values()].flat().map((layer) => layer.layerId));
    let candidate;
    do {
      this.sequence += 1;
      candidate = `${this.idPrefix}-${this.sequence.toString(36).padStart(4, '0')}`;
    } while (existing.has(candidate));
    return candidate;
  }

  nextMaskPathId() {
    const existing = new Set([...this.stacks.values()].flatMap((layers) => layers.flatMap((layer) => layer.vectorMask?.paths || []))
      .map((pathValue) => pathValue.pathId));
    let candidate;
    do {
      this.maskPathSequence += 1;
      candidate = `mask-path-${String(this.maskPathSequence).padStart(4, '0')}`;
    } while (existing.has(candidate));
    return candidate;
  }

  nextMaskPointId() {
    const existing = new Set([...this.stacks.values()].flatMap((layers) => layers.flatMap((layer) =>
      (layer.vectorMask?.paths || []).flatMap((pathValue) => pathValue.points || [])))
      .map((pointValue) => pointValue.pointId));
    let candidate;
    do {
      this.maskPointSequence += 1;
      candidate = `mask-point-${String(this.maskPointSequence).padStart(4, '0')}`;
    } while (existing.has(candidate));
    return candidate;
  }

  invalidatePixel(layer = this.selectedLayer) {
    this.revision += 1;
    if (layer) {
      layer.pixelRevision += 1;
      layer.bakedPixelRevision = null;
      layer.bakedRevision = null;
      this.invalidateMerged(layer.familyId);
    }
  }

  invalidateMetadata(layers = this.selectedLayer ? [this.selectedLayer] : []) {
    for (const layer of layers) layer.metadataRevision += 1;
  }

  invalidate() { this.invalidatePixel(); }

  syncOrder(layers = this.layers) {
    layers.forEach((layer, index) => { layer.order = index; });
  }

  addLayer(source, familyId = this.activeFamilyId, runtime = source, initialState = {}) {
    if (familyId === null || familyId === undefined) throw new Error('A familyId is required before adding a layer.');
    const key = String(familyId);
    this.activateFamily(key);
    const layer = {
      layerId: this.nextLayerId(),
      source: normalizeSource(source),
      runtime,
      transform: normalizeAuthoringTransform(initialState.transform || DEFAULT_AUTHORING_TRANSFORM),
      visible: true,
      opacity: clamp(finite(initialState.opacity, 1), 0, 1),
      blendMode: AUTHORING_BLEND_MODE,
      vectorMask: createEmptyVectorMask(),
      order: 0,
      familyId: key,
      mappingMode: 'SCREEN_PROJECTED',
      pixelRevision: 1,
      bakedPixelRevision: null,
      metadataRevision: 1,
      metadataSyncedRevision: null,
      bakedRevision: null
    };
    this.ensureFamily(key).unshift(layer);
    this.syncOrder();
    this.selectedByFamily.set(key, layer.layerId);
    this.revision += 1;
    this.invalidateMerged(key);
    return layer;
  }

  setSource(source, familyId = this.activeFamilyId) {
    const key = String(familyId);
    this.activateFamily(key);
    if (!this.selectedLayer) return this.addLayer(source, key, source).source;
    return this.replaceSelectedSource(source, source).source;
  }

  replaceSelectedSource(source, runtime = source) {
    const layer = this.selectedLayer;
    if (!layer) throw new Error('Select a layer before replacing its source.');
    const normalized = normalizeSource(source);
    const previousRuntime = layer.runtime;
    layer.source = normalized;
    layer.runtime = runtime;
    this.invalidatePixel(layer);
    if (previousRuntime && previousRuntime !== runtime) this.disposeRuntime(previousRuntime);
    return layer;
  }

  selectLayer(layerId) {
    const id = String(layerId);
    const layer = this.layers.find((candidate) => candidate.layerId === id);
    if (!layer || this.selectedLayerId === id) return false;
    this.selectedByFamily.set(this.activeFamilyId, id);
    this.revision += 1;
    return true;
  }

  deleteLayer(layerId = this.selectedLayerId) {
    const index = this.layers.findIndex((layer) => layer.layerId === layerId);
    if (index < 0) return null;
    const [removed] = this.layers.splice(index, 1);
    this.disposeRuntime(removed.runtime);
    this.syncOrder();
    const next = this.layers[index] || this.layers[index - 1] || null;
    this.selectedByFamily.set(this.activeFamilyId, next?.layerId || null);
    this.invalidateMetadata(this.layers);
    this.invalidateMerged(removed.familyId);
    return removed;
  }

  moveLayer(layerId, direction) {
    const index = this.layers.findIndex((layer) => layer.layerId === layerId);
    const delta = direction === 'up' ? -1 : (direction === 'down' ? 1 : 0);
    const target = index + delta;
    if (index < 0 || delta === 0 || target < 0 || target >= this.layers.length) return false;
    return this.reorderLayer(layerId, target);
  }

  reorderLayer(layerId, targetIndex) {
    const index = this.layers.findIndex((layer) => layer.layerId === layerId);
    const target = Number(targetIndex);
    if (index < 0 || !Number.isSafeInteger(target) || target < 0 || target >= this.layers.length || index === target) return false;
    const [layer] = this.layers.splice(index, 1);
    this.layers.splice(target, 0, layer);
    this.syncOrder();
    this.invalidateMetadata(this.layers);
    this.invalidateMerged(layer.familyId);
    return true;
  }

  setLayerVisibility(layerId, visible) {
    const layer = this.layers.find((candidate) => candidate.layerId === layerId);
    if (!layer || layer.visible === Boolean(visible)) return false;
    layer.visible = Boolean(visible);
    this.invalidateMetadata([layer]);
    this.invalidateMerged(layer.familyId);
    return true;
  }

  setLayerOpacity(layerId, opacity) {
    const layer = this.layers.find((candidate) => candidate.layerId === layerId);
    const next = clamp(finite(opacity, 1), 0, 1);
    if (!layer || layer.opacity === next) return false;
    layer.opacity = next;
    this.invalidateMetadata([layer]);
    this.invalidateMerged(layer.familyId);
    return true;
  }

  setLayerBlendMode(layerId, blendMode) {
    const layer = this.layers.find((candidate) => candidate.layerId === layerId);
    const next = String(blendMode || '').toUpperCase();
    if (!layer || !AUTHORING_BLEND_MODES.includes(next) || layer.blendMode === next) return false;
    layer.blendMode = next;
    this.invalidateMetadata([layer]);
    this.invalidateMerged(layer.familyId);
    return true;
  }

  mutateVectorMask(layerId, mutation) {
    const layer = [...this.stacks.values()].flat().find((candidate) => candidate.layerId === String(layerId));
    if (!layer) return false;
    const changed = mutation(layer.vectorMask);
    if (!changed) return false;
    this.invalidatePixel(layer);
    return true;
  }

  setVectorMaskEnabled(layerId, enabled) {
    return this.mutateVectorMask(layerId, (mask) => {
      const next = Boolean(enabled);
      if (mask.enabled === next) return false;
      mask.enabled = next;
      return true;
    });
  }

  setVectorMaskInvert(layerId, invert) {
    return this.mutateVectorMask(layerId, (mask) => {
      const next = Boolean(invert);
      if (mask.invert === next) return false;
      mask.invert = next;
      return true;
    });
  }

  addVectorMaskPath(layerId, { operation = 'ADD', initialPoint = null } = {}) {
    let created = null;
    this.mutateVectorMask(layerId, (mask) => {
      created = createVectorMaskPath(this.nextMaskPathId(), operation);
      if (initialPoint) created.points.push(createVectorMaskPoint(this.nextMaskPointId(), initialPoint.x, initialPoint.y));
      mask.paths.push(created);
      return true;
    });
    return created;
  }

  deleteVectorMaskPath(layerId, pathId) {
    let removed = null;
    this.mutateVectorMask(layerId, (mask) => {
      const index = mask.paths.findIndex((candidate) => candidate.pathId === pathId);
      if (index < 0) return false;
      [removed] = mask.paths.splice(index, 1);
      return true;
    });
    return removed;
  }

  clearVectorMask(layerId) {
    return this.mutateVectorMask(layerId, (mask) => {
      if (!mask.paths.length && !mask.enabled && !mask.invert) return false;
      mask.enabled = false;
      mask.invert = false;
      mask.paths = [];
      return true;
    });
  }

  setVectorMaskPathEnabled(layerId, pathId, enabled) {
    return this.mutateVectorMask(layerId, (mask) => {
      const pathValue = vectorMaskPath(mask, pathId);
      const next = Boolean(enabled);
      if (!pathValue || pathValue.enabled === next) return false;
      pathValue.enabled = next;
      return true;
    });
  }

  setVectorMaskPathOperation(layerId, pathId, operation) {
    return this.mutateVectorMask(layerId, (mask) => {
      const pathValue = vectorMaskPath(mask, pathId);
      const next = String(operation).toUpperCase();
      if (!pathValue || !['ADD', 'SUBTRACT'].includes(next) || pathValue.operation === next) return false;
      pathValue.operation = next;
      return true;
    });
  }

  appendVectorMaskPoint(layerId, pathId, x, y) {
    let created = null;
    this.mutateVectorMask(layerId, (mask) => {
      const pathValue = vectorMaskPath(mask, pathId);
      if (!pathValue || pathValue.closed) return false;
      created = createVectorMaskPoint(this.nextMaskPointId(), x, y);
      pathValue.points.push(created);
      return true;
    });
    return created;
  }

  closeVectorMaskPath(layerId, pathId) {
    return this.mutateVectorMask(layerId, (mask) => closeVectorMaskPath(vectorMaskPath(mask, pathId)));
  }

  setVectorMaskSegmentType(layerId, pathId, pointId, segmentType) {
    return this.mutateVectorMask(layerId, (mask) => setVectorMaskSegmentType(vectorMaskPath(mask, pathId), pointId, segmentType));
  }

  insertVectorMaskPoint(layerId, pathId, startPointId, t) {
    let created = null;
    this.mutateVectorMask(layerId, (mask) => {
      created = splitVectorMaskSegment(vectorMaskPath(mask, pathId), startPointId, this.nextMaskPointId(), t);
      return Boolean(created);
    });
    return created;
  }

  updateVectorMaskPoint(layerId, pathId, pointId, update) {
    return this.mutateVectorMask(layerId, (mask) => updateVectorMaskPoint(vectorMaskPath(mask, pathId), pointId, update));
  }

  translateVectorMaskPoints(layerId, pointReferences, deltaX, deltaY) {
    return this.mutateVectorMask(layerId, (mask) =>
      translateVectorMaskPoints(mask, pointReferences, deltaX, deltaY) > 0
    );
  }

  deleteVectorMaskPoint(layerId, pathId, pointId) {
    let removed = null;
    this.mutateVectorMask(layerId, (mask) => {
      removed = deleteVectorMaskPoint(vectorMaskPath(mask, pathId), pointId);
      return Boolean(removed);
    });
    return removed;
  }

  setTransform(partial) {
    const layer = this.selectedLayer;
    if (!layer) return false;
    const next = normalizeAuthoringTransform({ ...layer.transform, ...partial });
    const changed = Object.keys(next).some((key) => next[key] !== layer.transform[key]);
    if (!changed) return false;
    layer.transform = next;
    this.invalidatePixel(layer);
    return true;
  }

  resetTransform() { return this.setTransform(DEFAULT_AUTHORING_TRANSFORM); }

  markBaked() {
    const layer = this.selectedLayer;
    if (layer) {
      layer.bakedPixelRevision = layer.pixelRevision;
      layer.bakedRevision = this.revision;
    }
  }

  markMergedBaked(familyId = this.activeFamilyId) {
    if (familyId === null || familyId === undefined) return false;
    const merged = this.ensureMergedFamily(familyId);
    merged.bakedRevision = merged.revision;
    return true;
  }

  mergedState(familyId = this.activeFamilyId) {
    if (familyId === null || familyId === undefined) return Object.freeze({ revision: 0, bakedRevision: null, dirty: false, status: 'NO LAYERS' });
    const layers = this.ensureFamily(familyId);
    const merged = this.ensureMergedFamily(familyId);
    const dirty = layers.length > 0 && merged.bakedRevision !== merged.revision;
    return Object.freeze({
      revision: merged.revision,
      bakedRevision: merged.bakedRevision,
      dirty,
      status: layers.length === 0 ? 'NO LAYERS' : (dirty ? 'MERGED DIRTY / NEEDS BAKE' : 'MERGED READY')
    });
  }

  markMetadataSynced(layerIds = this.layers.map((layer) => layer.layerId)) {
    const ids = new Set(layerIds);
    for (const layer of this.layers) if (ids.has(layer.layerId)) layer.metadataSyncedRevision = layer.metadataRevision;
  }

  disposeAll() {
    for (const layers of this.stacks.values()) for (const layer of layers) this.disposeRuntime(layer.runtime);
    this.stacks.clear();
    this.selectedByFamily.clear();
    this.mergedByFamily.clear();
    this.activeFamilyId = null;
  }

  reset() {
    this.stacks = new Map();
    this.selectedByFamily = new Map();
    this.mergedByFamily = new Map();
    this.activeFamilyId = null;
    this.revision = 0;
    this.maskPathSequence = 0;
    this.maskPointSequence = 0;
  }

  snapshot() {
    return {
      activeFamilyId: this.activeFamilyId,
      revision: this.revision,
      sequence: this.sequence,
      maskPathSequence: this.maskPathSequence,
      maskPointSequence: this.maskPointSequence,
      selectedByFamily: [...this.selectedByFamily.entries()],
      mergedByFamily: [...this.mergedByFamily.entries()].map(([familyId, merged]) => [familyId, { ...merged }]),
      stacks: [...this.stacks.entries()].map(([familyId, layers]) => [familyId, layers.map((layer) => ({
        ...layer,
        transform: { ...layer.transform },
        vectorMask: cloneVectorMask(layer.vectorMask)
      }))])
    };
  }

  restore(snapshot) {
    this.stacks.clear();
    this.selectedByFamily.clear();
    this.mergedByFamily.clear();
    this.activeFamilyId = snapshot.activeFamilyId;
    this.revision = snapshot.revision;
    this.sequence = Number.isSafeInteger(snapshot.sequence) && snapshot.sequence >= 0 ? snapshot.sequence : 0;
    this.maskPathSequence = Number.isSafeInteger(snapshot.maskPathSequence) && snapshot.maskPathSequence >= 0 ? snapshot.maskPathSequence : 0;
    this.maskPointSequence = Number.isSafeInteger(snapshot.maskPointSequence) && snapshot.maskPointSequence >= 0 ? snapshot.maskPointSequence : 0;
    this.selectedByFamily = new Map(snapshot.selectedByFamily);
    this.stacks = new Map(snapshot.stacks.map(([familyId, layers]) => [familyId, layers.map((layer) => ({
      ...layer,
      source: normalizeSource(layer.source),
      opacity: clamp(finite(layer.opacity, 1), 0, 1),
      blendMode: AUTHORING_BLEND_MODES.includes(layer.blendMode) ? layer.blendMode : AUTHORING_BLEND_MODE,
      vectorMask: cloneVectorMask(layer.vectorMask || createEmptyVectorMask()),
      pixelRevision: Number.isSafeInteger(layer.pixelRevision) ? layer.pixelRevision : 1,
      bakedPixelRevision: layer.bakedPixelRevision ?? null,
      metadataRevision: Number.isSafeInteger(layer.metadataRevision) ? layer.metadataRevision : 1,
      metadataSyncedRevision: layer.metadataSyncedRevision ?? null,
      transform: normalizeAuthoringTransform(layer.transform)
    }))]));
    this.mergedByFamily = new Map((snapshot.mergedByFamily || []).map(([familyId, merged]) => [String(familyId), {
      revision: Number.isSafeInteger(merged?.revision) ? merged.revision : 0,
      bakedRevision: Number.isSafeInteger(merged?.bakedRevision) ? merged.bakedRevision : null
    }]));
    for (const [familyId, layers] of this.stacks) {
      if (!this.mergedByFamily.has(familyId)) {
        this.mergedByFamily.set(familyId, { revision: layers.length > 0 ? 1 : 0, bakedRevision: null });
      }
    }
    for (const layers of this.stacks.values()) this.syncOrder(layers);
    const prefix = `${this.idPrefix}-`;
    for (const layers of this.stacks.values()) {
      for (const layer of layers) {
        if (layer.layerId.startsWith(prefix)) {
          const suffix = layer.layerId.slice(prefix.length);
          if (/^[0-9a-z]+$/i.test(suffix)) {
            const sequence = Number.parseInt(suffix, 36);
            if (Number.isSafeInteger(sequence)) this.sequence = Math.max(this.sequence, sequence);
          }
        }
        for (const pathValue of layer.vectorMask.paths) {
          const pathMatch = /^mask-path-(\d+)$/.exec(pathValue.pathId);
          if (pathMatch) this.maskPathSequence = Math.max(this.maskPathSequence, Number(pathMatch[1]));
          for (const pointValue of pathValue.points) {
            const pointMatch = /^mask-point-(\d+)$/.exec(pointValue.pointId);
            if (pointMatch) this.maskPointSequence = Math.max(this.maskPointSequence, Number(pointMatch[1]));
          }
        }
      }
    }
  }

  get layers() { return this.activeFamilyId === null ? [] : this.ensureFamily(this.activeFamilyId); }
  get renderLayers() { return [...this.layers].reverse().filter((layer) => layer.visible); }
  get selectedLayerId() { return this.activeFamilyId === null ? null : this.selectedByFamily.get(this.activeFamilyId) || null; }
  get selectedLayer() { return this.layers.find((layer) => layer.layerId === this.selectedLayerId) || null; }
  get source() { return this.selectedLayer?.source || null; }
  get runtime() { return this.selectedLayer?.runtime || null; }
  get familyId() { return this.activeFamilyId; }
  get transform() { return this.selectedLayer?.transform || DEFAULT_AUTHORING_TRANSFORM; }
  get bakedRevision() { return this.selectedLayer?.bakedRevision ?? null; }
  get pixelDirty() { const layer = this.selectedLayer; return Boolean(layer) && layer.bakedPixelRevision !== layer.pixelRevision; }
  get metadataDirty() { return this.layers.some((layer) => layer.metadataSyncedRevision !== layer.metadataRevision); }
  get dirty() { return this.pixelDirty; }
  get compositeStatus() { return this.metadataDirty ? 'METADATA DIRTY' : 'METADATA SYNCED'; }
  get status() {
    const layer = this.selectedLayer;
    if (!layer) return 'NO IMAGE';
    if (!layer.visible) return 'HIDDEN / BAKE DISABLED';
    if (this.pixelDirty) return 'DIRTY / NEEDS BAKE';
    return 'READY';
  }
}
