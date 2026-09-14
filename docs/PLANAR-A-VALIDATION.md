# PLANAR-A Validation

Status: **IMPLEMENTED / AUTOMATED TECHNICAL PASS / ORACLE PARITY VALIDATION OPEN**. Planar-A is not CLOSED and Planar-B is not authorized yet.

## Purpose and authority

This block packages the two Signage baker GLBs and establishes a derived Planar renderer after the current-family Full Merge CANONICAL output. The technical authority is `PLANAR-MAPPING-TRANSPLANT-AUDIT.md`; `luux-mockup/baker.html` and its ignored assets are read-only visual oracle material, not runtime dependencies. There is no user-facing Planar Bake, export, Photoshop target/SEND, cache, or project schema change.

## Asset contract and packaging

| Family | Profile | Signage source / packaged URL | Exact mesh | Bytes | SHA-256 |
| --- | --- | --- | --- | ---: | --- |
| `ANAMORPHIC_FRONT_75F` | `PLANAR_FRONT75` | `3DAsset/Signage/Previz_3Dworld_Anamorphic_Baker_Front75F_v1.glb` → `./assets/planar/Previz_3Dworld_Anamorphic_Baker_Front75F_v1.glb` | `SCREEN_Bake_Front` | 5,542,972 | `D59E406B3D63AB40ACEC10336ACF87D279A15D466B2179B74CC1A96FCBFAA85A` |
| `ANAMORPHIC_BACK` | `PLANAR_BACK` | `3DAsset/Signage/Previz_3Dworld_Anamorphic_Baker_Back_v1.glb` → `./assets/planar/Previz_3Dworld_Anamorphic_Baker_Back_v1.glb` | `SCREEN_Bake_Back` | 1,184,988 | `D7A033528266C31F696ECDD088A6B9E771F993492D9847491ED21E161E4C6A61` |

Build checks source size/hash, GLB 2.0, one scene, one mesh, no camera/animation, exact mesh node, UV0, and destination copy size/hash. Missing/invalid GLB or exact node is `PLANAR_ASSET_CONTRACT_ERROR`, with no first-mesh fallback. The source GLBs were pre-existing untracked user-owned files; the implementation did not alter or stage them. A release commit must explicitly include these assets so a fresh checkout can build.

## Camera, Canonical, and texture contracts

- Dedicated `THREE.PerspectiveCamera`: vertical FOV `10°`; aspect `4728/5760`; near/far `0.01/10000`; position `(0, 342.9015690828403, 0)`; XYZ rotation `(-π/2, 0, 0)`. No `lookAt` or SITE camera reuse.
- The only production read adapter calls `FullMergeAccumulatorRuntime.readOutputRgba(familyId, 'CANONICAL')`, gated by current-family ready state and an integer revision. It requires `4728×5760`, RGBA8, straight alpha, top-left rows, exact family and output kind. FRONT/BACK Direct, cross-family, invalid metadata, and unavailable Canonical are rejected.
- Input rows are copied to `ImageData`/`CanvasTexture` as top-left rows, matching the baker's image-source semantics. Texture: sRGB, `flipY=false`, linear min/mag, clamp, identity offset/repeat/rotation, no 16:9 crop. Mesh material is white, unlit `MeshBasicMaterial`, double-sided, transparent, depth test/write, tone mapping off. Embedded GLB texture/material never supplies the Planar map.
- Shared desktop WebGL renderer is used only behind save/restore of target, viewport/scissor, clear color/alpha, pixel ratio, output color space, tone mapping, auto-clear, and XR. The Planar render target is 4728×5760 sRGB RGBA8 with depth. The material is rendered against transparent black; CPU readback is converted from GPU bottom-left to output top-left exactly once. WebGL transparent blending produces premultiplied **linear** RGB in the sRGB readback; a single linear-light unpremultiply converts semi-transparent output to straight alpha before the output is returned. RGB hidden under alpha zero is not a gate.

## Runtime/resource ownership

