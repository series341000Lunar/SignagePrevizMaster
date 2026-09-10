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
