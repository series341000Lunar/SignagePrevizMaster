# PRODUCTION UI PHASE A — validation

## 현재 판정

**IMPLEMENTED / TECHNICAL PASS / USER PRACTICAL PROBE PENDING.** 아래 자동 검사는 UI 접근과 기존 엔진 회귀의 증거다. 실제 Photoshop 및 사용자의 짧은 제작 흐름 PASS를 대신하지 않는다.

## 실행 증거 (2026-09-15 KST)

- `npm run test:static` — PASS. Build, JS syntax, static validation 포함.
- `npm run test:protocol` — PASS. 기존 Block 4–9, Photoshop Snapshot, Planar-A/B 검증 포함.
- `npm run test:runtime` — PASS, `BLOCK0_TECHNICAL_PASS=true`. [Electron report](../desktop-app/.runtime/dev-runtime.json)의 `productionUi.technicalPass=true`; Production 세 작업공간, 각 드롭다운, 공통 reset, 같은 항목 재선택, Developer 공유 동작, Quick Bake, 단순 이미지 로딩 보존, 종료 후 state 복원을 확인한다. 기존 smoke는 FRONT/BACK, 레이어·transform·opacity/blend·Vector Mask, selected bake, Full Merge, project 모델의 저장/복원 및 그 밖의 폐쇄된 런타임 경로도 실행한다. 실제 Open/Save 파일 대화상자 조작은 사용자 Flow A에 남는다.
- `npm run test:planar-b:runtime` — PASS, `PLANAR_B_TECHNICAL_PASS=true`. [Planar-B report](../desktop-app/.runtime/planar-b-runtime.json)에서 FRONT/BACK Full Merged Direct → Planar 결과 및 비변경 계약을 다시 확인했다.
- [Electron screenshot](../desktop-app/.runtime/dev-runtime.png)에서 Production Shell 기본 표시, PHOTO/SITE 3D/AUTHORING 세 VIEW, SITE VIEW, RESET VIEW, 개발 진단 영역 숨김 및 Photoshop 상태를 확인했다. Screenshot은 시각 배치 참고이며 실제 사용자 조작 PASS는 아니다.
- 별도의 개발 앱 창에서 Production **PHOTO → PHOTO LOCATION**을 실제 클릭해 Front/Front Sweet/Back/Night 옵션을 확인하고 BACK을 선택했다. BACK 사진이 로드된 뒤에도 PHOTO 화면에 남는 것을 확인했다. 테스트용 창은 종료했다. 이는 에이전트 UI 점검이며 사용자 실사용 PASS는 아니다.
- `git diff --check` — PASS. 변경은 UI 표시·카메라 preview 조작·기존 버튼 라우팅과 해당 smoke에 한정된다.

사용자는 2026-09-15 PHOTO 네 장면의 카메라 고정을 실제로 확인하고 정상 동작한다고 보고했다. 이어서 FREE VIEW 높이 보정과 SITE 3D FOV 슬라이더가 의도한 대로 동작한다고 확인했다. 이는 **PHOTO navigation 및 이번 카메라/FOV 보정의 사용자 확인**이다. Phase A 전체 Flow A/B/C의 PASS로 확대하지 않는다.

Electron GPU smoke는 기본 sandbox에서 GPU 프로세스가 시작되지 않아 (`-1073741515`) 승인된 로컬 실행 환경에서 다시 실행해 exit 0으로 통과했다. 그 실패를 제품 Bake/Planar 실패로 해석하지 않는다.

## Production 버튼 확인 범위

새 smoke는 기본 모드에서 Developer Mode와 복귀를 누르고, Production 최상위 VIEW가 **PHOTO → SITE 3D → AUTHORING** 세 개뿐인지 확인한다. AUTHORING에서는 FRONT 75F/BACK과 Quick Bake, SITE 3D에서는 FREE VIEW/FRONT 75F/BACK 및 비활성 CAMERA · FUTURE, PHOTO에서는 Front/Front Sweet/Back/Night를 모두 실제 선택한다. 각 작업공간 유지, 기존 engine 경로와 선택값의 일치, 공통 reset, 같은 항목 재선택 reset, 메뉴를 열기만 했을 때 카메라 비변경, 종료 후 원래 active view·world·mapping·family·preview mode·authoring revision·layer IDs·카메라 복원을 확인한다. Production 출력 버튼은 기존 버튼의 click handler를 호출하므로 별도 Bake/Send 구현이 없다.

