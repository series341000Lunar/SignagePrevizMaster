# LUUX Signage Previz — Block 6B Handoff

작성일: 2026-09-11
상태: **CLOSED / AUTOMATED TECHNICAL PASS / USER VISUAL VALIDATION PASS**

## 구현 요약

FRONT 75F와 LUUX BACK이 하나의 profile registry와 `ProjectionBakeRuntime`을 사용한다. UI는 현재 family에
따라 title, native working size, camera, mask 상태를 바꾸며 SOURCE / DIRECT PROJECTED / CANONICAL BAKE /
CANONICAL REPROJECTED 네 preview와 네 PNG 저장 버튼을 표시한다. 2열 preview로 확대 가독성을 확보했다.

BACK의 production mask는 공급되지 않았으므로 `NOT_SUPPLIED`를 그대로 노출하고 full-white diagnostic
fallback만 사용한다. 이 fallback은 production readiness나 사용자 PASS를 의미하지 않는다.

## 현재 Git 기준

~~~text
Branch: main
Baseline HEAD: 8463bf1
Implementation commit: THIS BLOCK 6B CLOSEOUT COMMIT (hash reported after commit)
Directive SHA-256: 76EB5D5000D89C8ACB202BEE3E03FA128B2C0BCB643018AEC0275F527EBA3E6A
~~~

## 검증/승인 상태

~~~text
Block 6A FRONT user validation: PASS_CLOSED (preserved)
Block 6B automated validation: TECHNICAL PASS
Block 6B FRONT Direct/Canonical visual: PASS_CLOSED
Block 6B BACK Direct/Canonical visual: PASS_CLOSED
BACK production mask: NOT_SUPPLIED
Photoshop full-image write: NOT IMPLEMENTED / OUT OF SCOPE
~~~

## 사용자 승인 결과

사용자는 FRONT 75F와 BACK의 Direct/Canonical difference PNG 네 장을 외부 DCC에서 비교했다.
Canonical은 차이가 조금 더 크고 선명도는 조금 낮으며, Direct는 더 선명하다고 판단했다.
두 결과 모두 용도별 선택이 가능하고 큰 문제는 없다는 사용자 PASS를 받아 Block 6B를 CLOSED로 확정했다.

## NEXT THREAD ENTRY SNAPSHOT

~~~text
PROJECT:
Signage MockUp Generator / LUUX Signage Previz

CLOSED:
Block 0–4F BASIC CORE
Block 5A FRONT 75F Calibration
Block 5B LUUX BACK Calibration
Block 6A FRONT 75F Projection/Bake PoC
Block 6B result — CLOSED / AUTOMATED TECHNICAL PASS / USER VISUAL PASS

ACTIVE VERIFIED FAMILIES:
FRONT 75F
LUUX BACK

DEFERRED:
ILMIN A-QUBE — external C4D validation required
FRONT 90F — recalibration required
SYNC — future / NOT_SUPPLIED

PROJECTION CORE:
Direct Projected status — SHARED FRONT/BACK CORE / PASS_CLOSED
Canonical Bake status — SHARED FRONT/BACK CORE / PASS_CLOSED
Canonical Reprojected status — SHARED FRONT/BACK CORE / PASS_CLOSED
Mask architecture status — FRONT PRODUCTION SUPPLIED; BACK NOT_SUPPLIED + FULL_WHITE_DIAGNOSTIC

NEXT PLANNED:
Block 7 Photoshop Full-Image Reverse Transport — NOT STARTED

IMPORTANT OPEN CONTRACTS:
Anamorphic Canonical POINT
Project-specific mask load/replace UX
Source Document / Bake Target Document split
~~~
