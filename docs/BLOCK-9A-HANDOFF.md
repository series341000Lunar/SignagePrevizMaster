# Block 9A Handoff

Status: **IMPLEMENTED / AUTOMATED TECHNICAL PASS / BACK V3 VISUAL + 62% OPACITY USER PASS / FORMAL EDGE PROBES OPEN**

Block 9A is not CLOSED. The final gate remains a real Photoshop/UXP probe followed by user validation.

## Delivered

- FROM FILE..., FROM PHOTOSHOP COMPOSITE, and FROM PHOTOSHOP SELECTION enter the same existing authoring Layer Stack.
- Default `Scale 1.00` is native pixel 1:1 against each active working canvas: FRONT 75F `3000×3840`, BACK `2100×3840`. The Scale control is directly below `LAYOUT EDIT`.
- Photoshop Snapshot is an explicit, immutable capture. It does not auto-refresh when the Photoshop document changes.
- Snapshot transport is separate from Live frame and Bake transport: SNAPSHOT_REQUEST -> SNAPSHOT_BEGIN -> SNAPSHOT_CHUNK + binary -> SNAPSHOT_END -> SNAPSHOT_COMPLETE -> SNAPSHOT_COMMITTED.
- The broker allows one inbound large transfer at a time across Live and Snapshot, retains Bake as the reverse path, rejects reused job IDs, and cleans up on timeout/disconnect/role replacement.
- UXP captures with imaging.getPixels() inside executeAsModal(), without resize, flatten, save, mode conversion, or artwork mutation.
- Composite captures the active RGB8 document. Selection rechecks exactly one active constants.LayerKind.NORMAL Pixel Layer and its opacity before and after capture.
- Pyramid levels other than 0, non-native returned bounds, unsupported component layouts, non-RGB documents, and non-8-bit documents are refused.
- Renderer converts raw RGB8/RGBA8 to a project-owned lossless PNG without resampling. Exact dimensions, bounds, SHA-256, alpha/color contracts, and provenance are retained.
- Acknowledgement occurs only after PNG creation, hash, decode/runtime creation, ordinary Layer installation, and context revalidation succeed.
- Selection Snapshot initializes its transform center from Photoshop captureBounds in the active 1:1 working canvas and initializes opacity from the selected Photoshop Pixel Layer. The same layer opacity is sent back as Photoshop output metadata.
- Snapshot layers reuse transform, opacity, blend, visibility, Vector Mask, BAKE CURRENT, and BAKE FULL MERGED.
- Project schema is 3; readers accept 1 / 2 / 3. Old manifests migrate only in memory and emit schema 3 on the next Save.
- Mixed FILE/Composite/Selection stacks save and reopen offline. Photoshop IDs are provenance only and never output authority.

## Compatibility matrix

| Source | Block 9A state | Notes |
|---|---|---|
| FILE PNG/JPG/JPEG | SUPPORTED | Available while Photoshop is disconnected |
| Photoshop Composite Snapshot | USER PASS | 2026-09-13 visual round-trip and non-destructive confirmation |
| One Pixel Layer Selection Snapshot | BACK V3 VISUAL + 62% OPACITY USER PASS; FORMAL PROBES OPEN | Initial probe exposed centered overlap and 62% -> 100% opacity loss; later order-2-first Send exposed a full-order vs partial-Photoshop-order mismatch. Corrections are automated-tested. On 2026-09-13 the user reported no meaningful visible difference outside intended clipping after returning individual BACK layers to Photoshop and recompositing, and separately confirmed the 62% opacity property value. Order-2-first ACK and alpha edges are not thereby proven. |
| Masked Pixel Layer | NOT TESTED / NOT FORMALLY SUPPORTED | Requires separate real probe evidence |
| Group | UNSUPPORTED | Refused by one-Pixel-Layer contract |
| Smart Object | UNSUPPORTED | Refused by one-Pixel-Layer contract |
| Arbitrary multi-layer selection | UNSUPPORTED | Exactly one Pixel Layer required |
| 16-bit / 32-bit document | UNSUPPORTED | Refused without Photoshop mutation |

## Preserved boundaries

- luux-mockup/ and _TestSource/ remain untouched read-only references.
- Block 8E Vector Mask and Block 8F compositing/projection runtimes are not forked.
- BAKE CURRENT and SEND DIRECT remain selected-layer actions.
- There is no SEND FULL MERGED route or Photoshop full-merged preview.
- Block 9B planar mapping, bitmap-mask layers, Green Key, Feather, and final planar composition are not included.

## Primary implementation files

- desktop-app/src/bitmap-source.js
- desktop-app/src/png-codec.js
- desktop-app/src/screen-image-authoring.js
- desktop-app/src/project-persistence.js
- desktop-app/src/live-link-broker.cjs
- desktop-app/src/renderer.js
- photoshop-uxp/luux-live-link/index.js
- desktop-app/tests/block-9a-validation.mjs

## Next gate

Preserve the BACK V3 user visual PASS and the separately confirmed 62% opacity property PASS recorded in [BACK V3 Round-trip PASS & Sync Roadmap](BACK-V3-ROUNDTRIP-PASS-AND-PHOTOSHOP-SYNC-ROADMAP.md). Complete the remaining real-host checks in [Block 9A Validation](BLOCK-9A-VALIDATION.md): record distinct imported positions without moving them, order-2-first ACK, and the deliberate transparent-RGB edge probe. Do not declare Block 9A CLOSED from these scoped user confirmations alone.
