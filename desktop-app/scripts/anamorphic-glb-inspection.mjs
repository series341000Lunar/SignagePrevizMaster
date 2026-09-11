import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;

const COMPONENT_READERS = Object.freeze({
  5120: { bytes: 1, read: (view, offset) => view.getInt8(offset) },
  5121: { bytes: 1, read: (view, offset) => view.getUint8(offset) },
  5122: { bytes: 2, read: (view, offset) => view.getInt16(offset, true) },
  5123: { bytes: 2, read: (view, offset) => view.getUint16(offset, true) },
  5125: { bytes: 4, read: (view, offset) => view.getUint32(offset, true) },
  5126: { bytes: 4, read: (view, offset) => view.getFloat32(offset, true) }
});

const TYPE_COMPONENTS = Object.freeze({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 });

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex').toUpperCase();
}

function parseGlb(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('GLB inspection requires a Buffer.');
  if (buffer.length < 20 || buffer.readUInt32LE(0) !== GLB_MAGIC) throw new Error('Invalid GLB magic.');
  const version = buffer.readUInt32LE(4);
  const declaredLength = buffer.readUInt32LE(8);
  if (version !== 2) throw new Error(`Unsupported GLB version: ${version}`);
  if (declaredLength !== buffer.length) throw new Error('GLB declared length does not match file length.');

  let json = null;
  let bin = null;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (end > buffer.length) throw new Error('GLB chunk extends beyond the declared file length.');
    if (type === JSON_CHUNK_TYPE) json = JSON.parse(buffer.subarray(start, end).toString('utf8').trim());
    if (type === BIN_CHUNK_TYPE) bin = buffer.subarray(start, end);
    offset = end;
  }
  if (!json || !bin) throw new Error('GLB must contain JSON and BIN chunks.');
  return { json, bin };
}

function identityMatrix() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function multiplyMatrices(a, b) {
  const out = new Array(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let k = 0; k < 4; k += 1) out[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
    }
  }
  return out;
}

function composeMatrix(node) {
  if (node.matrix) return [...node.matrix];
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1
  ];
}

function transformPoint(matrix, point) {
  const [x, y, z] = point;
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]
  ];
}

function readAccessor(gltf, bin, accessorIndex) {
  const accessor = gltf.accessors?.[accessorIndex];
  if (!accessor) throw new Error(`Missing accessor ${accessorIndex}.`);
  if (accessor.sparse) throw new Error(`Sparse accessor ${accessorIndex} is not supported by the calibration inspector.`);
  const bufferView = gltf.bufferViews?.[accessor.bufferView];
  if (!bufferView || (bufferView.buffer ?? 0) !== 0) throw new Error(`Invalid buffer view for accessor ${accessorIndex}.`);
  const reader = COMPONENT_READERS[accessor.componentType];
  const components = TYPE_COMPONENTS[accessor.type];
  if (!reader || !components) throw new Error(`Unsupported accessor encoding at ${accessorIndex}.`);
  const packedStride = reader.bytes * components;
  const stride = bufferView.byteStride ?? packedStride;
  const baseOffset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const values = [];
  for (let index = 0; index < accessor.count; index += 1) {
    const tuple = [];
    for (let component = 0; component < components; component += 1) {
      tuple.push(reader.read(view, baseOffset + index * stride + component * reader.bytes));
    }
    values.push(tuple);
  }
  return values;
}

function bounds(values) {
  if (values.length === 0) return null;
  const min = [...values[0]];
  const max = [...values[0]];
  for (const value of values.slice(1)) {
    for (let index = 0; index < value.length; index += 1) {
      min[index] = Math.min(min[index], value[index]);
      max[index] = Math.max(max[index], value[index]);
    }
  }
  return { min, max };
}

function normalizedAxis(matrix, column) {
  const axis = [matrix[column * 4], matrix[column * 4 + 1], matrix[column * 4 + 2]];
  const length = Math.hypot(...axis);
  return length > 0 ? axis.map((value) => value / length) : null;
}

function worldMatrices(gltf) {
  const matrices = new Map();
  const reachable = new Set();
  const scene = gltf.scenes?.[gltf.scene ?? 0];
  const visit = (nodeIndex, parentMatrix) => {
    if (!Number.isInteger(nodeIndex) || reachable.has(nodeIndex) || !gltf.nodes?.[nodeIndex]) return;
    reachable.add(nodeIndex);
    const world = multiplyMatrices(parentMatrix, composeMatrix(gltf.nodes[nodeIndex]));
    matrices.set(nodeIndex, world);
    for (const child of gltf.nodes[nodeIndex].children ?? []) visit(child, world);
  };
  for (const nodeIndex of scene?.nodes ?? []) visit(nodeIndex, identityMatrix());
  return { matrices, reachable };
}

export function inspectAnamorphicGlb(buffer) {
  const { json: gltf, bin } = parseGlb(buffer);
  const { matrices, reachable } = worldMatrices(gltf);
  const nodes = [...reachable].map((nodeIndex) => {
    const node = gltf.nodes[nodeIndex];
    const matrix = matrices.get(nodeIndex);
    const mesh = Number.isInteger(node.mesh) ? gltf.meshes?.[node.mesh] : null;
    const positions = [];
    const uvs = [];
    for (const primitive of mesh?.primitives ?? []) {
      if (Number.isInteger(primitive.attributes?.POSITION)) {
        positions.push(...readAccessor(gltf, bin, primitive.attributes.POSITION));
      }
      if (Number.isInteger(primitive.attributes?.TEXCOORD_0)) {
        uvs.push(...readAccessor(gltf, bin, primitive.attributes.TEXCOORD_0));
      }
    }
    const worldPositions = positions.map((position) => transformPoint(matrix, position));
    return freeze({
      index: nodeIndex,
      name: node.name ?? '',
      meshIndex: Number.isInteger(node.mesh) ? node.mesh : null,
      meshName: mesh?.name ?? null,
      translation: node.translation ? [...node.translation] : [0, 0, 0],
      rotation: node.rotation ? [...node.rotation] : [0, 0, 0, 1],
      scale: node.scale ? [...node.scale] : [1, 1, 1],
      worldPosition: [matrix[12], matrix[13], matrix[14]],
      worldAxes: { x: normalizedAxis(matrix, 0), y: normalizedAxis(matrix, 1), z: normalizedAxis(matrix, 2) },
      localBounds: bounds(positions),
      worldBounds: bounds(worldPositions),
      uv0Bounds: bounds(uvs),
      vertexCount: positions.length,
      primitiveCount: mesh?.primitives?.length ?? 0
    });
  });
  return freeze({
    byteLength: buffer.length,
    sha256: sha256(buffer),
    gltfVersion: gltf.asset?.version ?? null,
    generator: gltf.asset?.generator ?? null,
    scenes: gltf.scenes?.length ?? 0,
    nodes: gltf.nodes?.length ?? 0,
    meshes: gltf.meshes?.length ?? 0,
    materials: gltf.materials?.length ?? 0,
    cameras: gltf.cameras?.length ?? 0,
    animations: gltf.animations?.length ?? 0,
    sceneNodeCount: reachable.size,
    nodeRecords: nodes
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error('Usage: node anamorphic-glb-inspection.mjs <asset.glb>');
  console.log(JSON.stringify(inspectAnamorphicGlb(await readFile(inputPath)), null, 2));
}
