# LUUX Signage Previz — Block 4C Handoff

작성일: 2026-09-10
상태: **AUTOMATED TECHNICAL PASS / USER PASS / BLOCK 4C CLOSED**

## Repository 기준선

```text
Repository:              C:\_InternalProjects\SignagePrevizMaster
Branch:                  main
Block 4C implementation: 4c0f44239e7c00fbc1928b11925ac7f327caf26d
Block 0–3:               CLOSED / preserved
Block 4A/4B regression:  PASS
```

구현 계약은 `LUUX_Signage_Previz_BLOCK-4C_DESIGN_V1_20260910.md`
(14,514 bytes, SHA-256
`3A3210D82530556DC54BFBB3607AA6B150057A075BFAC11D5B055CBDBE572D8A`)다.

## 변경 파일

```text
desktop-app/src/site-calibration-profile.js
desktop-app/src/photo-scene-runtime.js
desktop-app/src/renderer.js
desktop-app/src/main.cjs
desktop-app/src/index.html
desktop-app/src/styles.css
desktop-app/scripts/build.mjs
desktop-app/tests/block-4a-validation.mjs
desktop-app/tests/block-4c-validation.mjs
desktop-app/tests/static-validation.mjs
desktop-app/package.json
desktop-app/package-lock.json
desktop-app/README.md
README.md
docs/BLOCK-4C-VALIDATION.md
docs/BLOCK-4C-HANDOFF.md
```

## 핵심 Runtime 계약

```text
Photo source:
  2DAsset/Photograph/*.jpg (authoritative)

Generated Runtime copy:
  desktop-app/build/assets/photo/*.jpg
  build-time bytes/hash/dimensions verification required

Visual composition:
  centered 3:2 Photo content viewport
  Photo background pass
  Legacy exact-mesh signage overlay using the one master signage texture
  Previz marker / UI

Photo POINT:
  screen -> content viewport local -> NDC
  -> exact active Legacy mesh raycast
  -> hit.uv
  -> normalizedPointToCanonical
  -> existing POINTER_SET protocol
```

사진은 artwork가 아니며 Photoshop으로 전송·베이크·합성하지 않는다. Scene Camera를
움직여도 사진은 고정된다. 사진 바깥은 raycast 대상이 아니다.

## Scene 계약

```text
FRONT       BG_Front.jpg       photo-reference.front       LUUX_Front
FRONT_SWEET BG_FrontSweet.jpg  photo-reference.front-sweet LUUX_F_Sweet
BACK        BG_Back.jpg        photo-reference.back        LUUX_Back + ILMIN_Back
NIGHT       BG_Night.jpg       photo-reference.night       LUUX_B_Night + ILMIN_B_Night
```

네 Camera의 `currentValues`와 immutable `legacyValues` 계약은 Block 4B와 동일하다.
Camera aspect는 `1.5`다.

## 안정성 계약

- Scene load는 request token 기반 latest-wins다.
- 새 선택 시 이전 photo resource와 stale photo 표시를 제거한다.
- stale load 완료는 commit할 수 없고 즉시 dispose된다.
- load 실패는 stale 사진을 남기지 않으며 Photo status를 `UNAVAILABLE`로 기록한다.
- exact mapping mesh 누락 시 부분 surface fallback 없이 POINT를 막는다.
- 24회 rapid switch 후 active photo resource 1, renderer texture 2를 확인했다.
- Photoshop frame 갱신은 photo URL/load count/Camera state를 변경하지 않았다.

## 자동 검증

```text
npm run test:block4c: PASS
npm run test:static:  PASS
npm run test:protocol: PASS (Block 0–4C)
npm run test:runtime: PASS
npm run test:link:    PASS
```

세부 추출값과 증거는 [`BLOCK-4C-VALIDATION.md`](BLOCK-4C-VALIDATION.md)에 있다.

## 사용자 Gate

```text
PASS: FRONT / FRONT_SWEET / BACK / NIGHT 사진-Overlay 시각 정합
PASS: resize 3:2 표시와 letterbox/pillarbox
PASS: unlock 시 사진 고정 + overlay-only Camera 조작
PASS: 실제 Photoshop Photo POINT 및 사진 바깥 no-hit
PASS: rapid switch 시 stale flash 부재 체감
PASS: 실제 파일 누락/손상 unavailable 표시
OPEN: 기존 Legacy Camera 사진 대비 최종 구도
OPEN: 실제 3ds Max reference calibration
```

사용자 PASS에 따라 Block 4C를 CLOSED로 승격했다. 기존 Legacy Camera의 별도 시각
calibration 및 실제 3ds Max reference Gate는 후속 OPEN 항목이다.

## 다음 단계 보호 규칙

- 배경 사진을 master signage texture와 합치지 않는다.
- 사진을 Photoshop artwork 또는 reverse POINT target으로 사용하지 않는다.
- content viewport 밖의 POINT를 허용하지 않는다.
- Scene 전환에서 stale photo를 재사용하지 않는다.
- CameraRecord identity와 immutable Legacy baseline을 유지한다.
- Block 4D 이후 기능을 이번 구현에 소급해 섞지 않는다.
