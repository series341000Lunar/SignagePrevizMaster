# LUUX Signage Previz — Multi Bake Target Handoff

Date: 2026-09-12

Baseline HEAD: `36e66d238fae77cc402f17a4dd41623131d229c9`

Status: **AUTOMATED TECHNICAL PASS / USER VALIDATION PASS / CLOSED**

## 결과

Photoshop UXP에 N-target `BakeTargetRegistry`를 추가했고, Renderer의 현재
family/output은 명시적인 binding을 통해 정확히 한 Target으로 resolve된다.
Target이 여러 개 등록되어 있어도 전송 엔진은 기존 Block 7의 한 active job만
사용하며 동시 write나 broadcast를 하지 않는다.

구현 및 자동 검증 상세는
[Multi Bake Target Validation](POST-BLOCK-7-MULTI-BAKE-TARGET-VALIDATION.md)에
기록했다.

## 작업 파일

- `photoshop-uxp/luux-live-link/bake-target-registry.js`
- `photoshop-uxp/luux-live-link/index.js`
- `photoshop-uxp/luux-live-link/index.html`
- `photoshop-uxp/luux-live-link/styles.css`
- `desktop-app/src/live-link-broker.cjs`
- `desktop-app/src/renderer.js`
- `desktop-app/src/index.html`
- `desktop-app/tests/multi-bake-target-validation.mjs`
- `desktop-app/tests/block-7-validation.mjs`
- `desktop-app/package.json`

기존 Block 7 및 Visibility Correction 문서는 소급 수정하지 않았다.
`ProjectionBakeRuntime`, Dedicated Matte, calibration, surface binding, planar mask도
변경하지 않았다.

## 운영 절차

UXP 코드가 바뀌었으므로 Photoshop에서 LUUX Live Link plugin을 먼저 reload한다.

1. Front PSD를 활성화한다.
2. UXP의 `BAKE TARGETS`에서 family `FRONT 75F`, output `DIRECT`를 선택하고
   `+ REGISTER ACTIVE TARGET`을 누른다.
3. Back PSD를 활성화한다.
4. family `BACK`, output `DIRECT`로 두 번째 Target을 등록한다.
5. Previz `OUTPUT TO PHOTOSHOP`에서 각 output 옆 Destination, dimensions,
   status가 예상 PSD와 `READY`인지 확인한다.
6. FRONT → BACK → FRONT 순서로 Send한다.

등록 후 다른 Photoshop 탭을 활성화해도 Target은 자동으로 바뀌지 않는다.
Target 문서를 교체하려면 해당 카드의 `SET ACTIVE DOCUMENT`를 명시적으로
사용한다. 문서가 닫히거나 규격이 바뀌면 그 Target만 INVALID가 되고 write는
거부된다.

## 현재 상태

MULTI BAKE TARGET EXTENSION STATUS:

Branch: `main`

Baseline HEAD before extension delivery: `36e66d238fae77cc402f17a4dd41623131d229c9`

Working tree: extension implementation/documentation modified; user-owned untracked
Mask PNG files excluded

Registry implementation: generalized `Map` registry + independent binding map

Registry authority: `UXP`

Session scope: `SESSION`; no persistence/name reconnect

Registered target capacity: `N`

Binding key: `familyId:outputKind`

familyId: `ANAMORPHIC_FRONT_75F`, `ANAMORPHIC_BACK`, future IDs allowed

outputKind: `DIRECT`, `CANONICAL`

FRONT75 DIRECT target: supported, expected 3000 × 3840 RGB8, USER VALIDATED

BACK DIRECT target: supported, expected 2100 × 3840 RGB8, USER VALIDATED

FRONT75 CANONICAL target: optional, 4728 × 5760 RGB8, unbound until registered

BACK CANONICAL target: optional, 4728 × 5760 RGB8, unbound until registered

Active Document behavior: explicit registration input only

Target replacement: explicit per-target `SET ACTIVE DOCUMENT`

Closed-target behavior: only that target becomes invalid; no automatic reconnect

One-job policy: preserved, one bounded full-image transfer at a time

Broadcast: none

Parallel writes: none

Target validation: target/session/binding/document identity checked before apply

Dimension validation: exact match, mismatch refused

Mode/depth validation: RGB8 exact, no conversion

Layer ownership: preserved per Target Document + family/output

Active-document restore: preserved

Auto Sync suppression: preserved and restored after apply

Block 7 transport regression: PASS

Visibility correction regression: PASS

Automated tests: PASS

Real Photoshop tests: USER VALIDATION PASS

USER VALIDATION: **PASS**

사용자 승인에 따라 Multi Bake Target extension은 **CLOSED**다. 이후 Block 8 작업은
별도 지시문과 범위에서 진행한다.
