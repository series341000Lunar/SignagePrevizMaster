import {
  ANAMORPHIC_BACK_PROFILE,
  ANAMORPHIC_FAMILY_IDS,
  ANAMORPHIC_FRONT_75F_PROFILE
} from './anamorphic-calibration-profile.js';

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

const CANONICAL_ORIENTATION = {
  origin: 'TOP_LEFT',
  xAxis: 'LEFT_TO_RIGHT',
  yAxis: 'TOP_TO_BOTTOM',
  gpuUvBridge: 'CANONICAL_TOP_LEFT_TO_FRAMEBUFFER_TOP_WITH_EXPLICIT_REPROJECT_V_FLIP'
};

const SOURCE_CONTENT = [
  'OUTER_BORDER',
  'CENTER_CROSSHAIR',
  'HORIZONTAL_VERTICAL_GRID',
  'FOUR_CORNER_COLOR_MARKERS',
  'CENTER_COLOR_MARKER',
  'ASYMMETRIC_ORIENTATION_SYMBOL',
  'ALPHA_TEST_SHAPE'
];

const VALIDITY = {
  operation: 'SURFACE_SELF_VISIBILITY_MULTIPLY_PROJECT_VALIDITY_MASK',
  environmentDepthIncluded: false,
  backfacePolicy: 'CAMERA_DEPTH_VISIBILITY_FIRST',
  fullWhiteRole: 'AUTOMATED_CONTROL_AND_DIAGNOSTIC_FALLBACK_ONLY'
};

const MASK_MEANING = { black: 0, white: 1, gray: 'ALPHA_MULTIPLIER_FEATHER' };

function makeProfile({ id, slug, label, calibration, productionMask, block6AUserValidation = null }) {
  const { width, height } = calibration.workingResolution;
  return {
    id,
    familyId: calibration.familyId,
    familySlug: slug,
    label,
    block6AUserValidation,
    block6BUserValidation: 'PASS_CLOSED',
    surfaceBinding: {
      exactName: calibration.surface.surfaceNode,
      uvChannel: calibration.surface.uvChannel,
      uvPolicy: calibration.surface.uvPolicy
    },
    calibrationCamera: calibration.camera,
    workingResolution: calibration.workingResolution,
    canonicalResolution: calibration.finalOutput,
    canonicalOrientation: CANONICAL_ORIENTATION,
    source: {
      kind: 'SYNTHETIC_NATIVE_RGBA',
      label: `TOP ${label} →`,
      manualRunOnly: true,
      includes: SOURCE_CONTENT
    },
    validity: VALIDITY,
    productionMask,
    renderTargets: {
      source: `${width}x${height}_RGBA_NATIVE`,
      direct: `${width}x${height}_RGBA_NATIVE`,
      visibility: `${width}x${height}_DEPTH_SURFACE_ONLY`,
      canonical: '4728x5760_RGBA_NATIVE',
      reproject: `${width}x${height}_RGBA_NATIVE`
    }
  };
}

const sharedProductionMask = {
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
  meaning: MASK_MEANING,
  sourceOfTruth: 'SHARED_PRODUCTION_MASK',
  scalarOperation: 'IDENTITY_LINEAR_SCALAR',
  replaceableFutureInput: true,
  fallback: null
};

const frontMask = { ...sharedProductionMask };
const backMask = {
  ...sharedProductionMask,
  status: 'SHARED_PRODUCTION_REFERENCE_INVERTED',
  scalarOperation: 'EXACT_LINEAR_ONE_MINUS_SHARED_PRODUCTION_MASK'
};

export const PROJECTION_BAKE_PROFILES = deepFreeze({
  [ANAMORPHIC_FAMILY_IDS.FRONT_75F]: makeProfile({
    id: 'FRONT_75F_NATIVE_CANONICAL_BAKE_POC',
    slug: 'FRONT75F',
    label: 'FRONT 75F',
    calibration: ANAMORPHIC_FRONT_75F_PROFILE,
    productionMask: frontMask,
    block6AUserValidation: 'PASS_CLOSED'
  }),
  [ANAMORPHIC_FAMILY_IDS.BACK]: makeProfile({
    id: 'BACK_NATIVE_CANONICAL_BAKE_POC',
    slug: 'BACK',
    label: 'BACK',
    calibration: ANAMORPHIC_BACK_PROFILE,
    productionMask: backMask
  })
});

export const PROJECTION_FAMILY_DELIVERY = deepFreeze({
  [ANAMORPHIC_FAMILY_IDS.FRONT_75F]: 'IMPLEMENTED_BLOCK7_REVERSE_TRANSPORT',
  [ANAMORPHIC_FAMILY_IDS.BACK]: 'IMPLEMENTED_BLOCK7_REVERSE_TRANSPORT',
  [ANAMORPHIC_FAMILY_IDS.ILMIN_AQUBE]: 'DEFERRED_EXTERNAL_VALIDATION',
  [ANAMORPHIC_FAMILY_IDS.FRONT_90F]: 'DEFERRED_RECALIBRATION',
  SYNC: 'NOT_SUPPLIED'
});

// Block 6A compatibility alias. It remains the approved FRONT 75F profile.
export const PROJECTION_BAKE_PROFILE = PROJECTION_BAKE_PROFILES[ANAMORPHIC_FAMILY_IDS.FRONT_75F];

export function getProjectionBakeProfile(familyId) {
  return PROJECTION_BAKE_PROFILES[familyId] || null;
}

export function validateProjectionBakeProfile(profile = PROJECTION_BAKE_PROFILE) {
  const errors = [];
  if (!profile || !PROJECTION_BAKE_PROFILES[profile.familyId]) errors.push('familyId');
  if (!profile?.surfaceBinding?.exactName) errors.push('surfaceBinding');
  if (profile?.surfaceBinding?.uvPolicy !== 'PRESERVE_AUTHORED_NO_REMAP') errors.push('uvPolicy');
  if (profile?.workingResolution?.width <= 0 || profile?.workingResolution?.height <= 0) errors.push('workingResolution');
  if (profile?.canonicalResolution?.width !== 4728 || profile?.canonicalResolution?.height !== 5760) errors.push('canonicalResolution');
  if (!Number.isFinite(profile?.calibrationCamera?.runtimeFov) || !Number.isFinite(profile?.calibrationCamera?.runtimeAspect)) errors.push('camera');
  if (profile?.productionMask?.width !== 4728 || profile?.productionMask?.height !== 5760) errors.push('productionMaskResolution');
  if (!profile?.productionMask?.runtimeUrl) errors.push('productionMaskRuntimeUrl');
  if (!['IDENTITY_LINEAR_SCALAR', 'EXACT_LINEAR_ONE_MINUS_SHARED_PRODUCTION_MASK'].includes(profile?.productionMask?.scalarOperation)) errors.push('productionMaskScalarOperation');
  if (profile?.validity?.environmentDepthIncluded !== false) errors.push('environmentDepthPolicy');
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
