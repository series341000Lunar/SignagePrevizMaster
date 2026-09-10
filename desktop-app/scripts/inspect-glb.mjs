import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [inputPath] = process.argv.slice(2);

if (!inputPath) {
  console.error('Usage: node scripts/inspect-glb.mjs <asset.glb>');
  process.exit(2);
}

const absolutePath = path.resolve(inputPath);
const buffer = fs.readFileSync(absolutePath);

if (buffer.length < 20 || buffer.readUInt32LE(0) !== 0x46546c67) {
  throw new Error(`Not a GLB file: ${absolutePath}`);
}

const version = buffer.readUInt32LE(4);
const declaredLength = buffer.readUInt32LE(8);
if (version !== 2 || declaredLength !== buffer.length) {
  throw new Error(`Unsupported or malformed GLB header: version=${version}, declaredLength=${declaredLength}, actualLength=${buffer.length}`);
}

let offset = 12;
let document;
let binaryChunk;
while (offset + 8 <= buffer.length) {
  const chunkLength = buffer.readUInt32LE(offset);
  const chunkType = buffer.readUInt32LE(offset + 4);
  const chunkStart = offset + 8;
  const chunkEnd = chunkStart + chunkLength;
  if (chunkEnd > buffer.length) {
    throw new Error(`Malformed GLB chunk at byte ${offset}`);
  }
  if (chunkType === 0x4e4f534a) {
    document = JSON.parse(buffer.toString('utf8', chunkStart, chunkEnd).replace(/\u0000+$/u, '').trimEnd());
  } else if (chunkType === 0x004e4942) {
    binaryChunk = buffer.subarray(chunkStart, chunkEnd);
  }
  offset = chunkEnd;
}

if (!document) {
  throw new Error(`GLB JSON chunk not found: ${absolutePath}`);
}

const componentReaders = {
  5120: { bytes: 1, read: (data, byteOffset) => data.readInt8(byteOffset) },
  5121: { bytes: 1, read: (data, byteOffset) => data.readUInt8(byteOffset) },
  5122: { bytes: 2, read: (data, byteOffset) => data.readInt16LE(byteOffset) },
  5123: { bytes: 2, read: (data, byteOffset) => data.readUInt16LE(byteOffset) },
  5125: { bytes: 4, read: (data, byteOffset) => data.readUInt32LE(byteOffset) },
  5126: { bytes: 4, read: (data, byteOffset) => data.readFloatLE(byteOffset) },
};

const typeComponents = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
};

const accessorNumericStats = (index) => {
  const accessor = document.accessors?.[index];
  if (!accessor || accessor.bufferView === undefined || accessor.sparse || !binaryChunk) return null;
  const view = document.bufferViews?.[accessor.bufferView];
  const reader = componentReaders[accessor.componentType];
  const components = typeComponents[accessor.type];
  if (!view || !reader || !components || (view.buffer ?? 0) !== 0) return null;

  const elementBytes = reader.bytes * components;
  const stride = view.byteStride ?? elementBytes;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const min = Array.from({ length: components }, () => Number.POSITIVE_INFINITY);
  const max = Array.from({ length: components }, () => Number.NEGATIVE_INFINITY);
  const hash = crypto.createHash('sha256');
  let nonFinite = 0;

  for (let element = 0; element < accessor.count; element += 1) {
    const elementOffset = start + element * stride;
    hash.update(binaryChunk.subarray(elementOffset, elementOffset + elementBytes));
    for (let component = 0; component < components; component += 1) {
      const value = reader.read(binaryChunk, elementOffset + component * reader.bytes);
      if (!Number.isFinite(value)) {
        nonFinite += 1;
        continue;
      }
      min[component] = Math.min(min[component], value);
      max[component] = Math.max(max[component], value);
    }
  }

  return { min, max, nonFinite, stride, sha256: hash.digest('hex') };
};

