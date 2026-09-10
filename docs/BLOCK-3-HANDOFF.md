# LUUX Signage Previz — Block 3 Design Handoff

작성일: 2026-09-10
상태: **TECHNICAL PASS / PHOTOSHOP USER PASS / LEGACY CAMERA LOCK USER PASS / CLOSED**

## 기준선

```text
Repository:             C:\_InternalProjects\SignagePrevizMaster
Branch:                 main
Block 2 closing commit: 383fdf016ddf99bc1cb3fcac84cddbffc060c800
Block 3 surface foundation commit: bae8e61fcc5c28377045ccb0372fa90bd828ba2b
Legacy camera lock commit:     306e5c3a0efd822af307f8d0ce9e490ba9613bd4
Block 0–3:              CLOSED
```

이 문서는 Block 3A의 Perspective 3D plane, Block 3B의 Legacy SceneManager 계약
추출, Block 3C의 실제 GLB signage surface 연결 결과를 다음 설계 단계에 인계한다.

## 완료 결과

Standalone Electron viewer에 기존 `2D VIEW`를 유지하면서 다음 두 3D view를
추가했다.

```text
3D PLANE
  GLB 없는 PerspectiveCamera + PlaneGeometry 기술 기준선

SITE 3D
  실제 GLB signage surface
  3D WORLD / LEGACY 2D WORLD 전환
  NORMAL / ANAMORPHIC mode 경계
  실제 surface raycast 기반 Photoshop reverse point link
```

세 view의 활성 material은 동일한 Full-Resolution master texture 객체를 공유한다.
FIT, camera 이동 또는 view 전환은 표시 상태만 바꾸며 원본 texture 해상도를 바꾸지
않는다.

## 최종 3D World 메시 교체

사용자 검증 중 최초 제공된 GLB가 갱신 전 메시였음이 확인되어 같은 경로의 파일을
최종본으로 다시 교체했다. 중간 파일은 8개 메시를 포함한 9,412,132-byte 파일이며
폐기된 기준이다. 특히 기존 `LUUX_Front` 계열에는 불필요한 crop과 뒷면 누락 문제가
있었다.

최종 파일은 필요한 두 메시만 포함하며 crop/뒷면 문제를 수정한 사용자 제공본이다.
향후 설계와 구현은 반드시 아래 지문을 기준으로 한다.

```text
Path:       3DAsset/Signage/Previz_3Dworld_BasicMapping.glb
Bytes:      3,243,084
SHA-256:    5F86D3FFEB1AC5D6D5048DCC1E99525C3038BFACC63A7A07088BDBBF5A3908D3
Generator:  Khronos glTF Blender I/O v5.2.39
Scenes:     1
Nodes:      2
Meshes:     2
Materials:  2
Cameras:    0
Animations: 0
```

최종 node 이름은 정확히 다음 두 개다.

```text
LUUX_Front_3Dworld_Basic
ILMIN_Back_3Dworld_Basic
```

두 메시 모두 ordinary planar `TEXCOORD_0`를 가지며 관찰 범위는 부동소수점
허용오차 안에서 전체 `0..1 × 0..1`이다. 현재 파일에는 다른 node나 Anamorphic
메시가 없다.

## Asset 분리 계약

3D World와 Legacy 2D World는 서로 다른 GLB를 사용한다.

| 용도 | tracked asset | bytes | SHA-256 |
|---|---|---:|---|
| Orbit 가능한 3D World | `3DAsset/Signage/Previz_3Dworld_BasicMapping.glb` | 3,243,084 | `5F86D3FFEB1AC5D6D5048DCC1E99525C3038BFACC63A7A07088BDBBF5A3908D3` |
| 기존 SceneManager와 1:1인 Legacy 2D World | `desktop-app/assets/site/Merged_Full_Format_v2.glb` | 6,169,280 | `125264CC2DF826F5F698330B7A37D5FAE372ED85AD462102DEBCA8B61D97F2C1` |

빌드는 두 source를 검증한 뒤 모두 `desktop-app/build/assets/site/`에 복사한다.
크기 또는 SHA-256이 profile과 다르면 build를 실패시켜 오래된 메시가 조용히
탑재되는 것을 막는다.

## World / Mapping / Scene 계약

### 3D World

```text
NORMAL
  LUUX_Front_3Dworld_Basic
  ILMIN_Back_3Dworld_Basic

ANAMORPHIC
  LUUX_Front_3Dworld_Anamorphic
  ILMIN_Back_3Dworld_Anamorphic
  현재 asset에 없음 → NONE
```

