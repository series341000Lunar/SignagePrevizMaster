# Desktop App — Block 4B Checkpoint

Block 0 proves that a 4728 x 5760-class source can remain full resolution from
disk decode through a Three.js GPU texture in both development and a Windows
x64 portable executable.

Block 1 adds the Photoshop Full-Resolution live texture source. Block 2 adds a
canonical reverse point link, persistent Previz target feedback, and separate
NAVIGATE/POINT interaction modes.

Block 3A adds a separate Perspective 3D plane view using bundled OrbitControls.
The 2D and 3D materials share the same master Full-Resolution texture. The 3D
plane maps raycast intersections through surface-local coordinates rather than
display UVs.

Block 3C adds `SITE 3D` with two tracked assets: the canonical
`Previz_3Dworld_BasicMapping.glb` for orbitable 3D World and the byte-identical
`Merged_Full_Format_v2.glb` for Legacy 2D World. Their ordinary planar
`TEXCOORD_0` intersections map to the existing top-left canonical pointer
contract. World, mapping mode, and Legacy scene selection are data-driven
through `site-scene-profile.js`.

```text
3D WORLD / NORMAL:      LUUX_Front_3Dworld_Basic + ILMIN_Back_3Dworld_Basic
3D WORLD / ANAMORPHIC:  LUUX_Front_3Dworld_Anamorphic + ILMIN_Back_3Dworld_Anamorphic (reserved / NONE)
LEGACY 2D WORLD:        Front / Front_Sweet / Back / Night
```

The 3D World asset contains only the two contracted BasicMapping nodes, and both
are visible and raycastable in NORMAL mode. When a selected surface set does not
exist, all site meshes remain hidden and Orbit/POINT/raycast are disabled
instead of producing a partial or stale hit.

Legacy 2D World opens each of `Front`, `Front_Sweet`, `Back`, and `Night` with
its camera locked. `CAMERA LOCKED` can be toggled to `CAMERA UNLOCKED` to enable
Orbit/Pan/Dolly. Entering Legacy 2D World or changing its scene restores the
lock; POINT remains available while the camera is locked.

Block 4A adds the data-only `site-calibration-profile.js` foundation. It records
four independent Legacy Photo Reference Cameras, the four byte-identical
8256×5504 photo sources, exact Legacy mapping meshes, immutable reset baselines,
and the inherited camera lock policy. PhotoScene runtime, camera editing,
Max-like conversion, Environment, and Location UI remain deferred.

Block 4B adds a Camera Editor for the four Legacy scenes. `THREE DIRECT` edits
the canonical Three.js world Position, Euler XYZ degrees, and vertical FOV.
`3DS MAX-LIKE` accepts world Position, Target, and an explicit vertical or
horizontal FOV basis, then applies the candidate basis adapter only at the
Camera input boundary. Locked cameras remain read-only; Reset View is safe
while locked, while Apply and Reset to Legacy require an explicit unlock.

## Commands

```powershell
npm install
npm run dev
npm run test:static
npm run test:protocol
npm run test:block4a
npm run test:block4b
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