2026-09-15 추가 명세 및 실사용 카메라 보정 후 같은 smoke를 다시 실행해 `productionUi.technicalPass=true`를 확인했다. 주요 증거는 `orderedViews`, `authoringRoute`, `backRoute`, `quickMenuAvailable`, `siteMenu`, `siteFront`, `siteBack`, `siteRoute`, `siteFreeBaseline`, `photoMenu`, `photoScenes`, `photoNavigationBlocked`, `simpleImageLoadingPreserved`, reset/재선택 항목 및 `statePreserved`다. `orderedViews`에는 최상위 PS PREVIEW 부재 검사가 포함된다. `siteFreeBaseline`은 FREE VIEW의 위치·FOV·전방 방향이 기존 FRONT SWEET 프로필을 따르고 수평 up을 유지하는지 확인한다. `photoScenes=[true,true,true,true]`는 Production 드롭다운의 Front/Front Sweet/Back/Night를 각각 선택하고 실제 PhotoScene READY까지 기다린 결과다. 네 선택 모두 Legacy Photo 모드를 유지하며 OrbitControls가 비활성이다. `photoNavigationBlocked`는 진단용 Legacy lock을 풀어도 OrbitControls가 활성화되지 않음을 확인한다. Reset 전후 카메라 값과 종료 후 authoring revision·layer IDs·원래 카메라를 대조했다.

FREE VIEW 높이/FOV 보정 후 새 smoke 항목 `siteFovOnly`, `frontFovChanged`, `frontFovReset`, `backFovChanged`, `backFovReset`, `freeFovReadout`, `freeFovChanged`, `siteFovRange`, `freeFovReset`, `photoFovHidden`, `developerFovHidden`이 모두 true다. `siteFreeBaseline`은 FRONT SWEET 원본 x/z·전방 방향·FOV와 **y+0.5**를 확인한다. 슬라이더 값은 풀프레임 가로 36mm 기준으로 수직 FOV와 camera aspect에서 환산하며, 20/400mm 양 끝값과 FOV만 바꿀 때 위치·quaternion·orbit target 유지도 비교했다. [Electron screenshot](../desktop-app/.runtime/dev-runtime.png)은 오른쪽 아래 세로 슬라이더와 Reset FOV 버튼의 배치 참고다. FREE VIEW 높이와 FOV 조작의 실사용 결과는 사용자가 의도대로 동작한다고 확인했다.

2026-09-15 SITE 3D 후속 보정: Production SITE VIEW 및 Developer anamorphic family 표시를 `ANAM_FRONT 75F` / `ANAM_BACK`으로 바꾸고 ID는 유지했다. `npm run test:static`은 PASS다. 새 [Electron report](../desktop-app/.runtime/dev-runtime.json)의 `productionUi.technicalPass=true`와 `siteMenu=true`는 접두어 선택 및 기존 작업공간 전환을 확인한다. `anamorphic75f`와 `anamorphicBack`은 각각 free orbit 시작 위치가 승인 calibration 위치의 y+0.5, target과 FOV는 유지, up은 world Y, 화면 roll은 0이며 canvas aspect 제한이 풀린 것으로 보고한다. RESET 후 calibration quaternion·FOV·aspect 검사는 기존대로 true다. 먼저 실행한 전체 검사는 별도 Electron의 `127.0.0.1:34100` Live Link 포트 점유로 `EADDRINUSE`가 발생했다. 사용자가 그 창을 종료한 뒤 같은 smoke를 재실행해 **`BLOCK0_TECHNICAL_PASS=true`**를 얻었다. 실제 사용자 시점·orbit 화면 확인은 별도다.

이번 SITE VIEW 표시·free orbit 시작점 보정은 **턴 범위 완료 / 기술 검증 PASS**다. 사용자의 턴 종료 요청을 Phase A 전체 제작 흐름의 PASS나 새 카메라 시점의 별도 시각 검수로 해석하지 않는다.

Native `<select>`는 현재 항목을 다시 고를 때 `change`를 내지 않는다. 관련 Production/Developer 드롭다운은 기존 `<select>` 값을 그대로 유지하면서 선택용 메뉴에서 실제 옵션 클릭을 받는다. **열기만 할 때는 카메라를 건드리지 않고**, 현재 옵션을 다시 선택했을 때만 RESET VIEW를 실행한다. 다른 옵션은 기존 `<select>`에 `change`를 전달한다. 키보드 Enter/Space, Escape, 방향키도 메뉴에서 처리한다. 이 과정은 레이어, Bake 결과, 프로젝트 데이터를 바꾸지 않는다.

