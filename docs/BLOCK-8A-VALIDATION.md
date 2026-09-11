# LUUX Signage Previz — Block 8A Validation

Date: 2026-09-12
Directive SHA-256: `2225FF0600411FC4443FBF94E3656905D00895611365B3C39DF0D4A754DB829F`

## Current state

- Implementation: `IMPLEMENTED`
- Automated technical validation: `PASS`
- User visual validation: `PASS / CLOSED`
- Layout Edit camera interlock validation: `PASS / CLOSED`
- Block 8A gate: `CLOSED`

Automated evidence and user acceptance remain recorded separately. The user
completed the real FRONT75 and BACK authoring/Photoshop workflow and explicitly
approved both the visual result and the Layout Edit camera interlock on
2026-09-12.

## Implemented contract

- One replaceable FILE source is supported: PNG, JPG, or JPEG. The session keeps
  filename, original decoded width/height, byte length, and embedded PNG alpha
  presence. No clipboard, Photoshop snapshot, live layer source, or project
  persistence was added.
- The Production Bake owns a `THREE.Texture` created directly from the decoded
  original `HTMLImageElement`. The working-resolution canvas is diagnostics and
  export preview only; it is not the shader's Production Source.
- One `SCREEN_PROJECTED` image layer stores X/Y, uniform scale, and rotation in
  `PROJECTION_FRAME_NORMALIZED_TOP_LEFT` coordinates. Its center is the pivot.
  CSS pixels are calculated only for display.
- Move, corner uniform scale, rotation handle, numeric transform fields, and
  Reset Transform are available only in `LAYOUT EDIT`.
- Every transform or explicit family rebind invalidates Direct, Canonical, and
  Reprojected outputs as `DIRTY / NEEDS BAKE`. Full 4728×5760 Bake and Photoshop
  transfer never run during pointer drag.
- `LAYOUT EDIT` records the inspection camera and manual lock, applies the
  family-approved Projection Camera, and force-disables the real
  `OrbitControls`. Unlock is refused until Layout Edit exits. Exit restores the
  previous camera and previous manual lock state.
- Image pointer handling uses pointer capture, pointer ownership,
  `preventDefault()`, and `stopPropagation()`. Pointer up, pointer cancel, and
  window blur all release drag state.
- FRONT75 and BACK use the same Authoring and ProjectionBakeRuntime path with
  their existing approved cameras, family surfaces, Direct resolutions, and
  canonical 4728×5760 resolution.
- `ANAM_BAKE_MATTE_INNER` remains depth-only, lazy, offscreen Bake-only, absent
  from ordinary SITE 3D, and disposed after Bake. The flat Planar Mask remains a
  separate optional control and defaults OFF.
- Existing Block 7 Multi Bake Target resolution, wrong-target refusal, and
  transport code are reused without a second Photoshop sender.
- Blend is `NORMAL`; source alpha is preserved. Layer Stack, opacity, blend
  modes, save/load, snapshots, crop, skew, and warp remain out of scope.

## Automated evidence

`npm run test:block8a` verifies:

- PNG/JPG/JPEG acceptance and unsupported format refusal.
- RGBA PNG and palette `tRNS` alpha detection.
- original source identity and dimensions.
- normalized transform, center pivot, Move/Scale/Rotate/Reset, family rebind,
  and dirty/ready revision state.
- equivalent transform meaning at 800×1024 and 1600×2048 viewports.
- manual lock and Layout Interlock state machine.
- pointer ownership and pointerup/pointercancel/blur-equivalent release paths.
- direct original bitmap texture sampling and straight alpha shader wiring.

The Electron runtime smoke verifies actual `OrbitControls.enabled` behavior:

- Layout OFF + Unlock → Orbit enabled.
- Layout OFF + Lock → Orbit disabled.
- Layout ON → forced lock; Unlock request refused.
- Move, Scale, and Rotate do not mutate the captured calibration camera.
- Layout exit restores both unlocked and locked pre-entry cases.
- FRONT75 and BACK both apply their approved Projection Camera.
- Context loss: `0`.

The strengthened runtime Bake uses the decoded original
`AnamorphicTest_rocket_Original_0379f_.png` at 4728×5760 directly for both
families:

| Family | Direct | Canonical | MAE | RMSE | Silhouette IoU |
|---|---:|---:|---:|---:|---:|
| FRONT75 | 3000×3840 | 4728×5760 | 0.657445 | 2.934588 | 0.999556 |
| BACK | 2100×3840 | 4728×5760 | 1.044187 | 4.574467 | 0.999409 |

The Block 8A-only edge tolerance accounts for the second linear sampling of a
rotated alpha boundary: MAE ≤ 1.25, RMSE ≤ 5, IoU ≥ 0.999, and reproject-only
pixels ≤ 4096. Historical Block 6 thresholds are unchanged.

## User validation evidence

The user completed the following workflow with real external images:

1. Select `SITE 3D` → `3D WORLD` → `ANAMORPHIC` → `FRONT 75F`.
2. Use `+ IMAGE`, enter `LAYOUT EDIT`, and confirm the state reads
   `LAYOUT INTERLOCK`.
3. Move, scale, and rotate the image; confirm the camera does not orbit, pan,
   dolly, or change FOV.
4. Exit Layout Edit; confirm the previous inspection camera and manual lock
   state return.
5. Run `BAKE CANONICAL`, confirm `READY`, then send to the registered FRONT75
   Canonical 4728×5760 RGB8 Photoshop Target.
6. Repeat with BACK and its approved camera/registered Canonical Target.
7. Confirm orientation, alpha, position, scale, rotation, and wrong-target
   refusal.

Observed result:

- FRONT75 external-image placement and Photoshop output: `PASS`
- BACK external-image placement and Photoshop output: `PASS`
- Move/Scale/Rotate authoring behavior: `PASS`
- Layout Edit camera interlock structure: `PASS`
- User disposition: `대성공`

USER VALIDATION: **PASS / CLOSED**
