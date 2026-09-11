import * as THREE from 'three';

const PREVIEW_WIDTH = 320;
const VISIBILITY_UV_EPSILON = 0.015;
const SAMPLE_STRIDE = 2;

const directVertexShader = `
varying vec2 vCanonicalUv;
varying vec4 vCameraClip;
void main() {
  vCanonicalUv = uv;
  vCameraClip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = vCameraClip;
}`;

const directFragmentShader = `
precision highp float;
varying vec2 vCanonicalUv;
varying vec4 vCameraClip;
uniform sampler2D sourceTexture;
uniform sampler2D validityMask;
uniform float maskInvert;
void main() {
  if (vCameraClip.w <= 0.0) discard;
  vec3 ndc = vCameraClip.xyz / vCameraClip.w;
  vec2 screenUv = ndc.xy * 0.5 + 0.5;
  if (screenUv.x < 0.0 || screenUv.x > 1.0 || screenUv.y < 0.0 || screenUv.y > 1.0 || ndc.z < -1.0 || ndc.z > 1.0) discard;
  float sampledMask = texture2D(validityMask, vCanonicalUv).r;
  float maskWeight = mix(sampledMask, 1.0 - sampledMask, maskInvert);
  if (maskWeight <= 0.0) discard;
  vec4 source = texture2D(sourceTexture, screenUv);
  gl_FragColor = vec4(source.rgb, source.a * maskWeight);
}`;

const bakeVertexShader = `
varying vec2 vCanonicalUv;
varying vec4 vCameraClip;
void main() {
  vCanonicalUv = uv;
  vCameraClip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = vec4(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, 0.0, 1.0);
}`;

const bakeFragmentShader = `
precision highp float;
varying vec2 vCanonicalUv;
varying vec4 vCameraClip;
uniform sampler2D sourceTexture;
uniform sampler2D visibilitySurfaceId;
uniform sampler2D validityMask;
uniform float maskInvert;
uniform vec2 visibilityTexelSize;
uniform float visibilityUvEpsilon;
void main() {
  if (vCameraClip.w <= 0.0) discard;
  vec3 ndc = vCameraClip.xyz / vCameraClip.w;
  vec2 screenUv = ndc.xy * 0.5 + 0.5;
  if (screenUv.x < 0.0 || screenUv.x > 1.0 || screenUv.y < 0.0 || screenUv.y > 1.0 || ndc.z < -1.0 || ndc.z > 1.0) discard;
  float nearestUvDistance = 2.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec4 visibleSurface = texture2D(visibilitySurfaceId, screenUv + vec2(float(x), float(y)) * visibilityTexelSize);
    if (visibleSurface.a > 0.5) nearestUvDistance = min(nearestUvDistance, distance(vCanonicalUv, visibleSurface.rg));
  }
  if (nearestUvDistance > visibilityUvEpsilon) discard;
  float sampledMask = texture2D(validityMask, vCanonicalUv).r;
  float maskWeight = mix(sampledMask, 1.0 - sampledMask, maskInvert);
  if (maskWeight <= 0.0) discard;
  vec4 source = texture2D(sourceTexture, screenUv);
  gl_FragColor = vec4(source.rgb, source.a * maskWeight);
}`;

const reprojectVertexShader = `
varying vec2 vCanonicalUv;
void main() {
  vCanonicalUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const reprojectFragmentShader = `
