export const SITE_ASSETS = Object.freeze({
  world3d: Object.freeze({
    id: 'world3d',
    fileName: 'Previz_3Dworld_BasicMapping.glb',
    relativeUrl: './assets/site/Previz_3Dworld_BasicMapping.glb',
    sourceKind: 'project-3d-asset',
    byteLength: 3243084,
    sha256: '5F86D3FFEB1AC5D6D5048DCC1E99525C3038BFACC63A7A07088BDBBF5A3908D3'
  }),
  legacy2d: Object.freeze({
    id: 'legacy2d',
    fileName: 'Merged_Full_Format_v2.glb',
    relativeUrl: './assets/site/Merged_Full_Format_v2.glb',
    sourceKind: 'legacy-byte-identical-copy',
    byteLength: 6169280,
    sha256: '125264CC2DF826F5F698330B7A37D5FAE372ED85AD462102DEBCA8B61D97F2C1'
  })
});

const normalDisplayMapping = Object.freeze({
  kind: 'planar-uv',
  uvChannel: 0,
  flipY: false,
  offset: Object.freeze([0, 0]),
  repeat: Object.freeze([1, 1]),
  rotationQuarterTurns: 0,
  wrap: 'clamp'
});

function surface(role, expectedNode, selector = {}) {
  return Object.freeze({
    role,
    selector: Object.freeze({
      exactName: selector.exactName ?? null,
      prefixIncludes: selector.prefixIncludes ?? null,
      suffixIncludes: selector.suffixIncludes ?? null,
      excludeIncludes: selector.excludeIncludes ?? null
    }),
    expectedNode,
    displayMapping: normalDisplayMapping,
    hitMapping: Object.freeze({ kind: 'display-uv-to-top-left-canonical' })
  });
}

function legacySurface(role, prefixIncludes, suffixIncludes, expectedNode) {
  return surface(role, expectedNode, { prefixIncludes, suffixIncludes, excludeIncludes: 'Anamorphic' });
}

const legacyCameras = Object.freeze({
  front: Object.freeze({ type: 'PerspectiveCamera', fov: 52.4, near: 0.1, far: 10000, position: Object.freeze([-8.587, 1.4, 12.33]), eulerXyzDegrees: Object.freeze([16.5, -39.5, 10.3]), target: null }),
  frontSweet: Object.freeze({ type: 'PerspectiveCamera', fov: 49.2, near: 0.1, far: 10000, position: Object.freeze([-7.243, -0.031, 12.76]), eulerXyzDegrees: Object.freeze([22.3, -34.5, 13.1]), target: null }),
  back: Object.freeze({ type: 'PerspectiveCamera', fov: 46.4, near: 0.1, far: 10000, position: Object.freeze([-9.869, 0.04, -9.425]), eulerXyzDegrees: Object.freeze([-30.1, -130.95, -24.6]), target: null }),
  night: Object.freeze({ type: 'PerspectiveCamera', fov: 47.9, near: 0.1, far: 10000, position: Object.freeze([-9.869, 0.04, -9.425]), eulerXyzDegrees: Object.freeze([-29.3, -132.3, -21.9]), target: null })
});

export const SITE_SCENE_PROFILE = Object.freeze({
  id: 'luux-signage-site-v2',
  assets: SITE_ASSETS,
  mappingModes: Object.freeze({
    normal: Object.freeze({ id: 'normal', label: 'NORMAL', available: true }),
    anamorphic: Object.freeze({ id: 'anamorphic', label: 'ANAMORPHIC', available: false, reason: 'Required anamorphic meshes are not present.' })
  }),
  worlds: Object.freeze({
    world3d: Object.freeze({
      id: 'world3d',
      label: '3D WORLD',
      assetId: 'world3d',
      normalSurfaces: Object.freeze([
        surface('LUUX_Front_3Dworld_Basic', 'LUUX_Front_3Dworld_Basic', { exactName: 'LUUX_Front_3Dworld_Basic' }),
        surface('ILMIN_Back_3Dworld_Basic', 'ILMIN_Back_3Dworld_Basic', { exactName: 'ILMIN_Back_3Dworld_Basic' })
      ]),
      anamorphicSurfaces: Object.freeze([
        surface('LUUX_Front_3Dworld_Anamorphic', 'LUUX_Front_3Dworld_Anamorphic', { exactName: 'LUUX_Front_3Dworld_Anamorphic' }),
        surface('ILMIN_Back_3Dworld_Anamorphic', 'ILMIN_Back_3Dworld_Anamorphic', { exactName: 'ILMIN_Back_3Dworld_Anamorphic' })
      ])
    }),
    legacy2d: Object.freeze({
      id: 'legacy2d',
      label: 'LEGACY 2D WORLD',
      assetId: 'legacy2d',
      normalScenes: Object.freeze([
        Object.freeze({ id: 'front', label: 'Front', suffix: 'Front', camera: legacyCameras.front, surfaces: Object.freeze([legacySurface('Front', 'LUUX', 'Front', 'LUUX_Front')]) }),
        Object.freeze({ id: 'frontSweet', label: 'Front_Sweet', suffix: 'F_Sweet', camera: legacyCameras.frontSweet, surfaces: Object.freeze([legacySurface('Front_Sweet', 'LUUX', 'F_Sweet', 'LUUX_F_Sweet')]) }),
        Object.freeze({ id: 'back', label: 'Back', suffix: 'Back', camera: legacyCameras.back, surfaces: Object.freeze([legacySurface('Back', 'LUUX', 'Back', 'LUUX_Back'), legacySurface('ILMIN_Back', 'ILMIN', 'Back', 'ILMIN_Back')]) }),
        Object.freeze({ id: 'night', label: 'Night', suffix: 'B_Night', camera: legacyCameras.night, surfaces: Object.freeze([legacySurface('Back_Night', 'LUUX', 'B_Night', 'LUUX_B_Night'), legacySurface('ILMIN_Back_Night', 'ILMIN', 'B_Night', 'ILMIN_B_Night')]) })
      ]),
      anamorphicScenes: null
    })
  })
});

export function matchesSurfaceSelector(meshName, selector) {
  if (typeof meshName !== 'string') return false;
  if (selector.exactName) return meshName === selector.exactName;
  return (!selector.prefixIncludes || meshName.includes(selector.prefixIncludes)) &&
    (!selector.suffixIncludes || meshName.includes(selector.suffixIncludes)) &&
    (!selector.excludeIncludes || !meshName.includes(selector.excludeIncludes));
}

export function resolveSurfaceSet(meshes, surfaceContracts) {
  const resolved = [];
  const missing = [];
  for (const contract of surfaceContracts ?? []) {
    const matches = meshes.filter((mesh) => mesh.isMesh && matchesSurfaceSelector(mesh.name, contract.selector));
    if (matches.length === 0) {
      missing.push(contract.expectedNode);
      continue;
    }
    for (const mesh of matches) resolved.push({ contract, mesh });
  }
  return Object.freeze({
    available: missing.length === 0 && resolved.length > 0,
    resolved: Object.freeze(resolved),
    missing: Object.freeze(missing)
  });
}
