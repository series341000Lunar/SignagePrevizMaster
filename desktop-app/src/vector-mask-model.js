export const VECTOR_MASK_COORDINATE_SPACE = 'SOURCE_NORMALIZED_TOP_LEFT';
export const VECTOR_MASK_OPERATIONS = Object.freeze(['ADD', 'SUBTRACT']);
export const VECTOR_MASK_SEGMENT_TYPES = Object.freeze(['LINEAR', 'CUBIC_BEZIER']);

const finite = (value, label) => {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`VECTOR_MASK_COORDINATE_INVALID: ${label} must be finite.`);
  return number;
};

const point = (value, label) => Object.freeze({
  x: finite(value?.x, `${label}.x`),
  y: finite(value?.y, `${label}.y`)
});

const lerp = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t
});

export function createEmptyVectorMask() {
  return { enabled: false, invert: false, paths: [] };
}

export function createVectorMaskPoint(pointId, x, y) {
  const anchor = point({ x, y }, 'point');
  return {
    pointId: String(pointId),
    x: anchor.x,
    y: anchor.y,
    inHandle: { ...anchor },
    outHandle: { ...anchor },
    segmentTypeToNext: 'LINEAR'
  };
}

export function createVectorMaskPath(pathId, operation = 'ADD') {
  const normalizedOperation = String(operation).toUpperCase();
  if (!VECTOR_MASK_OPERATIONS.includes(normalizedOperation)) {
    throw new Error(`VECTOR_MASK_OPERATION_INVALID: ${operation}`);
  }
  return {
    pathId: String(pathId),
    enabled: true,
    operation: normalizedOperation,
    closed: false,
    points: []
  };
}

export function cloneVectorMask(mask = createEmptyVectorMask()) {
  return {
    enabled: Boolean(mask.enabled),
    invert: Boolean(mask.invert),
    paths: (mask.paths || []).map((pathValue) => ({
      pathId: String(pathValue.pathId),
      enabled: Boolean(pathValue.enabled),
      operation: String(pathValue.operation),
      closed: Boolean(pathValue.closed),
      points: (pathValue.points || []).map((pointValue) => ({
        pointId: String(pointValue.pointId),
        x: Number(pointValue.x),
        y: Number(pointValue.y),
        inHandle: { x: Number(pointValue.inHandle?.x), y: Number(pointValue.inHandle?.y) },
        outHandle: { x: Number(pointValue.outHandle?.x), y: Number(pointValue.outHandle?.y) },
        segmentTypeToNext: String(pointValue.segmentTypeToNext)
      }))
    }))
  };
}

export function vectorMaskPath(mask, pathId) {
  return mask?.paths?.find((candidate) => candidate.pathId === pathId) || null;
}

export function vectorMaskPoint(pathValue, pointId) {
  return pathValue?.points?.find((candidate) => candidate.pointId === pointId) || null;
}

export function vectorMaskContributionMode(mask) {
  if (!mask?.enabled) return 'PASS_THROUGH';
  const hasClosedAdd = (mask.paths || []).some((pathValue) =>
    pathValue.enabled && pathValue.operation === 'ADD' && pathValue.closed && pathValue.points.length >= 3
  );
  if (!hasClosedAdd) return 'PASS_THROUGH';
  return mask.invert ? 'COMBINE_INVERTED' : 'COMBINE';
}

export function traceVectorMaskPath(context, pathValue, width, height) {
  if (!context || !pathValue?.enabled || !pathValue.closed || pathValue.points.length < 3) return false;
  const scaleX = finite(width, 'raster.width');
  const scaleY = finite(height, 'raster.height');
  const points = pathValue.points;
  context.beginPath();
  context.moveTo(points[0].x * scaleX, points[0].y * scaleY);
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    if (start.segmentTypeToNext === 'CUBIC_BEZIER') {
      context.bezierCurveTo(
        start.outHandle.x * scaleX,
        start.outHandle.y * scaleY,
        end.inHandle.x * scaleX,
        end.inHandle.y * scaleY,
        end.x * scaleX,
        end.y * scaleY
      );
    } else {
      context.lineTo(end.x * scaleX, end.y * scaleY);
    }
  }
  context.closePath();
  return true;
}

