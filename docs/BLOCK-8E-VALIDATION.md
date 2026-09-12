# Block 8E Validation

Date: 2026-09-12
Status: PASS / CLOSED
Block state: CLOSED

## Scope

Block 8E adds a persistent, layer-local, multi-path vector mask to the existing authoring layer and connects that mask to the authoring Preview and existing `BAKE CURRENT` path. It does not implement `BAKE FULL MERGED`, bitmap masks, Green Key, feathering, drawing layers, or Photoshop vector paths.

## Contract

- Coordinate system: `SOURCE_NORMALIZED_TOP_LEFT`.
- Only enabled, closed paths with at least three points contribute pixels.
- An open path is visible in the editor but contributes no mask alpha.
- `ADD` draws white inclusion; `SUBTRACT` removes from the accumulated mask.
- Whole-mask invert is applied after all path composition.
- Disabled mask, empty enabled mask, or a mask without a valid closed `ADD` path is solid-white pass-through.
- Preview alpha is `sourceAlpha × vectorMask × layerOpacity × outsideSignagePreviewFactor`.
- Bake alpha is `sourceAlpha × vectorMask × projectionVisibility × productionMask`.
- Layer opacity remains Photoshop layer metadata and is not multiplied into baked pixel alpha.

## Editor interaction

- Returning to the first anchor closes an open path.
- Dragging empty overlay space marquee-selects anchors from open or closed paths; selected anchors and their handles move together.
- A single click on empty space never creates a new path after the current path is closed.
- A new path begins only through double-click on empty source space or the explicit `+ NEW PATH` button. The button is the deterministic fallback when host double-click timing is inconvenient.
- Selecting `LAYOUT EDIT` while Mask Edit is active exits Mask Edit and immediately enters Layout Edit.
- Selecting `EDIT MASK` while Layout Edit is active exits Layout Edit and immediately enters Mask Edit.
- Both editor modes retain the camera interlock and restore the prior inspection camera when editing ends.

## Raster and resource validation

The Preview and Bake paths share the same path tracer and cubic contract: `P0`, `P0.outHandle`, `P1.inHandle`, `P1`.

The integrated Electron smoke validated actual Canvas alpha samples:

| Sample | Normal | Inverted |
| --- | ---: | ---: |
| Outside ADD | 0 | 255 |
| Inside ADD | 255 | 0 |
| SUBTRACT hole | 0 | 255 |
| Re-added island | 255 | 0 |

The same smoke validated:

- Preview scratch contains both transparent and opaque pixels.
- No-mask Bake uses pass-through and allocates no vector-mask texture.
- Masked FRONT75 Bake reduces valid canonical pixels from `7,265,994` to `1,557,637`.
- FRONT75 and BACK both execute the existing Bake path with their independent masks.
- Bake mask dimensions equal the selected source bitmap dimensions.
- The temporary mask texture is disposed after each Bake.
- Permanent full-resolution per-layer mask texture count remains zero.
- One shared `ProjectionBakeRuntime` remains in use.
- Context loss count remains zero.
- No Photoshop mutation occurs during automated tests.

## Persistence and dirty-state validation

- Project schema v2 round-trips mask, path, point, handle, segment, operation, enabled, closed, and invert state exactly.
- v1 projects load with a deterministic disabled/empty vector mask.
- Invalid/non-finite coordinates are transactionally rejected without replacing the active session.
- Point, handle, segment, path, enable, invert, and operation edits invalidate pixels and require Bake.
- Opacity remains metadata-only; the runtime smoke verifies `0.45` changes metadata revision without changing pixel revision.
- Original source bytes remain unchanged.
- Replace Source preserves the layer-local vector mask.
- FRONT75 and BACK mask identities remain independent.

## Automated evidence

- `npm run test:block8e`: PASS
- `npm run test:static`: PASS
- `npm run test:runtime`: PASS outside the restricted sandbox; `BLOCK0_TECHNICAL_PASS=true`
- `npm run test:link`: PASS; `BLOCK3C_SYNTHETIC_SITE_PASS=true`
- `npm test`: PASS, including build, static, protocol, Block 8A/Outside/8B/8C/8D/8E, visibility correction, multi-target, and integrated runtime coverage
- `git diff --check`: PASS
- Restricted-sandbox Electron launch: environment-only GPU process initialization failure; the identical test passed outside that sandbox.

## User validation

On 2026-09-12 the user supplied explicit `ALL PASS` approval and authorized the Git closeout through push. The accepted real-app and Photoshop scope covers:

1. Confirm an open path does not cut pixels.
2. Close it by returning to the first anchor and confirm Preview masking.
3. Verify LINEAR, CUBIC_BEZIER, handle movement, point insertion/deletion, marquee movement, ADD, SUBTRACT, island, invert, and mask enable/disable.
4. Save, restart, and load the project; confirm exact geometry restoration and `NEEDS BAKE / PHOTOSHOP UNSYNCED` state.
5. Run `BAKE CURRENT`, register the Photoshop target, and use `SEND DIRECT`.
6. Confirm masked pixel alpha in Photoshop.
7. Modify the mask, Bake and Send again, and confirm the same owned Photoshop pixel layer is updated.
8. Repeat a simple mask check for BACK.

Final user validation: `PASS_CLOSED`.
