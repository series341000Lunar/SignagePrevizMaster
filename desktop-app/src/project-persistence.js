import { PROJECTION_BAKE_PROFILES } from './projection-bake-profile.js';
import {
  AUTHORING_BLEND_MODES,
  AUTHORING_COORDINATE_SPACE,
  normalizeAuthoringTransform
} from './screen-image-authoring.js';
import {
  VECTOR_MASK_OPERATIONS,
  VECTOR_MASK_SEGMENT_TYPES,
  cloneVectorMask,
  createEmptyVectorMask
} from './vector-mask-model.js';
import {
  BITMAP_ALPHA_CONTRACTS,
  BITMAP_COLOR_CONTRACTS,
  BITMAP_SOURCE_TYPES,
  cloneBitmapProvenance,
  createFileProvenance,
  isSnapshotSourceType,
  normalizeCaptureBounds
} from './bitmap-source.js';

export const PROJECT_SCHEMA_VERSION = 3;
export const PROJECT_SUPPORTED_SCHEMA_VERSIONS = Object.freeze([1, 2, 3]);
export const PROJECT_TYPE = 'LUUX_SIGNAGE_PREVIZ';
export const PROJECT_MAPPING_MODE = 'SCREEN_PROJECTED';

const ASSET_REFERENCE_PATTERN = /^assets\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

export class ProjectPersistenceError extends Error {
  constructor(code, message, details = null) {
    super(`${code}: ${message}`);
    this.name = 'ProjectPersistenceError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new ProjectPersistenceError(code, message, details);
}

function object(value, code, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, `${label} must be an object.`);
  return value;
}

function exactKeys(value, allowed, code, label, schemaVersion = PROJECT_SCHEMA_VERSION) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(code, `${label}.${key} is not part of schemaVersion ${schemaVersion}.`);
  }
}

function nonEmptyString(value, code, label) {
  if (typeof value !== 'string' || !value) fail(code, `${label} must be a non-empty string.`);
  return value;
}

function positiveInteger(value, code, label) {
  if (!Number.isSafeInteger(value) || value <= 0) fail(code, `${label} must be a positive integer.`);
  return value;
}

function finiteNumber(value, code, label) {
  if (!Number.isFinite(value)) fail(code, `${label} must be finite.`);
  return value;
}

function bytesOf(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  fail('PROJECT_ASSET_BYTES_INVALID', 'Project asset bytes must be binary data.');
}

export function validateAssetReference(value) {
  const reference = nonEmptyString(value, 'PROJECT_ASSET_PATH_INVALID', 'assetReference');
  if (reference.includes('\\') || reference.includes(':') || reference.startsWith('/') ||
      reference.split('/').some((segment) => segment === '..' || segment === '.' || !segment) ||
      !ASSET_REFERENCE_PATTERN.test(reference)) {
    fail('PROJECT_ASSET_PATH_INVALID', `Asset reference must be a safe project-relative assets path: ${reference}`, { assetReference: reference });
  }
  return reference;
}

export async function sha256Hex(value) {
  const bytes = bytesOf(value);
  const input = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? bytes.buffer
    : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', input);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function validateCaptureBounds(value, label, width, height) {
  object(value, 'PROJECT_SNAPSHOT_PROVENANCE_INVALID', label);
  exactKeys(value, ['left', 'top', 'right', 'bottom'], 'PROJECT_SNAPSHOT_PROVENANCE_INVALID', label);
  let bounds;
  try { bounds = normalizeCaptureBounds(value); }
  catch (error) { fail('PROJECT_SNAPSHOT_PROVENANCE_INVALID', `${label} is invalid.`, { cause: error.message }); }
  if (bounds.right - bounds.left !== width || bounds.bottom - bounds.top !== height) {
    fail('PROJECT_SNAPSHOT_NATIVE_PIXEL_MISMATCH', `${label} dimensions must match bitmap dimensions 1:1.`);
  }
}

