# LUUX Signage Previz

This repository contains the new LUUX Signage Previz application. The existing
`luux-mockup/` repository and `_TestSource/` source images are local reference
material and are intentionally excluded from this repository.

Block 0 validates full-resolution image upload to a Three.js GPU texture and a
self-contained Windows x64 portable Electron executable. See
[`desktop-app/README.md`](desktop-app/README.md) for commands and acceptance
details.

Block 1 adds a localhost-only Photoshop UXP Full-Resolution live link under
[`photoshop-uxp/luux-live-link`](photoshop-uxp/luux-live-link), including the
validated `historyStateChanged` Auto Sync path.

Block 2 adds the canonical reverse point link from the Electron viewer to a
reserved Photoshop Pixel Layer, document-staleness protection, latest-wins
pointer queuing, Previz point feedback, and POINT-mode middle-button pan. Block
2 passed development and portable Photoshop user validation. See
[`docs/BLOCK-2-HANDOFF.md`](docs/BLOCK-2-HANDOFF.md) for the design-stage handoff
and [`docs/BLOCK-2-POINTER-VALIDATION.md`](docs/BLOCK-2-POINTER-VALIDATION.md)
for the evidence record.

Block 3A adds a separate Perspective 3D plane prototype while preserving the
2D viewer. Both views share one Full-Resolution texture, and the 3D surface
implements the same canonical pointer contract. Its automated evidence and
manual checkpoint are in
[`docs/BLOCK-3A-PLANE-VALIDATION.md`](docs/BLOCK-3A-PLANE-VALIDATION.md).

Block 3B extracts the actual legacy GLB, selector, camera, and planar-UV
contracts without modifying the ignored reference implementation. Block 3C
adds a `SITE 3D` checkpoint with separate 3D World and Legacy assets. `NORMAL`
uses `LUUX_Front_3Dworld_Basic + ILMIN_Back_3Dworld_Basic` in 3D World; the
future `ANAMORPHIC` mode safely reports `NONE` until its reserved meshes are
supplied. See
[`docs/BLOCK-3B-LEGACY-SCENE-CONTRACT.md`](docs/BLOCK-3B-LEGACY-SCENE-CONTRACT.md)
and [`docs/BLOCK-3C-GLB-SURFACE-VALIDATION.md`](docs/BLOCK-3C-GLB-SURFACE-VALIDATION.md).

Block 4A extracts four independent Legacy Camera/PhotoScene contracts into an
app-owned calibration profile without adding Block 4B+ runtime features. It
preserves unresolved Max-like, Photo runtime, and Location values explicitly.
See [`docs/BLOCK-4A-VALIDATION.md`](docs/BLOCK-4A-VALIDATION.md) and
[`docs/BLOCK-4A-HANDOFF.md`](docs/BLOCK-4A-HANDOFF.md).

Block 4B exposes those four CameraRecords in a lock-gated Camera Editor. It
supports exact `THREE DIRECT` Position/Euler/FOV editing, explicit Reset View
and Reset to Legacy operations, and a candidate `3DS MAX-LIKE`
Position/Target/FOV adapter. The Max-like axis calibration remains a user gate.
See [`docs/BLOCK-4B-VALIDATION.md`](docs/BLOCK-4B-VALIDATION.md) and
[`docs/BLOCK-4B-HANDOFF.md`](docs/BLOCK-4B-HANDOFF.md).

Block 4C activates the four authoritative 8256×5504 photographs as independent
3:2 background passes for the Legacy scenes. The existing master signage
texture stays on the exact Legacy meshes, and Photo POINT uses the same
content viewport, mesh UV, canonical coordinate, and Photoshop protocol path.
See [`docs/BLOCK-4C-VALIDATION.md`](docs/BLOCK-4C-VALIDATION.md) and
[`docs/BLOCK-4C-HANDOFF.md`](docs/BLOCK-4C-HANDOFF.md).

Block 4D adds the mutable `SITE_ENVIRONMENT` asset to 3D World without changing
Functional Signage ownership. The corrected
`Previz_3Dworld_Background_v02.glb` contains 18 environment-only meshes, uses
direct project coordinates, and receives a neutral double-sided runtime
material with DAY/NIGHT presentation modes. Environment geometry participates
in visual depth but never becomes a master-texture or Canonical POINT target.
See [`docs/BLOCK-4D-VALIDATION.md`](docs/BLOCK-4D-VALIDATION.md) and
[`docs/BLOCK-4D-HANDOFF.md`](docs/BLOCK-4D-HANDOFF.md).

Block 4E adds four independent Site Location markers with build-generated
450×300 photo proxies, marker visibility control, Location-to-PhotoScene
navigation, and exact return to the pre-entry Site camera/orbit/environment
state. The four Location coordinates, thumbnail offsets, one-third card scale,
and semi-transparent presentation were user-validated on 2026-09-11. See
[`docs/BLOCK-4E-VALIDATION-HANDOFF.md`](docs/BLOCK-4E-VALIDATION-HANDOFF.md).

Block 4F makes `SITE 3D` the application startup view while preserving direct
access to the full-resolution `2D VIEW`. Development and Portable regression
now exercise SITE 3D startup, SITE 3D → 2D VIEW → SITE 3D switching, the full
Block 0–4E runtime, and the synthetic Photoshop Live/POINT path in the same
release candidate. Automated closeout and final user validation have passed.
The user completed the startup, 2D/SITE switching, Photoshop, POINT, and
Location return checkpoints on 2026-09-11, closing the Basic Core. See
[`docs/BLOCK-4F-VALIDATION.md`](docs/BLOCK-4F-VALIDATION.md) and
[`docs/BLOCK-4F-HANDOFF.md`](docs/BLOCK-4F-HANDOFF.md).

