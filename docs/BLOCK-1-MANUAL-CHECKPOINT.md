# Block 1A — Manual UXP checkpoint

> Live status (2026-09-09): installed Photoshop 2026 manual transfer and final
> sRGB visual comparison received USER PASS. See `BLOCK-1A-HANDOFF.md` for the
> complete implementation history and remaining Block 1B boundary.

## Scope

This checkpoint implements only the manual full-resolution path. Auto Sync and
Photoshop notification listeners are intentionally absent until manual transfer
passes in the installed Photoshop/UXP runtime.

## Implemented path

```text
Photoshop active document composite
→ imaging.getPixels({ documentID })
→ PhotoshopImageData.getData({ chunky: true })
→ Uint8Array RGB/RGBA
→ 2 MiB WebSocket binary chunks
→ Electron Main broker bound to 127.0.0.1:34100
→ renderer preallocated Uint8Array
→ THREE.DataTexture
→ existing full-resolution viewer
```

The plugin does not specify a layer, bounds, or resized output. Document,
capture, receiver, and texture dimensions are asserted for every frame. The
receiver verifies both declared and calculated byte counts before texture
creation. A non-8-bit or non-RGB document is rejected without modifying it.

Three.js r186 exposes `RGBFormat`, but its automatic WebGL2 internal-format
selection does not choose a sized format for unsigned-byte RGB and its sRGB
helper requires RGBA. To preserve the Photoshop RGB buffer without an 80 MiB
RGB-to-RGBA expansion, the live texture explicitly uses WebGL2 `RGB8` or
`SRGB8`. RGBA sources use Three.js `RGBAFormat` and the normal sRGB annotation.
The capture explicitly requests `RGB`, 8-bit, `sRGB IEC61966-2.1` output from
Photoshop's Imaging API. Photoshop therefore performs any required ICC
conversion without modifying the document. The original document profile and
the returned/requested capture profile are recorded separately. The renderer
then uses `SRGB8` GPU decode for RGB or Three.js's sRGB annotation for RGBA.

`PhotoshopImageData.dispose()` runs in `finally`. The sender uses one frame in
flight, 2 MiB chunks, `bufferedAmount` backpressure, a 120-second ACK timeout,
and a single dirty flag for latest-wins behavior. The renderer allocates one
final frame buffer and corrects vertical orientation in UVs rather than copying
and flipping the full pixel array.

## Security

- UXP endpoint: `ws://localhost:34100`
- Broker bind address: `127.0.0.1:34100`
- UXP manifest network allowlist: `ws://localhost/` only
- Electron remote HTTP/HTTPS/WS/WSS requests: blocked and counted
- Renderer sandbox baseline: unchanged

## Remaining acceptance beyond Block 1A

- Auto Sync implementation and live notification-event coverage
- 20–30 update stability run
- Portable EXE live connection

No Block 1 commit or push is permitted until the technical acceptance work is
complete.

`npm run test:link` provides a separate two-frame 4728 × 5760 RGB synthetic
transport test for the real Electron broker, renderer assembly, DataTexture
upload, replacement disposal, and ACK path. It is not a substitute for the
pending installed-Photoshop test.
