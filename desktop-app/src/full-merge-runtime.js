import * as THREE from 'three';

export const FULL_MERGE_BLEND_MODES = Object.freeze(['NORMAL', 'MULTIPLY', 'SCREEN', 'LINEAR_DODGE']);

const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));

export function blendRgb(backdrop, source, blendMode) {
  const mode = String(blendMode || 'NORMAL').toUpperCase();
  if (!FULL_MERGE_BLEND_MODES.includes(mode)) throw new Error(`Unsupported Full Merge blend mode: ${blendMode}`);
  return backdrop.map((backdropChannel, index) => {
    const sourceChannel = source[index];
    if (mode === 'MULTIPLY') return backdropChannel * sourceChannel;
    if (mode === 'SCREEN') return backdropChannel + sourceChannel - backdropChannel * sourceChannel;
    if (mode === 'LINEAR_DODGE') return clamp01(backdropChannel + sourceChannel);
    return sourceChannel;
  });
}

export function compositeStraightRgba(backdrop, source, opacity = 1, blendMode = 'NORMAL') {
  const cb = backdrop.slice(0, 3).map(clamp01);
  const cs = source.slice(0, 3).map(clamp01);
  const ab = clamp01(backdrop[3]);
  const as = clamp01(source[3]) * clamp01(opacity);
  const blended = blendRgb(cb, cs, blendMode);
  const ao = as + ab - as * ab;
  if (ao <= 0) return [0, 0, 0, 0];
  const rgb = cb.map((channel, index) => (
    ((1 - as) * channel * ab) +
    ((1 - ab) * cs[index] * as) +
    (as * ab * blended[index])
  ) / ao);
  return [...rgb.map(clamp01), clamp01(ao)];
}

export function mergeRgbaLayers(layers, pixelCount = null) {
  const visible = (layers || []).filter((layer) => layer.visible !== false);
  const resolvedPixelCount = pixelCount ?? (visible[0]?.pixels?.length || 0) / 4;
  const output = new Uint8ClampedArray(Math.max(0, resolvedPixelCount) * 4);
  for (const layer of visible) {
    if (!(layer.pixels instanceof Uint8Array || layer.pixels instanceof Uint8ClampedArray) || layer.pixels.length !== output.length) {
      throw new Error('Every Full Merge layer must provide an equally sized RGBA8 buffer.');
    }
    for (let offset = 0; offset < output.length; offset += 4) {
      const backdrop = [output[offset] / 255, output[offset + 1] / 255, output[offset + 2] / 255, output[offset + 3] / 255];
      const source = [layer.pixels[offset] / 255, layer.pixels[offset + 1] / 255, layer.pixels[offset + 2] / 255, layer.pixels[offset + 3] / 255];
      const composite = compositeStraightRgba(backdrop, source, layer.opacity, layer.blendMode);
      output[offset] = Math.round(composite[0] * 255);
      output[offset + 1] = Math.round(composite[1] * 255);
      output[offset + 2] = Math.round(composite[2] * 255);
      output[offset + 3] = Math.round(composite[3] * 255);
    }
  }
  return output;
}

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const fragmentShader = `
precision highp float;
varying vec2 vUv;
uniform sampler2D backdropTexture;
uniform sampler2D sourceTexture;
uniform float sourceOpacity;
uniform int blendMode;

vec3 blendColor(vec3 backdrop, vec3 source) {
  if (blendMode == 1) return backdrop * source;
  if (blendMode == 2) return backdrop + source - backdrop * source;
  if (blendMode == 3) return clamp(backdrop + source, 0.0, 1.0);
  return source;
}

void main() {
  vec4 backdrop = texture2D(backdropTexture, vUv);
  vec4 source = texture2D(sourceTexture, vUv);
  float As = source.a * sourceOpacity;
  float Ab = backdrop.a;
  float Ao = As + Ab - As * Ab;
  if (Ao <= 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec3 blended = blendColor(backdrop.rgb, source.rgb);
  vec3 premultiplied = (1.0 - As) * backdrop.rgb * Ab
    + (1.0 - Ab) * source.rgb * As
    + As * Ab * blended;
  gl_FragColor = vec4(premultiplied / Ao, Ao);
}`;

function makeTarget(width, height) {
  const target = new THREE.WebGLRenderTarget(width, height, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
    depthBuffer: false,
    stencilBuffer: false
  });
  target.texture.colorSpace = THREE.NoColorSpace;
  return target;
}

function snapshotRenderer(renderer) {
  return {
    target: renderer.getRenderTarget(),
    clearColor: renderer.getClearColor(new THREE.Color()),
    clearAlpha: renderer.getClearAlpha(),
    viewport: renderer.getViewport(new THREE.Vector4()),
    scissor: renderer.getScissor(new THREE.Vector4()),
    scissorTest: renderer.getScissorTest(),
    toneMapping: renderer.toneMapping,
    outputColorSpace: renderer.outputColorSpace,
    autoClear: renderer.autoClear,
    xrEnabled: renderer.xr.enabled,
    pixelRatio: renderer.getPixelRatio()
  };
}

