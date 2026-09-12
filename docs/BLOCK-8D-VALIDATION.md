# LUUX Signage Previz — Block 8D Validation

Date: 2026-09-12

## Current state

- Implementation: `IMPLEMENTED`
- Automated technical validation: `PASS`
- User Save / Restart / Open / Photoshop validation: `PENDING`
- Block 8D gate: `OPEN`

Automated persistence and Electron runtime evidence do not replace the final
user-operated GUI and Photoshop round trip. Block 8D must not be marked
`CLOSED` before that validation passes.

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
- Save, Save As, and Open use a narrow preload/IPC project API. Renderer Node
  access is not enabled; `nodeIntegration: false`, `contextIsolation: true`,
  `sandbox: true`, and `webSecurity: true` remain intact.

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

## Preserved known issues

- A Japanese or other non-ASCII source filename can open in Previz but fail
  `SEND DIRECT`. The required ASCII filename policy remains
  `KNOWN ISSUE / USER ACCEPTED / NON-BLOCKING`. Generated ASCII project asset
  paths do not claim to fix Photoshop filename compatibility.
- The accepted BACK ordinary-preview occlusion discrepancy remains
  `KNOWN ISSUE / USER ACCEPTED / NON-BLOCKING`.

## Required user validation

1. Create three FRONT75 layers and two BACK layers.
2. Give every layer different Position, Scale, Rotation, Opacity, Blend,
   Visibility, and Order values.
3. Run `SAVE PROJECT AS...`.
4. Exit and restart the app.
5. Run `OPEN PROJECT...` and verify both family stacks, IDs, sources, transforms,
   opacity, blend, visibility, and order.
6. Confirm Outside Signage opacity returned to its session default.
7. Enter Layout Edit and confirm camera interlock.
8. Run `BAKE CURRENT` and confirm the existing Bake path works.
9. Confirm the prior Photoshop target did not auto-restore.
10. Register a target in the current Photoshop session, run `SEND DIRECT`, and
    confirm a new Photoshop layer ownership mapping is created.

USER VALIDATION: **PENDING**
