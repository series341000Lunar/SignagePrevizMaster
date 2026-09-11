const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

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

export const ANAMORPHIC_FAMILY_AVAILABILITY = deepFreeze({
  [ANAMORPHIC_FAMILY_IDS.FRONT_75F]: { available: true, profile: ANAMORPHIC_FRONT_75F_PROFILE },
  [ANAMORPHIC_FAMILY_IDS.BACK]: { available: false, status: 'NOT_AVAILABLE' },
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