function validateProvenance(source, label) {
  const provenance = object(source.provenance, 'PROJECT_SOURCE_PROVENANCE_INVALID', `${label}.provenance`);
  if (source.sourceType === 'FILE') {
    exactKeys(provenance, ['type', 'originalFilename'], 'PROJECT_SOURCE_PROVENANCE_INVALID', `${label}.provenance`);
    if (provenance.type !== 'FILE' || provenance.originalFilename !== source.originalFilename) {
      fail('PROJECT_SOURCE_PROVENANCE_INVALID', `${label}.provenance must identify the FILE original filename.`);
    }
    return;
  }
  const commonKeys = [
    'type', 'documentName', 'captureDocumentId', 'documentWidth', 'documentHeight',
    'captureBounds', 'captureTimestamp', 'captureMode'
  ];
  const selectionKeys = ['selectedLayerIds', 'selectedLayerNames'];
  exactKeys(provenance, isSnapshotSourceType(source.sourceType) && source.sourceType === 'PHOTOSHOP_SELECTION_SNAPSHOT'
    ? [...commonKeys, ...selectionKeys]
    : commonKeys, 'PROJECT_SOURCE_PROVENANCE_INVALID', `${label}.provenance`);
  if (provenance.type !== source.sourceType) fail('PROJECT_SOURCE_PROVENANCE_INVALID', `${label}.provenance.type must match sourceType.`);
  nonEmptyString(provenance.documentName, 'PROJECT_SOURCE_PROVENANCE_INVALID', `${label}.provenance.documentName`);
  positiveInteger(provenance.captureDocumentId, 'PROJECT_SOURCE_PROVENANCE_INVALID', `${label}.provenance.captureDocumentId`);
  positiveInteger(provenance.documentWidth, 'PROJECT_SOURCE_PROVENANCE_INVALID', `${label}.provenance.documentWidth`);
  positiveInteger(provenance.documentHeight, 'PROJECT_SOURCE_PROVENANCE_INVALID', `${label}.provenance.documentHeight`);
  validateCaptureBounds(provenance.captureBounds, `${label}.provenance.captureBounds`, source.width, source.height);
  if (!Number.isFinite(Date.parse(provenance.captureTimestamp))) fail('PROJECT_SOURCE_PROVENANCE_INVALID', `${label}.provenance.captureTimestamp must be ISO date text.`);
  const expectedMode = source.sourceType === 'PHOTOSHOP_COMPOSITE_SNAPSHOT' ? 'COMPOSITE' : 'SINGLE_PIXEL_LAYER';
  if (provenance.captureMode !== expectedMode) fail('PROJECT_SOURCE_PROVENANCE_INVALID', `${label}.provenance.captureMode must be ${expectedMode}.`);
  if (source.sourceType === 'PHOTOSHOP_SELECTION_SNAPSHOT') {
    if (!Array.isArray(provenance.selectedLayerIds) || !Array.isArray(provenance.selectedLayerNames) ||
        provenance.selectedLayerIds.length !== 1 || provenance.selectedLayerNames.length !== 1 ||
        !Number.isSafeInteger(provenance.selectedLayerIds[0]) || provenance.selectedLayerIds[0] <= 0 ||
        typeof provenance.selectedLayerNames[0] !== 'string' || !provenance.selectedLayerNames[0]) {
      fail('PROJECT_SOURCE_PROVENANCE_INVALID', `${label}.provenance must contain exactly one Pixel Layer identity.`);
    }
  }
}

