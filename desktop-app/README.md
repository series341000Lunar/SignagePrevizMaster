# Desktop App — Block 0

Block 0 proves that a 4728 x 5760-class source can remain full resolution from
disk decode through a Three.js GPU texture in both development and a Windows
x64 portable executable.

## Commands

```powershell
npm install
npm run dev
npm run test:static
npm run test:runtime
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

After the technical tests pass, open the portable executable and compare
Original PNG with Small PNG at 1:1, 200%, and 400%. Inspect fine text, one-pixel
edges, and small details in both Normal and Pixel Inspection modes.