precision highp float;
varying vec2 vCanonicalUv;
uniform sampler2D canonicalTexture;
void main() {
  vec4 baked = texture2D(canonicalTexture, vec2(vCanonicalUv.x, 1.0 - vCanonicalUv.y));
  if (baked.a <= 0.0) discard;
  gl_FragColor = baked;
}`;

function createNativeSyntheticSource(profile) {
  const { width, height } = profile.workingResolution;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  context.fillStyle = '#101827'; context.fillRect(0, 0, width, height);
  const insetX = Math.round(width * 0.19); const insetY = Math.round(height * 0.035);
  const right = width - insetX; const bottom = height - insetY;
  context.strokeStyle = '#f8fafc'; context.lineWidth = 20;
  context.strokeRect(insetX, insetY, right - insetX, bottom - insetY);
  context.lineWidth = 4; context.strokeStyle = 'rgba(148, 163, 184, 0.72)';
  for (let x = insetX; x <= right; x += Math.round((right - insetX) / 8)) {
    context.beginPath(); context.moveTo(x, insetY); context.lineTo(x, bottom); context.stroke();
  }
  for (let y = insetY; y <= bottom; y += Math.round((bottom - insetY) / 10)) {
    context.beginPath(); context.moveTo(insetX, y); context.lineTo(right, y); context.stroke();
  }
  const marker = Math.round(Math.min(width, height) * 0.075); const pad = Math.round(marker * 0.65);
  const markers = [
    { id: 'TOP_LEFT_RED', x: insetX + pad, y: insetY + pad, color: '#ff2020' },
    { id: 'TOP_RIGHT_GREEN', x: right - pad, y: insetY + pad, color: '#20ff60' },
    { id: 'BOTTOM_LEFT_BLUE', x: insetX + pad, y: bottom - pad, color: '#2080ff' },
    { id: 'BOTTOM_RIGHT_YELLOW', x: right - pad, y: bottom - pad, color: '#ffe020' }
  ];
  for (const item of markers) {
    context.fillStyle = item.color; context.fillRect(item.x - marker / 2, item.y - marker / 2, marker, marker);
    context.fillStyle = '#020617'; context.font = `700 ${Math.round(marker * 0.22)}px Segoe UI`;
    context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(item.id.replaceAll('_', ' '), item.x, item.y);
  }
  const cx = Math.round(width / 2); const cy = Math.round(height / 2);
  context.strokeStyle = '#ffffff'; context.lineWidth = 18;
  context.beginPath(); context.moveTo(cx - 210, cy); context.lineTo(cx + 210, cy); context.stroke();
  context.beginPath(); context.moveTo(cx, cy - 210); context.lineTo(cx, cy + 210); context.stroke();
  context.fillStyle = '#ff3bd4'; context.beginPath(); context.arc(cx, cy, 72, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#00e5ff'; context.beginPath();
  context.moveTo(cx - 330, cy - 520); context.lineTo(cx + 330, cy - 520); context.lineTo(cx + 330, cy - 680);
  context.lineTo(cx + 650, cy - 400); context.lineTo(cx + 330, cy - 120); context.lineTo(cx + 330, cy - 280);
  context.lineTo(cx - 330, cy - 280); context.closePath(); context.fill();
  context.fillStyle = '#06121a'; context.font = '700 112px Segoe UI'; context.textAlign = 'center';
  context.fillText(profile.source.label, cx, cy - 400);
  const alphaProbe = { x: cx - 400, y: cy + 520 };
  context.save(); context.globalCompositeOperation = 'destination-out'; context.fillStyle = '#fff';
  context.beginPath(); context.arc(alphaProbe.x, alphaProbe.y, 210, 0, Math.PI * 2); context.fill();
  context.globalCompositeOperation = 'source-over'; context.fillStyle = 'rgba(255,255,255,.35)';
  context.beginPath(); context.arc(alphaProbe.x, alphaProbe.y, 210, 0, Math.PI * 2); context.fill(); context.restore();
  context.fillStyle = '#fff'; context.font = '700 72px Segoe UI'; context.fillText('A 35%', alphaProbe.x, alphaProbe.y);
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = `BLOCK6B_${profile.familySlug}_SYNTHETIC_NATIVE_RGBA`;
  texture.colorSpace = THREE.NoColorSpace; texture.flipY = true; texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping; texture.wrapT = THREE.ClampToEdgeWrapping; texture.needsUpdate = true;
  return { canvas, context, texture, markers, center: { x: cx, y: cy }, alphaProbe };
}

function makeTarget(width, height, depth = false) {
  const target = new THREE.WebGLRenderTarget(width, height, {
    format: THREE.RGBAFormat, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter, generateMipmaps: false, depthBuffer: depth, stencilBuffer: false
  });
  target.texture.colorSpace = THREE.NoColorSpace;
  return target;
}

function makeScalarMaskTexture(name, width, height, values) {
  const texture = new THREE.DataTexture(new Uint8Array(values), width, height, THREE.RedFormat, THREE.UnsignedByteType);
  texture.name = name; texture.colorSpace = THREE.NoColorSpace; texture.flipY = false; texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping; texture.wrapT = THREE.ClampToEdgeWrapping; texture.needsUpdate = true;
  return texture;
}

function makeUvCoordinateTexture() {
  const width = 256; const height = 256; const values = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4; values[offset] = x; values[offset + 1] = y; values[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(values, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = 'BLOCK6A_VISIBILITY_AUTHORED_UV_LOOKUP'; texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = false; texture.generateMipmaps = false; texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter; texture.wrapS = THREE.ClampToEdgeWrapping; texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true; return texture;
}

function calibrationCamera(profile) {
  const camera = new THREE.PerspectiveCamera(profile.runtimeFov, profile.runtimeAspect, profile.near, profile.far);
  camera.position.fromArray(profile.runtimePosition); camera.up.fromArray(profile.runtimeUp);
  camera.quaternion.fromArray(profile.runtimeQuaternion).normalize(); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  return camera;
}

function makeSurfaceScene(surfaceMeshes, material) {
  const scene = new THREE.Scene();
  const meshes = surfaceMeshes.map((source) => {
    source.updateWorldMatrix(true, false); const mesh = new THREE.Mesh(source.geometry, material); mesh.name = source.name;
    mesh.matrixAutoUpdate = false; mesh.matrix.copy(source.matrixWorld); mesh.matrixWorld.copy(source.matrixWorld);
    mesh.frustumCulled = false; scene.add(mesh); return mesh;
  });
  return { scene, meshes };
}

function readTarget(renderer, target) {
  const pixels = new Uint8Array(target.width * target.height * 4);
  renderer.readRenderTargetPixels(target, 0, 0, target.width, target.height, pixels); return pixels;
}

function rgbaAtTopLeft(pixels, width, height, x, y) {
  const cx = Math.max(0, Math.min(width - 1, Math.round(x))); const cy = Math.max(0, Math.min(height - 1, Math.round(y)));
  const offset = ((height - 1 - cy) * width + cx) * 4; return Array.from(pixels.subarray(offset, offset + 4));
}

function drawTargetPreview(canvas, pixels, width, height) {
  const previewHeight = Math.max(1, Math.round(PREVIEW_WIDTH * height / width));
  canvas.width = PREVIEW_WIDTH; canvas.height = previewHeight;
  const context = canvas.getContext('2d', { alpha: true }); const image = context.createImageData(PREVIEW_WIDTH, previewHeight);
  for (let y = 0; y < previewHeight; y++) {
    const sourceY = height - 1 - Math.min(height - 1, Math.floor(y * height / previewHeight));
    for (let x = 0; x < PREVIEW_WIDTH; x++) {
      const sourceX = Math.min(width - 1, Math.floor(x * width / PREVIEW_WIDTH));
      const sourceOffset = (sourceY * width + sourceX) * 4;
      image.data.set(pixels.subarray(sourceOffset, sourceOffset + 4), (y * PREVIEW_WIDTH + x) * 4);
    }
  }
  context.putImageData(image, 0, 0);
}

function drawSourcePreview(canvas, source) {
  canvas.width = PREVIEW_WIDTH; canvas.height = Math.max(1, Math.round(PREVIEW_WIDTH * source.height / source.width));
  const context = canvas.getContext('2d', { alpha: true }); context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
}

function targetToTopLeftCanvas(renderer, target) {
  const pixels = readTarget(renderer, target); const rowBytes = target.width * 4; const swap = new Uint8Array(rowBytes);
  for (let top = 0; top < Math.floor(target.height / 2); top++) {
    const bottom = target.height - 1 - top; const a = top * rowBytes; const b = bottom * rowBytes;
    swap.set(pixels.subarray(a, a + rowBytes)); pixels.copyWithin(a, b, b + rowBytes); pixels.set(swap, b);
  }
  const canvas = document.createElement('canvas'); canvas.width = target.width; canvas.height = target.height;
  canvas.getContext('2d', { alpha: true }).putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer), target.width, target.height), 0, 0);
  return canvas;
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('Full-resolution PNG encoding returned no data.')), 'image/png'
  ));
}

function compareBuffers({ sourcePixels = null, firstPixels = null, secondPixels, width, height }) {
  let absoluteError = 0; let squaredError = 0; let comparedChannels = 0; let comparedVisibleSampleCount = 0;
  const histogram = new Uint32Array(256);
  for (let y = 0; y < height; y += SAMPLE_STRIDE) {
    const gpuY = height - 1 - y;
    for (let x = 0; x < width; x += SAMPLE_STRIDE) {
      const targetOffset = (gpuY * width + x) * 4;
      if (secondPixels[targetOffset + 3] === 0 || (firstPixels && firstPixels[targetOffset + 3] === 0)) continue;
      const firstOffset = sourcePixels ? (y * width + x) * 4 : targetOffset;
      const first = sourcePixels || firstPixels; comparedVisibleSampleCount++;
      for (let channel = 0; channel < 4; channel++) {
        const delta = Math.abs(first[firstOffset + channel] - secondPixels[targetOffset + channel]);
        absoluteError += delta; squaredError += delta * delta; histogram[delta]++; comparedChannels++;
      }
    }
  }
  const targetCount = Math.ceil(comparedChannels * 0.95); let cumulative = 0; let p95 = null;
  for (let delta = 0; delta < histogram.length; delta++) {
    cumulative += histogram[delta]; if (cumulative >= targetCount) { p95 = delta; break; }
  }
  return {
    comparedVisibleSampleCount, comparedChannels, comparisonSampleStride: SAMPLE_STRIDE,
    mae: comparedChannels ? absoluteError / comparedChannels : null,
    rmse: comparedChannels ? Math.sqrt(squaredError / comparedChannels) : null,
    p95
  };
}

function analyze(profile, source, directPixels, bakePixels, reprojectPixels) {
  const canonical = profile.canonicalResolution; const working = profile.workingResolution;
  const countAlpha = (pixels) => {
    let count = 0; for (let offset = 3; offset < pixels.length; offset += 4) if (pixels[offset] > 0) count++;
    return count;
  };
  const validCanonicalPixelCount = countAlpha(bakePixels);
  const directVisiblePixelCount = countAlpha(directPixels);
  const visibleScreenPixelCount = countAlpha(reprojectPixels);
  const sourcePixels = source.context.getImageData(0, 0, working.width, working.height).data;
  const sourceVsDirect = compareBuffers({ sourcePixels, secondPixels: directPixels, width: working.width, height: working.height });
  const directVsCanonicalReprojected = compareBuffers({ firstPixels: directPixels, secondPixels: reprojectPixels, width: working.width, height: working.height });
  const sourceVsCanonicalReprojected = compareBuffers({ sourcePixels, secondPixels: reprojectPixels, width: working.width, height: working.height });
  const sample = (x, y) => ({
    source: Array.from(source.context.getImageData(x, y, 1, 1).data),
    direct: rgbaAtTopLeft(directPixels, working.width, working.height, x, y),
    reprojected: rgbaAtTopLeft(reprojectPixels, working.width, working.height, x, y)
  });
  return {
    sourceWidth: working.width, sourceHeight: working.height,
    directWidth: working.width, directHeight: working.height,
    bakeWidth: canonical.width, bakeHeight: canonical.height,
    reprojectWidth: working.width, reprojectHeight: working.height,
    validCanonicalPixelCount,
    transparentCanonicalPixelCount: canonical.width * canonical.height - validCanonicalPixelCount,
    canonicalCoverage: validCanonicalPixelCount / (canonical.width * canonical.height),
    directVisiblePixelCount, visibleScreenPixelCount,
    sourceVsDirect, directVsCanonicalReprojected, sourceVsCanonicalReprojected,
    comparedVisibleSampleCount: sourceVsCanonicalReprojected.comparedVisibleSampleCount,
    comparisonSampleStride: sourceVsCanonicalReprojected.comparisonSampleStride,
    mae: sourceVsCanonicalReprojected.mae, rmse: sourceVsCanonicalReprojected.rmse, p95: sourceVsCanonicalReprojected.p95,
    orientationCornerSamples: Object.fromEntries(source.markers.map((marker) => [marker.id, sample(marker.x, marker.y)])),
    centerSample: sample(source.center.x, source.center.y),
    alphaTest: sample(source.alphaProbe.x, source.alphaProbe.y)
  };
}

function snapshotRenderer(renderer) {
  return {
    target: renderer.getRenderTarget(), clearColor: renderer.getClearColor(new THREE.Color()), clearAlpha: renderer.getClearAlpha(),
    viewport: renderer.getViewport(new THREE.Vector4()), scissor: renderer.getScissor(new THREE.Vector4()),
    scissorTest: renderer.getScissorTest(), toneMapping: renderer.toneMapping, outputColorSpace: renderer.outputColorSpace,
    autoClear: renderer.autoClear, xrEnabled: renderer.xr.enabled, pixelRatio: renderer.getPixelRatio()
  };
}

function restoreRenderer(renderer, snapshot) {
  renderer.setPixelRatio(snapshot.pixelRatio); renderer.setRenderTarget(snapshot.target);
  renderer.setClearColor(snapshot.clearColor, snapshot.clearAlpha); renderer.setViewport(snapshot.viewport);
  renderer.setScissor(snapshot.scissor); renderer.setScissorTest(snapshot.scissorTest);
  renderer.toneMapping = snapshot.toneMapping; renderer.outputColorSpace = snapshot.outputColorSpace;
  renderer.autoClear = snapshot.autoClear; renderer.xr.enabled = snapshot.xrEnabled;
}

export class ProjectionBakeRuntime {
  constructor(renderer) {
    this.renderer = renderer; this.resources = null; this.runCount = 0; this.disposeCount = 0; this.lastCompletedProfileId = null;
  }

  async ensureResources(profile) {
    if (this.resources?.profileId === profile.id) return this.resources;
    this.dispose(); const source = createNativeSyntheticSource(profile); let mask = null;
    if (profile.productionMask.runtimeUrl) {
      mask = await new THREE.TextureLoader().loadAsync(new URL(profile.productionMask.runtimeUrl, import.meta.url).href);
      const width = mask.image.naturalWidth || mask.image.width; const height = mask.image.naturalHeight || mask.image.height;
      if (width !== profile.productionMask.width || height !== profile.productionMask.height) {
        mask.dispose(); source.texture.dispose();
        throw new Error(`Production mask dimensions must be ${profile.productionMask.width}x${profile.productionMask.height}; received ${width}x${height}.`);
      }
      mask.name = 'BLOCK6A_PRODUCTION_VALIDITY_MASK'; mask.colorSpace = THREE.NoColorSpace; mask.flipY = false;
      mask.generateMipmaps = false; mask.minFilter = THREE.LinearFilter; mask.magFilter = THREE.LinearFilter;
      mask.wrapS = THREE.ClampToEdgeWrapping; mask.wrapT = THREE.ClampToEdgeWrapping; mask.needsUpdate = true;
    }
    const fullWhiteMask = makeScalarMaskTexture('BLOCK6A_FULL_WHITE_CONTROL_MASK', 1, 1, [255]);
    const syntheticMask = makeScalarMaskTexture('BLOCK6A_SYNTHETIC_SCALAR_MASK', 2, 2, [0, 128, 255, 64]);
    const visibilityUvTexture = makeUvCoordinateTexture();
    const visibilityTarget = makeTarget(profile.workingResolution.width, profile.workingResolution.height, true);
    visibilityTarget.texture.minFilter = THREE.NearestFilter; visibilityTarget.texture.magFilter = THREE.NearestFilter;
    this.resources = {
      profileId: profile.id, profile, source, mask, fullWhiteMask, syntheticMask, visibilityUvTexture, visibilityTarget,
      directTarget: makeTarget(profile.workingResolution.width, profile.workingResolution.height, true),
      bakeTarget: makeTarget(profile.canonicalResolution.width, profile.canonicalResolution.height),
      reprojectTarget: makeTarget(profile.workingResolution.width, profile.workingResolution.height, true)
    };
    return this.resources;
  }

  async run({ profile, surfaceMeshes, previewCanvases, repetitions = 1, maskMode = 'profile' }) {
    if (!Array.isArray(surfaceMeshes) || surfaceMeshes.length === 0) throw new Error('Projection Bake requires at least one bound Surface mesh.');
    for (const mesh of surfaceMeshes) if (!mesh.geometry?.getAttribute('uv')) throw new Error(`Surface ${mesh.name} has no authored TEXCOORD_0.`);
    if (!['profile', 'production', 'full-white', 'synthetic'].includes(maskMode)) throw new Error(`Unknown Projection Bake mask mode: ${maskMode}`);
    const resources = await this.ensureResources(profile);
    const effectiveMaskMode = maskMode === 'profile'
      ? (profile.productionMask.runtimeUrl ? 'production' : 'full-white') : maskMode;
    if (effectiveMaskMode === 'production' && !resources.mask) throw new Error(`${profile.label} production mask is NOT_SUPPLIED.`);
    const validityMask = effectiveMaskMode === 'production' ? resources.mask
      : (effectiveMaskMode === 'synthetic' ? resources.syntheticMask : resources.fullWhiteMask);
    const camera = calibrationCamera(profile.calibrationCamera);
    const visibilityMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, map: resources.visibilityUvTexture, side: THREE.DoubleSide, depthTest: true, depthWrite: true, transparent: false, toneMapped: false });
    const maskInvert = effectiveMaskMode === 'production' && profile.productionMask.scalarOperation === 'EXACT_LINEAR_ONE_MINUS_SHARED_PRODUCTION_MASK' ? 1 : 0;
    const maskEnabled = effectiveMaskMode === 'production';
    const maskStatus = maskEnabled
      ? profile.productionMask.status
      : (effectiveMaskMode === 'synthetic' ? 'SYNTHETIC_CONTROL' : 'DISABLED_FULL_WHITE_CONTROL');
    const commonUniforms = { sourceTexture: { value: resources.source.texture }, validityMask: { value: validityMask }, maskInvert: { value: maskInvert } };
    const directMaterial = new THREE.ShaderMaterial({ uniforms: commonUniforms, vertexShader: directVertexShader, fragmentShader: directFragmentShader, side: THREE.DoubleSide, transparent: false, blending: THREE.NoBlending, depthTest: true, depthWrite: true, toneMapped: false });
    const bakeMaterial = new THREE.ShaderMaterial({
      uniforms: { ...commonUniforms, visibilitySurfaceId: { value: resources.visibilityTarget.texture },
        visibilityUvEpsilon: { value: VISIBILITY_UV_EPSILON }, visibilityTexelSize: { value: new THREE.Vector2(1 / profile.workingResolution.width, 1 / profile.workingResolution.height) } },
      vertexShader: bakeVertexShader, fragmentShader: bakeFragmentShader, side: THREE.DoubleSide,
      transparent: false, blending: THREE.NoBlending, depthTest: false, depthWrite: false, toneMapped: false
    });
    const reprojectMaterial = new THREE.ShaderMaterial({ uniforms: { canonicalTexture: { value: resources.bakeTarget.texture } }, vertexShader: reprojectVertexShader, fragmentShader: reprojectFragmentShader, side: THREE.DoubleSide, transparent: false, blending: THREE.NoBlending, depthTest: true, depthWrite: true, toneMapped: false });
    const visibility = makeSurfaceScene(surfaceMeshes, visibilityMaterial); const direct = makeSurfaceScene(surfaceMeshes, directMaterial);
    const bake = makeSurfaceScene(surfaceMeshes, bakeMaterial); const reproject = makeSurfaceScene(surfaceMeshes, reprojectMaterial);
    const rendererState = snapshotRenderer(this.renderer); const textureCounts = [];
    try {
      this.renderer.setPixelRatio(1); this.renderer.xr.enabled = false; this.renderer.autoClear = true;
      this.renderer.toneMapping = THREE.NoToneMapping; this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace; this.renderer.setScissorTest(false);
      for (let index = 0; index < repetitions; index++) {
        this.renderer.setRenderTarget(resources.visibilityTarget); this.renderer.setViewport(0, 0, profile.workingResolution.width, profile.workingResolution.height);
        this.renderer.setClearColor(0x000000, 0); this.renderer.clear(true, true, false); this.renderer.render(visibility.scene, camera);
        this.renderer.setRenderTarget(resources.directTarget); this.renderer.setViewport(0, 0, profile.workingResolution.width, profile.workingResolution.height);
        this.renderer.setClearColor(0x000000, 0); this.renderer.clear(true, true, false); this.renderer.render(direct.scene, camera);
        this.renderer.setRenderTarget(resources.bakeTarget); this.renderer.setViewport(0, 0, profile.canonicalResolution.width, profile.canonicalResolution.height);
        this.renderer.setClearColor(0x000000, 0); this.renderer.clear(true, false, false); this.renderer.render(bake.scene, camera);
        this.renderer.setRenderTarget(resources.reprojectTarget); this.renderer.setViewport(0, 0, profile.workingResolution.width, profile.workingResolution.height);
        this.renderer.setClearColor(0x000000, 0); this.renderer.clear(true, true, false); this.renderer.render(reproject.scene, camera);
        this.renderer.getContext().finish(); this.runCount++; textureCounts.push(this.renderer.info.memory.textures);
      }
      const directPixels = readTarget(this.renderer, resources.directTarget);
      const bakePixels = readTarget(this.renderer, resources.bakeTarget); const reprojectPixels = readTarget(this.renderer, resources.reprojectTarget);
      const visibilityProbePixels = new Uint8Array(4);
      this.renderer.readRenderTargetPixels(resources.visibilityTarget, Math.floor(profile.workingResolution.width / 2), Math.floor(profile.workingResolution.height / 2), 1, 1, visibilityProbePixels);
      const raycaster = new THREE.Raycaster(); raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      const probeHit = raycaster.intersectObjects(surfaceMeshes, false)[0] || null;
      if (previewCanvases) {
        drawSourcePreview(previewCanvases.source, resources.source.canvas);
        drawTargetPreview(previewCanvases.direct, directPixels, profile.workingResolution.width, profile.workingResolution.height);
        drawTargetPreview(previewCanvases.bake, bakePixels, profile.canonicalResolution.width, profile.canonicalResolution.height);
        drawTargetPreview(previewCanvases.reproject, reprojectPixels, profile.workingResolution.width, profile.workingResolution.height);
      }
      this.lastCompletedProfileId = profile.id;
      return {
        profileId: profile.id, familyId: profile.familyId, familyLabel: profile.label,
        surfaceNames: surfaceMeshes.map((mesh) => mesh.name),
        camera: { fov: camera.fov, aspect: camera.aspect, position: camera.position.toArray(), quaternion: camera.quaternion.toArray() },
        mask: { requestedMode: maskMode, mode: effectiveMaskMode, enabled: maskEnabled, status: maskStatus,
          fallbackUsed: !profile.productionMask.runtimeUrl && effectiveMaskMode === 'full-white', fallback: profile.productionMask.fallback,
          fileName: effectiveMaskMode === 'production' ? profile.productionMask.fileName : null,
          width: effectiveMaskMode === 'production' ? profile.productionMask.width : validityMask.image.width,
          height: effectiveMaskMode === 'production' ? profile.productionMask.height : validityMask.image.height,
          colorSpace: profile.productionMask.colorSpace, flipY: validityMask.flipY, interpretation: profile.productionMask.meaning,
          sourceOfTruth: maskEnabled ? profile.productionMask.sourceOfTruth : 'FULL_WHITE_CONTROL',
          scalarOperation: maskEnabled ? profile.productionMask.scalarOperation : 'MASK_DISABLED_IDENTITY_ONE', exactLinearInversion: maskInvert === 1 },
        directProjection: { sourceTexture: 'ORIGINAL_WORKING_SOURCE', canonicalTextureReferenced: false, environmentIncluded: false, matteIncluded: false },
        visibility: { policy: profile.validity.operation, environmentDepthIncluded: false,
          method: 'HARDWARE_DEPTH_FRONTMOST_AUTHORED_UV_NEAREST_3X3', uvEpsilon: VISIBILITY_UV_EPSILON,
          centerProbe: { gpuBytes: Array.from(visibilityProbePixels), gpuUv: [visibilityProbePixels[0] / 255, visibilityProbePixels[1] / 255], cpuRaycastUv: probeHit?.uv?.toArray() || null, meshName: probeHit?.object?.name || null } },
        uvPolicy: profile.surfaceBinding.uvPolicy, canonicalOrientation: profile.canonicalOrientation,
        colorPolicy: 'RAW_STRAIGHT_RGBA_NO_TONE_MAPPING_MASK_LINEAR_SCALAR',
        resourcePolicy: { reusableTargets: true, runCount: this.runCount, disposeCount: this.disposeCount, textureCounts, stableAcrossRuns: Math.max(...textureCounts) - Math.min(...textureCounts) <= 1 },
        ...analyze(profile, resources.source, directPixels, bakePixels, reprojectPixels)
      };
    } finally {
      restoreRenderer(this.renderer, rendererState);
      visibilityMaterial.dispose(); directMaterial.dispose(); bakeMaterial.dispose(); reprojectMaterial.dispose();
    }
  }

  previewDataUrls(canvases) {
    return { source: canvases.source.toDataURL('image/png'), direct: canvases.direct.toDataURL('image/png'), bake: canvases.bake.toDataURL('image/png'), reproject: canvases.reproject.toDataURL('image/png') };
  }

  fullSourceDataUrl() {
    if (!this.hasOutputs()) throw new Error('Run the Projection Bake before exporting PNG files.');
    return this.resources.source.canvas.toDataURL('image/png');
  }

  hasOutputs() { return Boolean(this.resources && this.lastCompletedProfileId === this.resources.profileId); }

  readOutputRgba(outputKind) {
    if (!this.hasOutputs()) throw new Error('Run the Projection Bake before sending an output to Photoshop.');
    const kind = String(outputKind || '').toUpperCase();
    const target = kind === 'CANONICAL' ? this.resources.bakeTarget : (kind === 'DIRECT' ? this.resources.directTarget : null);
    if (!target) throw new Error(`Unknown Photoshop output kind: ${outputKind}`);
    const pixels = readTarget(this.renderer, target);
    const rowBytes = target.width * 4;
    const swap = new Uint8Array(rowBytes);
    for (let top = 0; top < Math.floor(target.height / 2); top++) {
      const bottom = target.height - 1 - top;
      const a = top * rowBytes;
      const b = bottom * rowBytes;
      swap.set(pixels.subarray(a, a + rowBytes));
      pixels.copyWithin(a, b, b + rowBytes);
      pixels.set(swap, b);
    }
    return {
      bytes: pixels,
      width: target.width,
      height: target.height,
      components: 4,
      componentSize: 8,
      pixelFormat: 'RGBA',
      colorSpace: 'RGB',
      alpha: 'STRAIGHT',
      orientation: 'TOP_LEFT',
      outputKind: kind,
      familyId: this.resources.profile.familyId
    };
  }

  async exportPng(kind) {
    if (!this.hasOutputs()) throw new Error('Run the Projection Bake before exporting PNG files.');
    const profile = this.resources.profile; const prefix = `Block6B_${profile.familySlug}`;
    const exports = {
      source: { fileName: `${prefix}_Source_${profile.workingResolution.width}x${profile.workingResolution.height}.png`, canvas: this.resources.source.canvas },
      direct: { fileName: `${prefix}_DirectProjected_${profile.workingResolution.width}x${profile.workingResolution.height}.png`, target: this.resources.directTarget },
      bake: { fileName: `${prefix}_CanonicalBake_${profile.canonicalResolution.width}x${profile.canonicalResolution.height}.png`, target: this.resources.bakeTarget },
      reproject: { fileName: `${prefix}_CanonicalReprojected_${profile.workingResolution.width}x${profile.workingResolution.height}.png`, target: this.resources.reprojectTarget }
    };
    const selected = exports[kind]; if (!selected) throw new Error(`Unknown Projection Bake PNG export: ${kind}`);
    const canvas = selected.canvas || targetToTopLeftCanvas(this.renderer, selected.target);
    try {
      const blob = await canvasToPngBlob(canvas);
      return { kind, familyId: profile.familyId, fileName: selected.fileName, width: canvas.width, height: canvas.height, mimeType: blob.type, bytes: blob.size, blob };
    } finally { if (!selected.canvas) { canvas.width = 1; canvas.height = 1; } }
  }

  dispose() {
    if (!this.resources) return;
    this.resources.source.texture.dispose(); this.resources.mask?.dispose(); this.resources.fullWhiteMask.dispose();
    this.resources.syntheticMask.dispose(); this.resources.visibilityUvTexture.dispose(); this.resources.visibilityTarget.dispose();
    this.resources.directTarget.dispose(); this.resources.bakeTarget.dispose(); this.resources.reprojectTarget.dispose();
    this.resources = null; this.lastCompletedProfileId = null; this.disposeCount++;
  }
}
