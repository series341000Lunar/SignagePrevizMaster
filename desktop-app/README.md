# Desktop App — Blocks 0–2

Block 0 proves that a 4728 x 5760-class source can remain full resolution from
disk decode through a Three.js GPU texture in both development and a Windows
x64 portable executable.

Block 1 adds the Photoshop Full-Resolution live texture source. Block 2 adds a
canonical reverse point link, persistent Previz target feedback, and separate
NAVIGATE/POINT interaction modes.

## Commands

```powershell
npm install
npm run dev
npm run test:static
npm run test:protocol
npm run test:runtime
npm run test:link
npm run dist
npm run test:portable
```

`npm run dev` builds local renderer assets and launches Electron. The automated
runtime commands use the same application with a smoke-test flag and write
ignored reports under `.runtime/`.

## Pixel pipeline

```text
Packaged source file
-> Chromium image decoder (HTMLImageElement at naturalWidth/naturalHeight)
-> THREE.Texture (no intermediate canvas or bitmap resize)
-> WebGL texture upload
-> PlaneGeometry measured in source-pixel world units
-> Orthographic camera (zoom 1.0 = one source pixel per CSS pixel)
```

FIT changes only the camera zoom. It never changes the decoded image or texture
dimensions. Pixel Inspection switches magnification from linear filtering to
nearest-neighbour filtering without modifying the source texture.

## Security and offline baseline

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- `webSecurity: true`
- no preload bridge
- local bundled JavaScript and test assets only
- HTTP(S) requests are blocked and recorded by the main process
- navigation and new windows are denied

## Manual visual validation

The Block 2 portable validation passed with Photoshop Live. In `POINT` mode,
left click sends a canonical point, middle-button drag pans, and the wheel
zooms. The Previz target is yellow while pending, green after Photoshop ACK,
and red after a rejected command. `CLEAR POINTER` removes the reserved helper.

The complete acceptance evidence and design-stage constraints are recorded in
[`../docs/BLOCK-2-POINTER-VALIDATION.md`](../docs/BLOCK-2-POINTER-VALIDATION.md)
and [`../docs/BLOCK-2-HANDOFF.md`](../docs/BLOCK-2-HANDOFF.md).
