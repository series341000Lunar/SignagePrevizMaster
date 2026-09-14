# LUUX Signage Previz — BACK V3 왕복 PASS 및 Photoshop 레이어 동기화 후속 설계

Date: 2026-09-13<br>
Status: **BLOCK 9A CLOSED / USER VALIDATED (V1 범위) / BACK V3 사용자 시각 + 62% 불투명도 속성값 PASS / 동기화 후속 기능은 FUTURE DESIGN REQUIREMENT**<br>
Scope: Photoshop 원본 → SMG 레이어/마스크 편집·Bake → 레이어별 Photoshop 전송과 재합성

이 문서는 사용자가 제공한 V3 실사용 결과와 이후 대화에서 결정한 운영 규칙·추가 기능을 한곳에 기록한다. Block 8C/8F의 닫힌 계약이나 [Block 9 Master Design](POST-BLOCK-8F-SNAPSHOT-AUDIT-AND-BLOCK9-DESIGN-V1.md)을 소급 변경하지 않는다. 여기서 **PASS는 사용자 육안 평가**이며, 픽셀 완전 일치·Photoshop 마스크 일반 지원·장기 세션 동기화의 증명은 아니다.

> **2026-09-14 후속 상태:** 이 문서의 F5 Layer Mask 실기 프로브 예정 문구는 작성 당시의 기록이다. [Block 9B-C1 실기 프로브](BLOCK-9B-C1-PROBE.md)에서 Photoshop user Layer Mask는 **CLOSED / UNSUPPORTED / NON-BLOCKING / 추가 구현 계획 없음**으로 결론 났다. 필요한 경우 원본을 보존한 복제본에서 마스크 결과를 일반 Pixel Layer에 적용/병합한 다음 `FROM PHOTOSHOP SELECTION`을 사용한다. Smart Object와 Multi-select Flatten은 별도의 조건부 Future 후보로 남는다.

## 1. 이번 사용자 판정과 증거

사용자는 BACK V3에서 원본과 왕복 결과를 비교하여 **의도된 잘림 영역을 제외하면 유의미한 육안 차이가 없다**고 판정했다. 이번 Photoshop 복귀 경로는 `SEND FULL MERGED`가 아니다. SMG의 레이어를 **하나씩 Bake/Send**하고 Photoshop에서 다시 합성했다. 별도로 `BAKE FULL MERGED`의 Direct PNG도 출력했다. 이 조건으로 **BACK V3 레이어별 왕복 및 합성의 사용자 시각 PASS**를 기록한다.

| 제공 증거 | 역할 | 확인 범위 |
|---|---|---|
| `Back_V3_Original.png` | Photoshop 원본 측 비교 이미지 | 사용자 시각 기준 |
| `Back_V3_SMGtoPhotoshop.png` | 레이어별 SMG → Photoshop 전송 후 합성 | 왕복 결과 |
| `Back_V3_Difference.png` | 위 두 이미지의 차이 확인 | 의도된 잘림을 제외한 시각 비교 |
| `Block8F_BACK_MergedDirect_2100x3840.png` | SMG Full Merged Direct PNG | 별도 병합 출력 |
| `Back_V3_MergedDifference.png` | 병합 출력 측 차이 확인 | 병합 출력의 시각 비교 |

다섯 제공 파일은 모두 `2100×3840` PNG다. 증거 원본은 `C:/Users/user/Desktop/v3/`에 있으며 이 문서는 파일을 복제하거나 변경하지 않는다. 차이 이미지는 잘림에 해당하는 명확한 비검정 영역을 포함한다. 이를 임의의 허용 오차 또는 픽셀 일치 판정으로 바꾸지 않는다. **62% 레이어 불투명도 속성값은 사용자가 별도로 확인하여 PASS를 선언했다.** 그 외 속성값, ACK 로그, 잘림 제외 영역의 수치적 차이율은 별도 기록되지 않았다.

### PASS 경계

