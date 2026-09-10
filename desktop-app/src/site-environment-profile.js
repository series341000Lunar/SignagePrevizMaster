export const ENVIRONMENT_ASSET = Object.freeze({
  assetRole: 'SITE_ENVIRONMENT',
  logicalId: 'luux-site-background',
  revisionPolicy: 'MUTABLE_INFORMATIONAL_FINGERPRINT',
  sourcePath: '3DAsset/BG/Previz_3Dworld_Background_v02.glb',
  fileName: 'Previz_3Dworld_Background_v02.glb',
  runtimeUrl: './assets/environment/Previz_3Dworld_Background_v02.glb',
  coordinatePolicy: 'DIRECT_NO_CONVERSION',
  observedFingerprint: Object.freeze({
    byteLength: 31308864,
    sha256: '4BD63E5A5650DE910A0AEDCB9910CB76561D4C85C9BCBABEC4751E706BA52216',
    gltfVersion: 2,
    generator: 'Khronos glTF Blender I/O v5.2.39',
    scenes: 1,
    nodes: 18,
    meshes: 18,
    materials: 1,
    cameras: 0,
    animations: 0,
    primitives: 18
  })
});

export const ENVIRONMENT_VISIBILITY = Object.freeze({
  excludedExactNodes: Object.freeze([
    'ILMIN_Back_3Dworld_Basic',
    'ILMIN_Back_Cropped',
    'ILMIN_BackNight',
    'LUUX_Back',
    'LUUX_BackNight',
    'LUUX_Front_3Dworld_Basic',
    'LUUX_Front_3Dworld_Basic_Nouse',
    'LUUX_Front_Cropped'
  ]),
  optionalIncludedExactNodes: Object.freeze([]),
  selectorPolicy: 'EXACT_ONLY_NO_FUZZY_SIGNAGE_SELECTOR'
});

export const ENVIRONMENT_PRESENTATIONS = Object.freeze({
  day: Object.freeze({
    id: 'day',
    label: 'DAY',
    clearColor: 0x747b84,
    materialColor: 0xb9bec5,
    hemisphereSkyColor: 0xf1f3f5,
    hemisphereGroundColor: 0x646a70,
    hemisphereIntensity: 1.55,
    directionalColor: 0xffffff,
    directionalIntensity: 1.8
  }),
  night: Object.freeze({
    id: 'night',
    label: 'NIGHT',
    clearColor: 0x171b22,
    materialColor: 0x858b94,
    hemisphereSkyColor: 0x566070,
    hemisphereGroundColor: 0x11141a,
    hemisphereIntensity: 0.55,
    directionalColor: 0xaebbd0,
    directionalIntensity: 0.7
  })
});

export const SITE_ENVIRONMENT_PROFILE = Object.freeze({
  id: 'luux-site-environment-v1',
  asset: ENVIRONMENT_ASSET,
  visibility: ENVIRONMENT_VISIBILITY,
  presentations: ENVIRONMENT_PRESENTATIONS,
  defaultPresentation: 'day',
  material: Object.freeze({
    type: 'MeshStandardMaterial',
    roughness: 1,
    metalness: 0,
    side: 'DoubleSide',
    sourceMaterialsIgnored: true
  }),
  pointPolicy: Object.freeze({
    raycastTarget: false,
    occluder: false,
    visualDepth: true,
    hiddenSignagePointAllowed: true
  }),
  hardValidation: Object.freeze([
    'GLB_PARSEABLE',
    'SCENE_PRESENT',
    'RENDERABLE_MESH_PRESENT',
    'FINITE_NODE_TRANSFORMS',
    'RUNTIME_LOADABLE'
  ]),
  softDiagnostics: Object.freeze([
    'BYTE_LENGTH',
    'SHA256',
    'NODE_COUNT',
    'MESH_COUNT',
    'MATERIAL_COUNT',
    'TOPOLOGY'
  ])
});
