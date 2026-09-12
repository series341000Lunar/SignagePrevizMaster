# LUUX Signage Previz — Block 8B Handoff

Date: 2026-09-12
Baseline HEAD: `cbf7e2904aacd7021166c183646095b0328acd27`

Status: **CLOSED / AUTOMATED TECHNICAL PASS / USER VISUAL VALIDATION PASS**

## BLOCK 8B STATUS

Branch: `main`

Working tree: Block 8B implementation, tests, validation, and handoff are
modified. Three pre-existing user-owned untracked Mask PNG files remain
excluded and untouched.

Authoring model: independent multi-image layer stacks for
`ANAMORPHIC_FRONT_75F` and `ANAMORPHIC_BACK`

Layer identity: stable unique `layerId`; source identity is not used as layer
identity

Operations: ADD, DELETE, SELECT, MOVE UP, MOVE DOWN, VISIBILITY, REPLACE SOURCE

UI order: topmost/frontmost first

Preview render order: bottom to top

Blend: fixed `NORMAL` / `source-over`, opacity 1, source alpha preserved

Selected-layer edit: center-pivot X/Y, uniform scale, rotation, Reset Transform

Selected hidden behavior: remains selected; handles hidden; Bake disabled

Delete selection: below, then above, then none

Empty stack: supported `NO IMAGE`; Bake disabled

Replace Source: preserves layer ID/order/family/visibility/transform; decode
failure preserves the old source

Resource lifetime: object URLs disposed on delete, replace, and app teardown

Family isolation: FRONT75/BACK layers and selections preserved independently

Outside Signage opacity: one family authoring-view setting shared by all visible
layers; preview-only and never a content dirtying operation

Production Bake: selected visible layer only; no stack flattening

Bake runtime: one shared existing `ProjectionBakeRuntime`

Photoshop targets: existing family/output target binding; no per-layer target

Camera: approved family Projection Camera unchanged across layer operations

Layout interlock: existing Block 8A behavior preserved

Visibility matte: existing `ANAM_BAKE_MATTE_INNER` remains offscreen Bake-only

Automated tests: PASS

Full protocol regression: PASS

Electron runtime: PASS

Context loss: `0`

User visual validation: `PASS / CLOSED`

User-observed family isolation: FRONT75 and BACK retain separate layer stacks;
switching views leaves the inactive family's layers unchanged.

Selected-layer Photoshop behavior: accepted as the Block 8B contract. A send
replaces the currently registered family/output Target pixels; Photoshop
per-layer ownership and accumulation remain Block 8C scope.

## Main implementation files

- `desktop-app/src/screen-image-authoring.js`
- `desktop-app/src/renderer.js`
- `desktop-app/src/index.html`
- `desktop-app/src/styles.css`
- `desktop-app/src/main.cjs`
- `desktop-app/tests/block-8b-validation.mjs`
- `desktop-app/tests/static-validation.mjs`
- `desktop-app/package.json`
- `desktop-app/package-lock.json`

Validation details and the remaining visual procedure are in
[Block 8B Validation](BLOCK-8B-VALIDATION.md).

## Explicitly excluded from Block 8B

- layer opacity controls and blend-mode selection;
- rename, duplicate, group, crop, skew, warp, save/load, and snapshots;
- flattened multi-layer Bake;
- per-layer Photoshop Targets or a new transport path;
- new mask semantics or changes to the accepted BACK preview known issue.

The user explicitly supplied PASS on 2026-09-12. Block 8B is closed and ready
for the approved commit and origin/main push.
