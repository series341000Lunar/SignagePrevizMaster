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

function normalizeSource(source) {
  if (!source || !(source.width > 0 && source.height > 0) || !isSupportedImageFile(source)) {
    throw new Error('Projection authoring accepts only decoded PNG or JPG/JPEG files with original dimensions.');
  }
  return Object.freeze({
    id: String(source.id),
    filename: String(source.filename || source.name),
    name: String(source.filename || source.name),
    mimeType: String(source.mimeType || source.type).toLowerCase(),
    type: String(source.mimeType || source.type).toLowerCase(),
    width: Number(source.width),
    height: Number(source.height),
    hasAlpha: Boolean(source.hasAlpha),
    byteLength: Number(source.byteLength || 0)
  });
}

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

export function computeNormalizedImageSize({ sourceWidth, sourceHeight, frameAspect, scale = 1, fitFraction = 0.75 }) {
  if (!(sourceWidth > 0 && sourceHeight > 0 && frameAspect > 0)) throw new Error('Source dimensions and frame aspect must be positive.');
  const sourceAspect = sourceWidth / sourceHeight;
  const normalizedScale = clamp(finite(scale, 1), 0.01, 20) * fitFraction;
  return sourceAspect >= frameAspect
    ? Object.freeze({ width: normalizedScale, height: normalizedScale * frameAspect / sourceAspect })
    : Object.freeze({ width: normalizedScale * sourceAspect / frameAspect, height: normalizedScale });
}

