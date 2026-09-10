# LUUX Signage Previz — Block 4C Validation

작성일: 2026-09-10
상태: **IMPLEMENTED / AUTOMATED TECHNICAL PASS / USER PASS / BLOCK 4C CLOSED**

## 구현 계약

```text
File:       LUUX_Signage_Previz_BLOCK-4C_DESIGN_V1_20260910.md
Version:    1.0
Bytes:      14,514
SHA-256:    3A3210D82530556DC54BFBB3607AA6B150057A075BFAC11D5B055CBDBE572D8A
Authority:  DESIGN READY / IMPLEMENTATION GO
```

Block 0–3 CLOSED 기준선과 Block 4A/4B의 CameraRecord, Camera Lock, master
signage texture, Canonical Signage Coordinate 및 reverse POINT 계약을 보존했다.
Block 4D 이후 기능은 구현하지 않았다.

## 실제 Camera / Photo 계약

다음 값은 추측하지 않고 Legacy `luux-mockup/index.html`과 프로젝트의 권위 사진
원본에서 추출·검증된 값이다. Camera aspect는 네 Scene 모두 `1.5`, near/far는
`0.1 / 10000`, orientation은 Three.js `Euler XYZ degrees`다.

| Scene | Camera ID | FOV | Position XYZ | Euler XYZ degrees | Photo | Exact Legacy mesh |
|---|---|---:|---|---|---|---|
| FRONT | `photo-reference.front` | 52.4 | `-8.587, 1.4, 12.33` | `16.5, -39.5, 10.3` | `BG_Front.jpg` | `LUUX_Front` |
| FRONT_SWEET | `photo-reference.front-sweet` | 49.2 | `-7.243, -0.031, 12.76` | `22.3, -34.5, 13.1` | `BG_FrontSweet.jpg` | `LUUX_F_Sweet` |
| BACK | `photo-reference.back` | 46.4 | `-9.869, 0.04, -9.425` | `-30.1, -130.95, -24.6` | `BG_Back.jpg` | `LUUX_Back + ILMIN_Back` |
| NIGHT | `photo-reference.night` | 47.9 | `-9.869, 0.04, -9.425` | `-29.3, -132.3, -21.9` | `BG_Night.jpg` | `LUUX_B_Night + ILMIN_B_Night` |

사진 4개는 모두 `8256 × 5504`, aspect `3:2`다.

| Photo | Bytes | SHA-256 |
|---|---:|---|
| `BG_Front.jpg` | 9,703,784 | `99DCAC1769226DAEDE7C4B3421FD7E11D4D82E38B1432E8E9BC520B74F4583EB` |
| `BG_FrontSweet.jpg` | 9,322,540 | `A83BD5024DC5B8FE39DAB2917E291604F1530FCCB486819E821C01F0541AE1A9` |
| `BG_Back.jpg` | 12,331,761 | `4F2DBA196AE5FCBB9D0F45D6A6D7FAB433D7A2C19371D42057A863B7312BB816` |
| `BG_Night.jpg` | 10,072,925 | `B38AE38CEB929743803A61DA8AFA4D864A14ECDA4F3EDEFED11E4C7A04300873` |

## 구현 결과

- `2DAsset/Photograph/*.jpg`만 권위 원본으로 사용한다.
- 빌드가 각 사진의 byte length, SHA-256, JPEG dimensions를 검증하고
  `desktop-app/build/assets/photo/*.jpg`로 바이트 동일 복사한다.
- Runtime URL은 `./assets/photo/*.jpg`이며 절대 사용자 경로와 CDN을 사용하지 않는다.
- 사진은 master signage texture와 분리된 Three.js background pass다.
- 렌더 순서는 photo background → signage overlay → DOM marker/UI다.
- Viewer 안의 가장 큰 중앙 `3:2` rect만 Photo content viewport로 사용한다.
- Legacy Camera aspect는 host 창 비율과 무관하게 `1.5`를 유지한다.
- Camera unlock/orbit/pan/dolly는 overlay만 변경하며 사진은 고정된다.
- POINT는 content rect local NDC → 기존 Raycaster → exact Legacy mesh → `hit.uv`
  → `normalizedPointToCanonical` → 기존 `POINTER_SET` 경로를 사용한다.
