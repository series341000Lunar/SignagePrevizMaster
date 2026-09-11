# LUUX Signage Previz — Post-Block-8A Outside Preview Validation

Date: 2026-09-12
Baseline HEAD: `409585b1b639b8e77992ccd16a5e32e2a2cbe017`
Directive SHA-256: `2769672EC6694C157F4A06E704D0A9B01D910FFA598A9552E949A9AA29BEB828`

Status: **CLOSED / AUTOMATED TECHNICAL PASS / USER VISUAL VALIDATION PASS**

## Scope and ownership

- `outsideSignageOpacity` is owned by `AuthoringViewSettings`; it is not stored
  on the source or authoring layer.
- Default: `0.50`; range: `0.00..1.00`; slider step: `0.01`.
- Presets are direct value shortcuts: `HIDE=0`, `50%=0.5`, `FULL=1`.
- The value is shared by FRONT75 and BACK for the current app session. It is
  not persisted to a project, config file, or user preference.
- Reset Transform, source replacement, Layout Edit exit, and family switching
  do not reset the value. App restart returns it to `0.50`.

## Display contract

- Inside Signage: `displayAlpha = sourceAlpha`.
- Outside Signage: `displayAlpha = sourceAlpha × outsideSignageOpacity`.
- Alpha checks at Outside `0.50`: source `1.0 → 0.50`, `0.5 → 0.25`, and
  `0.0 → 0.0`.
- Outside `0` shows only source pixels inside the signage coverage. Outside `1`
  is visually equivalent to the original Block 8A full-image preview.
- The original decoded source bitmap is drawn directly; Production Source is
  not resized, re-encoded, or mutated.

## Coverage contract

- The mask is generated from the current Family Registry surface binding and
  approved Projection Camera in screen space.
- FRONT75 resolves `ANAM_SURFACE_FRONT75F`; BACK resolves
  `ANAM_SURFACE_BACK` through the existing profile binding.
- FRONT and BACK use one common coverage implementation. No new per-family
  selection rule or parallel rendering mode was introduced.
- Coverage is invalidated by family/surface/camera/frame/viewport changes and is
  reused while only the image transform changes.
- Runtime evidence generated 53,130 projected triangles, 177,854 covered
  pixels, and 398,859 outside pixels in the smoke viewport.
- Photoshop planar masks are not read by this guide.
- `ANAM_BAKE_MATTE_INNER` is not read by this guide and remains a separate
  offscreen depth-only Bake holdout.

## Bake and revision isolation

- Slider and preset changes redraw only the Authoring View canvas.
- No Full Canonical Bake, GPU readback, Photoshop transfer, source revision, or
  `DIRTY / NEEDS BAKE` transition is triggered.
- A completed family bake is fingerprinted once, then the view setting is
  changed through `0`, `0.5`, and `1` without recomputation. Direct, Canonical,
  and Reprojected preview pixels remain byte-identical for FRONT75 and BACK.
- The authoring session remains `READY` at the same revision before and after
  each setting change.
- Image Move/Scale/Rotate continues to use the existing authoring transform
  invalidation path and therefore still produces `DIRTY / NEEDS BAKE`.

## Regression evidence

- Layout Edit continues to force the real camera controls lock. The opacity
  controls stop pointer propagation, so slider operation cannot orbit, pan, or
  dolly the camera.
- Existing Move/Scale/Rotate overlay ownership and handles are preserved.
- `ProjectionBakeRuntime`, Production shaders, family camera records, planar
  masks, dedicated matte, Multi Bake Target registry, and Photoshop transport
  receive no Outside Preview setting.
- Electron runtime: `BLOCK0_TECHNICAL_PASS=true` and context loss count `0`.

## Automated tests

- `npm run test:outside-preview` — PASS
- `npm run test:block8a` — PASS
- `npm run test:visibility-correction` — PASS
- `npm run test:multi-target` — PASS
- `npm run test:static` — PASS
- `npm run test:protocol` — PASS
- `npm run test:runtime` — PASS
- `npm run test:link` — PASS
- `npm test` — PASS
- `git diff --check` — PASS

## Acceptance checklist

- [x] Outside Preview range `0..1`, default `0.5`, step `0.01`
- [x] HIDE / 50% / FULL presets and immediate preview update
- [x] Inside source alpha preserved
- [x] Outside factor multiplied with source alpha
- [x] View-owned, session-only, Layer-independent state
- [x] Shared FRONT75/BACK architecture and family-specific coverage refresh
- [x] Layout Interlock and image manipulation paths preserved
- [x] Slider does not create DIRTY or change revision
- [x] Direct / Canonical / Reprojected preview pixels unchanged at `0/0.5/1`
- [x] Production shader, planar mask, dedicated matte, and Multi Target isolated
- [x] User confirms real boundary readability in FRONT75 and BACK

## User validation

`PASS / CLOSED — 2026-09-12`

The user verified FRONT75 and BACK with real image content, the three opacity
states, authoring placement, and the resulting Photoshop bake. The feature is
accepted.

## Known issue — accepted, non-blocking

In BACK Authoring Preview, the screen-space coverage guide can include portions
of the rear signage surface that are physically behind the building.

Reason: this guide intentionally projects the approved Family Signage Surface
only. It does not use the building mesh or `ANAM_BAKE_MATTE_INNER`, because the
directive keeps Authoring Coverage separate from 3D Bake visibility.

Impact: the extra area is a preview-only placement guide discrepancy. The user
confirmed that Production Bake correctly removes the building-occluded portion
through the existing depth visibility/holdout path. Direct/Canonical results are
therefore not affected.

Disposition: **KNOWN ISSUE / USER ACCEPTED / NON-BLOCKING**. An occlusion-aware
Authoring Coverage mode may be considered in a later scoped correction; it is
not required to close this correction.
