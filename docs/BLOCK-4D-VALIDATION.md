# LUUX Signage Previz — Block 4D Validation

Status: **CLOSED / AUTOMATED PASS / USER PASS**
Design contract: `LUUX_Signage_Previz_BLOCK-4D_DESIGN_V1_1_20260910.md`
Date: 2026-09-10

## Scope result

Block 4D adds one mutable Site Environment layer to `3D WORLD` while preserving
the closed Block 0–4C Functional Signage, PhotoScene, CameraRecord, live texture,
and Canonical POINT contracts.

The first supplied `Previz_3Dworld_Background_v01.glb` contained eight
signage-like meshes. The user supplied a corrected v02 in the same folder.
Runtime and build selection now use only:

```text
3DAsset/BG/Previz_3Dworld_Background_v02.glb
```

The obsolete local v01 is explicitly ignored and is not a runtime/build input.

## Current environment revision

| Field | Observed value |
| --- | --- |
| Asset role | `SITE_ENVIRONMENT` |
| Logical ID | `luux-site-background` |
| Revision policy | `MUTABLE_INFORMATIONAL_FINGERPRINT` |
| Coordinate policy | `DIRECT_NO_CONVERSION` |
| Bytes | `31,308,864` |
| SHA-256 | `4BD63E5A5650DE910A0AEDCB9910CB76561D4C85C9BCBABEC4751E706BA52216` |
| glTF | `2.0` |
| Generator | `Khronos glTF Blender I/O v5.2.39` |
| Scenes / Nodes / Meshes | `1 / 18 / 18` |
| Materials / Cameras / Animations | `1 / 0 / 0` |
| TRIANGLES primitives | `18` |
| Finite node transforms | PASS |

The v02 renderable node inventory is:

```text
BD_LOWER_geoShape
BD_TOP_geoShape
BD_UP_geoShape001
BuildingShape
CheonggyeKorea_BDShape
Conditionaire_geoShape
DoorShape
FloorShape
KYOBOShape
LOGO_DOWN_CHANNELShape
LOGO_DOWN_KOREANDShape
LOGO_TOP_DONGAShape
LotteTourBDShape
Main_buildingShape
NONE_BDShape
PremierPlace_BDShape
THE_TOWERShape
Top_PLACE_BDShape
```

No known signage-like exclusion name is present in v02. The exact-name safety
list from v01 remains in the runtime profile; it uses no fuzzy matching and
currently matches zero nodes.

## Runtime contract implemented

- The environment GLB is added directly with no hidden root translation,
  rotation, scale, or Max-to-Three basis conversion.
- Source materials are ignored and replaced with neutral light-gray
  `MeshStandardMaterial` values: `roughness=1`, `metalness=0`,
  `side=DoubleSide`.
- DAY and NIGHT presentation modes alter only neutral background and global
  environment lighting. Functional Signage keeps its existing unlit master
  texture material.
- Environment meshes write normal depth and can visually occlude signage.
- Every environment mesh is disabled for raycasting and is never added to
  `state.site.activeBindings`; it cannot become a POINT target or receive the
  master texture.
- The environment is visible only in `SITE 3D / 3D WORLD`. Legacy 2D World and
  its four PhotoScenes are unchanged.
- Environment topology is not repaired and is not treated as a strict asset
  schema. Parseability, a reachable scene, a renderable mesh, finite transforms,
  runtime load, and renderer compatibility are the hard safety gates.

## Automated evidence

| Check | Result |
| --- | --- |
| `npm run build` | PASS |
| `node tests/static-validation.mjs` | PASS |
| `npm run test:block4d` | PASS |
| `npm run test:protocol` (Block 0–4D) | PASS |
| `npm run test:runtime` | PASS (`BLOCK0_TECHNICAL_PASS=true`) |
| `npm run test:link` | PASS (`BLOCK3C_SYNTHETIC_SITE_PASS=true`) |
| Source/build v02 bytes and SHA-256 | PASS |
| Runtime mesh count | PASS: 18 visible / 0 excluded |
| Runtime coordinate/root transform | PASS: direct / identity |
| Neutral material override | PASS |
| NIGHT darker-than-DAY ordering | PASS |
| Environment POINT target count | PASS: 0 |
| Functional Signage active surface count | PASS: 2 |
| Environment single-load/resource budget | PASS |
| Context loss / external network requests | PASS: 0 / 0 |

Ignored runtime evidence is written to:

```text
desktop-app/.runtime/dev-runtime.json
desktop-app/.runtime/dev-runtime.png
desktop-app/.runtime/link-runtime.json
desktop-app/.runtime/link-runtime.png
```

## User validation — PASS

The following qualitative contract items are not auto-passed:

- [x] Environment and Functional Signage world alignment is visually correct.
- [x] Major building silhouette/detail is sufficient for presentation.
- [x] No duplicate environment signage is visible.
- [x] Neutral gray, non-reflective material is acceptable.
- [x] DAY readability is acceptable.
- [x] NIGHT readability is acceptable.
- [x] Open/back-facing surfaces remain usable with DoubleSide.
- [x] Orbit, pan, and dolly remain comfortable around the full site.
- [x] A visually occluded Functional Signage point can still be sent through
      the environment to Photoshop.

The user explicitly approved Block 4D on 2026-09-10. Block 4D is CLOSED.

## Deferred / unchanged

No topology repair, remesh, normal cleanup, LOD, HDRI, environment authoring,
occlusion optimization, Block 4E Location UI, or later-block feature was added.
The v02 fingerprint is the observed current revision, not a permanent immutable
environment schema.