- **PASS:** 이번 BACK V3의 레이어별 전송·Photoshop 재합성 결과는, 의도된 잘림을 제외하면 사용자에게 유의미한 육안 차이가 없다.
- **PASS로 확대하지 않음:** `SEND FULL MERGED` 경로. 현재 이 경로는 존재하지 않으며 이번 시험에서도 사용하지 않았다.
- **PASS로 확대하지 않음:** 임의의 Photoshop 레이어 수 변경, LUUX 그룹/레이어 삭제, 플러그인 Reload 이후 연결 복원, Photoshop 원본 가필의 역방향 Refresh.
- **후속 진단·미지원 범위:** 62% 이외 속성의 숫자 단위/ACK 대조, Photoshop 자체 레이어 마스크의 캡처 및 재현, 픽셀 단위 동일성. 반투명·Feather 경계는 이번 실무형 BACK V3에서 사용자 시각 PASS다. 알파 0 아래 숨은 RGB의 비트 단위 보존은 V1 공식 보장 대상이 아니며 비차단 진단으로 유예한다. 62% 속성값의 사용자 확인을 ACK 원시 필드 검증으로 확대하지 않는다.

## 2. 현재 제공되는 동작과 이번 대화에서 정리된 이슈

| 항목 | 현재 상태 / 이번 대화의 결론 |
|---|---|
| 1:1 작업 기준 | FRONT 75F `3000×3840`, BACK `2100×3840` 작업 캔버스에서 기본 `Scale 1.00`은 원본 1픽셀 대 작업 1픽셀이다. Canonical `4728×5760`은 별도 출력 좌표계이며 기본 레이아웃 스케일의 기준이 아니다. `Scale` 입력은 `LAYOUT EDIT` 바로 아래에 있다. |
| Photoshop Selection 위치 | 초기 시험에서 trimmed Selection 여러 개가 중앙에 겹쳤다. `captureBounds -> active Family working canvas -> initial Layer transform center` 복원 수정이 들어갔다. **ACCEPTED / AUTOMATED PASS / PRACTICAL USER WORKFLOW PASS**. 별도의 독립적인 forensic 위치 로그나 모든 배치 조합의 수치 검증을 뜻하지 않는다. |
| Photoshop Selection 불투명도 | 62%가 SMG/Photoshop에서 100%가 된 초기 문제가 있었고 선택 Pixel Layer 불투명도 전달·복귀 수정이 들어갔다. **62% 속성값은 사용자가 재확인하여 검증 완료했다.** 이 확인은 별도의 ACK 원시 로그 검증을 뜻하지 않는다. |
| 단일 레이어 Send 순서 | SMG 전체 순서 `2`를 Photoshop의 첫 전송 레이어 물리 순서 `0`과 직접 비교한 오류가 수정됐다. 이미 전송된 LUUX 레이어 부분집합 안에서만 상대 순서를 압축한다. 이후 BACK 3-layer Stack에서 order 2를 처음 BAKE CURRENT/SEND DIRECT하여 **BACK DIRECT 2100×3840 READY -> Photoshop APPLY COMPLETE Job 1, Layer 11 -> UXP Full-Image Write APPLIED**를 실제 호스트에서 확인했다. 미전송 order 0/1의 빈 레이어는 만들지 않았다. **SPARSE ORDER-2-FIRST SEND / REAL HOST PASS**이며 ACK JSON 전 필드 forensic 증명은 아니다. |
| `BAKE CURRENT` / `SEND DIRECT` | 선택한 **한 레이어**의 Bake/전송 경로다. 같은 연결의 재전송은 기존 Photoshop LUUX 소유 레이어를 갱신하도록 설계돼 있다. |
| `BAKE FULL MERGED` | 현재 family의 보이는 레이어를 Direct/Canonical로 병합하고 PNG로 내보낸다. Photoshop `SEND FULL MERGED`는 현재 없음. |
| Photoshop 일반 레이어 수 | 4개에서 5개 또는 2개로 바뀌는 **개수 자체**는 매칭 키가 아니다. LUUX 소유 레이어/그룹 ID와 세션 기록으로 분리한다. 실제 구조 변경 내성 시험은 아직 없다. |
| `FROM PHOTOSHOP SELECTION` | 현재 선택 Pixel Layer의 **불변 스냅샷을 새 SMG 레이어로 추가**한다. 연결된 기존 SMG 비트맵의 Refresh가 아니다. `REPLACE SOURCE`는 현재 파일을 통한 선택 레이어 소스 교체다. |
| Photoshop 원본 가필 | 원본 Pixel Layer의 그림 변경을 SMG 기존 레이어로 다시 가져오는 버튼과 변경 표시 상태는 아직 없다. |
| SMG → Photoshop 베이크 레이어 | 출력물이며 Photoshop 원본 소스가 아니다. 원본이 삭제된 뒤 다시 보낸 베이크 레이어도 원본-Refresh 대상에 자동 편입하지 않는다. |
| 비파괴성 | 이번 대화에서 Photoshop → SMG → Photoshop 운용의 비파괴성을 사용자 PASS로 보고했다. 향후 양방향 동기화 기능도 원본·비소유 레이어를 자동 수정/삭제하지 않아야 한다. |
| Target resolution/binding 안전성 | Canonical `4728×5760` target을 잘못 등록했을 때 BACK DIRECT 전송이 성공하지 않았다. BACK DIRECT `2100×3840`으로 수정 후 READY → SEND → APPLIED. 실사용 보조 증거이며 별도 핵심 PASS 범위로 확대하지 않는다. |

