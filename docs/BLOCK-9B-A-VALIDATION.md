# Block 9B-A Validation — Preview / Workflow Separation

Status: **BLOCK 9B-A CLOSED / AUTOMATED PASS / USER PASS**  
Date: 2026-09-13  
Base HEAD: `c9bdc2b79385a4acc7ffda6311e4033e6ac98d83`

## Purpose and scope

Block 9B-A separates the existing `INPUT → AUTHORING → BAKE → FINAL` workflow at the display/UI boundary. It selects between the existing SMG authoring preview and the existing Photoshop Live document composite in SITE 3D. It adds no source type, bake type, Photoshop target, transport protocol, project field, or projection algorithm.

## Preview mode contract

| Mode | Display source | Missing/invalid Photoshop frame |
| --- | --- | --- |
| `AUTHORING PREVIEW` | Current SMG authoring layer composite only; existing transform, visibility, opacity, blend, order, and vector-mask preview remain authoritative | No dependency on Photoshop |
| `PHOTOSHOP FINAL PREVIEW` | Current Photoshop Live document composite only; SMG authoring overlay hidden | Explicit `UNAVAILABLE`, `WAITING`, or `RESOLUTION MISMATCH`; no authoring fallback |

The UI exposes the link state, document name, received size, expected family size, and preview state. Startup and successful project load select `AUTHORING PREVIEW`. The mode is session-only and is absent from project schema v3 and the save payload. Switching modes does not alter authoring IDs, transforms, order, visibility, opacity, blend, vector masks, provenance, pixel/metadata/full-merge dirty state, bake result, target registry, or output ownership. Mode switches reuse the current site materials/texture; they do not allocate a new renderer or render target.

Final preview accepts only native Direct dimensions: FRONT75 `3000 × 3840`, BACK `2100 × 3840`. A `4728 × 5760` canonical frame is a mismatch, not resized or resampled. The displayed composite is the current Photoshop document; any duplicates *inside* that PSD due to Photoshop layer visibility remain under user control. The prevented duplicate is Photoshop composite plus the same SMG editable content as a second overlay.

No automatic `FINAL → AUTHORING` feedback loop exists. An explicit `FROM PHOTOSHOP COMPOSITE`, `FROM PHOTOSHOP SELECTION`, or file import creates a new source as before; it does not refresh an existing layer. The same PSD may contain a user-owned original source layer and a separately identified Previz-owned output layer. Snapshot provenance is not output ownership; no layer count/name inference or source visibility mutation is introduced.

## Output UI contract

- `LAYER OUTPUT · SELECTED`: `BAKE CURRENT` and `SEND DIRECT` apply to the selected authoring layer.
- `FULL COMPOSITE · EXPORT ONLY`: `BAKE FULL MERGED`, `SAVE MERGED DIRECT PNG`, and `SAVE MERGED CANONICAL PNG` remain export-only. There is no `SEND FULL MERGED`.
- The canonical output is labeled `ANAMORPHIC MASTER · CANONICAL 4728 × 5760`. `PLANAR MASTER` is a future/not-available placeholder only.

## Automated evidence

| Check | Result |
| --- | --- |
| `npm run build` | PASS |
| `npm run test:static` and `npm run test:protocol` (as the first two stages of `npm test`) | PASS |
| `npm run test:block8d`, `test:block8e`, `test:block8f`, `test:block9a` (within protocol suite) | PASS |
| `npm run test:block9ba` | PASS: mode decision, FRONT/BACK Direct dimensions, invalid/disconnected/waiting/mismatch, UI structure, schema v3/save-payload invariance |
| `npm run test:runtime` after mismatch correction and legacy smoke update | PASS outside sandbox; `BLOCK0_TECHNICAL_PASS=true`. The 9B-A smoke passed for FRONT and BACK: actual active mesh maps are null in AUTHORING/unavailable/mismatch, current Live texture only in FINAL; 4 repeated switch cycles; authoring snapshot and bake/registry identity unchanged; texture count `2 → 2`; context loss `0`; Photoshop mutation `0`. |
| `npm test` after closeout status update | PASS outside sandbox: build, static, protocol, and runtime gates. |

Earlier attempts were not counted as final evidence: sandboxed Electron could not start its GPU process, and one unsandboxed full runner encountered `EADDRINUSE 127.0.0.1:34100` while the user app occupied the Live Link port. No user process was terminated. Once the port was free, a full runner reached its assertions but exposed an obsolete Block 5A/5B expectation that the anamorphic AUTHORING surface still shared the Live texture. Block 9B-A deliberately leaves that material map null; the legacy smoke now verifies `previewSource === 'AUTHORING'` and no shared Live texture. The final full runner passes. The automated 9B-A smoke uses simulated Live-frame metadata and the startup texture; real Photoshop acceptance is recorded separately below.

