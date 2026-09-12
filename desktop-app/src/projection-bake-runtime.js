import * as THREE from 'three';
import { computeNormalizedImageSize, normalizeAuthoringTransform } from './screen-image-authoring.js';
import { rasterizeVectorMask, vectorMaskContributionMode } from './vector-mask-model.js';

const PREVIEW_WIDTH = 320;
const SAMPLE_STRIDE = 2;
const VISIBILITY_DEPTH_EPSILON_STEPS = 4;
const VISIBILITY_DIAGNOSTIC_WIDTH = 512;

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
uniform sampler2D vectorMaskTexture;
uniform sampler2D validityMask;
uniform float maskInvert;
uniform float vectorMaskEnabled;
uniform float authoringEnabled;
uniform vec2 authoringCenter;
uniform vec2 authoringSize;
uniform float authoringRotation;
vec4 sampleScreenSource(vec2 screenUv) {
  if (authoringEnabled < 0.5) return texture2D(sourceTexture, screenUv);
  vec2 delta = vec2(screenUv.x, 1.0 - screenUv.y) - authoringCenter;
  float cosine = cos(authoringRotation);
  float sine = sin(authoringRotation);
  vec2 local = vec2(cosine * delta.x + sine * delta.y, -sine * delta.x + cosine * delta.y);
  vec2 sourceUv = local / authoringSize + 0.5;
  if (sourceUv.x < 0.0 || sourceUv.x > 1.0 || sourceUv.y < 0.0 || sourceUv.y > 1.0) return vec4(0.0);
  vec2 textureUv = vec2(sourceUv.x, 1.0 - sourceUv.y);
  vec4 source = texture2D(sourceTexture, textureUv);
  if (vectorMaskEnabled > 0.5) source.a *= texture2D(vectorMaskTexture, textureUv).a;
  return source;
}
void main() {
  if (vCameraClip.w <= 0.0) discard;
  vec3 ndc = vCameraClip.xyz / vCameraClip.w;
  vec2 screenUv = ndc.xy * 0.5 + 0.5;
  if (screenUv.x < 0.0 || screenUv.x > 1.0 || screenUv.y < 0.0 || screenUv.y > 1.0 || ndc.z < -1.0 || ndc.z > 1.0) discard;
  float sampledMask = texture2D(validityMask, vCanonicalUv).r;
  float maskWeight = mix(sampledMask, 1.0 - sampledMask, maskInvert);
  if (maskWeight <= 0.0) discard;
  vec4 source = sampleScreenSource(screenUv);
  gl_FragColor = vec4(source.rgb, source.a * maskWeight);
}`;

const visibilityVertexShader = `
varying vec3 vWorldNormal;
void main() {
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const visibilityFragmentShader = `
precision highp float;
varying vec3 vWorldNormal;
void main() {
  gl_FragColor = vec4(vWorldNormal * 0.5 + 0.5, 1.0);
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
uniform sampler2D vectorMaskTexture;
uniform sampler2D visibilityDepth;
uniform sampler2D validityMask;
uniform float maskInvert;
uniform float vectorMaskEnabled;
uniform float visibilityDepthEpsilon;
uniform float authoringEnabled;
uniform vec2 authoringCenter;
uniform vec2 authoringSize;
uniform float authoringRotation;
vec4 sampleScreenSource(vec2 screenUv) {
  if (authoringEnabled < 0.5) return texture2D(sourceTexture, screenUv);
  vec2 delta = vec2(screenUv.x, 1.0 - screenUv.y) - authoringCenter;
  float cosine = cos(authoringRotation);
  float sine = sin(authoringRotation);
  vec2 local = vec2(cosine * delta.x + sine * delta.y, -sine * delta.x + cosine * delta.y);
  vec2 sourceUv = local / authoringSize + 0.5;
  if (sourceUv.x < 0.0 || sourceUv.x > 1.0 || sourceUv.y < 0.0 || sourceUv.y > 1.0) return vec4(0.0);
  vec2 textureUv = vec2(sourceUv.x, 1.0 - sourceUv.y);
  vec4 source = texture2D(sourceTexture, textureUv);
  if (vectorMaskEnabled > 0.5) source.a *= texture2D(vectorMaskTexture, textureUv).a;
  return source;
}
void main() {
  if (vCameraClip.w <= 0.0) discard;
  vec3 ndc = vCameraClip.xyz / vCameraClip.w;
  vec2 screenUv = ndc.xy * 0.5 + 0.5;
  if (screenUv.x < 0.0 || screenUv.x > 1.0 || screenUv.y < 0.0 || screenUv.y > 1.0 || ndc.z < -1.0 || ndc.z > 1.0) discard;
  float projectedDepth = ndc.z * 0.5 + 0.5;
  float frontmostDepth = texture2D(visibilityDepth, screenUv).r;
  if (frontmostDepth >= 1.0 || projectedDepth - frontmostDepth > visibilityDepthEpsilon) discard;
  float sampledMask = texture2D(validityMask, vCanonicalUv).r;
  float maskWeight = mix(sampledMask, 1.0 - sampledMask, maskInvert);
  if (maskWeight <= 0.0) discard;
  vec4 source = sampleScreenSource(screenUv);
  gl_FragColor = vec4(source.rgb, source.a * maskWeight);
}`;

const visibilityDiagnosticFragmentShader = `
precision highp float;
varying vec4 vCameraClip;
uniform sampler2D visibilityDepth;
uniform float visibilityDepthEpsilon;
void main() {
  if (vCameraClip.w <= 0.0) discard;
  vec3 ndc = vCameraClip.xyz / vCameraClip.w;
  vec2 screenUv = ndc.xy * 0.5 + 0.5;
  if (screenUv.x < 0.0 || screenUv.x > 1.0 || screenUv.y < 0.0 || screenUv.y > 1.0 || ndc.z < -1.0 || ndc.z > 1.0) discard;
  float projectedDepth = ndc.z * 0.5 + 0.5;
  float frontmostDepth = texture2D(visibilityDepth, screenUv).r;
  if (frontmostDepth >= 1.0) {
    gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
  } else {
    float depthDelta = projectedDepth - frontmostDepth;
    if (depthDelta <= visibilityDepthEpsilon) gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0);
    else if (depthDelta <= visibilityDepthEpsilon * 4.0) gl_FragColor = vec4(1.0, 0.75, 0.0, 1.0);
    else gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
  }
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

function drawAuthoringFrame(source, profile, transform) {
  const { width, height } = profile.workingResolution;
  const current = normalizeAuthoringTransform(transform);
  const normalizedSize = computeNormalizedImageSize({
    sourceWidth: source.original.width,
    sourceHeight: source.original.height,
    frameAspect: profile.workingResolution.aspect,
    scale: current.scale
  });
  const drawWidth = normalizedSize.width * width;
  const drawHeight = normalizedSize.height * height;
  source.context.clearRect(0, 0, width, height);
  source.context.save();
  source.context.translate(current.x * width, current.y * height);
  source.context.rotate(current.rotationDegrees * Math.PI / 180);
  source.context.drawImage(source.original.image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  source.context.restore();
  source.normalizedSize = normalizedSize;
  source.transform = current;
}

function createOriginalFileSource(profile, authoringSource, transform) {
  if (!authoringSource?.image || !(authoringSource.width > 0 && authoringSource.height > 0)) {
    throw new Error('Block 8A Projection Bake requires a decoded original File Bitmap.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = profile.workingResolution.width;
  canvas.height = profile.workingResolution.height;
  const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  const texture = new THREE.Texture(authoringSource.image);
  texture.name = `BLOCK8A_ORIGINAL_FILE_${authoringSource.id}`;
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = true;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  const source = {
    kind: 'ORIGINAL_FILE_BITMAP',
    canvas,
    context,
    texture,
    markers: [],
    center: { x: Math.floor(canvas.width / 2), y: Math.floor(canvas.height / 2) },
    alphaProbe: { x: Math.floor(canvas.width / 2), y: Math.floor(canvas.height / 2) },
    original: authoringSource
  };
  drawAuthoringFrame(source, profile, transform);
  return source;
}

function makeTarget(width, height, depth = false) {
  const target = new THREE.WebGLRenderTarget(width, height, {
    format: THREE.RGBAFormat, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter, generateMipmaps: false, depthBuffer: depth, stencilBuffer: false
  });
  target.texture.colorSpace = THREE.NoColorSpace;
  return target;
}

function makeVisibilityTarget(width, height) {
  const target = makeTarget(width, height, true);
  target.texture.minFilter = THREE.NearestFilter;
  target.texture.magFilter = THREE.NearestFilter;
  target.depthTexture = new THREE.DepthTexture(width, height, THREE.UnsignedIntType);
  target.depthTexture.format = THREE.DepthFormat;
  target.depthTexture.type = THREE.UnsignedIntType;
  target.depthTexture.minFilter = THREE.NearestFilter;
  target.depthTexture.magFilter = THREE.NearestFilter;
  target.depthTexture.generateMipmaps = false;
  return target;
}

function makeScalarMaskTexture(name, width, height, values) {
  const texture = new THREE.DataTexture(new Uint8Array(values), width, height, THREE.RedFormat, THREE.UnsignedByteType);
  texture.name = name; texture.colorSpace = THREE.NoColorSpace; texture.flipY = false; texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping; texture.wrapT = THREE.ClampToEdgeWrapping; texture.needsUpdate = true;
  return texture;
}

function makeTemporaryVectorMaskTexture(mask, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: true });
  const raster = rasterizeVectorMask(context, mask, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'BLOCK8E_SELECTED_LAYER_TEMPORARY_VECTOR_MASK';
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = true;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  let disposed = false;
  return {
    canvas,
    texture,
    raster,
    get disposed() { return disposed; },
    dispose() {
      if (disposed) return;
      disposed = true;
      texture.dispose();
      canvas.width = 1;
      canvas.height = 1;
    }
  };
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

function applyExportOpacity(canvas, opacity) {
  const normalized = Math.min(1, Math.max(0, Number.isFinite(Number(opacity)) ? Number(opacity) : 1));
  if (normalized === 1) return normalized;
  const context = canvas.getContext('2d', { alpha: true });
  context.save();
  context.globalCompositeOperation = 'destination-in';
  context.globalAlpha = normalized;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
  return normalized;
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

function compareVisibilityAlpha(directPixels, reprojectPixels) {
  let intersection = 0; let union = 0; let directOnly = 0; let reprojectOnly = 0;
  for (let offset = 3; offset < directPixels.length; offset += 4) {
    const directVisible = directPixels[offset] > 0;
    const reprojectVisible = reprojectPixels[offset] > 0;
    if (directVisible || reprojectVisible) union++;
    if (directVisible && reprojectVisible) intersection++;
    else if (directVisible) directOnly++;
    else if (reprojectVisible) reprojectOnly++;
  }
  return {
    intersectionPixelCount: intersection,
    unionPixelCount: union,
    directOnlyPixelCount: directOnly,
    reprojectOnlyPixelCount: reprojectOnly,
    silhouetteIou: union ? intersection / union : 1
  };
}

function analyzeVisibilityDiagnostic(pixels, width, height) {
  let accepted = 0; let boundary = 0; let occluded = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (pixels[offset + 3] === 0) continue;
    if (pixels[offset + 1] > 220 && pixels[offset] < 32) accepted++;
    else if (pixels[offset] > 220 && pixels[offset + 1] > 128) boundary++;
    else if (pixels[offset] > 220 && pixels[offset + 1] < 32) occluded++;
  }
  const candidate = accepted + boundary + occluded;
  return {
    width,
    height,
    candidatePixelCount: candidate,
    acceptedPixelCount: accepted,
    boundaryPixelCount: boundary,
    occludedPixelCount: occluded,
    acceptedRatio: candidate ? accepted / candidate : 0,
    occludedRatio: candidate ? occluded / candidate : 0
  };
}

function analyze(profile, source, directPixels, bakePixels, reprojectPixels, visibilityDiagnosticPixels) {
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
    visibilityAgreement: compareVisibilityAlpha(directPixels, reprojectPixels),
    visibilityDiagnostic: analyzeVisibilityDiagnostic(
      visibilityDiagnosticPixels,
      VISIBILITY_DIAGNOSTIC_WIDTH,
      Math.max(1, Math.round(VISIBILITY_DIAGNOSTIC_WIDTH * canonical.height / canonical.width))
    ),
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

  async ensureResources(profile, authoringSource = null, authoringTransform = null) {
    const sourceKey = authoringSource ? `${profile.id}:FILE:${authoringSource.id}` : `${profile.id}:SYNTHETIC`;
    if (this.resources?.sourceKey === sourceKey) return this.resources;
    this.dispose();
    const source = authoringSource
      ? createOriginalFileSource(profile, authoringSource, authoringTransform)
      : createNativeSyntheticSource(profile);
    let mask = null;
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
    const visibilityTarget = makeVisibilityTarget(profile.workingResolution.width, profile.workingResolution.height);
    const visibilityDiagnosticHeight = Math.max(1, Math.round(VISIBILITY_DIAGNOSTIC_WIDTH * profile.canonicalResolution.height / profile.canonicalResolution.width));
    this.resources = {
      profileId: profile.id, sourceKey, profile, source, mask, fullWhiteMask, syntheticMask, visibilityTarget,
      visibilityDiagnosticTarget: makeTarget(VISIBILITY_DIAGNOSTIC_WIDTH, visibilityDiagnosticHeight),
      directTarget: makeTarget(profile.workingResolution.width, profile.workingResolution.height, true),
      bakeTarget: makeTarget(profile.canonicalResolution.width, profile.canonicalResolution.height),
      reprojectTarget: makeTarget(profile.workingResolution.width, profile.workingResolution.height, true)
    };
    return this.resources;
  }

  async run({ profile, surfaceMeshes, occluderMeshes, previewCanvases, repetitions = 1, maskMode = 'profile', authoringSource = null, authoringTransform = null, authoringVectorMask = null }) {
    if (!Array.isArray(surfaceMeshes) || surfaceMeshes.length === 0) throw new Error('Projection Bake requires at least one bound Surface mesh.');
    for (const mesh of surfaceMeshes) if (!mesh.geometry?.getAttribute('uv')) throw new Error(`Surface ${mesh.name} has no authored TEXCOORD_0.`);
    if (!Array.isArray(occluderMeshes) || occluderMeshes.length === 0) throw new Error('Projection Bake requires the exact building depth occluder mesh.');
    const expectedOccluders = profile.validity.occluderBinding.exactNames;
    const receivedOccluders = occluderMeshes.map((mesh) => mesh.name);
    if (receivedOccluders.length !== expectedOccluders.length || expectedOccluders.some((name) => !receivedOccluders.includes(name))) {
      throw new Error(`Projection Bake exact occluder binding mismatch: expected ${expectedOccluders.join(', ')}; received ${receivedOccluders.join(', ') || 'none'}.`);
    }
    if (!['profile', 'production', 'full-white', 'synthetic'].includes(maskMode)) throw new Error(`Unknown Projection Bake mask mode: ${maskMode}`);
    const resources = await this.ensureResources(profile, authoringSource, authoringTransform);
    if (authoringSource) drawAuthoringFrame(resources.source, profile, authoringTransform);
    const effectiveMaskMode = maskMode === 'profile'
      ? (profile.productionMask.runtimeUrl ? 'production' : 'full-white') : maskMode;
    if (effectiveMaskMode === 'production' && !resources.mask) throw new Error(`${profile.label} production mask is NOT_SUPPLIED.`);
    const validityMask = effectiveMaskMode === 'production' ? resources.mask
      : (effectiveMaskMode === 'synthetic' ? resources.syntheticMask : resources.fullWhiteMask);
    const camera = calibrationCamera(profile.calibrationCamera);
    const visibilityMaterial = new THREE.ShaderMaterial({
      vertexShader: visibilityVertexShader, fragmentShader: visibilityFragmentShader, side: THREE.DoubleSide,
      transparent: false, blending: THREE.NoBlending, depthTest: true, depthWrite: true, toneMapped: false
    });
    const maskInvert = effectiveMaskMode === 'production' && profile.productionMask.scalarOperation === 'EXACT_LINEAR_ONE_MINUS_SHARED_PRODUCTION_MASK' ? 1 : 0;
    const maskEnabled = effectiveMaskMode === 'production';
    const maskStatus = maskEnabled
      ? profile.productionMask.status
      : (effectiveMaskMode === 'synthetic' ? 'SYNTHETIC_CONTROL' : 'DISABLED_FULL_WHITE_CONTROL');
    const transform = normalizeAuthoringTransform(authoringTransform || undefined);
    const authoringSize = authoringSource
      ? computeNormalizedImageSize({
        sourceWidth: authoringSource.width,
        sourceHeight: authoringSource.height,
        frameAspect: profile.workingResolution.aspect,
        scale: transform.scale
      })
      : { width: 1, height: 1 };
    const vectorMaskMode = authoringSource ? vectorMaskContributionMode(authoringVectorMask) : 'PASS_THROUGH';
    const temporaryVectorMask = authoringSource && vectorMaskMode !== 'PASS_THROUGH'
      ? makeTemporaryVectorMaskTexture(authoringVectorMask, authoringSource.width, authoringSource.height)
      : null;
    const vectorMaskDiagnostics = {
      coordinateSpace: 'SOURCE_NORMALIZED_TOP_LEFT',
      contributionMode: vectorMaskMode,
      enabled: Boolean(authoringVectorMask?.enabled),
      invert: Boolean(authoringVectorMask?.invert),
      applied: Boolean(temporaryVectorMask),
      width: temporaryVectorMask?.raster.width || null,
      height: temporaryVectorMask?.raster.height || null,
      contributingPathCount: temporaryVectorMask?.raster.contributingPathCount || 0,
      sourceResolutionRaster: Boolean(temporaryVectorMask),
      temporaryTextureAllocated: Boolean(temporaryVectorMask),
      temporaryTextureDisposed: !temporaryVectorMask
    };
    const commonUniforms = {
      sourceTexture: { value: resources.source.texture },
      vectorMaskTexture: { value: temporaryVectorMask?.texture || resources.fullWhiteMask },
      validityMask: { value: validityMask },
      maskInvert: { value: maskInvert },
      vectorMaskEnabled: { value: temporaryVectorMask ? 1 : 0 },
      authoringEnabled: { value: authoringSource ? 1 : 0 },
      authoringCenter: { value: new THREE.Vector2(transform.x, transform.y) },
      authoringSize: { value: new THREE.Vector2(authoringSize.width, authoringSize.height) },
      authoringRotation: { value: THREE.MathUtils.degToRad(transform.rotationDegrees) }
    };
    const directMaterial = new THREE.ShaderMaterial({ uniforms: commonUniforms, vertexShader: directVertexShader, fragmentShader: directFragmentShader, side: THREE.DoubleSide, transparent: false, blending: THREE.NoBlending, depthTest: true, depthWrite: true, toneMapped: false });
    const occluderDepthMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000, colorWrite: false, side: THREE.DoubleSide,
      depthTest: true, depthWrite: true, toneMapped: false
    });
    const depthUniforms = {
      visibilityDepth: { value: resources.visibilityTarget.depthTexture },
      visibilityDepthEpsilon: { value: 0 }
    };
    const bakeMaterial = new THREE.ShaderMaterial({
      uniforms: { ...commonUniforms, ...depthUniforms },
      vertexShader: bakeVertexShader, fragmentShader: bakeFragmentShader, side: THREE.DoubleSide,
      transparent: false, blending: THREE.NoBlending, depthTest: false, depthWrite: false, toneMapped: false
    });
    const visibilityDiagnosticMaterial = new THREE.ShaderMaterial({
      uniforms: depthUniforms, vertexShader: bakeVertexShader, fragmentShader: visibilityDiagnosticFragmentShader,
      side: THREE.DoubleSide, transparent: false, blending: THREE.NoBlending, depthTest: false, depthWrite: false, toneMapped: false
    });
    const reprojectMaterial = new THREE.ShaderMaterial({ uniforms: { canonicalTexture: { value: resources.bakeTarget.texture } }, vertexShader: reprojectVertexShader, fragmentShader: reprojectFragmentShader, side: THREE.DoubleSide, transparent: false, blending: THREE.NoBlending, depthTest: true, depthWrite: true, toneMapped: false });
    const visibility = makeSurfaceScene([...surfaceMeshes, ...occluderMeshes], visibilityMaterial);
    const occluders = makeSurfaceScene(occluderMeshes, occluderDepthMaterial);
    const direct = makeSurfaceScene(surfaceMeshes, directMaterial);
    const bake = makeSurfaceScene(surfaceMeshes, bakeMaterial); const diagnostic = makeSurfaceScene(surfaceMeshes, visibilityDiagnosticMaterial);
    const reproject = makeSurfaceScene(surfaceMeshes, reprojectMaterial);
    const rendererState = snapshotRenderer(this.renderer); const textureCounts = [];
    let visibilityDepthBits = 24; let visibilityDepthEpsilon = null;
    try {
      this.renderer.setPixelRatio(1); this.renderer.xr.enabled = false; this.renderer.autoClear = false;
      this.renderer.toneMapping = THREE.NoToneMapping; this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace; this.renderer.setScissorTest(false);
      this.renderer.setRenderTarget(resources.visibilityTarget);
      visibilityDepthBits = this.renderer.getContext().getParameter(this.renderer.getContext().DEPTH_BITS) || 24;
      visibilityDepthEpsilon = VISIBILITY_DEPTH_EPSILON_STEPS / (Math.pow(2, visibilityDepthBits) - 1);
      depthUniforms.visibilityDepthEpsilon.value = visibilityDepthEpsilon;
      for (let index = 0; index < repetitions; index++) {
        this.renderer.setRenderTarget(resources.visibilityTarget); this.renderer.setViewport(0, 0, profile.workingResolution.width, profile.workingResolution.height);
        this.renderer.setClearColor(0x000000, 0); this.renderer.clear(true, true, false); this.renderer.render(visibility.scene, camera);
        this.renderer.setRenderTarget(resources.directTarget); this.renderer.setViewport(0, 0, profile.workingResolution.width, profile.workingResolution.height);
        this.renderer.setClearColor(0x000000, 0); this.renderer.clear(true, true, false);
        this.renderer.render(occluders.scene, camera); this.renderer.render(direct.scene, camera);
        this.renderer.setRenderTarget(resources.bakeTarget); this.renderer.setViewport(0, 0, profile.canonicalResolution.width, profile.canonicalResolution.height);
        this.renderer.setClearColor(0x000000, 0); this.renderer.clear(true, false, false); this.renderer.render(bake.scene, camera);
        this.renderer.setRenderTarget(resources.visibilityDiagnosticTarget);
        this.renderer.setViewport(0, 0, resources.visibilityDiagnosticTarget.width, resources.visibilityDiagnosticTarget.height);
        this.renderer.setClearColor(0x000000, 0); this.renderer.clear(true, false, false); this.renderer.render(diagnostic.scene, camera);
        this.renderer.setRenderTarget(resources.reprojectTarget); this.renderer.setViewport(0, 0, profile.workingResolution.width, profile.workingResolution.height);
        this.renderer.setClearColor(0x000000, 0); this.renderer.clear(true, true, false);
        this.renderer.render(occluders.scene, camera); this.renderer.render(reproject.scene, camera);
        this.renderer.getContext().finish(); this.runCount++; textureCounts.push(this.renderer.info.memory.textures);
      }
      const directPixels = readTarget(this.renderer, resources.directTarget);
      const bakePixels = readTarget(this.renderer, resources.bakeTarget); const reprojectPixels = readTarget(this.renderer, resources.reprojectTarget);
      const visibilityDiagnosticPixels = readTarget(this.renderer, resources.visibilityDiagnosticTarget);
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
        occluderNames: occluderMeshes.map((mesh) => mesh.name),
        camera: { fov: camera.fov, aspect: camera.aspect, position: camera.position.toArray(), quaternion: camera.quaternion.toArray() },
        mask: { requestedMode: maskMode, mode: effectiveMaskMode, enabled: maskEnabled, status: maskStatus,
          fallbackUsed: !profile.productionMask.runtimeUrl && effectiveMaskMode === 'full-white', fallback: profile.productionMask.fallback,
          fileName: effectiveMaskMode === 'production' ? profile.productionMask.fileName : null,
          width: effectiveMaskMode === 'production' ? profile.productionMask.width : validityMask.image.width,
          height: effectiveMaskMode === 'production' ? profile.productionMask.height : validityMask.image.height,
          colorSpace: profile.productionMask.colorSpace, flipY: validityMask.flipY, interpretation: profile.productionMask.meaning,
          sourceOfTruth: maskEnabled ? profile.productionMask.sourceOfTruth : 'FULL_WHITE_CONTROL',
          scalarOperation: maskEnabled ? profile.productionMask.scalarOperation : 'MASK_DISABLED_IDENTITY_ONE', exactLinearInversion: maskInvert === 1 },
        authoring: authoringSource ? {
          enabled: true,
          coordinateSpace: 'PROJECTION_FRAME_NORMALIZED_TOP_LEFT',
          source: {
            filename: authoringSource.filename,
            mimeType: authoringSource.mimeType,
            originalWidth: authoringSource.width,
            originalHeight: authoringSource.height,
            hasAlpha: authoringSource.hasAlpha
          },
          transform,
          normalizedSize: authoringSize,
          productionSampling: 'ORIGINAL_FILE_BITMAP_DIRECT_TEXTURE_SAMPLE',
          vectorMask: vectorMaskDiagnostics,
          blendMode: 'NORMAL'
        } : { enabled: false },
        directProjection: {
          sourceTexture: authoringSource ? 'ORIGINAL_FILE_BITMAP' : 'ORIGINAL_WORKING_SOURCE',
          canonicalTextureReferenced: false,
          environmentIncluded: false,
          environmentColorIncluded: false,
          matteIncluded: true,
          matteScope: 'PROJECTION_BAKE_OFFSCREEN_ONLY'
        },
        visibility: { policy: profile.validity.operation,
          environmentDepthIncluded: false,
          dedicatedMatteDepthIncluded: true,
          method: 'PROJECTION_CAMERA_DEPTH_TEXTURE_FRONTMOST',
          depthSource: 'FAMILY_BOUND_SIGNAGE_SURFACE_PLUS_DEDICATED_INNER_MATTE',
          occluderAssetLogicalId: profile.validity.occluderBinding.assetLogicalId,
          occluderSelectorPolicy: profile.validity.occluderBinding.selectorPolicy,
          occluderNames: occluderMeshes.map((mesh) => mesh.name),
          depthBits: visibilityDepthBits, depthEpsilonSteps: VISIBILITY_DEPTH_EPSILON_STEPS,
          depthEpsilonNormalized: visibilityDepthEpsilon,
          depthComparison: 'PROJECTED_DEPTH_LE_FRONTMOST_DEPTH_PLUS_QUANTIZED_EPSILON',
          facingPolicy: 'NO_NORMAL_THRESHOLD_DEPTH_PRIMARY_GRAZING_PRESERVED',
          centerProbe: { gpuWorldNormalBytes: Array.from(visibilityProbePixels), cpuRaycastUv: probeHit?.uv?.toArray() || null, meshName: probeHit?.object?.name || null } },
        uvPolicy: profile.surfaceBinding.uvPolicy, canonicalOrientation: profile.canonicalOrientation,
        colorPolicy: 'RAW_STRAIGHT_RGBA_NO_TONE_MAPPING_MASK_LINEAR_SCALAR',
        resourcePolicy: { reusableTargets: true, runCount: this.runCount, disposeCount: this.disposeCount, textureCounts, stableAcrossRuns: Math.max(...textureCounts) - Math.min(...textureCounts) <= 1,
          permanentPerLayerVectorMaskTextures: 0, temporaryVectorMask: vectorMaskDiagnostics },
        ...analyze(profile, resources.source, directPixels, bakePixels, reprojectPixels, visibilityDiagnosticPixels)
      };
    } finally {
      restoreRenderer(this.renderer, rendererState);
      visibilityMaterial.dispose(); occluderDepthMaterial.dispose(); directMaterial.dispose(); bakeMaterial.dispose(); visibilityDiagnosticMaterial.dispose(); reprojectMaterial.dispose();
      temporaryVectorMask?.dispose();
      vectorMaskDiagnostics.temporaryTextureDisposed = !temporaryVectorMask || temporaryVectorMask.disposed;
    }
  }

  previewDataUrls(canvases) {
    return { source: canvases.source.toDataURL('image/png'), direct: canvases.direct.toDataURL('image/png'), bake: canvases.bake.toDataURL('image/png'), reproject: canvases.reproject.toDataURL('image/png') };
  }

  fullSourceDataUrl() {
    if (!this.hasOutputs()) throw new Error('Run the Projection Bake before exporting PNG files.');
    return this.resources.source.canvas.toDataURL('image/png');
  }

  visibilityDiagnosticDataUrl() {
    if (!this.hasOutputs()) throw new Error('Run the Projection Bake before exporting visibility diagnostics.');
    const canvas = targetToTopLeftCanvas(this.renderer, this.resources.visibilityDiagnosticTarget);
    try { return canvas.toDataURL('image/png'); } finally { canvas.width = 1; canvas.height = 1; }
  }

  outputDataUrl(outputKind) {
    if (!this.hasOutputs()) throw new Error('Run the Projection Bake before exporting correction evidence.');
    const kind = String(outputKind || '').toLowerCase();
    const targets = {
      direct: this.resources.directTarget,
      canonical: this.resources.bakeTarget,
      reprojected: this.resources.reprojectTarget
    };
    const target = targets[kind];
    if (!target) throw new Error(`Unknown correction evidence output kind: ${outputKind}`);
    const canvas = targetToTopLeftCanvas(this.renderer, target);
    try { return canvas.toDataURL('image/png'); } finally { canvas.width = 1; canvas.height = 1; }
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

  async exportPng(kind, { opacity = 1 } = {}) {
    if (!this.hasOutputs()) throw new Error('Run the Projection Bake before exporting PNG files.');
    const profile = this.resources.profile;
    const prefix = this.resources.source.kind === 'ORIGINAL_FILE_BITMAP' ? `Block8A_${profile.familySlug}` : `Block6B_${profile.familySlug}`;
    const exports = {
      source: { fileName: `${prefix}_Source_${profile.workingResolution.width}x${profile.workingResolution.height}.png`, canvas: this.resources.source.canvas },
      direct: { fileName: `${prefix}_DirectProjected_${profile.workingResolution.width}x${profile.workingResolution.height}.png`, target: this.resources.directTarget },
      bake: { fileName: `${prefix}_CanonicalBake_${profile.canonicalResolution.width}x${profile.canonicalResolution.height}.png`, target: this.resources.bakeTarget },
      reproject: { fileName: `${prefix}_CanonicalReprojected_${profile.workingResolution.width}x${profile.workingResolution.height}.png`, target: this.resources.reprojectTarget }
    };
    const selected = exports[kind]; if (!selected) throw new Error(`Unknown Projection Bake PNG export: ${kind}`);
    const canvas = selected.canvas ? document.createElement('canvas') : targetToTopLeftCanvas(this.renderer, selected.target);
    if (selected.canvas) {
      canvas.width = selected.canvas.width;
      canvas.height = selected.canvas.height;
      canvas.getContext('2d', { alpha: true }).drawImage(selected.canvas, 0, 0);
    }
    const appliedOpacity = applyExportOpacity(canvas, opacity);
    try {
      const blob = await canvasToPngBlob(canvas);
      return { kind, familyId: profile.familyId, fileName: selected.fileName, width: canvas.width, height: canvas.height, opacity: appliedOpacity, mimeType: blob.type, bytes: blob.size, blob };
    } finally { canvas.width = 1; canvas.height = 1; }
  }

  dispose() {
    if (!this.resources) return;
    this.resources.source.texture.dispose(); this.resources.mask?.dispose(); this.resources.fullWhiteMask.dispose();
    this.resources.syntheticMask.dispose(); this.resources.visibilityTarget.dispose(); this.resources.visibilityDiagnosticTarget.dispose();
    this.resources.directTarget.dispose(); this.resources.bakeTarget.dispose(); this.resources.reprojectTarget.dispose();
    this.resources = null; this.lastCompletedProfileId = null; this.disposeCount++;
  }
}
