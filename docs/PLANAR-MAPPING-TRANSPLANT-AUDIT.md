# Planar Mapping Transplant Audit — baker.html → Signage Previz

Date: 2026-09-14

Mode: READ-ONLY AUDIT; this report is the only new artifact

Verdict: **GO WITH MINOR CORRECTIONS**

Baseline: `main` / `2b58e1c3261bafdc3fbdf17e46ad36854b36bdb1` (`2b58e1c Close Block 9B-B Photoshop target quick create/register`)

## 1. Purpose and current accepted state

Determine whether the already-proven `luux-mockup/baker.html` planar transform can be made the next high-priority output block without 9B-C or 9C. This is contract extraction, not implementation or a new baker design. Block 9A, 9B-A, POST-9B-A preview background, and 9B-B remain CLOSED at their recorded automated and user-Photoshop gates. Block 8D–8F authoring, mask, projection, and Full Merge contracts remain unchanged. The later master-design statement that planar output dimensions were not yet fixed is historical; the present user/design decision fixes both planar input and output at `4728 × 5760`.

Read authority: `BLOCK-9A-HANDOFF.md`, `BLOCK-9A-VALIDATION.md`, `BLOCK-9B-A-HANDOFF.md`, `BLOCK-9B-A-VALIDATION.md`, `POST-9B-A-PREVIEW-ALPHA-BACKGROUND-HANDOFF.md`, `POST-9B-A-PREVIEW-ALPHA-BACKGROUND-VALIDATION.md`, `BLOCK-9B-B-HANDOFF.md`, `BLOCK-9B-B-VALIDATION.md`, and `POST-BLOCK-8F-SNAPSHOT-AUDIT-AND-BLOCK9-DESIGN-V1.md`; then the named repository implementation. Older roadmap tables are historical, not a reason to reopen accepted blocks.

## 2. Existing baker source-of-truth inventory

`luux-mockup/baker.html` loads `./assets/Baker_75f_Front_v1.glb` and `./assets/Baker_75f_Back_v1.glb` into separate Three.js scenes (`baker.html:509-546, 567-579, 841-870`). Each GLB has one scene, one mesh node, one mesh/material, and no camera or animation. The mesh nodes are respectively `SCREEN_Bake_Front` and `SCREEN_Bake_Back`; both meshes are named `Mesh` and both materials `Material #25`. No second bake surface needs selection in these two files. The baker's name-scoring/fallback selector would assign a single surface to media Slot A, but the transplant should bind the verified exact node per family rather than rely on a first-mesh fallback (`baker.html:736-805`). Slot B and webcam/video/sequence controls are mockup features, not prerequisites for a single Canonical Master input.

The GLB has no embedded bake camera. `baker.html` creates the camera itself. It converts loaded materials to unlit `MeshBasicMaterial` and replaces the target surface material with the current media texture, avoiding scene-light/PBR dependence (`baker.html:567-570, 643-716, 824-838`). FRONT's embedded JPEG/base-color map is replaced on the target during the normal loaded-model path; BACK's base-color factor likewise is not the intended canonical feed. Do not use the current SITE 3D/anamorphic display mesh or camera as a substitute.

## 3. Current Signage candidate asset inventory and path choice

| Family | Mockup oracle | Current Signage candidate | Exact bytes / SHA-256 |
| --- | --- | --- | --- |
| FRONT75 | `luux-mockup/assets/Baker_75f_Front_v1.glb` | `3DAsset/Signage/Previz_3Dworld_Anamorphic_Baker_Front75F_v1.glb` | `5,542,972` / `D59E406B3D63AB40ACEC10336ACF87D279A15D466B2179B74CC1A96FCBFAA85A` for **both** |
| BACK | `luux-mockup/assets/Baker_75f_Back_v1.glb` | `3DAsset/Signage/Previz_3Dworld_Anamorphic_Baker_Back_v1.glb` | `1,184,988` / `D7A033528266C31F696ECDD088A6B9E771F993492D9847491ED21E161E4C6A61` for **both** |

