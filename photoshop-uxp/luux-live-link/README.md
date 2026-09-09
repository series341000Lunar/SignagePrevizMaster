# LUUX Live Link — Block 1A

This manifest-v5 Photoshop UXP panel captures the active 8-bit RGB document
composite at its exact pixel dimensions and sends uncompressed RGB/RGBA bytes
to the Electron broker at `ws://localhost:34100`.

The Manifest v5 allow-list uses the portless, slash-terminated WebSocket origin
`ws://localhost/`; the runtime endpoint remains pinned to port `34100` and the
Electron broker remains bound only to `127.0.0.1`.

Block 1A intentionally implements only the manual `SEND FULL RES` path. Auto
Sync remains visibly disabled until the required manual live test has passed.

The capture uses `imaging.getPixels({ documentID })`, then
`PhotoshopImageData.getData({ chunky: true })`. The `PhotoshopImageData` object
is disposed in a `finally` block. A 16-bit or 32-bit document is rejected
without changing the Photoshop document.
