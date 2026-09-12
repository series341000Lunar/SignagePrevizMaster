# LUUX Signage Previz — Block 8C Validation

Date: 2026-09-12
Directive SHA-256: `A8259BE01CA0CDEB36D9AFEF75BCB27FAAE57614FCF95D310CA1B78BAEF40F90`

## Current state

- Implementation: `IMPLEMENTED`
- Automated technical validation: `PASS`
- User visual / Photoshop validation: `PASS — 2026-09-12`
- Block 8C gate: `CLOSED`

Automated evidence and user acceptance remain separate. Block 8C is closed on
the user's explicit PASS of the real Photoshop UXP multi-layer workflow.

## Implemented contract

- Every authoring layer now owns independent `opacity` (0.0–1.0, default 1.0)
  and `blendMode` metadata. Supported modes are `NORMAL`, `MULTIPLY`,
  `SCREEN`, and `LINEAR_DODGE`.
- Authoring Preview renders visible layers bottom-to-top. Layer opacity is
  applied once at composite time. Outside Signage alpha remains view-owned and
  is multiplied after source alpha and layer opacity.
- Pixel and metadata invalidation are separated. Source replace and transform
  changes invalidate the selected layer's Projection pixels. Opacity, blend,
  visibility, and order retain valid pixels and mark only composite metadata
  dirty.
- Explicit Send carries the selected layer pixels plus the current binding
  stack metadata. Opacity is not baked into pixel alpha.
- The session-scoped UXP `OwnedLayerRegistry` uses
  `targetId + familyId + outputKind + authoringLayerId` as its authoritative
  key and records the exact Photoshop `layerId`.
- First Send creates one Previz-owned Photoshop Pixel Layer inside a
  binding-specific Previz-owned group. Re-Send resolves the exact recorded
  Photoshop layer ID and replaces only that layer's pixels.
- Explicit Send also synchronizes order, opacity, blend, and visibility for
  already-owned layers in the same target/family/output binding. It does not
  create empty layers for unsent authoring layers and does not search by
  filename or display name.
- User artwork is never selected by name or reordered. Relative synchronization
  is confined to already-owned layers in the binding group.
- A separate pointer-based drag handle and visible insertion indicator were
  added. DnD and MOVE UP/DOWN call the same `reorderAuthoringLayer` operation;
  layer identity and all non-order state remain unchanged.
- FRONT75 and BACK stacks remain isolated. Cross-family drag is not available.
- The right-edge Quick Action Rail is a DOM overlay. It is visible only in
  SITE 3D + ANAMORPHIC authoring context, starts collapsed, expands inward, and
  supports toggle and Escape closing.
- `BAKE CURRENT` calls the existing selected-layer
  `ProjectionBakeRuntime`. `SEND DIRECT` calls the existing Block 7 binary
  transport and retains exact family target dimensions and mismatch refusal.
- `BAKE FULL MERGED` is not implemented.
- The accepted BACK ordinary-preview occlusion issue remains
  `KNOWN ISSUE / USER ACCEPTED / NON-BLOCKING`; Bake-only matte behavior is
  unchanged.
- A Japanese or other non-ASCII source filename can open in Previz but fail
  `SEND DIRECT`. The project enforces an ASCII filename policy (Latin letters,
  digits, and safe separators); Korean, Japanese, and other non-ASCII
  characters are unsupported. Per user direction this remains
  `KNOWN ISSUE / USER ACCEPTED / NON-BLOCKING`, with no Block 8C filename
  translation or validation added.

Photoshop mappings use the UXP enums `BlendMode.NORMAL`,
`BlendMode.MULTIPLY`, `BlendMode.SCREEN`, and
`BlendMode.LINEARDODGE`. Photoshop Layer opacity is set as a 0–100 percentage
and visibility/order are Layer metadata.

## Automated evidence

The following commands passed on 2026-09-12:

- `node --check src/main.cjs`
- `node --check src/renderer.js`
- `node --check ../photoshop-uxp/luux-live-link/index.js`
- `node --check ../photoshop-uxp/luux-live-link/owned-layer-registry.js`
- `npm run test:block7`
- `npm run test:block8c`
- `npm run test:static`
- `npm run test:protocol`
- `npm run test:runtime`
- `npm run test:link`
- `npm test`

