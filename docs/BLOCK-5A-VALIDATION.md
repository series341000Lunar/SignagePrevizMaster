# LUUX Signage Previz — Block 5A Validation

작성일: 2026-09-11
상태: **AUTOMATED TECHNICAL PASS / USER VALIDATION PASS / CLOSED**

## 기준선과 지시문

~~~text
Repository:       C:\_InternalProjects\SignagePrevizMaster
Branch:           main
HEAD:             6242adf Complete Block 4E site location navigation
Block 5A commit:  PENDING / working tree implementation
Block 0–4F:       BASIC CORE CLOSED / regression baseline
~~~

~~~text
Directive:  C:\Users\user\Desktop\LUUX_Signage_Previz_BLOCK-5A_IMPLEMENTATION_DIRECTIVE_V1_20260911.md
Bytes:      18,286
SHA-256:    14325C44A510DB18DB49B00A11ECCAF05E6DCCE1A12A91E38338F7406ADD7666
Addendum:   LUUX_Signage_Previz_Contract_Correction_Addendum_V1_4_20260911.md
~~~

## GLB 독립 검사

~~~text
Path:       3DAsset/Signage/Previz_3DWorld_Anamorphic_Front75F_v01.glb
Bytes:      1,193,472
SHA-256:    47B2BD9256363E8FF7527E08A23B5AB31543D7019C123E80E9B1A7385D821EBF
glTF:       2.0
Scenes:     1
Nodes:      5
Meshes:     5
Materials:  1
Cameras:    0
Animations: 0
~~~

Exact node:

~~~text
ANAM_SURFACE_FRONT75F
CALCAM_FRONT75F_PIVOT
CALCAM_FRONT75F_HEADING
CALCAM_FRONT75F_LOOKAT
CALCAM_FRONT75F_LOOKAT_COLLISION
~~~

Fuzzy selector, similar-name fallback, first-mesh fallback은 사용하지 않는다.

## Surface

~~~text
Node:       ANAM_SURFACE_FRONT75F
Role:       LUUX_FRONT_ANAMORPHIC
UV:         TEXCOORD_0
UV min:     [0.17526650428771973, 0.018039584159851074]
UV max:     [0.841627299785614,   0.9585243463516235]
UV policy:  PRESERVE_AUTHORED_NO_REMAP
World min:  [-0.9664944549632253, 2.3737626634462856, -0.7911435242523623]
World max:  [ 2.3063221067372126, 8.420763438944647,   0.9249853185508838]
~~~

Anamorphic Surface의 Canonical inverse mapping은 증명되지 않았으므로 Photoshop
POINT는 DEFERRED_CANONICAL_INVERSE_MAPPING_UNPROVEN이다.

## Camera helper 관계

~~~text
Max source position: [-89.453, -160.851, 1.063] cm
GLB = (Max.x × 0.1, Max.z × 0.1, -Max.y × 0.1)
Expected = [-8.9453, 0.1063, 16.0851]
Observed = [-8.945317268371582, 0.10628952085971832, 16.08513641357422]
Delta    = [-0.00001726837158067, -0.000010479140281683, 0.00003641357421813]
Distance = 0.00004164081441843526
~~~

~~~text
GLB helper forward = -local Y
Runtime right      = +helper local X
Runtime up         = -helper local Z
PIVOT → LOOKAT distance     = 1.4999956670797754
PIVOT → COLLISION distance  = 18.511678196985564
Helper scale ≈ 0.001        = observed only / calibration calculation ignored
~~~

두 target 방향은 runtime forward와 각각 약 0.00000247 rad,
0.00011967 rad 이내로 일치한다. 비대칭 helper 축에서 관찰한 roll magnitude는
0.5200479505°이며 Max source -0.52°와 대응한다. 부호 convention과 최종
화면은 사용자 시각 검증 전까지 확정하지 않는다.

## Runtime camera

~~~text
position:    [-8.945317268371582, 0.10628952085971832, 16.08513641357422]
forward:     [0.49646483878426617, 0.27381396846000244, -0.8237405990523335]
up:          [-0.149416883078429, 0.9617398529147221, 0.2296324244672253]
quaternion:  [0.13192827439065186, -0.26594105628169623, 0.04153321753635798, 0.9540153451800564]
target:      [0.24541503190994263, 5.172914981842041, 0.8358093500137329]
near/far:    0.01 / 10000
~~~

FOV:

~~~text
Max horizontal FOV:    15.52°
Max vertical FOV:      19.778°
Max diagonal FOV:      24.962°
sourceFovBasis:        HORIZONTAL_3DS_MAX_DEFAULT_CAMERA_USER_CONFIRMED
runtimeFov:            19.778°
runtimeFovBasis:       VERTICAL_THREE_FROM_3DS_MAX_USER_CONFIRMED
aspectUsed:            0.78125
horizontal→vertical:   2 × atan(tan(horizontal / 2) / aspect)
converted candidate:   19.788875056232293°
visualValidationState: PASS
validationDate:        2026-09-11
~~~

