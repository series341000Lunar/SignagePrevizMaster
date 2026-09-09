# LUUX Signage Previz — Block 1A 인수인계

작성일: 2026-09-09
대상: 후속 설계/개발 GPT
상태: **Block 1A Manual Full-Resolution Live Link — USER VISUAL PASS**

## 1. 현재 결론

Photoshop의 현재 Active Document Composite를 원본 해상도로 캡처하여
localhost WebSocket으로 Electron에 전송하고, 기존 Block 0 Three.js
viewer의 `DataTexture`로 표시하는 수동 경로가 실제 Photoshop 2026에서
동작한다.

```text
Photoshop active document composite
→ UXP Imaging API
→ RGB/RGBA Uint8Array
→ 2 MiB binary WebSocket chunks
→ Electron Main broker
→ Electron Renderer
→ THREE.DataTexture
→ 기존 Block 0 viewer
```

최종 사용자 확인 결과:

- Photoshop ↔ Electron 연결: PASS
- `SEND FULL RES`: PASS
- 문서/캡처/수신/텍스처 해상도 일치: PASS
- 방향 일치: PASS
- 반복 수동 전송: 관찰된 Frame ID 11
- Photoshop과 Electron의 sRGB 색상 시각 비교: **USER PASS**

Block 1 전체가 종료된 것은 아니다. 현재 완료 범위는 **Block 1A Manual
Send**이며, Auto Sync와 notification event coverage는 아직 구현하지 않았다.

## 2. 저장소 상태

```text
Repository: C:\_InternalProjects\SignagePrevizMaster
Remote:     https://github.com/series341000Lunar/SignagePrevizMaster.git
Branch:     main
Baseline:   91ac0aec4a65fb7bb3d6c3c07a405d9b16fea212
```

Block 1 변경사항은 아직 commit/push하지 않았다. `luux-mockup/`과
`_TestSource/`는 계속 ignored/read-only이며 수정하지 않았다. 중첩 Git
repository를 만들지 않았다.

현재 추적 대상 변경:

```text
M  README.md
M  desktop-app/package-lock.json
M  desktop-app/package.json
M  desktop-app/scripts/build.mjs
M  desktop-app/src/index.html
M  desktop-app/src/main.cjs
M  desktop-app/src/renderer.js
M  desktop-app/src/styles.css
M  desktop-app/tests/static-validation.mjs
?? desktop-app/src/live-link-broker.cjs
?? desktop-app/src/live-link-config.json
?? desktop-app/tests/protocol-validation.mjs
?? docs/BLOCK-1-MANUAL-CHECKPOINT.md
?? docs/BLOCK-1A-HANDOFF.md
?? photoshop-uxp/
```

