import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getPlanarMappingProfile, PLANAR_CANONICAL } from './planar-mapping-profile.js';

const PIXEL_COUNT = PLANAR_CANONICAL.width * PLANAR_CANONICAL.height * 4;

export function createPlanarBakerCamera() {
  const camera = new THREE.PerspectiveCamera(10, PLANAR_CANONICAL.width / PLANAR_CANONICAL.height, 0.01, 10000);
  camera.position.set(0, 342.9015690828403, 0);
  camera.rotation.order = 'XYZ';
  camera.rotation.set(-Math.PI / 2, 0, 0);
  camera.updateMatrixWorld(true);
  return camera;
}

export function validatePlanarCanonicalInput(input, familyId) {
  getPlanarMappingProfile(familyId);
  if (!input || input.familyId !== familyId || input.outputKind !== 'CANONICAL' ||
      input.width !== PLANAR_CANONICAL.width || input.height !== PLANAR_CANONICAL.height ||
      input.components !== 4 || input.componentSize !== 8 || input.pixelFormat !== 'RGBA' || input.colorSpace !== 'RGB' ||
      input.alpha !== 'STRAIGHT' || input.orientation !== 'TOP_LEFT' ||
      !(input.bytes instanceof Uint8Array || input.bytes instanceof Uint8ClampedArray) ||
      input.bytes.length !== PIXEL_COUNT) {
    throw new Error(`PLANAR_CANONICAL_CONTRACT_ERROR: ${familyId} requires current-family 4728x5760 RGBA8 STRAIGHT TOP_LEFT Full Merge CANONICAL.`);
  }
  return input;
}

// The caller must provide the current-family merged revision and ready state.
// This is deliberately the only production Full Merge read boundary for Planar-A.
export function readPlanarCanonical(fullMergeRuntime, familyId, { ready, revision } = {}) {
  getPlanarMappingProfile(familyId);
  if (ready !== true || !Number.isSafeInteger(revision) || revision < 0 ||
      !fullMergeRuntime?.hasOutputs?.(familyId)) {
    throw new Error(`PLANAR_CANONICAL_NOT_READY: ${familyId}`);
  }
  return {
    ...validatePlanarCanonicalInput(fullMergeRuntime.readOutputRgba(familyId, 'CANONICAL'), familyId),
    sourceCanonicalRevision: revision
  };
}

export function createPlanarInputTexture(input, familyId) {
  validatePlanarCanonicalInput(input, familyId);
  // ImageData / CanvasTexture has the same image-source UV convention as the
  // oracle TextureLoader path. The source bytes and canvas rows are TOP_LEFT.
  const canvas = document.createElement('canvas');
  canvas.width = input.width;
  canvas.height = input.height;
  const context = canvas.getContext('2d', { alpha: true, willReadFrequently: false });
  if (!context) throw new Error('PLANAR_CANVAS_UNAVAILABLE');
  context.putImageData(new ImageData(new Uint8ClampedArray(input.bytes), input.width, input.height), 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.premultiplyAlpha = false;
  texture.center.set(0.5, 0.5);
  texture.offset.set(0, 0);
  texture.repeat.set(1, 1);
  texture.rotation = 0;
  texture.needsUpdate = true;
  return {
    texture,
    dispose() {
      texture.dispose();
      canvas.width = 1;
      canvas.height = 1;
    }
  };
}

export function createPlanarSurfaceMaterial(texture) {
  return new THREE.MeshBasicMaterial({
    color: 0xffffff, map: texture, side: THREE.DoubleSide,
    transparent: true, depthTest: true, depthWrite: true, toneMapped: false
  });
}

function saveRenderer(renderer) {
  return {
    target: renderer.getRenderTarget(),
    viewport: renderer.getViewport(new THREE.Vector4()),
    scissor: renderer.getScissor(new THREE.Vector4()),
    scissorTest: renderer.getScissorTest(),
    clearColor: renderer.getClearColor(new THREE.Color()),
    clearAlpha: renderer.getClearAlpha(),
    pixelRatio: renderer.getPixelRatio(),
    toneMapping: renderer.toneMapping,
    outputColorSpace: renderer.outputColorSpace,
    autoClear: renderer.autoClear,
    xrEnabled: renderer.xr.enabled
  };
}

function restoreRenderer(renderer, prior) {
  renderer.setPixelRatio(prior.pixelRatio);
  renderer.setRenderTarget(prior.target);
  renderer.setViewport(prior.viewport);
  renderer.setScissor(prior.scissor);
  renderer.setScissorTest(prior.scissorTest);
  renderer.setClearColor(prior.clearColor, prior.clearAlpha);
  renderer.toneMapping = prior.toneMapping;
  renderer.outputColorSpace = prior.outputColorSpace;
  renderer.autoClear = prior.autoClear;
  renderer.xr.enabled = prior.xrEnabled;
}

function flipReadbackToTopLeft(bytes, width, height) {
  const rowSize = width * 4;
  const row = new Uint8Array(rowSize);
  for (let top = 0; top < Math.floor(height / 2); top += 1) {
    const bottom = height - top - 1;
    const a = top * rowSize;
    const b = bottom * rowSize;
    row.set(bytes.subarray(a, a + rowSize));
    bytes.copyWithin(a, b, b + rowSize);
    bytes.set(row, b);
  }
  return bytes;
}

const SRGB_TO_LINEAR = Float32Array.from({ length: 256 }, (_, value) => {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
});

function unpremultiplySrgbReadback(bytes) {
  // WebGL blends the transparent MeshBasicMaterial against the clear target
  // in linear light. Its sRGB readback is therefore premultiplied in linear
  // light even though the Canonical input was straight. Undo exactly here,
  // once, before handing the output to a straight-alpha PNG/Photoshop path.
  for (let offset = 0; offset < bytes.length; offset += 4) {
    const alpha = bytes[offset + 3];
    if (alpha === 0 || alpha === 255) continue;
    const a = alpha / 255;
    for (let channel = 0; channel < 3; channel += 1) {
      const linear = Math.min(1, SRGB_TO_LINEAR[bytes[offset + channel]] / a);
      const srgb = linear <= 0.0031308 ? linear * 12.92 : 1.055 * (linear ** (1 / 2.4)) - 0.055;
      bytes[offset + channel] = Math.round(Math.max(0, Math.min(1, srgb)) * 255);
    }
  }
  return bytes;
}

function disposeGlb(gltf) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  gltf?.scene?.traverse((object) => {
    if (object.isMesh) {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
        if (!material) continue;
        materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      }
    }
  });
  for (const texture of textures) {
    texture.dispose();
    texture.image?.close?.();
  }
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

