export const PREVIEW_MODES = Object.freeze({
  AUTHORING: 'AUTHORING',
  PHOTOSHOP_FINAL: 'PHOTOSHOP_FINAL'
});

export function previewSourceDecision({ mode, expectedResolution, photoshopConnected, liveFrameCurrent, frame, liveTextureAvailable }) {
  if (!Object.values(PREVIEW_MODES).includes(mode)) throw new Error(`Unknown preview mode: ${mode}`);
  const expected = expectedResolution
    ? { width: expectedResolution.width, height: expectedResolution.height }
    : null;
  const received = frame
    ? { width: frame.receivedWidth ?? frame.width, height: frame.receivedHeight ?? frame.height }
    : null;
  if (mode === PREVIEW_MODES.AUTHORING) {
    return { mode, source: 'AUTHORING', status: 'READY', expected, received };
  }
  if (!photoshopConnected) {
    return { mode, source: 'NONE', status: 'DISCONNECTED', expected, received };
  }
  if (!liveFrameCurrent || !frame || !liveTextureAvailable) {
    return { mode, source: 'NONE', status: 'WAITING', expected, received };
  }
  if (!expected || !Number.isSafeInteger(received?.width) || !Number.isSafeInteger(received?.height) ||
      received.width <= 0 || received.height <= 0 ||
      frame.documentWidth !== received.width || frame.documentHeight !== received.height) {
    return { mode, source: 'NONE', status: 'INVALID_FRAME', expected, received };
  }
  if (received.width !== expected.width || received.height !== expected.height) {
    return { mode, source: 'NONE', status: 'SIZE_MISMATCH', expected, received };
  }
  return { mode, source: 'PHOTOSHOP_FINAL', status: 'READY', expected, received };
}
