# PLANAR-B validation

## Purpose and authority

PLANAR-B connects the validated PLANAR-A mapping runtime to the explicit user workflow. The only input is the **current-family BAKE FULL MERGED DIRECT** output. Selected-layer Direct, Full Merge Canonical, Photoshop Live/Snapshot, and project assets are not Planar sources.

| Family | Full Merged Direct input | LUUX Planar Master PNG |
| --- | ---: | ---: |
| FRONT 75F | 3000 × 3840 | 4728 × 5760 |
| BACK | 2100 × 3840 | 4728 × 5760 |

The output remains PLANAR-A RGBA8, straight alpha, sRGB, top-left. No GLB, camera, UV, texture filtering, alpha algorithm, or Full Merge math was changed. Preview Background gray is display-only and is not included in the PNG.

## UI and state contract

In the Final Output / Full Composite area, run **BAKE FULL MERGED**, then **BAKE PLANAR**, then **SAVE PLANAR PNG**. BAKE PLANAR never initiates Full Merge automatically. The Planar panel identifies its source as FULL MERGED DIRECT and remains visually distinct from `ANAMORPHIC MASTER · CANONICAL`.

The quick Bake menu also exposes BAKE PLANAR as its third tier. A successful Planar bake opens the cached PNG in a fitted, checkerboard-backed popup inside the canvas. CLOSE, the backdrop, or Escape dismiss it; VIEW PLANAR reopens the same READY result without re-baking. When the source revision/project/view changes, the popup closes and its object URL is released. This is a display-only preview, not a Photoshop send or a change to the saved PNG.

- `UNAVAILABLE`: no current Full Merged Direct (including after authoring changes or project open); BAKE/SAVE disabled and Full Merge required.
- `DIRTY`: current Direct exists but Planar is not READY for its revision; BAKE enabled, SAVE disabled.
- `BAKING`: one Planar job in progress; duplicate bake and save disabled.
- `READY`: cached PNG belongs to the exact `sourceFamilyId` and `sourceMergedDirectRevision`; SAVE enabled only while Direct remains current.
- `ERROR`: last render/encoding failed; SAVE disabled, explicit re-bake allowed while Direct remains current.

`ScreenImageLayerStack.invalidateMerged()` is the central authoring-to-Full-Merge dirty hook and notifies Planar for that family. A new explicit Full Merge bake also invalidates its prior Planar output. Front and Back state remain independent. Selection, preview-mode switch, preview-background change, and view/navigation operations do not use this invalidation hook. No Canonical-only marker is consulted.

The workflow captures family, Direct merged revision, family generation, and project generation. Before publishing and after PNG encoding it checks that the same project and family revision are still current and Full Merge remains READY. Late/stale completions are discarded. Opening/replacing a project, reset, and shutdown clear cached outputs and invalidate in-flight publication. The one-job gate prevents simultaneous large readbacks.

## Resource and PNG ownership

`readPlanarSource()` returns a fresh CPU copy of the Full Merge Direct readback. The workflow severs that byte reference after render; it also releases the Planar output byte reference after PNG encoding. PLANAR-A disposes its GLB geometry/materials/textures, input canvas/texture, render target, and temporary renderer state at render completion. The persistent derived cache contains only a PNG Blob per family, not an RGBA buffer or project asset. A successful replacement commits the new Blob before releasing the old reference; failure never resurrects an old READY result. SAVE uses the existing Blob download convention. Project schema stays v4, and Planar READY/PNG bytes are not persisted.

## Automated and runtime evidence

Executed 2026-09-14:

- `npm run build` — PASS.
- `npm run test:static` — PASS.
- `npm run test:protocol` — PASS, including Block 8F, Block 9B-B, Planar-A, and Planar-B validations.
- `npm run test:runtime` — PASS (`BLOCK0_TECHNICAL_PASS=true`).
- `npm run test:planar-a` and `npm run test:planar-a:runtime` — PASS (`PLANAR_A_TECHNICAL_PASS=true`).
- `npm run test:planar-b` — PASS (`PLANAR_B_VALIDATION_PASS=27`): prerequisite refusal, Direct-only source, family dimensions/independence, DIRTY→READY, canonical-only independence, stale save prevention, repeated trigger prevention, async stale/project-replacement rejection, render failure, transactional replacement, project reset, central invalidation, quick Bake and preview UI wiring.
- `npm run test:planar-b:runtime` — PASS; [runtime report](../desktop-app/.runtime/planar-b-runtime.json) records Front/Back native Full Merged Direct → 4728 × 5760 PNG color type 6, three repeated bakes per family, byte-identical PNG hashes across preview gray 0/1 and AUTHORING/PHOTOSHOP FINAL mode, no authoring/project mutation, zero texture/geometry/context-loss delta.

