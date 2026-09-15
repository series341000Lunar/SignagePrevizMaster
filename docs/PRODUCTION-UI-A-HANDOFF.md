# PRODUCTION UI PHASE A — handoff

## 상태와 기준선

구현 및 기술 검증 완료. **실제 사용자 단축 워크플로 PASS는 아직 받지 않았으므로 CLOSED로 표시하지 않는다.** Phase B는 이 문서의 범위에 포함하지 않는다.

- 작업 시작 기준: `main` / `ceb5055b36fea30982efbc7b386420a7d5c3cda9` (`Document Photoshop Layer Mask probe closure and roadmap corrections`), clean worktree.
- 변경 파일: `desktop-app/src/index.html`, `desktop-app/src/styles.css`, `desktop-app/src/renderer.js`, `desktop-app/src/main.cjs`, `docs/PRODUCTION-UI-A-HANDOFF.md`, `docs/PRODUCTION-UI-A-VALIDATION.md`.
- 기존 문서 수정 사항과 사용자 프로젝트/에셋은 유지했다. Commit/push는 수행하지 않았다.

## UI 구조

일반 시작은 `data-ui-mode="production"`인 Production Shell이다. 헤더의 **DEVELOPER MODE** 버튼으로 기존 개발자 UI에 들어가고 **PRODUCTION UI** 버튼으로 돌아온다. 모드는 세션의 DOM 표시 상태이며 프로젝트에 저장하지 않는다. 두 모드 모두 동일한 renderer, `authoringSession`, 프로젝트 schema v4, Bake runtime, Planar runtime, Photoshop 연결을 사용한다.

Production 상단에는 PROJECT(이름, 저장 상태, Open/Save/Save As), 작업공간에 따라 바뀌는 PHOTO LOCATION/SITE VIEW/FAMILY, VIEW, Photoshop 연결·대상 상태를 둔다. 오른쪽 작업 영역은 AUTHORING에서 기존 LAYERS/PROPERTIES 및 source·transform·opacity·blend·visibility 제어를 재사용하고, MASK와 OUTPUT을 목적별로 구분한다. Project 저장 상태 표시는 마지막 성공한 Save/Open 시점의 authoring revision과 preview gray를 비교하는 **UI 표시값**이다. 별도 저장 형식이나 프로젝트 상태 모델을 만들지 않았다.

2026-09-15 추가 명세에 따라 Production 최상위 VIEW는 정확히 **PHOTO → SITE 3D → AUTHORING** 세 개다. 최상위 PS PREVIEW는 제거했지만 Developer UI의 기존 Photoshop Final Preview 기능과 버튼은 유지한다.

- **PHOTO / PHOTO LOCATION:** 기존 Front, Front Sweet, Back, Night 네 PhotoScene을 제공한다. 선택 후에도 PHOTO/Legacy world에 머문다. 사진 기준 프레이밍을 보호하기 위해 Legacy 4개 장면의 OrbitControls는 Production과 Developer에서 항상 비활성이다. 사진 위 orbit/pan/dolly 입력은 카메라를 이동하지 않는다.
- **SITE 3D / SITE VIEW:** FREE VIEW, ANAM_FRONT 75F, ANAM_BACK을 제공하고 CAMERA · FUTURE는 비활성 안내 항목으로 둔다. 접두어 `ANAM_`은 두 선택이 anamorphic mesh를 사용함을 표시한다. FREE VIEW는 기존 FRONT SWEET 사진 카메라의 위치·FOV·전방 방향을 기본 구도로 사용한다. Euler roll은 0으로 두고 world-up 기준으로 수평을 유지해 free orbit이 뒤틀리지 않게 한다. ANAM_FRONT 75F와 ANAM_BACK은 기존 calibration camera 경로를 사용한다. 이 두 뷰에서 free orbit을 시작하면 해당 calibration 위치보다 y만 0.5 높인 위치와 기존 look-at target/FOV를 유지하며 world-up으로 roll을 제거한다. RESET VIEW는 승인된 calibration 카메라를 복구한다.
- **SITE 3D 캔버스 FOV:** 오른쪽 아래 세로 슬라이더는 35mm 풀프레임 가로 36mm 기준의 20–400mm 환산 초점거리와 현재 수직 FOV를 표시한다. 조작 범위는 넓은 화각을 세밀하게 다루도록 로그 눈금으로 배치했다. 진입 시 현재 카메라 FOV를 환산해 표시하고, `RESET FOV`는 카메라 위치·방향을 유지한 채 FREE VIEW의 FRONT SWEET 기본 FOV 또는 FRONT 75F/BACK 승인 FOV만 복구한다. 이 캔버스 컨트롤은 Production SITE 3D에서만 제공한다. Developer의 기존 수치 FOV 입력은 유지한다.
- **AUTHORING / FAMILY:** FRONT 75F/BACK authoring family를 제공한다. Site view 선택과 Authoring family 선택은 별도의 세션 UI 값이며 프로젝트 schema에는 저장하지 않는다.

