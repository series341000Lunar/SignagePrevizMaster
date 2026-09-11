# LUUX Signage Previz — Block 5B Handoff

작성일: 2026-09-11
상태: **TECHNICAL PASS / USER VISUAL PASS / BLOCK 5B CLOSED**

## 구현 결과

~~~text
3D WORLD / NORMAL
→ 기존 Functional Signage 두 surface 유지

3D WORLD / ANAMORPHIC / FRONT 75F
→ ANAM_SURFACE_FRONT75F / user-validated calibration

3D WORLD / ANAMORPHIC / BACK
→ ANAM_SURFACE_BACK / helper-derived candidate calibration
→ corrected vertical FOV 18.374° / projection aspect 0.546875
→ working canvas 2100×3840 (aspect 0.546875)
~~~

BACK은 `ANAMORPHIC_BACK` / `LUUX_BACK_ANAMORPHIC` 독립 family로 구현했다.
BACK-only GLB의 actual helper transform과 수정된 LOOKAT 위치를 사용했으며 Max Euler를
단순 swizzle하지 않았다. 자세한 자산 지문과 수치는
[Block 5B Validation](BLOCK-5B-VALIDATION.md)에 기록했다.

## 고정·후보 계약

~~~text
Asset:          Previz_3DWorld_Anamorphic_Back_v01.glb (pinned)
Surface:        ANAM_SURFACE_BACK exact-name only
Working:        2100×3840
Final output:   LUUX_FINAL_MASTER 4728×5760 immutable
Old H/V/D:      10.109° / 12.918° / 16.351° — SUPERSEDED
Current H/V/D:  10.109° / 18.374° / 20.889° — CURRENT
Runtime V-FOV:  18.374° candidate
Runtime aspect: 0.546875 candidate, matching 2100×3840
Visual gate:    PASS / CLOSED
~~~

이전 Vertical FOV는 사용자가 잘못 전달한 값이었다. 수정된 view가 reference framing과
훨씬 가깝다는 사용자 관찰과 최종 시각 PASS를 반영했다. Runtime은
Vertical FOV와 aspect만 입력하고 H `10.108984°`, D `20.888950°`를 파생 검증한다.

`cameraForwardMatches`는 FOV와 무관한 Three.js local `-Z` orientation 검사였다.
Quaternion-derived actual과 helper-derived expected의 오차는 `0.00001046°`였으며,
불일치한 과도한 runtime tolerance를 `2e-7 rad` angular tolerance로 정렬했다.
Position/Quaternion/Target은 변경하지 않았고 분류는 **STALE ASSERTION**이다.

Collision distance는 고정 계약이 아니다. Helper scale도 camera 계산에서 무시한다.
BACK POINT는 `DEFERRED_CANONICAL_INVERSE_MAPPING_UNPROVEN` 상태다.

## 사용자 확인 절차

1. GPU 부하가 해소된 뒤 `desktop-app`에서 `npm run dev`를 실행한다.
2. `SITE 3D / 3D WORLD / ANAMORPHIC / BACK`을 선택한다.
3. 3ds Max BACK reference와 위치, heading, tilt, roll을 비교한다.
4. FOV V `18.374`와 camera projection aspect `0.546875` framing을 확인한다.
5. `2100×3840` working canvas 및 바깥 `#20242c` matte를 확인한다.
6. FRONT 75F와 BACK을 반복 전환해 서로의 camera/surface가 섞이지 않는지 확인한다.
7. Orbit 후 FREE_PREVIEW가 full viewer/FOV 45°/world-up으로 전환되는지 확인한다.
8. RETURN TO BACK CALIBRATION이 원래 camera와 working canvas를 복원하는지 확인한다.
9. NORMAL과 기존 Functional POINT가 그대로인지 확인한다.

## 검증 상태

~~~text
Automated GLB/profile/build validation: PASS
FRONT 75F regression:                  PASS
BACK runtime wiring smoke contract:    IMPLEMENTED
Windows Portable packaging:            PASS
Electron/WebGL integrated smoke:       PASS
cameraForwardMatches:                  PASS
Portable runtime/link smoke:           PASS
Portable bytes:                        207,132,609
Portable SHA-256:                      913C16E2F3DF341F989B1BB2287D4B50F89A4D4B40FBDD064B017F6C2F87B8D4
GPU environment issue:                 NON-BLOCKING / MONITOR
BACK user visual validation:           PASS / CLOSED
~~~

사용자가 2026-09-11에 corrected BACK calibration을 최종 승인했다. Block 5B는 CLOSED다.

간헐적 GPU subprocess 종료의 후속 환경 진단은
[ENV-ELECTRON-GPU-01](ENV-ELECTRON-GPU-01.md)에 분리했다. 환경 이슈는
NON-BLOCKING / MONITOR이며 Block 5B closeout과 별개다.