NORMAL은 exact-name selector만 사용한다. 이름이 비슷한 다른 메시가 미래 GLB에
추가되어도 자동으로 포함하지 않는다.

### Legacy 2D World

| UI scene | 현재 ordinary planar mapping mesh | 의미 |
|---|---|---|
| `Front` | `LUUX_Front` | 건물 2층 촬영 시점 |
| `Front_Sweet` | `LUUX_F_Sweet` | 회사 주력 Anamorphic 기준 시점; 현재는 일반 UV |
| `Back` | `LUUX_Back` + `ILMIN_Back` | 원통 뒷면, 광화문에서 남쪽 방향 |
| `Night` | `LUUX_B_Night` + `ILMIN_B_Night` | Back과 같은 방향의 야간 촬영본 |

`Front_Sweet`은 시점 이름이지 현재 Anamorphic mapping 구현이 아니다. Legacy
view별 Anamorphic 메시 이름은 확정되지 않았으므로 추측하지 않는다.

Legacy 2D World의 4개 scene은 camera preset 보존을 위해 진입 시 기본
`CAMERA LOCKED` 상태다. `CAMERA UNLOCKED`로 전환한 경우에만 Orbit/Pan/Dolly가
활성화된다. 다른 view에서 다시 진입하거나 Legacy scene을 변경하면 자동으로 다시
잠긴다. 이 잠금은 camera control만 막으며 POINT raycast는 계속 사용할 수 있다.

## Missing surface 안전 계약

선택한 mode에 필요한 surface set 전체가 없으면 부분 표시나 fallback을 하지 않는다.

```text
visible site meshes: 0
active raycast list: 0
OrbitControls:       disabled
POINT:               disabled
pointer command:     not generated
diagnostics:         missing exact node names / NONE
```

현재 `ANAMORPHIC`은 이 안전 경로를 검증하기 위한 예약 mode다. 왜곡 shader,
homography 또는 inverse anamorphic mapping은 구현하지 않았다.

## Canonical reverse point 계약

3D surface의 클릭은 화면 비율 계산이 아니라 실제 geometry와 UV를 사용한다.

```text
Screen pointer
→ Three.js Raycaster
→ 현재 활성화된 exact signage mesh만 교차 검사
→ intersection.uv / TEXCOORD_0
→ normalizedPointToCanonical()
→ Canonical Signage Coordinate (top-left origin, X right, Y down)
→ existing Block 2 POINTER_SET
→ Photoshop __LUUX_POINTER__ Pixel Layer
```

Photoshop command에는 마지막 live frame의 document ID와 width/height가 포함된다.
UXP가 modal scope에서 active document를 재검증하므로 document를 전환해도 이전
문서를 수정하지 않는다.

Previz marker는 mesh UUID, mesh-local hit point, canonical coordinate, document ID에
묶인다. Orbit/Pan/Dolly 뒤에도 같은 surface 지점을 재투영하고, world/scene/document가
바뀌면 이전 marker를 제거한다.

## 입력 계약

```text
NAVIGATE
  Left drag:   Orbit
  Middle drag: Pan
  Wheel:       Dolly

POINT
  Left click <= 4 px: POINTER_SET
  Left drag  >  4 px: Orbit only / no pointer
  Middle drag:        Pan only / no pointer
  Wheel:              Dolly
```

POINT mode에서도 middle-button pan을 허용한다. middle-button release는 point 처리보다
먼저 종료되므로 pan 동작이 잘못된 POINTER_SET을 만들지 않는다.

## 색상과 texture 계약

- Photoshop UXP는 active document composite를 Photoshop-converted 8-bit sRGB로
  캡처한다.
- Renderer texture는 `THREE.SRGBColorSpace`를 사용한다.
- GLB의 기존 lit material은 Full-Resolution 표시용 unlit `MeshBasicMaterial`로
  교체한다.
- 2D, 3D Plane, Site surface가 한 master texture를 공유한다.
- 중간 canvas, resized bitmap, surface별 `DataTexture` 복제를 만들지 않는다.
- FIT/zoom/filter는 decoded image와 GPU texture dimensions를 변경하지 않는다.

## 검증 결과

```text
Static/security/offline validation: PASS
Protocol/canonical regressions:      PASS
3D World asset bytes/hash:           PASS
Legacy asset bytes/hash:             PASS
Final 3D World GLB parse:            PASS
Final GLB mesh count:                2
NORMAL active surfaces:              2
Inactive surfaces:                   0
Actual geometry raycast + UV:        PASS (both meshes)
Canonical coordinate bounds:         PASS
Marker projection after camera move: PASS
ANAMORPHIC missing detection:        PASS
ANAMORPHIC visible/raycast surfaces: 0
Legacy camera lock static contract:  PASS
Legacy camera lock user checkpoint:  PASS
```

