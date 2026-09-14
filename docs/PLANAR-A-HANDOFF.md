# PLANAR-A Handoff

Status: **IMPLEMENTED / AUTOMATED TECHNICAL PASS / ORACLE PARITY VALIDATION OPEN**. Do not mark CLOSED or begin Planar-B until FRONT and BACK practical baker comparisons pass.

The foundation is in `desktop-app/src/planar-mapping-profile.js`, `planar-mapping-runtime.js`, and `planar-asymmetric-fixture.js`. `desktop-app/scripts/build.mjs` packages and verifies the two Signage baker GLBs into `build/assets/planar` and records both profiles in `assets-manifest.json`. `desktop-app/src/renderer.js` exposes a development-only fixture smoke hook; `desktop-app/src/main.cjs` writes its full-resolution evidence through `--planar-a-smoke-test`. There is no Planar UI activation or project schema change.

The future production caller must obtain the current-family Full Merge ready/revision state and call `readPlanarCanonical(fullMergeRuntime, familyId, { ready, revision })`. Pass the returned input to `PlanarMappingRuntime.render(familyId, input, { sourceCanonicalRevision: revision })`, then release the returned bytes when no longer needed. Call `invalidateFamily(familyId)` when upstream Full Merge becomes dirty. No authoring layer, Vector Mask, Direct canvas, Photoshop Snapshot, or source provenance may be read by this derived stage. This lifecycle is not yet attached to user UI; that is Planar-B work.

Validation, exact hashes, renderer/texture/output contracts, runtime report paths and the user oracle procedure are recorded in `PLANAR-A-VALIDATION.md`. Automated build, static, protocol, whole-app Electron smoke and real Electron Planar fixture smoke pass. The source GLBs remain user-owned untracked files and must be explicitly included in any future release commit. Existing `luux-mockup/` oracle files are untouched.

The next action is a user-assisted FRONT and BACK same-fixture comparison with `luux-mockup/baker.html`. Stop and fix only the discrepancy if orientation, UV, camera framing, crop, or major alpha fails. After both practical parity PASS results, Planar-A may be CLOSED and Planar-B separately authorized. 9B-C, 9C, Photoshop Planar target/SEND, Full Merged SEND, and 16/32-bit work remain outside this block.