Three.js PerspectiveCamera.fov는 수직 FOV이므로, 사용자가 3ds Max 기본 카메라에서
확인한 수직값 19.778°를 runtime 기본값으로 적용한다. 기존 15.52°는 수평 FOV였기
때문에 수직값으로 직접 적용했을 때 화면 위아래가 크롭됐다. FOV V 입력으로 현재
세션에서 값을 조정할 수 있고 RETURN TO 75F CALIBRATION은 19.778°로 복귀한다.

사용자 비교 근거는 ANAMSource.png의 3000×3840 전체 프레임, 3ds Max viewport
스크린샷, 그리고 기존 runtime crop 스크린샷이다. 이 비교로 FOV 축 의미는
확정했다. 사용자는 교정 후 최종 framing, roll, calibration reset,
FREE_PREVIEW canvas 해제, exterior matte 표시가 정상 작동함을 2026-09-11에 확인했다.

## Runtime 정책

- SITE 3D → 3D WORLD → ANAMORPHIC → FRONT 75F로 활성화한다.
- ANAM_SURFACE_FRONT75F 하나만 visible이다.
- Camera helper 4개는 production presentation에서 hidden이다.
- Helper material map count는 0이며 master Photoshop texture를 받지 않는다.
- Orbit 시작 시 상태는 FREE_PREVIEW가 된다.
- RETURN TO 75F CALIBRATION으로 저장된 camera에 정확히 복귀한다.
- 3000×3840 aspect의 centered working viewport를 사용한다.
- 75F CALIBRATION에서 working viewport 바깥만 #20242c 매트로 어둡게 표시한다.
- Orbit으로 75F calibration을 벗어나면 FOV 45°, world-up, 일반 surface-fit으로 초기화한다.
- FREE_PREVIEW에서는 매트와 3000×3840 canvas 제한을 해제하고 전체 viewer를 사용한다.
- BACK / ILMIN / FRONT 90F는 NOT AVAILABLE을 유지한다.
- Branding은 Signage MockUp Generator와 LUNARGRAPHICS를 표시한다.

## 자동 검증 결과

~~~text
npm run test:static:    PASS
npm run test:protocol:  PASS (Block 0–5A)
npm run test:runtime:   ENVIRONMENT DEFERRED (GPU subprocess unavailable under active render load)
npm run test:link:      PASS
npm run dist:           PASS
npm run test:portable:  ENVIRONMENT DEFERRED (same native GPU startup condition)

portable bytes:         206,975,289
portable SHA-256:       6B2E128D9E6FEF45BF91BD66A807170DDAA513E5D6817CDA5ED9ABF2E2F81583

75F surface available:     true
visible surface count:     1
helper visible count:      0
helper texture map count:  0
camera finite/quaternion:  PASS
Vertical FOV 19.778:       PASS
Session FOV edit/reset:    PASS
FREE_PREVIEW → reset:      PASS
FREE_PREVIEW FOV 45/up:    PASS
FREE_PREVIEW full viewer:  PASS
Working aspect 3000/3840:  PASS
Calibration matte #20242c: PASS (static contract wiring)
Missing family safety:     PASS
External network:          0
WebGL context loss:        0
Critical runtime errors:   0
~~~

첫 runtime 시도는 사용자가 실행 중이던 앱과 127.0.0.1:34100 포트가 충돌해
EADDRINUSE였으며, 사용자 앱 종료 후 동일 테스트 재실행은 PASS했다.

이번 calibration matte 반영 후 static/protocol/dist는 PASS했다. fresh runtime과
portable 실행은 사용자 3D rendering 중 system commit이 약 161 GB / 175 GB에
도달한 상태에서 Chromium GPU subprocess가 0xC0000135로 종료되어 보고서를
생성하지 못했다. Portable host의 0x80000003 dialog는 이 자동 스모크 실행에서
발생했다. Fusion 완전 종료 후 commit은 약 116 GB로 감소했지만, 계속 실행 중인
다른 3D render/GPU workload 아래에서는 같은 native GPU subprocess 오류가
재현됐다. 동일 소스의 matte 반영 전 runtime은 PASS했으며, 이번 native 실행은
사용자 요청에 따라 기능 실패로 판정하지 않고 환경 해소 후 재확인 대상으로 남긴다.

## 사용자 검증 — PASS

- [x] FRONT 75F Surface geometry 확인
- [x] Camera 위치/heading/tilt 확인
- [x] Roll 시각 정합 확인
- [x] FOV와 실제 75F framing 비교
- [x] 3000×3840 working canvas 표시 확인
- [x] working canvas 바깥 #20242c 매트와 내부 색상 보존 확인
- [x] NORMAL ↔ FRONT 75F ANAMORPHIC 전환 확인
- [x] Orbit 후 Calibration Camera 복귀 확인

자동 검증과 사용자의 명시적 정상 작동 확인을 함께 근거로 Block 5A를 CLOSED 처리한다.
