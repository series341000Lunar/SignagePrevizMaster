# LUUX Signage Previz — Block 4A Validation

작성일: 2026-09-10
상태: **IMPLEMENTED / AUTOMATED TECHNICAL PASS / USER VISUAL VALIDATION REQUIRED**

## 범위

Block 4A는 ignored read-only reference인 `luux-mockup/index.html`의 Camera 및
PhotoScene 계약을 실제 코드 경로에서 추출하여 app-owned calibration profile로
구조화했다. Block 3 runtime UI, geometry, UV, canonical mapping, Photoshop protocol은
변경하지 않았다.

구현 계약:

```text
File:       LUUX_Signage_Previz_BLOCK-4A_DESIGN_V1_1_20260910.md
Version:    1.1
Bytes:      22,249
SHA-256:    BC37DA892A66448AD2F8F8043BA3ADFCE2B0DAB54AE74BAC668D05548596C5BA
Authority:  DESIGN APPROVED
```

구현 파일:

```text
desktop-app/src/site-calibration-profile.js
desktop-app/tests/block-4a-validation.mjs
```

검증 명령:

```powershell
cd C:\_InternalProjects\SignagePrevizMaster\desktop-app
node tests/block-4a-validation.mjs
npm run test:static
npm run test:protocol
```

## Legacy source provenance

```text
Path:     luux-mockup/index.html
Bytes:    97,343
SHA-256:  D25D1E264F4F46F13FB8A40B15B0DEF56AE4D0280D3C4BC6578DD267C4000269
```

직접 조사한 코드 경로:

| 내용 | Legacy source lines |
|---|---:|
| `PerspectiveCamera` 생성 | 751 |
| 네 Scene camera 선언 | 763–797 |
| zoom / lens shift 초기 상태 | 858–860 |
| FOV zoom / lens shift 적용 | 950–980 |
| Scene별 position/Euler 적용 | 1104–1123 |
| 사진 경로 선언 | 731–738 |
| 사진 로드 및 natural size 관찰 | 1147–1166 |

Legacy는 target, `lookAt`, `OrbitControls`를 사용하지 않는다. Scene 전환 시
`camera.position.set(...)`과 `camera.rotation.set(...)`에 Euler XYZ degree를 radian으로
변환하여 직접 적용한다.

## 실제 Camera 추출값

공통값:

```text
type:             PerspectiveCamera
coordinateSpace:  THREE_WORLD
aspect:           1.5
near / far:       0.1 / 10000
target:           none
orientation:      direct THREE.Euler XYZ
fovBasis:         VERTICAL_THREE
zoom:             1.0 (camera.zoom이 아닌 FOV_SCALE 초기값)
lensShiftX/Y:     0 / 0 (VIEW_OFFSET model)
```

`fovBasis`는 설치된 Three.js `PerspectiveCamera.js`가 `fov`를 vertical field of view로
정의하는 실제 로컬 소스와 대조했다.

| Scene identity | Legacy key | FOV | Position XYZ | Euler XYZ degrees |
|---|---|---:|---|---|
| `FRONT` | `front` | 52.4 | `[-8.587, 1.4, 12.33]` | `[16.5, -39.5, 10.3]` |
| `FRONT_SWEET` | `frontSweetSpot` | 49.2 | `[-7.243, -0.031, 12.76]` | `[22.3, -34.5, 13.1]` |
| `BACK` | `back` | 46.4 | `[-9.869, 0.04, -9.425]` | `[-30.1, -130.95, -24.6]` |
| `NIGHT` | `backNight` | 47.9 | `[-9.869, 0.04, -9.425]` | `[-29.3, -132.3, -21.9]` |

Back과 Night의 position이 같아도 별도 `CameraRecord`로 유지한다. 모든 record의
`legacyValues`는 deep-frozen reset baseline이며, `createEditableCameraRecords()`는
서로 참조를 공유하지 않는 `currentValues`를 만든다. 자동 검증은 한 Scene 변경이
다른 Scene 또는 `legacyValues`를 바꾸지 않는 것과 `resetCameraRecordToLegacy()` 복원을
확인한다.

각 CameraRecord에는 동일 수치와 별개인 다음 interaction 정책을 명시했다.

```text
defaultLocked:                true
relockOnLegacyEntry:          true
relockOnSceneChange:          true
pointAllowedWhenLocked:       true
cameraMutationRequiresUnlock: true
```

Block 4A 검증기는 실제 Block 3 renderer에서 lock button 기본값, Legacy 진입 및
scene 변경 재잠금, unlock 전 OrbitControls 차단, POINT availability가
`controlsSite.enabled`에 의존하지 않는 것을 확인한다.

## 실제 PhotoScene 추출값

네 Legacy 사진과 `2DAsset/Photograph` 파일은 각 Scene별 SHA-256이 같아 byte-identical
copy임을 확인했다. 모두 실제 JPEG header 기준 `8256×5504`, aspect `1.5 (3:2)`다.

