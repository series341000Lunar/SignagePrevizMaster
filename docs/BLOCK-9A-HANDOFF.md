# Block 9A Handoff

Status: **CLOSED / IMPLEMENTED / AUTOMATED TECHNICAL PASS / REAL PHOTOSHOP USER VALIDATED** (2026-09-13)

Block 9A is **CLOSED / USER VALIDATED** within its RGB 8-bit, sRGB-oriented V1 scope. This handoff records the completed product acceptance; optional diagnostics and future source types do not reopen Block 9A. [Block 9A Validation](BLOCK-9A-VALIDATION.md) records the detailed evidence and limits.

## Delivered

- FROM FILE..., FROM PHOTOSHOP COMPOSITE, and FROM PHOTOSHOP SELECTION enter the same existing authoring Layer Stack.
- Default `Scale 1.00` is native pixel 1:1 against each active working canvas: FRONT 75F `3000×3840`, BACK `2100×3840`. The Scale control is directly below `LAYOUT EDIT`.
- Photoshop Snapshot is an explicit, immutable capture. It does not auto-refresh when the Photoshop document changes.
- Snapshot transport is separate from Live frame and Bake transport: SNAPSHOT_REQUEST -> SNAPSHOT_BEGIN -> SNAPSHOT_CHUNK + binary -> SNAPSHOT_END -> SNAPSHOT_COMPLETE -> SNAPSHOT_COMMITTED.
- The broker allows one inbound large transfer at a time across Live and Snapshot, retains Bake as the reverse path, rejects reused job IDs, and cleans up on timeout/disconnect/role replacement.
- UXP captures with imaging.getPixels() inside executeAsModal(), without resize, flatten, save, mode conversion, or artwork mutation.
- Composite captures the active RGB8 document. Selection rechecks exactly one ordinary active `constants.LayerKind.NORMAL` Pixel Layer and its opacity before and after capture. RGB8/sRGB-oriented is the official V1 scope; Photoshop documents are not auto-converted from 16/32-bit.
- Pyramid levels other than 0, non-native returned bounds, unsupported component layouts, non-RGB documents, and non-8-bit documents are refused.
- Renderer converts raw RGB8/RGBA8 to a project-owned lossless PNG without resampling. Exact dimensions, bounds, SHA-256, alpha/color contracts, and provenance are retained.
- Acknowledgement occurs only after PNG creation, hash, decode/runtime creation, ordinary Layer installation, and context revalidation succeed.
- Selection Snapshot initializes its transform center from Photoshop `captureBounds` in the active Family 1:1 working canvas and initializes opacity from the selected Photoshop Pixel Layer. Initial trimmed selections had overlapped at center; the position correction is **ACCEPTED / AUTOMATED PASS / PRACTICAL USER WORKFLOW PASS**, without claiming an independent forensic position log. The same layer opacity is sent back as Photoshop output metadata; the user's 62% property check passed. Layer opacity is distinct from baked pixel alpha under the preserved Block 8C contract.
- Snapshot layers reuse transform, opacity, blend, visibility, Vector Mask, BAKE CURRENT, and BAKE FULL MERGED.
- Project schema is 3; readers accept 1 / 2 / 3. Old manifests migrate only in memory and emit schema 3 on the next Save.
- Mixed FILE/Composite/Selection stacks save and reopen offline. Photoshop IDs are provenance only and never output authority.
- The real-host BACK sparse-send check passed: with a three-layer SMG stack and no Photoshop-owned output Pixel Layer, bottom order 2 was BAKE CURRENT -> first SEND DIRECT; BACK DIRECT `2100×3840` was READY, Photoshop reported APPLY COMPLETE (Job 1, Layer 11), and UXP Full-Image Write was APPLIED. No placeholder layers for unsent orders 0/1 were created. This proves first-send subset ordering at the host, not a raw ACK field-by-field dump.
- A wrong Canonical `4728×5760` target refused BACK DIRECT; after registering BACK DIRECT `2100×3840`, READY -> SEND -> APPLIED. This is supporting target-resolution/binding safety evidence.
- The V1 visible-quality contract requires visible RGB and partial-alpha fidelity, semi-transparent/feathered edges, alpha=0 remaining visually transparent, and no meaningful halo/fringe in practical Previz. BACK V3 had practical user visual PASS. Exact hidden RGB under alpha=0 is **NOT GUARANTEED / DIAGNOSTIC ONLY / NON-BLOCKING / DEFERRED**, by explicit user product acceptance; high-end mastering/compositing remains a Fusion/After Effects/Nuke responsibility.