### Block 9A V1 알파 품질 계약 — 사용자 확정

**필수:** 화면에 보이는 RGB와 partial alpha의 충실도, 반투명/Feather 가장자리, alpha=0의 시각적 투명, 실무 Previz에서 유의미한 halo/fringe 없음. BACK V3의 반투명·Feather 포함 왕복은 이 실용 품질 기준으로 사용자 시각 PASS다. Photoshop Layer opacity 속성값(62% USER PASS)과 baked pixel alpha는 서로 다른 계약이며 Block 8C의 메타데이터/픽셀 구분을 유지한다.

**비보장·비차단:** `RGB != 0, A = 0`인 숨은 RGB의 정확한 보존은 **DIAGNOSTIC ONLY / NON-BLOCKING / DEFERRED**다. 화면 결과에 기여하지 않는 hidden RGB는 실제 graphics pipeline에서 유지가 보장되지 않을 수 있다. 이는 실패를 무시하는 것이 아니라 사용자가 SMG의 제작 목적에 맞춰 확정한 Acceptance Contract다. 극단적인 sub-pixel glow/edge 품질과 최종 mastering은 Fusion / After Effects / Nuke 등 본 제작 compositor의 범위다.

## 3. 권장 운영 규칙 — 현 기능 기준

1. 일반 Photoshop 레이어만 추가·삭제했다면 LUUX 세트의 **수량 맞추기는 필요 없다**. 문서 전체 개수·이름·순서로 연결을 추론하지 않는다.
2. SMG 레이어를 추가했다면 그 레이어만 `BAKE CURRENT → SEND DIRECT`한다.
3. SMG 레이어를 삭제했다면 대응하는 Photoshop의 LUUX 출력 레이어 삭제는 **사용자가 확인하고 수동으로** 수행한다. 현재 자동 삭제·정리는 없다.
4. Photoshop의 LUUX 출력 레이어를 삭제했다면 대응 SMG 레이어를 다시 Bake/Send한다. 다른 누락 레이어까지 자동 재생성하지 않는다.
5. 여러 변경으로 연결이 불명확하면 해당 **LUUX 출력 그룹만** 확인 후 정리하고, Target을 재등록한 다음 SMG의 필요한 레이어를 각각 재전송한다. 사용자 원본 레이어나 비소유 그룹은 정리 대상이 아니다.
6. UXP Reload는 세션 소유권/Target 기록을 초기화한다. 기존 출력물을 이름만으로 자동 재연결하지 않는다. 재등록·재전송 시 중복 그룹 여부를 확인한다.
7. Photoshop **원본 소스**에 가필한 경우, 현재 `FROM PHOTOSHOP SELECTION`을 누르면 기존 소스 갱신이 아니라 새 레이어가 추가된다. 현 버전에서는 이를 자동 동기화로 해석하지 않는다.

