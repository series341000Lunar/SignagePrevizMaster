'use strict';

const SUPPORTED_OUTPUT_KINDS = new Set(['DIRECT', 'CANONICAL']);

function requireText(value, name, maxLength = 256) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new Error(`${name} must be a non-empty string of at most ${maxLength} characters.`);
  }
  return value.trim();
}

function requireDocumentSnapshot(documentSnapshot) {
  const snapshot = { ...documentSnapshot };
  for (const field of ['documentId', 'width', 'height']) {
    if (!Number.isSafeInteger(snapshot[field]) || snapshot[field] <= 0) {
      throw new Error(`${field} must be a positive safe integer.`);
    }
  }
  snapshot.documentName = requireText(snapshot.documentName, 'documentName');
  snapshot.documentMode = requireText(snapshot.documentMode, 'documentMode', 32);
  if (!(snapshot.documentDepth === 8 || typeof snapshot.documentDepth === 'string')) {
    throw new Error('documentDepth must be 8 or a descriptive string.');
  }
  return snapshot;
}

function bakeTargetBindingKey(familyId, outputKind) {
  const family = requireText(familyId, 'familyId', 128);
  const output = requireText(outputKind, 'outputKind', 32).toUpperCase();
  if (!SUPPORTED_OUTPUT_KINDS.has(output)) throw new Error('outputKind must be DIRECT or CANONICAL.');
  return `${family}:${output}`;
}

function targetFailure(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function createBakeTargetRegistry({ sessionId }) {
  const registrySessionId = requireText(sessionId, 'sessionId', 128);
  const targets = new Map();
  const bindings = new Map();
  let nextTargetOrdinal = 1;

  function targetStatus(targetId, findDocument) {
    const target = targets.get(targetId);
    if (!target) return { status: 'NOT_FOUND', targetId };
    const open = typeof findDocument === 'function' ? findDocument(target.documentId) : null;
    if (!open) return { ...target, status: 'CLOSED' };
    const snapshot = requireDocumentSnapshot(open);
    if (snapshot.documentName !== target.documentName) return { ...target, status: 'IDENTITY_CHANGED' };
    if (snapshot.width !== target.width || snapshot.height !== target.height) return { ...target, status: 'DIMENSION_CHANGED' };
    if (snapshot.documentMode !== target.documentMode) return { ...target, status: 'MODE_CHANGED' };
    if (snapshot.documentDepth !== target.documentDepth) return { ...target, status: 'DEPTH_CHANGED' };
    return { ...target, status: 'READY' };
  }

  function bind(targetId, familyId, outputKind) {
    if (!targets.has(targetId)) throw new Error(`Unknown targetId: ${targetId}`);
    const key = bakeTargetBindingKey(familyId, outputKind);
    bindings.set(key, {
      bindingKey: key,
      familyId: requireText(familyId, 'familyId', 128),
      outputKind: requireText(outputKind, 'outputKind', 32).toUpperCase(),
      targetId
    });
    return { ...bindings.get(key) };
  }

  function addTarget({ label, documentSnapshot, familyId, outputKind }) {
    const targetId = `target-${nextTargetOrdinal++}`;
    const document = requireDocumentSnapshot(documentSnapshot);
    targets.set(targetId, {
      targetId,
      label: requireText(label, 'label', 128),
      ...document,
      registeredAtEpochMs: Date.now()
    });
    bind(targetId, familyId, outputKind);
    return { ...targets.get(targetId) };
  }

  function replaceDocument(targetId, documentSnapshot) {
    const current = targets.get(targetId);
    if (!current) throw new Error(`Unknown targetId: ${targetId}`);
    const document = requireDocumentSnapshot(documentSnapshot);
    targets.set(targetId, {
      ...current,
      ...document,
      registeredAtEpochMs: Date.now()
    });
    return { ...targets.get(targetId) };
  }

  function renameTarget(targetId, label) {
    const current = targets.get(targetId);
    if (!current) throw new Error(`Unknown targetId: ${targetId}`);
    current.label = requireText(label, 'label', 128);
    return { ...current };
  }

  function clearTarget(targetId) {
    if (!targets.delete(targetId)) return false;
    for (const [key, binding] of bindings) {
      if (binding.targetId === targetId) bindings.delete(key);
    }
    return true;
  }

  function resolve(familyId, outputKind, findDocument) {
    const key = bakeTargetBindingKey(familyId, outputKind);
    const binding = bindings.get(key);
    if (!binding) return { status: 'UNBOUND', bindingKey: key, binding: null, target: null };
    const target = targetStatus(binding.targetId, findDocument);
    return {
      status: target.status,
      bindingKey: key,
      binding: { ...binding },
      target
    };
  }

  function validateJobTarget(message, findDocument) {
    if (message.targetSessionId !== registrySessionId) {
      throw targetFailure('TARGET_SESSION_MISMATCH', 'Bake Target belongs to a different UXP session.');
    }
    const resolution = resolve(message.familyId, message.outputKind, findDocument);
    if (!resolution.binding) throw targetFailure('TARGET_BINDING_NOT_FOUND', `No Bake Target is assigned to ${resolution.bindingKey}.`);
    if (resolution.binding.targetId !== message.targetId) throw targetFailure('TARGET_BINDING_MISMATCH', 'familyId/outputKind binding does not match targetId.');
    const target = resolution.target;
    if (target.status === 'NOT_FOUND') throw targetFailure('TARGET_NOT_FOUND', `Target ${message.targetId} is not registered.`);
    if (target.status === 'CLOSED') throw targetFailure('TARGET_CLOSED', `Target ${message.targetId} is closed.`);
    if (target.status === 'DIMENSION_CHANGED') throw targetFailure('TARGET_DIMENSION_MISMATCH', 'Registered Target dimensions changed.');
    if (target.status === 'MODE_CHANGED' || target.status === 'DEPTH_CHANGED') {
      throw targetFailure('TARGET_UNSUPPORTED', 'Registered Target mode or depth changed.');
    }
    if (target.status !== 'READY') throw targetFailure('TARGET_CHANGED', `Bake Target is ${target.status}.`);
    if (target.documentId !== message.targetDocumentId) throw targetFailure('TARGET_IDENTITY_MISMATCH', 'Bake Target identity does not match the request.');
    if (target.width !== message.width || target.height !== message.height) {
      throw targetFailure('TARGET_DIMENSION_MISMATCH', `Target is ${target.width} × ${target.height}; output is ${message.width} × ${message.height}.`);
    }
    if (target.documentMode !== 'RGB' || target.documentDepth !== 8) {
      throw targetFailure('TARGET_UNSUPPORTED', 'Block 7 requires an RGB 8-bit Bake Target.');
    }
    return target;
  }

  function snapshot(findDocument) {
    return {
      registryAuthority: 'UXP',
      scope: 'SESSION',
      sessionId: registrySessionId,
      targets: Array.from(targets.keys(), (targetId) => targetStatus(targetId, findDocument)),
      bindings: Array.from(bindings.values(), (binding) => ({ ...binding }))
    };
  }

  return Object.freeze({
    sessionId: registrySessionId,
    addTarget,
    replaceDocument,
    renameTarget,
    clearTarget,
    bind,
    resolve,
    validateJobTarget,
    snapshot,
    targetStatus,
    getTarget: (targetId) => targets.has(targetId) ? { ...targets.get(targetId) } : null,
    size: () => targets.size
  });
}

module.exports = {
  SUPPORTED_OUTPUT_KINDS,
  bakeTargetBindingKey,
  createBakeTargetRegistry
};
