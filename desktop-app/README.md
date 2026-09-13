# Desktop App — Block 9A Photoshop Snapshot Authoring

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
3D WORLD / ANAMORPHIC:  FRONT 75F / ANAM_SURFACE_FRONT75F
                         BACK / ANAM_SURFACE_BACK
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

Block 4C adds the four verified 8256×5504 photographs as independent background
passes for Legacy `Front`, `Front_Sweet`, `Back`, and `Night`. The centered
content viewport remains 3:2, while the exact Legacy meshes keep the one master
signage texture. Photo POINT rejects the letterbox/pillarbox area and continues
through the existing canonical Photoshop reverse-link protocol.

Block 4D adds `Previz_3Dworld_Background_v02.glb` as a separate mutable Site
Environment layer in `3D WORLD`. Its 18 environment-only meshes retain direct
GLB world coordinates and receive a light-gray, fully rough, non-metallic,
double-sided `MeshStandardMaterial`. `Presentation` selects neutral DAY or
darker NIGHT lighting. The source material is ignored, and its runtime resources
are disposed after replacement.

The environment may visually occlude the signage through normal depth testing,
but its meshes are excluded from all raycasting. Canonical POINT continues to
raycast only the exact Functional Signage bindings, so hidden signage remains
pointable and the environment never receives the master Photoshop texture.

Block 4E adds four user-validated Site Location marker/photo-proxy records,
`LOCATIONS ON/OFF`, latest-wins PhotoScene navigation, and exact return to the
pre-entry Site camera, orbit target, environment presentation, and marker state.

Block 4F changes only the top-level startup selection: the app now opens in
`SITE 3D / 3D WORLD / NORMAL`. `2D VIEW` remains a first-class control and keeps
the Block 0 full-resolution FIT/1:1/zoom/pan/filter workflow. Runtime and
Portable smoke tests explicitly switch SITE 3D → 2D VIEW → SITE 3D before
running the Block 0–4E and Photoshop link regressions.

Block 5A loads the pinned FRONT 75F Anamorphic GLB as a third independent Site
asset. Its authored TEXCOORD_0 range is preserved without a forced 0..1 remap.
The four CALCAM_FRONT75F helper meshes remain hidden, receive no Photoshop
texture, and are excluded from POINT. Three.js uses the user-confirmed 3ds Max
vertical FOV 19.778° (horizontal 15.52°, diagonal 24.962°). FOV V supports a
session override, while 75F CALIBRATION restores 19.778°. Starting Orbit enters
FREE_PREVIEW, resets to the ordinary FOV 45°/world-up surface-fit camera, and
releases the 3000×3840 aspect restriction so the full viewer is used. While
75F CALIBRATION is active, only the area outside the contained working canvas
uses a `#20242c` matte; the canvas render itself is unchanged. 75F POINT remains
disabled under `DEFERRED_CANONICAL_INVERSE_MAPPING_UNPROVEN`. Corrected framing,
roll, reset behavior, unrestricted FREE_PREVIEW, and matte presentation were
user-validated on 2026-09-11.

Block 5B loads a fourth Site asset containing only the BACK anamorphic surface
  and its four calibration helpers. BACK uses corrected candidate vertical FOV
  `18.374°` and projection aspect `0.546875`, matching the centered `2100×3840`
  calibration canvas. Switching FRONT 75F/BACK changes only
  the selected family asset, surface, camera, and working canvas. BACK POINT stays
  disabled until its inverse canonical mapping is proven. Automated technical
  validation and corrected BACK visual calibration are user-approved and CLOSED.

Block 6A adds a manual Native Canonical Bake PoC only for FRONT 75F calibration.
`RUN TEST BAKE` generates a synthetic 3000×3840 RGBA source, bakes it through
the approved camera onto the unchanged authored TEXCOORD_0 at 4728×5760,
multiplies the production linear-scalar mask, and reprojects the result through
the same surface/camera. Surface-only hardware depth and a frontmost authored-UV
lookup exclude hidden surface fragments; Environment depth is never included.
The SOURCE, CANONICAL BAKE, and REPROJECTED previews are FIT-only. After a
successful bake, the three adjacent SAVE buttons download native-resolution PNGs
(`3000×3840`, `4728×5760`, and `3000×3840`) for external DCC inspection.
Photoshop write/import/layer authoring remains out of scope. Automated technical
validation and the user's external DCC difference-image review both pass; Block 6A
is CLOSED as of 2026-09-11.

