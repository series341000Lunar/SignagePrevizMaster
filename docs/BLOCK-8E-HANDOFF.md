# Block 8E Handoff

Date: 2026-09-12
Status: PASS / CLOSED
Block state: CLOSED

## Current repository position

- Branch: `main`
- Starting HEAD: `b2bd17b76dff8d1e01923028b52378d36ad1897c`
- Commit/push: explicitly authorized by the user for Block 8E closeout
- Existing uncommitted Block 8E work and user-owned files were preserved.

## Implementation map

- `desktop-app/src/vector-mask-model.js`
  - Persistent mask model, path/point identity, LINEAR/CUBIC_BEZIER segments, de Casteljau insertion, shared hard-edge tracing, ADD/SUBTRACT/invert raster composition.
- `desktop-app/src/screen-image-authoring.js`
  - Layer-local ownership, pixel-dirty mutation paths, family isolation, and snapshot restoration.
- `desktop-app/src/project-persistence.js`
  - Schema v2 mask persistence, exact validation, v1 empty-mask migration, original source-byte preservation.
- `desktop-app/src/renderer.js`
  - SVG editor, first-anchor close, marquee anchor selection/move, double-click or `+ NEW PATH` creation, single-click creation guard, direct Layout/Mask mode switching, shared Preview mask scratch, and Block 8E-2 runtime smoke.
- `desktop-app/src/projection-bake-runtime.js`
  - Original bitmap plus source-resolution temporary mask texture, shader alpha multiplication, and deterministic disposal.
- `desktop-app/tests/block-8e-foundation-validation.mjs`
  - Model, raster semantics, dirty state, source bytes, persistence, migration, family isolation, and static integration checks.
- `desktop-app/tests/static-validation.mjs`
  - Packaging and integration boundaries, including the prohibition on intermediate Canvas conversion in live-frame installation.

## Deliberate UX decisions

- Closed/current path plus empty single click: no mutation.
- New path: double-click empty source space or `+ NEW PATH`.
- Double-click is a convenience gesture; `+ NEW PATH` is the reliable explicit alternative.
- `LAYOUT EDIT` and `EDIT MASK` are mutually exclusive direct transitions, not a two-step off/on workflow.

## Preserved boundaries

- Vector mask changes pixels; opacity/blend/visibility/order retain their existing Photoshop metadata contract.
- Outside Signage opacity remains view-only/session-only and never enters Bake.
- Original source RGBA is sampled directly; source files are not rewritten with a baked mask.
- The dedicated `ANAM_BAKE_MATTE_INNER` remains Bake-only, depth-only, offscreen-only, lazy-loaded, and disposed after Bake.
- SEND DIRECT and Photoshop-owned layer replacement reuse the existing Block 8C path. No Photoshop vector path data is sent.
- `luux-mockup/`, `_TestSource/`, and user-provided mask/project assets were not modified.

## Closure evidence

Automated validation proved the renderer/editor/Preview/Bake contracts. On 2026-09-12 the user supplied explicit `ALL PASS` approval for the real workflow and authorized Git commit and push. User validation is recorded as `PASS_CLOSED`; Block 8E is CLOSED.

## Explicitly deferred

- Block 8F `BAKE FULL MERGED`
- Bitmap Mask
- Green Key
- Feather controls
- Drawing Layer
- Photoshop Vector Path creation
