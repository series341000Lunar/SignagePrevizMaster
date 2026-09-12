# LUUX Signage Previz — Block 8B Validation

Date: 2026-09-12
Directive SHA-256: `7385A1DE4E2590D037E275634150C30E31D1E9B7C053B56E8DA420A057BE1EC6`

## Current state

- Implementation: `IMPLEMENTED`
- Automated technical validation: `PASS`
- User visual validation: `PASS / CLOSED`
- Block 8B gate: `CLOSED`

Automated evidence and user acceptance are recorded separately. The user
completed the real FRONT75/BACK multi-layer workflow and explicitly approved
the family-isolation behavior on 2026-09-12.

## Implemented contract

- The previous single authoring image is generalized into a multi-image layer
  stack with `ADD`, `DELETE`, `SELECT`, `REORDER`, `VISIBILITY`, and
  `REPLACE SOURCE` operations.
- Every layer has a stable unique `layerId`, source record, normalized X/Y,
  uniform scale, rotation, visibility, order, family ownership, and
  `mappingMode: SCREEN_PROJECTED`.
- A new layer is inserted topmost and selected. The Layers UI lists the
  frontmost layer first; preview compositing renders visible layers from bottom
  to top with fixed opacity 1, `NORMAL` / `source-over`, and preserved source
  alpha.
- Only the selected visible layer owns Move, Scale, Rotate, Reset, and Bake.
  A hidden layer remains selected, but its handles are hidden and Bake is
  disabled/refused. An empty stack is a supported `NO IMAGE` state.
- `REPLACE SOURCE` changes only the selected layer bitmap. Its `layerId`,
  order, family, visibility, and transform are retained. A failed decode leaves
  the previous source intact.
- Deleting the selected layer disposes its object URL and deterministically
  selects the layer immediately below, then the layer above, or none.
  Replacing a source also disposes the superseded object URL.
- FRONT75 and BACK own independent stacks and independent selections. Family
  switching preserves both sets without converting or copying layers.
- Outside Signage opacity remains one shared family authoring-view setting. It
  applies to all visible layers for preview only and never marks layer content
  `DIRTY` or changes Production Bake pixels.
- Selected-layer Bake reuses the one existing `ProjectionBakeRuntime` and the
  existing family/output Photoshop Target resolution. No flattened-stack Bake,
  per-layer Photoshop Target, or second transport engine was introduced.
- The approved family Projection Camera, Layout Edit interlock, Bake-only
  `ANAM_BAKE_MATTE_INNER`, and Block 7 Photoshop transport contracts are
  unchanged.

## Automated evidence

`npm run test:block8b` verifies:

- five-layer creation, stable unique IDs, topmost insertion, top-first UI
  ordering, and bottom-to-top render ordering;
- three independent layer transforms;
- source replacement invariants and old-resource disposal;
- reorder, visibility, hidden-selection, deterministic delete selection, and
  empty-stack behavior;
- FRONT/BACK stack and selection isolation;
- four repeated cycles of ten-layer add/delete operations;
- selected-layer Bake status invalidation and one shared
  `ProjectionBakeRuntime`;
- required UI controls and renderer wiring.

The full protocol regression passes Blocks 4A through 8B. The Electron runtime
smoke additionally verifies:

- FRONT layer count: `5`
- BACK layer count: `2`
- three selected FRONT layer Production Bakes: `PASS`
- stable unique IDs: `true`
- family isolation: `true`
- hidden selected layer interlock: `true`
- repeated add/delete stability: `true`
- Outside Signage opacity does not dirty content: `true`
- approved camera unchanged: `true`
- Photoshop mutation count during smoke: `0`
- Photoshop last-applied state unchanged: `true`
- shared ProjectionBakeRuntime count: `1`
- WebGL context loss: `0`
- runtime `technicalPass`: `true`

## User visual validation evidence

The user completed multi-image authoring in the real application and confirmed:

1. Multiple layers can be added and retained in FRONT75.
2. BACK has its own independent layer stack.
3. Switching FRONT75/BACK does not mutate, remove, or move layers owned by the
   other family.
4. The selected-layer Photoshop behavior matches the Block 8B contract: one
   selected layer is baked to the currently registered family/output Target,
   replacing that Target's previous pixels. Photoshop per-layer accumulation
   and order synchronization remain deferred to Block 8C.

The previously accepted BACK ordinary-preview limitation remains a known issue:
geometry hidden by the building may still appear in the interactive preview,
while the Bake-only matte removes it from Production Bake output. Block 8B does
not expand that accepted correction scope.

USER VISUAL VALIDATION: **PASS / CLOSED**