## 4. 후속 기능 요구사항 — 구현 전 설계

### F1. 단일/병합 작업 UI의 명확한 분리

- 단일 레이어: `BAKE CURRENT`와 `SEND DIRECT`를 한 흐름으로 명확히 표시한다.
- 전체 합성: `BAKE FULL MERGED`와 `EXPORT MERGED DIRECT/CANONICAL PNG`를 별도 흐름으로 표시한다.
- 병합 완료 상태가 단일 레이어 `SEND DIRECT`를 활성화한다는 오해가 없도록 상태·도움말을 분리한다.
- `SEND FULL MERGED`는 이 요구사항에 포함하지 않는다. 추가하려면 별도 대상·소유권·ACK 계약과 사용자 승인이 필요하다.

### F2. 원본 소스 ↔ SMG 레이어의 정확한 연결

- 연결 대상은 Photoshop의 **원본 Pixel Layer**와 SMG `authoringLayerId` 한 쌍이다. Photoshop 문서의 현재 레이어 수·표시 이름·화면 순서는 식별자가 아니다.
- 원본 식별 정보, 문서 식별/크기·모드, 캡처 버전/내용 지문, SMG 레이어 ID, 마지막 동기화 버전을 함께 관리한다.
- Photoshop 런타임 `layerId`는 세션 밖에서 영구적이라고 가정하지 않는다. PSD 재열기·복제·UXP Reload 후 재연결 규칙을 별도 설계하고, 모호하면 자동 매칭하지 않는다.
- `PHOTOSHOP_SELECTION_SNAPSHOT`의 현재 provenance는 추적 단서이지 **활성 양방향 동기화 권한**이 아니다. 기존 프로젝트를 열었다는 이유만으로 동기화가 활성화되어서는 안 된다.
- LUUX 출력 레이어는 원본 연결 테이블과 분리한다. 출력 레이어 삭제 후 재전송 또는 그룹 재생성은 원본 관계를 만들지 않는다.

### F3. 원본 변경 표시와 명시적 Refresh

SMG 레이어 목록에서 작은 LED/색상과 텍스트를 함께 보여준다. 색만으로 상태를 구분하지 않는다.

| 표시 | 의미 | 허용 동작 |
|---|---|---|
| 녹색 `SYNCED` | 원본 식별 및 마지막 비트맵 버전이 일치 | 필요 시 명시적 재확인 |
| 노란색 `SOURCE CHANGED` | 연결된 원본의 픽셀이 바뀌어 SMG 소스가 오래됨 | `REFRESH FROM PHOTOSHOP` 제안 |
| 빨간색 `LINK BROKEN` | 원본 삭제·문서 불일치·식별 모호·접속 불가 | 자동 교체 금지, 수동 재연결 또는 유지 |
| 회색 `OUTPUT / UNLINKED` | SMG 베이크 출력물 또는 애초에 연결하지 않은 소스 | 원본 Refresh 대상에서 제외 |