export class PlanarMappingRuntime {
  constructor(renderer, { loader = new GLTFLoader() } = {}) {
    if (!renderer) throw new Error('PLANAR_RENDERER_REQUIRED');
    this.renderer = renderer;
    this.loader = loader;
    this.states = new Map();
  }

  state(familyId) {
    getPlanarMappingProfile(familyId);
    return { ...(this.states.get(familyId) || { familyId, sourceCanonicalRevision: null, status: 'UNAVAILABLE' }) };
  }

  markCanonicalRevision(familyId, revision) {
    getPlanarMappingProfile(familyId);
    if (!Number.isSafeInteger(revision) || revision < 0) throw new Error('PLANAR_REVISION_INVALID');
    const prior = this.state(familyId);
    if (prior.sourceCanonicalRevision !== revision || prior.status === 'UNAVAILABLE') {
      this.states.set(familyId, { familyId, sourceCanonicalRevision: revision, status: 'DIRTY' });
    }
    return this.state(familyId);
  }

  invalidateFamily(familyId) {
    const prior = this.state(familyId);
    this.states.set(familyId, {
      familyId,
      sourceCanonicalRevision: prior.sourceCanonicalRevision,
      status: prior.sourceCanonicalRevision === null ? 'UNAVAILABLE' : 'DIRTY'
    });
    return this.state(familyId);
  }