The Electron GPU process could not start under the default local sandbox (`exit_code=-1073741515`); this also affected the pre-existing `test:runtime`. Runtime tests were rerun in isolated unsandboxed execution. Fusion was using the GPU and CPU renderer concurrently; the Planar-B smoke waits for both Site and Environment startup assets before measuring resource deltas, so asynchronous scene loading is not mistaken for a Planar leak. No production rendering fallback or mapping change was introduced.

Closeout recheck on 2026-09-14 after the practical user PASS: `npm run build`, `npm run test:static`, `npm run test:protocol`, and `npm run test:planar-b` all passed. The GPU/runtime smoke was not rerun during this documentation-only closeout; its earlier PASS above remains the technical runtime evidence.

## Practical user validation — PASS (2026-09-14)

Original planned reproduction checklist (retained for reference): use `2DAsset/Calibration/PlanarBakeTest/`; import `Test_Front75F_mychoice2026_.jpg` (3000 × 3840) into Front authoring and `Test_Back_mychoice2026_.jpg` (2100 × 3840) into Back authoring, each at 1:1 family resolution. For each family, run BAKE FULL MERGED, confirm MERGED READY, run BAKE PLANAR, view/reopen the popup, and SAVE PLANAR PNG. Inspect each 4728 × 5760 output for orientation, grid, contour, UV alignment, and crop against existing baker references. Byte equality is not required. Actual user acceptance below used practical artwork with alpha, not the opaque JPGs alone.

The user completed the FRONT/BACK workflow with practical artwork and accepted the visual output. The saved [`LUUX_Planar_Master_Front75F_4728x5760_2.png`](../2DAsset/Calibration/PlanarBakeTest/LUUX_Planar_Master_Front75F_4728x5760_2.png) and [`LUUX_Planar_Master_Back_4728x5760.png`](../2DAsset/Calibration/PlanarBakeTest/LUUX_Planar_Master_Back_4728x5760.png) are both 4728 × 5760 RGBA PNGs. Read-only pixel inspection found transparent / partial-alpha / opaque pixel counts of 20,888,529 / 3,841,400 / 2,503,351 for FRONT and 15,401,675 / 7,322,301 / 4,509,304 for BACK. Thus alpha is present in the saved files, not only in the popup display. The user-supplied `C:\Users\user\Downloads\Block8F_BACK_MergedDirect_2100x3840_v2.png` is also RGBA with transparent and partial-alpha pixels; its artwork and the mapped BACK result were visually accepted by the user.

The user confirmed that closing and reopening the Planar popup, and reopening while it was already open, produced no side effects. Practical full-coverage artwork on both families is user PASS. On a transparency-heavy special case, the user noticed a faint edge change against black and explicitly accepted it as within tolerance. Record this as a non-blocking known difference, not as proof that every partial-alpha boundary pixel is identical to the old baker. The prior PLANAR-A same-input observation remains: alpha and opaque/transparent RGB matched, while partial-alpha stored RGB can differ. No color, AA, filtering, or alpha tuning is included in PLANAR-B.

The earlier JPG-based reference bakes do not exercise source-alpha preservation: both practical JPG inputs have no alpha, and their reference PNGs contain only alpha 255. They should not be interpreted as evidence that the current PNG save path removes existing alpha. The user's alpha-preserving PNG output preference is met by the current saved FRONT/BACK examples above.

## Deferred scope

No Planar Photoshop target/send, no Full Merged send, no project persistence of derived output, no 9B-C/9C/90F/ILMIN/SYNC, and no AA/filter/color-management redesign. The practical PASS above is the user's explicit acceptance, not an inference from technical tests.
