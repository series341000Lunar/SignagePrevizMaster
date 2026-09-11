# LUUX Signage Previz — Block 8A Handoff

Date: 2026-09-12
Baseline HEAD: `409585b1b639b8e77992ccd16a5e32e2a2cbe017`

Status: **CLOSED / AUTOMATED TECHNICAL PASS / USER VISUAL VALIDATION PASS**

## BLOCK 8A STATUS

Branch: `main`

Working tree: Block 8A implementation, validation, and handoff are modified;
three pre-existing user-owned untracked Mask PNG files remain excluded.

Image source: single replaceable external FILE source

Supported formats: PNG, JPG, JPEG

Original dimensions: retained from decoded bitmap; no production resize or
JPEG re-encode

Alpha: embedded PNG alpha retained as straight alpha

Authoring coordinate space: `PROJECTION_FRAME_NORMALIZED_TOP_LEFT`

Projection-frame behavior: screen-projected single layer; display CSS pixels
are derived and never persisted

Viewport resize invariance: automated normalized-coordinate test PASS

Transform: center-pivot X/Y, uniform scale, rotation

Move: PASS

Scale: PASS

Rotate: PASS

Reset: PASS

Camera mode: approved family Projection Camera while Layout Edit is active

Manual lock: FREE/LOCKED user choice outside Layout Edit

Layout interlock: forced actual controls lock; manual Unlock refused

Orbit during edit: blocked

Pan during edit: blocked

Dolly during edit: blocked

Previous lock restore: PASS for both prior unlocked and prior locked states

Projection camera mutation: none; captured camera remains unchanged across
Move/Scale/Rotate

FRONT: approved `ANAMORPHIC_FRONT_75F`, Direct 3000×3840, Canonical 4728×5760

BACK: approved `ANAMORPHIC_BACK`, Direct 2100×3840, Canonical 4728×5760

Preview: immediate DOM screen-space image overlay in the contained Projection
Frame; no full Canonical readback during drag

Dirty state: transform/source/family change invalidates all outputs as
`DIRTY / NEEDS BAKE`

Canonical Bake: existing ProjectionBakeRuntime, authoritative 4728×5760

Direct path: existing family-native alternate from the same Source/Transform

Visibility Matte regression: PASS; `ANAM_BAKE_MATTE_INNER` contract preserved

Multi Bake Target regression: PASS; existing `familyId:outputKind` binding and
wrong-target refusal preserved

Photoshop authoring/transport result: `PASS — FRONT75 AND BACK USER WORKFLOW`

Automated tests: PASS

Repeated runs: original bitmap FRONT75/BACK GPU Bake plus existing repeated
Projection Bake suite PASS

Context loss: `0`

Resource stability: PASS; family-switch resources disposed and no separate
Authoring engine introduced

User visual result: FRONT75 `PASS`, BACK `PASS`

Layout Edit camera interlock: `PASS`

User acceptance date: `2026-09-12`

USER VALIDATION: **PASS / CLOSED**

## Main implementation files

- `desktop-app/src/screen-image-authoring.js`
- `desktop-app/src/projection-bake-runtime.js`
- `desktop-app/src/renderer.js`
- `desktop-app/src/index.html`
- `desktop-app/src/styles.css`
- `desktop-app/src/main.cjs`
- `desktop-app/tests/block-8a-validation.mjs`
- `desktop-app/tests/static-validation.mjs`

Validation details and the user acceptance procedure are in
[Block 8A Validation](BLOCK-8A-VALIDATION.md).

Block 8A is explicitly accepted and closed. Block 8B Layer Stack work may begin
only under its own directive and scope.