`test:block8c` verifies:

- opacity range/default and source-alpha multiplication;
- independent blend state;
- metadata-only changes retain baked pixel revision and raw-byte fixture;
- transform changes require a new pixel Bake;
- stable layer IDs, three-layer registry accumulation, and exact-ID re-send;
- UXP opacity/blend/visibility/order mapping;
- broker validation of bounded per-layer composite metadata;
- DnD/button common reorder semantics and family isolation;
- Quick Rail wiring, existing Bake/Send paths, and absence of Full Merged.

The Electron runtime report at
`desktop-app/.runtime/dev-runtime.json` records:

- overall technical pass: `true`
- layer opacity independent: `true`
- blend mode independent: `true`
- pixel-ready preserved by metadata: `true`
- hidden layer pixel revision preserved: `true`
- DnD/button result equal: `true`
- stable IDs and family isolation: `true`
- Rail collapsed / expanded / collapsed: `true / true / true`
- Rail hidden outside ANAMORPHIC: `true`
- existing Bake path available: `true`
- Send disabled without a ready exact target/result: `true`
- Layout interlock forced lock: `true`
- Projection Camera unchanged: `true`
- Photoshop mutation during smoke: `0`
- one shared ProjectionBakeRuntime: `1`
- WebGL context loss: `0`

The Live Link report at `desktop-app/.runtime/link-runtime.json` also passed.
Automated UXP registry/source checks do not replace a real Photoshop DOM and
visual round trip.

## Actual Photoshop UXP evidence

The user supplied explicit PASS and screenshots from the real Photoshop UXP
round trip on 2026-09-12:

- FRONT75 one-layer `NORMAL` output reached Photoshop as an independent Pixel
  Layer with the requested 62% Layer opacity.
- The corresponding ACK reports normalized opacity `0.6196078431372549`, the
  expected Photoshop 8-bit quantization of 62%, and retains the exact
  `authoringLayerId` / `photoshopLayerId` distinction.
- Re-sending the same FRONT75 authoring layer reused Photoshop layer ID `10`.
- A second FRONT75 authoring layer accumulated as Photoshop layer ID `11` with
  order `1`; both independent Pixel Layers remained present.
- BACK accumulated two independent Pixel Layers (Photoshop IDs `7` and `8`) in
  its separate binding.
- The saved 3000 x 3840 RGBA PNG has alpha minimum `0`, maximum `158`, no fully
  opaque pixels, and retained transparent pixels. This verifies that local PNG
  export applies the selected 62% opacity while preserving source transparency.
- No `INVALID_BAKE_APPLY_ACK` remained in the successful validated sends, and
  Photoshop no longer retained an empty group without the Pixel Layer.

## User validation procedure — completed

1. In FRONT75 add three layers and place/scale them differently.
2. Set opacity to approximately 100%, 50%, and 25%.
3. Exercise Normal, Multiply, Screen, and Linear Dodge (Add).
4. Reorder with DnD, then verify MOVE UP/DOWN produces the same ordering.
5. Confirm the Quick Rail starts as a small collapsed button, expands inward,
   and BAKE CURRENT / SEND DIRECT operate on the selected visible layer.
6. Bake and Send A, B, and C to one registered FRONT75 DIRECT target.
7. Confirm Photoshop contains three independent Previz-owned Pixel Layers.
8. Modify only B, Bake and Send B, and confirm A/C pixels are unchanged.
9. After an explicit Send, confirm Photoshop order, 0–100 opacity, blend, and
   visibility match the Previz stack.
10. Repeat briefly with two BACK layers and confirm FRONT75 remains unchanged.
11. During Layout Edit, use opacity, blend, DnD, and the Rail and confirm the
    camera does not move.
12. Confirm same-named user artwork remains unchanged.

USER VALIDATION: **PASS — 2026-09-12**

The user's final assessment was that the workflow operates correctly, with the
non-ASCII filename limitation accepted only as the Known Issue documented
above.
