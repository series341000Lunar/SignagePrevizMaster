# LUUX Signage Previz — Block 4F Validation

작성일: 2026-09-11
상태: **CLOSED / AUTOMATED TECHNICAL PASS / USER PASS / BASIC CORE CLOSED**

## 구현 계약과 범위

Block 4F는 Block 0–4E를 다시 설계하지 않고 Basic Core closeout만 수행한다.

```text
Default top-level View: SITE 3D
2D VIEW:                preserved
Block 5+ functions:     not implemented
```

Directive fingerprint:

```text
Bytes:    10,298
SHA-256:  99D19F3E2CBDCB91B8C8C817D63C1D06E356665242FC3F2D596091EED2429A3F
```

## Startup View 자동 검증

`runBlock4FStartupViewSmoke()`가 실제 Electron renderer에서 다음 순서를 실행한다.

```text
startup SITE 3D
→ 2D VIEW
→ SITE 3D re-entry
```

관찰값:

| 항목 | 결과 |
| --- | --- |
| startup active View | `site-3d` / PASS |
| startup Site status | `READY` |
| startup Functional Signage surfaces | `2` |
| startup Environment | `READY / visible` |
| startup LOCATIONS control | visible |
| 2D active View | `2d` |
| 2D Full-Resolution | PASS |
| 2D source = texture dimensions | PASS |
| SITE 3D re-entry | `READY` / PASS |
| startup/switch context loss | `0` |

## Block 0–4E regression

| 영역 | 결과 |
| --- | --- |
| Full-Resolution 4728×5760 decode/texture | PASS |
| 2D FIT / 1:1 / 200% / 400% / pan / filter / reload | PASS |
| Photoshop replacement view state preservation | PASS |
| Canonical 2D/3D/Site POINT | PASS |
| stale-document and latest-wins pointer safety | PASS |
| 3D World exact two-surface binding | PASS |
| missing ANAMORPHIC surface fail-safe | PASS |
| Camera Editor / Lock / reset regression | PASS |
| four PhotoScenes / 3:2 / rapid latest-wins | PASS |
| Photo POINT | PASS |
| Environment v02 / direct coordinates / neutral material | PASS |
| Environment POINT target count | `0` / PASS |
| occluded Functional Signage remains POINT target | PASS |
| four Locations / proxies / ON-OFF | PASS |
| Location → Photo → exact Site return | PASS |
| rapid Location navigation latest-wins | PASS |

## Camera / Photo 기준 계약

Block 4F에서 값은 변경하지 않았다. 실제 Legacy 추출값과 authoritative project
사진 지문은 다음과 같다.

| Scene | FOV | Position XYZ | Euler XYZ degrees | Photo | Native size |
| --- | ---: | --- | --- | --- | --- |
| FRONT | 52.4 | `[-8.587, 1.4, 12.33]` | `[16.5, -39.5, 10.3]` | `BG_Front.jpg` | 8256×5504 |
| FRONT_SWEET | 49.2 | `[-7.243, -0.031, 12.76]` | `[22.3, -34.5, 13.1]` | `BG_FrontSweet.jpg` | 8256×5504 |
| BACK | 46.4 | `[-9.869, 0.04, -9.425]` | `[-30.1, -130.95, -24.6]` | `BG_Back.jpg` | 8256×5504 |
| NIGHT | 47.9 | `[-9.869, 0.04, -9.425]` | `[-29.3, -132.3, -21.9]` | `BG_Night.jpg` | 8256×5504 |

공통 계약은 `PerspectiveCamera`, `THREE_WORLD`, vertical Three.js FOV,
aspect `1.5`, near/far `0.1 / 10000`, direct Euler XYZ다. Camera identity와
immutable Legacy baseline은 Scene별로 독립이다.

## 실행별 증거

| 실행 | technicalPass | packaged | startup | context loss | external network |
| --- | --- | --- | --- | ---: | ---: |
| Development runtime | PASS | false | PASS | 0 | 0 |
| Development synthetic link | PASS | false | PASS | 0 | 0 |
| Portable runtime | PASS | true | PASS | 0 | 0 |
| Portable synthetic link | PASS | true | PASS | 0 | 0 |

Portable 통합 검증은 같은 EXE를 두 번 실행해 runtime과 synthetic Photoshop link를
분리 검증한다. packaged link에서 Full-Resolution, stable texture replacement,
Site POINT, Environment-through POINT, Photo POINT와 Location exact return이 모두 PASS다.

증거 파일은 generated/ignored 상태다.

```text
desktop-app/.runtime/dev-runtime.json
desktop-app/.runtime/link-runtime.json
desktop-app/.runtime/portable-runtime.json
desktop-app/.runtime/portable-link-runtime.json
desktop-app/.runtime/*.png
```

## Portable 결과

```text
Path:       desktop-app/dist/LUUX Signage Previz.exe
Bytes:      206,687,063
SHA-256:    14412376079DB695DEB486B3FED758DF4FF6C7BBC8E7CC611ED4534296F64126
Build:      PASS
Runtime:    PASS
Link:       PASS (synthetic Photoshop client)
Git:        ignored; not staged
```

파일은 GitHub 일반 파일 크기 제한을 초과하므로 source와 재현 가능한 build 설정만
추적한다.

## 사용자 검증 — PASS

사용자가 2026-09-11에 실제 앱과 Photoshop 환경에서 다음을 확인했다.

- [x] 앱을 새로 실행하면 SITE 3D가 첫 화면이다.
- [x] 2D VIEW로 전환해 기존 Full-Resolution 사용성이 정상이다.
- [x] SITE 3D로 다시 돌아와도 Environment/Signage/Location이 정상이다.
- [x] 실제 Photoshop Live frame이 SITE 3D Signage에 반영된다.
- [x] Environment에 가려진 Signage POINT가 실제 Photoshop에 기록된다.
- [x] Location marker → PhotoScene → RETURN TO SITE가 정상이다.
- [x] 기본 View 변경 후에도 2D VIEW에 충분히 쉽게 접근할 수 있다.

Synthetic Photoshop link 자동 기술 증거와 실제 사용자 Photoshop checkpoint가 모두
PASS했다.

## 남은 미확정 사항

```text
3DS MAX-LIKE actual reference calibration:
  CANDIDATE_USER_CALIBRATION_OPEN

Block 5+:
  not implemented / deferred
```

Block 4F 사용자 Gate가 PASS했으므로 최종 상태를 다음으로 확정한다.

```text
LUUX Signage Previz BASIC CORE = CLOSED
```