The Signage-named files are byte-for-byte identical to their respective mockup originals in this checkout. Prefer the **Signage namespace copies** as the eventual application runtime source, with exact hash and node validation in the build, while retaining mockup originals as the read-only oracle. This follows the existing `3DAsset/Signage` → packaged asset/manifest pattern (`desktop-app/scripts/build.mjs:140-168, 310-328`) without making the runtime depend on ignored `luux-mockup/` paths. **Packaging is not yet implemented:** both Signage candidates are presently untracked, and mockup originals are ignored by `.gitignore`; the current build has no planar asset entry. The implementation block must explicitly adopt/package the two intended copies, without deleting or silently replacing them. A fresh checkout cannot yet reproduce this local asset inventory.

## 4. Structural independence and correct input

**Q1/Q2: YES.** Planar is a derived final-output transform of the already merged Canonical result. It does not require Photoshop Snapshot expansion, a source-link refresh, selection provenance, authoring masks, or a second layer-compositing engine. The accepted pipeline is `AUTHORING → BAKE FULL MERGED → current-family Canonical/Anamorphic Master → Planar Bake → current-family Planar Master`. 9B-C and 9C can remain deferred.

The existing `FullMergeAccumulatorRuntime` already retains separate Direct and Canonical targets for each family (`desktop-app/src/full-merge-runtime.js:217-229, 297-325`). `readOutputRgba(familyId, 'CANONICAL')` returns `RGBA`/8-bit/`STRAIGHT`/`TOP_LEFT` with the target width and height (`:341-359`); `exportPng(..., 'CANONICAL')` produces a PNG from the same target (`:370-390`). The profile fixes Canonical at `4728 × 5760` for both families (`desktop-app/src/projection-bake-profile.js:58-89, 119-134, 152-159`). The renderer already gates merged output on its family revision and ready state (`desktop-app/src/renderer.js:1732-1736`) and creates it via the existing projection/merge path (`:3172-3223`). This is a usable local input adapter, not proof of visual identity with the baker yet. Planar must consume **only** that finished current-family Canonical RGBA/PNG, not Direct or individual authoring layers. The present Full Merge excludes outside-signage content by its recorded contract (`renderer.js:3212-3218`); Planar must not invent missing pixels.

## 5. Existing baker camera, texture, and scene contract

| Item | Extracted contract |
| --- | --- |
| Scene/family | Separate FRONT and BACK `THREE.Scene` roots and GLBs; same manually created camera, different mesh UVs (`baker.html:538-547, 1340-1345`). |
| Camera | `PerspectiveCamera`, vertical FOV `10°`, aspect `4728/5760 = 0.8208333333`, near `0.01`, far `10000`; position `(0, 342.9015690828403, 0)` from height `60 / (2 tan 5°)`; Euler order `XYZ`, rotation `(-90°, 0°, 0°)`; no `lookAt`, no GLB camera, no side-specific camera override (`baker.html:509-514, 538-542`). Equivalent quaternion is approximately `(-0.70710678, 0, 0, 0.70710678)`; actual code uses Euler. |
| Renderer | `WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })`, pixel ratio `1`, `SRGBColorSpace`, auto-clear; target surface `MeshBasicMaterial`, unlit, white tint/gain 1, `transparent: true`, `DoubleSide`, depth test/write enabled, no tone mapping (`baker.html:532-535, 643-656, 718-722`). |
| Static image load | Browser `TextureLoader` from image URL, not raw authoring layers. `SRGBColorSpace`, `flipY=false`, min/mag `LinearFilter`; default slot transform offset `(0,0)`, repeat `(1,1)`, no rotation/flip, clamp-to-edge (`baker.html:581-607, 883-913, 943-965`). The separate 16:9 crop presets are for 16:9 media, **not** an automatic Canonical transform (`:1795-1823`). |
| UV mapping | Preserve each GLB's authored `TEXCOORD_0` and node transform. FRONT/BACK positions, normals, and indices hash equal in a read-only GLB inspection, but UV hashes differ. BACK UV V extends slightly above 1; the oracle's default clamp behavior therefore matters. No generic shared UV profile. |

The current SITE 3D calibration camera is visibly a different contract (for example FRONT runtime FOV `19.778°` and different position/quaternion in `anamorphic-calibration-profile.js:129-138`); substituting it for the baker camera has no evidentiary basis.