2026-09-15 후속 UI 보정: Production AUTHORING FRONT/BACK에서 잠금이 풀린 카메라로 왼쪽 orbit 드래그를 시작하면 기존 SITE 3D → FREE VIEW 드롭다운 선택 경로로 전환된다. 5px 미만 움직임의 클릭과 Shift를 누른 pan 입력은 AUTHORING을 유지한다. FRONT/BACK 각각의 자동 전환, FREE VIEW 선택 상태 및 카메라 reset 경로를 Electron `productionUi` Smoke에서 확인했다. Production/Developer 헤더와 창 제목은 `Signage MockUp Generator`, 헤더 아래 표기는 `2026 LUNARGRAPHICS / LEE JUNGHO`로 통일했고 같은 Smoke에서 문자열을 확인했다. 실제 포인터·화면 경험은 별도 사용자 확인이다.

2026-09-16 ANAM_BACK AUTHORING orbit 후속 보정: SOURCE/VIEW 선택은 기존 SITE 3D → FREE VIEW 경로를 그대로 쓰고, 전환 직전 SITE 3D ANAM_BACK의 free-orbit 시작 카메라(뒤쪽 calibration 위치 y+0.5, target/FOV 유지, world Y up, roll 0)를 보존해 전환 직후 복원한다. FRONT AUTHORING의 FRONT SWEET 기반 FREE VIEW 시작값은 유지한다. Electron `productionUi` Smoke는 두 시작 카메라를 수치로 확인한다. 실제 BACK에서 왼쪽 드래그할 때 뒤쪽 구도와 첫 orbit 반응은 사용자 확인 전이다.

## 실제 사용자 확인 — 미완료

Production UI만으로 다음 짧은 흐름을 사용자에게 확인받아야 한다.

1. **Flow A · Delivery:** 실제 FRONT75 또는 BACK 프로젝트 Open → FAMILY 확인 → 레이어 선택·단순 속성 변경 → UPDATE COMPOSITE → BAKE PLANAR → VIEW PLANAR → SAVE PLANAR PNG. 필요하면 두 family를 모두 확인한다. 현재 세션의 자동 회귀는 이 전체 수동 제작 흐름의 PASS가 아니다.
2. **Flow B · Photoshop round-trip:** Photoshop 연결 → ordinary Pixel Layer 또는 Composite를 가져오기 → 위치/속성 수정 → BAKE SELECTED LAYER → 대상 준비 확인 → SEND SELECTED LAYER. Photoshop user Layer Mask는 적용 후 Selection import한다.
3. **Flow C · inspection:** AUTHORING → SITE 3D(FREE VIEW/FRONT 75F/BACK) → PHOTO(네 location 중 하나) → AUTHORING으로 돌아와 레이어와 편집 상태가 유지되는지 확인한다. AUTHORING FRONT/BACK의 왼쪽 orbit 드래그가 SITE FREE VIEW로 전환되는지, BACK에서는 뒤쪽 카메라에서 시작하는지, 클릭과 Shift+왼쪽 pan은 AUTHORING에 머무는지 확인한다. SITE 3D에서는 드래그 후 RESET VIEW와 같은 항목 재선택을 시험한다. PHOTO에서는 드래그·가운데 버튼·휠로 사진 구도가 움직이지 않는지 확인한다. DEVELOPER MODE 없이 완주해야 한다.

사용자에게서 세 흐름의 실제 결과와 불편 사항을 받은 뒤에만 `PRODUCTION UI PHASE A — CLOSED / PRACTICAL SHELL ESTABLISHED`로 갱신한다. 검증 중 발견될 UI 문제는 Phase A 안전성 문제와 후속 Phase B 개선 사항을 구별해 기록한다.

## 남은 UI 관찰점

OUTPUT은 오른쪽 작업 영역 아래쪽에 있어 일반 화면 높이에서 스크롤이 필요하다. 현재는 기존 authoring control을 보존한 Phase A 구조이며, 사용자 Flow A 결과를 보고 Phase B에서 배치를 조정할 수 있다. 실제 Photoshop host round-trip과 저장된 Planar PNG의 사용자 시각 검수는 아직 이 변경에 대해 새로 수행하지 않았다.

Phase A 이후 통합 Preview Source 선택은 PREVIEW-SOURCE-A에서, AUTHORING → Planar 물리 Preview는 PREVIEW-SOURCE-B에서 구현했다. 현재 미구현 후속 설계 항목은 PLANAR SEND TO PHOTOSHOP이다. B의 기술·사용자 PASS와 CLOSED 결과는 [PREVIEW-SOURCE-B-VALIDATION.md](PREVIEW-SOURCE-B-VALIDATION.md)에 기록했다.
