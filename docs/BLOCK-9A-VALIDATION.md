# Block 9A Validation

Status: **IMPLEMENTED / AUTOMATED TECHNICAL PASS / BACK V3 VISUAL + 62% OPACITY USER PASS / FORMAL HOST EDGE PROBES OPEN**

## Automated evidence

Originally verified on 2026-09-12 against repository baseline 385cf098c51636122f5f8c9fc1baff7334c1b4aa; the Selection position/opacity correction was reverified on 2026-09-13.

| Command | Result |
|---|---|
| npm run build | PASS |
| npm run test:block8d | PASS; schema 3 |
| npm run test:block8e | PASS; schema 3 and v1 in-memory migration |
| npm run test:block8f | PASS |
| npm run test:block9a | PASS |
| npm run test:static | PASS |
| npm run test:protocol | PASS, including visibility correction and multi-target |
| npm run test:runtime | PASS outside the restricted sandbox; technicalPass true, contextLossCount 0, external network requests 0 |
| npm run test:link | PASS; synthetic Live/POINT/Bake regression |
| npm test | PASS |
| npm run dist | PASS; Windows x64 portable rebuilt |
| npm run test:portable | PASS; packaged runtime and synthetic link, no external network or context loss |
| git diff --check | PASS for tracked changes; new Block 9A code/docs also checked separately |

The first sandboxed runtime attempt failed because the Electron GPU process could not start. The same runtime smoke passed in the normal desktop environment. This is environment evidence, not a product failure.

test:block9a proves schema 1/2/3 compatibility, three persistent source types, exact RGBA PNG round-trip including RGB beneath alpha zero, native bounds validation, Selection document-position reconstruction, Selection opacity metadata preservation, mixed-source offline reconstruction, exact-once Snapshot transport, duplicate rejection, Live/Snapshot mutual exclusion, and reuse of existing Vector Mask/Bake/Full Merge runtimes.

The Block 8A authoring regression additionally proves native default placement for both family working canvases: `3000×3840 -> 3000×3840` for FRONT 75F and `2100×3840 -> 2100×3840` for BACK at `Scale 1.00`. It also checks that the Scale field appears directly below `LAYOUT EDIT`. This is automated evidence; visual confirmation of the revised default placement remains pending.

Automated tests do not prove the corrected Photoshop host round-trip. The user confirmed Composite round-trip and non-destructive behavior, and later granted BACK V3 visual PASS for individual-layer return and Photoshop recomposition outside intentional clipping. The user separately confirmed the 62% opacity property value as PASS. Distinct imported positions, sparse order-2-first ACK, and the RGBA transparent-edge contract still require their own recorded probes.

## Real Photoshop / UXP probe checklist

### A. Composite Snapshot

1. Open an RGB 8-bit document with opaque, semi-transparent, and fully transparent areas.
2. Record document/layer state, dimensions, mode/depth, and history.
3. Connect LUUX Live Link and choose FROM PHOTOSHOP COMPOSITE.
4. Confirm exactly one new authoring layer appears only after capture completes.
5. Confirm captured dimensions equal the document dimensions with no resize or crop.
6. Change Photoshop artwork and confirm the captured layer does not refresh.
7. Confirm document, layers, visibility, selection, and history remain unchanged.

### B. Single Pixel Layer Selection Snapshot

1. Select exactly one ordinary Pixel Layer (constants.LayerKind.NORMAL) with transparent bounds.
2. Choose FROM PHOTOSHOP SELECTION.
3. Confirm saved bounds and bitmap dimensions are identical at native level 0.
4. Without moving the imported SMG layer, confirm its center reconstructs the Photoshop `captureBounds` position in the active 1:1 working canvas.
5. Set the Photoshop Pixel Layer to 62% opacity; confirm SMG initially shows 62% and the returned Photoshop output layer is also 62%. **User-confirmed PASS on 2026-09-13; raw ACK trace is separate.**
6. Inspect opaque pixels, semi-transparent edges, fully transparent pixels, and deliberately nonzero RGB beneath alpha zero.
7. Confirm top-left orientation, sRGB RGB8 color, and no fringe/color corruption.
8. Confirm selected identity and opacity are rechecked and Photoshop history/layers remain unchanged.