- content rect 바깥 입력은 hit 없이 종료한다. 사진 자체는 raycast 대상이 아니다.
- Scene/document 변경 시 기존 marker를 지운다.
- Scene 전환은 명시적 request token을 사용해 latest-wins로 commit하며, 이전 사진
  texture를 dispose한다. load 실패 시 이전 사진을 남기지 않는다.
- mapping mesh가 없으면 사진은 표시 가능하지만 Photo POINT는 사용할 수 없다.
- Photoshop Manual/Auto frame 교체는 signage master texture만 갱신하며 사진 또는
  CameraRecord를 다시 로드하거나 reset하지 않는다.

## 자동 검증 결과

실행 명령:

```powershell
cd C:\_InternalProjects\SignagePrevizMaster\desktop-app
npm run test:block4c
npm run test:static
npm run test:protocol
npm run test:runtime
npm run test:link
```

결과:

```text
Block 0–4B regression:                             PASS
4 photo source bytes/hash/dimensions:              PASS
4 generated build copies byte-identical:           PASS
4 Runtime URL / Camera / exact mesh mappings:      PASS
Centered 3:2 viewport math:                        PASS
Outside-content POINT rejection:                   PASS
Inside-content NDC mapping:                        PASS
Photo background -> signage overlay render order: PASS
FRONT/FRONT_SWEET/BACK/NIGHT Runtime load:         PASS
Rapid Scene latest-wins:                           PASS
24-switch resource stress:                         PASS
Active photo resources after stress:               1
Renderer textures after stress:                    2 (signage 1 + photo 1)
Synthetic photo load failure clears stale photo:  PASS
Photoshop frame update preserves photo/camera:     PASS
Legacy FRONT exact-mesh Photo POINT + ACK:         PASS
Previz marker after Photo POINT:                   ACKNOWLEDGED / VISIBLE
Hardware WebGL2/full-resolution:                   PASS
External network requests:                         0
WebGL context loss:                                0
```

증거 파일은 ignore된 Runtime 산출물이다.

```text
desktop-app/.runtime/dev-runtime.json
desktop-app/.runtime/dev-runtime.png
desktop-app/.runtime/link-runtime.json
desktop-app/.runtime/link-runtime.png
```

## 사용자 검증 — PASS

아래 항목은 자동 검증과 분리해 사용자 확인을 받았다.

```text
[x] FRONT 사진이 표시되고 LUUX_Front overlay가 Legacy 기준과 시각적으로 일치
[x] FRONT_SWEET 사진이 표시되고 LUUX_F_Sweet overlay가 시각적으로 일치
[x] BACK 사진과 LUUX_Back + ILMIN_Back overlay가 시각적으로 일치
[x] NIGHT 사진과 LUUX_B_Night + ILMIN_B_Night overlay가 시각적으로 일치
[x] 창 비율 변경 시 사진이 늘어나지 않고 3:2 letterbox/pillarbox 유지
[x] Camera unlock 후 사진은 고정되고 overlay만 orbit/pan/dolly
[x] 사진 내부 POINT가 의도한 Photoshop 좌표에 기록
[x] 사진 외부 letterbox/pillarbox 클릭은 POINT를 만들지 않음
[x] Scene 빠른 전환 시 이전 사진 flash/stale 표시 없음
[x] 사진 누락/손상 시 stale 사진 제거 및 unavailable 진단 표시
```

Block 4B에서 사용자가 확인한 Camera LOCK/UNLOCK, orbiting, RESET VIEW,
RESET TO LEGACY 및 3DS MAX-LIKE 기본 동작 PASS는 유지한다. 네 Legacy baseline의
실제 사진 대비 최종 구도와 실제 3ds Max reference calibration은 계속 OPEN이다.

## Deferred / unresolved

```text
Block 4D+: design 문서에 정의된 후속 기능
Block 4E: Location marker / thumbnail / uiOffset
Actual 3ds Max reference 기반 Max-like calibration
Max-like Euler import / Camera Roll
Environment GLB / lighting
Anamorphic mesh/mapping
Projection / Bake
Photoshop Snapshot / User Project Save / Drawing / Bezier
```

사용자가 Block 4C를 PASS했다. Block 4C 범위는 CLOSED다. 후속 목록과 Block 4B에서
상속된 실제 3ds Max calibration Gate는 별도 OPEN 상태로 유지한다.
