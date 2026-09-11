# LUUX Signage Previz — Block 7 Validation

Date: 2026-09-11
Directive SHA-256: `081AD9E22EA74CC6688E6ECA33C579ECD32AC7A150E3B53DBCE1FAF42D1D0C4D`

## Final state

- Implementation: `IMPLEMENTED`
- Automated technical validation: `PASS`
- Photoshop integration validation: `PASS — USER CONFIRMED`
- User visual validation: `PASS — USER CONFIRMED`
- Block 7 gate: `CLOSED`

The user supplied the real Photoshop comparison result; it is recorded
separately from automated evidence.

## Implemented contract

- ProjectionBakeRuntime exposes full-frame Direct and Canonical straight
  `RGBA8`, top-left-origin buffers without resize or readback resampling.
- The Electron broker transports binary data in ordered 2 MiB chunks with an
  8 MiB high-water mark, 120-second timeout, 512 MiB maximum, one active job,
  and explicit receipt/apply acknowledgements.
- Photoshop Source Document and Bake Target are independent. The target is
  explicitly pinned by ID, name, dimensions, mode, and depth; closed, changed,
  wrong-size, or non-RGB8 targets are refused.
- UXP receives and validates the entire frame outside `executeAsModal()`. Only
  the Photoshop mutation is modal.
- Apply uses a staging Pixel Layer and full-frame `replace: true`. A previous
  output is replaced only when its exact layer ID is owned by the current UXP
  session. Failure preserves the previous confirmed output.
- Canonical and Direct use the same reverse-transport engine. Canonical is the
  authoritative 4728×5760 output; Direct preserves the family-native alternate.
- OPTIONAL BAKE MASK is independently toggleable for FRONT and BACK and
  defaults OFF. OFF uses an exact full-white scalar control so the full Surface
  remains visible. The retained ON path applies the verified flat reference and
  exact linear BACK `1.0 - mask` only as a legacy/diagnostic option.
- Auto Sync self-feedback is temporarily suppressed during apply and resumes
  afterward. The previously active Source Document is restored.
- No Block 8 authored layer-stack/group behavior is created.

## Automated evidence

`npm run test:block7` validates:

- Canonical byte count `108,933,120` and 52 chunks.
- Ordered binary delivery and distinct `BAKE_RECEIVED`, `BAKE_APPLYING`, and
  `BAKE_APPLIED` states.
- Duplicate job, invalid order, truncated transfer, wrong job ID, byte maximum,
  timeout recovery, and reconnect/retry refusal paths.
- Static target-safety, session-ownership, active-document restore, and Auto
  Sync suppression wiring.
- Shared FRONT/BACK mask identity and exact BACK linear inversion metadata.
- FRONT/BACK default-OFF UI wiring and output invalidation on mode changes.

## User correction investigation

The reported BACK strip was reproduced with Production Mask ON. BACK was already
using `ANAMORPHIC_BACK_PROFILE`, FOV `18.374`, and `ANAM_SURFACE_BACK`; it was not
using the FRONT 75F camera. The shared mask is predominantly white, so exact
`1.0 - mask` suppresses most BACK pixels.

The dedicated Mask-OFF GPU smoke passed with:

- FRONT canonical coverage: `56.864%`; Source/Direct MAE `0.000079`.
- BACK canonical coverage: `53.992%`; Source/Direct MAE `0.000068`.
- BACK family camera/surface match: `PASS`.
- WebGL context loss: `0`.

After the user closed the application, the clean-port full repository
regression passed with `BLOCK0_TECHNICAL_PASS=true`. The separate Photoshop
Live Link and Pointer regression also passed with
`BLOCK3C_SYNTHETIC_SITE_PASS=true`.

## User mask-definition correction

The user clarified that the supplied mask is a flat, non-anamorphic planar
image. It is required when separately baked FRONT and BACK images are combined
in the later flat-mapping/compositing stage; it is not authoritative bake-time
Surface visibility. A valid future bake-time mask would need to be produced in
3D through the same calibrated camera so that its silhouette matches the
signage in projected space.

Therefore the authoritative normal bake path is Mask OFF. The already
implemented Mask ON feature is not removed, but is classified as optional
legacy/diagnostic behavior. This user correction supersedes the operational
default implied by the original Block 7 mask clause without rewriting the
historical Block 6A/6B records.

## Photoshop and user visual validation result

On 2026-09-11 the user confirmed:

- BACK Direct on a 2100×3840 Photoshop canvas aligned with the 3ds Max World
  Normal render: position identical, `PASS`.
- FRONT 75F Direct on a 3000×3840 Photoshop canvas aligned with the 3ds Max
  World Normal render: position identical, `PASS`.
- A new precision Difference View was intentionally omitted because the same
  calibration had already been inspected and accepted.
- Normal bake-mask state: `OFF`.
