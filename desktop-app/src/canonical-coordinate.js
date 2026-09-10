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
  return surfaceLocalPointToCanonical(localX, localY, width, height, width, height);
}

export function normalizedPointToCanonical(uInput, vInput, pixelWidth, pixelHeight) {
  if (![uInput, vInput, pixelWidth, pixelHeight].every(Number.isFinite)) {
    throw new TypeError('Normalized coordinates and pixel dimensions must be finite numbers.');
  }
  if (!Number.isSafeInteger(pixelWidth) || !Number.isSafeInteger(pixelHeight) || pixelWidth <= 0 || pixelHeight <= 0) {
    throw new RangeError('Canonical pixel dimensions must be positive safe integers.');
  }
  const u = clamp(uInput, 0, 1);
  const v = clamp(vInput, 0, 1);
  return Object.freeze({
    x: clamp(Math.floor(u * pixelWidth), 0, pixelWidth - 1),
    y: clamp(Math.floor(v * pixelHeight), 0, pixelHeight - 1),
    u,
    v,
    width: pixelWidth,
    height: pixelHeight,
    origin: CANONICAL_COORDINATE_SYSTEM.origin
  });
}

export function surfaceLocalPointToCanonical(
  localX,
  localY,
  surfaceWidth,
  surfaceHeight,
  pixelWidth,
  pixelHeight
) {
  if (![localX, localY, surfaceWidth, surfaceHeight, pixelWidth, pixelHeight].every(Number.isFinite)) {
    throw new TypeError('Surface coordinates and dimensions must be finite numbers.');
  }
  if (surfaceWidth <= 0 || surfaceHeight <= 0) {
    throw new RangeError('Surface dimensions must be positive.');
  }
  if (!Number.isSafeInteger(pixelWidth) || !Number.isSafeInteger(pixelHeight) || pixelWidth <= 0 || pixelHeight <= 0) {
    throw new RangeError('Canonical pixel dimensions must be positive safe integers.');
  }

  return normalizedPointToCanonical(
    localX / surfaceWidth + 0.5,
    0.5 - localY / surfaceHeight,
    pixelWidth,
    pixelHeight
  );
}

export function canonicalToLocalPoint(canonical, width, height) {
  return canonicalToSurfaceLocalPoint(canonical, width, height);
}

export function canonicalToSurfaceLocalPoint(canonical, surfaceWidth, surfaceHeight) {
  if (!canonical || ![canonical.u, canonical.v, surfaceWidth, surfaceHeight].every(Number.isFinite)) {
    throw new TypeError('Canonical coordinates and surface dimensions must be finite numbers.');
  }
  if (surfaceWidth <= 0 || surfaceHeight <= 0) {
    throw new RangeError('Surface dimensions must be positive.');
  }
  if (canonical.u < 0 || canonical.u > 1 || canonical.v < 0 || canonical.v > 1) {
    throw new RangeError('Canonical normalized coordinates must be within 0..1.');
  }

  return Object.freeze({
    x: (canonical.u - 0.5) * surfaceWidth,
    y: (0.5 - canonical.v) * surfaceHeight
  });
}
