# Photoshop Snapshot source resolution consent

Status: **IMPLEMENTED / AUTOMATED TECHNICAL PASS / USER PHOTOSHOP PASS**  
Date: 2026-09-14

For `FROM PHOTOSHOP COMPOSITE` and `FROM PHOTOSHOP SELECTION`, UXP reads the actual active Photoshop **document** dimensions before imaging capture. It compares them with the current FRONT75/BACK Direct working resolution (`3000 × 3840` or `2100 × 3840`). A matching document proceeds without a warning. A mismatch returns its document ID, name, actual size, and expected size to SMG, which presents `NO`, `YES`, and `YES FOR THIS SESSION` in a modal dialog.

- `NO` or Escape cancels before pixel capture and adds no layer.
- `YES` retries only the same Photoshop document ID and dimensions. If that document changes, the retry fails instead of silently capturing another document.
- `YES FOR THIS SESSION` also retries that same document and suppresses later mismatch prompts until the SMG renderer session ends. The preference is not persisted in `project.json`.

The session consent flag is intentionally shared by FRONT75 and BACK in the same SMG renderer session; it is not scoped per face.

The warning uses the document dimensions, **not** the cropped Selection capture dimensions. A valid Selection may be smaller than the document; its existing position and source-coordinate behavior are unchanged. No image is resized or repositioned. Photoshop Final Preview's exact-resolution rule, Bake Target binding, and `SEND DIRECT` output-size guards are unchanged. This source-input consent is separate from Block 9B-B's wrong-Bake-Target gate H.

Automated checks: `npm run test:snapshot-resolution-consent`, `npm run test:static`, `npm run test:protocol`, and `npm run test:runtime` PASS. The runtime smoke required an unsandboxed rerun because the sandboxed Electron GPU process could not start. The protocol test verifies broker relay of mismatch details, exact-document approval fields, malformed approval rejection, and no active Snapshot job after the warning. These checks do not exercise the real Photoshop UI.

User-reported real Photoshop PASS (2026-09-14):

1. On both FRONT75 and BACK, the first mismatched import succeeded after `YES`, the second succeeded after `YES FOR THIS SESSION`, and a third proceeded without a prompt. Session consent selected on either face also applied to the other face, matching the session-wide design.
2. `NO` added no layer; the `NO` → `YES` → `NO` sequence behaved normally before session-wide consent. Escape canceled as expected.
3. The warning operated separately for `FROM PHOTOSHOP COMPOSITE` and `FROM PHOTOSHOP SELECTION`.
4. Restarting SMG restored the warning. A document matching the Direct resolution imported without a warning.
5. Changing the active Photoshop document while a mismatch warning was open, then choosing `YES`, stopped the import with `SNAPSHOT_SOURCE_CHANGED`; no replacement document was imported.

Minor UI diagnostic: the reported failure text repeated the `SNAPSHOT_SOURCE_CHANGED` code twice. The safety guard passed; the duplicated label is cosmetic and is not recorded as a validation failure.
