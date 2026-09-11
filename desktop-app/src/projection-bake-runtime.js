import * as THREE from 'three';

const PREVIEW_WIDTH = 210;
const VISIBILITY_UV_EPSILON = 0.015;

const bakeVertexShader = `
  varying vec2 vCanonicalUv;
  varying vec4 vCameraClip;
  void main() {
    vCanonicalUv = uv;
    vec4 cameraPosition = modelViewMatrix * vec4(position, 1.0);
    vCameraClip = projectionMatrix * cameraPosition;
    gl_Position = vec4(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, 0.0, 1.0);
  }
`;

const bakeFragmentShader = `
  precision highp float;
  varying vec2 vCanonicalUv;
  varying vec4 vCameraClip;
  uniform sampler2D sourceTexture;
  uniform sampler2D visibilitySurfaceId;
  uniform sampler2D validityMask;
  uniform vec2 visibilityTexelSize;
  uniform float visibilityUvEpsilon;
  void main() {
    if (vCameraClip.w <= 0.0) discard;
    vec3 ndc = vCameraClip.xyz / vCameraClip.w;
    vec2 screenUv = ndc.xy * 0.5 + 0.5;
    if (screenUv.x < 0.0 || screenUv.x > 1.0 || screenUv.y < 0.0 || screenUv.y > 1.0 || ndc.z < -1.0 || ndc.z > 1.0) discard;
    float nearestUvDistance = 2.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 sampleUv = screenUv + vec2(float(x), float(y)) * visibilityTexelSize;
        vec4 visibleSurface = texture2D(visibilitySurfaceId, sampleUv);
        if (visibleSurface.a > 0.5) nearestUvDistance = min(nearestUvDistance, distance(vCanonicalUv, visibleSurface.rg));
      }
    }
    if (nearestUvDistance > visibilityUvEpsilon) discard;
    float maskWeight = texture2D(validityMask, vCanonicalUv).r;
    if (maskWeight <= 0.0) discard;
    vec4 source = texture2D(sourceTexture, screenUv);
    gl_FragColor = vec4(source.rgb, source.a * maskWeight);
  }
`;

const reprojectVertexShader = `
  varying vec2 vCanonicalUv;
  void main() {
    vCanonicalUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const reprojectFragmentShader = `
  precision highp float;
  varying vec2 vCanonicalUv;
  uniform sampler2D canonicalTexture;
  void main() {
    vec4 baked = texture2D(canonicalTexture, vec2(vCanonicalUv.x, 1.0 - vCanonicalUv.y));
    if (baked.a <= 0.0) discard;
    gl_FragColor = baked;
  }
