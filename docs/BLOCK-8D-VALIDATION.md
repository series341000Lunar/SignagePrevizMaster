# LUUX Signage Previz — Block 8D Validation

Date: 2026-09-12

## Current state

- Implementation: `IMPLEMENTED`
- Automated technical validation: `PASS`
- User core Save / Restart / Open / Bake validation: `PASS — 2026-09-12`
- Loading UX enhancement validation: `PASS — 2026-09-12`
- Photoshop UXP scroll enhancement validation: `PASS — 2026-09-12`
- Block 8D gate: `CLOSED`

Automated persistence and Electron runtime evidence do not replace the final
user-operated GUI and Photoshop round trip. The user explicitly confirmed the
complete Block 8D flow, exact `project.json` loading interactions, and the
reloaded Photoshop UXP panel scroll behavior on 2026-09-12.

## Implemented contract

- Projects use a folder containing `project.json` and `assets/` with
  `schemaVersion: 1`.
- FRONT75 and BACK authoring stacks persist independently. Each layer retains
  its exact `layerId`, order, visibility, original file metadata, normalized
  transform, opacity, and supported blend mode.
- Imported PNG/JPG bytes are copied byte-for-byte into generated ASCII project
  asset paths. The original filename remains metadata and is not used as the
  internal path.
- Manifest references are project-root-relative `assets/...` paths. Absolute,
  network, traversal, nested, and symlink-escape paths are rejected.
- Project persistence validates known families, application-owned projection
  references, unique layer IDs, contiguous order, source metadata, dimensions,
  transforms, opacity, visibility, and exact blend enums.
- Unsupported schemas, missing assets, hash/metadata mismatches, and image
  decode failures reject the complete load.
- Save stages and verifies all assets before atomically replacing
  `project.json`. A failed update preserves the previous valid manifest.
- Load reads, verifies, decodes, and constructs all temporary runtime sources
  before the current authoring state is swapped. Failure disposes only the
  temporary resources; success swaps first and disposes the old resources.
- Loaded authoring layers retain their IDs but start `NEEDS BAKE` and
  `PHOTOSHOP UNSYNCED`. The next generated layer ID resumes above all loaded
  sequence numbers.
- Save, Save As, and Open use a narrow preload/IPC project API. Open selects
  the exact `project.json` file and the Project panel also accepts a dropped
  `project.json`. Renderer Node
  access is not enabled; `nodeIntegration: false`, `contextIsolation: true`,
  `sandbox: true`, and `webSecurity: true` remain intact.
- The Photoshop UXP panel uses an explicit full-height vertical scroll
  container so registered targets and lower diagnostics remain reachable.

## Persisted

- family ownership and application-owned projection/profile reference;
- stable authoring layer identity and order;
- original source file bytes and source metadata;
- normalized transform, visibility, opacity, and blend mode.

## Not persisted

- Photoshop target/session/document IDs or `photoshopLayerId` ownership;
- Bake Target Registry or OwnedLayerRegistry;
- baked pixels, GPU/depth/visibility buffers, or dedicated matte instances;
- camera/calibration values as editable project data;
- Outside Signage opacity, orbit state, Layout Edit state, Quick Rail state,
  scroll/hover/accordion state, or other session UI state.

## Automated evidence

The following commands passed on 2026-09-12:

- `npm run build`
- `npm run test:block8a`
- `npm run test:outside-preview`
- `npm run test:block8b`
- `npm run test:block8c`
- `npm run test:block8d`
- `npm run test:visibility-correction`
- `npm run test:multi-target`
- `npm run test:static`
- `npm run test:protocol`
- `npm run test:runtime`
- `npm run test:link`
- `npm test`
- `git diff --check`

`test:block8d` uses real PNG/JPG bytes and distinct three-layer FRONT75 and
two-layer BACK states. It verifies exact source hashes, exact round-trip state,
stable IDs, safe ID continuation, loaded dirty/unsynced state, failure-safe
save, and transactional rejection of missing, corrupt, unsupported-schema, and
traversal projects.

The Electron report at `desktop-app/.runtime/dev-runtime.json` records:

- folder project and project UI available: `true`;
- FRONT75/BACK layer counts: `3 / 2`;
- exact round trip and stable IDs: `true`;
- loaded NEEDS BAKE / PHOTOSHOP UNSYNCED: `true / true`;
- source bytes and relative paths preserved: `true`;
- camera, current session, target registry, Layout Interlock, and Quick Rail
  unchanged during smoke: `true`;
- WebGL context loss: `0`;
- user validation: `PENDING`.

The Live Link runtime report also passed, proving that Block 8D did not break
the existing link smoke architecture. It is not a real Photoshop confirmation.

## User validation evidence — 2026-09-12

- The saved folder project under `ProjectsSave` reopened successfully.
- FRONT75 and BACK sources and independent stacks restored successfully.
- Outside Signage opacity returned to 50%.
- Layout Camera Interlock and `BAKE CURRENT` passed.
- The previous Photoshop target was not restored. After app restart and target
  re-registration, an English-filename source completed `SEND DIRECT`.
- Existing Photoshop canvas layers from Block 8C remained present when the new
  image was registered and sent, confirming non-destructive ownership behavior.
- Exact `project.json` file selection and Project-panel `project.json`
  drag/drop both passed.
- After reloading the Photoshop UXP plugin, the full-height vertical scrollbar
  and access to lower controls and diagnostics passed.
- Correction: project-loaded layers whose original filenames contain Korean
  characters did not complete `SEND DIRECT`. Their Project Load succeeded; the
  successful Photoshop send used a separately added English-filename source.

## Preserved known issues

- A Korean, Japanese, or other non-ASCII source filename can open in Previz and
  restore from a Project but fail
  `SEND DIRECT`. The required ASCII filename policy remains
  `KNOWN ISSUE / USER ACCEPTED / NON-BLOCKING`. Generated ASCII project asset
  paths do not claim to fix Photoshop filename compatibility.
- The accepted BACK ordinary-preview occlusion discrepancy remains
  `KNOWN ISSUE / USER ACCEPTED / NON-BLOCKING`.

## User validation completion

The required Save, restart, exact-file Open, `project.json` drag/drop, Bake,
new-session Photoshop Send, and UXP panel scrolling checks all passed in the
user-operated application and Photoshop workflow.

USER VALIDATION: **PASS — 2026-09-12**

BLOCK 8D GATE: **CLOSED**