function restoreRenderer(renderer, snapshot) {
  renderer.setPixelRatio(snapshot.pixelRatio);
  renderer.setRenderTarget(snapshot.target);
  renderer.setClearColor(snapshot.clearColor, snapshot.clearAlpha);
  renderer.setViewport(snapshot.viewport);
  renderer.setScissor(snapshot.scissor);
  renderer.setScissorTest(snapshot.scissorTest);
  renderer.toneMapping = snapshot.toneMapping;
  renderer.outputColorSpace = snapshot.outputColorSpace;
  renderer.autoClear = snapshot.autoClear;
  renderer.xr.enabled = snapshot.xrEnabled;
}

function clearTarget(renderer, target) {
  const previous = snapshotRenderer(renderer);
  try {
    renderer.setPixelRatio(1);
    renderer.xr.enabled = false;
    renderer.autoClear = false;
    renderer.setScissorTest(false);
    renderer.setRenderTarget(target);
    renderer.setViewport(0, 0, target.width, target.height);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
  } finally {
    restoreRenderer(renderer, previous);
  }
}

function readTargetTopLeft(renderer, target) {
  const pixels = new Uint8Array(target.width * target.height * 4);
  renderer.readRenderTargetPixels(target, 0, 0, target.width, target.height, pixels);
  const rowBytes = target.width * 4;
  const swap = new Uint8Array(rowBytes);
  for (let top = 0; top < Math.floor(target.height / 2); top += 1) {
    const bottom = target.height - 1 - top;
    const a = top * rowBytes;
    const b = bottom * rowBytes;
    swap.set(pixels.subarray(a, a + rowBytes));
    pixels.copyWithin(a, b, b + rowBytes);
    pixels.set(swap, b);
  }
  return pixels;
}

function targetToTopLeftCanvas(renderer, target) {
  const pixels = readTargetTopLeft(renderer, target);
  const canvas = document.createElement('canvas');
  canvas.width = target.width;
  canvas.height = target.height;
  const image = new ImageData(new Uint8ClampedArray(pixels.buffer), target.width, target.height);
  canvas.getContext('2d', { alpha: true }).putImageData(image, 0, 0);
  return canvas;
}

function drawTargetPreview(renderer, target, canvas, previewWidth = 320) {
  const full = targetToTopLeftCanvas(renderer, target);
  try {
    canvas.width = previewWidth;
    canvas.height = Math.max(1, Math.round(previewWidth * target.height / target.width));
    const context = canvas.getContext('2d', { alpha: true });
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(full, 0, 0, canvas.width, canvas.height);
  } finally {
    full.width = 1;
    full.height = 1;
  }
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('Merged PNG encoding returned no data.')),
    'image/png'
  ));
}

function blendModeIndex(blendMode) {
  const index = FULL_MERGE_BLEND_MODES.indexOf(String(blendMode || 'NORMAL').toUpperCase());
  if (index < 0) throw new Error(`Unsupported Full Merge blend mode: ${blendMode}`);
  return index;
}

export class FullMergeAccumulatorRuntime {
  constructor(renderer) {
    this.renderer = renderer;
    this.results = new Map();
    this.runCount = 0;
    this.disposeCount = 0;
  }

