# Block 9B-A Handoff — Preview / Workflow Separation

**Status: BLOCK 9B-A CLOSED / AUTOMATED PASS / USER PASS**  
Date: 2026-09-13  
Branch: `main`  
Base HEAD: `c9bdc2b79385a4acc7ffda6311e4033e6ac98d83`

## Delivered

Explicit, exclusive `AUTHORING PREVIEW` and `PHOTOSHOP FINAL PREVIEW` selection on the existing SITE 3D display path; clear disconnected/waiting/invalid/Direct-resolution mismatch states; session-only AUTHORING default on start/project open; selected-layer output and merged-PNG export workflow labels; anamorphic master label and disabled future planar placeholder. The Photoshop Final path hides the SMG authoring overlay and never silently falls back to it. The source/target identity and same-PSD ownership separation from 9A remain unchanged.

Implementation: `desktop-app/src/preview-mode.js`, `renderer.js`, `index.html`, `styles.css`; automated coverage: `tests/block-9ba-validation.mjs` and Electron runtime smoke. The pre-existing Block 8F quick-action order assertion was updated to reflect the separated UI, without changing Full Merge compositing.

## Verification / closure gate

User testing exposed a mismatch-preview texture leak: active surface bindings did not carry `textureEligible`, so the display switch and original smoke skipped them. The corrected switch operates on the actual active meshes. The old Block 5A/5B runtime smoke also assumed the AUTHORING surface retained a shared Live texture; its assertion now matches the explicit 9B-A preview-source contract. The final `npm test` passed outside the sandbox, including build, static, protocol, and full Electron runtime (`BLOCK0_TECHNICAL_PASS=true`). The 9B-A Electron smoke passed for FRONT and BACK; a prior occupied-port run was not counted as PASS. No running user app was terminated.

The user's real Photoshop retest is **PASS**: native FRONT `3000 × 3840` artwork displayed and auto-updated; switching to a `4728 × 5760` document showed the expected/received mismatch and removed its artwork from the signage surface even while more strokes were drawn; returning to the native FRONT document restored Live updates. Other manual checks A–G were reported PASS. This Live Final auto-update is not an automatic SMG authoring-source refresh. See [Block 9B-A Validation](BLOCK-9B-A-VALIDATION.md) for the distinct automated and manual evidence. This closes **9B-A only**; 9A validation and the remaining 9B roadmap are separate.

## Boundary preserved

Project schema remains v3. Projection math, vector-mask engine, Full Merge blend engine, project migration, Photoshop Snapshot transport, and OwnedLayerRegistry were not redesigned. No Photoshop original layer visibility is changed. No Final-to-Authoring automatic refresh, merged send, target quick create, new source compatibility, or planar mapping was added.

## Deferred matrix

| Block | Deferred work |
| --- | --- |
| 9B-B | Photoshop target quick create/register: FRONT75 Direct `3000 × 3840`, BACK Direct `2100 × 3840`, canonical `4728 × 5760`; Direct default. No automatic target search in this block. |
| 9B-C | Pixel Layer + Layer Mask; Smart Object; multi-select → flattened Snapshot; Group (low priority). |
| 9C | Source Link, Refresh, Source Changed, conflict handling, Reconcile. |
| Future mandatory | Planar mapping bake, resolution/export contract, and Photoshop target. Current UI is placeholder only. |
| Known preview-display issue | Thin-line/edge boundaries can look slightly different between AUTHORING and FINAL preview. Current evidence is consistent with sampling/AA differences, but exact pixel equivalence has not been established. The user reports the Photoshop image looks correct. Do not treat this note as a production PNG regression or a byte-identical claim. |
| Separate follow-up requested by user | Project-persisted `[0, 1]` grayscale background for alpha-bearing images on the SITE 3D preview surface, preventing visual mesh cutout. Preserve original/Bake/Photoshop alpha. Requires its own persistence/display contract; do not slip it into Block 9B-A schema v3. |

**Post-handoff status (2026-09-14):** The deferred table above is historical. The [project-persisted PREVIEW BACKGROUND](POST-9B-A-PREVIEW-ALPHA-BACKGROUND-HANDOFF.md), [9B-B](BLOCK-9B-B-HANDOFF.md), and [PLANAR-B](PLANAR-B-HANDOFF.md) later closed; project schema is now v4. [9B-C1](BLOCK-9B-C1-PROBE.md) found Photoshop user Layer Mask visible-result Snapshot **CLOSED / UNSUPPORTED / NON-BLOCKING**; no further implementation planned. Smart Object and multi-select Flatten remain separate conditional candidates. The current roadmap is in [post-completion correction](POST-COMPLETION-DOCUMENT-CORRECTION-VALIDATION.md).
