'use strict';

const FRONT = 'ANAMORPHIC_FRONT_75F';
const BACK = 'ANAMORPHIC_BACK';
const PROFILES = Object.freeze({
  [`${FRONT}:DIRECT`]: Object.freeze({ familyId: FRONT, outputKind: 'DIRECT', width: 3000, height: 3840, label: 'FRONT75 DIRECT' }),
  [`${BACK}:DIRECT`]: Object.freeze({ familyId: BACK, outputKind: 'DIRECT', width: 2100, height: 3840, label: 'BACK DIRECT' }),
  [`${FRONT}:CANONICAL`]: Object.freeze({ familyId: FRONT, outputKind: 'CANONICAL', width: 4728, height: 5760, label: 'FRONT75 CANONICAL' }),
  [`${BACK}:CANONICAL`]: Object.freeze({ familyId: BACK, outputKind: 'CANONICAL', width: 4728, height: 5760, label: 'BACK CANONICAL' })
});

function targetSpec(familyId, outputKind) {
  return PROFILES[`${familyId}:${outputKind}`] || null;
}

function validateCreatedDocument(spec, createdId, actual) {
  if (!Number.isSafeInteger(createdId) || createdId <= 0 || !actual || actual.documentId !== createdId) {
    throw new Error('Created Photoshop document ID is unavailable or changed.');
  }
  if (actual.width !== spec.width || actual.height !== spec.height || actual.documentMode !== 'RGB' || actual.documentDepth !== 8) {
    throw new Error(`Expected ${spec.width} × ${spec.height} RGB8; received ${actual.width} × ${actual.height} ${actual.documentMode}${actual.documentDepth}.`);
  }
  if (actual.colorProfileName !== 'sRGB IEC61966-2.1') {
    throw new Error(`Expected sRGB IEC61966-2.1; received ${actual.colorProfileName || 'unknown profile'}.`);
  }
  if (actual.hasBackgroundLayer !== false) {
    throw new Error('Created document is not confirmed transparent (Background layer present or unknown).');
  }
}

function isUsableReady(spec, resolved) {
  return resolved.status === 'READY' && resolved.target.width === spec.width && resolved.target.height === spec.height &&
    resolved.target.documentMode === 'RGB' && resolved.target.documentDepth === 8;
}

function createTargetQuickCreate({ registry, createDocument, readDocumentById, confirmContext = () => true, onChange = () => {} }) {
  const inFlight = new Set();
  const results = new Map();

  function status(familyId, outputKind) {
    const spec = targetSpec(familyId, outputKind);
    if (!spec) return { status: 'FAMILY CONTEXT REQUIRED' };
    const key = `${familyId}:${outputKind}`;
    const resolved = registry.resolve(familyId, outputKind, readDocumentById);
    if (isUsableReady(spec, resolved)) return { status: 'READY', documentName: resolved.target.documentName };
    if (inFlight.has(key)) return { status: 'CREATING' };
    if (results.has(key)) return results.get(key);
    if (resolved.status === 'READY') return { status: 'TARGET UNAVAILABLE', detail: 'REGISTERED DOCUMENT DOES NOT MATCH TARGET SPEC' };
    if (resolved.status !== 'UNBOUND') return { status: 'TARGET UNAVAILABLE', detail: resolved.status };
    return { status: 'NO TARGET' };
  }

  async function run(familyId, outputKind) {
    const spec = targetSpec(familyId, outputKind);
    if (!spec) return { status: 'FAMILY CONTEXT REQUIRED' };
    const key = `${familyId}:${outputKind}`;
    if (inFlight.has(key)) return { status: 'CREATING' };
    if (isUsableReady(spec, registry.resolve(familyId, outputKind, readDocumentById))) return status(familyId, outputKind);
    inFlight.add(key);
    results.set(key, { status: 'CREATING' });
    onChange();
    let createdId = null;
    try {
      let created;
      try {
        created = await createDocument(spec);
        createdId = created?.id;
      } catch (error) {
        results.set(key, { status: 'CREATE FAILED', detail: error.message || String(error) });
        return results.get(key);
      }
      let documentSnapshot;
      try {
        const actual = await readDocumentById(createdId);
        validateCreatedDocument(spec, createdId, actual);
        if (!confirmContext(spec)) throw new Error('Active Family changed before Canonical registration. Document remains open; register it manually if desired.');
        if (isUsableReady(spec, registry.resolve(familyId, outputKind, readDocumentById))) {
          throw new Error('Another target became READY before registration. Created document remains open; existing binding was preserved.');
        }
        const { colorProfileName, hasBackgroundLayer, ...validatedSnapshot } = actual;
        documentSnapshot = validatedSnapshot;
      } catch (error) {
        results.set(key, { status: 'REGISTRATION REFUSED', detail: error.message || String(error), createdId });
        return results.get(key);
      }
      try {
        registry.addTarget({ label: spec.label, documentSnapshot, familyId, outputKind });
        const registered = registry.resolve(familyId, outputKind, readDocumentById);
        if (!isUsableReady(spec, registered) || registered.target.documentId !== createdId) throw new Error('Target Registry did not confirm the created document as READY.');
        results.delete(key);
        return { status: 'READY', documentName: registered.target.documentName };
      } catch (error) {
        results.set(key, { status: 'REGISTRATION FAILED', detail: error.message || String(error), createdId });
        return results.get(key);
      }
    } finally {
      inFlight.delete(key);
      onChange();
    }
  }

  return Object.freeze({ run, status });
}

module.exports = { FRONT, BACK, targetSpec, validateCreatedDocument, createTargetQuickCreate };
