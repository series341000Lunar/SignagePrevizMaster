# LUUX Signage Previz — Block 7 Handoff

Date: 2026-09-11
Baseline HEAD: `1e31500`
Directive SHA-256: `081AD9E22EA74CC6688E6ECA33C579ECD32AC7A150E3B53DBCE1FAF42D1D0C4D`

## Scope delivered

Block 7 implements manual full-image reverse transport from the existing
ProjectionBakeRuntime outputs to an explicitly selected Photoshop Bake Target.
It preserves the established Photoshop-to-Previz Source flow, Pointer flow, and
all Block 0–6B behavior.

The shared transport supports:

- `CANONICAL`: authoritative 4728×5760 RGBA8 output.
- `DIRECT`: family-native alternate (`3000×3840` FRONT 75F,
  `2100×3840` BACK).
- Raw binary protocol-v1 chunks, without base64 or temporary image files.
- Separate received and Photoshop-applied completion states.
- Strict target identity/format/dimension validation and failure-safe staging.
- Session-owned output replacement without touching user artwork.

OPTIONAL BAKE MASK is user-toggleable per family and defaults OFF. OFF uses the
full-white scalar control and preserves the full authored Surface. The supplied
flat mask is now defined as a post-bake planar compositing reference, not as
authoritative bake-time Surface visibility. The existing ON path remains for
legacy/diagnostic use and retains exact linear BACK `1.0 - mask`. A future
authoritative bake-time mask would need the same calibrated 3D camera
projection and signage-shaped silhouette. Historical Block 6A/6B records are
not rewritten retroactively.

## Files of interest

- `desktop-app/src/projection-bake-runtime.js`: GPU readback and BACK inverse.
- `desktop-app/src/live-link-broker.cjs`: job state machine and binary routing.
- `desktop-app/src/renderer.js`: output controls, chunk sender, apply gating.
- `photoshop-uxp/luux-live-link/index.js`: target pinning, validation, staging
  Pixel Layer apply, ownership, restore, and Auto Sync suppression.
- `desktop-app/tests/block-7-validation.mjs`: protocol and safety regression.
- `docs/BLOCK-7-VALIDATION.md`: remaining real-Photoshop and user visual gates.

## Explicitly deferred

- Block 8 layer-stack/group authoring.
- Any automatic Bake Target selection.
- Any resize, mode conversion, depth conversion, flatten, or deletion of user
  artwork.
- Automatic user-visual PASS.

## Final automated regression

- `npm run test:block7`: `PASS` — canonical byte/chunk contract, ordered
  transport, apply-state separation, error recovery, ownership, and shared BACK
  mask inversion.
- Mask-OFF GPU smoke: `PASS` — FRONT/BACK full-Surface output, BACK profile
  camera/surface selection, and zero context loss.
- `npm run test:static`: `PASS`.
- `npm run test:protocol`: `PASS` — protocol Blocks 0–7.
- `npm test`: `PASS` after the user closed the application and released the
  broker port; `BLOCK0_TECHNICAL_PASS=true`.
- `npm run test:link`: `PASS` — Photoshop Live Link and Pointer synthetic
  SITE path; `BLOCK3C_SYNTHETIC_SITE_PASS=true`.
- `git diff --check`: `PASS` (line-ending conversion notices only).
- Protected reference directories `luux-mockup/` and `_TestSource/`: unchanged.

## Current acceptance state

- Automated technical validation: `PASS`.
- Photoshop integration validation: `PASS — USER CONFIRMED`.
- User visual validation: `PASS — USER CONFIRMED` for BACK Direct 2100×3840
  and FRONT 75F Direct 3000×3840 against 3ds Max World Normal overlays.
- Precision Difference View: omitted by explicit user decision because the
  calibration was already inspected and accepted.
- Normal bake-mask state: `OFF`; optional ON behavior retained.
- Block 7: `CLOSED`.

## NEXT THREAD ENTRY SNAPSHOT

Block 7 is closed. The next implementation block has not been started.