Codex 자동 Electron 실행은 해당 호스트의 GPU subprocess가 renderer 생성 전에
`0xC0000135`로 종료되어 사용할 수 없었다. 이는 build/GLB 계약 실패가 아니다.
사용자는 하드웨어 GPU 환경에서 최종 2-mesh 파일의 표시와 Photoshop 양방향
동작을 직접 확인했다.

## 사용자 PASS

사용자가 다음을 최종 확인했다.

- `SITE 3D / 3D WORLD / NORMAL`에서 최종 두 메시가 정상 표시됨
- Photoshop → Previz Full-Resolution 갱신 정상
- Previz → Photoshop POINT 정상
- 실제 메시 교체 후에도 양방향 링크 정상
- Orbit, middle-button Pan, Dolly 사용성 정상
- Legacy 2D World 4종 camera 기본 잠금, 명시적 해제 및 scene 전환 재잠금 정상
- Camera 잠금 상태에서도 POINT 정상
- document 전환 안전성 유지
- 최종 결과에 이상 없음

## 주요 파일

```text
3DAsset/Signage/Previz_3Dworld_BasicMapping.glb
desktop-app/assets/site/Merged_Full_Format_v2.glb

desktop-app/src/site-scene-profile.js
desktop-app/src/renderer.js
desktop-app/src/canonical-coordinate.js
desktop-app/src/main.cjs
desktop-app/src/index.html
desktop-app/src/styles.css

desktop-app/scripts/build.mjs
desktop-app/scripts/inspect-glb.mjs

desktop-app/tests/plane3d-coordinate-validation.mjs
desktop-app/tests/site-scene-contract-validation.mjs
desktop-app/tests/site-glb-raycast-validation.mjs
desktop-app/tests/static-validation.mjs

docs/BLOCK-3A-PLANE-VALIDATION.md
docs/BLOCK-3B-LEGACY-SCENE-CONTRACT.md
docs/BLOCK-3C-GLB-SURFACE-VALIDATION.md
docs/BLOCK-3-HANDOFF.md
```

## 설계단 고정 전제

- 최종 3D World asset의 파일명, 크기, SHA-256, 두 exact node 이름을 기준선으로
  사용한다.
- 폐기된 8-mesh 중간 GLB나 기존 cropped `LUUX_Front`를 다시 사용하지 않는다.
- 3D World와 Legacy 2D World의 asset 및 selector 경계를 합치지 않는다.
- 현재 모든 surface는 ordinary planar UV mapping이다.
- `Front_Sweet`을 Anamorphic mesh 또는 보정 구현으로 간주하지 않는다.
- Anamorphic geometry/UV가 제공되기 전에는 mode를 `NONE`으로 유지한다.
- POINT는 활성 signage mesh만 raycast하며 배경이나 비활성 mesh를 hit하지 않는다.
- Canonical top-left coordinate, document-staleness 검증, latest-wins queue,
  `__LUUX_POINTER__` helper layer 계약을 유지한다.
- localhost-only link, Electron security baseline, external network 0을 유지한다.
- `luux-mockup/`과 `_TestSource/`는 ignored reference이며 runtime/build/Git에
  포함하지 않는다.

## 다음 설계 단계에서 결정할 사항

- 3D World의 배경/건물/environment 구성과 signage geometry ownership
- 실제 camera preset, bookmark, reset 및 scene 저장 모델
- scene/project 파일 형식과 version migration
- Anamorphic 메시 naming을 현재 예약 이름으로 확정할지 여부
- Anamorphic UV의 forward/inverse 좌표 계약과 Photoshop canonical 관계
- Legacy view별 Anamorphic mesh naming 및 availability model
- 복수 point, anchor, line/Bezier/shape authoring data model
- point marker의 수명, 저장, 협업 및 undo/redo 정책

설계가 확정되기 전에는 현재 검증된 geometry, UV, canonical mapping 또는 양방향
Photoshop link를 추정 기반으로 변경하지 않는다.

## 재현 명령

```powershell
cd C:\_InternalProjects\SignagePrevizMaster\desktop-app
npm install
npm run test:static
npm run test:protocol
npm run dev
```

`npm run dev`의 실제 Photoshop/하드웨어 GPU 검증은 사용자 환경에서 수행한다.
