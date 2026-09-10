# LUUX Signage Previz — Block 4B Validation

작성일: 2026-09-10
상태: **IMPLEMENTED / AUTOMATED TECHNICAL PASS / PARTIAL USER PASS / VISUAL CALIBRATION OPEN**

## 구현 계약

```text
File:       LUUX_Signage_Previz_BLOCK-4B_DESIGN_V1_20260910.md
Version:    1.0
Bytes:      15,906
SHA-256:    98CD938DB2AADA782B63D65516BDF85AA9B083E5C70C9C1816E56EF644C458EF
Authority:  DESIGN READY / IMPLEMENTATION GO
```

Block 4A의 네 독립 CameraRecord와 immutable `legacyValues`를 그대로 사용한다.
PhotoScene, Environment, Location, Max Euler/Roll 및 Block 4C 이후 기능은 구현하지 않았다.

## Camera Editor

`SITE 3D → LEGACY 2D WORLD → NORMAL`에서만 Camera Editor를 표시한다.

```text
CAMERA LOCKED
  numeric fields: read-only
  APPLY: disabled
  RESET VIEW: enabled
  RESET TO LEGACY: disabled
  Orbit/Pan/Dolly: disabled
  POINT: 기존 계약대로 독립

CAMERA UNLOCKED
  numeric fields: editable
  APPLY / RESET VIEW / RESET TO LEGACY: enabled
  Orbit/Pan/Dolly: enabled
  POINT: enabled
```

기존 `legacy-camera-lock-button`과 Editor가 동일한 `state.site.legacyCameraLocked`를
사용한다. 중복 lock state를 만들지 않았다. Legacy 진입 및 Scene 변경 시 다시 잠기며,
해당 Scene의 `currentValues`를 Runtime에 복원한다.

## Runtime 상태 모델

```text
legacyValues
  immutable Legacy source baseline

currentValues
  Scene별 독립 editable Camera state
  APPLY와 RESET TO LEGACY만 변경 가능

runtimeCamera
  실제 Three.js Camera
  Orbit/Pan/Dolly로 일시 변경 가능
  Orbit 결과는 currentValues에 자동 저장하지 않음
```

동작 계약:

```text
APPLY
  모든 필드 검증 → candidate 생성 → Runtime 적용/검증 → currentValues commit

RESET VIEW
  currentValues → Runtime
  record 값 변경 없음

RESET TO LEGACY
  unlock 상태에서만 legacyValues clone → currentValues → Runtime
```

invalid input 또는 Runtime 적용 예외가 발생하면 Runtime과 `currentValues`를 이전
snapshot으로 되돌린다. `legacyValues`는 어떤 경로에서도 변경하지 않는다.

## THREE DIRECT

입력:

```text
Position XYZ: THREE WORLD finite values
Rotation XYZ: THREE.Euler XYZ degrees, finite values
FOV:          vertical Three.js degrees, 0 < FOV < 180
```

네 Legacy baseline의 Position/Euler/FOV를 adapter 없이 그대로 적용한다. `target` 또는
`lookAt` 값을 Legacy identity로 추정하지 않는다.

## 3DS MAX-LIKE candidate adapter

지원 입력:

```text
Position XYZ
Target XYZ
FOV value
FOV basis: VERTICAL | HORIZONTAL
```

정방향 후보:

```text
Three.x =  Max.x
Three.y =  Max.z
Three.z = -Max.y
```

역방향 후보:

```text
Max.x =  Three.x
Max.y = -Three.z
Max.z =  Three.y
```

Position과 Target을 같은 basis로 변환하고 `threeTarget - threePosition`으로 Camera
orientation을 만든다. OrbitControls target도 변환된 Target으로 설정한다. 두 점이
같으면 전체 적용을 거부한다.

현재 상태는 `CANDIDATE_USER_CALIBRATION_OPEN`이다. 수학 검증 통과는 실제 3ds Max
Camera와의 현장 calibration을 대체하지 않는다. Max Euler import와 Roll은 Deferred다.

## FOV 변환

Vertical 입력은 직접 사용한다. Horizontal 입력은 aspect `1.5`에서 다음 식을 쓴다.

```text
vertical = 2 * atan(tan(horizontal / 2) / aspect)
```

UI는 degree, 계산은 radian이다. basis가 없는 FOV는 추정하지 않는다. 자동 테스트는
여러 aspect/FOV 왕복과 `horizontal 90° / aspect 1.5 → vertical
67.38013505195957°`를 확인했다.

