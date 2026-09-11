const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

const deriveFovDegrees = (verticalFov, aspect) => {
  const verticalRadians = verticalFov * Math.PI / 180;
  const horizontalRadians = 2 * Math.atan(Math.tan(verticalRadians / 2) * aspect);
  const diagonalRadians = 2 * Math.atan(
    Math.tan(verticalRadians / 2) * Math.sqrt(1 + aspect * aspect)
  );
  return {
    horizontal: horizontalRadians * 180 / Math.PI,
    diagonal: diagonalRadians * 180 / Math.PI
  };
};

const BACK_ANAMORPHIC_WIDTH = 2100;
const BACK_ANAMORPHIC_HEIGHT = 3840;
const BACK_ANAMORPHIC_VERTICAL_FOV = 18.374;
const BACK_ANAMORPHIC_ASPECT = BACK_ANAMORPHIC_WIDTH / BACK_ANAMORPHIC_HEIGHT;
const BACK_ANAMORPHIC_DERIVED_FOV = deriveFovDegrees(
  BACK_ANAMORPHIC_VERTICAL_FOV,
  BACK_ANAMORPHIC_ASPECT
);

export const BACK_ANAMORPHIC_CALIBRATION = deepFreeze({
  width: BACK_ANAMORPHIC_WIDTH,
  height: BACK_ANAMORPHIC_HEIGHT,
  aspect: BACK_ANAMORPHIC_ASPECT,
  horizontalFov: 10.109,
  verticalFov: BACK_ANAMORPHIC_VERTICAL_FOV,
  diagonalFov: 20.889,
  derivedHorizontalFov: BACK_ANAMORPHIC_DERIVED_FOV.horizontal,
  derivedDiagonalFov: BACK_ANAMORPHIC_DERIVED_FOV.diagonal,
  consistencyToleranceDegrees: 0.01
});

export const ANAMORPHIC_FAMILY_IDS = deepFreeze({
  FRONT_75F: 'ANAMORPHIC_FRONT_75F',
  BACK: 'ANAMORPHIC_BACK',
  ILMIN_AQUBE: 'ANAMORPHIC_ILMIN_AQUBE',
  FRONT_90F: 'ANAMORPHIC_FRONT_90F'
});