캔버스 오른쪽 위 **RESET VIEW**는 PHOTO, SITE 3D, AUTHORING의 현재 장면/프리셋/family 기준 시점으로 되돌린다. 같은 최상위 VIEW를 다시 누르거나 현재 드롭다운 항목을 다시 선택해도 같은 초기화 경로를 사용한다. Developer의 현재 scene/family 재선택과 공통 RESET VIEW도 동일한 동작을 쓴다. 드롭다운을 여는 것만으로는 카메라를 초기화하지 않는다. 기존 캔버스 Quick Bake rail은 Production AUTHORING과 Developer에서 동일하게 표시한다.

PHOTO의 Developer 진단용 Legacy camera editor/lock 상태와 저장된 CameraRecord는 유지한다. 이번 보정은 PHOTO 뷰포트의 마우스 카메라 탐색만 차단하며 Project schema나 사진 CameraRecord 값을 변경하지 않는다. SITE 3D FREE VIEW의 구도는 UI reset 기준값이며 FRONT SWEET PhotoScene 자체의 roll 13.1°를 수정하지 않는다.

사용자 실사용 화면에서 FREE VIEW의 지면 가림이 관찰되어 기준 카메라 높이만 기존 FRONT SWEET `y=-0.031`보다 **0.5 월드 단위** 올렸다. 위치의 x/z, 전방 방향, roll 제거, 기본 FOV는 그대로다. 캔버스 FOV 조정은 현재 카메라의 표시용 렌즈 값이며 프로젝트·Photoshop·Bake 데이터에 저장하지 않는다.

| Production 동작 | 재사용한 기존 경로 |
| --- | --- |
| Open / Save / Save As | `authoring-project-*` 버튼 및 schema v4 persistence |
| PHOTO LOCATION / SITE VIEW / FAMILY / VIEW | 기존 PhotoScene, site world, calibration camera, family select와 preview mode 동작 |
| FROM FILE / FROM PHOTOSHOP COMPOSITE / SELECTION | 기존 authoring source 버튼과 Snapshot 경로 |
| Selected Layer → Photoshop | 기존 `BAKE CURRENT`, `SEND DIRECT`를 분리된 순서로 호출 |
| Full Composite | 기존 `BAKE FULL MERGED`, Direct composite PNG Save |
| Planar Delivery | 기존 `BAKE PLANAR`, `VIEW PLANAR`, `SAVE PLANAR PNG` |
| MASK | 기존 Vector Mask floating panel 및 편집기 |

Full Composite가 없거나 dirty이면 기존 Planar 거절·disabled 조건을 그대로 쓴다. Production의 Planar Delivery는 **Full Merged Direct → Planar Master**이고, 같은 해상도의 Technical Canonical과 동등한 결과로 표시하지 않는다. 자동 다단계 bake 명령은 추가하지 않았다.

Production에서는 BLOCK 번호, PROJECTION POC, 진단 preview/metric, Optional Bake Mask, raw camera/calibration control과 test bake를 주 작업 화면에서 숨겼다. Developer UI에서는 기존 요소와 동작을 보존한다. Photoshop user Layer Mask가 적용된 Pixel Layer Snapshot은 기존 9B-C1 결론대로 지원하지 않으며, 필요하면 Photoshop에서 마스크를 적용한 뒤 Selection을 가져오도록 MASK 도움말에만 짧게 표시한다. 새 mask guard는 없다.

## 변경하지 않은 계약

- Project schema change: **NO** (v4 유지).
- Photoshop protocol change: **NO**.
- Bake algorithm change: **NO**.
- Planar algorithm change: **NO**.
- Transform 좌표, 레이어 순서, opacity/blend/visibility, Vector Mask 의미 변경: **NO**.
- 별도 Production engine/runtime/authoring state: **NO**.

## HIGH PRIORITY NEXT — 현재 미구현

다음 항목은 이번 Phase A 보정에 구현하지 않았다. 다음 설계/구현 턴의 높은 우선순위다.

1. **PLANAR SEND TO PHOTOSHOP**
2. **UNIFIED PREVIEW SOURCE — IMAGE / AUTHORING / PS PREVIEW**
3. **AUTO AUTHORING → PLANAR PHYSICAL PREVIEW**

검증 결과와 사용자 확인 절차는 [PRODUCTION-UI-A-VALIDATION.md](PRODUCTION-UI-A-VALIDATION.md)에 기록했다.

후속 상태 (2026-09-16): 위 목록은 Phase A 종료 당시의 미구현 항목이다. 통합 SOURCE 선택은 PREVIEW-SOURCE-A에서, AUTHORING → Planar 물리 Preview는 PREVIEW-SOURCE-B에서 구현했다. 현재 별도 후속 설계 항목으로 남은 것은 PLANAR SEND TO PHOTOSHOP이다. B의 사용자 확인 범위는 [PREVIEW-SOURCE-B-VALIDATION.md](PREVIEW-SOURCE-B-VALIDATION.md)에 기록했다.
