# LUUX Signage Previz — Block 2 Design Handoff

작성일: 2026-09-09
상태: **TECHNICAL PASS / DEV USER PASS / PORTABLE USER PASS / CLOSED**

## 기준선

```text
Repository: C:\_InternalProjects\SignagePrevizMaster
Branch: main
Block 1 closing commit / Block 2 start: 1ff0f06633b583e5990085d6eb67b6f81f42e640
```

## 구현 결과

Electron Full-Resolution Viewer에서 Photoshop Live image plane을 클릭하면
Three.js raycast local point를 **Canonical Signage Coordinate**로 변환하고,
기존 localhost broker를 통해 Photoshop UXP로 전달한다. UXP는 active document
ID와 dimensions를 재검증한 뒤 `__LUUX_POINTER__` Pixel Layer에 최대 25×25의
clipped white RGBA patch를 기록하고 실제 적용 좌표를 ACK한다.

Renderer는 `NAVIGATE`와 `POINT` mode를 분리했다. Pointer command는 하나만
in-flight이며 연속 click은 마지막 pending 하나만 유지한다. `CLEAR POINTER`는
reserved helper layer만 제거한다.

입력 충돌을 피하기 위해 POINT mode의 left click만 point command로 사용한다.
POINT mode의 middle-button drag는 pan, wheel 회전은 zoom이며 middle-button pan
release는 point click 처리보다 먼저 종료된다. NAVIGATE의 기존 left drag pan도
유지한다.

클릭 위치는 Previz에도 즉시 고정 화면 크기 target으로 표시된다. ACK 대기는
yellow, Photoshop 적용 성공은 green, 거절은 red이며, Canonical coordinate에서
현재 camera로 역투영되므로 zoom/pan/live frame 교체 후에도 같은 원본 위치를
따라간다. 다른 document frame으로 바뀌면 이전 marker를 제거한다.

## 고정 경계

- Block 1 Full-Resolution RGB 8-bit sRGB capture/send pipeline은 변경하지 않았다.
- broker는 계속 `127.0.0.1:34100`만 bind한다.
- runtime/manifest 조합은 `ws://localhost:34100` / `ws://localhost/`이다.
- Electron security baseline과 external network 0을 유지한다.
- Local source에서는 pointer command를 보내지 않는다.
- 3D scene, building, OrbitControls, photo navigation, drawing, Bezier, shape,
  video/NDI/webcam, `luux-mockup` 통합은 시작하지 않았다.

## 주요 파일

```text
desktop-app/src/canonical-coordinate.js
desktop-app/src/pointer-command-queue.js
desktop-app/src/renderer.js
desktop-app/src/live-link-broker.cjs
desktop-app/src/index.html
desktop-app/src/styles.css

desktop-app/tests/coordinate-validation.mjs
desktop-app/tests/pointer-queue-validation.mjs
desktop-app/tests/pointer-protocol-validation.mjs
desktop-app/tests/static-validation.mjs

photoshop-uxp/luux-live-link/index.js
photoshop-uxp/luux-live-link/index.html

docs/BLOCK-2-POINTER-VALIDATION.md
docs/BLOCK-2-HANDOFF.md
```

## 자동 검증

```text
npm test:          PASS
npm run test:link: PASS
Canonical camera states / points: 5 / 6
Canonical forward assertions:     32 PASS
Marker projection assertions:     30 PASS
Canonical total assertions:       62 PASS
Synthetic pointer requested:      2364,2880
Synthetic pointer applied:        2364,2880
Coordinate error:                 0 px
Previz marker:                    ACKNOWLEDGED / VISIBLE
Pointer protocol safety cases:    PASS
Pointer latest-wins:              PASS
```

## 실제 Photoshop User PASS

사용자가 point 좌표 일치, 단일 transparent helper Pixel Layer, zoom/pan, rapid
latest-wins, clear, artwork selection 복원, Auto Sync ON/OFF, Manual Send를 모두
확인했다. 관찰된 실제 요청/적용 좌표는 `1053,739`, 오차는 `0.000 px`였다.
Document를 바꾼 stale command 시험에서도 이전 document가 수정되지 않았다.
Previz target marker와 POINT-mode middle-button pan도 실제 사용성 USER PASS되었다.

## Portable Build

```text
Path:              desktop-app/dist/LUUX Signage Previz.exe
Bytes:             157368755
Packaged:          true
Hardware GPU:      true
Full-resolution:   PASS
Actions / memory:  PASS
External network:  0
Automated verdict: PASS
Photoshop user:    PASS
```

EXE는 약 150.1 MiB로 GitHub 일반 파일 제한을 초과하며 `dist/`의 재생성 가능한
build artifact이므로 commit하지 않는다. 소스와 재현 가능한 build configuration은
추적 대상으로 유지한다.

## 설계단 고정 전제

- Canonical coordinate는 top-left origin, X right, Y down이다.
- Viewer hit-test는 screen → Three.js raycast → mesh local → canonical 순서다.
- Photoshop command는 반드시 마지막 live frame의 document ID와 dimensions를
  포함하며 UXP가 modal scope 안에서 active document를 재검증한다.
- reserved helper는 단일 Pixel Layer `__LUUX_POINTER__`이며 사용자 artwork와
  selection을 보존한다.
- POINT mode의 left click만 command를 만들고 middle-button drag는 pan이다.
- Previz marker는 화면 피드백일 뿐 Photoshop/texture pixel을 수정하지 않는다.
- one-in-flight + latest pending 정책과 350 ms Auto Sync latest-wins 정책을
  유지한다.
- localhost endpoint, Electron security baseline, external network 0을 유지한다.

## 다음 설계 범위에서 결정할 사항

Block 2는 reverse single-point link의 기술 기준선이다. 다음 단계는 아래 항목을
명시적으로 선택한 뒤 시작한다.

- point를 일회성 helper로 유지할지 anchor/selection model로 확장할지
- 복수 point, line/Bezier/shape 등 authoring data model과 ownership
- 2D canonical point를 향후 3D signage surface에 매핑하는 변환 계약
- Photoshop helper layer의 시각 스타일, 수명, undo/redo 정책
- scene/project 저장 형식과 version migration 경계

아래 항목은 Block 2에 포함되지 않았으며 구현을 시작하지 않았다.

```text
3D scene / building reconstruction / OrbitControls
photo navigation
multi-point drawing / Bezier / shape authoring
video / NDI / webcam
luux-mockup runtime integration
```

## 최종 판정

상세 절차와 결과 기록 위치:
`docs/BLOCK-2-POINTER-VALIDATION.md`

```text
BLOCK 2 TECHNICAL: PASS
BLOCK 2 DEV USER: PASS
BLOCK 2 PORTABLE: PASS
BLOCK 2: CLOSED
READY FOR DESIGN STAGE
```