function validateSource(source, label, schemaVersion) {
  object(source, 'PROJECT_MANIFEST_INVALID', label);
  if (schemaVersion <= 2) {
    exactKeys(source, [
      'sourceType', 'assetReference', 'originalFilename', 'width', 'height',
      'mimeType', 'byteLength', 'sha256', 'hasAlpha'
    ], 'PROJECT_MANIFEST_INVALID', label, schemaVersion);
    if (source.sourceType !== 'FILE') fail('PROJECT_SOURCE_TYPE_INVALID', `${label}.sourceType must be FILE.`);
  } else {
    exactKeys(source, [
      'sourceId', 'sourceType', 'assetReference', 'originalFilename', 'width', 'height',
      'mimeType', 'byteLength', 'sha256', 'hasAlpha', 'alphaContract', 'colorContract', 'provenance'
    ], 'PROJECT_MANIFEST_INVALID', label, schemaVersion);
    nonEmptyString(source.sourceId, 'PROJECT_SOURCE_ID_INVALID', `${label}.sourceId`);
    if (!BITMAP_SOURCE_TYPES.includes(source.sourceType)) fail('PROJECT_SOURCE_TYPE_INVALID', `${label}.sourceType is unsupported.`);
    if (!BITMAP_ALPHA_CONTRACTS.includes(source.alphaContract)) fail('PROJECT_SOURCE_CONTRACT_INVALID', `${label}.alphaContract is unsupported.`);
    if (!BITMAP_COLOR_CONTRACTS.includes(source.colorContract)) fail('PROJECT_SOURCE_CONTRACT_INVALID', `${label}.colorContract is unsupported.`);
  }
  validateAssetReference(source.assetReference);
  nonEmptyString(source.originalFilename, 'PROJECT_MANIFEST_INVALID', `${label}.originalFilename`);
  positiveInteger(source.width, 'PROJECT_MANIFEST_INVALID', `${label}.width`);
  positiveInteger(source.height, 'PROJECT_MANIFEST_INVALID', `${label}.height`);
  if (!['image/png', 'image/jpeg'].includes(source.mimeType) || (isSnapshotSourceType(source.sourceType) && source.mimeType !== 'image/png')) {
    fail('PROJECT_SOURCE_TYPE_INVALID', `${label}.mimeType is unsupported for ${source.sourceType}.`);
  }
  if (!Number.isSafeInteger(source.byteLength) || source.byteLength <= 0) fail('PROJECT_MANIFEST_INVALID', `${label}.byteLength must be positive.`);
  if (source.sha256 !== undefined && !/^[A-Fa-f0-9]{64}$/.test(source.sha256)) {
    fail('PROJECT_MANIFEST_INVALID', `${label}.sha256 must be a SHA-256 hex digest.`);
  }
  if (source.hasAlpha !== undefined && typeof source.hasAlpha !== 'boolean') {
    fail('PROJECT_MANIFEST_INVALID', `${label}.hasAlpha must be boolean when present.`);
  }
  if (schemaVersion >= 3) validateProvenance(source, label);
}

function commonPersistentSource(source, schemaVersion) {
  if (schemaVersion >= 3) return { ...source, provenance: cloneBitmapProvenance(source.provenance) };
  return {
    ...source,
    sourceId: `legacy:${source.assetReference}`,
    sourceType: 'FILE',
    alphaContract: 'EMBEDDED_FILE_ALPHA',
    colorContract: 'EMBEDDED_FILE_PROFILE',
    provenance: createFileProvenance(source.originalFilename)
  };
}

function validateProfileReference(reference, familyId, profiles) {
  object(reference, 'PROJECT_PROFILE_INVALID', `${familyId}.projectionProfile`);
  exactKeys(reference, ['profileId', 'surfaceBinding'], 'PROJECT_PROFILE_INVALID', `${familyId}.projectionProfile`);
  object(reference.surfaceBinding, 'PROJECT_PROFILE_INVALID', `${familyId}.projectionProfile.surfaceBinding`);
  exactKeys(reference.surfaceBinding, ['exactName', 'uvPolicy'], 'PROJECT_PROFILE_INVALID', `${familyId}.projectionProfile.surfaceBinding`);
  const profile = profiles[familyId];
  if (!profile || reference.profileId !== profile.id ||
      reference.surfaceBinding.exactName !== profile.surfaceBinding.exactName ||
      reference.surfaceBinding.uvPolicy !== profile.surfaceBinding.uvPolicy) {
    fail('PROJECT_PROFILE_MISMATCH', `Project calibration reference does not match the application-owned profile for ${familyId}.`);
  }
}

