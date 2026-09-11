# LUUX Signage Previz — Post-Block-7 Bake Visibility Correction

Date: 2026-09-12
Baseline HEAD: `5c4c89166df45f08ca7999f331911c9ac3031397`

## Status

- Block 7 reverse transport: `CLOSED / UNCHANGED`
- Correction implementation: `V3 DEDICATED INNER MATTE / PASS CLOSED`
- Automated technical validation: `PASS`
- USER VISUAL VALIDATION: `PASS / CLOSED`
- Block 8: `NOT STARTED`

## Original symptom and affected paths

With OPTIONAL BAKE MASK OFF, Canonical Bake could retain Canonical/UV texels
belonging to the opposite or camera-occluded side of the curved signage. Direct
Projected already used ordinary camera-space hardware depth. Canonical Bake
and therefore its Canonical output were the affected path; Canonical
Reprojected could hide some bad texels again because it rasterized the same
geometry back through the camera.

## Existing self-visibility implementation found

The previous visibility pass rendered the family-bound Surface through the
approved Projection Camera into a working-resolution color+depth target.
However, Canonical Bake did not sample or compare the depth attachment.
Instead, it encoded authored UV into 8-bit RG color, searched a 3×3 screen-space
neighborhood, and accepted the Canonical fragment when UV distance was at most
`0.015`. The reported method name said hardware depth first, but the actual
Canonical decision was an approximate UV identity test.

Root cause v1: the UV tolerance could accept a different, occluded or opposite
surface texel near the visible UV and leave thin leakage in Canonical space.

## USER REPORTED VISUAL FAIL and v2 root cause

The first post-Block-7 correction used only the family-bound Signage Surface
as its camera-depth source. User review then found that both BACK and FRONT75
still exposed the opposite/pink side inside the J-shaped signage. The center of
that J is occupied by the building, so signage self-depth alone is not the
complete physical visibility model.

`CALCAM_*_LOOKAT_COLLISION` was inspected and rejected as an occluder: it is a
small 24-vertex camera helper, not building geometry. Read-only camera-space
ray probes identified `BD_UP_geoShape001` as the exact environment mesh in
front of the leaked signage region. Sampled in-frame signage vertices behind
that mesh were approximately 4.1% for FRONT75 and 54.3% for BACK.

## Visibility correction

- Visibility method: approved Projection Camera depth texture, sampled from
  Canonical UV-space fragments after projecting their world position.
- Depth source: the family-bound Signage Surface plus the exact dedicated inner
  Matte `ANAM_BAKE_MATTE_INNER`.
- Environment/Site depth: excluded. The earlier building holdout was useful for
  diagnosis but is not part of the final Projection Bake depth source.
- Holdout behavior: `colorWrite: false`, `depthWrite: true`, `DoubleSide`; the
  Matte contributes no RGB/alpha and only rejects signage behind it.
- Matte scope: `PROJECTION_BAKE_RUN_ONLY` asset loading and
  `PROJECTION_BAKE_OFFSCREEN_ONLY` rendering. The GLB is lazy-loaded by the
  bake command, is never attached to ordinary SITE 3D, and all copied geometry,
  material, and texture resources are disposed after every run. SITE 3D,
  normal rendering, NAVIGATE, POINT, source environment visibility, and source
  environment materials are not modified.
- Depth comparison: `projectedDepth <= frontmostDepth + epsilon`.
- Epsilon: four quantization steps derived at runtime from the actual GPU depth
  buffer bit count; no guessed world-unit tolerance.
- Facing policy: no normal threshold. Depth remains primary so curved and
  grazing-angle visible areas are preserved.
- Surface filtering: existing family registry exact binding only:
  `ANAM_SURFACE_FRONT75F` or `ANAM_SURFACE_BACK`.
- General backface culling: not used.
- GLB geometry: unchanged.
- Bake Mask: OFF for correction evidence.
- Planar masks: separate Photoshop-side compositing/feather assets, not used as
  3D visibility evidence.

A 512-pixel-wide diagnostic Canonical target uses GREEN for accepted texels,
YELLOW for the four-epsilon boundary band, and RED for rejected/occluded
texels. It is written only by the Electron smoke harness and is never sampled
by the production output.

## Dedicated Matte asset and final replacement