## 3. 주요 파일

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
docs/BLOCK-1-MANUAL-CHECKPOINT.md
```

## 4. 고정 구성값

`desktop-app/src/live-link-config.json`과 UXP `config.js`가 같은 protocol 및
전송 값을 사용한다.

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

중요: UXP endpoint의 `localhost`와 Manifest의 끝 슬래시를 다시
`127.0.0.1` 또는 포트 포함 permission으로 되돌리지 말 것. 설치된
Photoshop 2026 / UXP 9.4.1은 아래 항목을 `Manifest entry not found`로
거부했다.

```text
ws://127.0.0.1:34100
ws://127.0.0.1
```

실제로 통과한 조합은 다음과 같다.

```text
Runtime URL: ws://localhost:34100
Permission:  ws://localhost/
Broker bind: 127.0.0.1 only
```

따라서 pixel data는 LAN/Internet에 노출되지 않는다. `domains: "all"`은
사용하지 않았다.

## 5. UXP 캡처 구현

패널은 다음 정보와 동작을 제공한다.

- Active Document 이름, dimensions, mode/depth
- Connection state와 reconnect
- `SEND FULL RES`
- Frame ID, capture size, bytes, capture/send/ACK 시간
- 상세 runtime error
- Auto Sync UI는 보이지만 Manual PASS 이후까지 잠겨 있음

캡처 특성:

- `layerID`, `sourceBounds`, `targetSize`를 지정하지 않는다.
- Active Document 전체 composite만 캡처한다.
- RGB 8-bit document만 허용한다.
- 16/32-bit 및 비-RGB 문서는 수정하지 않고 오류로 중단한다.
- `PhotoshopImageData.getData({ chunky: true })`를 사용한다.
- 반환 dimensions와 document dimensions를 매 frame 검증한다.
- `PhotoshopImageData.dispose()`는 `finally`에서 실행한다.
- 한 번에 frame 하나만 전송한다.
- 전송 중 추가 요청은 queue를 쌓지 않고 단일 `dirty` flag로 latest-wins
  처리한다.

Photoshop 2026에서는 `imaging.getPixels()`가 modal scope 밖에서 호출될 때
다음 오류를 냈다.

```text
The requested functionality is only allowed from inside a modal scope.
```

따라서 픽셀 취득, TypedArray 복사, `dispose()`만
`core.executeAsModal()` 안에서 처리한다. WebSocket 전송과 ACK 대기는 modal
scope 밖에서 수행하여 Photoshop UI를 불필요하게 잠그지 않는다.

## 6. 색상 처리

초기 raw RGB 경로는 프로파일 metadata가 빈 값으로 반환되어 Electron
이미지가 뿌옇게 보였다. 문서 프로파일 문자열만 추측하여 sRGB로 표시하는
방식도 실문서에서는 충분하지 않았다.

현재 구현은 `imaging.getPixels()`에 다음 출력을 명시적으로 요청한다.

```js
colorSpace: 'RGB'
colorProfile: 'sRGB IEC61966-2.1'
componentSize: 8
```

Photoshop의 색상 엔진이 캡처 buffer를 sRGB로 변환하며 원본 문서 자체는
수정하지 않는다. metadata에는 원래 document profile과 requested/returned
capture profile을 별도로 보존한다.

Renderer 처리:

- RGB: `THREE.RGBFormat` + WebGL2 sized internal format `SRGB8`
- RGBA: `THREE.RGBAFormat` + `THREE.SRGBColorSpace`
- 출력 진단: `Photoshop sRGB capture + GPU SRGB8 decode`
- RGB→RGBA 확장을 하지 않아 4728×5760 frame당 약 27.2 MiB의 추가 복사를
  피한다.

Three.js r186의 unsigned-byte RGB 자동 internal-format 선택만 사용하면
WebGL2 업로드가 안전하지 않아 `RGB8`/`SRGB8`을 명시한다.

## 7. 전송 및 수신

Frame protocol:

```text
HELLO
HELLO_ACK
LINK_STATUS
FRAME_BEGIN (JSON metadata)
BINARY CHUNKS
FRAME_END
FRAME_ACK
ERROR
```

Broker와 renderer는 다음을 검증한다.

- protocol/version/role
- 양의 정수 dimensions
- components 3 또는 4
- component size 8
- `totalBytes == width × height × components`
- 수신 byte count와 chunk count
- Document/Capture/Received/Texture dimensions 일치
- 한 frame만 in-flight

Renderer는 frame metadata를 받은 즉시 정확한 크기의 `Uint8Array` 하나를
preallocate한다. 중간 Canvas나 resize는 없다. 새 frame 적용 시 이전
texture/material/geometry를 dispose하고 Three.js renderer list를 정리한다.
상하 방향은 80 MiB buffer 복사 대신 geometry UV를 뒤집어 맞춘다.

## 8. Block 0 보존

Photoshop이 없어도 기존 local source viewer가 동작한다.

```text
Original PNG  4728×5760
Original JPG  4728×5760
Small PNG     1920×2340
```

다음 기능은 local source와 Photoshop Live source 모두 유지한다.

- FIT
- 1:1
- 200%
- 400%
- pan
- NORMAL / pixel inspection
- reload
- runtime diagnostics

Electron 보안 baseline도 유지한다.

```text
nodeIntegration: false
contextIsolation: true
sandbox: true
webSecurity: true
external network requests: 0
```

## 9. 최신 자동 검증 결과

2026-09-09 최종 코드 기준:

### `npm test`

PASS. 포함 항목:

- static validation
- UXP JavaScript syntax
- protocol validation
- Block 0 Electron runtime regression

Block 0 runtime 주요 결과:

```text
BLOCK0_TECHNICAL_PASS=true
WebGL: WebGL 2.0
GPU: NVIDIA GeForce RTX 5080 / D3D11
MAX_TEXTURE_SIZE: 16384
4728×5760 source/decoded/texture match: PASS
Texture count after reloads: 1
Context loss: 0
External requests: 0
```

### `npm run test:link`

PASS. 실제 Electron broker/renderer에 synthetic Photoshop client가
4728×5760 RGB frame 두 장을 전송한다.

```text
BLOCK1_SYNTHETIC_LINK_PASS=true
Frame bytes: 81,699,840 (77.92 MiB)
Chunks per frame: 39 at 2 MiB

Frame 1:
  Received: 4728×5760
  Texture:  4728×5760
  Texture update: 97.0 ms
  End-to-end:     348 ms

Frame 2:
  Received: 4728×5760
  Texture:  4728×5760
  Texture update: 84.6 ms
  End-to-end:     306 ms

