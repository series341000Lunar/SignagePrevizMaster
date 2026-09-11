# LUUX Signage Previz — Block 6B Validation

작성일: 2026-09-11
상태: **CLOSED / AUTOMATED TECHNICAL PASS / USER VISUAL VALIDATION PASS**

## 범위

Block 6B는 Block 6A의 FRONT 75F Canonical Bake를 공통 projection core로 일반화하고,
검증된 `FRONT 75F`와 `LUUX BACK` family에 다음 네 출력을 제공한다.

~~~text
SOURCE
DIRECT PROJECTED
CANONICAL BAKE
CANONICAL REPROJECTED
~~~

Direct Projected는 canonical texture 또는 reproject 결과를 참조하지 않고, 승인된 family camera로
원본 working source를 surface에 직접 투영한다. Environment와 calibration matte는 출력에서 제외한다.
모든 target은 DPR과 무관한 native 크기, raw straight RGBA, no tone mapping으로 생성된다.

## Family 계약

| Family | Surface | Camera V-FOV / aspect | Source / Direct / Reproject | Canonical | Mask |
|---|---|---:|---:|---:|---|
| FRONT 75F | `ANAM_SURFACE_FRONT75F` | 19.778° / 0.78125 | 3000×3840 | 4728×5760 | `PRODUCTION_REFERENCE_SUPPLIED` |
| LUUX BACK | `ANAM_SURFACE_BACK` | 18.374° / 0.546875 | 2100×3840 | 4728×5760 | `NOT_SUPPLIED`; `FULL_WHITE_DIAGNOSTIC` fallback |

BACK의 full-white는 진단 fallback일 뿐 production mask PASS가 아니다. 실제 BACK mask가 공급되기
전에는 production mask 검증을 주장하지 않는다. FRONT mask의 기존 해상도, SHA-256, linear scalar
계약은 Block 6A와 동일하게 유지한다.

## UV, visibility, quality

- `TEXCOORD_0`을 그대로 사용하며 normalize, clamp, remap 또는 geometry cut을 하지 않는다.
- Direct와 Reproject는 surface-only depth를 사용한다.
- Canonical Bake는 surface self-visibility authored-UV lookup과 family validity mask를 적용한다.
- 비교 지표: Source/Direct, Direct/Canonical Reprojected, Source/Canonical Reprojected의 MAE, RMSE, p95.
- 중심, 네 corner marker, 비대칭 family label, 35% alpha probe를 함께 기록한다.
- FRONT의 Block 6A Source/Reproject gate는 MAE ≤ 1, RMSE ≤ 5로 보존한다.
- 동일 기술 기준을 BACK 진단 reference에도 적용한다.

## 반복 및 전환 검증

자동 smoke는 `FRONT(3) → BACK(8) → FRONT(3)` 순서로 같은 공통 core를 실행한다. family 변경 시
이전 native targets를 dispose하고 새 크기로 재생성하며, 각 family 반복 실행에서 texture count가
안정적인지 확인한다. Context loss, family 결과 혼합, Photoshop write, 외부 network request는 허용하지 않는다.

## 통합 런타임 결과

~~~text
Sequence: FRONT(3) → BACK(8) → FRONT(3)
Family-switch resource disposals: 2
Context loss: 0
Critical errors: 0

FRONT 75F
Canonical valid / coverage: 15,485,906 / 56.863903%
Direct visible pixels:       6,557,725
Source / Direct MAE/RMSE:    0.027005 / 0.796098
Direct / Reproject MAE/RMSE: 0.301106 / 2.634669
Source / Reproject MAE/RMSE: 0.328110 / 2.766451
Source / Reproject p95:      0
Textures across 3 runs:      9 / 9 / 9

LUUX BACK
Canonical valid / coverage: 14,703,702 / 53.991668%
Direct visible pixels:       4,355,082
Source / Direct MAE/RMSE:    0.000068 / 0.008259
Direct / Reproject MAE/RMSE: 0.276601 / 2.601785
Source / Reproject MAE/RMSE: 0.276623 / 2.601947
Source / Reproject p95:      0
Textures across 8 runs:      9 / 9 / 9 / 9 / 9 / 9 / 9 / 9
Mask:                        NOT_SUPPLIED / full-white diagnostic fallback

Overall integrated runtime:  TECHNICAL PASS
~~~

## 사용자 시각 검증 — PASS / CLOSED

- [x] FRONT Direct Projected가 original source의 방향/색/alpha와 일치
- [x] FRONT Canonical Bake/Reproject가 Block 6A 결과를 회귀 없이 보존
- [x] BACK source의 `TOP BACK →`, corner/grid/crosshair/alpha 방향 확인
- [x] BACK Direct Projected와 Canonical Reprojected의 surface 배치 비교
- [x] 네 native PNG를 DCC에서 확대 비교
- [x] FRONT→BACK→FRONT 전환 뒤 camera/surface/result 혼합 없음 확인

사용자는 2026-09-11 외부 DCC difference 비교 결과를 승인했다. 선명도 차이는 있으나 큰 문제가
아니며, **difference는 Canonical 쪽이 더 크고 선명도는 Direct 쪽이 더 높다**고 평가했다.
두 경로를 필요에 따라 별도 버전으로 사용할 수 있으므로 사용자 PASS로 확정한다.

### 외부 DCC 검증 근거

| 파일 | 크기 | Bytes | SHA-256 |
|---|---:|---:|---|
| `2DAsset/Calibration/Result/GPT_6B_Back_Direct_Difference_.png` | 2100×3840 | 1,986,695 | `A23E91495DF4580D1E9BD6F808417A0C85B3D6D301CD036C9AF5EDDB89E28B89` |
| `2DAsset/Calibration/Result/GPT_6B_Back_Canonical_Difference_.png` | 2100×3840 | 1,983,012 | `1CC09A3D47F52DC94008B9F340679F99EAAD0220909C554B7CFA581BE852983F` |
| `2DAsset/Calibration/Result/GPT_6B_Front75F_Canonical_Difference_.png` | 3000×3840 | 2,541,070 | `3C894B948781692937A7EDF51CA6642C95FCE4984B0F35ABB75E541E64AED42B` |
| `2DAsset/Calibration/Result/GPT_6B_Front75F_Direct_Difference_.png` | 3000×3840 | 2,532,892 | `316B16632E989E35AEF0D479554AB8674E9A7C7817D46F21755231C471763639` |

자동 기술 검증과 사용자 시각 검증이 모두 PASS이므로 Block 6B는 `CLOSED`다. BACK production
mask가 `NOT_SUPPLIED`인 계약은 별도 제한으로 유지되며 full-white fallback은 여전히 진단용이다.

## 검증 명령

~~~text
npm run build
npm run test:block6a
npm run test:block6b
npm run test:static
npm run test:protocol
npm run test:runtime
npm run test:link
git diff --check
~~~

현재 `build`, `test:block6a`, `test:block6b`, `test:static`, `test:protocol`,
`test:runtime`, `test:link`, 전체 `npm test`, `git diff --check`는 PASS했다.

`luux-mockup/`과 `_TestSource/`는 수정하지 않는다. Photoshop full-image write와 Block 7 구현은 범위 밖이다.
