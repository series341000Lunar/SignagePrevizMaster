# LUUX Signage Previz — Block 5B Validation

작성일: 2026-09-11
상태: **BACK CAMERA TECHNICAL PASS / USER VISUAL PASS / CLOSED**

## 기준

~~~text
Repository: C:\_InternalProjects\SignagePrevizMaster
Directive:  C:\Users\user\Desktop\LUUX_Signage_Previz_BLOCK-5B_IMPLEMENTATION_DIRECTIVE_V1_20260911.md
Bytes:      16,194
SHA-256:    3E4305934B4BA99098E5A3FAB06DC9224B3108A465E5E71685E21F102D64C3F3
Baseline:   Block 5A CLOSED / FRONT 75F user PASS
~~~

`luux-mockup/`과 `_TestSource/`는 읽기 전용 참조로 유지했으며 수정하지 않았다.

## BACK-only GLB

~~~text
Path:       3DAsset/Signage/Previz_3DWorld_Anamorphic_Back_v01.glb
Bytes:      1,193,468
SHA-256:    C149B914836177BF4737FA11A03A2A6447F626D1E09700B4FD79C7C6EE027AA3
glTF:       2.0
Scenes:     1
Nodes:      5
Meshes:     5
Materials:  1
Cameras:    0
Animations: 0
~~~

Exact nodes:

~~~text
ANAM_SURFACE_BACK
CALCAM_BACK_PIVOT
CALCAM_BACK_HEADING
CALCAM_BACK_LOOKAT
CALCAM_BACK_LOOKAT_COLLISION
~~~

FRONT75F surface/helper는 포함되지 않는다. Surface selector는 exact-name only다.

## Surface

~~~text
Role:       LUUX_BACK_ANAMORPHIC
Node:       ANAM_SURFACE_BACK
UV policy:  TEXCOORD_0 / PRESERVE_AUTHORED_NO_REMAP
UV min:     [0.11508843302726746, 0.01731288433074951]
UV max:     [0.7319519519805908,  1.031404972076416]
World min:  [-0.9664944549632253, 2.3737626634462856, -0.7911435242523623]
World max:  [ 2.3063221067372126, 8.420763438944647,   0.9249853185508838]
POINT:      DEFERRED_CANONICAL_INVERSE_MAPPING_UNPROVEN
~~~

## Camera helper 추출

~~~text
Max source position: [-121.231, 145.405, 1.561] cm
GLB formula:         (Max.x × 0.1, Max.z × 0.1, -Max.y × 0.1)
Expected:            [-12.1231, 0.1561, -14.5405]
Observed pivot:      [-12.123144149780273, 0.15964233875274658, -14.537314414978027]
Delta:               [-0.00004414978027256211, 0.0035423387527465933, 0.0031855850219724147]
Delta distance:      0.004764248626438737
~~~

실제 transformed helper를 검사해 `-local Y`를 forward, `+local X`를 right,
`-local Z`를 up으로 재구성했다. Helper scale은 관찰값으로만 기록하고 계산에서
제외했다.

~~~text
forward:     [0.6096242550704305, 0.27159688466202914, 0.7447102791500217]
right:       [-0.7735480144386598, -0.0013855945174790836, 0.6337361828756821]
up:          [-0.1731525674840368, 0.962410186074234, -0.20924823085093122]
quaternion:  [-0.046776645465416274, 0.9328274893511691, -0.12886764266448236, -0.3332235754323166]
target:      [-0.7054473757743835, 5.246401309967041, -0.5895642042160034]

PIVOT → LOOKAT distance:        1.5000022037593914
Helper ↔ LOOKAT direction:      0.000204781°
PIVOT → COLLISION distance:     18.72908573305664 (VARIABLE / NOT CONTRACTUAL)
Helper ↔ COLLISION direction:   0.000034764°
~~~

LOOKAT 위치 재업로드 후 두 target이 같은 시선축에 정렬됨을 확인했다. Runtime
orientation authority는 helper actual transform과 PIVOT→LOOKAT이며, COLLISION은
방향 검증 및 Orbit target으로 사용한다.

## BACK FOV 교정

~~~text
Old BACK H/V/D FOV:       10.109° / 12.918° / 16.351° — SUPERSEDED
Corrected BACK H/V/D FOV: 10.109° / 18.374° / 20.889° — CURRENT
Resolution:               2100 × 3840
Runtime vertical FOV:     18.374°
Runtime aspect:           0.546875
Derived horizontal FOV:   10.108984229243422°
Derived diagonal FOV:     20.888949632438322°
Consistency tolerance:    ±0.01° — PASS
Final output:             LUUX_FINAL_MASTER 4728 × 5760 immutable
Calibration state:        APPROVED / CLOSED
Visual state:             PASS
~~~

