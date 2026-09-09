# LUUX Signage Previz — Block 1 최종 인수인계

작성일: 2026-09-09
대상: 후속 설계 GPT / 개발 GPT
저장소: `C:\_InternalProjects\SignagePrevizMaster`

## A. Verdict

```text
BLOCK 0:  TECHNICAL PASS / USER VISUAL PASS / CLOSED
BLOCK 1A: MANUAL FULL-RES LINK / USER VISUAL PASS / CLOSED
BLOCK 1B: AUTO SYNC / USER FUNCTIONAL PASS
BLOCK 1:  PASS WITH WARNINGS / USER-APPROVED DESIGN HANDOFF
```

Photoshop 2026의 Active Document Composite를 원본 해상도로 캡처하여
localhost WebSocket으로 Electron/Three.js에 표시하는 Manual Send와 Auto
Sync 경로가 실제 환경에서 동작했다. 사용자는 Auto Sync 갱신 속도, 색상,
연결, 갱신 중 줌 유지까지 최종 확인하고 **“지시가 완벽히 수행되었습니다”**라고
승인했다.

경고는 기능 실패가 아니라 최종 증거 범위에 관한 것이다. 최신 소스로
Portable EXE를 재빌드하고 독립 실행 smoke test까지 PASS했지만, 그 재빌드본과
실제 Photoshop UXP를 연결한 Manual/Auto Sync 수동 세션은 아직 별도 증거가
없다. 사용자는 이 제한을 포함한 최종 인계 내용을 확인한 뒤 Block 1 결과의
commit/push와 설계 단계 인계를 명시적으로 지시했다.

## B. 구현된 전체 경로

```text
Photoshop edit
→ historyStateChanged notification
→ 350 ms quiet-period debounce
→ requestLatestFrame('auto')
→ one-frame-in-flight + dirty latest-wins
→ core.executeAsModal() 안에서 full-document capture/copy/dispose
→ modal scope 밖에서 2 MiB WebSocket chunk 송신 및 ACK 대기
→ Electron Main localhost broker
→ Electron Renderer
→ THREE.DataTexture full-resolution replacement
→ 현재 zoom / pan / view mode 유지
```

Manual Send도 동일한 `requestLatestFrame('manual')` 진입점과 동일 캡처/전송
구현을 사용한다. Auto Sync를 별도 캡처 파이프라인으로 만들지 않았다.

## C. Auto Sync

| 항목 | 결과 |
|---|---|
| Notification mechanism | `action.addNotificationListener()` |
| 개발용 조사 listener | `['all']`, 명시적 Start/Stop, 캡처와 분리 |
| Production event | `historyStateChanged` 단일 event |
| Debounce | 350 ms quiet period |
| One-frame-in-flight | 유지 |
| Latest-wins | 단일 `dirty` 상태로 유지 |
| Queue accumulation | event별 frame queue 없음 |
| Auto Sync OFF | debounce 취소, listener 제거, 자동 capture 중단 |
| Manual fallback | 항상 유지 |
| Listener lifetime | 동일 callback 1회 등록/정확한 callback 제거 |
| Diagnostics | Seen/Accepted/Debounced/Requested/Sent/Dirty/Last Event/latency |

직접 action event를 production listener에 함께 등록하지 않았다. 모든 대표
작업에서 이미 `historyStateChanged`가 관찰되었고 direct event까지 추가하면
동일 편집에 대한 중복 trigger가 발생할 수 있기 때문이다.

## D. Photoshop Operation Coverage

실제 Photoshop 2026 Event Probe에서 총 317개 notification을 관찰했다.

