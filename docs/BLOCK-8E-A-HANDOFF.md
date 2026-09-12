# LUUX Signage Previz — Block 8E-1 Handoff

Date: 2026-09-12
Baseline HEAD: `b2bd17b76dff8d1e01923028b52378d36ad1897c`

Status: **OPEN**

## BLOCK 8E STATUS

BLOCK 8E

FOUNDATION IMPLEMENTED

EDITOR / PERSISTENCE TECHNICAL PASS

RASTER / BAKE INTEGRATION PENDING

USER VALIDATION NOT YET REQUESTED

## Implemented in Block 8E-1

- Every authoring layer owns an independent `vectorMask` object. Source
  replacement preserves that mask; deleting the layer deletes it with the
  layer.
- A mask supports multiple paths, per-path `enabled`, `ADD` or `SUBTRACT`,
  explicit open/close state, and mask-level `enabled` and `invert`.
- Each point stores a stable `pointId`, anchor, incoming/outgoing handles, and
  the segment type to its next point. Supported segment types are `LINEAR` and
  `CUBIC_BEZIER`.
- Segment insertion uses exact de Casteljau subdivision so the existing cubic
  curve shape is preserved.
- Point deletion refuses operations that would make a closed path contain
  fewer than three points or an open path contain fewer than one point.
- Path and point IDs remain stable across selection changes, FRONT75/BACK
  switching, project Save/Open, and later additions.
- The Vector Mask panel provides enable/invert controls, path creation,
  selection, enable/disable, ADD/SUBTRACT operation, explicit close, path and
  point deletion, clear, and LINEAR/BEZIER segment conversion.
- The SVG editor overlay draws open/closed paths, anchors, handles, selected
  segments, and ADD/SUBTRACT distinction. Clicking empty source space appends a
  point; clicking a segment inserts a point; anchors and Bezier handles are
  draggable.
- Dragging empty editor space creates a marquee selection across anchors from
  both open and closed paths. Dragging any selected anchor moves the complete
  selected set while preserving each anchor's handle offsets and constraining
  anchors to the source-normalized bounds.
- While extending an open path with at least three points, clicking its first
  anchor closes the path. `CLOSE PATH` remains available as an explicit
  alternative, and the first anchor is highlighted when it is a close target.
- Mask Edit and Layout Edit are mutually exclusive. Mask Edit forces the
  calibration camera lock and restores the previous inspection camera and
  manual lock state on exit.

## Coordinate contract

Vector-mask geometry uses `SOURCE_NORMALIZED_TOP_LEFT` coordinates:

- `(0, 0)` is the source bitmap's top-left corner.
- `(1, 1)` is the source bitmap's bottom-right corner.
- The source-to-screen mapping applies the selected layer's normalized
  position, uniform scale, and rotation.
- The inverse mapping is used for editor pointer input, so mask geometry stays
  attached to the source when the layer transform changes.

This coordinate space is layer-local and is not the projection-frame space,
canonical bake space, or Photoshop document space.

## Project persistence

Project schema version is `2`.

- Schema v2 persists the complete layer-local vector-mask structure and
  validates exact keys, booleans, IDs, coordinates, operations, segment types,
  and open/closed point-count constraints before transactional load.
- Duplicate `pathId` or `pointId`, non-finite geometry, unsupported operations,
  unsupported segments, and malformed path topology are rejected before the
  current authoring session is changed.
- Schema v1 projects remain readable and migrate in memory to a default empty,
  disabled vector mask. The source project is not rewritten during Open.
- Photoshop target/session/document state and physical layer IDs remain outside
  project persistence.

## Automated evidence

- `test:block8e`: model, identity, geometry, exact Bezier subdivision,
  coordinate round-trip, v1 migration, v2 round-trip, transactional rejection,
  family isolation, source replacement, layer deletion, and scope boundary
  pass.
- Integrated Electron runtime: Mask Edit entry/exit, SVG overlay, six anchors,
  two paths, ADD/SUBTRACT, Bezier segment, calibration-camera interlock,
  marquee selection, selected-anchor group movement, first-anchor close
  gesture, Layout Edit exclusion, camera restoration, no Photoshop mutation,
  and zero WebGL context loss pass.
- Existing Block 8A through Block 8D behavior remains under regression tests.

## Explicitly pending for Block 8E-2

- Vector-mask contribution to SITE 3D preview pixels;
- application to Direct or Canonical Bake alpha;
- composition with the existing production visibility mask;
- Photoshop vector-mask creation or transfer;
- any `BAKE FULL MERGED` or flattened multi-layer output.

The current mask editor changes authoring data and marks the selected layer's
pixels dirty, but `projection-bake-runtime.js` deliberately contains no vector
mask handling. A visually drawn mask must therefore not be interpreted as a
preview or Bake result in Block 8E-1.

## Main implementation files

- `desktop-app/src/vector-mask-model.js`
- `desktop-app/src/screen-image-authoring.js`
- `desktop-app/src/project-persistence.js`
- `desktop-app/src/renderer.js`
- `desktop-app/src/index.html`
- `desktop-app/src/styles.css`
- `desktop-app/src/main.cjs`
- `desktop-app/tests/block-8e-foundation-validation.mjs`
- `desktop-app/tests/block-8d-validation.mjs`
- `desktop-app/tests/static-validation.mjs`
- `desktop-app/package.json`
- `desktop-app/package-lock.json`

Block 8E remains **OPEN**. Block 8E-1 is ready only as a data/editor/persistence
foundation; user validation has not been requested because visible raster and
Bake behavior belongs to the next sub-block.