export function rasterizeVectorMask(context, mask, width, height) {
  if (!context) throw new Error('VECTOR_MASK_RASTER_CONTEXT_REQUIRED: A 2D canvas context is required.');
  const rasterWidth = finite(width, 'raster.width');
  const rasterHeight = finite(height, 'raster.height');
  if (!(rasterWidth > 0 && rasterHeight > 0)) {
    throw new Error('VECTOR_MASK_RASTER_DIMENSIONS_INVALID: Raster dimensions must be positive.');
  }
  const mode = vectorMaskContributionMode(mask);
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'source-over';
  context.clearRect(0, 0, rasterWidth, rasterHeight);
  context.fillStyle = '#ffffff';
  if (mode === 'PASS_THROUGH') {
    context.fillRect(0, 0, rasterWidth, rasterHeight);
    context.restore();
    return Object.freeze({ mode, contributingPathCount: 0, width: rasterWidth, height: rasterHeight });
  }
  let contributingPathCount = 0;
  for (const pathValue of mask.paths || []) {
    if (!traceVectorMaskPath(context, pathValue, rasterWidth, rasterHeight)) continue;
    context.globalCompositeOperation = pathValue.operation === 'SUBTRACT' ? 'destination-out' : 'source-over';
    context.fillStyle = '#ffffff';
    context.fill();
    contributingPathCount += 1;
  }
  if (mask.invert) {
    context.globalCompositeOperation = 'xor';
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, rasterWidth, rasterHeight);
  }
  context.restore();
  return Object.freeze({ mode, contributingPathCount, width: rasterWidth, height: rasterHeight });
}

export function closeVectorMaskPath(pathValue) {
  if (!pathValue || pathValue.closed) return false;
  if (pathValue.points.length < 3) {
    throw new Error('VECTOR_MASK_CLOSE_REQUIRES_THREE_POINTS: Add at least three points before closing a path.');
  }
  pathValue.closed = true;
  return true;
}

export function setVectorMaskSegmentType(pathValue, pointId, segmentType) {
  const startIndex = pathValue?.points?.findIndex((candidate) => candidate.pointId === pointId) ?? -1;
  const nextIndex = startIndex < 0 ? -1 : (startIndex + 1) % pathValue.points.length;
  const start = pathValue?.points?.[startIndex];
  const end = pathValue?.points?.[nextIndex];
  const normalized = String(segmentType).toUpperCase();
  if (!start || !end || (!pathValue.closed && startIndex === pathValue.points.length - 1)) {
    throw new Error('VECTOR_MASK_SEGMENT_INVALID: Select a point-to-next segment.');
  }
  if (!VECTOR_MASK_SEGMENT_TYPES.includes(normalized)) {
    throw new Error(`VECTOR_MASK_SEGMENT_TYPE_INVALID: ${segmentType}`);
  }
  if (start.segmentTypeToNext === normalized) return false;
  if (normalized === 'CUBIC_BEZIER') {
    const a = { x: start.x, y: start.y };
    const b = { x: end.x, y: end.y };
    start.outHandle = lerp(a, b, 1 / 3);
    end.inHandle = lerp(a, b, 2 / 3);
  }
  start.segmentTypeToNext = normalized;
  return true;
}

export function splitVectorMaskSegment(pathValue, startPointId, newPointId, t = 0.5) {
  const startIndex = pathValue?.points?.findIndex((candidate) => candidate.pointId === startPointId) ?? -1;
  if (startIndex < 0 || (!pathValue.closed && startIndex === pathValue.points.length - 1)) {
    throw new Error('VECTOR_MASK_SEGMENT_INVALID: Cannot insert without a point-to-next segment.');
  }
  const nextIndex = (startIndex + 1) % pathValue.points.length;
  const start = pathValue.points[startIndex];
  const end = pathValue.points[nextIndex];
  const split = Math.min(1, Math.max(0, finite(t, 'segment.t')));
  const a = { x: start.x, y: start.y };
  const d = { x: end.x, y: end.y };
  let inserted;
  if (start.segmentTypeToNext === 'CUBIC_BEZIER') {
    const b = point(start.outHandle, 'start.outHandle');
    const c = point(end.inHandle, 'end.inHandle');
    const ab = lerp(a, b, split);
    const bc = lerp(b, c, split);
    const cd = lerp(c, d, split);
    const abc = lerp(ab, bc, split);
    const bcd = lerp(bc, cd, split);
    const anchor = lerp(abc, bcd, split);
    start.outHandle = ab;
    end.inHandle = cd;
    inserted = createVectorMaskPoint(newPointId, anchor.x, anchor.y);
    inserted.inHandle = abc;
    inserted.outHandle = bcd;
    inserted.segmentTypeToNext = 'CUBIC_BEZIER';
  } else {
    const anchor = lerp(a, d, split);
    inserted = createVectorMaskPoint(newPointId, anchor.x, anchor.y);
    inserted.segmentTypeToNext = 'LINEAR';
  }
  pathValue.points.splice(startIndex + 1, 0, inserted);
  return inserted;
}

