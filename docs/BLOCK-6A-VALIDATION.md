# LUUX Signage Previz — Block 6A Validation

작성일: 2026-09-11
상태: **CLOSED / TECHNICAL PASS / USER VISUAL PASS**

## 범위

Block 6A는 `ANAMORPHIC / FRONT 75F / 75F CALIBRATION`에서만 노출되는 수동
Native Canonical Bake PoC다. 승인된 FRONT 75F camera와
`ANAM_SURFACE_FRONT75F`를 변경하지 않고 다음 round-trip을 검증한다.

~~~text
Synthetic SOURCE 3000×3840 RGBA
→ approved camera projection
→ authored TEXCOORD_0 canonical bake 4728×5760 RGBA
→ production validity mask multiply
→ same surface / same camera reproject 3000×3840
~~~

`luux-mockup/`과 `_TestSource/`는 읽기 전용 참조로 유지했으며 수정하지 않았다.
Photoshop write/import/layer authoring은 수행하지 않는다.

## Production mask

~~~text
Path:        2DAsset/Mask/Mask_Basic_Feather0P025.png
Resolution:  4728×5760
Source:      16-bit RGB/RGBA PNG, R=G=B, opaque alpha
Bytes:       229,192
SHA-256:     4FC06C07073CB0A7CC4FE8DF27274E1605645C6409752E8A221351440870AA22
Black:       3,818,880 pixels
White:       21,847,680 pixels
Gray:        1,566,720 pixels
Non-gray:    0 pixels
Non-opaque:  0 pixels
Interpret:   black=0 / white=1 / gray=linear alpha multiplier
Orientation: top-left canonical
~~~

사용자가 새 mask를 제작할 때의 권장 포맷은 **4728×5760, 16-bit grayscale PNG**다.
RGB/RGBA로 저장할 경우 `R=G=B`, alpha는 완전 불투명이어야 한다. ICC/gamma 기반의
색상 보정 데이터가 아니라 `NoColorSpace` linear scalar로 해석한다. JPEG는 금지한다.
Full-white mask는 production 대체물이 아니라 자동 제어/진단 fallback으로만 둔다.

## Self-visibility와 UV

- Environment depth는 포함하지 않는다.
- 승인된 surface만 hardware depth test에 렌더한다.
- 최전면 surface의 authored UV를 RGBA8 lookup texture로 기록한다.
- Bake pass는 3×3 nearest lookup과 UV tolerance `0.015`로 같은 visible surface 조각만 허용한다.
- 원본 `TEXCOORD_0`은 복제·정규화·clamp·remap하지 않는다.
- `devicePixelRatio`가 offscreen viewport를 확대하지 않도록 bake 동안만 pixel ratio를 1로 두고 원래 값으로 복원한다.
- Bake/Reproject target은 blending을 끄고 straight RGBA를 보존한다.

중심 probe는 GPU UV `[0.5019607843, 0.4980392157]`와 CPU raycast UV
`[0.4999988740, 0.4999991536]`가 허용치 안에서 일치했다.

## 통합 런타임 결과

~~~text
Profile:                       FRONT_75F_NATIVE_CANONICAL_BAKE_POC
Surface:                       ANAM_SURFACE_FRONT75F (exact-name only)
Camera V-FOV / aspect:         19.778° / 0.78125
Canonical valid pixels:        15,485,906
Canonical coverage:            56.863903%
Visible screen pixels:         6,557,725
Compared visible samples:      1,639,445 (stride 2)
Round-trip MAE:                0.323801 (limit 1)
Round-trip RMSE:               2.747904 (limit 5)
Center RGBA delta:             0
35% alpha RGBA delta:          0
Texture counts across 3 runs:  8 / 8 / 8
Context loss:                  0
External network requests:     0
Round-trip metrics gate:       PASS
Block 6A technical gate:       PASS
Overall integrated runtime:    PASS
~~~

Synthetic source는 외곽선, 가로/세로 grid, 네 corner marker, 중심 marker, 비대칭
`TOP 75F →` 표식, 35% alpha shape를 포함한다. SOURCE, CANONICAL BAKE,
REPROJECTED preview는 모두 FIT 표시이며 native target 해상도를 변경하지 않는다.
성공한 bake 결과는 SOURCE 3000×3840, CANONICAL BAKE 4728×5760,
REPROJECTED 3000×3840의 top-left PNG로 개별 저장할 수 있다. PNG encode smoke는
세 파일의 MIME, byte size, native dimension을 확인하며 Photoshop write는 계속 제외한다.

## 자동 검증

~~~text
npm run build:                  PASS
npm run test:block6a:           PASS
npm run test:static:            PASS
npm run test:protocol:          PASS
npm run test:runtime:           PASS
Mask dimension/hash/scalar:     PASS
Camera/profile unchanged:       PASS
Resource reuse 3 runs:          PASS
Full-resolution PNG encode:     PASS
git diff --check:               PASS
~~~

## 사용자 시각 검증 — PASS / CLOSED

- [x] SOURCE 방향/네 corner marker 확인
- [x] CANONICAL BAKE의 top-left 방향과 production mask feather 확인
- [x] REPROJECTED의 중심/비대칭 표식/alpha shape 확인
- [x] FRONT 75F reference framing과 외부 DCC difference 비교
- [x] PoC 종료 후 기존 SITE 3D/2D/Photoshop Link 회귀 확인

사용자는 2026-09-11 외부 DCC 검증 결과의 오차가 대단히 미미할 정도로 낮음을 확인하고
사용자 PASS 및 완료 처리를 승인했다. 승인 근거로 제공된 로컬 difference 이미지는
`2DAsset/Calibration/Result/GPT_Front75F_Difference_.png`이며 3000×3840 RGBA PNG,
601,083 bytes, SHA-256
`41F1F754F9E57DFC7EFE71C263B1797C0A8C9FD11DC6E62E0EAC0B51AB56CF4A`로 확인했다.

커밋된 외부 DCC 검증 묶음은 다음과 같다.

~~~text
SOURCE:       2DAsset/Calibration/GridSource/GridSource_Codex_.png
3ds Max:      2DAsset/Calibration/Result/GPT_Front75F_3dsmax_Render.png
BAKE:         2DAsset/Calibration/Result/GPT_Front75FBake_.png
REPROJECTED:  2DAsset/Calibration/Result/GPT_Front75FBake_Reprojected_.png
DIFFERENCE:   2DAsset/Calibration/Result/GPT_Front75F_Difference_.png
~~~

SOURCE, 3ds Max, REPROJECTED, DIFFERENCE는 3000×3840 RGBA PNG이고 BAKE는
4728×5760 RGBA PNG다. 동일 `Calibration` 폴더의 EXR, Fusion comp, FBX/MB rig,
BACK 및 WorldNormal 산출물은 Block 6A 커밋 범위에 포함하지 않는다.

자동 기술 검증과 사용자 시각 검증이 모두 PASS이므로 Block 6A를 `CLOSED`로 확정한다.
