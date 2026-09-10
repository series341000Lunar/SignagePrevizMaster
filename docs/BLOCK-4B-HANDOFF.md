# LUUX Signage Previz — Block 4B Handoff

작성일: 2026-09-10
상태: **AUTOMATED TECHNICAL PASS / PARTIAL USER PASS / VISUAL CALIBRATION OPEN**

## Repository 기준선

```text
Repository:                  C:\_InternalProjects\SignagePrevizMaster
Branch:                      main
Block 4A implementation:     b124d7e4a3a459f0e2442d2e753ee0e7591009cc
Block 4B implementation:     working tree; commit pending user validation
Block 0–3:                   CLOSED
Block 4A automated result:   PASS
Block 4A camera visual gate: carried into Block 4B
```

구현 계약은 `LUUX_Signage_Previz_BLOCK-4B_DESIGN_V1_20260910.md`
(15,906 bytes, SHA-256
`98CD938DB2AADA782B63D65516BDF85AA9B083E5C70C9C1816E56EF644C458EF`)이다.

## 변경 파일

```text
desktop-app/src/camera-input-adapter.js
desktop-app/src/site-calibration-profile.js
desktop-app/src/index.html
desktop-app/src/styles.css
desktop-app/src/renderer.js
desktop-app/src/main.cjs
desktop-app/tests/block-4b-validation.mjs
desktop-app/tests/block-4a-validation.mjs
desktop-app/tests/static-validation.mjs
desktop-app/package.json
desktop-app/package-lock.json
desktop-app/README.md
README.md
docs/BLOCK-4B-VALIDATION.md
docs/BLOCK-4B-HANDOFF.md
```

## 구현 요약

- 네 CameraRecord를 실제 Legacy Camera Editor에 연결했다.
- 기존 Camera Lock 상태가 numeric mutation과 OrbitControls를 함께 제어한다.
- `THREE DIRECT`는 Position/Euler XYZ/vertical FOV를 adapter 없이 적용한다.
- `3DS MAX-LIKE`는 Position/Target과 명시적 FOV basis만 받는다.
- APPLY는 candidate 전체를 검증하고 Runtime 성공 후에만 `currentValues`를 commit한다.
- RESET VIEW는 `currentValues`만 Runtime에 다시 적용한다.
- RESET TO LEGACY는 unlock 상태의 명시적 동작으로만 immutable baseline clone을 적용한다.
- Orbit/Pan/Dolly는 `runtimeCamera`만 변경하고 `currentValues`에는 자동 commit하지 않는다.
- Scene 전환과 Legacy 재진입은 해당 Scene `currentValues`를 적용하고 Camera를 잠근다.

## Max-like 계약

```text
Forward: Three = ( Max.x,  Max.z, -Max.y )
Inverse: Max   = ( Three.x, -Three.z, Three.y )

Vertical input:
  threeVerticalFov = inputFov

Horizontal input:
  threeVerticalFov = 2 * atan(tan(horizontalFov / 2) / aspect)
```

이 변환은 Camera input boundary에서만 사용한다. Signage GLB, Legacy GLB,
Environment GLB 또는 Scene root에는 적용하지 않는다. Adapter 상태는 실제 reference
확인 전까지 `CANDIDATE_USER_CALIBRATION_OPEN`이다.

## 자동 검증

```text
npm run test:block4b: PASS
npm run test:protocol: PASS (Block 0–4B)
npm run test:runtime:  PASS
npm run test:link:     PASS
```

Electron Runtime smoke에서 THREE DIRECT Apply, 독립 currentValues, RESET VIEW,
RESET TO LEGACY, locked mutation rejection 및 모드별 UI 표시를 확인했다. Hardware
WebGL2/full-resolution 기준선, synthetic Photoshop Live의 2D/3D/Site POINT 경로와
Block 3 GLB fingerprints도 유지됐다.

사용자 검증 중 `Rotation X = 33.5`가 거부된 원인은 화면 이탈 제한이 아니라
Quaternion angle 비교 허용오차가 과도하게 엄격한 것이었다. 회전 비교 epsilon을
`1e-7`로 조정하고 동일 입력의 Electron Runtime 회귀 검증에서
`directRotationApplied: true`를 확인했다. Max-like Target의 긴 소수 값도 약 15자리
유효 숫자로 안전하며 원본 계산 정밀도를 유지한다.

세부 결과는 [`BLOCK-4B-VALIDATION.md`](BLOCK-4B-VALIDATION.md)에 기록했다.

## 사용자 Gate

```text
OPEN: FRONT / FRONT_SWEET / BACK / NIGHT Legacy baseline 구도
OPEN: 수정된 THREE DIRECT numeric edit의 최종 사용자 재확인
PASS: Camera LOCK/UNLOCK + orbiting
PASS: RESET VIEW / RESET TO LEGACY 체감
PASS: 3DS MAX-LIKE 입력/적용 기본 동작
OPEN: 실제 3ds Max reference 기반 Max-like Camera calibration
```

Camera Editor의 reset 및 Max-like 기본 동작은 사용자 검증 PASS다. 실제 3ds Max
reference와 비교하지 않았으므로 adapter를 `CALIBRATION VERIFIED`로 승격하지 않는다.

## 다음 단계 보호 규칙

- `legacyValues`를 편집값으로 덮어쓰지 않는다.
- 네 Camera identity를 합치지 않는다.
- Legacy Camera를 Max-like adapter에 통과시키지 않는다.
- GLB/Scene root에 basis conversion을 적용하지 않는다.
- Max-like candidate를 사용자 확인 없이 `CALIBRATION VERIFIED`로 승격하지 않는다.
- PhotoScene/Location/Environment/Anamorphic 후속 기능을 Block 4B 결과에 섞지 않는다.