export const ANAMORPHIC_FRONT_75F_PROFILE = deepFreeze({
  familyId: ANAMORPHIC_FAMILY_IDS.FRONT_75F,
  revision: 'v01',
  asset: {
    sourcePath: '3DAsset/Signage/Previz_3DWorld_Anamorphic_Front75F_v01.glb',
    fileName: 'Previz_3DWorld_Anamorphic_Front75F_v01.glb',
    runtimeUrl: './assets/site/Previz_3DWorld_Anamorphic_Front75F_v01.glb',
    observedBytes: 1193472,
    observedSha256: '47B2BD9256363E8FF7527E08A23B5AB31543D7019C123E80E9B1A7385D821EBF',
    expectedExactNodes: [
      'ANAM_SURFACE_FRONT75F',
      'CALCAM_FRONT75F_PIVOT',
      'CALCAM_FRONT75F_HEADING',
      'CALCAM_FRONT75F_LOOKAT',
      'CALCAM_FRONT75F_LOOKAT_COLLISION'
    ],
    revisionPolicy: 'PINNED_CURRENT_CALIBRATION_REVISION'
  },
  surface: {
    surfaceRole: 'LUUX_FRONT_ANAMORPHIC',
    surfaceNode: 'ANAM_SURFACE_FRONT75F',
    selectorPolicy: 'EXACT_NAME_ONLY',
    uvChannel: 'TEXCOORD_0',
    observedUvBounds: {
      min: [0.17526650428771973, 0.018039584159851074],
      max: [0.841627299785614, 0.9585243463516235]
    },
    observedWorldBounds: {
      min: [-0.9664944549632253, 2.3737626634462856, -0.7911435242523623],
      max: [2.3063221067372126, 8.420763438944647, 0.9249853185508838]
    },
    uvPolicy: 'PRESERVE_AUTHORED_NO_REMAP',
    photoshopPointStatus: 'DEFERRED_CANONICAL_INVERSE_MAPPING_UNPROVEN'
  },
  camera: {
    sourceSystem: '3DS_MAX_VRAY_CENTIMETER',
    sourcePosition: [-89.453, -160.851, 1.063],
    sourceRotationReference: {
      xDegrees: 105.892,
      yDegrees: -0.52,
      zDegrees: -31.225,
      semantic: 'PITCH_UP_15_892_ROLL_MINUS_0_52_HEADING_CLOCKWISE_31_225'
    },
    sourceFov: 15.52,
    sourceFovBasis: 'HORIZONTAL_3DS_MAX_DEFAULT_CAMERA_USER_CONFIRMED',
    sourceFovDegrees: {
      horizontal: 15.52,
      vertical: 19.778,
      diagonal: 24.962
    },
    maxToGltfPositionFormula: 'GLB=(Max.x*0.1,Max.z*0.1,-Max.y*0.1)',
    maxToGltfPositionExpected: [-8.9453, 0.1063, 16.0851],
    maxToGltfPositionObservedDelta: [-0.00001726837158066985, -0.000010479140281683, 0.00003641357421813],
    helperAxisMapping: {
      sourceForward: 'MAX_LOCAL_NEGATIVE_Z',
      observedGltfForward: 'NEGATIVE_HELPER_LOCAL_Y',
      runtimeRight: 'POSITIVE_HELPER_LOCAL_X',
      runtimeUp: 'NEGATIVE_HELPER_LOCAL_Z',
      helperScalePolicy: 'IGNORED'
    },
    helperWorldTransforms: {
      pivot: {
        node: 'CALCAM_FRONT75F_PIVOT',
        position: [-8.945317268371582, 0.10628952085971832, 16.08513641357422],
        quaternion: [0.7678781151771545, -0.15868030488491058, 0.2174171507358551, 0.5813034772872925],
        scaleObservedIgnored: [0.0010000001639127731, 0.0010000000474974513, 0.0010000000474974513]
      },
      heading: {
        node: 'CALCAM_FRONT75F_HEADING',
        position: [-8.945317268371582, 0.10628966987133026, 16.08513641357422]
      },
      lookAt: {
        node: 'CALCAM_FRONT75F_LOOKAT',
        position: [-8.2006196975708, 0.5170111060142517, 14.849531173706055],
        distanceFromPivot: 1.4999956670797754
      },
      collision: {
        node: 'CALCAM_FRONT75F_LOOKAT_COLLISION',
        position: [0.24541503190994263, 5.172914981842041, 0.8358093500137329],
        distanceFromPivot: 18.511678196985564
      }
    },
    runtimePosition: [-8.945317268371582, 0.10628952085971832, 16.08513641357422],
    runtimeForward: [0.49646483878426617, 0.27381396846000244, -0.8237405990523335],
    runtimeRight: [0.855100663389033, 0.009076424379118734, 0.5183825556402587],
    runtimeUp: [-0.149416883078429, 0.9617398529147221, 0.2296324244672253],
    runtimeQuaternion: [0.13192827439065186, -0.26594105628169623, 0.04153321753635798, 0.9540153451800564],
    runtimeTarget: [0.24541503190994263, 5.172914981842041, 0.8358093500137329],
    runtimeFov: 19.778,
    runtimeFovBasis: 'VERTICAL_THREE_FROM_3DS_MAX_USER_CONFIRMED',
    runtimeAspect: 0.78125,
    runtimeAspectBasis: 'FRONT75F_CALIBRATION_USER_CONFIRMED',
    fovCandidates: {
      directVerticalThree: 15.52,
      horizontalSourceToVerticalThree: 19.788875056232293,
      maxReportedVertical: 19.778,
      maxReportedDiagonal: 24.962
    },
    aspectUsed: 0.78125,
    conversionFormula: 'vertical=2*atan(tan(horizontal/2)/aspect)',
    roll: {
      sourceDegrees: -0.52,
      observedMagnitudeDegrees: 0.5200479505464229,
      status: 'USER_VISUALLY_VALIDATED'
    },
    near: 0.01,
    far: 10000,
    calibrationStatus: 'USER_VALIDATED',
    visualValidationState: 'PASS',
    validationDate: '2026-09-11'
  },
  workingResolution: { width: 3000, height: 3840, aspect: 0.78125 },
  finalOutput: { id: 'LUUX_FINAL_MASTER', width: 4728, height: 5760, immutable: true }
});

