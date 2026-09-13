# POST-9B-A Validation — Project-Persisted Alpha Preview Background

Status: **CLOSED / AUTOMATED TECHNICAL PASS / USER VALIDATION PASS**  
Date: 2026-09-13  
Scope: SITE 3D anamorphic signage display only. Block 9B-A remains CLOSED / AUTOMATED PASS / USER PASS.

## Purpose and display contract

The existing signage mesh showed transparent bitmap pixels as holes into the 3D scene. `PREVIEW BACKGROUND` now supplies one project-global grayscale value `g` in `[0, 1]` (step `0.01`, default `0.50`). After choosing the preview source, the display blends its straight RGBA over `g`: `displayRGB = sourceRGB × sourceAlpha + g × (1 − sourceAlpha)` and `displayAlpha = 1`. Black, mid-gray, and white correspond to `0`, `0.5`, and `1`. This is a **display-only** compositing contract, not an alpha-flattening export option.

AUTHORING retains the existing layer/opacity/blend/mask composite in its canvas. A reusable gray coverage canvas is drawn behind that composite only on the projected surface; the surface material is opaque gray where AUTHORING has no texture map. PHOTOSHOP FINAL keeps its exclusive Live composite texture (no SMG authoring overlay); the existing SITE 3D material applies a shared GPU uniform and forces display alpha to one. Color is blended in the existing output/sRGB display space without changing the texture upload, ICC handling, sampling, or AA pipeline. The material is reused; the slider changes a uniform and material color, not source pixels, PNGs, render targets, or Photoshop data.

The 9B-A `UNAVAILABLE`, `WAITING`, and `RESOLUTION MISMATCH` gate still wins. No mismatched or unavailable Photoshop artwork appears; gray does not make the wrong-size image eligible.

## Persistence and transactionality

The existing manifest validator rejects unknown fields, so an unversioned v3 addition would violate its contract. The new canonical project root is `schemaVersion: 4` with exactly one `preview.backgroundGray` finite number from `0` to `1`. New project/startup default: `0.5`. Readers support v1/v2/v3 without `preview` and supply `0.5` in memory; saving writes v4. Invalid/missing v4 preview values refuse the load. The UI value is committed only after the existing transactional `acceptOpen` succeeds; a failed load leaves the current session value and layer stack intact. Existing save transactionality is unchanged. `Preview Mode` itself remains session-only and resets to AUTHORING on project open.

Changing the slider does not call the authoring invalidation path. Layer pixels, source/Photoshop Snapshot/file alpha and provenance, transform, visibility, opacity, blend, vector mask, pixel/metadata/merged dirty and NEEDS BAKE state, bake outputs, Full Merge outputs, target registry/ownership, and Photoshop SEND DIRECT pixels/alpha are untouched. Only the project save status prompts the user to save the new preference. This invariance is enforced by source-path isolation and the runtime smoke's stack, dirty, bake, merge, and registry checks; it is **not** a claim that real Photoshop output was byte-compared in this automated run.

## Automated evidence

| Check | Result |
| --- | --- |
| `npm run build` | PASS |
| `npm run test:static` | PASS |
| `npm run test:protocol` | PASS, including Block 8D, 8E, 8F, 9A, 9B-A, and new preview-background tests |
| `npm run test:preview-background` | PASS: RGB/alpha math at alpha 0/0.5/1; opaque independence; range and clamping; v4 exact save/load at 0, 0.23, 0.27, 0.5, 1; v1/v2/v3 default; invalid-field rejection; stack unchanged |
| `npm run test:runtime` | PASS outside sandbox; `BLOCK0_TECHNICAL_PASS=true`. New FRONT/BACK smoke checks 0/0.27/0.5/1 slider values, opaque material, shared Final texture/uniform path, mismatch artwork rejection, unchanged stack/pixel/metadata/merged/bake/registry state; texture count `2 → 2`, context loss `0`. |

The first sandboxed Electron attempt could not start its GPU process (`GPU process isn't usable`) and is not counted as an application failure or as test evidence. The permitted unsandboxed rerun passed. Automated checks do not replace the user's visual/real-Photoshop acceptance.

## Manual user validation — PASS / CLOSED

Use an existing alpha-bearing image and a saved test project. In SMG choose `SITE 3D` → `ANAMORPHIC` → `FRONT 75F` or `BACK` and its calibration/approved projection view, then find `PREVIEW BACKGROUND` directly under the Preview Mode buttons. Prefer a sacrificial PSD/target for the send comparison; do not overwrite production artwork merely for this check.