function validateVectorMask(mask, label, pathIds, pointIds) {
  object(mask, 'PROJECT_VECTOR_MASK_INVALID', label);
  exactKeys(mask, ['enabled', 'invert', 'paths'], 'PROJECT_VECTOR_MASK_INVALID', label);
  if (typeof mask.enabled !== 'boolean') fail('PROJECT_VECTOR_MASK_INVALID', `${label}.enabled must be boolean.`);
  if (typeof mask.invert !== 'boolean') fail('PROJECT_VECTOR_MASK_INVALID', `${label}.invert must be boolean.`);
  if (!Array.isArray(mask.paths)) fail('PROJECT_VECTOR_MASK_INVALID', `${label}.paths must be an array.`);
  mask.paths.forEach((pathValue, pathIndex) => {
    const pathLabel = `${label}.paths[${pathIndex}]`;
    object(pathValue, 'PROJECT_VECTOR_MASK_INVALID', pathLabel);
    exactKeys(pathValue, ['pathId', 'enabled', 'operation', 'closed', 'points'], 'PROJECT_VECTOR_MASK_INVALID', pathLabel);
    nonEmptyString(pathValue.pathId, 'PROJECT_VECTOR_MASK_ID_INVALID', `${pathLabel}.pathId`);
    if (pathIds.has(pathValue.pathId)) fail('PROJECT_VECTOR_MASK_ID_DUPLICATE', `Duplicate pathId: ${pathValue.pathId}`);
    pathIds.add(pathValue.pathId);
    if (typeof pathValue.enabled !== 'boolean') fail('PROJECT_VECTOR_MASK_INVALID', `${pathLabel}.enabled must be boolean.`);
    if (!VECTOR_MASK_OPERATIONS.includes(pathValue.operation)) {
      fail('PROJECT_VECTOR_MASK_OPERATION_INVALID', `${pathLabel}.operation must be ADD or SUBTRACT.`);
    }
    if (typeof pathValue.closed !== 'boolean') fail('PROJECT_VECTOR_MASK_INVALID', `${pathLabel}.closed must be boolean.`);
    if (!Array.isArray(pathValue.points) || pathValue.points.length < 1) {
      fail('PROJECT_VECTOR_MASK_POINTS_INVALID', `${pathLabel}.points must contain at least one point.`);
    }
    if (pathValue.closed && pathValue.points.length < 3) {
      fail('PROJECT_VECTOR_MASK_POINTS_INVALID', `${pathLabel} requires at least three points when closed.`);
    }
    pathValue.points.forEach((pointValue, pointIndex) => {
      const pointLabel = `${pathLabel}.points[${pointIndex}]`;
      object(pointValue, 'PROJECT_VECTOR_MASK_INVALID', pointLabel);
      exactKeys(pointValue, [
        'pointId', 'x', 'y', 'inHandle', 'outHandle', 'segmentTypeToNext'
      ], 'PROJECT_VECTOR_MASK_INVALID', pointLabel);
      nonEmptyString(pointValue.pointId, 'PROJECT_VECTOR_MASK_ID_INVALID', `${pointLabel}.pointId`);
      if (pointIds.has(pointValue.pointId)) fail('PROJECT_VECTOR_MASK_ID_DUPLICATE', `Duplicate pointId: ${pointValue.pointId}`);
      pointIds.add(pointValue.pointId);
      finiteNumber(pointValue.x, 'PROJECT_VECTOR_MASK_COORDINATE_INVALID', `${pointLabel}.x`);
      finiteNumber(pointValue.y, 'PROJECT_VECTOR_MASK_COORDINATE_INVALID', `${pointLabel}.y`);
      for (const handleName of ['inHandle', 'outHandle']) {
        const handle = object(pointValue[handleName], 'PROJECT_VECTOR_MASK_COORDINATE_INVALID', `${pointLabel}.${handleName}`);
        exactKeys(handle, ['x', 'y'], 'PROJECT_VECTOR_MASK_COORDINATE_INVALID', `${pointLabel}.${handleName}`);
        finiteNumber(handle.x, 'PROJECT_VECTOR_MASK_COORDINATE_INVALID', `${pointLabel}.${handleName}.x`);
        finiteNumber(handle.y, 'PROJECT_VECTOR_MASK_COORDINATE_INVALID', `${pointLabel}.${handleName}.y`);
      }
      if (!VECTOR_MASK_SEGMENT_TYPES.includes(pointValue.segmentTypeToNext)) {
        fail('PROJECT_VECTOR_MASK_SEGMENT_INVALID', `${pointLabel}.segmentTypeToNext is unsupported.`);
      }
    });
  });
}