| Operation | Result | Observed Event / Method |
|---|---|---|
| Paint / Brush | SUPPORTED | `historyStateChanged` ×54 |
| Layer Visibility | SUPPORTED | `historyStateChanged` ×5; `hide` ×3, `show` ×2도 관찰 |
| Move | SUPPORTED | `historyStateChanged` ×3 |
| Transform | SUPPORTED | `historyStateChanged` ×1; `transform` ×1도 관찰 |
| Paste | SUPPORTED | `historyStateChanged` ×9; `paste` ×9도 관찰 |
| Layer Create | SUPPORTED | `historyStateChanged` ×7; `make`도 관찰 |
| Layer Delete | SUPPORTED | `historyStateChanged` ×1; `delete` ×1도 관찰 |
| Adjustment / Property | SUPPORTED | `historyStateChanged` ×29; `set` ×4도 관찰 |

## E. Full Resolution / Color

대표 실제 Photoshop frame:

```text
Document:    4728 × 5760
Capture:     4728 × 5760
Received:    4728 × 5760
Texture:     4728 × 5760
Components:  3
Bit depth:   8
Pixel format: RGB
Frame bytes: 81,699,840 bytes / 77.92 MiB
```

고정 캡처 조건:

```js
imaging.getPixels({
  documentID,
  colorSpace: 'RGB',
  colorProfile: 'sRGB IEC61966-2.1',
  componentSize: 8
})

photoshopImageData.getData({ chunky: true })
```

- Active Document 전체 composite만 캡처한다.
- `targetSize`, `sourceBounds`, 특정 layer capture를 사용하지 않는다.
- RGB 8-bit만 허용하며 16/32-bit 문서를 자동 변환하지 않는다.
- `PhotoshopImageData.dispose()`는 `finally`에서 실행한다.
- Photoshop sRGB capture 후 GPU `SRGB8` decode를 사용한다.
- 초기의 뿌연 색상 차이는 위 경로로 해결됐고 사용자 시각 PASS를 받았다.

## F. Performance

실제 Photoshop에서 관찰된 대표 frame 값:

| Capture size | Capture | UXP send | ACK |
|---|---:|---:|---:|
| 1920 × 2340 / 17.14 MiB | 18 ms | 5 ms | 58 ms |
| 4728 × 5760 / 77.92 MiB | 70 ms | 12 ms | 309 ms |

4728 × 5760 synthetic two-frame link test:

| Frame | Transfer | Texture upload | End-to-end |
|---|---:|---:|---:|
| 1 | 364 ms | 102.3 ms | 364 ms |
| 2 | 305 ms | 85.0 ms | 305 ms |

실제 대형 frame 화면에서 약 399 ms end-to-end도 관찰됐다. 이 값들은 목표값이
아니라 현재 PC와 문서에서 얻은 대표 기록이다. 사용자는 Auto Sync 갱신 속도를
만족할 만한 수준으로 판정했다.

## G. Stability / View Preservation

확인된 지표:

```text
Synthetic frames received / dropped / replaced: 2 / 0 / 1
Renderer texture count:                           1
Context loss:                                    0
WebGL error:                                     0
Connection:                                      maintained during user checks
Photoshop fatal freeze:                          not observed
Electron crash:                                  not observed
```

사용자는 연속 실제 편집에서 자연스러운 Auto Sync 반응을 확인했다. 다만
20–30회 안정성 세션의 정확한 update 총계와 min/typical/max 원시 로그는 보존된
증거에 없다. 후속 성능 기준을 수립할 때 별도 계측 세션을 권장한다.

### 갱신 시 줌 유지

초기 구현은 새 live texture가 적용될 때마다 `applyFit()`을 호출하여 줌을
리셋했다. 현재 구현은 다음과 같다.

- 첫 Photoshop Live frame: FIT 적용
- 이후 Manual/Auto Sync replacement: 현재 zoom, pan, view mode 유지
- 문서 또는 local source를 새로 여는 경우: 기존 초기 표시 규칙 유지

Synthetic link test는 frame 1 뒤 `200%`로 전환하고 frame 2 적용 후에도
`zoom: 2`, `viewMode: "200%"`인지 검사한다.

```text
viewBeforeSecondFrame: zoom 2 / 200%
viewAfterSecondFrame:  zoom 2 / 200%
liveViewPreserved:     true
```

사용자 실환경 확인도 PASS했다.