Block 5A adds the first independent Anamorphic family,
ANAMORPHIC_FRONT_75F, from the pinned
Previz_3DWorld_Anamorphic_Front75F_v01.glb revision. 3D WORLD /
ANAMORPHIC / FRONT 75F now selects only ANAM_SURFACE_FRONT75F and applies the
helper-derived calibration camera with the confirmed vertical FOV 19.778°.
FOV V supports session adjustment. Starting Orbit resets to the ordinary
FOV 45°/world-up surface-fit camera and releases the 3000×3840 canvas aspect
restriction; RETURN TO 75F CALIBRATION restores the calibrated camera and
working canvas. In calibration mode only, a `#20242c` exterior matte darkens
the area outside that working canvas; FREE_PREVIEW continues to use the full
viewer without the matte. Camera helpers remain hidden and never receive the
Photoshop texture or POINT ownership. 75F POINT remains deliberately deferred
until its canonical inverse mapping is proven. ILMIN and FRONT 90F remain NOT
AVAILABLE. The user validated corrected framing, roll, calibration
reset, unrestricted FREE_PREVIEW, and matte presentation on 2026-09-11. See
[Block 5A Validation](docs/BLOCK-5A-VALIDATION.md) and
[Block 5A Handoff](docs/BLOCK-5A-HANDOFF.md).

Block 5B adds the second independent family, `ANAMORPHIC_BACK`, from the pinned
BACK-only `Previz_3DWorld_Anamorphic_Back_v01.glb`. Its exact
`ANAM_SURFACE_BACK` surface is isolated from FRONT 75F, while its four CALCAM
helpers remain hidden, untextured, and excluded from POINT. The helper-derived
  camera uses corrected candidate vertical FOV `18.374°` and projection aspect
  `0.546875`, matching the `2100×3840` calibration frame. Automated extraction
  and runtime wiring are complete. The user approved the corrected BACK
  FOV/aspect/roll calibration on 2026-09-11, closing Block 5B. See
  [Block 5B Validation](docs/BLOCK-5B-VALIDATION.md)
and [Block 5B Handoff](docs/BLOCK-5B-HANDOFF.md).

Block 6A adds the FRONT 75F Native Canonical Bake PoC with a synthetic
3000×3840 RGBA source, unchanged authored `TEXCOORD_0`, a production
4728×5760 linear-scalar validity mask, projection-camera depth visibility, and
same-camera reprojection. SOURCE, CANONICAL BAKE, and REPROJECTED results can
be saved as native-resolution PNGs for external DCC inspection. Automated
round-trip validation passed, and the user approved the external difference
comparison on 2026-09-11; Block 6A is CLOSED. See
[Block 6A Validation](docs/BLOCK-6A-VALIDATION.md) and
[Block 6A Handoff](docs/BLOCK-6A-HANDOFF.md).

Block 6B generalizes the projection PoC into one shared FRONT 75F / LUUX BACK
core and adds an independent `DIRECT PROJECTED` output. The UI now compares
SOURCE, DIRECT PROJECTED, CANONICAL BAKE, and CANONICAL REPROJECTED and exports
all four at native family resolution. FRONT keeps its supplied production mask;
BACK explicitly reports `NOT_SUPPLIED` and uses full-white only as a diagnostic
fallback. The user accepted both variants for purpose-dependent use on 2026-09-11,
closing the Block 6B visual gate.
See [Block 6B Validation](docs/BLOCK-6B-VALIDATION.md) and
[Block 6B Handoff](docs/BLOCK-6B-HANDOFF.md).

Block 7 adds manual full-image reverse transport from ProjectionBakeRuntime to
an explicitly selected Photoshop Bake Target. Canonical remains the
authoritative 4728×5760 production path; Direct remains the sharper native-size
alternate. Both reuse protocol-v1 raw straight-RGBA binary chunks. Source and
Bake Target identities are separate, target mismatch is refused without resize
or conversion, and success is displayed only after Photoshop Pixel Layer apply
completes. Re-bake replaces only a session-confirmed Previz-owned layer after a
staging apply succeeds. The optional bake-time mask is user-toggleable per
family and defaults OFF so the full authored Surface is used. The supplied flat
mask is not a camera-projected anamorphic signage silhouette; its authoritative
role is a post-bake planar compositing reference for combining separately baked
FRONT and BACK images. The existing ON path remains available only as an
optional legacy/diagnostic operation, with BACK evaluating exact linear
`1.0 - mask`. The user confirmed matching placement for BACK Direct
2100×3840 and FRONT 75F Direct 3000×3840 against 3ds Max World Normal overlays
on 2026-09-11. See
[Block 7 Validation](docs/BLOCK-7-VALIDATION.md) and
[Block 7 Handoff](docs/BLOCK-7-HANDOFF.md).

The post-Block-7 Bake Visibility Correction replaces the former approximate
8-bit authored-UV self-visibility match with a true family Projection Camera
depth-texture comparison. User review found that Signage Surface self-depth
alone still exposed the opposite side inside the J shape for both FRONT75 and
BACK. The final shared path therefore lazy-loads the exact dedicated inner
Matte `ANAM_BAKE_MATTE_INNER` as a depth-only, colorless holdout during
Projection Bake only. It is never attached to ordinary SITE 3D and is disposed
after every bake. MASK OFF remains the default; calibrated cameras and signage
GLBs are preserved, and neither a normal threshold nor a planar Photoshop mask
is used as a 3D-visibility substitute. The user accepted minor residual edge
visibility for later planar-bake compensation and closed the correction as
PASS. See [Bake Visibility Correction](docs/BLOCK-7-BAKE-VISIBILITY-CORRECTION.md)
and [Dedicated Matte Handoff](docs/POST-BLOCK-7-DEDICATED-MATTE-HANDOFF.md).