export function validateProjectManifest(manifest, { profiles = PROJECTION_BAKE_PROFILES } = {}) {
  object(manifest, 'PROJECT_MANIFEST_INVALID', 'project');
  if (!Number.isSafeInteger(manifest.schemaVersion)) fail('PROJECT_SCHEMA_INVALID', 'schemaVersion must be an integer.');
  if (manifest.schemaVersion > PROJECT_SCHEMA_VERSION) {
    fail('PROJECT_SCHEMA_UNSUPPORTED', `schemaVersion ${manifest.schemaVersion} is newer than supported version ${PROJECT_SCHEMA_VERSION}.`);
  }
  if (!PROJECT_SUPPORTED_SCHEMA_VERSIONS.includes(manifest.schemaVersion)) {
    fail('PROJECT_SCHEMA_UNSUPPORTED', `schemaVersion ${manifest.schemaVersion} is unsupported.`);
  }
  exactKeys(manifest, ['schemaVersion', 'projectType', 'coordinateSpace', 'families'], 'PROJECT_MANIFEST_INVALID', 'project', manifest.schemaVersion);
  if (manifest.projectType !== PROJECT_TYPE) fail('PROJECT_MANIFEST_INVALID', `projectType must be ${PROJECT_TYPE}.`);
  if (manifest.coordinateSpace !== AUTHORING_COORDINATE_SPACE) {
    fail('PROJECT_COORDINATE_INVALID', `coordinateSpace must be ${AUTHORING_COORDINATE_SPACE}.`);
  }
  object(manifest.families, 'PROJECT_MANIFEST_INVALID', 'families');
  const knownFamilies = Object.keys(profiles);
  const layerIds = new Set();
  const pathIds = new Set();
  const pointIds = new Set();
  for (const familyId of Object.keys(manifest.families)) {
    if (!knownFamilies.includes(familyId)) fail('PROJECT_FAMILY_UNKNOWN', `Unknown familyId: ${familyId}`);
    const family = object(manifest.families[familyId], 'PROJECT_MANIFEST_INVALID', `families.${familyId}`);
    exactKeys(family, ['familyId', 'projectionProfile', 'layers'], 'PROJECT_MANIFEST_INVALID', `families.${familyId}`, manifest.schemaVersion);
    if (family.familyId !== familyId) fail('PROJECT_FAMILY_MISMATCH', `Family ownership mismatch for ${familyId}.`);
    validateProfileReference(family.projectionProfile, familyId, profiles);
    if (!Array.isArray(family.layers)) fail('PROJECT_MANIFEST_INVALID', `${familyId}.layers must be an array.`);
    const orders = new Set();
    family.layers.forEach((layer, index) => {
      const label = `families.${familyId}.layers[${index}]`;
      object(layer, 'PROJECT_MANIFEST_INVALID', label);
      const layerKeys = [
        'familyId', 'layerId', 'order', 'visible', 'source', 'mappingMode',
        'transform', 'opacity', 'blendMode'
      ];
      if (manifest.schemaVersion >= 2) layerKeys.push('vectorMask');
      exactKeys(layer, layerKeys, 'PROJECT_MANIFEST_INVALID', label, manifest.schemaVersion);
      if (layer.familyId !== familyId) fail('PROJECT_FAMILY_MISMATCH', `${label}.familyId does not match its owning family.`);
      nonEmptyString(layer.layerId, 'PROJECT_LAYER_ID_INVALID', `${label}.layerId`);
      if (layerIds.has(layer.layerId)) fail('PROJECT_LAYER_ID_DUPLICATE', `Duplicate layerId: ${layer.layerId}`);
      layerIds.add(layer.layerId);
      if (!Number.isSafeInteger(layer.order) || layer.order < 0 || orders.has(layer.order)) {
        fail('PROJECT_LAYER_ORDER_INVALID', `${label}.order must be a unique non-negative integer.`);
      }
      orders.add(layer.order);
      if (layer.order !== index) fail('PROJECT_LAYER_ORDER_INVALID', `${label}.order must be contiguous and match manifest array order.`);
      if (typeof layer.visible !== 'boolean') fail('PROJECT_MANIFEST_INVALID', `${label}.visible must be boolean.`);
      validateSource(layer.source, `${label}.source`, manifest.schemaVersion);
      if (layer.mappingMode !== PROJECT_MAPPING_MODE) fail('PROJECT_MAPPING_MODE_INVALID', `${label}.mappingMode must be ${PROJECT_MAPPING_MODE}.`);
      object(layer.transform, 'PROJECT_TRANSFORM_INVALID', `${label}.transform`);
      exactKeys(layer.transform, ['x', 'y', 'scale', 'rotationDegrees'], 'PROJECT_TRANSFORM_INVALID', `${label}.transform`);
      finiteNumber(layer.transform.x, 'PROJECT_TRANSFORM_INVALID', `${label}.transform.x`);
      finiteNumber(layer.transform.y, 'PROJECT_TRANSFORM_INVALID', `${label}.transform.y`);
      finiteNumber(layer.transform.scale, 'PROJECT_TRANSFORM_INVALID', `${label}.transform.scale`);
      finiteNumber(layer.transform.rotationDegrees, 'PROJECT_TRANSFORM_INVALID', `${label}.transform.rotationDegrees`);
      if (layer.transform.x < -2 || layer.transform.x > 3 || layer.transform.y < -2 || layer.transform.y > 3 ||
          layer.transform.scale < 0.01 || layer.transform.scale > 20 ||
          layer.transform.rotationDegrees < 0 || layer.transform.rotationDegrees >= 360) {
        fail('PROJECT_TRANSFORM_INVALID', `${label}.transform is outside the authoring contract.`);
      }
      finiteNumber(layer.opacity, 'PROJECT_OPACITY_INVALID', `${label}.opacity`);
      if (layer.opacity < 0 || layer.opacity > 1) fail('PROJECT_OPACITY_INVALID', `${label}.opacity must be between 0 and 1.`);
      if (!AUTHORING_BLEND_MODES.includes(layer.blendMode)) fail('PROJECT_BLEND_MODE_UNSUPPORTED', `${label}.blendMode is unsupported.`);
      if (manifest.schemaVersion >= 2) validateVectorMask(layer.vectorMask, `${label}.vectorMask`, pathIds, pointIds);
    });
  }
  return manifest;
}

