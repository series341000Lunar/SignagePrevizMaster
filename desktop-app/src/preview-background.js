export const DEFAULT_PREVIEW_BACKGROUND_GRAY = 0.5;

export function isPreviewBackgroundGray(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function clampPreviewBackgroundInput(value) {
  const numeric = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof numeric !== 'number' || !Number.isFinite(numeric)) return null;
  return Math.min(1, Math.max(0, numeric));
}

export function previewBackgroundRgb(sourceRgb, sourceAlpha, gray) {
  if (!Array.isArray(sourceRgb) || sourceRgb.length !== 3 ||
      sourceRgb.some((component) => !Number.isFinite(component) || component < 0 || component > 1) ||
      !Number.isFinite(sourceAlpha) || sourceAlpha < 0 || sourceAlpha > 1 ||
      !isPreviewBackgroundGray(gray)) {
    throw new RangeError('Preview RGB, alpha, and gray must be normalized finite values.');
  }
  return {
    rgb: sourceRgb.map((component) => component * sourceAlpha + gray * (1 - sourceAlpha)),
    alpha: 1
  };
}