Block 6B reuses one family-driven runtime for FRONT 75F and LUUX BACK. It adds
DIRECT PROJECTED, sampled from the original family-native working source through
the approved camera and exact surface without reading the canonical texture.
SOURCE, DIRECT PROJECTED, CANONICAL BAKE, and CANONICAL REPROJECTED are shown in
a larger 2×2 preview grid and can be saved as four PNGs. BACK uses 2100×3840
working targets and a 4728×5760 canonical target. Its production mask remains
`NOT_SUPPLIED`; a full-white diagnostic fallback is used without treating it as
production validation. The user accepted both Direct and Canonical variants on
2026-09-11: Canonical shows slightly more difference and less sharpness, while
Direct is sharper. Both remain available for use by purpose. Block 6B is CLOSED.

Block 7 adds manual full-image reverse transport from ProjectionBakeRuntime to
an explicitly pinned Photoshop Bake Target. Source and target document state are
kept separate. Canonical 4728×5760 is authoritative and Direct remains the
family-native alternate; both use the same ordered raw straight-RGBA8 binary
transport. Photoshop apply completion, rather than byte receipt, gates success.
Target mismatch, unsupported RGB/depth, closure, interruption, timeout, and busy
states are refused without resize, conversion, flatten, or unrelated artwork
mutation. UXP uses a staging Pixel Layer and replaces only a previous exact
session-owned output after a complete successful apply. OPTIONAL BAKE MASK is
toggleable for each family and defaults OFF. The supplied flat mask is not an
anamorphic 3D signage-shaped bake mask; its production role is a post-bake
planar compositing reference for combining separate FRONT and BACK results.
The retained ON path is legacy/diagnostic only and evaluates exact linear
`1.0 - mask` for BACK. The user confirmed native Direct placement against
3ds Max World Normal overlays for both families on 2026-09-11. Block 8 layer
stack authoring remains deferred.

The post-Block-7 Bake Visibility Correction keeps reverse transport unchanged
and replaces Canonical Bake's approximate 8-bit UV-neighborhood visibility test
with a depth-texture comparison from the same approved family camera. User
review showed that self-depth alone still exposed the opposite side inside the
J shape for both FRONT75 and BACK. The final shared path lazy-loads the exact
dedicated inner Matte `ANAM_BAKE_MATTE_INNER` as a depth-only, colorless
holdout. It exists only in the offscreen Projection Bake run, is never attached
to ordinary SITE 3D, and is disposed after every bake. Planar masks,
normal-threshold clipping, and signage GLB edits are not used. MASK OFF remains
the normal bake state. Minor residual edge visibility is user-accepted for
later planar-bake compensation; the correction is PASS / CLOSED.

## Commands

```powershell
npm install
npm run dev
npm run test:static
npm run test:protocol
npm run test:block4a
npm run test:block4b
npm run test:block4c
npm run test:block4d
npm run test:block4e
npm run test:block4f
npm run test:block5a
npm run test:block5b
npm run test:block6a
npm run test:block6b
npm run test:block7
npm run test:block8d
npm run test:block8e
npm run test:block8f
npm run test:block9a
npm run test:runtime
npm run test:link
npm run dist
npm run test:portable
```

`npm run dev` builds local renderer assets and launches Electron. The automated
runtime commands use the same application with a smoke-test flag and write
ignored reports under `.runtime/`.

`npm run test:portable` runs both the full runtime smoke and the synthetic
Photoshop Live/POINT smoke against `dist/LUUX Signage Previz.exe`.

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

## Block 9A source pipeline

Authoring placement uses native working-canvas pixels as its scale basis.
`Scale 1.00` maps a `3000×3840` source 1:1 into the FRONT 75F working canvas
and a `2100×3840` source 1:1 into the BACK working canvas. The Scale field is
shown directly below `LAYOUT EDIT`; select a visible layer and enter Layout Edit
to enable the transform controls.

    Explicit Photoshop Snapshot request
    -> native RGB8/RGBA8 imaging.getPixels capture
    -> ordered Snapshot binary transfer
    -> exact lossless project-owned PNG
    -> existing authoring Layer runtime
    -> schema 3 Save/Open, including offline Open
    -> existing Vector Mask / Bake Current / Full Merge paths

FILE input remains available without Photoshop. Block 9A is CLOSED / USER
VALIDATED for Composite Snapshot and exactly one ordinary Pixel Layer Selection
Snapshot in RGB8/sRGB-oriented V1 scope. BACK V3 has a scoped user visual PASS,
the 62% Layer opacity property passed separately, and sparse order-2-first
Send passed on the real Photoshop host. Exact hidden RGB under alpha=0 is a
non-blocking diagnostic, not a V1 guarantee. A
Selection Snapshot initializes its layer center from Photoshop capture bounds
in the active 1:1 working canvas and preserves the selected Pixel Layer opacity
through the return to Photoshop. Snapshot is explicit and immutable; Photoshop
history changes never auto-refresh it.

## Security and offline baseline

- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- `webSecurity: true`
- narrow project-only preload bridge
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
