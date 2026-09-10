# LUUX Signage Previz — Block 4D Handoff

Status: **CLOSED / AUTOMATED PASS / USER PASS**
Date: 2026-09-10

## Design-stage summary

Block 4D establishes a strict ownership split inside `SITE 3D / 3D WORLD`:

```text
Functional Signage GLB
  -> exact Block 3 bindings
  -> master Photoshop texture
  -> Canonical POINT raycast target

Site Environment GLB v02
  -> mutable presentation/context geometry
  -> neutral runtime material + DAY/NIGHT lighting
  -> visual depth only
  -> never a texture target or POINT target
```

The selected environment is
`3DAsset/BG/Previz_3Dworld_Background_v02.glb`. It is the corrected user
revision with 18 environment-only meshes. The earlier v01 contained eight
signage-like nodes, is not selected, and is ignored locally.

## Important implementation files

- `desktop-app/src/site-environment-profile.js`: asset identity, mutable
  fingerprint, exact exclusions, presentation values, material and POINT policy.
- `desktop-app/scripts/glb-inspection.mjs`: GLB 2.0 parsing, inventory, hash,
  reachable renderable meshes, and finite-transform checks.
- `desktop-app/scripts/build.mjs`: verified v02 copy to generated runtime assets
  and informational revision diagnostics.
- `desktop-app/src/renderer.js`: direct scene load, neutral material replacement,
  DAY/NIGHT lighting, exact visibility, raycast isolation, diagnostics, and
  runtime smoke entrypoint.
- `desktop-app/tests/block-4d-validation.mjs`: current v02 revision and soft-asset
  compatibility validation.

## Contract boundaries to preserve

1. Environment revisions are mutable. A changed hash/inventory should report
   `ENVIRONMENT REVISION CHANGED`; it must not become a permanent strict schema.
2. Runtime compatibility still requires parseable GLB 2.0, a reachable scene,
   at least one renderable TRIANGLES mesh, finite transforms, and successful
   renderer load.
3. Do not apply hidden basis conversion or root transform to either Functional
   Signage or Environment assets.
4. Keep environment selection/exclusion exact-name only. Do not introduce fuzzy
   signage-name matching.
5. Do not add environment meshes to Functional Signage bindings, master texture
   propagation, marker ownership, or Canonical POINT raycasting.
6. Keep Legacy 2D World, four PhotoScene records, CameraRecords, Camera Editor,
   and Photoshop protocol unchanged.
7. Preserve the runtime source-material replacement and disposal path so GLB
   materials do not leak GPU resources.

## Validation state

All automated build, static, protocol, real Electron GPU, and synthetic live
link tests pass. Exact evidence is recorded in
[`BLOCK-4D-VALIDATION.md`](BLOCK-4D-VALIDATION.md).

The user explicitly validated alignment, silhouette/detail, duplicate absence,
neutral material, DAY/NIGHT readability, DoubleSide visibility, orbit usability,
and POINT-through-visual-occlusion on 2026-09-10. Block 4D is CLOSED.

## Next-stage unresolved items

- Qualitative Site Environment visual acceptance: **PASS**.
- Environment revision replacement workflow after v02: defined, not exercised.
- Topology cleanup, LOD, authored lighting/HDRI, and optimization: **DEFERRED**.
- Block 4E+ Location or later functionality: **NOT IMPLEMENTED**.
