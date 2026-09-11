# LUUX Signage Previz — Post-Block-8A Outside Preview Handoff

Date: 2026-09-12
Baseline HEAD: `409585b1b639b8e77992ccd16a5e32e2a2cbe017`

Status: **CLOSED / AUTOMATED TECHNICAL PASS / USER VISUAL VALIDATION PASS**

## OUTSIDE SIGNAGE PREVIEW STATUS

Branch: `main`

HEAD: `409585b1b639b8e77992ccd16a5e32e2a2cbe017`

Working tree: Block 8A plus this post-Block-8A correction remain uncommitted;
three pre-existing user-owned untracked Mask PNG files remain excluded.

View setting: `AuthoringViewSettings.outsideSignageOpacity`

Default: `0.50`

Range: `0.00..1.00`, step `0.01`

Presets: `HIDE=0`, `50%=0.5`, `FULL=1`

Ownership: Authoring View visibility aid

Layer-owned: **NO**

View-owned: **YES**

Session persistence: maintained across source replacement, family change,
Reset Transform, and Layout Edit exit; not saved and reset on app restart

Coverage source: current family-approved Surface projected by the approved
Projection Camera into the visible Projection Frame

Family binding: existing profile `surfaceBinding.exactName`

Projection camera: existing approved FRONT75/BACK calibration record

Inside behavior: original source alpha and brightness

Outside behavior: original source alpha multiplied by the view setting

Boundary behavior: projected Surface silhouette is used at the current display
resolution; it is independent of image transform

Source alpha interaction: multiplicative; `1×0.5=0.5`, `0.5×0.5=0.25`,
`0×0.5=0`

Dirty state on slider change: unchanged; a completed bake remains `READY` at
the same revision

Bake invariance:

- Direct: byte-identical preview at Outside `0/0.5/1`
- Canonical: byte-identical preview at Outside `0/0.5/1`
- Reprojected: byte-identical preview at Outside `0/0.5/1`

FRONT75: automated coverage, alpha, output-isolation, and READY checks PASS

BACK: automated coverage refresh, output-isolation, and READY checks PASS

Layout Interlock regression: PASS; forced camera lock and event isolation remain
active while Layout Edit is on

Move/Scale/Rotate regression: PASS; original screen-space transform path and
pointer handles remain active

Visibility Matte regression: PASS; `ANAM_BAKE_MATTE_INNER` remains lazy,
offscreen, depth-only, and Bake-only

Multi Bake Target regression: PASS; no setting or metadata was added to the
existing `familyId:outputKind` target resolution

Automated tests: PASS — `test:outside-preview`, `test:block8a`,
`test:visibility-correction`, `test:multi-target`, `test:static`,
`test:protocol`, `test:runtime`, `test:link`, and aggregate `npm test`.
Electron runtime technical gate is true and WebGL context loss is `0`.

USER VALIDATION: **PASS / CLOSED — 2026-09-12**

## Accepted known issue

BACK Authoring Preview may show a part of the rear signage Surface that is
physically occluded by the building. This is expected from the current
screen-space Surface-only Coverage Guide: it intentionally does not consume the
building mesh or the Bake-only `ANAM_BAKE_MATTE_INNER` depth holdout.

The user confirmed that the Production Bake does not expose this area. The
existing depth visibility path remains authoritative for output, so the preview
difference is recorded as **KNOWN ISSUE / USER ACCEPTED / NON-BLOCKING**.

## Implementation map

- `desktop-app/src/authoring-view-settings.js`: normalized view setting,
  presets, and future Layer-opacity-compatible alpha multiplication.
- `desktop-app/src/index.html`: coverage canvases, three presets, slider, and
  value display.
- `desktop-app/src/styles.css`: overlay stacking and control presentation.
- `desktop-app/src/renderer.js`: projected Surface coverage cache, composite
  preview, event isolation, diagnostics, and runtime smoke.
- `desktop-app/tests/outside-preview-validation.mjs`: state, alpha, ownership,
  isolation, persistence, and UI contract checks.
- `desktop-app/src/main.cjs`: Electron smoke report and technical gate wiring.

## Scope boundary

Block 8B Layer Stack, actual Layer Opacity, blend modes, Save/Load, Photoshop
Snapshot, Planar Mask integration, visibility-matte changes, production mask
changes, and camera changes were not implemented.

This correction is closed. Block 8B may proceed under a separate directive.