export function deleteVectorMaskPoint(pathValue, pointId) {
  const index = pathValue?.points?.findIndex((candidate) => candidate.pointId === pointId) ?? -1;
  if (index < 0) return null;
  if (pathValue.closed && pathValue.points.length <= 3) {
    throw new Error('VECTOR_MASK_DELETE_REJECTED: A closed path must retain at least three points.');
  }
  if (!pathValue.closed && pathValue.points.length <= 1) {
    throw new Error('VECTOR_MASK_DELETE_REJECTED: Delete the path or clear the mask instead of leaving an empty path.');
  }
  const [removed] = pathValue.points.splice(index, 1);
  if (pathValue.points.length > 1) {
    const previousIndex = (index - 1 + pathValue.points.length) % pathValue.points.length;
    if (pathValue.closed || index > 0) pathValue.points[previousIndex].segmentTypeToNext = 'LINEAR';
  }
  return removed;
}

export function updateVectorMaskPoint(pathValue, pointId, update) {
  const target = vectorMaskPoint(pathValue, pointId);
  if (!target) return false;
  let changed = false;
  if (update.anchor) {
    const next = point(update.anchor, 'anchor');
    const deltaX = next.x - target.x;
    const deltaY = next.y - target.y;
    target.x = next.x;
    target.y = next.y;
    target.inHandle = { x: target.inHandle.x + deltaX, y: target.inHandle.y + deltaY };
    target.outHandle = { x: target.outHandle.x + deltaX, y: target.outHandle.y + deltaY };
    changed = deltaX !== 0 || deltaY !== 0;
  }
  for (const key of ['inHandle', 'outHandle']) {
    if (!update[key]) continue;
    const next = point(update[key], key);
    changed ||= target[key].x !== next.x || target[key].y !== next.y;
    target[key] = { ...next };
  }
  return changed;
}

export function translateVectorMaskPoints(mask, pointReferences, deltaX, deltaY) {
  const dx = finite(deltaX, 'translation.x');
  const dy = finite(deltaY, 'translation.y');
  if (dx === 0 && dy === 0) return 0;
  const selected = new Map();
  for (const reference of pointReferences || []) {
    const pathId = String(reference?.pathId || '');
    const pointId = String(reference?.pointId || '');
    if (!pathId || !pointId) continue;
    if (!selected.has(pathId)) selected.set(pathId, new Set());
    selected.get(pathId).add(pointId);
  }
  let translated = 0;
  for (const pathValue of mask?.paths || []) {
    const pointIds = selected.get(pathValue.pathId);
    if (!pointIds) continue;
    for (const pointValue of pathValue.points) {
      if (!pointIds.has(pointValue.pointId)) continue;
      pointValue.x += dx;
      pointValue.y += dy;
      pointValue.inHandle = { x: pointValue.inHandle.x + dx, y: pointValue.inHandle.y + dy };
      pointValue.outHandle = { x: pointValue.outHandle.x + dx, y: pointValue.outHandle.y + dy };
      translated += 1;
    }
  }
  return translated;
}

export function evaluateVectorMaskSegment(pathValue, startPointId, t) {
  const startIndex = pathValue?.points?.findIndex((candidate) => candidate.pointId === startPointId) ?? -1;
  if (startIndex < 0 || (!pathValue.closed && startIndex === pathValue.points.length - 1)) return null;
  const start = pathValue.points[startIndex];
  const end = pathValue.points[(startIndex + 1) % pathValue.points.length];
  const sample = Math.min(1, Math.max(0, Number(t)));
  if (start.segmentTypeToNext !== 'CUBIC_BEZIER') return lerp(start, end, sample);
  const ab = lerp(start, start.outHandle, sample);
  const bc = lerp(start.outHandle, end.inHandle, sample);
  const cd = lerp(end.inHandle, end, sample);
  return lerp(lerp(ab, bc, sample), lerp(bc, cd, sample), sample);
}