  async render(familyId, input, { sourceCanonicalRevision, width = PLANAR_CANONICAL.width, height = PLANAR_CANONICAL.height } = {}) {
    const profile = getPlanarMappingProfile(familyId);
    validatePlanarCanonicalInput(input, familyId);
    if (!Number.isSafeInteger(sourceCanonicalRevision) || sourceCanonicalRevision < 0 ||
        (input.sourceCanonicalRevision !== undefined && input.sourceCanonicalRevision !== sourceCanonicalRevision)) {
      throw new Error('PLANAR_REVISION_INVALID');
    }
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
        width > PLANAR_CANONICAL.width || height > PLANAR_CANONICAL.height ||
        width / height !== PLANAR_CANONICAL.width / PLANAR_CANONICAL.height) {
      throw new Error('PLANAR_OUTPUT_DIMENSIONS_INVALID');
    }
    this.markCanonicalRevision(familyId, sourceCanonicalRevision);
    let gltf = null;
    let surfaceMaterial = null;
    let sourceMaterial = null;
    let inputTexture = null;
    let target = null;
    const prior = saveRenderer(this.renderer);
    try {
      try {
        gltf = await this.loader.loadAsync(profile.runtimeUrl);
      } catch (error) {
        throw new Error(`PLANAR_ASSET_CONTRACT_ERROR: ${familyId} failed to load ${profile.runtimeUrl}: ${error.message || error}`);
      }
      if (!gltf?.scene) throw new Error(`PLANAR_ASSET_CONTRACT_ERROR: ${familyId} GLB scene is missing.`);
      const matches = [];
      gltf.scene.traverse((node) => { if (node.name === profile.targetNode) matches.push(node); });
      if (matches.length !== 1 || !matches[0].isMesh) {
        throw new Error(`PLANAR_ASSET_CONTRACT_ERROR: ${familyId} requires exact mesh ${profile.targetNode}.`);
      }
      const targetNode = matches[0];
      if (!targetNode.geometry?.getAttribute('uv')) {
        throw new Error(`PLANAR_ASSET_CONTRACT_ERROR: ${familyId} target mesh has no TEXCOORD_0.`);
      }
      // Only the exact target mesh participates; embedded GLB materials never
      // supply the Planar input. Keep the GLB node transform and UV untouched.
      gltf.scene.traverse((node) => { if (node.isMesh && node !== targetNode) node.visible = false; });
      sourceMaterial = targetNode.material;
      inputTexture = createPlanarInputTexture(input, familyId);
      surfaceMaterial = createPlanarSurfaceMaterial(inputTexture.texture);
      const textureContract = {
        srgb: inputTexture.texture.colorSpace === THREE.SRGBColorSpace,
        flipYFalse: inputTexture.texture.flipY === false,
        linearFilters: inputTexture.texture.minFilter === THREE.LinearFilter && inputTexture.texture.magFilter === THREE.LinearFilter,
        clampWrap: inputTexture.texture.wrapS === THREE.ClampToEdgeWrapping && inputTexture.texture.wrapT === THREE.ClampToEdgeWrapping,
        identityUvTransform: inputTexture.texture.offset.x === 0 && inputTexture.texture.offset.y === 0 &&
          inputTexture.texture.repeat.x === 1 && inputTexture.texture.repeat.y === 1 && inputTexture.texture.rotation === 0,
        unlitBasic: surfaceMaterial.isMeshBasicMaterial === true && surfaceMaterial.color.getHex() === 0xffffff &&
          surfaceMaterial.side === THREE.DoubleSide && surfaceMaterial.transparent === true &&
          surfaceMaterial.depthTest === true && surfaceMaterial.depthWrite === true && surfaceMaterial.toneMapped === false
      };
      targetNode.material = surfaceMaterial;
      target = new THREE.WebGLRenderTarget(width, height, {
        format: THREE.RGBAFormat, type: THREE.UnsignedByteType,
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        depthBuffer: true, stencilBuffer: false, generateMipmaps: false
      });
      target.texture.colorSpace = THREE.SRGBColorSpace;
      this.renderer.setPixelRatio(1);
      this.renderer.toneMapping = THREE.NoToneMapping;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.xr.enabled = false;
      this.renderer.autoClear = true;
      this.renderer.setRenderTarget(target);
      this.renderer.setViewport(0, 0, width, height);
      this.renderer.setScissorTest(false);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.clear(true, true, false);
      this.renderer.render(gltf.scene, createPlanarBakerCamera());
      const bytes = new Uint8Array(width * height * 4);
      this.renderer.readRenderTargetPixels(target, 0, 0, width, height, bytes);
      unpremultiplySrgbReadback(bytes);
      flipReadbackToTopLeft(bytes, width, height);
      this.states.set(familyId, { familyId, sourceCanonicalRevision, status: 'READY' });
      return {
        bytes, width, height, components: 4, componentSize: 8,
        pixelFormat: 'RGBA', alpha: 'STRAIGHT', colorSpace: 'SRGB',
        orientation: 'TOP_LEFT', familyId, sourceCanonicalRevision, textureContract
      };
    } catch (error) {
      this.states.set(familyId, { familyId, sourceCanonicalRevision, status: 'ERROR', error: String(error.message || error) });
      throw error;
    } finally {
      restoreRenderer(this.renderer, prior);
      target?.dispose();
      if (gltf) {
        if (surfaceMaterial) {
          const matches = [];
          gltf.scene.traverse((node) => { if (node.name === profile.targetNode) matches.push(node); });
          if (matches.length === 1) matches[0].material = sourceMaterial;
        }
        disposeGlb(gltf);
      }
      surfaceMaterial?.dispose();
      inputTexture?.dispose();
    }
  }

  disposeAll() {
    this.states.clear();
  }
}
