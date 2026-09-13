# POST-9B-A Handoff — Alpha Preview Background

**Status: CLOSED / AUTOMATED TECHNICAL PASS / USER VALIDATION PASS**  
Date: 2026-09-13  
Branch at implementation: `main`  
Base HEAD: `fe5e032f806747f3be0b0d6377e588a46f9a0715`

## Delivered

`PREVIEW BACKGROUND` is an accessible slider beside Preview Mode, from black `0.00` to white `1.00` (default `0.50`). It affects only the opaque visual presentation of alpha-bearing content on the SITE 3D anamorphic signage surface. Both AUTHORING and PHOTOSHOP FINAL follow the same gray-over-RGBA display contract; Final remains Photoshop-exclusive and wrong-resolution/absent frames remain blocked. FRONT75 and BACK share one project-global value. No source, Bake, merged PNG, or Photoshop output alpha is flattened.

Project manifest schema is explicitly v4 because the existing v3 validator has strict root keys. The only new canonical field is `preview.backgroundGray`. Opening v1/v2/v3 defaults to `0.5`; opening invalid v4 rejects transactionally. Save/restart/open should restore the exact displayed value. Preview Mode itself remains session-only.

Implementation is isolated to `desktop-app/src/preview-background.js`, `project-persistence.js`, `renderer.js`, `index.html`, `styles.css`, plus test/build wiring. No ProjectionBakeRuntime, Full Merge math, Vector Mask rasterization, Photoshop Snapshot transport, UXP capture, OwnedLayerRegistry, Target Registry, or production alpha path was edited.

## Verification and handoff gate

Build, static, protocol, and Electron GPU runtime tests passed. The Electron report includes a dedicated FRONT/BACK smoke and reports stable texture count `2 → 2`, zero context loss, and unchanged stack, dirty, bake, merge, and registry state. See [Validation](POST-9B-A-PREVIEW-ALPHA-BACKGROUND-VALIDATION.md) for exact commands, boundaries, and manual gates A–H. The sandbox GPU launch failure is excluded from the final result; the unsandboxed run passed.

User validation completed on 2026-09-13, so this POST-9B-A alpha-preview-background follow-up is **CLOSED**. FRONT/BACK SITE 3D gray-background, alpha/feather, opaque-surface, AUTHORING/PHOTOSHOP FINAL separation, output invariance, exact `0.31` Save → Restart → Open, and legacy `0.50` default with layer/mask restoration were checked. The latest FRONT check kept an authoring layer `ON`, then applied its vector mask: AUTHORING was clipped while Photoshop FINAL remained the independent pink Photoshop image. A blank FRONT AUTHORING image before adding an active SMG layer was expected. The [Validation](POST-9B-A-PREVIEW-ALPHA-BACKGROUND-VALIDATION.md) records the user evidence and limits, including the uncontrolled Photoshop ORG-overlap export difference between intermediate and endpoint saves.

The thin-line/AA-like AUTHORING-versus-FINAL difference from Block 9B-A remains a known display-sampling issue, not a blocker here. Block 9B-A remains separately CLOSED / AUTOMATED PASS / USER PASS. Do not mark 9B-B, 9B-C, 9C, future planar bake, or SEND FULL MERGED complete. This closeout changes documentation only: no application code, user project/asset files, or test sources were altered by the closeout, and no Git commit or push was requested or performed.
