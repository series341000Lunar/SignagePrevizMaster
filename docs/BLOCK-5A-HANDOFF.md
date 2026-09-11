# LUUX Signage Previz — Block 5A Handoff

작성일: 2026-09-11
상태: **TECHNICAL EXTRACTION COMPLETE / RUNTIME INTEGRATED / USER VALIDATION PASS / CLOSED**

## 구현 결과

ANAMORPHIC_FRONT_75F를 NORMAL과 분리된 독립 family/asset/profile로 구현했다.
실제 GLB의 exact surface와 helper transform을 사용했으며 Max Euler를 단순
swizzle하지 않았다.

~~~text
3D WORLD / NORMAL
→ 기존 Functional Signage 두 surface 유지

3D WORLD / ANAMORPHIC / FRONT 75F
→ ANAM_SURFACE_FRONT75F
→ helper-derived calibration camera
→ working canvas 3000×3840
~~~

Preview Orbit은 profile을 변경하지 않는다. Orbit이 시작되면 FREE_PREVIEW로
표시하고, explicit reset 버튼으로 저장된 position, quaternion, up, target,
FOV에 복귀한다.

## Git / 변경 상태

~~~text
Branch:                 main
Baseline HEAD:          6242adf Complete Block 4E site location navigation
Implementation commit: 03fad61 Complete Block 5A anamorphic calibration
origin/main pre-push:   b3747bf Complete Block 4D site environment foundation
Pre-existing worktree:  Block 4F source/docs and asset were already uncommitted
~~~

작업 중 프로젝트 전체 copy/paste로 .git owner가 현재 사용자와 달라 Git의
dubious ownership 보호가 동작했다. 전역 Git 설정은 변경하지 않았고 조회마다
-c safe.directory만 사용했다. 기존 변경은 reset/overwrite하지 않았다.

Block 5A에서 추가 또는 직접 갱신한 핵심 파일:

~~~text
3DAsset/Signage/Previz_3DWorld_Anamorphic_Front75F_v01.glb
desktop-app/src/anamorphic-calibration-profile.js
desktop-app/src/site-scene-profile.js
desktop-app/src/renderer.js
desktop-app/src/index.html
desktop-app/src/main.cjs
desktop-app/scripts/anamorphic-glb-inspection.mjs
desktop-app/scripts/build.mjs
desktop-app/tests/block-5a-validation.mjs
desktop-app/tests/block-4a-validation.mjs
desktop-app/tests/site-scene-contract-validation.mjs
desktop-app/tests/static-validation.mjs
desktop-app/package.json
desktop-app/package-lock.json
README.md
desktop-app/README.md
docs/BLOCK-5A-VALIDATION.md
docs/BLOCK-5A-HANDOFF.md
~~~

## 고정 계약

~~~text
familyId:       ANAMORPHIC_FRONT_75F
surfaceRole:    LUUX_FRONT_ANAMORPHIC
surfaceNode:    ANAM_SURFACE_FRONT75F
working:        3000×3840
finalOutput:    LUUX_FINAL_MASTER 4728×5760
assetRevision:  v01 pinned / mutable only through explicit revision workflow
Max FOV H/V/D:  15.52° / 19.778° / 24.962°
Three runtime:  vertical FOV 19.778° / editable through FOV V
FREE_PREVIEW:   FOV 45° / world-up / surface-fit / unrestricted viewer aspect
calibrationMatte: #20242c / outside working canvas only / calibration only
~~~

Camera와 GLB 상세 수치는 [Block 5A Validation](BLOCK-5A-VALIDATION.md)에
기록했다.

## 회귀 보존

~~~text
NORMAL:                 unchanged / automated PASS
Environment:            unchanged / automated PASS
Location Navigation:    unchanged / automated PASS
PhotoScene:             unchanged / automated PASS
2D VIEW:                unchanged / automated PASS
Functional POINT:       unchanged / automated PASS
75F POINT:              deferred; canonical inverse mapping unproven
75F exterior matte:     #20242c / calibration-only / automated contract PASS
~~~

## 사용자 확인 절차

1. desktop-app에서 npm run dev를 실행한다.
2. SITE 3D / 3D WORLD / ANAMORPHIC / FRONT 75F를 선택한다.
3. 가능하면 실제 3ds Max 75F Reference와 나란히 비교한다.
4. 위치, heading, tilt, roll, FOV, 3000×3840 framing을 확인한다.
5. working canvas 바깥만 #20242c 매트로 어두워지고 내부 색은 유지되는지 확인한다.
6. Orbit 후 버튼이 RETURN TO 75F CALIBRATION으로 바뀌는지 확인한다.
7. FREE_PREVIEW에서 매트와 canvas 제한이 모두 해제되는지 확인한다.
8. 버튼을 눌러 원래 calibration view로 정확히 복귀하는지 확인한다.
9. NORMAL로 전환해 기존 두 Functional Signage가 그대로인지 확인한다.

## USER PASS / Deferred

~~~text
USER VALIDATION:
  PASS 2026-09-11
  FRONT 75F geometry/view/heading/tilt/roll/FOV
  working canvas and #20242c exterior matte presentation
  NORMAL ↔ ANAMORPHIC switch
  FREE_PREVIEW unrestricted canvas → calibration reset

DEFERRED:
  ANAMORPHIC_BACK
  ANAMORPHIC_ILMIN_AQUBE
  ANAMORPHIC_FRONT_90F
  SYNC
  Projection/Bake
  Full-image Photoshop transport
  75F Canonical inverse mapping / POINT
~~~

최종 상태:

~~~text
BLOCK 5A CLOSED
USER VALIDATION PASS 2026-09-11
75F POINT remains DEFERRED_CANONICAL_INVERSE_MAPPING_UNPROVEN
~~~