function assetToken(value) {
  const supplied = String(value || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 16);
  if (supplied) return supplied;
  return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

function sourceBytes(layer) {
  const value = layer.runtime?.originalBytes;
  if (!value) fail('PROJECT_SOURCE_BYTES_UNAVAILABLE', `Original source bytes are unavailable for ${layer.layerId}.`);
  return bytesOf(value);
}

export async function createProjectSavePayload(stack, {
  profiles = PROJECTION_BAKE_PROFILES,
  assetNameToken = null
} = {}) {
  const token = assetToken(assetNameToken);
  const manifest = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    projectType: PROJECT_TYPE,
    coordinateSpace: AUTHORING_COORDINATE_SPACE,
    families: {}
  };
  const assets = [];
  let assetIndex = 0;
  for (const familyId of Object.keys(profiles)) {
    const profile = profiles[familyId];
    const layers = stack.stacks.get(familyId) || [];
    const family = {
      familyId,
      projectionProfile: {
        profileId: profile.id,
        surfaceBinding: {
          exactName: profile.surfaceBinding.exactName,
          uvPolicy: profile.surfaceBinding.uvPolicy
        }
      },
      layers: []
    };
    for (const layer of layers) {
      const bytes = sourceBytes(layer);
      assetIndex += 1;
      const extension = layer.source.mimeType === 'image/png' ? 'png' : 'jpg';
      const assetReference = `assets/asset-${token}-${String(assetIndex).padStart(4, '0')}.${extension}`;
      const sha256 = await sha256Hex(bytes);
      assets.push({ assetReference, bytes, sha256 });
      const sourceType = BITMAP_SOURCE_TYPES.includes(layer.source.sourceType) ? layer.source.sourceType : 'FILE';
      const originalFilename = layer.source.originalFilename || layer.source.filename;
      const provenance = sourceType === 'FILE'
        ? createFileProvenance(originalFilename)
        : cloneBitmapProvenance(layer.source.provenance);
      family.layers.push({
        familyId,
        layerId: layer.layerId,
        order: layer.order,
        visible: layer.visible,
        source: {
          sourceId: String(layer.source.sourceId || layer.source.id),
          sourceType,
          assetReference,
          originalFilename,
          width: layer.source.width,
          height: layer.source.height,
          mimeType: layer.source.mimeType,
          byteLength: bytes.byteLength,
          sha256,
          hasAlpha: layer.source.hasAlpha,
          alphaContract: layer.source.alphaContract || (sourceType === 'FILE' ? 'EMBEDDED_FILE_ALPHA' : (layer.source.hasAlpha ? 'PHOTOSHOP_IMAGING_RGBA8_PROBE_PENDING' : 'OPAQUE_RGB8')),
          colorContract: layer.source.colorContract || (sourceType === 'FILE' ? 'EMBEDDED_FILE_PROFILE' : 'SRGB_IEC61966_2_1_RGB8'),
          provenance
        },
        mappingMode: PROJECT_MAPPING_MODE,
        transform: { ...layer.transform },
        opacity: layer.opacity,
        blendMode: layer.blendMode,
        vectorMask: cloneVectorMask(layer.vectorMask || createEmptyVectorMask())
      });
    }
    manifest.families[familyId] = family;
  }
  validateProjectManifest(manifest, { profiles });
  return { manifest, assets };
}