export const ANAMORPHIC_BACK_PROFILE = deepFreeze({
  familyId: ANAMORPHIC_FAMILY_IDS.BACK,
  revision: 'v01',
  asset: {
    sourcePath: '3DAsset/Signage/Previz_3DWorld_Anamorphic_Back_v01.glb',
    fileName: 'Previz_3DWorld_Anamorphic_Back_v01.glb',
    runtimeUrl: './assets/site/Previz_3DWorld_Anamorphic_Back_v01.glb',
    observedBytes: 1193468,
    observedSha256: 'C149B914836177BF4737FA11A03A2A6447F626D1E09700B4FD79C7C6EE027AA3',
    expectedExactNodes: [
      'ANAM_SURFACE_BACK',
      'CALCAM_BACK_PIVOT',
      'CALCAM_BACK_HEADING',
      'CALCAM_BACK_LOOKAT',
      'CALCAM_BACK_LOOKAT_COLLISION'
    ],
    revisionPolicy: 'PINNED_CURRENT_CALIBRATION_REVISION'
  },
  surface: {
    surfaceRole: 'LUUX_BACK_ANAMORPHIC',
    surfaceNode: 'ANAM_SURFACE_BACK',
    selectorPolicy: 'EXACT_NAME_ONLY',
    uvChannel: 'TEXCOORD_0',
    observedUvBounds: {
      min: [0.11508843302726746, 0.01731288433074951],
      max: [0.7319519519805908, 1.031404972076416]
    },
    observedWorldBounds: {
      min: [-0.9664944549632253, 2.3737626634462856, -0.7911435242523623],
      max: [2.3063221067372126, 8.420763438944647, 0.9249853185508838]
    },
    uvPolicy: 'PRESERVE_AUTHORED_NO_REMAP',
    photoshopPointStatus: 'DEFERRED_CANONICAL_INVERSE_MAPPING_UNPROVEN'
  },
  camera: {
    sourceSystem: '3DS_MAX_VRAY_CENTIMETER',
    sourcePosition: [-121.231, 145.405, 1.561],
    sourceRotationReference: {
      xDegrees: -74.241,
      yDegrees: 179.921,
      zDegrees: 39.326,
      semantic: 'PITCH_UP_15_759_ROLL_MINUS_0_079_HEADING_COUNTERCLOCKWISE_39_326_SOUTHEAST'
    },
    sourceFov: BACK_ANAMORPHIC_CALIBRATION.horizontalFov,
    sourceFovBasis: 'HORIZONTAL_3DS_MAX_DEFAULT_CAMERA_USER_PROVIDED',
    sourceFovDegrees: {
      horizontal: BACK_ANAMORPHIC_CALIBRATION.horizontalFov,
      vertical: BACK_ANAMORPHIC_CALIBRATION.verticalFov,
      diagonal: BACK_ANAMORPHIC_CALIBRATION.diagonalFov
    },
    maxToGltfPositionFormula: 'GLB=(Max.x*0.1,Max.z*0.1,-Max.y*0.1)',
    maxToGltfPositionExpected: [-12.1231, 0.1561, -14.5405],
    maxToGltfPositionObservedDelta: [-0.00004414978027256211, 0.0035423387527465933, 0.0031855850219724147],
    helperAxisMapping: {
      sourceForward: 'MAX_LOCAL_NEGATIVE_Z',
      observedGltfForward: 'NEGATIVE_HELPER_LOCAL_Y',
      runtimeRight: 'POSITIVE_HELPER_LOCAL_X',
      runtimeUp: 'NEGATIVE_HELPER_LOCAL_Z',
      helperScalePolicy: 'IGNORED'
    },
    helperWorldTransforms: {
      pivot: {
        node: 'CALCAM_BACK_PIVOT',
        position: [-12.123144149780273, 0.15964233875274658, -14.537314414978027],
        quaternion: [0.2687007784843445, -0.5684854984283447, 0.750731885433197, 0.20254860818386078],
        scaleObservedIgnored: [0.0010000000474974513, 0.0010000000474974513, 0.0010000000474974513]
      },
      heading: {
        node: 'CALCAM_BACK_HEADING',
        position: [-12.123144149780273, 0.15964478254318237, -14.537314414978027]
      },
      lookAt: {
        node: 'CALCAM_BACK_LOOKAT',
        position: [-11.208710670471191, 0.5670391917228699, -13.420244216918945],
        distanceFromPivot: 1.5000022037593914,
        directionAngleToHelperDegrees: 0.00020478468811542985
      },
      collision: {
        node: 'CALCAM_BACK_LOOKAT_COLLISION',
        position: [-0.7054473757743835, 5.246401309967041, -0.5895642042160034],
        distanceFromPivot: 18.72908573305664,
        directionAngleToHelperDegrees: 0.000034764421610577404,
        distancePolicy: 'VARIABLE_NOT_CONTRACTUAL'
      }
    },
    runtimePosition: [-12.123144149780273, 0.15964233875274658, -14.537314414978027],
    runtimeForward: [0.6096242550704305, 0.27159688466202914, 0.7447102791500217],
    runtimeRight: [-0.7735480144386598, -0.0013855945174790836, 0.6337361828756821],
    runtimeUp: [-0.1731525674840368, 0.962410186074234, -0.20924823085093122],
    runtimeQuaternion: [-0.046776645465416274, 0.9328274893511691, -0.12886764266448236, -0.3332235754323166],
    runtimeTarget: [-0.7054473757743835, 5.246401309967041, -0.5895642042160034],
    runtimeFov: BACK_ANAMORPHIC_CALIBRATION.verticalFov,
    runtimeFovBasis: 'VERTICAL_THREE_CORRECTED_USER_CALIBRATION',
    runtimeAspect: BACK_ANAMORPHIC_CALIBRATION.aspect,
    runtimeAspectBasis: 'BACK_2100_X_3840_CORRECTED_USER_CALIBRATION',
    fovCandidates: {
      reportedHorizontal: BACK_ANAMORPHIC_CALIBRATION.horizontalFov,
      reportedVertical: BACK_ANAMORPHIC_CALIBRATION.verticalFov,
      reportedDiagonal: BACK_ANAMORPHIC_CALIBRATION.diagonalFov,
      derivedHorizontal: BACK_ANAMORPHIC_CALIBRATION.derivedHorizontalFov,
      derivedDiagonal: BACK_ANAMORPHIC_CALIBRATION.derivedDiagonalFov,
      consistencyToleranceDegrees: BACK_ANAMORPHIC_CALIBRATION.consistencyToleranceDegrees
    },
    aspectUsed: BACK_ANAMORPHIC_CALIBRATION.aspect,
    conversionFormula: 'horizontal=2*atan(tan(vertical/2)*aspect); diagonal=2*atan(tan(vertical/2)*sqrt(1+aspect^2))',
    roll: {
      sourceDegrees: -0.079,
      observedMagnitudeDegrees: 0.08249571242651117,
      status: 'USER_VISUALLY_VALIDATED'
    },
    near: 0.01,
    far: 10000,
    calibrationStatus: 'APPROVED',
    visualValidationState: 'PASS',
    validationDate: '2026-09-11'
  },
  workingResolution: {
    width: BACK_ANAMORPHIC_CALIBRATION.width,
    height: BACK_ANAMORPHIC_CALIBRATION.height,
    aspect: BACK_ANAMORPHIC_CALIBRATION.aspect
  },
  finalOutput: { id: 'LUUX_FINAL_MASTER', width: 4728, height: 5760, immutable: true }
});

