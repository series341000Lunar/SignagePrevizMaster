# LUUX Signage Previz — Block 4E Validation / Handoff

Status: **CLOSED / AUTOMATED PASS / USER PASS**
Design contract: `LUUX_Signage_Previz_BLOCK-4E_DESIGN_V1_20260910.md`
Design bytes / SHA-256: `19,183` / `C5D61B8BF9E385A47A4B46DF234105B0D409EA9DDF3B701489B402E979482B49`
Date: 2026-09-11

## Scope result

Block 4E connects the closed Site 3D, Environment, PhotoScene, CameraRecord,
and Photoshop POINT systems through a separate Location Navigation layer. No
new camera, PhotoScene, canonical coordinate system, project-save system, or
Block 5+ function was introduced.

Implemented workflow:

```text
SITE 3D / 3D WORLD / NORMAL
→ red Location marker + photo proxy
→ marker or thumbnail click
→ existing Legacy PhotoScene activation
→ CameraRecord.currentValues + CAMERA LOCKED
→ RETURN TO SITE
→ exact pre-entry camera/orbit/environment/marker state
```

## User-approved Location calibration

The Legacy HTML/SceneManager contains Camera and Photo contracts but no
Location world-position records. The following independent Three-world values
were placed against the actual v02 Environment and current functional Signage
bounds, then visually approved by the user on 2026-09-11. They are deliberately
not copied from or linked to `CameraRecord.position`.

| Location | PhotoScene | World position `{x,y,z}` | UI offset `{x,y}` | Status |
| --- | --- | --- | --- | --- |
| `location.front` | `FRONT` | `{-9.5, 0.15, 11}` | `{-88, -8}` | `RESOLVED / USER_VALIDATED` |
| `location.front-sweet` | `FRONT_SWEET` | `{-7, 0.15, 13}` | `{88, -8}` | `RESOLVED / USER_VALIDATED` |
| `location.back` | `BACK` | `{-11.2, 0.15, -10.8}` | `{-88, -8}` | `RESOLVED / USER_VALIDATED` |
| `location.night` | `NIGHT` | `{-9.6, 0.15, -12.3}` | `{88, -8}` | `RESOLVED / USER_VALIDATED` |

Observed source-space bounds used for placement context:

```text
Environment v02:
X -33.2266 … 33.2266
Y -0.0257  … 10.4352
Z -33.2266 … 33.2266

Functional Signage:
X -1.4642 … 2.3063
Y  2.4101 … 8.4101
Z -4.7940 … 0.9250
```

The user explicitly approved the visual locations, Back/Night separation,
one-third icon scale, and semi-transparent presentation on 2026-09-11.

## Derived thumbnail contract

Authoritative full photos remain unchanged in `2DAsset/Photograph/`. Build
uses pinned `sharp 0.35.4` to generate derived JPEG proxies:

```text
resize: 450 × 300
fit: contain
crop: false
stretch: false
JPEG quality: 82
output: desktop-app/build/assets/photo/thumb/
```

| PhotoScene | Generated runtime URL | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `FRONT` | `./assets/photo/thumb/BG_Front-thumb.jpg` | 35,277 | `524789D2F2FB0B09A487BAF60FA7CADA32CF996A10A541AC65FE1FF072231414` |
| `FRONT_SWEET` | `./assets/photo/thumb/BG_FrontSweet-thumb.jpg` | 31,893 | `10C1ABE22BAA8FA871281D4D9A431F5DF5CDBE2038C2563B6B703CFB511FA2CC` |
| `BACK` | `./assets/photo/thumb/BG_Back-thumb.jpg` | 33,315 | `B1DADC3BB0A635CCF4A449C48A0A23DB302892441E961CB671CB58EFFF73D6E8` |
| `NIGHT` | `./assets/photo/thumb/BG_Night-thumb.jpg` | 31,229 | `20899BCD83879B4925246433CC0793F348DE8EBEF3E4909831269821473A0501` |

Proxy generation/load failure is isolated: the red marker and its click path
remain; the image is replaced by a no-preview placeholder. Build output is
regenerated and remains ignored by Git.

## Marker renderer and interaction

- World positions are projected through the active `cameraSite` into a DOM
  overlay. Following the 2026-09-11 user review, the original responsive
  150–205 px card was reduced to exactly one-third (`50–68 px`) and uses
  `opacity: 0.72`; hover/focus raises it to `0.94` for selection feedback.
- Marker cards contain only the proxy and red pin. No persistent visual scene
  text is created; accessible identity is provided through `aria-label`.
- A point with camera-space `z >= 0`, non-finite projection, or NDC outside
  `[-1,1]` is hidden. No edge-arrow behavior is added.
- Visibility scope is exactly `SITE 3D + 3D WORLD + NORMAL + LOCATIONS ON`.
- `LOCATIONS OFF` hides every card and hit target without changing camera,
  environment, PhotoScene, or POINT state. It is session-only and defaults ON.
