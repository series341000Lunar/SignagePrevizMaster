const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg']);
const SUPPORTED_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg']);

export const AUTHORING_COORDINATE_SPACE = 'PROJECTION_FRAME_NORMALIZED_TOP_LEFT';
export const AUTHORING_BLEND_MODE = 'NORMAL';
export const DEFAULT_AUTHORING_TRANSFORM = Object.freeze({
  x: 0.5,
  y: 0.5,
  scale: 1,
  rotationDegrees: 0
});

const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

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
    if (!source || !(source.width > 0 && source.height > 0) || !isSupportedImageFile(source)) throw new Error('Block 8A accepts only decoded PNG or JPG/JPEG files with original dimensions.');
    this.source = Object.freeze({
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