## Compatibility matrix

| Source | Block 9A state | Notes |
|---|---|---|
| FILE PNG/JPG/JPEG | SUPPORTED | Available while Photoshop is disconnected |
| Photoshop Composite Snapshot | SUPPORTED / USER PASS | Visual round-trip and non-destructive capture confirmed |
| One Pixel Layer Selection Snapshot | SUPPORTED / USER PASS — V1 SCOPE | Exactly one ordinary Pixel Layer, RGB8/sRGB-oriented; BACK V3 practical visual and 62% opacity property PASS; sparse order-2-first REAL HOST PASS |
| Pixel Layer + Photoshop Layer Mask | NOT YET FORMALLY SUPPORTED | Future real-host probe; not a 9A closure blocker |
| Smart Object | UNSUPPORTED / FUTURE PROBE | Outside ordinary Pixel Layer V1 contract |
| Group | UNSUPPORTED / LOW PRIORITY | Outside ordinary Pixel Layer V1 contract |
| Arbitrary multi-selection | UNSUPPORTED / FUTURE | Multi-select Flatten Snapshot needs separate scope |
| Adjustment Layer alone | UNSUPPORTED | Not an ordinary Pixel Layer |
| RGB 16/32-bit | UNSUPPORTED / DEFERRED | No automatic Photoshop document conversion |

## Preserved boundaries

- luux-mockup/ and _TestSource/ remain untouched read-only references.
- Block 8E Vector Mask and Block 8F compositing/projection runtimes are not forked.
- BAKE CURRENT and SEND DIRECT remain selected-layer actions.
- There is no SEND FULL MERGED route or Photoshop full-merged preview.
- Block 9B is **Photoshop Snapshot Workflow / Preview Separation**, to be defined by its own directive. Planar Mapping Bake is **FUTURE / MANDATORY**, not Block 9B. Future bitmap-mask layers, Green Key, Feather tooling, and final planar composition are not part of Block 9A.

## Primary implementation files

- desktop-app/src/bitmap-source.js
- desktop-app/src/png-codec.js
- desktop-app/src/screen-image-authoring.js
- desktop-app/src/project-persistence.js
- desktop-app/src/live-link-broker.cjs
- desktop-app/src/renderer.js
- photoshop-uxp/luux-live-link/index.js
- desktop-app/tests/block-9a-validation.mjs

## Next

**Block 9B — Photoshop Snapshot Workflow / Preview Separation.** Its details require a separate Block 9B directive. Preserve the scoped BACK V3 evidence: individual-layer BAKE CURRENT/SEND DIRECT -> Photoshop recomposition was user visual PASS outside intended clipping, with a separate BAKE FULL MERGED Direct PNG comparison. It is not SEND FULL MERGED or pixel-perfect numerical equality. Mixed FILE/Composite/Selection Save -> disconnect -> restart -> Open and non-destructive capture were user PASS. Source Link, Refresh, Reconcile, Photoshop Layer Mask, Smart Object, and multi-select Flatten remain future requirements in [BACK V3 Round-trip PASS & Sync Roadmap](BACK-V3-ROUNDTRIP-PASS-AND-PHOTOSHOP-SYNC-ROADMAP.md), not unfinished Block 9A gates. Planar Mapping Bake remains future/mandatory.

**Post-handoff status (2026-09-14):** The preceding probe/deferred rows and Next paragraph describe the Block 9A handoff date, not the current plan. [Block 9B-C1](BLOCK-9B-C1-PROBE.md) later closed Photoshop user Layer Mask visible-result Snapshot as **UNSUPPORTED / NON-BLOCKING**, with no further implementation planned; Smart Object and multi-select Flatten remain separate conditional future candidates. [9B-A](BLOCK-9B-A-HANDOFF.md), [9B-B](BLOCK-9B-B-HANDOFF.md), and [PLANAR-B](PLANAR-B-HANDOFF.md) later closed. Block 9A itself stays **CLOSED / USER VALIDATED**. The next separate work is Production UI Phase A per [post-completion correction](POST-COMPLETION-DOCUMENT-CORRECTION-VALIDATION.md).
