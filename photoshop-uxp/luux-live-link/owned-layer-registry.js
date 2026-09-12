'use strict';

const SUPPORTED_COMPOSITE_MODES = Object.freeze(['NORMAL', 'MULTIPLY', 'SCREEN', 'LINEAR_DODGE']);

function requireText(value, name, maxLength = 256) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) throw new Error(`${name} must be a non-empty string of at most ${maxLength} characters.`);
  return value.trim();
}

function ownedLayerBindingKey(targetId, familyId, outputKind) {
  return [requireText(targetId, 'targetId', 128), requireText(familyId, 'familyId', 128), requireText(outputKind, 'outputKind', 32).toUpperCase()].join(':');
}

function ownedLayerKey(targetId, familyId, outputKind, authoringLayerId) {
  return `${ownedLayerBindingKey(targetId, familyId, outputKind)}:${requireText(authoringLayerId, 'authoringLayerId', 128)}`;
}

function normalizeCompositeMetadata(value) {
  const opacity = Number(value?.opacity);
  const blendMode = String(value?.blendMode || '').toUpperCase();
  const order = Number(value?.order);
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new Error('opacity must be between 0 and 1.');
  if (!SUPPORTED_COMPOSITE_MODES.includes(blendMode)) throw new Error(`Unsupported composite blendMode: ${blendMode || 'empty'}.`);
  if (!Number.isSafeInteger(order) || order < 0) throw new Error('order must be a non-negative safe integer.');
  return Object.freeze({ opacity, blendMode, visible: Boolean(value.visible), order });
}

function createOwnedLayerRegistry({ sessionId }) {
  const registrySessionId = requireText(sessionId, 'sessionId', 128);
  const records = new Map();
  const groups = new Map();
  function register(record) {
    const key = ownedLayerKey(record.targetId, record.familyId, record.outputKind, record.authoringLayerId);
    if (!Number.isSafeInteger(record.photoshopLayerId) || record.photoshopLayerId <= 0) throw new Error('photoshopLayerId must be a positive safe integer.');
    const normalized = {
      ownershipKey: key,
      targetId: requireText(record.targetId, 'targetId', 128),
      familyId: requireText(record.familyId, 'familyId', 128),
      outputKind: requireText(record.outputKind, 'outputKind', 32).toUpperCase(),
      authoringLayerId: requireText(record.authoringLayerId, 'authoringLayerId', 128),
      photoshopLayerId: record.photoshopLayerId,
      documentId: record.documentId,
      layerName: String(record.layerName || ''),
      composite: normalizeCompositeMetadata(record.composite),
      updatedAtEpochMs: Date.now()
    };
    records.set(key, normalized);
    return { ...normalized, composite: { ...normalized.composite } };
  }
  function get(targetId, familyId, outputKind, authoringLayerId) {
    const record = records.get(ownedLayerKey(targetId, familyId, outputKind, authoringLayerId));
    return record ? { ...record, composite: { ...record.composite } } : null;
  }
  function listBinding(targetId, familyId, outputKind) {
    const bindingKey = ownedLayerBindingKey(targetId, familyId, outputKind);
    return [...records.values()].filter((record) => ownedLayerBindingKey(record.targetId, record.familyId, record.outputKind) === bindingKey).map((record) => ({ ...record, composite: { ...record.composite } }));
  }
  function registerGroup(targetId, familyId, outputKind, photoshopGroupLayerId) {
    if (!Number.isSafeInteger(photoshopGroupLayerId) || photoshopGroupLayerId <= 0) throw new Error('photoshopGroupLayerId must be a positive safe integer.');
    groups.set(ownedLayerBindingKey(targetId, familyId, outputKind), photoshopGroupLayerId);
    return photoshopGroupLayerId;
  }
  return Object.freeze({
    sessionId: registrySessionId, register, get, listBinding, registerGroup,
    getGroup: (targetId, familyId, outputKind) => groups.get(ownedLayerBindingKey(targetId, familyId, outputKind)) || null,
    snapshot: () => ({ scope: 'SESSION', sessionId: registrySessionId, records: [...records.values()].map((record) => ({ ...record, composite: { ...record.composite } })), groups: [...groups.entries()].map(([bindingKey, photoshopGroupLayerId]) => ({ bindingKey, photoshopGroupLayerId })) })
  });
}

module.exports = { SUPPORTED_COMPOSITE_MODES, normalizeCompositeMetadata, ownedLayerBindingKey, ownedLayerKey, createOwnedLayerRegistry };
