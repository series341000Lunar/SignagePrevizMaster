# LUUX Signage Previz — Block 8C Handoff

Date: 2026-09-12
Baseline HEAD: `4a502dfbf81e5684e54ef9b1404dead791bb27fd`

Status: **CLOSED / USER PHOTOSHOP VALIDATED**

## BLOCK 8C STATUS

Branch: `main`

Delivery: Block 8C implementation, tests, validation, and handoff are included
in the Block 8C closeout commit. The three pre-existing user-owned Mask PNG
files remain excluded and untouched.

Layer opacity: independent per authoring layer

Range: `0.0 .. 1.0`

Default: `1.0`

Blend modes: `NORMAL`, `MULTIPLY`, `SCREEN`, `LINEAR_DODGE`

Photoshop mapping: `BlendMode.NORMAL`, `MULTIPLY`, `SCREEN`,
`LINEARDODGE`; opacity is converted to Photoshop's 0–100 Layer percentage

Pixel semantics: source RGB/alpha + projection + Bake visibility

Metadata semantics: opacity + blend + visibility + relative order

Pixel dirty: Source Replace, Move, Scale, Rotate, Reset

Metadata dirty: Opacity, Blend, Visibility, Reorder

Photoshop owned-layer registry: UXP-authoritative, session-scoped
`OwnedLayerRegistry`

Ownership key:
`targetId + familyId + outputKind + authoringLayerId`

First Send: creates one Previz-owned Pixel Layer and records its exact Photoshop
layer ID

Re-Bake / Re-Send: replaces pixels on that exact owned layer only

Order sync: top-row/frontmost order among already-owned layers in the same
target/family/output binding

Visibility sync: Photoshop Layer metadata on explicit Send

Opacity sync: Photoshop Layer metadata on explicit Send; never duplicated into
pixel alpha

Blend sync: exact supported UXP enum on explicit Send

Unsent layers: no empty Photoshop layers are created

Deleted Previz layers: no automatic Photoshop deletion or name-based prune

User artwork: no name-based matching or mutation

DnD reorder: pointer-based current-family reorder

Drag handle: dedicated `⠿` button

Insertion indicator: before/after row marker

MOVE UP/DOWN compatibility: retained; both inputs call the same reorder function

Cross-family behavior: blocked by independent active-family stacks

Floating Quick Action Rail: canvas-right positioned overlay

Visibility condition: SITE 3D + ANAMORPHIC + Projection Authoring available

Default state: collapsed

Expand direction: inward / left

BAKE CURRENT: existing selected-layer Bake path

SEND DIRECT: existing Block 7 DIRECT transport and Target Registry safety path

BAKE FULL MERGED: intentionally not implemented; deferred until Block 8D plus
Layer Vector Mask readiness

FRONT75: independent stack and Photoshop ownership binding

BACK: independent stack and Photoshop ownership binding

Outside Preview regression: PASS; remains view-only and multiplicative

Layout Interlock regression: PASS

Projection Camera invariance: PASS

Visibility Matte regression: PASS; dedicated depth-only, Bake-only lifecycle is
unchanged

Multi Target / Block 7 transport regression: PASS

Resource stability: one shared `ProjectionBakeRuntime`; no per-layer canonical
RenderTarget allocation

Context loss: `0`

Automated tests: PASS for Block 7, Block 8C, static, full protocol, Electron
runtime, Live Link runtime, and the integrated `npm test` gate

Accepted BACK Preview issue: preserved as `KNOWN ISSUE / USER ACCEPTED /
NON-BLOCKING`

Known issue: a source file with a Japanese or other non-ASCII filename can open
in Previz but fail `SEND DIRECT` to Photoshop. The project enforces an ASCII
filename policy (Latin letters, digits, and safe separators); Korean, Japanese,
and other non-ASCII characters are not supported. This is recorded as
`KNOWN ISSUE / USER ACCEPTED / NON-BLOCKING`; Block 8C does not add filename
translation or validation.

USER VALIDATION: **PASS — 2026-09-12**

The user confirmed the real Photoshop UXP round trip works correctly. Supplied
evidence covers local PNG alpha/opacity, FRONT75 opacity synchronization, stable
same-layer re-send, FRONT75 multi-layer accumulation, and BACK multi-layer
accumulation. Photoshop contains independent Pixel Layers with the requested
Layer opacity instead of an empty group.

## Main implementation files

- `desktop-app/src/screen-image-authoring.js`
- `desktop-app/src/authoring-view-settings.js`
- `desktop-app/src/renderer.js`
- `desktop-app/src/projection-bake-runtime.js`
- `desktop-app/src/index.html`
- `desktop-app/src/styles.css`
- `desktop-app/src/live-link-broker.cjs`
- `desktop-app/src/main.cjs`
- `photoshop-uxp/luux-live-link/owned-layer-registry.js`
- `photoshop-uxp/luux-live-link/index.js`
- `desktop-app/tests/block-8c-validation.mjs`
- `desktop-app/tests/block-7-validation.mjs`
- `desktop-app/tests/static-validation.mjs`
- `desktop-app/package.json`
- `desktop-app/package-lock.json`

Detailed evidence and the user workflow are in
[Block 8C Validation](BLOCK-8C-VALIDATION.md).

## Explicitly excluded

- BAKE FULL MERGED / flattened stack output;
- Project Save / Load;
- Layer Vector or bitmap masks;
- Photoshop selection/composite snapshots;
- Authoring Layer groups/folders, rename, or duplicate;
- cross-family drag;
- drawing, text, and camera animation.

Block 8C is `CLOSED` after explicit user PASS of the real Photoshop multi-layer
workflow on 2026-09-12.
