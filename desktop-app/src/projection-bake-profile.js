import { ANAMORPHIC_FRONT_75F_PROFILE } from './anamorphic-calibration-profile.js';

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

export const PROJECTION_BAKE_PROFILE = deepFreeze({
  id: 'FRONT_75F_NATIVE_CANONICAL_BAKE_POC',
  familyId: ANAMORPHIC_FRONT_75F_PROFILE.familyId,
  surfaceBinding: {
    exactName: ANAMORPHIC_FRONT_75F_PROFILE.surface.surfaceNode,
    uvChannel: ANAMORPHIC_FRONT_75F_PROFILE.surface.uvChannel,
    uvPolicy: ANAMORPHIC_FRONT_75F_PROFILE.surface.uvPolicy
  },
  calibrationCamera: ANAMORPHIC_FRONT_75F_PROFILE.camera,
  workingResolution: ANAMORPHIC_FRONT_75F_PROFILE.workingResolution,
  canonicalResolution: ANAMORPHIC_FRONT_75F_PROFILE.finalOutput,
  canonicalOrientation: {
    origin: 'TOP_LEFT',
    xAxis: 'LEFT_TO_RIGHT',
    yAxis: 'TOP_TO_BOTTOM',
    gpuUvBridge: 'CANONICAL_TOP_LEFT_TO_FRAMEBUFFER_TOP_WITH_EXPLICIT_REPROJECT_V_FLIP'
  },
  source: {
    kind: 'SYNTHETIC_NATIVE_RGBA',
    manualRunOnly: true,
    includes: [
      'OUTER_BORDER',
      'CENTER_CROSSHAIR',
      'HORIZONTAL_VERTICAL_GRID',
      'FOUR_CORNER_COLOR_MARKERS',
      'CENTER_COLOR_MARKER',
      'ASYMMETRIC_ORIENTATION_SYMBOL',
      'ALPHA_TEST_SHAPE'
    ]
  },
  validity: {
    operation: 'SURFACE_SELF_VISIBILITY_MULTIPLY_PROJECT_VALIDITY_MASK',
    environmentDepthIncluded: false,
    backfacePolicy: 'CAMERA_DEPTH_VISIBILITY_FIRST',
    fullWhiteRole: 'AUTOMATED_CONTROL_AND_DIAGNOSTIC_FALLBACK_ONLY'
  },
  productionMask: {
    status: 'PRODUCTION_REFERENCE_SUPPLIED',
    sourcePath: '2DAsset/Mask/Mask_Basic_Feather0P025.png',
    fileName: 'Mask_Basic_Feather0P025.png',
    runtimeUrl: './assets/projection/Mask_Basic_Feather0P025.png',
    width: 4728,
    height: 5760,
    sha256: '4FC06C07073CB0A7CC4FE8DF27274E1605645C6409752E8A221351440870AA22',
    sourceBitsPerSample: 16,
    sourceChannels: 4,
    colorSpace: 'NO_COLOR_SPACE_LINEAR_SCALAR',
    meaning: { black: 0, white: 1, gray: 'ALPHA_MULTIPLIER_FEATHER' },
    replaceableFutureInput: true
  },
  renderTargets: {
    source: '3000x3840_RGBA_NATIVE',
    visibility: '3000x3840_DEPTH_SURFACE_ONLY',
    canonical: '4728x5760_RGBA_NATIVE',
    reproject: '3000x3840_RGBA_NATIVE'
  }
});

export function validateProjectionBakeProfile(profile = PROJECTION_BAKE_PROFILE) {
  const errors = [];
  if (profile.familyId !== 'ANAMORPHIC_FRONT_75F') errors.push('familyId');
  if (profile.surfaceBinding.exactName !== 'ANAM_SURFACE_FRONT75F') errors.push('surfaceBinding');
  if (profile.surfaceBinding.uvPolicy !== 'PRESERVE_AUTHORED_NO_REMAP') errors.push('uvPolicy');
  if (profile.workingResolution.width !== 3000 || profile.workingResolution.height !== 3840) errors.push('workingResolution');
  if (profile.canonicalResolution.width !== 4728 || profile.canonicalResolution.height !== 5760) errors.push('canonicalResolution');
  if (profile.calibrationCamera.runtimeFov !== 19.778 || profile.calibrationCamera.runtimeAspect !== 0.78125) errors.push('camera');
  if (profile.productionMask.width !== 4728 || profile.productionMask.height !== 5760) errors.push('productionMaskResolution');
  if (profile.validity.environmentDepthIncluded !== false) errors.push('environmentDepthPolicy');
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
