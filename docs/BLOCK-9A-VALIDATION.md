# Block 9A Validation

Status: **CLOSED / IMPLEMENTED / AUTOMATED TECHNICAL PASS / REAL PHOTOSHOP USER VALIDATED** (2026-09-13)

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

The Block 8A authoring regression additionally proves native default placement for both family working canvases: `3000×3840 -> 3000×3840` for FRONT 75F and `2100×3840 -> 2100×3840` for BACK at `Scale 1.00`. It also checks that the Scale field appears directly below `LAYOUT EDIT`. This is automated placement evidence, not a claim of independent per-family forensic position logs.

Automated tests alone do not prove a Photoshop host round-trip. The user confirmed Composite Snapshot round-trip and non-destructive capture, the corrected one-Pixel-Layer Selection Snapshot in the BACK V3 practical workflow, and mixed FILE/Composite/Selection Save -> disconnect -> restart -> Open. The BACK V3 return was **individual-layer Bake/Send followed by Photoshop recomposition**, with no meaningful visible difference outside intended clipping; a Full Merged Direct PNG was compared separately. This is a scoped user visual PASS, not pixel-perfect numerical equality or SEND FULL MERGED evidence. The 62% Photoshop Layer opacity **property** was separately user-confirmed; Layer opacity is distinct from baked pixel alpha, preserving the Block 8C metadata/pixel contract.

Selection position reconstruction is **ACCEPTED / AUTOMATED PASS / PRACTICAL USER WORKFLOW PASS**. The initial centered overlap of trimmed selections was corrected by mapping `captureBounds -> active Family working canvas -> initial Layer transform center`. The BACK V3 workflow supports practical position/composition acceptance; no independent forensic position log is claimed. The V1 Selection scope is exactly one ordinary Pixel Layer in an RGB 8-bit, sRGB-oriented document. Photoshop Layer Masks, Smart Objects, Groups, arbitrary multi-selection, and RGB 16/32-bit are outside that supported scope.

The user set the V1 alpha product acceptance contract: visible RGB fidelity, partial alpha fidelity, semi-transparent and feathered edges, alpha=0 remaining visually transparent, and no meaningful halo/fringe in practical Previz. BACK V3 supplied practical user visual PASS for semi-transparent/feathered content. Exact hidden RGB preservation beneath alpha=0 (`RGB != 0, A = 0`) is **NOT GUARANTEED / DIAGNOSTIC ONLY / NON-BLOCKING / DEFERRED**. The automated PNG round-trip test of hidden RGB remains valid but is not a real Photoshop host guarantee. This is an explicit product acceptance decision, not an ignored failure: hidden RGB may not survive the graphics pipeline and does not contribute to the visible result; high-end/sub-pixel compositing belongs in Fusion, After Effects, or Nuke.

In a separate real-host BACK test with three SMG layers (top order 0, middle order 1, bottom order 2) and no Previz-owned Pixel Layer in the Photoshop output binding, the user selected order 2, ran BAKE CURRENT, then the **first SEND DIRECT**. BACK DIRECT `2100×3840` was READY; Photoshop reported **APPLY COMPLETE, Job 1, Photoshop Layer 11**, and UXP Full-Image Write **APPLIED**. Only the sent layer was created, with no placeholders for unsent orders 0/1. Thus **SPARSE ORDER-2-FIRST SEND -> REAL HOST PASS**: global authoring order 2 can be the first Photoshop-owned subset layer without order mismatch. This is host Apply evidence, not a raw ACK field-by-field forensic dump. During the same test a mistaken Canonical `4728×5760` target refused BACK DIRECT; correcting the target to BACK DIRECT `2100×3840` gave READY -> SEND -> APPLIED, supporting the intended target-resolution/binding refusal behavior.

## Real Photoshop / UXP probe checklist (historical and future diagnostics)

Composite Snapshot, non-destructive capture, and the ordinary single Pixel Layer V1 workflow are user PASS. The following steps preserve the original probe plan and identify optional diagnostic or future coverage; they are not open Block 9A closure gates.

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
6. Inspect opaque pixels, semi-transparent/feathered edges, and fully transparent pixels under the V1 visible-quality contract. Deliberately nonzero RGB beneath alpha zero is an optional, non-blocking diagnostic, not a bit-exact guarantee.
7. Confirm top-left orientation, sRGB-oriented RGB8 color, and no meaningful fringe/color corruption in practical Previz.
8. Confirm selected identity and opacity are rechecked and Photoshop history/layers remain unchanged.

Selection Snapshot is **SUPPORTED / USER PASS — V1 SCOPE**. The 62% property and practical visible-edge behavior passed user validation; raw ACK field-for-field logging, hidden RGB and straight/premultiplied internals remain diagnostic/future coverage. Do not infer those internals from the API name.

### C. Mixed-stack reuse and offline project

1. Build a stack containing FILE, Composite Snapshot, and Selection Snapshot.
2. Exercise reorder, visibility, opacity, all four blend modes, Layout transforms, and Vector Mask.
3. Run BAKE CURRENT for each type and BAKE FULL MERGED for the mixed stack.
4. Save, disconnect Photoshop, restart, and reopen project.json.
5. Confirm stable types, dimensions, hashes, provenance, transforms, masks, and order.
6. Confirm provenance IDs do not retarget Photoshop output.

