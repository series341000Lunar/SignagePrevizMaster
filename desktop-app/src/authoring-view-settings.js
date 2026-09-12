export const DEFAULT_OUTSIDE_SIGNAGE_OPACITY = 0.5;
export const OUTSIDE_SIGNAGE_OPACITY_RANGE = Object.freeze({ minimum: 0, maximum: 1, step: 0.01 });
export const OUTSIDE_SIGNAGE_PRESETS = Object.freeze({
  HIDE: 0,
  '50%': 0.5,
  FULL: 1
});

const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export function normalizeOutsideSignageOpacity(value) {
  return clamp(finite(value, DEFAULT_OUTSIDE_SIGNAGE_OPACITY), 0, 1);
}

export function computeAuthoringPreviewAlpha(sourceAlpha, insideSignage, outsideSignageOpacity, layerOpacity = 1) {
  const alpha = clamp(finite(sourceAlpha, 0), 0, 1);
  const compositeOpacity = clamp(finite(layerOpacity, 1), 0, 1);
  return alpha * compositeOpacity * (insideSignage ? 1 : normalizeOutsideSignageOpacity(outsideSignageOpacity));
}

export class AuthoringViewSettings {
  constructor({ outsideSignageOpacity = DEFAULT_OUTSIDE_SIGNAGE_OPACITY } = {}) {
    this.outsideSignageOpacity = normalizeOutsideSignageOpacity(outsideSignageOpacity);
    this.revision = 0;
  }

  setOutsideSignageOpacity(value) {
    const next = normalizeOutsideSignageOpacity(value);
    if (next === this.outsideSignageOpacity) return false;
    this.outsideSignageOpacity = next;
    this.revision += 1;
    return true;
  }

  applyPreset(name) {
    if (!Object.hasOwn(OUTSIDE_SIGNAGE_PRESETS, name)) throw new Error(`Unknown Outside Signage preset: ${name}`);
    return this.setOutsideSignageOpacity(OUTSIDE_SIGNAGE_PRESETS[name]);
  }
}
