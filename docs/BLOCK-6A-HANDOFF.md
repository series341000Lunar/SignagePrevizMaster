# LUUX Signage Previz — Block 6A Handoff

작성일: 2026-09-11
상태: **CLOSED / TECHNICAL PASS / USER VISUAL PASS**

## 구현 결과

`SITE 3D / 3D WORLD / ANAMORPHIC / FRONT 75F / 75F CALIBRATION`에서만
`[RUN TEST BAKE]`와 SOURCE / CANONICAL BAKE / REPROJECTED 세 preview가 표시된다.
자동 실행하지 않으며 다른 family, FREE_PREVIEW, NORMAL view에서는 리소스를 dispose한다.
성공한 bake 뒤에는 각 preview 아래 SAVE 버튼이 활성화되며 SOURCE 3000×3840,
CANONICAL BAKE 4728×5760, REPROJECTED 3000×3840 PNG를 시스템 다운로드 폴더에
각각 저장할 수 있다. 저장은 로컬 진단 산출물이며 Photoshop 문서를 변경하지 않는다.

~~~text
Working source:   3000×3840 synthetic native RGBA
Canonical bake:  4728×5760 native RGBA
Reproject:       3000×3840, same surface and approved camera
Surface:         ANAM_SURFACE_FRONT75F exact-name only
UV:              authored TEXCOORD_0 preserved
Mask:            Mask_Basic_Feather0P025.png / production reference
Visibility:      surface-only hardware depth + frontmost authored-UV lookup
Color/alpha:     raw straight RGBA, mask as linear scalar
Photoshop write: excluded
~~~

검증 수치와 mask 계약은 [Block 6A Validation](BLOCK-6A-VALIDATION.md)에 기록했다.

## 사용자 확인 절차

1. `desktop-app`에서 `npm run dev`를 실행한다.
2. `SITE 3D / 3D WORLD / ANAMORPHIC / FRONT 75F / 75F CALIBRATION`을 선택한다.
3. `[RUN TEST BAKE]`를 누른다.
4. SOURCE에서 네 corner color, 중심 magenta, `TOP 75F →`, 35% alpha 원을 확인한다.
5. CANONICAL BAKE가 top-left 방향이고 mask의 black/white/gray feather를 반영하는지 확인한다.
6. REPROJECTED가 SOURCE의 방향, 중심 표식, 비대칭 화살표, alpha를 복원하는지 확인한다.
7. 세 SAVE 버튼으로 native-resolution PNG를 저장해 2D/DCC에서 확대 검증한다.
8. FRONT 75F framing과 camera가 실행 전후 동일한지 확인한다.
9. 다른 view/family로 전환해 PoC UI가 숨고 기존 기능이 유지되는지 확인한다.

## 현재 상태

~~~text
Profile/build/static validation:  PASS
Integrated Electron/WebGL smoke:  PASS
Round-trip quality gate:          PASS
Resource stability:               PASS (8 / 8 / 8)
Context loss:                     0
User visual validation:           PASS
Block 6A closure:                 CLOSED
Block 6B implementation:          NOT STARTED
~~~

사용자는 2026-09-11 외부 DCC difference 이미지에서 오차가 대단히 미미함을 확인하고
사용자 PASS를 승인했다. 자동 기술 검증과 사용자 시각 검증이 모두 PASS이므로 Block 6A는
완료되어 CLOSED다. Block 6B 기능은 앞당겨 구현하지 않았다.