## 6. Existing baker output contract and unproven boundaries

The static baker PNG path creates a `4728 × 5760` `RGBAFormat`/`UnsignedByteType` WebGLRenderTarget, sets its texture to sRGB, clears/renders the selected side, reads `RGBA` bytes, vertically flips the bottom-left GPU readback through two canvases, then writes `image/png` (`baker.html:1973-2006`). Thus **resolution, PNG format, 8-bit RGBA buffer, and top-left saved orientation are code-confirmed**. No extra post-flip should be layered on top of that algorithm. The HTML labels the same fixed output (`:425-436`).

The code does not explicitly normalize premultiplied versus straight alpha at the baker texture/readback boundary or set a clear alpha value in this function; `transparent: true` and renderer `alpha: true` are not sufficient to prove all partially transparent output pixels are straight RGBA. Current Full Merge labels its exported bytes `STRAIGHT` and `TOP_LEFT`; exact baker parity for alpha edges, sRGB conversion, and texture upload orientation remains an **implementation fixture/visual gate**, not an audit PASS. Use the accepted practical visual tolerance, not byte identity. No production Photoshop target or `SEND FULL MERGED` is implied by the existing baker PNG export.

## 7. GLB size discrepancy — light result

There is **no original-versus-copy size discrepancy**: matching pairs have identical byte counts and hashes. The approximately `4.68×` size difference is **FRONT versus BACK**. FRONT contains one embedded JPEG image of `4,357,788` bytes (`Front_Bake_Luminance.0000 (00000)_Source`); BACK has no image/texture. The remainder is similar-size geometry: both have one mesh, four accessors, `27,020` position/UV vertices and `159,390` indices. Their position/index hashes match; their UV hashes intentionally differ. No duplicate mesh payload or required compression extension appeared in the light GLB inspection. Classification: **harmless for the original/copy question; not evidence that FRONT/BACK UV mappings are interchangeable**. The existing mockup visual PASS supports continuing, but new baker-versus-Signage output parity is still a later validation gate.

## 8. Transplant risks and required localized adaptations

1. **Asset reproducibility (minor, required):** accept/package the two currently untracked Signage copies with pinned hashes and exact node names. Do not depend on ignored mockup paths at runtime or treat file-name similarity as identity.
2. **Input/UV orientation (minor, required):** adapt the current top-left straight Canonical result to the oracle's `TextureLoader`/`flipY=false`/sRGB/sampling contract. A canonical PNG fed through the same image-load path is the clearest first parity fixture; a later GPU-direct optimization must preserve the observed result. Capture the oracle's actual slot settings for the comparison; do not silently apply the 16:9 presets.
3. **Alpha/color (minor, required):** verify transparent background, partial-alpha edges, and sRGB appearance against an asymmetric `4728 × 5760` Canonical fixture. Avoid treating a visually acceptable comparison as proof of hidden RGB or bit-exact straight/premultiplied behavior.
4. **Lifecycle/dirty state (localized):** keep Planar state per family and derived from a specific merged Canonical revision. Authoring changes invalidate Full Merge and therefore Planar; rebaking Canonical leaves Planar dirty; Planar Bake alone cleans Planar. A Planar operation must never mutate or dirty authoring, replay masks/blend, or write back to Source. Release/recreate output GPU/CPU resources on invalidation, project replacement, and failure.
5. **Memory and preview:** a full RGBA frame is `108,933,120` bytes (~`103.9 MiB`) before PNG/texture/readback copies. Bound temporary ownership. Place Planar under Final Output; an export-first `SAVE PLANAR PNG` with explicit READY/DIRTY status is sufficient initially. A dedicated preview may follow, but is not needed to start the transform. The current UI's `PLANAR MASTER · FUTURE / NOT AVAILABLE YET` is only a placeholder (`desktop-app/src/index.html:393`).

No evidence requires a new project-schema version, Photoshop sync, 9B-C, 9C, a second compositing engine, new GLB geometry, a universal FRONT/BACK mapping, or a change to the accepted canonical/authoring baselines. Persisting a derived Planar cache is **not** part of this recommendation; it may be rebuilt from authoritative project data.