The user supplied `3DAsset/Signage/Previz_Anamorphic_BakeMatte_v01.glb`, a
slightly inward/negative-pushed volume following the signage contour. The user
reports an approximately 22.7 cm separation from the signage surface. This is
large enough to avoid coplanar depth fighting while filling the inner J region
that must not reveal the opposite signage side.

- exact node: `ANAM_BAKE_MATTE_INNER`
- byte length: `82,352`
- SHA-256: `378B97CACCA9D43E5DC02876F279D154E637D558E7D1AAE3F33D51B42FFA0B0D`
- glTF: `2.0`, one scene, one node, one mesh, one primitive
- vertex count: `2,350`
- UV0: absent and unnecessary for depth-only use
- selector: `EXACT_NAME_ONLY_DEPTH_ONLY_NO_COLOR`
- ordinary scene attachment: `NEVER`

The build validates the exact fingerprint and mesh inventory before copying the
asset to `build/assets/projection/`. Runtime binding is exact-name only; no
heuristic mesh selection or fallback to the building mesh remains.

## User-provided 3ds Max World Normal references

- BACK: `Calibration_LUUX_Back_WorldNormal_.png`
  - 2100×3840, RGB 16-bit
  - SHA-256 `4D2FAFAAA656BB6763A30BB3E678BB963144F99323AA9194E221D090E68AAEF7`
- FRONT 75F: `Calibration_LUUX_Front_WorldNormal_.png`
  - 3000×3840, RGB 16-bit
  - SHA-256 `F6A5077BFB1759A7C53C0581867D6A957CFF480C2CE77C5CB2CF93E8487D9F6B`

The attachment copies are byte-identical to the files currently present under
`2DAsset/Calibration/Result/`. Those Result files remain external/reference
evidence and are not forcibly added to Git.

## MASK OFF output evidence

The runtime smoke writes all production-size correction outputs under its
`.runtime/` directory, and the reviewed copies are available under
`2DAsset/Calibration/Result/`:

- `PostBlock7_FRONT75F_Direct_3000x3840.png`
- `PostBlock7_FRONT75F_Canonical_4728x5760.png`
- `PostBlock7_FRONT75F_Reprojected_3000x3840.png`
- `PostBlock7_BACK_Direct_2100x3840.png`
- `PostBlock7_BACK_Canonical_4728x5760.png`
- `PostBlock7_BACK_Reprojected_2100x3840.png`
- `PostBlock7_FRONT75F_VisibilityDiagnostic.png`
- `PostBlock7_BACK_VisibilityDiagnostic.png`

The Result directory is ignored evidence and is not part of the source commit.

## Automated runtime result

MASK was OFF for all measurements. The shared sequence was FRONT ×3, BACK ×3,
then FRONT ×1:

### Superseded v1 surface-only runtime result

| Metric | FRONT 75F | BACK |
| --- | ---: | ---: |
| Canonical coverage | 0.568404761 | 0.539498658 |
| Canonical valid pixels | 15,479,526 | 14,692,318 |
| Direct visible pixels | 6,557,725 | 4,355,082 |
| Reprojected visible pixels | 6,557,655 | 4,355,082 |
| Direct-only pixels | 70 | 0 |
| Reprojected-only pixels | 0 | 0 |
| Direct/Reproject silhouette IoU | 0.999989326 | 1.000000000 |
| Diagnostic accepted | 163,356 | 75,854 |
| Diagnostic epsilon-boundary | 126 | 10 |
| Diagnostic occluded/rejected | 18,197 | 96,712 |

The table above is retained as failure-analysis history; it is not v2
acceptance evidence.

### V2 exact-building holdout runtime result

| Metric | FRONT 75F | BACK |
| --- | ---: | ---: |
| Canonical coverage | 0.567805824 | 0.335608124 |
| Canonical valid pixels | 15,463,215 | 9,139,710 |
| Direct visible pixels | 6,550,087 | 2,709,470 |
| Reprojected visible pixels | 6,550,017 | 2,709,470 |
| Direct-only pixels | 70 | 0 |
| Reprojected-only pixels | 0 | 0 |
| Direct/Reproject silhouette IoU | 0.999989313 | 1.000000000 |
| Diagnostic accepted | 163,176 | 10,621 |
| Diagnostic epsilon-boundary | 126 | 10 |
| Diagnostic occluded/rejected | 18,377 | 161,945 |

