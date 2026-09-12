# Block 8F Validation

Status: **CLOSED / AUTOMATED PASS / USER VALIDATED**

## Automated contract

- `BAKE FULL MERGED` uses the existing `ProjectionBakeRuntime` for every visible layer in the current family.
- Layer UI order remains topmost-first; merge execution uses `renderLayers` bottom-to-top.
- `NORMAL`, `MULTIPLY`, `SCREEN`, and `LINEAR_DODGE` use the directive's straight-alpha formula.
- Source alpha is multiplied by layer opacity once during Full Merge. BAKE CURRENT remains per-layer and its Photoshop opacity remains metadata.
- Hidden layers are excluded; an all-hidden family produces transparent Direct and Canonical targets.
- Direct uses the family working resolution. Canonical uses 4728 x 5760.
- The accumulator retains only two final family outputs and has no permanent per-layer full-resolution targets.
- Full Merge dirty state is family-specific. Source, transform, Vector Mask, opacity, blend, visibility, and order changes dirty it. Selection and view-only changes do not.
- Outside Signage is a preview-only setting and is excluded from Full Merge.
- Full Merge has PNG export only. There is deliberately no `SEND FULL MERGED` Photoshop command.
- Vector Mask controls use the existing Block 8E model and IDs in a movable/collapsible canvas overlay. Panel position and collapse state are session-only.

## Commands

```text
npm run test:block8f
npm run test:static
npm run test:protocol
npm run test:runtime
git diff --check
```

## User validation

User validation completed on 2026-09-12:

- A three-layer stack containing opaque, transparent, and opaque-with-Vector-Mask content completed Full Merge successfully.
- Merged PNG export was visually confirmed.
- The floating Vector Mask panel was confirmed functional.
- The user accepted the Block 8F baseline and authorized Git closeout and push.

## Known issue / deferred UI correction

- The floating Vector Mask panel is larger than desirable and reduces canvas readability.
- Mask behavior is correct; panel sizing and information-density refinement are deferred to a later UI-focused block.
