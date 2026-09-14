# Block 9B-B Validation — Photoshop Target Quick Create / Register

Status: **CLOSED / AUTOMATED TECHNICAL PASS / USER PHOTOSHOP PASS**

Date: 2026-09-14  
Base HEAD: `ac3924677c0098e431fcfdbfbff97d4ee1f2043b`

## Purpose and contract

The Photoshop UXP panel now offers three explicit `CREATE + REGISTER` actions before the unchanged manual `REGISTER ACTIVE TARGET`: FRONT75 Direct `3000 × 3840`, BACK Direct `2100 × 3840`, and Canonical `4728 × 5760` for the current active Family. Direct is primary; Canonical is secondary. Each click creates only its selected target. Nothing is created at startup or on SMG connection. There is no name/size-based document discovery, automatic binding, fallback, or post-reload reconnect.

The exact registry identities are `ANAMORPHIC_FRONT_75F:DIRECT`, `ANAMORPHIC_BACK:DIRECT`, and current-family `:CANONICAL`. UXP receives only the active Family context (or `null`) from the renderer through the existing broker. The broker accepts that message only from the renderer, and only FRONT75/BACK/null. Canonical is disabled when context is absent and refuses registration if it changes during creation. The explicit Direct cards carry their own Family identity and do not depend on current Family.

The UXP request uses Adobe's `app.documents.add` in `core.executeAsModal`, with exact pixel dimensions, `RGBColorMode`, depth `8`, `fill: 'transparent'`, and profile `sRGB IEC61966-2.1`. Document name is a human label only. Creation may change Photoshop's active document, but it does not edit the pre-existing document. The created document remains open on later failure; it is never silently closed or converted.

The returned document ID is required. UXP re-reads that exact open ID and verifies actual ID, dimensions, RGB, 8-bit depth, sRGB profile, and absence of a Photoshop Background layer before calling the **existing** `BakeTargetRegistry.addTarget`. It then resolves the exact family/output binding and requires READY for that same ID before publishing the existing registry snapshot. A pre-existing READY binding matching the exact output specification blocks creation/replacement. A closed/changed/wrong-size binding shows `TARGET UNAVAILABLE` and allows a new explicit create; the old record remains in the session registry, while the new binding points to the new document. An in-flight action blocks another click; UXP also blocks manual registry edits and Bake/Snapshot initiation during quick creation. Failure displays `CREATE FAILED`, `REGISTRATION REFUSED`, or `REGISTRATION FAILED`, with no success publication; an unregistered new document is left for user manual handling. Existing downstream Direct mismatch validation is unchanged.

The target registry remains UXP-session-only. Project schema remains v4. No target ID, document ID, or reconnect hint enters `project.json`. Source Snapshot identity, OwnedLayerRegistry, preview modes/background, Bake/Full Merge math, mask rasterization, and transport binary jobs are unchanged.

## Automated checks

| Check | Result |
| --- | --- |
| `npm run test:block9bb` | PASS — four exact family/output specs; Direct-first UI; Canonical context; READY duplicate/closed-target handling; create, dimension/depth/profile/background/ID validation, registry failure; double trigger; manual register/no scanner static guards; broker role-checked Family relay |
| `npm run test:static` | PASS — build, UXP syntax, static validation |
| `npm run test:protocol` | PASS — full protocol suite including Block 8D, 8E, 8F, 9A, 9B-A, preview background, 9B-B |
| `npm run test:runtime` | PASS outside sandbox, `BLOCK0_TECHNICAL_PASS=true`. The first sandbox attempt could not start Electron GPU (`GPU process isn't usable`); no user app was terminated. Real Photoshop is not represented by this synthetic Electron gate. |
| `npm test` | PASS outside sandbox: build/static, full protocol suite, and Electron runtime (`BLOCK0_TECHNICAL_PASS=true`). |

Automated checks mock UXP creation and inspect source structure. They do **not** prove Photoshop's actual `documents.add` behavior or a real host `SEND DIRECT` result. Adobe's official [Documents.add](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/classes/documents) documentation states that omitted fill defaults to opaque white and demonstrates `fill: 'transparent'`; [DocumentCreateOptions](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/objects/createoptions/documentcreateoptions) documents depth and profile, and [executeAsModal](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/media/executeasmodal) requires modal state for creation. The user reported real-host PASS for gates A–I on 2026-09-14.

Closeout recheck on 2026-09-14: the first sandboxed `npm test` run could not start the GPU process. An unsandboxed rerun with a real UXP client connected failed at Electron `executeJavaScript` with `Script failed to execute`; the report also recorded a Live frame during the smoke, but causation was not established. After the user unloaded the UXP panel, an isolated unsandboxed full `npm test` passed static, protocol, and runtime checks (`BLOCK0_TECHNICAL_PASS=true`; report `technicalPass: true`, `criticalErrors: []`). `npm run test:block9bb` and `npm run test:snapshot-resolution-consent` also passed separately. These technical results remain distinct from the user-reported Photoshop A–I PASS.