| Gate | Action | PASS condition |
| --- | --- | --- |
| A — transparency | In SITE 3D, set `PREVIEW BACKGROUND` to `0.00`, `0.50`, `1.00`. | Fully transparent signage regions appear black, mid-gray, white respectively; background 3D geometry never shows through as a mesh hole. |
| B — opaque pixels | Watch the same fully opaque part while moving 0 → 0.5 → 1. | That part does not change. |
| C — feather | Repeat with a semi-transparent/feathered edge. | Edge blends smoothly with each gray, with no hard cutout. |
| D — both sources | Toggle `AUTHORING PREVIEW` ↔ `PHOTOSHOP FINAL PREVIEW` at one gray value and repeat on FRONT and BACK. Use a matching native Direct Photoshop document: FRONT `3000 × 3840`, BACK `2100 × 3840`. | Both previews use the same gray; Final shows Photoshop composite only. A wrong-size/absent Final frame still shows the explicit 9B-A warning and no artwork. |
| E — Bake | Bake/export the same unchanged layer/full merge with gray `0.00` and `1.00`; compare the resulting PNGs. | Production PNG RGBA is identical; gray does not appear in the Bake. |
| F — Photoshop | In a disposable same-size PSD, send the same selected layer Direct at gray `0.00` and `1.00`; compare returned layer RGBA/alpha. | Sent data does not differ because of gray. |
| G — persistence | Set `0.31`, `Save Project`, close/restart SMG, then `Open Project`. | Slider/readout returns exactly `0.31`; changing FRONT/BACK or preview mode does not reset it. |
| H — legacy | If available, open a backed-up v3 project with no `preview` field. | Value defaults to `0.50` while layers/masks/Snapshot metadata still load unchanged; new save uses v4. |

For E and F, keep all artwork and layer controls unchanged between runs; otherwise the comparison is not diagnostic. For the visual gates, report FRONT/BACK and AUTHORING/FINAL separately.

The user completed the real-application check on 2026-09-13 and accepted this follow-up. The supplied FRONT and BACK SITE 3D screenshots show black/intermediate/white background values, an intact opaque signage surface, and smooth pink semi-transparent/feathered artwork. Fully opaque artwork did not visibly change with the gray slider. The UI source-mode checks distinguish AUTHORING from PHOTOSHOP FINAL at native Direct dimensions: FRONT `3000 × 3840` and BACK `2100 × 3840`. FRONT AUTHORING was initially empty because SMG had no active layer; its Photoshop FINAL correctly showed the Photoshop pink artwork. A later FRONT check with `BackOrg.png` active and `ON` showed the authoring image. Applying a vector mask clipped only AUTHORING to the edited region while Photoshop FINAL retained its separate pink artwork. `DIRTY / NEEDS BAKE` and the mask camera interlock in that unsaved edit are expected, not preview-background failures. BACK AUTHORING and FINAL likewise displayed their respective SMG/Photoshop images over the selected gray without an alpha-shaped hole in the signage mesh. The earlier 9B-A wrong-resolution/unavailable Final warning remains a separate accepted gate; this check did not replace it.

Output invariance was checked from the submitted PNG files. The three FRONT Bake PNGs at gray `0.00`, `0.48`, and `1.00` were byte-identical (SHA-256 `C31131DB2F8C5522F67361C3D89F975D8AED861057353D619EBE776E968E05A1`). The corresponding three Photoshop-saved PNGs were also byte-identical (SHA-256 `D994DB02F3843AF842DB8CA3DCFB0AE97907484338DC4C3B8EF456AFB1D78646`). The four BACK `Block8A_BACK_DirectProjected_2100x3840_{0p00,0p15,0p69,1p00}.png` files were byte-identical (SHA-256 `A3F54DDC1F597493BB0AD959A9F5A5DEBB227068D5D0A0DCC5481C9964B31FE2`). BACK `toPs_0p00.png` and `toPs_1p00.png` were byte-identical; `toPs_0p15.png` and `toPs_0p69.png` were byte-identical to each other but differed from the endpoint pair. The user reported that the Photoshop-saved endpoint pair had been exported with an overlapping ORG layer; therefore the cross-pair difference is not a controlled gray-only comparison and is not attributed to the SMG slider. This records practical exported-PNG evidence, not a raw Photoshop layer-ACK or hidden-RGB guarantee.

The user confirmed that saving gray `0.31`, restarting SMG, and reopening the project restored exactly `0.31`. A legacy project opened with the default `0.50`, and the user confirmed its layer/mask remained present; the supplied screenshot shows the vector-mask path and layer restored. No field-by-field Snapshot metadata audit of that particular legacy project is claimed. Automated v1/v2/v3 compatibility and v4 serialization results are recorded above. User validation is **PASS** for the exercised workflow, so this follow-up is **CLOSED**. This does not close 9B-B, 9B-C, or 9C.

## Known issues and deferred boundaries

The Block 9B-A thin-line/edge difference between AUTHORING and FINAL remains a display sampling/AA candidate; Photoshop rendering itself was reported correct. No AA, texture filtering, color-management, or ICC redesign was done here. Hidden RGB beneath alpha zero is not guaranteed by the existing 9A contract. Deferred: 9B-B target quick create/register, 9B-C Photoshop input expansion, 9C source sync/reconcile, future planar mapping bake, SEND FULL MERGED, and higher-bit-depth workflow. None is implicitly completed by this follow-up.