- `REFRESH FROM PHOTOSHOP`은 연결된 **원본**을 재확인한 뒤 기존 SMG 레이어의 비트맵을 교체한다. 새 SMG 레이어를 추가하지 않고 `authoringLayerId`, 레이어 순서, SMG 로컬 Vector Mask를 기본적으로 보존한다.
- Photoshop 원본의 위치·불투명도·표시·블렌드가 변했을 때 어느 필드를 가져올지는 사용자에게 차이를 보여주고 선택하게 한다. 비트맵 Refresh가 이 메타데이터를 묵시적으로 덮어쓰지 않는다.
- 양쪽 모두 변경된 경우 충돌 상태를 표시하고 `Photoshop 원본 사용 / SMG 소스 유지 / 취소`를 고르게 한다. 원본 또는 SMG 작업을 자동 덮어쓰지 않는다.
- Refresh 성공 후 해당 SMG 레이어 Bake 및 Full Merged를 dirty로 만들고, 다시 Bake/Send하기 전에는 이전 출력이 최신인 것처럼 표시하지 않는다.

### F4. 수동 `RECONCILE LAYERS`

- SMG 원본 연결·SMG 출력 소유권·Photoshop LUUX 그룹을 별도로 대조하여 `정상 / 원본 변경 / SMG에만 존재 / Photoshop에만 존재 / ID 불명 / 출력 누락`을 보고한다.
- Photoshop **일반 레이어의 4→5 또는 4→2 변화는 오류나 자동 정리 사유가 아니다**.
- 복구는 사용자 확인 후 LUUX 소유 출력만 대상으로 한다. 사용자 원본·일반 레이어의 자동 삭제, 이름 기반 매칭, 원본을 베이크 출력물로 대체하는 처리는 금지한다.
- 부분 재전송과 LUUX 출력 세트 전체 재동기화를 구분하고, 실행 전에 추가/교체/제외 예상 목록을 보여준다.

### F5. Photoshop 마스크/투명도 입력 계약 검증

- 현재 Selection Snapshot은 정확히 한 일반 Pixel Layer를 받으며 Photoshop 자체 레이어 마스크, Group, Smart Object, 임의 다중 선택의 일반 캡처는 공식 보증 범위가 아니다.
- 원본에 Photoshop 마스크가 있는 경우 `픽셀만 / 마스크 적용 외관을 래스터화 / 지원하지 않음` 중 어떤 계약인지 별도 UXP 실기 시험으로 결정한다. 원본 레이어·마스크는 캡처 중 변경하지 않는다.
- 알파 0 아래 비영(非零) RGB는 **비차단 진단**으로, 반투명 가장자리·색 프로파일·premultiplied/straight alpha 세부 동작은 향후 추가 회귀/실기 프로브로 추적한다. 이미 사용자 확인된 62% Layer opacity는 향후 픽셀 알파/메타데이터 중복 적용 방지 회귀 시험에 포함한다. Pixel Layer + Photoshop Layer Mask, Smart Object, Multi-select Flatten Snapshot은 후속 범위이며 Block 9A CLOSED를 다시 열지 않는다.

**F5 후속 판정:** 위 Layer Mask 계약 선택은 [Block 9B-C1](BLOCK-9B-C1-PROBE.md)에서 이미 완료했다. 현재 `getPixels({layerID})` Snapshot은 완전 마스크 구멍을 불투명하게 반환하고 Feather 20 px의 부분 알파를 반환하지 않는다. 이 사례는 **CLOSED / UNSUPPORTED / NON-BLOCKING**, Mask Guard와 수동 합성 구현 계획 없음이다. Smart Object와 Multi-select Flatten Snapshot의 별도 탐색은 이 결론으로 닫히지 않는다.

## 5. 완료된 판정과 후속 진단·기능 검증

