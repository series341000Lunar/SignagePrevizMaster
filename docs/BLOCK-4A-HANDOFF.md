# LUUX Signage Previz — Block 4A Handoff

작성일: 2026-09-10
상태: **AUTOMATED TECHNICAL PASS / USER VISUAL VALIDATION OPEN**

## 인계 기준선

```text
Repository:             C:\_InternalProjects\SignagePrevizMaster
Branch:                 main
Block 3 closing commit: 306e5c3a0efd822af307f8d0ce9e490ba9613bd4
Block 0–3:              CLOSED
Block 4A:               implemented; automated pass; user visual gate open
```

구현 계약은 `LUUX_Signage_Previz_BLOCK-4A_DESIGN_V1_1_20260910.md`
(22,249 bytes, SHA-256
`BC37DA892A66448AD2F8F8043BA3ADFCE2B0DAB54AE74BAC668D05548596C5BA`)를
기준으로 삼았다.

## 구현 결과

`desktop-app/src/site-calibration-profile.js`에 app-owned Site Calibration Profile
foundation을 추가했다.

```text
SiteCalibrationProfile
├─ 4 independent CameraRecords
├─ 4 independent PhotoSceneRecords
├─ 4 independent LocationRecords
├─ immutable Legacy reset baselines
├─ explicit Legacy camera lockPolicy
├─ project/Legacy photo fingerprints
└─ explicit UNRESOLVED/deferred fields
```

기존 Block 3 runtime은 수정하지 않았다. 특히 Functional Signage GLB, Legacy GLB,
surface selector, master texture sharing, signage-only raycast, canonical coordinate,
POINTER_SET, document safety 및 missing ANAMORPHIC fail-safe는 그대로다.

## Block 4B 이후가 사용할 확정값

| Scene | Camera ID | FOV | Position XYZ | Euler XYZ degrees |
|---|---|---:|---|---|
| `FRONT` | `photo-reference.front` | 52.4 | `[-8.587, 1.4, 12.33]` | `[16.5, -39.5, 10.3]` |
| `FRONT_SWEET` | `photo-reference.front-sweet` | 49.2 | `[-7.243, -0.031, 12.76]` | `[22.3, -34.5, 13.1]` |
| `BACK` | `photo-reference.back` | 46.4 | `[-9.869, 0.04, -9.425]` | `[-30.1, -130.95, -24.6]` |
| `NIGHT` | `photo-reference.night` | 47.9 | `[-9.869, 0.04, -9.425]` | `[-29.3, -132.3, -21.9]` |

공통 Camera 계약은 Three.js direct world values, vertical Three FOV, aspect 1.5,
near/far 0.1/10000, Euler XYZ, target 없음이다. Scene Camera는 수치가 같더라도
deduplicate하지 않는다.

모든 CameraRecord의 `lockPolicy`는 기본 잠금, Legacy 재진입/scene 변경 재잠금,
잠금 중 POINT 허용, camera mutation의 명시적 unlock 요구를 고정한다. 기존 Block 3
runtime 구현도 이 정책과 일치하는지 전용 검증에서 확인한다.

PhotoScene source는 `2DAsset/Photograph/` 아래 실제 4개 JPEG로 고정했고, Legacy
사진과 byte-identical임을 검증했다. Native frame은 네 파일 모두 `8256×5504 / 3:2`다.
정확한 path, bytes, SHA-256 및 mapping mesh는
[`BLOCK-4A-VALIDATION.md`](BLOCK-4A-VALIDATION.md)에 기록했다.

`LUUX_F_Sweet`은 Design V1.1에서 Legacy Anamorphic Mesh로 분류하지만,
`Front_Sweet` Photo Camera, Pseudo Anamorphic Camera 및 실제 bake camera identity는
서로 분리한다.

## 열린 Gate / UNRESOLVED

다음 값은 근거가 없어 그대로 열어 두었다.

```text
Block 4B: Max-like camera basis 및 FOV conversion
Block 4C: standalone PhotoScene runtime URL 및 Photo POINT runtime validation
Block 4E: Location worldPosition, thumbnailAsset, uiOffset
User:     네 사진 대응과 네 Legacy Camera 구도 시각 확인
```

Legacy camera 기본 잠금/해제/재잠금과 잠금 중 POINT는 Block 3 사용자 PASS 및 현재
runtime guard로 확인되었다. 사용자는 Front, Front_Sweet, Back, Night 모두 잠금 해제
후 orbiting이 정상임을 추가 확인했다. 앱 내부 사진 대응은 Block 4C로 이관하며 실제
Camera 구도 확인은 여전히 사용자 gate다.

## 선행 구현하지 않은 항목

```text
Environment GLB / lighting
Navigation marker / thumbnail UI
Site → Photo animation 및 return-state runtime
PhotoScene runtime / Photo POINT
Camera editing UI / Max-like adapter
Pseudo Anamorphic / Projection / Bake
Photoshop Snapshot / User Project Save
Drawing / Bezier
```

## 다음 작업의 보호 규칙

- `legacyValues`를 사용자 편집값으로 덮어쓰지 않는다.
- `createEditableCameraRecords()`로 각 Scene의 독립 `currentValues`를 만든다.
- Legacy Camera에는 Max-like adapter나 GLB basis conversion을 적용하지 않는다.
- Photo runtime URL과 Location 값을 profile의 `UNRESOLVED` 값에서 임의 승격하지 않는다.
- 사용자 시각 gate를 자동 결과로 닫지 않는다.
- Block 4B 시작 전에 Block 3 CLOSED 자산 지문 검증을 계속 통과시킨다.
