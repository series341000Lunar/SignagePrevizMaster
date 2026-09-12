# LUUX Live Link — Block 9A

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

Block 9A adds an independent explicit Snapshot path. Composite captures the
active RGB8 document; Selection accepts exactly one active
constants.LayerKind.NORMAL Pixel Layer. UXP calls imaging.getPixels() without
targetSize, requires native pyramid level 0, and rejects non-native bounds,
unsupported component layouts, non-RGB documents, and non-8-bit documents. It
never resizes, converts, flattens, saves, or mutates artwork.

Selection Snapshot also transports the selected Pixel Layer opacity normalized
to 0..1 and rechecks it after pixel capture. The renderer uses capture bounds
to restore initial document position in the active 1:1 working canvas; returned
output metadata reapplies the same authoring-layer opacity in Photoshop.

Snapshot traffic uses separate SNAPSHOT messages and shares only the inbound
large-transfer exclusion with Live. Snapshot completion is acknowledged after
the renderer has created a lossless project PNG, verified it, decoded it, and
installed the ordinary authoring Layer. Snapshot does not participate in Auto
Sync. One-Pixel-Layer alpha semantics remain probe-gated until verified in real
Photoshop; masked layers, Groups, Smart Objects, and arbitrary selections are
not formally supported in Block 9A.

Block 7 Bake ownership remains one output layer per documentId + familyId +
outputKind, with Canonical and Direct independent. Auto Sync notifications
generated during apply are suppressed temporarily and normal Auto Sync resumes
afterward. If target activation is required, the previously active Source
Document is restored.

Per-layer Send retains each layer's full authoring-stack order in protocol
metadata. Photoshop physical indices are compact relative ranks among only the
already-sent owned layers, so a bottom authoring layer may validly be Photoshop
index 0 when it is sent first. No placeholder layers are created.

The allow-list remains `ws://localhost/`; the runtime endpoint is
`ws://localhost:34100` and the Electron broker binds only to `127.0.0.1`.