Frames received/dropped/replaced: 2 / 0 / 1
Renderer texture count: 1
Context loss: 0
WebGL error: 0
Center pixel: [192, 192, 192, 255]
Color handling: Photoshop sRGB capture + GPU SRGB8 decode
External requests: 0
```

자동 보고서는 ignored runtime directory에 있다.

```text
desktop-app/.runtime/dev-runtime.json
desktop-app/.runtime/dev-runtime.png
desktop-app/.runtime/link-runtime.json
desktop-app/.runtime/link-runtime.png
```

## 10. 실제 실행 순서

Electron:

```powershell
cd C:\_InternalProjects\SignagePrevizMaster\desktop-app
npm ci
npm run dev
```

Photoshop UXP Developer Tool:

1. `photoshop-uxp/luux-live-link/manifest.json`을 Add Plugin 한다.
2. Photoshop 2026에 Load 한다.
3. Photoshop에서 `LUUX Live Link` 패널을 연다.
4. 자동 연결을 기다리거나 `CONNECT`를 누른다.
5. `CONNECTED` 후 `SEND FULL RES`를 누른다.

운영 규칙:

- UXP JavaScript/CSS/HTML만 변경: UDT `Reload`
- Manifest permission 변경: UDT `Unload → Load`; 캐시가 남으면 Photoshop
  재시작 후 재탑재
- Electron renderer/main 변경: Electron 재시작

## 11. 해결한 실환경 문제

1. UXP에서 `<dl>/<dt>/<dd>` 기반 진단 행이 표시되지 않음
   → `div/span` 기반 flex row로 교체.

2. 브라우저식 `socket.addEventListener()` 경로가 UXP에서 불안정
   → `socket.onopen/onmessage/onclose/onerror` 사용.

3. Connect가 무반응처럼 보임
   → WebSocket constructor `try/catch`, `CONNECTING/HANDSHAKING` 상태,
   close code/reason 및 endpoint 진단 추가.

4. `ws://127.0.0.1:34100` permission 거부
   → `ws://localhost/` allowlist + `ws://localhost:34100` runtime URL로 해결.

5. `imaging.getPixels()` modal scope 오류
   → `core.executeAsModal()` 내부 캡처로 해결.

6. Electron 색상이 뿌옇게 표시됨
   → Photoshop에서 명시적 sRGB capture + renderer의 정확한 sRGB GPU decode로
   해결. 사용자 시각 PASS.

## 12. 아직 하지 않은 작업

다음은 후속 설계/개발 판단이 필요하다.

- Block 1B Auto Sync
- 공식 Photoshop notification event 조사 및 대표 편집 operation coverage
- debounce 250–500 ms 및 latest-wins 실측
- Auto Sync 포함 20–30회 장기 안정성 테스트
- 최신 변경 기준 Portable EXE build 및 Photoshop live connection 검증
- Block 1 전체 기술 종료 판단
- 최종 `git status`/ignore/large-file 확인 후 commit 및 `origin/main` push

현재 Auto Sync checkbox는 의도적으로 비활성화되어 있다. Manual Send를
fallback/debug 기준 경로로 계속 유지해야 한다.

## 13. 후속 작업 시 지켜야 할 경계

- Block 0 viewer를 제거하거나 재설계하지 말 것.
- `luux-mockup/`, `_TestSource/`를 수정하거나 추적하지 말 것.
- WebSocket broker를 `0.0.0.0`, LAN IP, 외부 서버에 bind하지 말 것.
- `domains: "all"`을 사용하지 말 것.
- `targetSize` 또는 중간 Canvas resize를 추가하지 말 것.
- 16/32-bit 문서를 자동으로 8-bit로 변경하지 말 것.
- RGB→RGBA 전체 frame 복사를 성급하게 추가하지 말 것.
- Photoshop Pixel Write, 역방향 좌표, 3D scene, drawing, NDI/video 등 다음
  Block 기능을 이 경로에 섞지 말 것.
- `package-lock.json`은 반드시 추적할 것.
- 전역 `safe.directory "*"`를 설정하지 말고 명령별
  `git -c safe.directory=C:/_InternalProjects/SignagePrevizMaster ...`를 사용할
  것.

## 14. Git 종료 조건

현재는 Block 1A만 PASS했으므로 commit/push를 수행하지 않았다. Block 1의
합의된 종료 범위가 충족된 뒤 다음을 실행한다.

1. `git status`
2. `luux-mockup/`, `_TestSource/` 미추적 확인
3. 새 source/config/docs/package-lock 추적 확인
4. dependency/cache/build artifact 미추적 확인
5. 대형 artifact 크기 확인
6. Block 1 결과 commit
7. `origin/main` push