The exact building holdout reduced visible BACK pixels from 4,355,082 to
2,709,470 (37.8%) and removed the physically impossible inner-J region from
the shared Direct/Canonical visibility model. FRONT changed by only 0.12%, as
expected from the camera-space probe. The actual GPU depth buffer was 24-bit.
Epsilon was four quantization steps, `2.3841859331241806e-7` in normalized
depth. Context loss was 0, renderer texture counts remained stable, and three
family-switch disposals were observed. Runtime diagnostics report
`matteIncluded: true`, `matteScope: PROJECTION_BAKE_OFFSCREEN_ONLY`, and
`environmentColorIncluded: false`.

### V3 dedicated inner Matte runtime result — final acceptance evidence

| Metric | FRONT 75F | BACK |
| --- | ---: | ---: |
| Canonical coverage | 0.567169250 | 0.334987266 |
| Canonical valid pixels | 15,445,879 | 9,122,802 |
| Direct visible pixels | 6,543,109 | 2,704,422 |
| Reprojected visible pixels | 6,543,039 | 2,704,422 |
| Direct-only pixels | 70 | 0 |
| Reprojected-only pixels | 0 | 0 |
| Direct/Reproject silhouette IoU | 0.999989302 | 1.000000000 |
| Diagnostic accepted | 162,961 | 10,418 |
| Diagnostic occluded/rejected | 18,592 | 162,148 |
| Round-trip MAE | 0.319583285 | 0.294387945 |
| Round-trip RMSE | 2.904452992 | 2.789850567 |

Both families passed their technical thresholds. The Matte manifest was
verified, exact transforms were finite, ordinary-scene attachment was false,
and `disposedAfterBake` was true. Three family-switch resource disposals were
observed, renderer resources remained stable, and WebGL context loss was 0.
The active GPU path was hardware ANGLE/D3D11 on NVIDIA GeForce RTX 5080.

## Superseded surface-only World Normal silhouette comparison

`compare-world-normal-silhouette.mjs` compares the Reprojected alpha
silhouette with the supplied 3ds Max RGB16 World Normal image. The comparison
images use gray for overlap, red for World Normal only, cyan for Previz only,
and dark gray for background.

| Metric | FRONT 75F | BACK |
| --- | ---: | ---: |
| Strict silhouette IoU | 0.999698533 | 0.997542217 |
| World Normal only | 276 | 8,200 |
| Previz only | 1,701 | 2,524 |
| World Normal only beyond 1 px | 1 | 3,043 |
| Previz only beyond 1 px | 0 | 0 |

These metrics were produced before the exact building holdout was added. No
Previz-only area survived beyond a one-pixel neighborhood in either family in
that surface-only comparison. The supplied World Normal references render the
signage surfaces without the building matte, so they remain useful for camera,
orientation, and surface-registration evidence but are no longer the expected
v2 visible silhouette inside the J-shaped building region.

Comparison artifacts:

- `PostBlock7_FRONT75F_WorldNormal_SilhouetteComparison.png`
- `PostBlock7_BACK_WorldNormal_SilhouetteComparison.png`
- matching `.json` metric reports

## Regression result

The isolated validation copy retained the tracked production mask while the
user's in-progress mask replacement remained untouched in the working tree.
The ignored `luux-mockup/` reference was copied read-only into that validation
copy for the historical Block 4A contract test.

- `npm run build`: PASS
- `npm run test:block6a`: PASS
- `npm run test:block6b`: PASS
- `npm run test:block7`: PASS
- `npm run test:visibility-correction`: PASS
- `npm run test:static`: PASS
- `npm run test:protocol`: PASS
- `npm run test:runtime`: PASS, `BLOCK0_TECHNICAL_PASS=true`
- `npm run test:link`: PASS, `BLOCK3C_SYNTHETIC_SITE_PASS=true`
- `npm test`: PASS

Block 7 transport dimensions, RGBA contract, target validation, ownership,
re-bake behavior, Auto Sync suppression, Live Link, and Pointer contracts all
remain unchanged and pass their existing regressions.

## Closure and accepted residual scope

The user understands the dedicated Matte geometry and authorized closure when
technical validation passed. The dedicated Matte is now bound and verified for
both FRONT75 and BACK with MASK OFF. A slight residual glimpse of the opposite
side near some edges is accepted as an unavoidable tolerance of this depth
volume and camera parallax. It is explicitly deferred to the later
anamorphic-to-planar bake compensation stage; it is not a blocker for this
correction.

USER VISUAL VALIDATION: `PASS / CLOSED`
