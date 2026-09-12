# LUUX Signage Previz — Block 8D Handoff

Date: 2026-09-12
Baseline HEAD: `5747f032432fbc171111b60b57349fba9fd39c22`

Status: **CLOSED / USER VALIDATED**

## BLOCK 8D STATUS

Branch: `main`

Project format: folder project containing `project.json` and generated ASCII
files under `assets/`

Schema version: `1`; newer/unsupported schemas are refused with
`PROJECT_SCHEMA_UNSUPPORTED`

Save As: directory selection, asset staging/verification, then manifest commit

Save: updates the current session project; first Save falls back to Save As

Open: exact `project.json` file selection or Project-panel drag/drop, followed
by complete validation/decode before the current authoring state is replaced

Atomic save: staged asset writes and atomic `project.json` replacement; a
failed save preserves the prior manifest and usable project

Transactional load: all manifest, path, asset, hash, metadata, and decode
checks complete before logical swap; a failed load leaves the current session
and runtime sources unchanged

Source assets: original PNG/JPG bytes are copied without canvas redraw or
re-encoding; SHA-256 equality is verified

Family ownership: FRONT75 and BACK stacks remain independent

Stable identity: `layerId` is restored exactly and subsequent IDs cannot
collide with loaded IDs

Layer state: source, normalized transform, opacity, blend, visibility, and
order round-trip exactly

Calibration: project data stores application-owned profile/surface references,
not editable camera, FOV, aspect, lens-shift, projection-matrix, or near/far
values

Load state: every restored layer starts `NEEDS BAKE` and
`PHOTOSHOP UNSYNCED`

Photoshop state: target/session/document identity, `photoshopLayerId`, ownership
mapping, and target registry are not persisted or reconnected

Bake state: output pixels, render targets, visibility/depth buffers, and the
dedicated `ANAM_BAKE_MATTE_INNER` instance are not persisted

Session state: Outside Signage opacity, orbit/pan/dolly, Layout Edit active
state, camera lock, Quick Rail expansion, and other transient UI state are not
persisted

Security: project-specific narrow IPC only; Electron isolation, sandbox, and
web security remain enabled

Regressions: Block 8A/8B/8C, Outside Preview, DnD/layer controls, Layout
Interlock, Quick Rail, Projection Bake, dedicated visibility matte, Multi
Target, protocol, Electron runtime, and Live Link tests pass

Context loss: `0`

Known issue: Korean, Japanese, and other non-ASCII source filenames can load
from a Project but remain unsupported for Photoshop
`SEND DIRECT` under the project ASCII filename policy. This remains
`KNOWN ISSUE / USER ACCEPTED / NON-BLOCKING`; generated internal project paths
do not change that contract.

User validation on 2026-09-12 confirmed FRONT75/BACK restoration, 50% Outside
Signage reset, Layout Interlock, Bake, session-scoped target behavior, and a
new English-filename source Send without removing earlier Photoshop canvas
layers. Project-loaded Korean-filename layers did not Send and are covered only
by the accepted Known Issue above.

Final user validation also confirmed exact `project.json` selection,
Project-panel `project.json` drag/drop, and the Photoshop UXP panel's
full-height vertical scrollbar after plugin reload.

## Main implementation files

- `desktop-app/src/project-persistence.js`
- `desktop-app/src/project-storage.cjs`
- `desktop-app/src/project-preload.cjs`
- `desktop-app/src/main.cjs`
- `desktop-app/src/renderer.js`
- `desktop-app/src/screen-image-authoring.js`
- `desktop-app/src/index.html`
- `desktop-app/src/styles.css`
- `desktop-app/tests/block-8d-validation.mjs`
- `desktop-app/tests/static-validation.mjs`
- `desktop-app/package.json`
- `desktop-app/package-lock.json`

Detailed automated evidence and the required user procedure are in
[Block 8D Validation](BLOCK-8D-VALIDATION.md).

## Explicitly excluded

- Layer Vector/bitmap masks and all drawing/text tools;
- BAKE FULL MERGED or flattened stack output;
- Photoshop/selection/composite snapshots and automatic reconnect;
- persisted Photoshop targets or physical layer IDs;
- groups/folders, rename, duplicate, or cross-family layer moves;
- autosave, recent projects, cloud sync, asset browser, and missing-file search;
- camera animation and JPG sequence rendering.

Block 8D is `CLOSED`. The user completed the Save → Restart → Open → Bake →
new-session Photoshop Send procedure, verified the loading enhancements and
UXP scrollbar, and gave an explicit All PASS on 2026-09-12.