- In `NAVIGATE`, the marker/card is clickable. In `POINT`, marker cards remain
  visual but use `pointer-events:none`, allowing the canvas POINT path through.
- Environment meshes remain visual-only and are not used for Location clicks
  or canonical raycasts.

## Site return transaction

`SiteReturnSnapshot` stores:

```text
viewMode
siteWorldMode
mappingMode
camera.position / quaternion / fov / aspect / near / far / zoom / up
orbitControls.target
environmentLightingMode
markerVisibility
```

`LatestWinsLocationNavigation` owns a request token and one original Site
snapshot. Location activation validates identity, captures the Site once,
reuses the existing Block 4C PhotoScene loader, waits for Photo readiness,
applies `CameraRecord.currentValues`, locks the camera, and commits only the
latest request. PhotoScene selector changes do not overwrite the original Site
snapshot.

Successful return restores `SITE 3D → 3D WORLD → NORMAL`, presentation mode,
camera, quaternion, projection values, OrbitControls target, and marker state,
then clears the snapshot. The runtime reapplies exact camera values after
OrbitControls synchronization to prevent numeric drift. Direct Legacy entry
without a snapshot exposes no fake return. Activation failure restores Site;
return failure restores Photo and preserves the Site snapshot.

## Automated evidence

| Check | Result |
| --- | --- |
| `npm run test:static` | PASS |
| `npm run test:protocol` | PASS, including Block 0–4E |
| `npm run test:block4e` | PASS |
| `npm run test:runtime` | PASS, `technicalPass: true` |
| `npm run test:link` | PASS, `technicalPass: true` |
| Four independent Location identities and Photo mappings | PASS |
| Location vs CameraRecord non-inheritance | PASS |
| Four generated 450×300 proxies / full-photo hashes | PASS |
| Projection / behind-camera / offscreen handling | PASS |
| LOCATIONS ON/OFF / hit-target disable | PASS |
| POINT DOM pass-through | PASS |
| Four Location → PhotoScene routes / Camera lock | PASS |
| Exact Camera + Orbit target + NIGHT + visibility return | PASS |
| Rapid A→B latest-wins | PASS |
| Direct Photo entry no fake return | PASS |
| Synthetic failure recovery transactions | PASS |
| WebGL context loss during Block 4E runtime sequence | PASS: `0` |
| User-requested marker CSS (`50–68 px`, idle opacity `0.72`) | PASS |

After the user closed the older Previz instance, clean sequential Electron
validation completed with `technicalPass: true` in both
`desktop-app/.runtime/dev-runtime.json` and
`desktop-app/.runtime/link-runtime.json`. The link harness now waits for the
Renderer broker handshake and marks its isolated synthetic Photoshop client;
an open Photoshop UXP panel may reconnect, but cannot replace that client in
the middle of a smoke transfer. This changes test isolation only, not the
production role-ownership policy.

## Changed files

```text
README.md
docs/BLOCK-4E-VALIDATION-HANDOFF.md
desktop-app/package.json
desktop-app/package-lock.json
desktop-app/scripts/build.mjs
desktop-app/src/index.html
desktop-app/src/location-navigation-runtime.js
desktop-app/src/live-link-broker.cjs
desktop-app/src/main.cjs
desktop-app/src/renderer.js
desktop-app/src/site-calibration-profile.js
desktop-app/src/styles.css
desktop-app/tests/block-4a-validation.mjs
desktop-app/tests/block-4e-validation.mjs
desktop-app/tests/static-validation.mjs
```

Implementation commit: **CURRENT BLOCK 4E CLOSURE COMMIT**

## USER VALIDATION — PASS / CLOSED

The user explicitly approved the completed Block 4E behavior on 2026-09-11:

- [x] FRONT marker adequately represents the shooting location.
- [x] FRONT_SWEET marker adequately represents the shooting location.
- [x] BACK marker adequately represents the Gwanghwamun-side location.
- [x] NIGHT remains independent and its spacing from BACK is readable.
- [x] The user-requested one-third marker/card size and semi-transparent idle
  appearance are comfortable in the running app.
- [x] No visible text label is appropriate; thumbnail overlap/offset is acceptable.
- [x] Marker and thumbnail clicks open the correct four PhotoScenes.
- [x] LOCATIONS OFF gives a clean workspace and ON restores correctly.
- [x] POINT mode marker UI does not block Photoshop POINT.
- [x] RETURN TO SITE restores the exact pre-entry Site camera.
- [x] Repeated entry/return has no accumulating drift.
- [x] DAY and NIGHT presentation state restores correctly.

## Deferred / unrelated open work

- The existing Block 4B `3DS MAX-LIKE` calibration gates remain open and are
  unrelated to Location positions.
- Anamorphic Location visibility, edge arrows, collision layout, persistent
  marker preferences, survey coordinates, project save, and Block 5+ features
  remain deferred.