export function screenPointToSourceUv(point, source, frameAspect, transform = DEFAULT_AUTHORING_TRANSFORM) {
  const current = normalizeAuthoringTransform(transform);
  const size = computeNormalizedImageSize({
    sourceWidth: source.width,
    sourceHeight: source.height,
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

export function transformToViewportRect(transform, source, frameAspect, viewport) {
  const current = normalizeAuthoringTransform(transform);
  const size = computeNormalizedImageSize({ sourceWidth: source.width, sourceHeight: source.height, frameAspect, scale: current.scale });
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
    this.previousManualLocked = this.manualLocked;
  }

  requestManualLock(locked) {
    if (this.layoutEditing) return false;
    this.manualLocked = Boolean(locked);
    return true;
  }

  enterLayout() {
    if (this.layoutEditing) return false;
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

  get forcedLocked() { return this.layoutEditing; }
  get cameraLocked() { return this.layoutEditing || this.manualLocked; }
  get controlsEnabled() { return !this.cameraLocked; }
  get displayState() { return this.layoutEditing ? 'LAYOUT INTERLOCK' : (this.manualLocked ? 'LOCKED' : 'FREE'); }
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
  constructor({ disposeRuntime = null, idPrefix = 'layer' } = {}) {
    this.activeFamilyId = null;
    this.stacks = new Map();
    this.selectedByFamily = new Map();
    this.revision = 0;
    this.sequence = 0;
    this.idPrefix = String(idPrefix);
    this.disposeRuntime = typeof disposeRuntime === 'function' ? disposeRuntime : () => {};
  }

  ensureFamily(familyId) {
    const key = String(familyId);
    if (!this.stacks.has(key)) this.stacks.set(key, []);
    if (!this.selectedByFamily.has(key)) this.selectedByFamily.set(key, null);
    return this.stacks.get(key);
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
    this.sequence += 1;
    return `${this.idPrefix}-${this.sequence.toString(36).padStart(4, '0')}`;
  }

  invalidatePixel(layer = this.selectedLayer) {
    this.revision += 1;
    if (layer) {
      layer.pixelRevision += 1;
      layer.bakedPixelRevision = null;
      layer.bakedRevision = null;
    }
  }

  invalidateMetadata(layers = this.selectedLayer ? [this.selectedLayer] : []) {
    for (const layer of layers) layer.metadataRevision += 1;
  }

  invalidate() { this.invalidatePixel(); }

  syncOrder(layers = this.layers) {
    layers.forEach((layer, index) => { layer.order = index; });
  }

  addLayer(source, familyId = this.activeFamilyId, runtime = source) {
    if (familyId === null || familyId === undefined) throw new Error('A familyId is required before adding a layer.');
    const key = String(familyId);
    this.activateFamily(key);
    const layer = {
      layerId: this.nextLayerId(),
      source: normalizeSource(source),
      runtime,
      transform: DEFAULT_AUTHORING_TRANSFORM,
      visible: true,
      opacity: 1,
      blendMode: AUTHORING_BLEND_MODE,
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
    return true;
  }

  setLayerVisibility(layerId, visible) {
    const layer = this.layers.find((candidate) => candidate.layerId === layerId);
    if (!layer || layer.visible === Boolean(visible)) return false;
    layer.visible = Boolean(visible);
    this.invalidateMetadata([layer]);
    return true;
  }

  setLayerOpacity(layerId, opacity) {
    const layer = this.layers.find((candidate) => candidate.layerId === layerId);
    const next = clamp(finite(opacity, 1), 0, 1);
    if (!layer || layer.opacity === next) return false;
    layer.opacity = next;
    this.invalidateMetadata([layer]);
    return true;
  }

  setLayerBlendMode(layerId, blendMode) {
    const layer = this.layers.find((candidate) => candidate.layerId === layerId);
    const next = String(blendMode || '').toUpperCase();
    if (!layer || !AUTHORING_BLEND_MODES.includes(next) || layer.blendMode === next) return false;
    layer.blendMode = next;
    this.invalidateMetadata([layer]);
    return true;
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

  markMetadataSynced(layerIds = this.layers.map((layer) => layer.layerId)) {
    const ids = new Set(layerIds);
    for (const layer of this.layers) if (ids.has(layer.layerId)) layer.metadataSyncedRevision = layer.metadataRevision;
  }

  disposeAll() {
    for (const layers of this.stacks.values()) for (const layer of layers) this.disposeRuntime(layer.runtime);
    this.stacks.clear();
    this.selectedByFamily.clear();
    this.activeFamilyId = null;
  }

  reset() {
    this.stacks = new Map();
    this.selectedByFamily = new Map();
    this.activeFamilyId = null;
    this.revision = 0;
  }

  snapshot() {
    return {
      activeFamilyId: this.activeFamilyId,
      revision: this.revision,
      sequence: this.sequence,
      selectedByFamily: [...this.selectedByFamily.entries()],
      stacks: [...this.stacks.entries()].map(([familyId, layers]) => [familyId, layers.map((layer) => ({ ...layer, transform: { ...layer.transform } }))])
    };
  }

  restore(snapshot) {
    this.stacks.clear();
    this.selectedByFamily.clear();
    this.activeFamilyId = snapshot.activeFamilyId;
    this.revision = snapshot.revision;
    this.sequence = snapshot.sequence;
    this.selectedByFamily = new Map(snapshot.selectedByFamily);
    this.stacks = new Map(snapshot.stacks.map(([familyId, layers]) => [familyId, layers.map((layer) => ({
      ...layer,
      opacity: clamp(finite(layer.opacity, 1), 0, 1),
      blendMode: AUTHORING_BLEND_MODES.includes(layer.blendMode) ? layer.blendMode : AUTHORING_BLEND_MODE,
      pixelRevision: Number.isSafeInteger(layer.pixelRevision) ? layer.pixelRevision : 1,
      bakedPixelRevision: layer.bakedPixelRevision ?? null,
      metadataRevision: Number.isSafeInteger(layer.metadataRevision) ? layer.metadataRevision : 1,
      metadataSyncedRevision: layer.metadataSyncedRevision ?? null,
      transform: normalizeAuthoringTransform(layer.transform)
    }))]));
    for (const layers of this.stacks.values()) this.syncOrder(layers);
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