Selection Snapshot remains **PROBE-GATED** until this section passes with recorded evidence. Do not infer straight/premultiplied alpha behavior from the API name.

### C. Mixed-stack reuse and offline project

1. Build a stack containing FILE, Composite Snapshot, and Selection Snapshot.
2. Exercise reorder, visibility, opacity, all four blend modes, Layout transforms, and Vector Mask.
3. Run BAKE CURRENT for each type and BAKE FULL MERGED for the mixed stack.
4. Save, disconnect Photoshop, restart, and reopen project.json.
5. Confirm stable types, dimensions, hashes, provenance, transforms, masks, and order.
6. Confirm provenance IDs do not retarget Photoshop output.

### D. Failure and cleanup

1. Try no document, non-RGB, and 16/32-bit documents; confirm refusal without mutation.
2. Try zero/multiple layers, Group, Smart Object, and other non-Pixel kinds; confirm refusal.
3. Disconnect during transfer; confirm no partial Layer or asset survives.
4. Trigger rapid duplicate requests; confirm one job wins and reused IDs are rejected.
5. Switch family or project before completion; confirm late completion is rejected and rolled back.
6. Confirm failure preserves existing layers, project state, Live, Bake targets, and Photoshop artwork.

## Probe record

| Probe | State | Evidence |
|---|---|---|
| Real Photoshop Composite | USER PASS | 2026-09-13: Photoshop -> SMG mask edit/bake -> Photoshop showed no visible round-trip difference |
| Real Photoshop single Pixel Layer | BACK V3 VISUAL + 62% OPACITY USER PASS; OTHER PROBES OPEN | 2026-09-13: two trimmed selections initially arrived centered/overlapped and 62% source opacity returned as 100%; capture/install corrections address both. A later order-2-first per-layer Send reached UXP but was rejected because physical Photoshop subset order 0 was compared with full authoring order 2; sparse relative-order correction is now automated-tested. User then confirmed no meaningful visible difference outside intended clipping after returning individual BACK layers and recompositing in Photoshop, and separately confirmed the 62% opacity property value. No order-2-first ACK log was supplied with V3. |
| Selection 62% opacity property | USER PASS | 2026-09-13: user explicitly confirmed the 62% opacity property value after the correction. This does not imply a raw ACK trace or transparent-edge pixel probe. |
| Alpha / transparent RGB semantics | PARTIAL USER PASS / FORMAL EDGE PROBE PENDING | Basic visual round-trip passed; deliberate transparent-RGB edge case not yet recorded |
| Non-destructive Photoshop capture | USER PASS | 2026-09-13 user confirmation |
| Mixed-stack Save/Open/offline | USER PASS | 2026-09-13 user confirmation (`ok`) |
| Masked Pixel Layer | NOT TESTED | Not formally supported |
| Group | UNSUPPORTED | One-Pixel-Layer contract |
| Smart Object | UNSUPPORTED | One-Pixel-Layer contract |
| User visual validation | BACK V3 SCOPED PASS | Individual-layer BACK return and Photoshop recomposition passed by user inspection, excluding intentional clipping; 62% opacity property separately passed. This is not SEND FULL MERGED or formal alpha/ACK PASS. Block 9A remains open. |

## Documentation authority

The master design is [Post-Block-8F Snapshot Audit & Block 9 Master Design](POST-BLOCK-8F-SNAPSHOT-AUDIT-AND-BLOCK9-DESIGN-V1.md). This file records implementation evidence and does not redefine that design.

The later scoped user decision, supplied V3 evidence, operational sync rules, and unimplemented source-refresh/reconciliation requirements are in [BACK V3 Round-trip PASS & Sync Roadmap](BACK-V3-ROUNDTRIP-PASS-AND-PHOTOSHOP-SYNC-ROADMAP.md).