const accessorSummary = (index) => {
  if (index === undefined) return null;
  const accessor = document.accessors?.[index];
  if (!accessor) return { index, missing: true };
  return {
    index,
    type: accessor.type,
    componentType: accessor.componentType,
    count: accessor.count,
    normalized: accessor.normalized ?? false,
    min: accessor.min ?? null,
    max: accessor.max ?? null,
    observed: accessorNumericStats(index),
  };
};

const materialSummary = (index) => {
  if (index === undefined) return null;
  const material = document.materials?.[index];
  if (!material) return { index, missing: true };
  const pbr = material.pbrMetallicRoughness ?? {};
  return {
    index,
    name: material.name ?? null,
    alphaMode: material.alphaMode ?? 'OPAQUE',
    alphaCutoff: material.alphaCutoff ?? null,
    doubleSided: material.doubleSided ?? false,
    baseColorFactor: pbr.baseColorFactor ?? [1, 1, 1, 1],
    baseColorTexture: pbr.baseColorTexture ?? null,
    metallicFactor: pbr.metallicFactor ?? 1,
    roughnessFactor: pbr.roughnessFactor ?? 1,
    emissiveFactor: material.emissiveFactor ?? [0, 0, 0],
    emissiveTexture: material.emissiveTexture ?? null,
    extensions: material.extensions ?? null,
  };
};

const meshSummary = (index) => {
  if (index === undefined) return null;
  const mesh = document.meshes?.[index];
  if (!mesh) return { index, missing: true };
  return {
    index,
    name: mesh.name ?? null,
    weights: mesh.weights ?? null,
    primitives: (mesh.primitives ?? []).map((primitive, primitiveIndex) => ({
      primitiveIndex,
      mode: primitive.mode ?? 4,
      material: materialSummary(primitive.material),
      indices: accessorSummary(primitive.indices),
      attributes: Object.fromEntries(
        Object.entries(primitive.attributes ?? {}).map(([semantic, accessorIndex]) => [semantic, accessorSummary(accessorIndex)]),
      ),
      targets: primitive.targets ?? null,
      extensions: primitive.extensions ?? null,
    })),
  };
};

const nodeSummary = (index, ancestry = []) => {
  const node = document.nodes?.[index];
  if (!node) return { index, missing: true };
  if (ancestry.includes(index)) return { index, cycle: true };
  return {
    index,
    name: node.name ?? null,
    transform: {
      matrix: node.matrix ?? null,
      translation: node.translation ?? [0, 0, 0],
      rotation: node.rotation ?? [0, 0, 0, 1],
      scale: node.scale ?? [1, 1, 1],
    },
    mesh: meshSummary(node.mesh),
    camera: node.camera ?? null,
    skin: node.skin ?? null,
    extras: node.extras ?? null,
    extensions: node.extensions ?? null,
    children: (node.children ?? []).map((childIndex) => nodeSummary(childIndex, [...ancestry, index])),
  };
};

const summary = {
  path: absolutePath,
  byteLength: buffer.length,
  glbVersion: version,
  asset: document.asset ?? null,
  defaultScene: document.scene ?? 0,
  scenes: (document.scenes ?? []).map((scene, sceneIndex) => ({
    sceneIndex,
    name: scene.name ?? null,
    extras: scene.extras ?? null,
    extensions: scene.extensions ?? null,
    roots: (scene.nodes ?? []).map((nodeIndex) => nodeSummary(nodeIndex)),
  })),
  counts: {
    scenes: document.scenes?.length ?? 0,
    nodes: document.nodes?.length ?? 0,
    meshes: document.meshes?.length ?? 0,
    materials: document.materials?.length ?? 0,
    textures: document.textures?.length ?? 0,
    images: document.images?.length ?? 0,
    accessors: document.accessors?.length ?? 0,
    animations: document.animations?.length ?? 0,
    cameras: document.cameras?.length ?? 0,
  },
  cameras: document.cameras ?? [],
  extensionsUsed: document.extensionsUsed ?? [],
  extensionsRequired: document.extensionsRequired ?? [],
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
