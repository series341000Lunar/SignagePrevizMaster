export const BITMAP_SOURCE_TYPES = Object.freeze([
  'FILE',
  'PHOTOSHOP_COMPOSITE_SNAPSHOT',
  'PHOTOSHOP_SELECTION_SNAPSHOT'
]);

export const SNAPSHOT_SOURCE_TYPES = Object.freeze(BITMAP_SOURCE_TYPES.filter((value) => value !== 'FILE'));
export const BITMAP_COLOR_CONTRACTS = Object.freeze([
  'EMBEDDED_FILE_PROFILE',
  'SRGB_IEC61966_2_1_RGB8'
]);
export const BITMAP_ALPHA_CONTRACTS = Object.freeze([
  'EMBEDDED_FILE_ALPHA',
  'OPAQUE_RGB8',
  'PHOTOSHOP_IMAGING_RGBA8_PROBE_PENDING'
]);

export function isSnapshotSourceType(sourceType) {
  return SNAPSHOT_SOURCE_TYPES.includes(String(sourceType));
}

export function cloneBitmapProvenance(provenance) {
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) return null;
  return JSON.parse(JSON.stringify(provenance));
}

export function createFileProvenance(originalFilename) {
  return Object.freeze({
    type: 'FILE',
    originalFilename: String(originalFilename)
  });
}

export function normalizeCaptureBounds(bounds) {
  const normalized = {
    left: Number(bounds?.left),
    top: Number(bounds?.top),
    right: Number(bounds?.right),
    bottom: Number(bounds?.bottom)
  };
  if (!Object.values(normalized).every(Number.isSafeInteger) ||
      normalized.right <= normalized.left || normalized.bottom <= normalized.top) {
    throw new Error('SNAPSHOT_CAPTURE_BOUNDS_INVALID: Capture bounds must be an integer rectangle with positive area.');
  }
  return Object.freeze(normalized);
}

export function assertNativeSnapshotGeometry({ width, height, documentWidth, documentHeight, captureBounds, level }) {
  if (![width, height, documentWidth, documentHeight].every((value) => Number.isSafeInteger(value) && value > 0)) {
    throw new Error('SNAPSHOT_DIMENSIONS_INVALID: Bitmap and document dimensions must be positive integers.');
  }
  if (level !== 0) throw new Error(`SNAPSHOT_RESAMPLED_UNSUPPORTED: Photoshop returned pyramid level ${level}.`);
  const bounds = normalizeCaptureBounds(captureBounds);
  if (bounds.right - bounds.left !== width || bounds.bottom - bounds.top !== height) {
    throw new Error('SNAPSHOT_NATIVE_PIXEL_MISMATCH: Capture bounds must match bitmap dimensions 1:1.');
  }
  return bounds;
}

export function selectionSnapshotInitialLayerState(metadata, workingResolution) {
  if (metadata?.captureMode !== 'SINGLE_PIXEL_LAYER' || metadata?.sourceType !== 'PHOTOSHOP_SELECTION_SNAPSHOT') {
    throw new Error('SNAPSHOT_SELECTION_METADATA_INVALID: Selection Snapshot metadata is required.');
  }
  const bounds = assertNativeSnapshotGeometry(metadata);
  const frameWidth = Number(workingResolution?.width);
  const frameHeight = Number(workingResolution?.height);
  if (!Number.isSafeInteger(frameWidth) || frameWidth <= 0 || !Number.isSafeInteger(frameHeight) || frameHeight <= 0) {
    throw new Error('SNAPSHOT_WORKING_RESOLUTION_INVALID: Working resolution must contain positive integer dimensions.');
  }
  const opacity = Number(metadata.selectedLayerOpacity);
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
    throw new Error('SNAPSHOT_SELECTION_OPACITY_INVALID: Photoshop layer opacity must be normalized from 0 to 1.');
  }
  return Object.freeze({
    transform: Object.freeze({
      x: (bounds.left + bounds.right) / (2 * frameWidth),
      y: (bounds.top + bounds.bottom) / (2 * frameHeight),
      scale: 1,
      rotationDegrees: 0
    }),
    opacity
  });
}

export function commonFileSource(source) {
  const originalFilename = String(source.originalFilename || source.filename || source.name || 'image');
  return {
    ...source,
    sourceId: String(source.sourceId || source.id || `file:${source.sha256 || originalFilename}`),
    sourceType: 'FILE',
    originalFilename,
    alphaContract: String(source.alphaContract || 'EMBEDDED_FILE_ALPHA'),
    colorContract: String(source.colorContract || 'EMBEDDED_FILE_PROFILE'),
    provenance: cloneBitmapProvenance(source.provenance) || createFileProvenance(originalFilename)
  };
}
