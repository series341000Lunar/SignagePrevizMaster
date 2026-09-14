import { getPlanarMappingProfile, PLANAR_OUTPUT_PROFILE } from './planar-mapping-profile.js';

export function validatePlanarOutput(output, familyId, revision) {
  const { width, height } = PLANAR_OUTPUT_PROFILE.outputResolution;
  if (!output || output.familyId !== familyId || output.sourceFamilyId !== familyId ||
      output.sourceMergedDirectRevision !== revision || output.width !== width || output.height !== height ||
      output.components !== 4 || output.componentSize !== 8 || output.pixelFormat !== 'RGBA' ||
      output.alpha !== 'STRAIGHT' || output.colorSpace !== 'SRGB' || output.orientation !== 'TOP_LEFT' ||
      !(output.bytes instanceof Uint8Array || output.bytes instanceof Uint8ClampedArray) ||
      output.bytes.length !== width * height * 4) {
    throw new Error(`PLANAR_OUTPUT_CONTRACT_ERROR: ${familyId} requires ${width}x${height} RGBA8 TOP_LEFT.`);
  }
  return output;
}

export async function encodePlanarPng(output, familyId, revision) {
  validatePlanarOutput(output, familyId, revision);
  const canvas = document.createElement('canvas');
  canvas.width = output.width;
  canvas.height = output.height;
  try {
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) throw new Error('PLANAR_PNG_CANVAS_UNAVAILABLE');
    const rgba = new Uint8ClampedArray(output.bytes.buffer, output.bytes.byteOffset, output.bytes.byteLength);
    context.putImageData(new ImageData(rgba, output.width, output.height), 0, 0);
    const blob = await new Promise((resolve, reject) => canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error('PLANAR_PNG_ENCODING_FAILED')),
      'image/png'
    ));
    return blob;
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
}

export class PlanarOutputWorkflow {
  constructor({ readSource, render, encodePng, isCurrent, releaseOutput = () => {}, onStale = () => {}, onChange = () => {} }) {
    this.readSource = readSource;
    this.render = render;
    this.encodePng = encodePng;
    this.isCurrent = isCurrent;
    this.releaseOutput = releaseOutput;
    this.onStale = onStale;
    this.onChange = onChange;
    this.families = new Map();
    this.generation = 0;
    this.job = null;
  }

  entry(familyId) {
    getPlanarMappingProfile(familyId);
    if (!this.families.has(familyId)) this.families.set(familyId, {
      familyId, sourceFamilyId: familyId, sourceMergedDirectRevision: null,
      status: 'UNAVAILABLE', output: null, error: '', generation: 0
    });
    return this.families.get(familyId);
  }

  state(familyId, { ready = false, revision = null } = {}) {
    const entry = this.entry(familyId);
    const current = ready && Number.isSafeInteger(revision) && revision >= 0;
    const status = !current ? 'UNAVAILABLE'
      : (entry.status === 'BAKING' && this.job?.familyId === familyId && this.job.revision === revision ? 'BAKING'
        : (entry.sourceMergedDirectRevision !== revision ? 'DIRTY' : entry.status));
    return { familyId, sourceFamilyId: familyId, sourceMergedDirectRevision: entry.sourceMergedDirectRevision,
      status: current && status === 'UNAVAILABLE' ? 'DIRTY' : status, error: entry.error };
  }

  invalidateFamily(familyId) {
    const entry = this.entry(familyId);
    entry.status = 'DIRTY';
    entry.error = '';
    entry.generation += 1;
    this.onChange();
  }

  reset() {
    this.generation += 1;
    for (const entry of this.families.values()) {
      if (entry.output) this.releaseOutput(entry.output);
    }
    this.families.clear();
    this.onChange();
  }

  readyOutput(familyId, revision) {
    const entry = this.entry(familyId);
    if (!this.isCurrent(familyId, revision) || entry.status !== 'READY' ||
        entry.sourceMergedDirectRevision !== revision || !entry.output) return null;
    return entry.output;
  }

  async bake(familyId, { ready, revision }) {
    const entry = this.entry(familyId);
    if (this.job) throw new Error('PLANAR_BAKE_BUSY');
    if (!ready || !Number.isSafeInteger(revision) || !this.isCurrent(familyId, revision)) {
      throw new Error('FULL_MERGE_REQUIRED: Run BAKE FULL MERGED for the current family first.');
    }
    const token = { familyId, revision, generation: this.generation, familyGeneration: entry.generation };
    this.job = token;
    entry.status = 'BAKING';
    entry.error = '';
    this.onChange();
    let input = null;
    let output = null;
    try {
      input = this.readSource(familyId, revision);
      output = await this.render(familyId, input, revision);
      input.bytes = null;
      validatePlanarOutput(output, familyId, revision);
      if (this.generation !== token.generation || entry.generation !== token.familyGeneration || !this.isCurrent(familyId, revision)) {
        this.onStale(familyId);
        return null;
      }
      const blob = await this.encodePng(output, familyId, revision);
      if (!(blob instanceof Blob) || blob.type !== 'image/png') throw new Error('PLANAR_PNG_ENCODING_FAILED');
      if (this.generation !== token.generation || entry.generation !== token.familyGeneration || !this.isCurrent(familyId, revision)) {
        this.onStale(familyId);
        return null;
      }
      const prior = entry.output;
      entry.output = { blob, familyId, sourceFamilyId: familyId, sourceMergedDirectRevision: revision,
        width: output.width, height: output.height };
      entry.sourceMergedDirectRevision = revision;
      entry.status = 'READY';
      if (prior) this.releaseOutput(prior);
      return entry.output;
    } catch (error) {
      if (this.generation === token.generation && entry.generation === token.familyGeneration) {
        if (entry.output) this.releaseOutput(entry.output);
        entry.output = null;
        entry.sourceMergedDirectRevision = revision;
        entry.status = 'ERROR';
        entry.error = String(error.message || error);
      }
      throw error;
    } finally {
      if (input) input.bytes = null;
      if (output) output.bytes = null;
      if (this.job === token) this.job = null;
      if (entry.status === 'BAKING') entry.status = 'DIRTY';
      this.onChange();
    }
  }
}