## H. Protocol / Security — 변경 금지 기준

```text
Protocol:                 luux-live-link
Protocol version:         1
Broker bind:              127.0.0.1:34100
UXP/renderer endpoint:    ws://localhost:34100
UXP Manifest allowlist:   ws://localhost/
Chunk size:               2 MiB
Backpressure high-water:  8 MiB
Reconnect delay:          1500 ms
ACK timeout:              120000 ms
Maximum frame:            512 MiB
```

설치된 Photoshop 2026 / UXP 9.4.1에서 `127.0.0.1` 기반 Manifest permission은
`Manifest entry not found`로 실패했다. 반드시 아래 조합을 유지한다.

```text
Runtime URL: ws://localhost:34100
Manifest:    ws://localhost/
Broker bind: 127.0.0.1 only
```

Electron 보안 회귀 결과:

```text
nodeIntegration: false
contextIsolation: true
sandbox: true
webSecurity: true
external network requests: 0
CDN: none
LAN exposure: none
```

## I. Regression

2026-09-09 최신 소스 기준:

| Check | Result |
|---|---|
| `npm test` | PASS |
| Static / UXP syntax | PASS |
| Protocol validation | PASS |
| Block 0 Electron runtime | PASS |
| `npm run test:link` | PASS |
| Live view preservation | PASS |
| `npm run dist` | PASS |
| `npm run test:portable` | PASS |
| `luux-mockup/` | ignored / unchanged |
| `_TestSource/` | ignored / unchanged |

Block 0 baseline 유지:

```text
WebGL:              WebGL 2.0
GPU:                NVIDIA GeForce RTX 5080 / D3D11
MAX_TEXTURE_SIZE:   16384
Local source set:   Original PNG / Original JPG / Small PNG
Texture count:      1
Context loss:       0
External requests:  0
```

## J. Portable EXE

```text
Path:         desktop-app/dist/LUUX Signage Previz.exe
Size:         157,360,851 bytes (약 150.07 MiB)
Architecture: Windows x64 portable
Build:        PASS
Launch smoke: PASS
Packaged:     true
GPU:          hardware rendering PASS
Full-res:     source = decoded = texture PASS
Actions:      FIT / 1:1 / 200% / 400% / pan / pixel / reload PASS
Memory:       8 reloads에서 texture count 1 유지
Context loss: 0
External net: 0
Critical error: none
```

EXE는 GitHub 일반 파일 크기 제한을 초과하므로 Git에 올리지 않는다. 소스,
build configuration, `package.json`, `package-lock.json`은 추적 대상이다.

Portable 독립 실행 smoke는 PASS했다. 그러나 이번 최종 재빌드본에 대해
`Portable EXE ↔ 실제 Photoshop 2026` Manual Send/Auto Sync를 다시 확인한
사용자 증거는 아직 없다. 이 항목이 Block 1의 유일한 명시적 검증 부채다.

## K. 주요 파일

```text
photoshop-uxp/luux-live-link/manifest.json
photoshop-uxp/luux-live-link/config.js
photoshop-uxp/luux-live-link/index.html
photoshop-uxp/luux-live-link/index.js
photoshop-uxp/luux-live-link/styles.css
photoshop-uxp/luux-live-link/README.md

desktop-app/src/live-link-config.json
desktop-app/src/live-link-broker.cjs
desktop-app/src/main.cjs
desktop-app/src/renderer.js
desktop-app/src/index.html
desktop-app/src/styles.css

desktop-app/tests/static-validation.mjs
desktop-app/tests/protocol-validation.mjs
desktop-app/tests/portable-validation.mjs

docs/BLOCK-1-MANUAL-CHECKPOINT.md
docs/BLOCK-1A-HANDOFF.md
docs/BLOCK-1B-AUTOSYNC-VALIDATION.md
docs/BLOCK-1-FINAL-HANDOFF.md
```

## L. Git 상태