| Scene | Legacy path | Project path | Bytes | SHA-256 |
|---|---|---|---:|---|
| `FRONT` | `./assets/bg_front.jpg` | `2DAsset/Photograph/BG_Front.jpg` | 9,703,784 | `99DCAC1769226DAEDE7C4B3421FD7E11D4D82E38B1432E8E9BC520B74F4583EB` |
| `FRONT_SWEET` | `./assets/bg_sweet.jpg` | `2DAsset/Photograph/BG_FrontSweet.jpg` | 9,322,540 | `A83BD5024DC5B8FE39DAB2917E291604F1530FCCB486819E821C01F0541AE1A9` |
| `BACK` | `./assets/bg_back.jpg` | `2DAsset/Photograph/BG_Back.jpg` | 12,331,761 | `4F2DBA196AE5FCBB9D0F45D6A6D7FAB433D7A2C19371D42057A863B7312BB816` |
| `NIGHT` | `./assets/bg_night.jpg` | `2DAsset/Photograph/BG_Night.jpg` | 10,072,925 | `B38AE38CEB929743803A61DA8AFA4D864A14ECDA4F3EDEFED11E4C7A04300873` |

현재 standalone build의 실제 PhotoScene URL은 아직 존재하지 않으므로
`runtimeUrl: null`, `runtimeUrlStatus: UNRESOLVED`로 기록했다. 사진을 build asset으로
임의 복사하거나 임시 URL을 만들지 않았다.

## Mapping 및 Location contract

| Scene | exact Legacy mapping meshes |
|---|---|
| `FRONT` | `LUUX_Front` |
| `FRONT_SWEET` | `LUUX_F_Sweet` |
| `BACK` | `LUUX_Back`, `ILMIN_Back` |
| `NIGHT` | `LUUX_B_Night`, `ILMIN_B_Night` |

Design V1.1에 따라 `LUUX_F_Sweet`은 **Legacy Anamorphic Mesh**로 분류한다. 그러나
`Front_Sweet` Photo Camera는 Pseudo Anamorphic Camera 또는 실제 bake camera와
동일 identity가 아니다.

네 `PhotoSceneRecord`는 서로 다른 `cameraId`와 `locationId`를 갖는다. 네
`LocationRecord`도 독립적으로 생성했지만 실제 marker 위치 근거가 없으므로 다음은
추측하지 않았다.

```text
worldPosition:   null
thumbnailAsset:  null
uiOffset:        null
enabled:         false
resolutionStatus: UNRESOLVED
```

## Block 3 regression guard

전용 검증기는 Block 3 asset을 다시 읽어 다음 기준선을 확인한다.

| Asset | Bytes | SHA-256 |
|---|---:|---|
| Functional Signage GLB | 3,243,084 | `5F86D3FFEB1AC5D6D5048DCC1E99525C3038BFACC63A7A07088BDBBF5A3908D3` |
| Legacy 2D World GLB | 6,169,280 | `125264CC2DF826F5F698330B7A37D5FAE372ED85AD462102DEBCA8B61D97F2C1` |

Calibration profile의 coordinate policy도 다음으로 고정했다.

```text
Functional Signage GLB: DIRECT_NO_CONVERSION
Environment GLB:        DIRECT_NO_CONVERSION
Legacy Camera:           DIRECT_THREE_VALUES
Max-like adapter:        UNRESOLVED
```

## 자동 검증 결과

```text
Block 4A Legacy source hash/parse:       PASS
4 independent Scene/Camera identities:  PASS
Camera values and raw source equality:  PASS
Immutable legacy baseline:              PASS
Independent editable current values:    PASS
RESET TO LEGACY data foundation:        PASS
Photo bytes/hash/dimensions:             PASS
PhotoScene 8256×5504 / 3:2:              PASS
Exact Legacy mesh mappings:              PASS
4 independent LocationRecords:          PASS
UNRESOLVED fields remain unguessed:      PASS
Block 3 GLB fingerprints:                PASS
Legacy camera lockPolicy/runtime guard:  PASS
Locked-camera POINT availability guard:  PASS
GLB root coordinate conversion absent:   PASS
```

## 사용자 시각 확인 — 미완료

다음 항목은 자동 PASS로 선언하지 않는다.

```text
[DEFERRED BLOCK 4C] Front 앱 내부 PhotoScene 대응 확인
[DEFERRED BLOCK 4C] Front_Sweet 앱 내부 PhotoScene 대응 확인
[DEFERRED BLOCK 4C] Back 앱 내부 PhotoScene 대응 확인
[DEFERRED BLOCK 4C] Night 앱 내부 PhotoScene 대응 확인
[ ] 네 Legacy Camera 구도가 실사용 기준과 맞는지 확인
[x] Camera 기본 잠금 / 명시적 해제 / scene/view 재잠금이 기존 사용자 PASS와 일치
[x] Front / Front_Sweet / Back / Night 모두 잠금 해제 후 orbiting 정상
[x] 잠금 상태에서도 POINT 사용성 유지
```

Block 4A는 자동 기술 검증과 네 Scene의 lock/unlock/orbiting 사용자 검증을 통과했다.
PhotoScene runtime 검증은 Block 4C로 이관하며, 남은 Camera 구도 확인 전까지
**USER PASS / CLOSED**로 표시하지 않는다.
