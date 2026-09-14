# PLANAR-B handoff

**Status:** CLOSED / AUTOMATED TECHNICAL PASS / PRACTICAL USER PASS (2026-09-14).

The current-family source is **BAKE FULL MERGED DIRECT**, not selected-layer Direct or technical Canonical: FRONT 75F uses 3000 × 3840, BACK uses 2100 × 3840. The output is the separate LUUX PLANAR MASTER 4728 × 5760 RGBA PNG.

In the Final Output panel: **BAKE FULL MERGED → BAKE PLANAR → SAVE PLANAR PNG**. The quick Bake menu also offers BAKE PLANAR. A successful bake opens a fitted PNG preview inside the canvas; VIEW PLANAR reopens it, while CLOSE/backdrop/Escape dismiss it. A dirty or unavailable Full Merge is refused with `FULL MERGE REQUIRED`; no automatic Full Merge occurs. Planar states are `UNAVAILABLE`, `DIRTY`, `BAKING`, `READY`, `ERROR`. SAVE and VIEW require READY for the exact current-family Full Merged Direct revision.

Planar is a derived runtime cache. The authoring stack's central merged-dirty hook invalidates the relevant family; a new Full Merge, project open/reset, and shutdown invalidate publication. Family/project generation and a post-encode current-revision check reject stale asynchronous completion. Only one Planar job runs at a time. The PLANAR-A render owns/disposes temporary GPU resources; the workflow releases CPU source/readback byte references and retains only a PNG Blob per family. Successful rebake replaces the Blob transactionally. Project schema remains **v4**; no Planar image or READY flag is saved to project.json.

Existing Full Merge Direct/Canonical outputs, 8F compositing, 9B-B Canonical Photoshop target, preview background, and Planar-A geometry/texture/alpha algorithms were not changed. Both Planar GLBs were tracked in Git at work start. No Photoshop Planar send/target, 9B-C, 9C, 90F, ILMIN, or SYNC was added.

Automated results and the user evidence are in [PLANAR-B-VALIDATION.md](PLANAR-B-VALIDATION.md). Technical runtime passed for both families, including three repeated bakes each with zero resource delta. The user confirmed practical FRONT/BACK artwork, saved 4728 × 5760 RGBA PNGs with alpha, and popup close/reopen/reopen-while-open without side effects. A faint boundary change in the transparency-heavy special case is explicitly accepted as non-blocking; this is not a claim of mathematically perfect edge pixels. No Planar mapping or alpha algorithm change was made for closeout.

Repository handoff (2026-09-14): functional validation is CLOSED, but the PLANAR-B implementation, tests, and these documents remain uncommitted in the current `main` working tree. This closeout did not commit or push. A new Codex task must continue from the current working tree to see this implementation unless a separate Git commit is authorized and completed first.