| 게이트 | 합격 기준 | 현재 판정 |
|---|---|
| BACK V3 시각 왕복 | 의도된 잘림 제외, 레이어별 Send 후 Photoshop 합성에서 유의미한 육안 차이 없음 | **USER PASS** |
| 62% 불투명도 속성값 | 수정 후 62%가 유지되는지 사용자 확인 | **USER PASS** |
| Selection 위치 복원 | `captureBounds`에서 작업 캔버스 중심 변환; 자동 검증과 실제 V3 합성 | **ACCEPTED / AUTOMATED PASS / PRACTICAL USER WORKFLOW PASS**; 독립 forensic 위치 로그는 없음 |
| Sparse order-2-first 전송 | 빈 Photoshop 출력 binding에 SMG order 2를 첫 전송해 호스트 Apply 성공 | **REAL HOST PASS**; raw ACK 필드별 dump는 없음 |
| 반투명·Feather 가시 품질 | practical Previz 결과에 유의미한 halo/fringe 없음 | **BACK V3 USER VISUAL PASS** |
| 알파 0 아래 hidden RGB 비트 보존 | V1 Photoshop 호스트 공식 보장 대상 아님 | **DIAGNOSTIC ONLY / NON-BLOCKING / DEFERRED** |
| 나머지 레이어 속성·ACK 대조 | 세 레이어의 ID, 상대 순서, 위치, 나머지 opacity, blend, visibility와 ACK를 기록 | 추가 증거 필요 |
| 수치적 이미지 비교 | 동일한 2100×3840 이미지에서 의도된 잘림 영역을 명시적으로 제외하고 오차 지표·차이 이미지를 보존 | 미수행; 이번 PASS의 전제 아님 |
| 구조 변경 내성 | 일반 레이어 추가·삭제, LUUX 출력 레이어 하나 삭제 후 재전송, LUUX 그룹 삭제 후 재전송, UXP Reload 사례 | 미시험 |
| 원본 Refresh | 원본 가필 후 노란색 표시 → 기존 SMG 비트맵만 갱신 → 재베이크; 출력물은 원본으로 오인하지 않음 | 미구현 |
| Photoshop user Layer Mask | [Block 9B-C1 실기 프로브](BLOCK-9B-C1-PROBE.md) 완료; 유효한 mask alpha/feather가 Snapshot PNG에 없음 | **CLOSED / UNSUPPORTED / NON-BLOCKING; 추가 구현 계획 없음** |
| Smart Object | 별도 실기 프로브/계약 결정, 수요에 따라 | **CONDITIONAL FUTURE / NOT BLOCK 9A** |
| Multi-select Flatten Snapshot | 별도 실기 프로브/계약 결정, 수요에 따라 | **CONDITIONAL FUTURE / NOT BLOCK 9A** |

Block 9A는 **명시적인 사용자 승인으로 CLOSED / USER VALIDATED**다. 위 F1 작업 UI 분리, F2 Source Link, F3 Source Changed/Refresh, F4 Reconcile Layers, F5 추가 Photoshop Mask 프로브는 **FUTURE / DESIGN REQUIREMENT**이며 구현 완료를 주장하지 않고 Block 9A를 다시 열지 않는다. 다음 단계는 별도 지시문으로 정할 **Block 9B — Photoshop Snapshot Workflow / Preview Separation**이다. Planar Mapping Bake는 **FUTURE / MANDATORY**이며 Block 9B 자체가 아니다. 완료 상태의 최신 권위는 [Block 9A Handoff](BLOCK-9A-HANDOFF.md), 상세 근거는 [Block 9A Validation](BLOCK-9A-VALIDATION.md)에 있다.

**Post-completion update (2026-09-14):** 직전 문단은 2026-09-13 당시의 roadmap이다. [Block 9B-A](BLOCK-9B-A-HANDOFF.md), [9B-B](BLOCK-9B-B-HANDOFF.md), [PLANAR-B](PLANAR-B-HANDOFF.md)가 이후 닫혔다. F1 작업 UI 분리의 당시 범위와 새 **Production UI Phase A**는 동일한 완료 판정이 아니며, 다음 우선순위는 Production UI다. F2/F3의 Source Link·명시적 Refresh는 P2 개선 후보이며, `SOURCE CHANGED`/`LINK BROKEN`은 신뢰 가능한 원본 identity가 정의된 뒤에만 추진한다. Photoshop user Layer Mask는 더 이상 F5 Future 항목이 아니다. [현재 우선순위와 HOLD/NO-GO](POST-COMPLETION-DOCUMENT-CORRECTION-VALIDATION.md)를 참조한다.