## Real Photoshop validation — USER A–I PASS

The user confirmed gates A and B in conversation on 2026-09-14, including Quick Create/Register, READY, and actual `SEND DIRECT → APPLIED` for both families. The user later reported C–G PASS and supplied screenshots. G was explicitly corrected to **no automatic Bake Target binding**. E's slight Photoshop Live preview pixel offset is a previously known issue; the user did not observe a Bake → Send difference for FRONT75/BACK. The user subsequently confirmed H's wrong-size target block and I's unchanged pre-existing content after `CREATE + REGISTER`, including retained masks, Hue/Saturation adjustment, and selection in the original PSD. The supplied after-creation screenshot shows the separate target READY while the original document's artwork, layer stack, and selection remain visible. These are user-reported real-host results, distinct from automated checks.

| Gate | Action and PASS condition | Result |
| --- | --- | --- |
| A — FRONT75 Direct | Click FRONT75 Direct once. New blank/transparent `3000 × 3840` RGB8 sRGB document and UXP READY. In SMG, FRONT selected layer `BAKE CURRENT` → `SEND DIRECT` → APPLIED. | USER PASS (reported 2026-09-14) |
| B — BACK Direct | Click BACK Direct once. New blank/transparent `2100 × 3840` RGB8 sRGB document and READY. BACK selected layer `BAKE CURRENT` → `SEND DIRECT` → APPLIED. | USER PASS (reported 2026-09-14) |
| C — Canonical | With SMG active Family clearly FRONT75 or BACK, click Canonical. Verify `4728 × 5760` RGB8 and READY for that exact Family; no new Send action is expected. With Family context absent, Canonical must remain disabled. | USER PASS (reported 2026-09-14; screenshot shows FRONT75 Canonical READY) |
| D — Existing READY | Try the same card again while READY. No second document and no binding replacement. | USER PASS (reported 2026-09-14; button disabled in screenshot) |
| E — Manual registration | Open a separately prepared correct document and use unchanged `REGISTER ACTIVE TARGET`; verify READY and normal existing workflow. | USER PASS (reported 2026-09-14 for FRONT75/BACK; known Live preview pixel offset noted separately) |
| F — UXP reload | Reload with created documents still open. No auto rebind; manually register an existing document or explicitly create a new target. | USER PASS (reported 2026-09-14) |
| G — No auto search | Open multiple matching-size/name documents. None binds without explicit manual or quick-create action. | USER PASS (user corrected report to no automatic Bake Target binding on 2026-09-14) |
| H — Wrong target | Manually bind a document whose size does not match the active Family's DIRECT output, then attempt `BAKE CURRENT` → `SEND DIRECT`. The wrong target must not receive pixels. | USER PASS (reported 2026-09-14: wrong-size canvas blocks `SEND DIRECT`) |
| I — Non-destructive | Inspect a pre-existing PSD's layers, visibility, opacity, masks, selection, and pixels before/after Quick Create. The old PSD is unchanged; active document may become the new target. | USER PASS (reported 2026-09-14: manual register → CLEAR → `CREATE + REGISTER` left the pre-existing document unchanged against its duplicate; new target appeared separately and READY). The user additionally confirmed mask, Hue/Saturation adjustment, and selection preservation with a before/after screenshot. |

For H, the renderer disables `SEND DIRECT` unless the resolved registered Direct target is READY and exactly matches the active output resolution; `sendProjectionToPhotoshop` checks the size again before transfer. UXP also checks the target dimensions against the Bake job. The user has now reported wrong-size target blocking as real-host PASS. Earlier mismatched Photoshop **source** screenshots were a separate question: the operations then permitted were `FROM PHOTOSHOP COMPOSITE` and `FROM PHOTOSHOP SELECTION`, not `SEND DIRECT`. That source-document mismatch now has an explicit consent flow; see [Snapshot resolution consent validation](SNAPSHOT-RESOLUTION-CONSENT-VALIDATION.md).

## Deferred

9B-C: Photoshop Pixel Layer + Layer Mask, Smart Object, multi-select flattened Snapshot, Group (low priority). 9C: Source Link, SOURCE CHANGED, REFRESH FROM PHOTOSHOP, conflict and RECONCILE LAYERS. Future mandatory: planar mapping Bake/export/target. Still unsupported: automatic Photoshop target search/reconnect, SEND FULL MERGED, 16/32-bit workflow.

**Later status (2026-09-14):** The deferred list records the 9B-B validation date. [PLANAR-B](PLANAR-B-VALIDATION.md) later closed user-facing Planar PNG delivery. [Block 9B-C1](BLOCK-9B-C1-PROBE.md) later closed Photoshop user Layer Mask visible-result Snapshot **UNSUPPORTED / NON-BLOCKING**, with no further implementation planned. Smart Object and multi-select Flatten are independent conditional candidates; 9B-B user/technical PASS is unchanged.