## Manual Photoshop validation — USER PASS

- **A — Preview separation:** On BACK, bake/send layer A to Photoshop. Verify AUTHORING shows SMG A and FINAL shows only the Photoshop composite, without doubled A.
- **B — State invariant:** Toggle AUTHORING ↔ FINAL repeatedly and verify transform, opacity, mask, dirty state, and bake state are unchanged.
- **C — Disconnected/no frame:** Select FINAL with Live Link unavailable and verify explicit unavailable/waiting, never silent authoring fallback.
- **D — Wrong resolution:** On FRONT 75F, supply a `4728 × 5760` Live document and verify expected `3000 × 3840`, received `4728 × 5760`, mismatch, and no artwork on the signage surface. Restore a native `3000 × 3840` document and verify Live artwork resumes.
- **E — Same PSD:** Snapshot a user-owned original Pixel Layer and send Direct to the same PSD. Verify original untouched and Previz-owned output separate with no identity collision.
- **F — UI distinction:** Verify selected-layer send and full-composite PNG export are readily distinguishable.
- **G — FILE regression:** Load, transform, bake current, and send direct for an ordinary FILE layer.

This gate was reported by the user on 2026-09-13. It closes **Block 9B-A only**, not the remaining 9B roadmap or Block 9A's separate validation.

### User observations received 2026-09-13

| Test | User observation / disposition |
| --- | --- |
| A | PASS by user report. Initial FRONT/BACK target confusion was a manual setup error, not an application fault. With corrected setup, no obvious doubled content was reported. |
| B | PASS by user report for repeated switching/state. Thin-line boundaries look slightly different; current evidence is consistent with display sampling/AA differences, but does not prove exact pixel equivalence. The Photoshop result itself looks correct to the user. Retain a **known preview-display issue**, not an output-bitmap regression claim. |
| C | PASS by user report: disconnect is conspicuous and does not appear healthy. |
| D | PASS by user report after correction. FRONT native `3000 × 3840` artwork appeared and auto-updated while drawing. Switching to a `4728 × 5760` Photoshop document showed `RESOLUTION MISMATCH` (expected `3000 × 3840`, received `4728 × 5760`) and cleared the signage image; further drawing in that mismatched document did not appear on the surface. Returning to the native FRONT document restored Live updates. The earlier leak was caused by iterating active bindings as though they had `textureEligible`; the corrected switch operates on their actual meshes. |
| E | PASS by user report: original artwork protected and Previz-owned result separate in same PSD. |
| F | PASS by user report: selected-layer send and full-composite export are distinguishable. |
| G | PASS by user report: FILE workflow still functions. |

The user's auto-update observation here concerns the **Photoshop Live Final preview only**. It does not imply automatic refresh of an existing SMG authoring source, which remains deferred to Block 9C. The mismatch gate rejects display of the wrong-size Live frame; it need not stop Photoshop from producing frames internally.

The screenshots do not establish byte-identical viewport rendering. A read-only comparison of matching `test01.png` / `test02.png` screen positions found a representative flat-color interior region with mean absolute RGB difference `0.18/255`, while boundary regions differed more. This supports treating the thin-edge difference as a preview sampling issue candidate; source, exported PNG, and Photoshop-host pixels were not measured here.

## Unsupported/deferred

9B-B target quick create/register (FRONT75 Direct `3000 × 3840`, BACK Direct `2100 × 3840`, canonical `4728 × 5760`, Direct default; no automatic target search); 9B-C Pixel Layer + Layer Mask, Smart Object, multi-select flattened snapshot, lower-priority Group; 9C source link/refresh/change/conflict/reconcile; future mandatory planar mapping bake/export/target. None is implemented in 9B-A.

User-requested separate follow-up: a **project-persisted** grayscale preview background value in `[0, 1]` for alpha-bearing images. It should keep the signage mesh visually opaque instead of using bitmap alpha as a literal cutout, while preserving source alpha, Bake output, and Photoshop transport unchanged. The current SITE 3D material is `transparent: true` and therefore exposes the scene through transparent texels; this is a display-composition requirement, not a request to flatten production pixels. Persistence/schema design and implementation are outside Block 9B-A.

**Later status (2026-09-14):** This deferred list is the 9B-A closure snapshot. The [preview-background follow-up](POST-9B-A-PREVIEW-ALPHA-BACKGROUND-VALIDATION.md), [9B-B](BLOCK-9B-B-VALIDATION.md), and [PLANAR-B](PLANAR-B-VALIDATION.md) subsequently closed; project schema is now v4. The [9B-C1 real-host probe](BLOCK-9B-C1-PROBE.md) closed Photoshop user Layer Mask visible-result Snapshot **UNSUPPORTED / NON-BLOCKING**, without further implementation planned. Other conditional candidates retain separate gates; 9B-A PASS is unchanged.