## 9. Recommended implementation plan and validation oracle

**Q4/Q6: localized transplant, split into Planar-A then Planar-B.** Planar-A is a small contract/fixture step inside the high-priority Planar work, not another broad audit: register/copy-hash-check the two assets, bind exact family nodes, instantiate the fixed baker camera, establish a Canonical RGBA/PNG-to-texture adapter, and test top-left orientation/alpha with a fixed asymmetric image. Planar-B runs the offscreen `4728 × 5760` bake, explicit PNG export, per-family revision/dirty lifecycle, and resource cleanup. No Photoshop Send or project-schema change is needed for the first delivery.

Use `luux-mockup/baker.html` with the **same Canonical test PNG** and the corresponding original GLB as the immediate integration oracle. Compare new Signage Planar PNG for major placement, silhouette/contour, line position, obvious distortion, orientation/flip, severe filtering difference, and major alpha errors. Production-operator practical tolerance applies; byte equality is not required. Test FRONT75 and BACK independently, and verify that neither Canonical output nor authoring layer state changes. This audit did not execute a real bake or Photoshop probe and therefore does not assert such a PASS.

## 10. Verdict

**GO WITH MINOR CORRECTIONS.** Planar Mapping Bake may be promoted now, ahead of 9B-C and 9C. The accepted Canonical output and the existing baker contracts provide a sufficient structural basis. The remaining work is localized asset packaging, texture/orientation/alpha parity fixtures, and derived-output lifecycle—not a preliminary redesign or a second authoring pipeline. If the first identical-input baker-versus-Signage fixture reveals a major orientation/UV/alpha mismatch, stop Planar-B and resolve that concrete contract discrepancy before claiming the new output valid.

## Recommended next step

- **Start now:** Planar-A, then Planar-B; do not pre-implement Photoshop input expansion or source reconciliation.
- **Minimum input:** current-family BAKE FULL MERGED Canonical Master, `4728 × 5760`, RGBA8, top-left, straight as declared by Full Merge.
- **Minimum assets:** `3DAsset/Signage/Previz_3Dworld_Anamorphic_Baker_Front75F_v1.glb` and `3DAsset/Signage/Previz_3Dworld_Anamorphic_Baker_Back_v1.glb`, each verified against its corresponding read-only mockup oracle hash and exact mesh node.
- **Minimum output:** separate current-family Planar-Mapped Master, `4728 × 5760` RGBA PNG, transparent-area behavior checked, no automatic Source/Canonical overwrite.
- **Validation reference:** same-input FRONT/BACK `luux-mockup/baker.html` PNGs plus practical visual comparison; test lifecycle and state invariants separately.
- **Not required before starting:** 9B-C, 9C, Photoshop sync/refresh, new Snapshot source types, or a large project-schema redesign.

## Addendum — resolution/source contract correction after production-file evidence (2026-09-14)

The earlier sections are preserved as the historical audit, but their **Planar input = global 4728 × 5760 Canonical** recommendation is superseded. Actual FRONT 75F production input is 3000 × 3840 and BACK input is 2100 × 3840. The existing baker accepts each family-native image as Slot A media and exports a separate 4728 × 5760 Planar Master. The user's source files, baker outputs, diff images, and real-footage reference are under `2DAsset/Calibration/PlanarBakeTest/`; see `PLANAR-A-RESOLUTION-CONTRACT-CORRECTION.md` and `PLANAR-A-VALIDATION.md` for the current contract and validation status.

The corrected derived dependency is **current-family Full Merged DIRECT (family-native) → family-specific Planar mapping → LUUX Planar Master (4728 × 5760)**. Existing 4728 × 5760 Full Merge `CANONICAL` and 9B-B Canonical Photoshop target remain separate legacy/technical outputs. Their equal pixel dimensions do not make either a Planar Master. The fixed Planar camera and GLB/UV asset contracts remain unchanged. This addendum itself did not establish visual parity; the subsequent same-input FRONT/BACK fixture user PASS is recorded in `PLANAR-A-VALIDATION.md`. Practical-image end-to-end delivery remains deferred.