`;

function createNativeSyntheticSource(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#101827';
  context.fillRect(0, 0, width, height);

  const insetX = Math.round(width * 0.19);
  const insetY = Math.round(height * 0.035);
  const right = width - insetX;
  const bottom = height - insetY;
  context.strokeStyle = '#f8fafc';
  context.lineWidth = 20;
  context.strokeRect(insetX, insetY, right - insetX, bottom - insetY);

  context.lineWidth = 4;
  context.strokeStyle = 'rgba(148, 163, 184, 0.72)';
  for (let x = insetX; x <= right; x += Math.round((right - insetX) / 8)) {
    context.beginPath(); context.moveTo(x, insetY); context.lineTo(x, bottom); context.stroke();
  }
  for (let y = insetY; y <= bottom; y += Math.round((bottom - insetY) / 10)) {
    context.beginPath(); context.moveTo(insetX, y); context.lineTo(right, y); context.stroke();
  }

  const marker = Math.round(Math.min(width, height) * 0.075);
  const pad = Math.round(marker * 0.65);
  const markers = [
    { id: 'TOP_LEFT_RED', x: insetX + pad, y: insetY + pad, color: '#ff2020' },
    { id: 'TOP_RIGHT_GREEN', x: right - pad, y: insetY + pad, color: '#20ff60' },
    { id: 'BOTTOM_LEFT_BLUE', x: insetX + pad, y: bottom - pad, color: '#2080ff' },
    { id: 'BOTTOM_RIGHT_YELLOW', x: right - pad, y: bottom - pad, color: '#ffe020' }
  ];
  for (const item of markers) {
    context.fillStyle = item.color;
    context.fillRect(item.x - marker / 2, item.y - marker / 2, marker, marker);
    context.fillStyle = '#020617';
    context.font = `700 ${Math.round(marker * 0.22)}px Segoe UI`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(item.id.replaceAll('_', ' '), item.x, item.y);
  }

  const cx = Math.round(width / 2);
  const cy = Math.round(height / 2);
  context.strokeStyle = '#ffffff';
  context.lineWidth = 18;
  context.beginPath(); context.moveTo(cx - 210, cy); context.lineTo(cx + 210, cy); context.stroke();
  context.beginPath(); context.moveTo(cx, cy - 210); context.lineTo(cx, cy + 210); context.stroke();
  context.fillStyle = '#ff3bd4';
  context.beginPath(); context.arc(cx, cy, 72, 0, Math.PI * 2); context.fill();

  context.fillStyle = '#00e5ff';
  context.beginPath();
  context.moveTo(cx - 330, cy - 520);
  context.lineTo(cx + 330, cy - 520);
  context.lineTo(cx + 330, cy - 680);
  context.lineTo(cx + 650, cy - 400);
  context.lineTo(cx + 330, cy - 120);
  context.lineTo(cx + 330, cy - 280);
  context.lineTo(cx - 330, cy - 280);
  context.closePath();
  context.fill();
  context.fillStyle = '#06121a';
  context.font = '700 112px Segoe UI';
  context.textAlign = 'center';
  context.fillText('TOP 75F →', cx, cy - 400);

  context.save();
  context.globalCompositeOperation = 'destination-out';
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.arc(cx - 400, cy + 520, 210, 0, Math.PI * 2);
  context.fill();
  context.globalCompositeOperation = 'source-over';
  context.fillStyle = 'rgba(255, 255, 255, 0.35)';
  context.beginPath();
  context.arc(cx - 400, cy + 520, 210, 0, Math.PI * 2);
  context.fill();
  context.restore();
  context.fillStyle = '#ffffff';
  context.font = '700 72px Segoe UI';
  context.fillText('A 35%', cx - 400, cy + 520);

  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'BLOCK6A_SYNTHETIC_NATIVE_RGBA';
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = true;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return { canvas, context, texture, markers, center: { x: cx, y: cy } };
}

function makeTarget(width, height, { depth = false, sampledDepth = false, type = THREE.UnsignedByteType } = {}) {
  const target = new THREE.WebGLRenderTarget(width, height, {
    format: THREE.RGBAFormat,
    type,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
    depthBuffer: depth,
    stencilBuffer: false
  });
  target.texture.colorSpace = THREE.NoColorSpace;
  if (sampledDepth) {
    target.depthTexture = new THREE.DepthTexture(width, height, THREE.UnsignedIntType);
    target.depthTexture.minFilter = THREE.NearestFilter;
    target.depthTexture.magFilter = THREE.NearestFilter;
  }
  return target;
}

function makeScalarMaskTexture(name, width, height, values) {
  const texture = new THREE.DataTexture(new Uint8Array(values), width, height, THREE.RedFormat, THREE.UnsignedByteType);
  texture.name = name;
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = false;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function makeUvCoordinateTexture() {
  const width = 256;
  const height = 256;
  const values = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      values[offset] = x;
      values[offset + 1] = y;
      values[offset + 2] = 0;
      values[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(values, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = 'BLOCK6A_VISIBILITY_AUTHORED_UV_LOOKUP';
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = false;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function calibrationCamera(profile) {
  const camera = new THREE.PerspectiveCamera(
    profile.runtimeFov,
    profile.runtimeAspect,
    profile.near,
    profile.far
  );
  camera.position.fromArray(profile.runtimePosition);
  camera.up.fromArray(profile.runtimeUp);
  camera.quaternion.fromArray(profile.runtimeQuaternion).normalize();
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function makeSurfaceScene(surfaceMeshes, material) {
  const scene = new THREE.Scene();
  const meshes = surfaceMeshes.map((source) => {
    source.updateWorldMatrix(true, false);
    const mesh = new THREE.Mesh(source.geometry, material);
    mesh.name = source.name;
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(source.matrixWorld);
    mesh.matrixWorld.copy(source.matrixWorld);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  });
  return { scene, meshes };
}

function readTarget(renderer, target) {
  const pixels = new Uint8Array(target.width * target.height * 4);
  renderer.readRenderTargetPixels(target, 0, 0, target.width, target.height, pixels);
  return pixels;
}

function rgbaAtTopLeft(pixels, width, height, x, y) {
  const clampedX = Math.max(0, Math.min(width - 1, Math.round(x)));
  const clampedY = Math.max(0, Math.min(height - 1, Math.round(y)));
  const gpuY = height - 1 - clampedY;
  const offset = (gpuY * width + clampedX) * 4;
  return Array.from(pixels.subarray(offset, offset + 4));
}

function drawTargetPreview(canvas, pixels, sourceWidth, sourceHeight) {
  const height = Math.max(1, Math.round(PREVIEW_WIDTH * sourceHeight / sourceWidth));
  canvas.width = PREVIEW_WIDTH;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: true });
  const image = context.createImageData(PREVIEW_WIDTH, height);
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(sourceHeight - 1, Math.floor(y * sourceHeight / height));
    const gpuY = sourceHeight - 1 - sourceY;
    for (let x = 0; x < PREVIEW_WIDTH; x += 1) {
      const sourceX = Math.min(sourceWidth - 1, Math.floor(x * sourceWidth / PREVIEW_WIDTH));
      const sourceOffset = (gpuY * sourceWidth + sourceX) * 4;
      const destinationOffset = (y * PREVIEW_WIDTH + x) * 4;
      image.data[destinationOffset] = pixels[sourceOffset];
      image.data[destinationOffset + 1] = pixels[sourceOffset + 1];
      image.data[destinationOffset + 2] = pixels[sourceOffset + 2];
      image.data[destinationOffset + 3] = pixels[sourceOffset + 3];
    }
  }
  context.putImageData(image, 0, 0);
}

function drawSourcePreview(canvas, sourceCanvas) {
  canvas.width = PREVIEW_WIDTH;
  canvas.height = Math.max(1, Math.round(PREVIEW_WIDTH * sourceCanvas.height / sourceCanvas.width));
  const context = canvas.getContext('2d', { alpha: true });
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);
}

function flipTargetRowsInPlace(pixels, width, height) {
  const rowBytes = width * 4;
  const swapRow = new Uint8Array(rowBytes);
  for (let top = 0; top < Math.floor(height / 2); top += 1) {
    const bottom = height - 1 - top;
    const topOffset = top * rowBytes;
    const bottomOffset = bottom * rowBytes;
    swapRow.set(pixels.subarray(topOffset, topOffset + rowBytes));
    pixels.copyWithin(topOffset, bottomOffset, bottomOffset + rowBytes);
    pixels.set(swapRow, bottomOffset);
  }
}

function targetToTopLeftCanvas(renderer, target) {
  const pixels = readTarget(renderer, target);
  flipTargetRowsInPlace(pixels, target.width, target.height);
  const canvas = document.createElement('canvas');
  canvas.width = target.width;
  canvas.height = target.height;
  const context = canvas.getContext('2d', { alpha: true });
  const clamped = new Uint8ClampedArray(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  context.putImageData(new ImageData(clamped, target.width, target.height), 0, 0);
  return canvas;
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Full-resolution PNG encoding returned no data.'));
    }, 'image/png');
  });
}

function analyze(profile, source, bakePixels, reprojectPixels) {
  const canonical = profile.canonicalResolution;
  const working = profile.workingResolution;
  let validCanonicalPixelCount = 0;
  for (let offset = 3; offset < bakePixels.length; offset += 4) {
    if (bakePixels[offset] > 0) validCanonicalPixelCount += 1;
  }
  let visibleScreenPixelCount = 0;
  for (let offset = 3; offset < reprojectPixels.length; offset += 4) {
    if (reprojectPixels[offset] > 0) visibleScreenPixelCount += 1;
  }
  let absoluteError = 0;
  let squaredError = 0;
  let comparedChannels = 0;
  let comparedVisibleSampleCount = 0;
  const sourcePixels = source.context.getImageData(0, 0, working.width, working.height).data;
  for (let y = 0; y < working.height; y += 2) {
    const gpuY = working.height - 1 - y;
    for (let x = 0; x < working.width; x += 2) {
      const sourceOffset = (y * working.width + x) * 4;
      const targetOffset = (gpuY * working.width + x) * 4;
      if (reprojectPixels[targetOffset + 3] === 0) continue;
      comparedVisibleSampleCount += 1;
      for (let channel = 0; channel < 4; channel += 1) {
        const delta = Math.abs(sourcePixels[sourceOffset + channel] - reprojectPixels[targetOffset + channel]);
        absoluteError += delta;
        squaredError += delta * delta;
        comparedChannels += 1;
      }
    }
  }
  const markerSamples = Object.fromEntries(source.markers.map((marker) => [marker.id, {
    source: Array.from(source.context.getImageData(marker.x, marker.y, 1, 1).data),
    reprojected: rgbaAtTopLeft(reprojectPixels, working.width, working.height, marker.x, marker.y)
  }]));
  return {
    sourceWidth: working.width,
    sourceHeight: working.height,
    bakeWidth: canonical.width,
    bakeHeight: canonical.height,
    reprojectWidth: working.width,
    reprojectHeight: working.height,
    validCanonicalPixelCount,
    transparentCanonicalPixelCount: canonical.width * canonical.height - validCanonicalPixelCount,
    canonicalCoverage: validCanonicalPixelCount / (canonical.width * canonical.height),
    visibleScreenPixelCount,
    comparedVisibleSampleCount,
    comparisonSampleStride: 2,
    mae: comparedChannels ? absoluteError / comparedChannels : null,
    rmse: comparedChannels ? Math.sqrt(squaredError / comparedChannels) : null,
    orientationCornerSamples: markerSamples,
    centerSample: {
      source: Array.from(source.context.getImageData(source.center.x, source.center.y, 1, 1).data),
      reprojected: rgbaAtTopLeft(reprojectPixels, working.width, working.height, source.center.x, source.center.y)
    },
    alphaTest: {
      source: Array.from(source.context.getImageData(source.center.x - 400, source.center.y + 520, 1, 1).data),
      reprojected: rgbaAtTopLeft(reprojectPixels, working.width, working.height, source.center.x - 400, source.center.y + 520)
    }
  };
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

export class ProjectionBakeRuntime {
  constructor(renderer) {
    this.renderer = renderer;
    this.resources = null;
    this.runCount = 0;
    this.disposeCount = 0;
    this.lastCompletedProfileId = null;
  }

  async ensureResources(profile) {
    if (this.resources?.profileId === profile.id) return this.resources;
    this.dispose();
    const source = createNativeSyntheticSource(profile.workingResolution.width, profile.workingResolution.height);
    const mask = await new THREE.TextureLoader().loadAsync(new URL(profile.productionMask.runtimeUrl, import.meta.url).href);
    const width = mask.image.naturalWidth || mask.image.width;
    const height = mask.image.naturalHeight || mask.image.height;
    if (width !== profile.productionMask.width || height !== profile.productionMask.height) {
      mask.dispose();
      source.texture.dispose();
      throw new Error(`Production mask dimensions must be ${profile.productionMask.width}x${profile.productionMask.height}; received ${width}x${height}.`);
    }
    mask.name = 'BLOCK6A_PRODUCTION_VALIDITY_MASK';
    mask.colorSpace = THREE.NoColorSpace;
    mask.flipY = false;
    mask.generateMipmaps = false;
    mask.minFilter = THREE.LinearFilter;
    mask.magFilter = THREE.LinearFilter;
    mask.wrapS = THREE.ClampToEdgeWrapping;
    mask.wrapT = THREE.ClampToEdgeWrapping;
    mask.needsUpdate = true;
    const fullWhiteMask = makeScalarMaskTexture('BLOCK6A_FULL_WHITE_CONTROL_MASK', 1, 1, [255]);
    const syntheticMask = makeScalarMaskTexture(
      'BLOCK6A_SYNTHETIC_SCALAR_MASK',
      2,
      2,
      [0, 128, 255, 64]
    );
    const visibilityUvTexture = makeUvCoordinateTexture();

    const visibilityTarget = makeTarget(profile.workingResolution.width, profile.workingResolution.height, { depth: true });
    visibilityTarget.texture.minFilter = THREE.NearestFilter;
    visibilityTarget.texture.magFilter = THREE.NearestFilter;
    const bakeTarget = makeTarget(profile.canonicalResolution.width, profile.canonicalResolution.height);
    const reprojectTarget = makeTarget(profile.workingResolution.width, profile.workingResolution.height, { depth: true });
    this.resources = {
      profileId: profile.id,
      source,
      mask,
      fullWhiteMask,
      syntheticMask,
      visibilityUvTexture,
      visibilityTarget,
      bakeTarget,
      reprojectTarget
    };
    return this.resources;
  }

  async run({ profile, surfaceMeshes, previewCanvases, repetitions = 1, maskMode = 'production' }) {
    if (!Array.isArray(surfaceMeshes) || surfaceMeshes.length === 0) throw new Error('Projection Bake requires at least one bound Surface mesh.');
    for (const mesh of surfaceMeshes) {
      if (!mesh.geometry?.getAttribute('uv')) throw new Error(`Surface ${mesh.name} has no authored TEXCOORD_0.`);
    }
    const resources = await this.ensureResources(profile);
    const validityMask = maskMode === 'full-white'
      ? resources.fullWhiteMask
      : (maskMode === 'synthetic' ? resources.syntheticMask : resources.mask);
    if (!['production', 'full-white', 'synthetic'].includes(maskMode)) {
      throw new Error(`Unknown Projection Bake mask mode: ${maskMode}`);
    }
    const camera = calibrationCamera(profile.calibrationCamera);
    const visibilityMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: resources.visibilityUvTexture,
      vertexColors: false,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: true,
      transparent: false,
      toneMapped: false
    });
    const bakeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        sourceTexture: { value: resources.source.texture },
        visibilitySurfaceId: { value: resources.visibilityTarget.texture },
        validityMask: { value: validityMask },
        visibilityUvEpsilon: { value: VISIBILITY_UV_EPSILON },
        visibilityTexelSize: {
          value: new THREE.Vector2(
            1 / profile.workingResolution.width,
            1 / profile.workingResolution.height
          )
        }
      },
      vertexShader: bakeVertexShader,
      fragmentShader: bakeFragmentShader,
      side: THREE.DoubleSide,
      transparent: false,
      blending: THREE.NoBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    const reprojectMaterial = new THREE.ShaderMaterial({
      uniforms: { canonicalTexture: { value: resources.bakeTarget.texture } },
      vertexShader: reprojectVertexShader,
      fragmentShader: reprojectFragmentShader,
      side: THREE.DoubleSide,
      transparent: false,
      blending: THREE.NoBlending,
      depthTest: true,
      depthWrite: true,
      toneMapped: false
    });
    const visibility = makeSurfaceScene(surfaceMeshes, visibilityMaterial);
    const bake = makeSurfaceScene(surfaceMeshes, bakeMaterial);
    const reproject = makeSurfaceScene(surfaceMeshes, reprojectMaterial);
    const rendererState = snapshotRenderer(this.renderer);
    const textureCounts = [];
    try {
      this.renderer.setPixelRatio(1);
      this.renderer.xr.enabled = false;
      this.renderer.autoClear = true;
      this.renderer.toneMapping = THREE.NoToneMapping;
      this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      this.renderer.setScissorTest(false);
      for (let index = 0; index < repetitions; index += 1) {
        this.renderer.setRenderTarget(resources.visibilityTarget);
        this.renderer.setViewport(0, 0, profile.workingResolution.width, profile.workingResolution.height);
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.clear(true, true, false);
        this.renderer.render(visibility.scene, camera);

        this.renderer.setRenderTarget(resources.bakeTarget);
        this.renderer.setViewport(0, 0, profile.canonicalResolution.width, profile.canonicalResolution.height);
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.clear(true, false, false);
        this.renderer.render(bake.scene, camera);

        this.renderer.setRenderTarget(resources.reprojectTarget);
        this.renderer.setViewport(0, 0, profile.workingResolution.width, profile.workingResolution.height);
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.clear(true, true, false);
        this.renderer.render(reproject.scene, camera);
        this.renderer.getContext().finish();
        this.runCount += 1;
        textureCounts.push(this.renderer.info.memory.textures);
      }
      const bakePixels = readTarget(this.renderer, resources.bakeTarget);
      const reprojectPixels = readTarget(this.renderer, resources.reprojectTarget);
      const visibilityProbePixels = new Uint8Array(4);
      this.renderer.readRenderTargetPixels(
        resources.visibilityTarget,
        Math.floor(profile.workingResolution.width / 2),
        Math.floor(profile.workingResolution.height / 2),
        1,
        1,
        visibilityProbePixels
      );
      const probeRaycaster = new THREE.Raycaster();
      probeRaycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      const probeHit = probeRaycaster.intersectObjects(surfaceMeshes, false)[0] || null;
      if (previewCanvases) {
        drawSourcePreview(previewCanvases.source, resources.source.canvas);
        drawTargetPreview(previewCanvases.bake, bakePixels, profile.canonicalResolution.width, profile.canonicalResolution.height);
        drawTargetPreview(previewCanvases.reproject, reprojectPixels, profile.workingResolution.width, profile.workingResolution.height);
      }
      this.lastCompletedProfileId = profile.id;
      return {
        profileId: profile.id,
        familyId: profile.familyId,
        surfaceNames: surfaceMeshes.map((mesh) => mesh.name),
        camera: {
          fov: camera.fov,
          aspect: camera.aspect,
          position: camera.position.toArray(),
          quaternion: camera.quaternion.toArray()
        },
        mask: {
          mode: maskMode,
          status: maskMode === 'production' ? profile.productionMask.status : `${maskMode.toUpperCase()}_CONTROL`,
          fileName: maskMode === 'production' ? profile.productionMask.fileName : null,
          width: maskMode === 'production' ? profile.productionMask.width : validityMask.image.width,
          height: maskMode === 'production' ? profile.productionMask.height : validityMask.image.height,
          colorSpace: profile.productionMask.colorSpace,
          flipY: validityMask.flipY,
          interpretation: profile.productionMask.meaning
        },
        visibility: {
          policy: profile.validity.operation,
          environmentDepthIncluded: false,
          method: 'HARDWARE_DEPTH_FRONTMOST_AUTHORED_UV_NEAREST_3X3',
          uvEpsilon: VISIBILITY_UV_EPSILON,
          centerProbe: {
            gpuBytes: Array.from(visibilityProbePixels),
            gpuUv: [visibilityProbePixels[0] / 255, visibilityProbePixels[1] / 255],
            cpuRaycastUv: probeHit?.uv?.toArray() || null,
            meshName: probeHit?.object?.name || null
          }
        },
        uvPolicy: profile.surfaceBinding.uvPolicy,
        canonicalOrientation: profile.canonicalOrientation,
        colorPolicy: 'RAW_RGBA_NO_TONE_MAPPING_MASK_LINEAR_SCALAR',
        resourcePolicy: {
          reusableTargets: true,
          runCount: this.runCount,
          disposeCount: this.disposeCount,
          textureCounts,
          stableAcrossRuns: Math.max(...textureCounts) - Math.min(...textureCounts) <= 1
        },
        ...analyze(profile, resources.source, bakePixels, reprojectPixels)
      };
    } finally {
      restoreRenderer(this.renderer, rendererState);
      visibilityMaterial.dispose();
      bakeMaterial.dispose();
      reprojectMaterial.dispose();
    }
  }

  previewDataUrls(previewCanvases) {
    return {
      source: previewCanvases.source.toDataURL('image/png'),
      bake: previewCanvases.bake.toDataURL('image/png'),
      reproject: previewCanvases.reproject.toDataURL('image/png')
    };
  }

  fullSourceDataUrl() {
    if (!this.hasOutputs()) throw new Error('Run the Projection Bake before exporting PNG files.');
    return this.resources.source.canvas.toDataURL('image/png');
  }

  hasOutputs() {
    return Boolean(this.resources && this.lastCompletedProfileId === this.resources.profileId);
  }

  async exportPng(kind) {
    if (!this.hasOutputs()) throw new Error('Run the Projection Bake before exporting PNG files.');
    const exports = {
      source: {
        fileName: 'Block6A_Source_3000x3840.png',
        canvas: this.resources.source.canvas
      },
      bake: {
        fileName: 'Block6A_CanonicalBake_4728x5760.png',
        target: this.resources.bakeTarget
      },
      reproject: {
        fileName: 'Block6A_Reprojected_3000x3840.png',
        target: this.resources.reprojectTarget
      }
    };
    const selected = exports[kind];
    if (!selected) throw new Error(`Unknown Projection Bake PNG export: ${kind}`);
    const canvas = selected.canvas || targetToTopLeftCanvas(this.renderer, selected.target);
    try {
      const blob = await canvasToPngBlob(canvas);
      return {
        kind,
        fileName: selected.fileName,
        width: canvas.width,
        height: canvas.height,
        mimeType: blob.type,
        bytes: blob.size,
        blob
      };
    } finally {
      if (!selected.canvas) {
        canvas.width = 1;
        canvas.height = 1;
      }
    }
  }

  dispose() {
    if (!this.resources) return;
    this.resources.source.texture.dispose();
    this.resources.mask.dispose();
    this.resources.fullWhiteMask.dispose();
    this.resources.syntheticMask.dispose();
    this.resources.visibilityUvTexture.dispose();
    this.resources.visibilityTarget.dispose();
    this.resources.bakeTarget.dispose();
    this.resources.reprojectTarget.dispose();
    this.resources = null;
    this.lastCompletedProfileId = null;
    this.disposeCount += 1;
  }
}
