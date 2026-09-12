'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

class ProjectStorageError extends Error {
  constructor(code, message, details = null) {
    super(`${code}: ${message}`);
    this.name = 'ProjectStorageError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new ProjectStorageError(code, message, details);
}

function validateReference(reference) {
  if (typeof reference !== 'string' || !/^assets\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(reference) ||
      reference.includes('\\') || reference.includes(':') || reference.startsWith('/') ||
      reference.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    fail('PROJECT_ASSET_PATH_INVALID', `Invalid project asset reference: ${reference}`, { assetReference: reference });
  }
  return reference;
}

function resolveAssetPath(projectRoot, reference) {
  validateReference(reference);
  const root = path.resolve(projectRoot);
  const resolved = path.resolve(root, ...reference.split('/'));
  if (!resolved.startsWith(`${root}${path.sep}`)) fail('PROJECT_ASSET_PATH_INVALID', `Asset resolves outside project root: ${reference}`);
  return resolved;
}

function bufferOf(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (value?.type === 'Buffer' && Array.isArray(value.data)) return Buffer.from(value.data);
  fail('PROJECT_ASSET_BYTES_INVALID', 'Asset payload is not binary data.');
}

function hash(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

async function ensureDirectory(directory) {
  await fs.mkdir(directory, { recursive: true });
  const stat = await fs.stat(directory);
  if (!stat.isDirectory()) fail('PROJECT_DIRECTORY_INVALID', `Project path is not a directory: ${directory}`);
}

async function validateExistingParentsNoSymlink(projectRoot, targetPath) {
  const root = path.resolve(projectRoot);
  const relative = path.relative(root, targetPath);
  let cursor = root;
  for (const segment of relative.split(path.sep).slice(0, -1)) {
    cursor = path.join(cursor, segment);
    try {
      const stat = await fs.lstat(cursor);
      if (stat.isSymbolicLink()) fail('PROJECT_ASSET_PATH_INVALID', `Symlinked project asset path is not allowed: ${cursor}`);
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
  }
}

async function saveProjectToDirectory(projectDirectory, payload, {
  validateManifest,
  failurePoint = null
} = {}) {
  if (typeof validateManifest !== 'function') fail('PROJECT_VALIDATOR_REQUIRED', 'Project manifest validator is required.');
  const projectRoot = path.resolve(projectDirectory);
  await ensureDirectory(projectRoot);
  validateManifest(payload?.manifest);
  if (!Array.isArray(payload?.assets)) fail('PROJECT_ASSET_PAYLOAD_INVALID', 'Project assets must be an array.');
  const referenced = new Set();
  for (const family of Object.values(payload.manifest.families)) {
    for (const layer of family.layers) referenced.add(layer.source.assetReference);
  }
  const assets = new Map();
  for (const asset of payload.assets) {
    const reference = validateReference(asset.assetReference);
    if (assets.has(reference)) fail('PROJECT_ASSET_DUPLICATE', `Duplicate asset payload: ${reference}`);
    const bytes = bufferOf(asset.bytes);
    const actualHash = hash(bytes);
    if (asset.sha256 && actualHash !== String(asset.sha256).toUpperCase()) {
      fail('PROJECT_ASSET_HASH_MISMATCH', `Asset payload SHA-256 mismatch: ${reference}`);
    }
    assets.set(reference, { reference, bytes, sha256: actualHash });
  }
  for (const reference of referenced) if (!assets.has(reference)) fail('PROJECT_ASSET_MISSING', `Asset payload is missing: ${reference}`);
  for (const reference of assets.keys()) if (!referenced.has(reference)) fail('PROJECT_ASSET_UNREFERENCED', `Unreferenced asset payload: ${reference}`);

  const transactionId = crypto.randomUUID().replace(/-/g, '');
  const stagingDirectory = path.join(projectRoot, `.luuxpreviz-staging-${transactionId}`);
  const temporaryManifest = path.join(projectRoot, `.project.json.tmp-${transactionId}`);
  await fs.mkdir(stagingDirectory);
  try {
    for (const asset of assets.values()) {
      const staged = path.join(stagingDirectory, path.basename(asset.reference));
      await fs.writeFile(staged, asset.bytes, { flag: 'wx' });
      if (hash(await fs.readFile(staged)) !== asset.sha256) fail('PROJECT_ASSET_HASH_MISMATCH', `Staged asset verification failed: ${asset.reference}`);
    }
    const manifestText = `${JSON.stringify(payload.manifest, null, 2)}\n`;
    await fs.writeFile(temporaryManifest, manifestText, { encoding: 'utf8', flag: 'wx' });
    const verifiedManifest = JSON.parse(await fs.readFile(temporaryManifest, 'utf8'));
    validateManifest(verifiedManifest);
    if (failurePoint === 'before-assets-commit') fail('PROJECT_SAVE_INJECTED_FAILURE', 'Injected failure before asset commit.');

    const assetsDirectory = path.join(projectRoot, 'assets');
    await ensureDirectory(assetsDirectory);
    for (const asset of assets.values()) {
      const finalPath = resolveAssetPath(projectRoot, asset.reference);
      await validateExistingParentsNoSymlink(projectRoot, finalPath);
      const staged = path.join(stagingDirectory, path.basename(asset.reference));
      try {
        const existing = await fs.readFile(finalPath);
        if (hash(existing) !== asset.sha256) fail('PROJECT_ASSET_COLLISION', `Existing project asset differs: ${asset.reference}`);
        await fs.unlink(staged);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        await fs.rename(staged, finalPath);
      }
    }
    if (failurePoint === 'before-manifest-commit') fail('PROJECT_SAVE_INJECTED_FAILURE', 'Injected failure before manifest commit.');
    await fs.rename(temporaryManifest, path.join(projectRoot, 'project.json'));
    return { projectDirectory: projectRoot, projectName: path.basename(projectRoot), assetCount: assets.size };
  } catch (error) {
    try { await fs.unlink(temporaryManifest); } catch {}
    throw error;
  } finally {
    await fs.rm(stagingDirectory, { recursive: true, force: true });
  }
}

async function loadProjectFromDirectory(projectDirectory, { validateManifest } = {}) {
  if (typeof validateManifest !== 'function') fail('PROJECT_VALIDATOR_REQUIRED', 'Project manifest validator is required.');
  const projectRoot = path.resolve(projectDirectory);
  const manifestPath = path.join(projectRoot, 'project.json');
  let manifestText;
  try {
    manifestText = await fs.readFile(manifestPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') fail('PROJECT_MANIFEST_MISSING', `project.json was not found in ${projectRoot}.`);
    throw error;
  }
  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch (error) {
    fail('PROJECT_JSON_INVALID', `project.json could not be parsed: ${error.message}`);
  }
  validateManifest(manifest);
  const references = new Set();
  for (const family of Object.values(manifest.families)) {
    for (const layer of family.layers) references.add(validateReference(layer.source.assetReference));
  }
  const assets = [];
  for (const reference of references) {
    const assetPath = resolveAssetPath(projectRoot, reference);
    await validateExistingParentsNoSymlink(projectRoot, assetPath);
    let bytes;
    try {
      bytes = await fs.readFile(assetPath);
    } catch (error) {
      if (error.code === 'ENOENT') fail('PROJECT_ASSET_MISSING', `Referenced project asset is missing: ${reference}`, { assetReference: reference });
      throw error;
    }
    const source = Object.values(manifest.families).flatMap((family) => family.layers)
      .find((layer) => layer.source.assetReference === reference).source;
    if (bytes.byteLength !== source.byteLength) fail('PROJECT_ASSET_METADATA_MISMATCH', `Asset byteLength mismatch: ${reference}`);
    if (source.sha256 && hash(bytes) !== source.sha256.toUpperCase()) fail('PROJECT_ASSET_HASH_MISMATCH', `Asset SHA-256 mismatch: ${reference}`);
    assets.push({ assetReference: reference, bytes: new Uint8Array(bytes) });
  }
  return { projectDirectory: projectRoot, projectName: path.basename(projectRoot), manifest, assets };
}

module.exports = {
  ProjectStorageError,
  loadProjectFromDirectory,
  saveProjectToDirectory,
  validateReference
};
