# LUUX Live Link — Block 7

This manifest-v5 Photoshop UXP panel keeps the established full-resolution
Photoshop-to-Previz manual and Auto Sync paths, plus the Block 2 Pointer path.
Block 7 adds the reverse full-image path from ProjectionBakeRuntime to an
explicitly selected Photoshop Bake Target.

The active Source Document and fixed Bake Target are independent states. `SET
ACTIVE AS BAKE TARGET` records document ID, name, dimensions, mode, and depth;
changing the active Photoshop document does not silently retarget the bake.
Targets must remain open, identity-matched, exact-size RGB8 documents. The
plugin never resizes, converts, flattens, or deletes user artwork.

Reverse frames use protocol v1 binary `RGBA8` chunks at 2 MiB with an 8 MiB
backpressure high-water mark, 120-second completion timeout, and 512 MiB
maximum. Receipt and Photoshop apply completion are separate acknowledgements.
Only the fully received and validated buffer enters `executeAsModal()`.

Each output is first written to a staging Pixel Layer. After `putPixels`
succeeds, the layer is promoted to a `__LUUX_ANAMORPHIC__` output and only a
previous layer whose ID is present in the plugin session ownership registry may
be replaced. Similar names are never treated as ownership proof. Full-frame
`replace: true` prevents stale pixels. A failed receive or apply preserves the
previous confirmed output.

Block 8's authored Layer Stack is not created early. Block 7 uses one owned
output layer per `documentId + familyId + outputKind`, with Canonical and Direct
kept independent. Auto Sync notifications generated during apply are suppressed
temporarily and normal Auto Sync resumes afterward. If target activation is
required, the previously active Source Document is restored.

The allow-list remains `ws://localhost/`; the runtime endpoint is
`ws://localhost:34100` and the Electron broker binds only to `127.0.0.1`.
