# PLANAR-A Validation

Status: **RESOLUTION CONTRACT CORRECTION IMPLEMENTED / AUTOMATED TECHNICAL PASS / SAME-INPUT FIXTURE USER VISUAL PASS**. Practical-image, user-facing Planar bake/export remains deferred; this is not a Planar-B implementation or end-to-end delivery PASS.

## Authority and scope

The initial Planar-A assumption that its input was a global 4728 × 5760 Full Merge `CANONICAL` result is **superseded** by `PLANAR-A-RESOLUTION-CONTRACT-CORRECTION.md`. The supported Planar source is current-family Full Merged `DIRECT`: FRONT 75F 3000 × 3840 or BACK 2100 × 3840. The separate `LUUX_PLANAR_MASTER` output is 4728 × 5760. `CANONICAL` in pre-existing Projection Bake/Full Merge/9B-B features remains a legacy/technical output, not a Planar Master or Planar source. No global Canonical rename, user Planar UI, Photoshop target, or project-schema migration is part of this correction.

## Assets, camera, and texture

| Family | Source resolution authority | Planar GLB / exact mesh | GLB SHA-256 |
| --- | --- | --- | --- |
| `ANAMORPHIC_FRONT_75F` | `ANAMORPHIC_FRONT_75F_PROFILE.workingResolution`: 3000 × 3840 | `Previz_3Dworld_Anamorphic_Baker_Front75F_v1.glb` / `SCREEN_Bake_Front` | `D59E406B3D63AB40ACEC10336ACF87D279A15D466B2179B74CC1A96FCBFAA85A` |
| `ANAMORPHIC_BACK` | `ANAMORPHIC_BACK_PROFILE.workingResolution`: 2100 × 3840 | `Previz_3Dworld_Anamorphic_Baker_Back_v1.glb` / `SCREEN_Bake_Back` | `D7A033528266C31F696ECDD088A6B9E771F993492D9847491ED21E161E4C6A61` |

The Family Profile, not Planar runtime branches, owns the input size. `getFamilyCompositeResolution()` can also consume a future profile with another working/composite size; only available Planar GLB bindings are FRONT/BACK today. The output profile owns 4728 × 5760 independently. The fixed Planar camera still has vertical FOV 10°, aspect **4728/5760**, near/far 0.01/10000, position `(0, 342.9015690828403, 0)`, and XYZ rotation `(-π/2, 0, 0)`. Its aspect follows the output, not either input. Exact mesh binding and authored UV remain unchanged.

`readPlanarSource()` requires ready Full Merge with matching current-family `mergedRevision`, reads **only** `readOutputRgba(familyId, 'DIRECT')`, and validates family-native RGBA8, straight alpha, top-left rows, RGB metadata, exact family, and `DIRECT` kind. No pre-upscale or 16:9 Fit is inserted. `ImageData`/`CanvasTexture` use native source dimensions; texture remains sRGB, `flipY=false`, linear min/mag, clamp, identity UV, and no mipmaps. The output target remains 4728 × 5760 sRGB RGBA8; readback is flipped once to top-left and semi-alpha unpremultiplied as in the original Planar-A foundation.

## Derived state and non-mutation

Per-family `PlanarMappingRuntime` state records `sourceFamilyId` and `sourceMergedDirectRevision`, with `UNAVAILABLE`, `DIRTY`, `READY`, or `ERROR`. A new Full Merged Direct revision dirties the derived state; an unchanged Direct revision stays ready even if a legacy Canonical-only marker changes. FRONT and BACK are independent. The caller will eventually invalidate on authoring/Full Merge dirtiness in Planar-B; that user workflow is not wired here. The foundation render does not write to source authoring, Full Merge targets, Photoshop, project data, or UI. It disposes its temporary GLB/input texture/material/target resources.

## Automated evidence

- `npm run build`: PASS. The manifest records family-specific `sourceResolution` and output-profile `outputResolution`, while enforcing pinned GLB size/hash/node/UV and copy integrity.
- `npm run test:planar-a`: PASS. Covers family resolution authority, synthetic 1234 × 2345 future-family resolver, output independence, DIRECT-only adapter with both mock output kinds present, stale revision rejection, canonical-only independence, Direct revision dirtiness, cross-family rejection, source format, fixed camera, GLB bindings, and no pre-upscale source path.
- `npm run test:planar-a:runtime`: PASS. `desktop-app/.runtime/planar-a-runtime.json` records FRONT 3000 × 3840 and BACK 2100 × 3840 native asymmetric fixtures, two sequential 4728 × 5760 renders per family, expected four-corner landmarks, alpha/texture contract, 0 texture/geometry delta, and no source/authoring/Full Merge/SITE-camera mutation. Generated fixture and Planar PNGs in `.runtime/` are diagnostic artifacts, not a user export workflow.
- Full static/protocol/whole-app regression results: see `PLANAR-A-RESOLUTION-CONTRACT-CORRECTION.md` after the correction run.

## Practical references, fixture visual result, and deferred delivery gate

`2DAsset/Calibration/PlanarBakeTest/` contains actual-production `Test_Front75F_mychoice2026_.jpg` (3000 × 3840) and `Test_Back_mychoice2026_.jpg` (2100 × 3840), existing-baker 4728 × 5760 outputs, `Front_Diff_BakerHTML-SMG.png`, `Back_Diff_BakerHTML-SMG.png`, and `mychoice2026_RealFootage.png`. The two earlier diff PNGs decode to all-zero RGB. These practical artifacts demonstrate the old baker path; the real-footage image is a reference capture, not pixel-level ground truth for the new runtime.

The user later compared each **corresponding family-native asymmetric fixture** in Slot A of `luux-mockup/baker.html`, with gain 1, white tint, identity UV, and no 16:9 Fit, against the new runtime output. FRONT and BACK orientation, placement, and geometry were accepted. On both black and white backgrounds the user reported no visible black fringe or halo. The user supplied `Baker-SMG_Front75F_Difference_.png` and `Baker-SMG_Back_Difference_.png`. Direct decoded-PNG comparison found exactly identical alpha at every pixel and identical RGB wherever alpha was 0 or 255; RGB differs only within partially transparent pixels. This is **same-input fixture USER VISUAL PASS**, not byte equality or a proof of identical straight/premultiplied RGB representation.

The practical-image end-to-end `Full Merged Direct → BAKE PLANAR → SAVE PLANAR PNG` path is not available as user-facing UI and remains unvalidated. Root-cause analysis or tuning of partial-alpha RGB, Photoshop Planar target/SEND, 9B-C, 9C, 90F, ILMIN, and SYNC implementation remain out of scope.
