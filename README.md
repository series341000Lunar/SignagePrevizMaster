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