`PlanarMappingRuntime` loads one family GLB per render, selects the exact mesh, creates a family-specific input texture/material and render target, reads a top-left RGBA8 result, then disposes GLB geometry/materials/embedded textures, input canvas/texture/material, and target in `finally`. It does not retain output pixels or alter authoring/Full Merge. The caller owns the returned CPU bytes and must release them when done. Per-family state is ephemeral (`UNAVAILABLE`, `DIRTY`, `READY`, `ERROR`) with `sourceCanonicalRevision`; `invalidateFamily()` is the future downstream invalidation hook. `READY` here means the last foundation render completed, not that a Planar-B cache exists.

## Automated evidence

- `npm run test:static`: PASS (includes build/manifest).
- `npm run test:protocol`: PASS (includes Block 8D, 8E, 8F, 9A, 9B-A, preview-background, 9B-B and `test:planar-a`).
- `npm run test:runtime`: PASS for the existing whole-app Electron smoke after the Planar-A changes.
- `npm run test:planar-a`: PASS. Confirms exact family/file/hash/node/UV bindings, camera, 4728×5760 asymmetric source, four corner colors, central mark, alpha 0/0.5/1, invalid input rejection, cross-family rejection, ready-state gate and family-isolated derived state.
- Electron `--planar-a-smoke-test` (equivalent `npm run test:planar-a:runtime`): PASS in the host runtime. `desktop-app/.runtime/planar-a-runtime.json` records two sequential full-resolution renders per family, fixed qualitative output landmarks, all four colors, opaque/semi/transparent pixels, straight-alpha semi region, texture/material contract, 0 texture/geometry delta, and no authoring/Canonical/SITE camera mutation. The first sandboxed Electron/Chrome attempts failed GPU-process initialization; the same Electron test passed when run with host GPU access. This was an execution-environment issue, not treated as proof of implementation failure or as a Photoshop/user PASS.
- Generated same-input evidence: `desktop-app/.runtime/PlanarA_Canonical_Asymmetric_4728x5760.png`, `desktop-app/.runtime/PlanarA_ANAMORPHIC_FRONT_75F_4728x5760.png`, and `desktop-app/.runtime/PlanarA_ANAMORPHIC_BACK_4728x5760.png`. These are ignored diagnostic artifacts, not a user export workflow.

FRONT landmarks at output `(0.3,0.2)`, `(0.7,0.2)`, `(0.3,0.8)`, `(0.7,0.8)` are red/green/blue/yellow. BACK landmarks are green/red/yellow/blue, reflecting its different UV. Both outputs have visible semi-alpha and zero-alpha regions. These deterministic checks do **not** substitute for practical oracle comparison.

## Oracle parity comparison — still open

1. Open the existing `luux-mockup/baker.html` without editing it or either ignored oracle GLB. Confirm the Front and Back model status is Ready.
2. Load the **same** `PlanarA_Canonical_Asymmetric_4728x5760.png` in Slot A (single-surface Front and Back both use Slot A). Keep gain `1`, tint white, Slot A visible, UV offset `0/0`, tiling `1/1`, no flip/rotation/wrap, and **do not apply** Front/Back 16:9 Fit. Use Reset UV if necessary.
3. Select Front, use `Save PNG 4728×5760`, and compare against the new FRONT artifact. Repeat with Back against the new BACK artifact. Inspect orientation, silhouette/contour, line/marker positions, UV area, edge position, and obvious filtering differences at native resolution.
4. Inspect the transparent and half-alpha patches over black **and** white. The new output explicitly straightens GPU blended RGB at semi-alpha; the old baker writes its raw sRGB readback, so semi-alpha RGB may differ even if opaque geometry/UV matches. Treat a major halo or clearly shifted/missing alpha region as FAIL; record tolerable isolated alpha differences rather than asserting pixel equality.

FRONT oracle parity: **OPEN — user visual comparison required**.
BACK oracle parity: **OPEN — user visual comparison required**.

No byte-exact parity is required. Any flip, wrong family UV, camera framing error, unexpected crop, large line-position error, or major alpha halo is a stop condition. Planar-B entry is **NO** until both user-assisted practical oracle comparisons pass. Only then may Planar-A be marked CLOSED. Planar-B (real Canonical wiring, Bake Planar, per-family dirty/cache, Save PNG, final-output UI) and 9B-C/9C/Photoshop Planar target/SEND remain deferred.
