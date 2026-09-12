# Block 8F Handoff

Status: **CLOSED — USER VALIDATED**

## Delivered

- Quick Action Rail order: `BAKE CURRENT`, `BAKE FULL MERGED`, `SEND DIRECT`.
- Current-family Full Merge for visible authoring layers, bottom-to-top.
- Straight-alpha compositing for NORMAL, MULTIPLY, SCREEN, and LINEAR_DODGE.
- Family-native Direct and 4728 x 5760 Canonical merged targets, previews, and PNG exports.
- Family-specific merged dirty/ready state.
- Reusable shared per-layer projection scratch plus ping-pong merged accumulator; no per-layer permanent full-resolution outputs.
- Existing Vector Mask control moved to a bottom-center canvas floating panel with collapse, header drag, viewport clamp, resize clamp, and interaction isolation.

## Preserved boundaries

- Block 8E Vector Mask data/raster contract is unchanged.
- BAKE CURRENT remains selected-layer only.
- SEND DIRECT remains selected-layer only; Full Merge has no Photoshop send route.
- Outside Signage is not baked.
- Floating panel geometry is not stored in project schema v2.
- No Photoshop mutation occurs without the existing explicit Send actions.

## Validation closeout

Automated checks exercise the formula, order, hidden/all-hidden behavior, opacity-once rule, family dirty isolation, project reload invalidation, source-byte preservation, DOM placement, action ordering, and resource policy.

On 2026-09-12 the user validated a three-layer Full Merge containing opaque, transparent, and opaque-with-Vector-Mask content through merged PNG export, confirmed the floating Mask panel works, accepted the Block 8F baseline, and authorized Git closeout and push.

## Known issue / deferred

- The floating Vector Mask panel is functionally correct but currently too large for ideal canvas readability.
- Panel size and information-density refinement are deferred to a later UI correction; the Block 8E mask engine and Block 8F Full Merge contract remain closed.