function sequenceFromLayerIds(layerIds, idPrefix) {
  const prefix = `${idPrefix}-`;
  let sequence = 0;
  for (const layerId of layerIds) {
    if (!layerId.startsWith(prefix)) continue;
    const suffix = layerId.slice(prefix.length);
    if (!/^[0-9a-z]+$/i.test(suffix)) continue;
    const value = Number.parseInt(suffix, 36);
    if (Number.isSafeInteger(value)) sequence = Math.max(sequence, value);
  }
  return sequence;
}

export async function prepareProjectLoad(manifest, assetRecords, {
  profiles = PROJECTION_BAKE_PROFILES,
  activeFamilyId = null,
  idPrefix = 'projection-layer',
  decodeAsset,
  disposeRuntime = () => {}
} = {}) {
  validateProjectManifest(manifest, { profiles });
  if (typeof decodeAsset !== 'function') fail('PROJECT_ASSET_DECODE_FAILED', 'A project image decoder is required.');
  const assets = new Map();
  for (const record of assetRecords || []) {
    const reference = validateAssetReference(record.assetReference);
    if (assets.has(reference)) fail('PROJECT_ASSET_DUPLICATE', `Duplicate project asset payload: ${reference}`);
    assets.set(reference, bytesOf(record.bytes));
  }
  const sourceByReference = new Map();
  for (const family of Object.values(manifest.families)) {
    for (const layer of family.layers) sourceByReference.set(layer.source.assetReference, layer.source);
  }
  for (const [reference, source] of sourceByReference) {
    const bytes = assets.get(reference);
    if (!bytes) fail('PROJECT_ASSET_MISSING', `Referenced project asset is missing: ${reference}`, { assetReference: reference });
    if (bytes.byteLength !== source.byteLength) fail('PROJECT_ASSET_METADATA_MISMATCH', `Asset byteLength mismatch: ${reference}`);
    if (source.sha256 && await sha256Hex(bytes) !== source.sha256.toUpperCase()) {
      fail('PROJECT_ASSET_HASH_MISMATCH', `Asset SHA-256 mismatch: ${reference}`, { assetReference: reference });
    }
  }

  const runtimes = [];
  const stacks = [];
  const selectedByFamily = [];
  const layerIds = [];
  try {
    for (const familyId of Object.keys(manifest.families)) {
      const family = manifest.families[familyId];
      const layers = [];
      for (const layer of family.layers) {
        const commonSource = commonPersistentSource(layer.source, manifest.schemaVersion);
        const bytes = assets.get(layer.source.assetReference);
        let runtime;
        try {
          runtime = await decodeAsset({ source: commonSource, bytes, layerId: layer.layerId, familyId });
        } catch (error) {
          fail('PROJECT_ASSET_DECODE_FAILED', `Could not decode ${layer.source.assetReference}: ${error.message || error}`, {
            assetReference: layer.source.assetReference
          });
        }
        if (!runtime || runtime.width !== layer.source.width || runtime.height !== layer.source.height) {
          if (runtime) disposeRuntime(runtime);
          fail('PROJECT_ASSET_METADATA_MISMATCH', `Decoded dimensions do not match project metadata: ${layer.source.assetReference}`);
        }
        if (layer.source.hasAlpha !== undefined && Boolean(runtime.hasAlpha) !== layer.source.hasAlpha) {
          disposeRuntime(runtime);
          fail('PROJECT_ASSET_METADATA_MISMATCH', `Decoded alpha metadata does not match project metadata: ${layer.source.assetReference}`);
        }
        runtimes.push(runtime);
        layerIds.push(layer.layerId);
        layers.push({
          familyId,
          layerId: layer.layerId,
          order: layer.order,
          visible: layer.visible,
          source: {
            id: `project:${layer.source.assetReference}`,
            sourceId: commonSource.sourceId,
            filename: commonSource.originalFilename,
            name: commonSource.originalFilename,
            originalFilename: commonSource.originalFilename,
            sourceType: commonSource.sourceType,
            assetReference: layer.source.assetReference,
            mimeType: layer.source.mimeType,
            type: layer.source.mimeType,
            width: layer.source.width,
            height: layer.source.height,
            byteLength: layer.source.byteLength,
            sha256: layer.source.sha256 || null,
            hasAlpha: Boolean(layer.source.hasAlpha),
            alphaContract: commonSource.alphaContract,
            colorContract: commonSource.colorContract,
            provenance: cloneBitmapProvenance(commonSource.provenance)
          },
          runtime,
          mappingMode: PROJECT_MAPPING_MODE,
          transform: normalizeAuthoringTransform(layer.transform),
          opacity: layer.opacity,
          blendMode: layer.blendMode,
          vectorMask: manifest.schemaVersion >= 2
            ? cloneVectorMask(layer.vectorMask)
            : createEmptyVectorMask(),
          pixelRevision: 1,
          bakedPixelRevision: null,
          metadataRevision: 1,
          metadataSyncedRevision: null,
          bakedRevision: null
        });
      }
      stacks.push([familyId, layers]);
      selectedByFamily.push([familyId, layers[0]?.layerId || null]);
    }
    const familyIds = Object.keys(manifest.families);
    const selectedFamily = familyIds.includes(activeFamilyId) ? activeFamilyId : (familyIds[0] || null);
    return {
      manifest,
      runtimes,
      snapshot: {
        activeFamilyId: selectedFamily,
        revision: 0,
        sequence: sequenceFromLayerIds(layerIds, idPrefix),
        selectedByFamily,
        stacks
      }
    };
  } catch (error) {
    for (const runtime of runtimes) disposeRuntime(runtime);
    throw error;
  }
}