### D. Failure and cleanup

1. Try no document, non-RGB, and 16/32-bit documents; confirm refusal without mutation.
2. Try zero/multiple layers, Group, Smart Object, Adjustment Layer alone, and other non-Pixel kinds; confirm refusal. **Historical plan:** Pixel Layer + Photoshop Layer Mask and multi-select Flatten needed separate probes. **Later update:** only the user Layer Mask case completed in [Block 9B-C1](BLOCK-9B-C1-PROBE.md) and is CLOSED / UNSUPPORTED / NON-BLOCKING; multi-select Flatten remains conditional future scope.
3. Disconnect during transfer; confirm no partial Layer or asset survives.
4. Trigger rapid duplicate requests; confirm one job wins and reused IDs are rejected.
5. Switch family or project before completion; confirm late completion is rejected and rolled back.
6. Confirm failure preserves existing layers, project state, Live, Bake targets, and Photoshop artwork.

## Probe record

| Probe | State | Evidence |
|---|---|---|
| FILE PNG/JPG/JPEG | SUPPORTED | Available without Photoshop |
| Real Photoshop Composite Snapshot | SUPPORTED / USER PASS | 2026-09-13: Photoshop -> SMG mask edit/bake -> Photoshop showed no meaningful visible round-trip difference |
| One ordinary Pixel Layer Selection Snapshot | SUPPORTED / USER PASS — V1 SCOPE | RGB 8-bit, sRGB-oriented; initial centered-overlap correction and BACK V3 practical layer-by-layer return/recomposition accepted outside intentional clipping |
| Selection position reconstruction | ACCEPTED / AUTOMATED PASS / PRACTICAL USER WORKFLOW PASS | `captureBounds -> active Family working canvas -> initial Layer transform center`; no independent forensic position log claimed |
| Selection 62% Layer opacity property | USER PASS | 2026-09-13 user confirmation after correction; Layer opacity is not baked pixel alpha and no raw ACK field dump is claimed |
| Sparse order-2-first Send | REAL HOST PASS | BACK three-layer stack, empty Photoshop owned binding: order 2 first BAKE CURRENT/SEND DIRECT -> BACK DIRECT 2100×3840 READY -> Photoshop APPLY COMPLETE Job 1, Layer 11; UXP Full-Image Write APPLIED; no order 0/1 placeholders |
| Target-resolution mismatch refusal | REAL HOST SUPPORTING EVIDENCE | Wrong Canonical 4728×5760 target refused BACK DIRECT; corrected BACK DIRECT 2100×3840 target reached READY -> SEND -> APPLIED |
| Visible RGB / partial alpha / semi-transparent and feathered edges | USER PASS — PRACTICAL PREVIZ | BACK V3 user judged no meaningful visible difference outside intended clipping, including practical semi-transparent/feathered imagery; no pixel-perfect numerical claim |
| Hidden RGB beneath alpha=0 | NOT GUARANTEED / NON-BLOCKING / DEFERRED | Diagnostic only; exact `RGB != 0, A = 0` preservation is not the V1 Photoshop host contract |
| Non-destructive Photoshop capture | USER PASS | 2026-09-13 user confirmation |
| Mixed FILE/Composite/Selection Save/Open/offline | USER PASS | Save -> Photoshop disconnect -> restart -> Open Project, user confirmation |
| Pixel Layer + Photoshop user Layer Mask | CLOSED / UNSUPPORTED / NON-BLOCKING (Block 9B-C1) | [Real-host probe](BLOCK-9B-C1-PROBE.md): internal masked hole remained opaque, 20 px Feather had no partial alpha; 62% Layer opacity stayed separate. Apply/merge the mask on a preserved Photoshop duplicate into an ordinary Pixel Layer before `FROM PHOTOSHOP SELECTION`. No further implementation planned; Block 9A stays CLOSED / USER VALIDATED. |
| Smart Object | UNSUPPORTED / FUTURE PROBE | One-Pixel-Layer V1 contract |
| Group | UNSUPPORTED / LOW PRIORITY | One-Pixel-Layer V1 contract; future only |
| Arbitrary multi-selection | UNSUPPORTED / FUTURE | Multi-select Flatten Snapshot requires separate scope |
| Adjustment Layer alone | UNSUPPORTED | Not an ordinary Pixel Layer |
| RGB 16/32-bit | UNSUPPORTED / DEFERRED | RGB8/sRGB-oriented V1; no automatic Photoshop document conversion |
| User visual validation | BACK V3 SCOPED PASS | Individual-layer BACK return and Photoshop recomposition, excluding intentional clipping; separately compared Full Merged Direct PNG. Not SEND FULL MERGED or pixel-perfect numerical equality. |

## Documentation authority

The master design is [Post-Block-8F Snapshot Audit & Block 9 Master Design](POST-BLOCK-8F-SNAPSHOT-AUDIT-AND-BLOCK9-DESIGN-V1.md). This file records implementation evidence and does not redefine that design.

The later scoped user decision, supplied V3 evidence, operational sync rules, and unimplemented source-refresh/reconciliation requirements are in [BACK V3 Round-trip PASS & Sync Roadmap](BACK-V3-ROUNDTRIP-PASS-AND-PHOTOSHOP-SYNC-ROADMAP.md).