  begin(profile) {
    if (!profile?.familyId || !profile.workingResolution || !profile.canonicalResolution) {
      throw new Error('Full Merge requires a valid Projection Bake profile.');
    }
    const direct = [
      makeTarget(profile.workingResolution.width, profile.workingResolution.height),
      makeTarget(profile.workingResolution.width, profile.workingResolution.height)
    ];
    const canonical = [
      makeTarget(profile.canonicalResolution.width, profile.canonicalResolution.height),
      makeTarget(profile.canonicalResolution.width, profile.canonicalResolution.height)
    ];
    for (const target of [...direct, ...canonical]) clearTarget(this.renderer, target);
    const uniforms = {
      backdropTexture: { value: direct[0].texture },
      sourceTexture: { value: direct[0].texture },
      sourceOpacity: { value: 1 },
      blendMode: { value: 0 }
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: false,
      blending: THREE.NoBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    const geometry = new THREE.PlaneGeometry(2, 2);
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(geometry, material));
    const camera = new THREE.Camera();
    const renderer = this.renderer;
    let activeIndex = 0;
    let layerCount = 0;
    let completed = false;

    const compositeTarget = (targets, sourceTarget) => {
      const nextIndex = 1 - activeIndex;
      const destination = targets[nextIndex];
      const previous = snapshotRenderer(renderer);
      try {
        uniforms.backdropTexture.value = targets[activeIndex].texture;
        uniforms.sourceTexture.value = sourceTarget.texture;
        renderer.setPixelRatio(1);
        renderer.xr.enabled = false;
        renderer.autoClear = false;
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
        renderer.setScissorTest(false);
        renderer.setRenderTarget(destination);
        renderer.setViewport(0, 0, destination.width, destination.height);
        renderer.setClearColor(0x000000, 0);
        renderer.clear(true, false, false);
        renderer.render(scene, camera);
      } finally {
        restoreRenderer(renderer, previous);
      }
    };

    const disposePending = () => {
      if (completed) return;
      completed = true;
      for (const target of [...direct, ...canonical]) target.dispose();
      material.dispose();
      geometry.dispose();
    };

    return {
      addLayer: ({ directTarget, canonicalTarget, opacity, blendMode }) => {
        if (completed) throw new Error('Full Merge accumulator run is already complete.');
        if (!directTarget || !canonicalTarget) throw new Error('Full Merge requires Direct and Canonical projected layer targets.');
        uniforms.sourceOpacity.value = clamp01(opacity);
        uniforms.blendMode.value = blendModeIndex(blendMode);
        compositeTarget(direct, directTarget);
        compositeTarget(canonical, canonicalTarget);
        activeIndex = 1 - activeIndex;
        layerCount += 1;
      },
      finish: (metadata = {}) => {
        if (completed) throw new Error('Full Merge accumulator run is already complete.');
        completed = true;
        const result = {
          ...metadata,
          familyId: profile.familyId,
          profileId: profile.id,
          layerCount,
          directTarget: direct[activeIndex],
          canonicalTarget: canonical[activeIndex],
          directWidth: profile.workingResolution.width,
          directHeight: profile.workingResolution.height,
          canonicalWidth: profile.canonicalResolution.width,
          canonicalHeight: profile.canonicalResolution.height,
          resourcePolicy: {
            sharedProjectionBakeRuntime: true,
            reusablePerLayerScratch: true,
            retainedMergedTargets: 2,
            disposedPingPongTargets: 2,
            permanentPerLayerTargets: 0
          }
        };
        direct[1 - activeIndex].dispose();
        canonical[1 - activeIndex].dispose();
        material.dispose();
        geometry.dispose();
        this.disposeFamily(profile.familyId);
        this.results.set(profile.familyId, result);
        this.runCount += 1;
        return result;
      },
      dispose: disposePending
    };
  }

  result(familyId) {
    return this.results.get(String(familyId)) || null;
  }

  hasOutputs(familyId) {
    const result = this.result(familyId);
    return Boolean(result?.directTarget && result?.canonicalTarget);
  }

  readOutputRgba(familyId, outputKind) {
    const result = this.result(familyId);
    if (!result) throw new Error('Run BAKE FULL MERGED before reading merged output.');
    const kind = String(outputKind || '').toUpperCase();
    const target = kind === 'CANONICAL' ? result.canonicalTarget : (kind === 'DIRECT' ? result.directTarget : null);
    if (!target) throw new Error(`Unknown Full Merge output kind: ${outputKind}`);
    return {
      bytes: readTargetTopLeft(this.renderer, target),
      width: target.width,
      height: target.height,
      components: 4,
      componentSize: 8,
      pixelFormat: 'RGBA',
      colorSpace: 'RGB',
      alpha: 'STRAIGHT',
      orientation: 'TOP_LEFT',
      outputKind: kind,
      familyId: result.familyId
    };
  }

  drawPreviews(familyId, canvases) {
    const result = this.result(familyId);
    if (!result) return false;
    drawTargetPreview(this.renderer, result.directTarget, canvases.direct);
    drawTargetPreview(this.renderer, result.canonicalTarget, canvases.canonical);
    return true;
  }

  async exportPng(familyId, outputKind) {
    const result = this.result(familyId);
    if (!result) throw new Error('Run BAKE FULL MERGED before exporting merged PNG files.');
    const kind = String(outputKind || '').toUpperCase();
    const target = kind === 'CANONICAL' ? result.canonicalTarget : (kind === 'DIRECT' ? result.directTarget : null);
    if (!target) throw new Error(`Unknown Full Merge PNG export: ${outputKind}`);
    const canvas = targetToTopLeftCanvas(this.renderer, target);
    try {
      const blob = await canvasToPngBlob(canvas);
      const familySlug = String(result.familyLabel || result.familyId).replace(/[^A-Za-z0-9]+/g, '_');
      const label = kind === 'DIRECT' ? 'MergedDirect' : 'MergedCanonical';
      return {
        kind,
        familyId: result.familyId,
        width: target.width,
        height: target.height,
        mimeType: blob.type,
        bytes: blob.size,
        fileName: `Block8F_${familySlug}_${label}_${target.width}x${target.height}.png`,
        blob
      };
    } finally {
      canvas.width = 1;
      canvas.height = 1;
    }
  }

  disposeFamily(familyId) {
    const key = String(familyId);
    const result = this.results.get(key);
    if (!result) return false;
    result.directTarget.dispose();
    result.canonicalTarget.dispose();
    this.results.delete(key);
    this.disposeCount += 1;
    return true;
  }

  disposeAll() {
    for (const familyId of [...this.results.keys()]) this.disposeFamily(familyId);
  }
}