## 자동 검증 결과

실행 명령:

```powershell
cd C:\_InternalProjects\SignagePrevizMaster\desktop-app
npm run test:block4b
npm run test:static
npm run test:protocol
npm run test:runtime
npm run test:link
```

결과:

```text
Block 0–3 protocol regression:                 PASS
Block 4A extraction/immutability validation:   PASS
4 independent Camera identities:               PASS
THREE DIRECT Legacy exact reproduction:        PASS
Position/Euler/FOV atomic Apply:                PASS
invalid input state preservation:               PASS
synthetic Runtime failure rollback:             PASS
RESET VIEW contract:                            PASS
RESET TO LEGACY contract:                       PASS
LOCKED numeric mutation rejection:              PASS
Scene/View relock guard:                        PASS
LOCKED POINT independence guard:                PASS
Max-like basis forward/inverse round-trip:      PASS
Max-like Position/Target look direction:        PASS
Horizontal/Vertical FOV math:                   PASS
Block 3 GLB fingerprints:                       PASS
GLB root basis conversion absent:               PASS
Electron Camera Editor Runtime smoke:           PASS
Electron hardware/WebGL/full-resolution smoke:  PASS
Synthetic Photoshop Live + 2D/3D/Site POINT:    PASS
External network requests:                      0
WebGL context loss:                             0
```

Runtime smoke의 Camera Editor 결과:

```text
directApplied:          true
directRotationApplied:  true (`Rotation X = 33.5`)
independentCurrent:     true
resetViewExact:         true
resetLegacyApplied:     true
legacyExact:            true
lockedMutationRejected: true
finalLocked:            true
threeFieldsVisible:     true
maxFieldsHidden:        true
```

## 검증 중 수정 사항

THREE DIRECT에서 유효한 `Rotation X = 33.5`가
`Runtime Camera did not accept the complete candidate state.`로 거부되는 문제를
수정했다. 화면 이탈 방지 로직이 아니라 Quaternion 동일성 검증의 `1e-9` 허용오차가
부동소수점 계산에 비해 과도하게 엄격했던 것이 원인이었다.

```text
Position/FOV/aspect epsilon: 1e-9
Quaternion angle epsilon:    1e-7
Runtime input regression:    Rotation X = 33.5
Result:                      directRotationApplied = true
Rollback/other controls:     unchanged
```

Max-like Target에 표시된 `-3.78102186890191` 같은 값도 검토했다. Legacy Euler의
forward 방향에서 임시 Target을 구성한 뒤 Max-like basis로 역변환한 약 15자리 유효
숫자이며 JavaScript `Number` 정밀도 범위 안이다. 데이터는 반올림하지 않고 보존한다.
필요하면 후속 UI에서 표시만 줄일 수 있으나 현재 계산 계약은 변경하지 않았다.

## 사용자 검증 — OPEN

사용자 확인 전 PASS 또는 CLOSED로 표시하지 않는다.

```text
[ ] FRONT RESET TO LEGACY 구도
[ ] FRONT_SWEET RESET TO LEGACY 구도
[ ] BACK RESET TO LEGACY 구도
[ ] NIGHT RESET TO LEGACY 구도
[ ] THREE DIRECT numeric edit의 최종 사용자 재확인
[ ] APPLY 체감 및 Scene별 currentValues 독립성
[x] Camera LOCK/UNLOCK 및 unlock 후 orbiting
[x] Orbit 후 RESET VIEW 복원 체감
[x] RESET TO LEGACY 복원 체감
[x] 3DS MAX-LIKE 입력/적용 기본 동작
[ ] 실제 3ds Max Position/Target/FOV reference로 Max-like 결과 비교
```

사용자는 lock/unlock, orbiting, Camera reset 및 Max-like 기본 동작이 정상임을 확인했다.
실제 Legacy 구도와 3ds Max reference calibration은 별도 Gate로 남는다.

## Deferred / unresolved

```text
Block 4C: PhotoScene Runtime / Photo POINT
Block 4E: Location marker / thumbnail / uiOffset
Max-like: actual 3ds Max calibration reference
Max-like: Euler import / Camera Roll
Environment GLB / lighting
Pseudo Anamorphic / Projection / Bake
Photoshop Snapshot / User Project Save / Drawing / Bezier
```