```text
Branch:       main
Baseline:     91ac0aec4a65fb7bb3d6c3c07a405d9b16fea212
Remote:       https://github.com/series341000Lunar/SignagePrevizMaster.git
Block 1 commit: this handoff document를 포함한 closure commit
Push target:    origin/main
Working tree:   push 후 clean 상태 확인 예정
```

다음은 ignored 상태다.

```text
/luux-mockup/
/_TestSource/
/desktop-app/node_modules/
/desktop-app/build/
/desktop-app/dist/
/desktop-app/.runtime/
```

`package-lock.json`은 추적 대상이다. 전역 `safe.directory "*"` 설정을 사용하지
않았다. 최신 Portable EXE와 실제 Photoshop Live Link의 마지막 수동 확인은
후속 회귀 확인 항목으로 남기되, 사용자 지시에 따라 Block 1 closure commit과
`origin/main` push를 진행한다.

## M. 해결된 실환경 문제

1. UXP Connect 클릭이 무반응처럼 보임
   → WebSocket constructor 오류, 단계 상태, close code/reason, endpoint 표시.

2. `ws://127.0.0.1:34100` UXP permission 거부
   → `ws://localhost/` allowlist와 `ws://localhost:34100` runtime URL 조합.

3. `imaging.getPixels()` modal scope 오류
   → capture/copy/dispose만 `core.executeAsModal()` 안으로 이동.

4. Electron 표시가 뿌옇게 보이는 색상 차이
   → Photoshop 명시적 sRGB capture와 GPU `SRGB8` decode.

5. Auto Sync event 추측 위험
   → 실제 Event Probe 후 공통 `historyStateChanged`만 production에 채택.

6. Event storm / stale queue 위험
   → 350 ms debounce와 one-frame-in-flight + dirty latest-wins 결합.

7. 프레임 갱신마다 viewer zoom이 FIT으로 리셋됨
   → live texture replacement에서 camera/view state 보존.

## N. 설계 단계가 보존해야 할 경계

- Block 0 viewer와 Block 1 Full-Resolution path를 교체하거나 우회하지 않는다.
- Manual Send를 fallback/debug 기준 경로로 유지한다.
- Auto Sync가 별도 capture/send implementation을 갖지 않게 한다.
- `targetSize`, JPEG/WebP, preview/thumbnail 해상도를 성능 해결책으로 넣지 않는다.
- ACK 대기나 WebSocket 전송을 modal scope 안으로 옮기지 않는다.
- 16/32-bit 문서를 자동 변환하거나 원본 Photoshop 문서를 수정하지 않는다.
- broker를 `0.0.0.0`, LAN 또는 외부 relay에 노출하지 않는다.
- `domains: "all"`, CDN, Internet dependency를 추가하지 않는다.
- `luux-mockup/`, `_TestSource/`는 참조 전용으로 유지한다.
- Photoshop Pixel Write, 역방향 pointer, 3D scene, building, marker, drawing,
  NDI/video/webcam은 Block 1 경로와 분리하여 다음 Block에서 설계한다.

## O. 다음 담당자의 시작 순서

1. 이 문서와 `BLOCK-1B-AUTOSYNC-VALIDATION.md`를 읽는다.
2. 저장소 `main`의 최신 Block 1 closure commit을 기준선으로 삼는다.
3. 다음 Block 설계에서 N절의 경계를 보존한다.
4. 배포 후보를 확정할 때 최신 Portable EXE를 Photoshop UXP와 연결하여
   CONNECT, Manual Send, Auto Sync ON/OFF를 한 번 더 회귀 확인한다.
5. 장기 성능 기준이 필요하면 20–30회 세션의 원시 diagnostics를 별도 보존한다.

## P. 사용자 최종 판정

```text
Development Photoshop Live Link: USER PASS
Auto Sync responsiveness:        USER PASS
Color appearance:                USER PASS
Zoom/pan preservation:           USER PASS
Latest rebuilt Portable Live:    FINAL MANUAL CHECK PENDING
Block 1 commit/push:             USER AUTHORIZED
```

```text
READY FOR DESIGN HANDOFF
```
