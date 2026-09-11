# LUUX Signage Previz — Block 4F Handoff

작성일: 2026-09-11
상태: **CLOSED / AUTOMATED PASS / USER PASS / BASIC CORE CLOSED**

## 기준선

```text
Repository:       C:\_InternalProjects\SignagePrevizMaster
Branch:           main
Base HEAD:        6242adf Complete Block 4E site location navigation
origin/main:      b3747bf Complete Block 4D site environment foundation
Local ahead:      1 commit (Block 4E; push authorization pending)
Block 0–4E:       CLOSED / preserved
Block 4F commit:  PENDING GIT WORK
```

구현 계약:

```text
File:       LUUX_Signage_Previz_BLOCK-4F_IMPLEMENTATION_DIRECTIVE_V1_20260911.md
Bytes:      10,298
SHA-256:    99D19F3E2CBDCB91B8C8C817D63C1D06E356665242FC3F2D596091EED2429A3F
Authority:  IMPLEMENTATION GO
```

## 구현 결과

앱의 top-level 기본 진입 View만 `SITE 3D`로 변경했다. SITE 내부 검증값은
기존 상태를 그대로 유지한다.

```text
Application launch
→ SITE 3D / 3D WORLD / NORMAL
→ DAY presentation
→ LOCATIONS ON

SITE 3D → 2D VIEW
→ Full-Resolution FIT / 1:1 / 200% / 400% / pan / filter 사용 가능

2D VIEW → SITE 3D
→ Functional Signage / Environment / Location runtime 정상 복귀
```

HTML 초기 active control과 Renderer 초기 state를 동일한 `SITE 3D` 계약으로
맞췄다. 모든 asset load가 끝나면 동일 기본값으로 UI/runtime을 다시 동기화한다.
Block 0 smoke는 더 이상 2D가 앱 기본값이라고 가정하지 않고, 검증 중 2D에 진입한
뒤 원래 View로 복귀한다.

## 회귀 경계 보존

- Block 0: 4728×5760 source/decode/texture 동일성과 master texture를 유지한다.
- Block 1: localhost-only Manual/Auto Sync 경로와 zoom/pan 보존을 유지한다.
- Block 2: Canonical top-left coordinate, stale-document guard, latest-wins POINT를 유지한다.
- Block 3: 두 정확한 3D World surface, Legacy scene, signage-only raycast와 missing
  ANAMORPHIC `NONE`을 유지한다.
- Block 4A/4B: 네 Camera identity, immutable `legacyValues`, Camera Lock과
  `CANDIDATE_USER_CALIBRATION_OPEN`을 유지한다.
- Block 4C: 네 8256×5504 PhotoScene, 3:2 viewport와 Photo POINT를 유지한다.
- Block 4D: Environment v02 direct coordinate, neutral material, DAY/NIGHT와
  POINT non-occluder 계약을 유지한다.
- Block 4E: 네 Location, proxy, ON/OFF, latest-wins, exact return을 유지한다.

## 자동 검증 결과

```text
npm run build:          PASS
npm run test:static:    PASS
npm run test:protocol:  PASS (Block 0–4F)
npm run test:runtime:   PASS
npm run test:link:      PASS
npm run dist:           PASS
npm run test:portable: PASS (packaged runtime + packaged synthetic link)

WebGL context loss:     0
External network:       0
Critical runtime error: 0
```

개발 및 Portable의 runtime/link 네 실행 모두 startup `SITE 3D`, 2D 전환,
SITE 3D 재진입을 통과했다. Live texture 교체는 시작 기준 texture count 대비
비정상 증가가 없음을 확인했다.

## Portable Release Candidate

```text
Path:       desktop-app/dist/LUUX Signage Previz.exe
Bytes:      206,687,063
MiB:        197.11
SHA-256:    14412376079DB695DEB486B3FED758DF4FF6C7BBC8E7CC611ED4534296F64126
Target:     Windows x64 portable
Git status: ignored generated artifact
```

EXE는 GitHub 일반 파일 제한을 초과하므로 commit 대상이 아니다. source,
build configuration, tests와 문서는 추적 대상으로 유지한다.

## 사용자 확인 — PASS

사용자가 실제 실행 환경에서 2026-09-11에 다음 항목을 확인하고 Block 4F를 PASS했다.

```text
[x] 앱 실행 직후 SITE 3D가 기본 화면으로 보임
[x] SITE 3D → 2D VIEW 전환 및 기존 2D 사용성 정상
[x] 2D VIEW → SITE 3D 복귀 후 이상 없음
[x] 실제 Photoshop Live texture가 SITE 3D에서 정상 반영
[x] 실제 Photoshop에서 가려진 Functional Signage POINT 정상
[x] Location → PhotoScene → RETURN TO SITE 정상
[x] 2D VIEW 접근성이 충분함
```

따라서 최종 상태는 다음과 같다.

```text
LUUX Signage Previz
BASIC CORE
= CLOSED
```

## 남은 OPEN / 다음 단계

```text
OPEN / NON-BLOCKING:
  actual 3ds Max reference 기반 3DS MAX-LIKE adapter calibration
  status = CANDIDATE_USER_CALIBRATION_OPEN

NEXT:
  Block 5 Anamorphic Calibration Foundation
```

Block 5+의 Anamorphic mesh 연결, projection, bake, snapshot, project save 또는
drawing 기능은 선행 구현하지 않았다.
