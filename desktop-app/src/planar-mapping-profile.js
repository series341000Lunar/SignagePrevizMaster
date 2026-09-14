import { ANAMORPHIC_FAMILY_AVAILABILITY } from './anamorphic-calibration-profile.js';

// Delivery/output authority. The Planar input is the family-native merged Direct.
export const PLANAR_OUTPUT_PROFILE = Object.freeze({
  id: 'LUUX_PLANAR_MASTER',
  outputResolution: Object.freeze({ width: 4728, height: 5760 })
});

// Remains independent of the supported Planar GLB list so a future family (or
// simultaneous families in SYNC) can carry its own source size.
export function getFamilyCompositeResolution(familyProfile) {
  const resolution = familyProfile?.compositeResolution ?? familyProfile?.workingResolution;
  if (!Number.isInteger(resolution?.width) || resolution.width < 1 ||
      !Number.isInteger(resolution?.height) || resolution.height < 1) {
    throw new Error('PLANAR_FAMILY_RESOLUTION_UNAVAILABLE');
  }
  return { width: resolution.width, height: resolution.height };
}

function makePlanarProfile(contract) {
  const familyProfile = ANAMORPHIC_FAMILY_AVAILABILITY[contract.familyId]?.profile;
  return Object.freeze({
    ...contract,
    sourceResolution: Object.freeze(getFamilyCompositeResolution(familyProfile)),
    outputProfileId: PLANAR_OUTPUT_PROFILE.id,
    outputResolution: PLANAR_OUTPUT_PROFILE.outputResolution
  });
}

export const PLANAR_MAPPING_PROFILES = Object.freeze({
  ANAMORPHIC_FRONT_75F: makePlanarProfile({
    id: 'PLANAR_FRONT75',
    familyId: 'ANAMORPHIC_FRONT_75F',
    sourcePath: '3DAsset/Signage/Previz_3Dworld_Anamorphic_Baker_Front75F_v1.glb',
    fileName: 'Previz_3Dworld_Anamorphic_Baker_Front75F_v1.glb',
    runtimeUrl: './assets/planar/Previz_3Dworld_Anamorphic_Baker_Front75F_v1.glb',
    byteLength: 5542972,
    sha256: 'D59E406B3D63AB40ACEC10336ACF87D279A15D466B2179B74CC1A96FCBFAA85A',
    targetNode: 'SCREEN_Bake_Front'
  }),
  ANAMORPHIC_BACK: makePlanarProfile({
    id: 'PLANAR_BACK',
    familyId: 'ANAMORPHIC_BACK',
    sourcePath: '3DAsset/Signage/Previz_3Dworld_Anamorphic_Baker_Back_v1.glb',
    fileName: 'Previz_3Dworld_Anamorphic_Baker_Back_v1.glb',
    runtimeUrl: './assets/planar/Previz_3Dworld_Anamorphic_Baker_Back_v1.glb',
    byteLength: 1184988,
    sha256: 'D7A033528266C31F696ECDD088A6B9E771F993492D9847491ED21E161E4C6A61',
    targetNode: 'SCREEN_Bake_Back'
  })
});

export function getPlanarMappingProfile(familyId) {
  const profile = PLANAR_MAPPING_PROFILES[String(familyId)];
  if (!profile) throw new Error(`PLANAR_FAMILY_UNSUPPORTED: ${familyId}`);
  return profile;
}