export const ANAMORPHIC_FAMILY_AVAILABILITY = deepFreeze({
  [ANAMORPHIC_FAMILY_IDS.FRONT_75F]: { available: true, profile: ANAMORPHIC_FRONT_75F_PROFILE },
  [ANAMORPHIC_FAMILY_IDS.BACK]: { available: true, profile: ANAMORPHIC_BACK_PROFILE },
  [ANAMORPHIC_FAMILY_IDS.ILMIN_AQUBE]: { available: false, status: 'NOT_AVAILABLE' },
  [ANAMORPHIC_FAMILY_IDS.FRONT_90F]: { available: false, status: 'NOT_AVAILABLE' }
});

export function horizontalToVerticalFov(horizontalDegrees, aspect) {
  if (!Number.isFinite(horizontalDegrees) || horizontalDegrees <= 0 || horizontalDegrees >= 180) {
    throw new RangeError('Horizontal FOV must be finite and between 0 and 180 degrees.');
  }
  if (!Number.isFinite(aspect) || aspect <= 0) throw new RangeError('Aspect must be finite and positive.');
  const radians = horizontalDegrees * Math.PI / 180;
  return 2 * Math.atan(Math.tan(radians / 2) / aspect) * 180 / Math.PI;
}

export function maxPositionToGltf(position, scale = 0.1) {
  if (!Array.isArray(position) || position.length !== 3 || !position.every(Number.isFinite)) {
    throw new TypeError('A finite Max XYZ position is required.');
  }
  return [position[0] * scale, position[2] * scale, -position[1] * scale];
}