이전 Vertical FOV는 사용자가 잘못 전달한 값이었고 필요한 mesh 전체가 view에
들어오지 않았다. 수정된 `18.374°` view가 reference framing과 훨씬 가깝다는 사용자
관찰을 기준으로 교정했다. Three.js에는 Vertical FOV와 resolution aspect만 적용하며,
Horizontal/Diagonal 값은 일관성 진단으로 파생한다. Projection aspect와 working-canvas
aspect는 독립 필드지만 BACK의 현재 calibration에서는 둘 다 `0.546875`다.

## cameraForwardMatches 감사

~~~text
Implementation: desktop-app/src/renderer.js / runAnamorphicFamilySmoke
Comparison: THREE local -Z transformed by camera quaternion vs normalized runtimeForward
Actual forward:   [0.609624230460534, 0.271596721228057, 0.744710358900405]
Expected forward: [0.609624255070430, 0.271596884662029, 0.744710279150022]
Target direction: [0.609623819162394, 0.271596758310323, 0.744710682067325]
Dot:              0.999999999999983
Angular error:    1.82501207499443e-7 rad / 0.0000104565489457594°
Tolerance:        2e-7 rad
FOV involved:     NO
Aspect involved:  NO
Projection:       NO
Result:           PASS
Classification:   STALE ASSERTION
~~~

Runtime camera의 Position/Quaternion/Target/Up은 변경하지 않았다. 실패 원인은 같은
serialized transform을 검사하면서 runtime smoke가 `1e-7` vector-distance를 사용하고
Block 5B 정적 계약은 `2e-7`을 사용하던 불일치였다. 미세한 float serialization 차이를
수용하도록 실제 angular error를 `2e-7 rad`와 비교하고 audit 값을 report에 추가했다.

## 런타임 계약

- `SITE 3D / 3D WORLD / ANAMORPHIC / BACK`에서 BACK asset만 선택한다.
- `ANAM_SURFACE_BACK` 하나만 visible이며 master texture를 공유한다.
- 네 helper는 hidden이고 texture map과 POINT ownership이 없다.
- FRONT 75F와 BACK family/asset/camera/working canvas는 서로 독립이다.
- Orbit 시작 시 FOV 45°, world-up, unrestricted full viewer의 FREE_PREVIEW로 전환한다.
- RETURN TO BACK CALIBRATION은 저장된 position/quaternion/up/target/FOV/aspect로 복귀한다.
- Calibration에서만 working canvas 바깥을 `#20242c` matte로 표시한다.
- NORMAL, Legacy, PhotoScene, Environment, Location, 2D VIEW, Functional POINT를 보존한다.
- ILMIN 및 FRONT 90F는 NOT AVAILABLE이다.

## 자동 검증

~~~text
node --check source files:             PASS
npm run build:                         PASS
npm run test:block5a:                  PASS
npm run test:block5b:                  PASS
FOV H/V/D consistency ±0.01°:          PASS
cameraForwardMatches audit:            PASS
site-scene-contract-validation:        PASS
GLB source/build-copy fingerprint:     PASS
BACK exact surface/helper inventory:   PASS
LOOKAT/COLLISION direction alignment:  PASS
BACK projection/working aspect match:  PASS (0.546875)
npm run test:runtime:                   PASS
npm run dist:                          PASS
Portable runtime/link smoke:            PASS
Portable bytes:                        207,132,609
Portable SHA-256:                      913C16E2F3DF341F989B1BB2287D4B50F89A4D4B40FBDD064B017F6C2F87B8D4
~~~

이번 교정 후 Electron/WebGL integrated smoke와 새 Portable runtime/link smoke는
모두 정상 완료됐다. 과거 간헐적 `0xC0000135`는 별도 환경 이슈로 MONITOR 상태를
유지하며 이번 카메라 교정 PASS와 혼합하지 않는다.

## 사용자 시각 검증 — PASS / CLOSED

- [x] 3ds Max BACK reference와 위치/heading/+15.759° tilt-up 비교
- [x] 작은 roll 정합 확인
- [x] corrected vertical FOV 18.374° framing 확인
- [x] runtime projection aspect 0.546875 비교
- [x] 2100×3840 working canvas presentation 확인
- [x] FRONT 75F ↔ BACK 독립 전환 확인
- [x] FREE_PREVIEW → BACK calibration reset 확인
- [x] NORMAL 회귀 확인

사용자가 2026-09-11에 corrected BACK calibration을 최종 승인했다. Block 5B는
자동 기술 검증, runtime/Portable 검증, 사용자 시각 검증을 모두 충족해 CLOSED다.

## 환경 진단 참조

간헐적 Chromium GPU subprocess `0xC0000135` 문제의 payload/반복 실행/WER/A-B
진단은 [ENV-ELECTRON-GPU-01](ENV-ELECTRON-GPU-01.md)에 분리해 기록했다. 이 환경
이슈는 NON-BLOCKING / MONITOR이며 Block 5B 사용자 시각 PASS와 별개다.
