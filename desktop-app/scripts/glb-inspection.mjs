import { createHash } from 'node:crypto';

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK_TYPE = 0x4e4f534a;

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex').toUpperCase();
}

export function readGlbJson(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('GLB inspection requires a Buffer.');
  if (buffer.length < 20 || buffer.readUInt32LE(0) !== GLB_MAGIC) throw new Error('Invalid GLB magic.');
  const version = buffer.readUInt32LE(4);
  const declaredLength = buffer.readUInt32LE(8);
  if (version !== 2) throw new Error(`Unsupported GLB version: ${version}`);
  if (declaredLength !== buffer.length) throw new Error('GLB declared length does not match file length.');
  const jsonLength = buffer.readUInt32LE(12);
  const jsonType = buffer.readUInt32LE(16);
  if (jsonType !== JSON_CHUNK_TYPE || 20 + jsonLength > buffer.length) throw new Error('GLB JSON chunk is invalid.');
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8').trim());
}

function finiteArray(value, length) {
  return value === undefined ||
    (Array.isArray(value) && value.length === length && value.every(Number.isFinite));
}

function reachableNodeIndices(gltf) {
  const sceneIndex = gltf.scene ?? 0;
  const scene = gltf.scenes?.[sceneIndex];
  if (!scene || !Array.isArray(scene.nodes)) return new Set();
  const reachable = new Set();
  const visit = (index) => {
    if (!Number.isInteger(index) || reachable.has(index) || !gltf.nodes?.[index]) return;
    reachable.add(index);
    for (const child of gltf.nodes[index].children ?? []) visit(child);
  };
  for (const index of scene.nodes) visit(index);
  return reachable;
}

export function inspectEnvironmentGlb(buffer) {
  const gltf = readGlbJson(buffer);
  const reachable = reachableNodeIndices(gltf);
  const nodes = gltf.nodes ?? [];
  const meshes = gltf.meshes ?? [];
  const nodeTransformsFinite = nodes.every((node) =>
    finiteArray(node.matrix, 16) && finiteArray(node.translation, 3) &&
    finiteArray(node.rotation, 4) && finiteArray(node.scale, 3));
  const renderableMeshNodes = [...reachable].filter((nodeIndex) => {
    const meshIndex = nodes[nodeIndex]?.mesh;
    const mesh = Number.isInteger(meshIndex) ? meshes[meshIndex] : null;
    return Boolean(mesh?.primitives?.some((primitive) =>
      (primitive.mode === undefined || primitive.mode === 4) && Number.isInteger(primitive.attributes?.POSITION)));
  });
  const primitives = meshes.reduce((count, mesh) => count + (mesh.primitives?.length ?? 0), 0);
  return Object.freeze({
    byteLength: buffer.length,
    sha256: sha256(buffer),
    gltfVersion: gltf.asset?.version ?? null,
    generator: gltf.asset?.generator ?? null,
    scenes: gltf.scenes?.length ?? 0,
    nodes: nodes.length,
    meshes: meshes.length,
    materials: gltf.materials?.length ?? 0,
    cameras: gltf.cameras?.length ?? 0,
    animations: gltf.animations?.length ?? 0,
    primitives,
    reachableNodes: reachable.size,
    renderableMeshNodes: renderableMeshNodes.length,
    renderableMeshNodeNames: Object.freeze(renderableMeshNodes.map((index) => nodes[index].name ?? '')),
    nodeTransformsFinite,
    parseable: true,
    scenePresent: (gltf.scenes?.length ?? 0) > 0 && reachable.size > 0,
    renderableMeshPresent: renderableMeshNodes.length > 0
  });
}
