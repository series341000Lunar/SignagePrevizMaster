export const CANONICAL_COORDINATE_SYSTEM = Object.freeze({
  name: 'Canonical Signage Coordinate',
  origin: 'top-left',
  xDirection: 'left-to-right',
  yDirection: 'top-to-bottom'
});

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function localPointToCanonical(localX, localY, width, height) {
  if (![localX, localY, width, height].every(Number.isFinite)) {
    throw new TypeError('Local coordinates and dimensions must be finite numbers.');
  }
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError('Canonical dimensions must be positive safe integers.');
  }

  const imageX = clamp(localX + width / 2, 0, width);
  const imageY = clamp(height / 2 - localY, 0, height);
  return Object.freeze({
    x: clamp(Math.floor(imageX), 0, width - 1),
    y: clamp(Math.floor(imageY), 0, height - 1),
    u: imageX / width,
    v: imageY / height,
    width,
    height,
    origin: CANONICAL_COORDINATE_SYSTEM.origin
  });
}

export function canonicalToLocalPoint(canonical, width, height) {
  if (!canonical || ![canonical.u, canonical.v, width, height].every(Number.isFinite)) {
    throw new TypeError('Canonical coordinates and dimensions must be finite numbers.');
  }
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError('Canonical dimensions must be positive safe integers.');
  }
  if (canonical.u < 0 || canonical.u > 1 || canonical.v < 0 || canonical.v > 1) {
    throw new RangeError('Canonical normalized coordinates must be within 0..1.');
  }

  return Object.freeze({
    x: canonical.u * width - width / 2,
    y: height / 2 - canonical.v * height
  });
}
