# LUUX Signage Previz — Block 2 Pointer Validation

작성일: 2026-09-09

## 상태

```text
BLOCK 1: TECHNICAL PASS / USER PASS / CLOSED
BLOCK 2 CORE POINTER: AUTOMATED PASS / USER PASS
BLOCK 2 PREVIZ MARKER: AUTOMATED PASS / USER PASS
BLOCK 2 POINT-MODE MIDDLE PAN: AUTOMATED PASS / USER PASS
BLOCK 2 PORTABLE: AUTOMATED PASS / USER PASS
BLOCK 2: CLOSED
```

## Git 기준선

```text
Block 1 implementation: 004a0e01f5fef17f3ed3ec29c4f8f5dbc65a0e58
Block 1 closing commit: 1ff0f06633b583e5990085d6eb67b6f81f42e640
Block 2 starting HEAD:  1ff0f06633b583e5990085d6eb67b6f81f42e640
Branch:                  main
```

Block 1 종료 시 `npm test`, `npm run test:link`, 로컬/원격 HEAD 일치와 clean
working tree를 확인했다. Block 2 변경은 별도 working tree 변경으로 시작했다.

## Canonical Signage Coordinate

```text
Origin: top-left
X:      left → right
Y:      top → bottom
Pixel:  x = 0..width-1, y = 0..height-1
Normal: u = 0..1, v = 0..1
```

Renderer는 texture UV를 좌표 기준으로 사용하지 않는다.

```text
screen pointer
→ THREE.Raycaster
→ current image plane intersection
→ mesh.worldToLocal(hit.point)
→ imageX = localX + width / 2
→ imageY = height / 2 - localY
→ floor + document-boundary clamp
```

따라서 Block 1의 live texture UV flip과 독립적이며 camera zoom/pan을 직접
Photoshop pixel 비율로 환산하지 않는다.

## Interaction

- `NAVIGATE`: left/middle-button drag pan, wheel zoom.
- `POINT`: image plane의 left click만 pointer command로 변환, crosshair cursor.
- `POINT`에서도 middle-button drag는 pan이며 pointer command를 만들지 않는다.
- POINT mode에서도 wheel zoom은 유지하고 클릭 자체는 zoom/pan을 바꾸지 않는다.
- 4 px를 초과하는 pointer movement는 click으로 취급하지 않는다.
- canvas 밖, image plane 밖, UI panel click은 command를 만들지 않는다.
- Photoshop Live, renderer/UXP 연결, valid live metadata가 모두 있을 때만 POINT와
  CLEAR POINTER를 활성화한다.
- Original PNG/JPG/Small PNG local source에서는 pointer를 보내지 않는다.

## Previz Point Feedback

Photoshop의 다음 Full-Resolution frame을 기다리지 않아도 클릭 위치를 알 수 있도록
Renderer가 Canonical source coordinate를 다시 현재 camera에 투영한 고정 화면 크기
타깃 마커를 표시한다.

```text
PENDING:      yellow target — click accepted locally / ACK waiting
ACKNOWLEDGED: green target  — Photoshop POINTER_ACK received
ERROR:        red target    — DOCUMENT_MISMATCH 등 command rejected
CLEAR:        POINTER_CLEAR_ACK 뒤 제거
```

마커는 클릭 즉시 나타나며 FIT, 1:1, 200%, 400%, wheel zoom, pan과 live texture
교체에서도 동일한 원본 좌표를 따라간다. 클릭 당시 document ID와 dimensions에
묶여 있으므로 다른 Photoshop document frame으로 바뀌면 새 문서 위에 남지 않는다.
마커는 DOM overlay이며 Photoshop pixel, Full-Resolution texture, Three.js texture
count에는 영향을 주지 않는다.

## Reverse Protocol

기존 `luux-live-link` protocol/version 1과 full-frame binary 전송은 변경하지
않고 작은 JSON control message를 추가했다.

```text
Renderer → Broker → UXP
  POINTER_SET
  POINTER_CLEAR

UXP → Broker → Renderer
  POINTER_ACK
  POINTER_CLEAR_ACK
  POINTER_ERROR
```

`POINTER_SET`은 다음을 포함한다.

```text
requestId, sourceFrameId
documentId, documentName
width, height
x, y, u, v
```

Broker는 HELLO role/protocol을 전제로 role, request ID, document ID, dimensions,
pixel range, normalized range와 pixel/normalized 일관성을 검증한다. Broker는
유효한 command/response 내용을 변경하지 않고 relay한다.

오류 경로:

```text
UXP_DISCONNECTED
OUT_OF_RANGE
DUPLICATE_REQUEST
POINTER_IN_FLIGHT
DOCUMENT_MISMATCH
ROLE_VIOLATION
POINTER_TIMEOUT
```

Renderer는 pointer command 하나만 in-flight로 유지한다. 처리 중 click이 여러
번 들어오면 마지막 command 하나만 pending으로 남긴다.

## Photoshop Write

공식 Adobe UXP Imaging API를 사용한다.

- [Imaging API — createImageDataFromBuffer / putPixels](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/media/imaging)
- [Document — createLayer](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/classes/document)
- [Modal Execution](https://developer.adobe.com/photoshop/uxp/2022/ps-reference/media/executeasmodal)

```text
Layer:       __LUUX_POINTER__
Layer kind:  Pixel Layer / LayerKind.NORMAL
Patch:       25 × 25 maximum, RGBA Uint8Array
Color:       255,255,255,255
Write:       imaging.putPixels({ replace: true, targetBounds })
Mutation:    core.executeAsModal()
```

새 point는 `replace: true`로 helper layer의 이전 pixel을 버린 뒤 현재 patch만
기록한다. 동일 reserved-name Pixel Layer가 여러 개면 하나만 유지한다. 같은
이름의 non-pixel layer가 있으면 artwork 오인 삭제를 피하기 위해
`POINTER_LAYER_TYPE_MISMATCH`로 거부한다.

Patch는 요청 중심을 기준으로 문서 안쪽 `left/top/right/bottom`을 먼저 계산한
뒤 clipped width/height의 buffer만 만든다. `(0,0)` 또는 `(width-1,height-1)`
에서도 문서 밖 write가 없다. 생성한 `PhotoshopImageData`는 `finally`에서
dispose한다.

`POINTER_CLEAR`는 reserved helper layer만 제거한다. 사용자 artwork layer의
pixel에는 쓰지 않는다.

## Stale Document / Layer Safety

UXP는 modal scope 안에서 현재 Active Document를 다시 읽고 아래를 모두
검증한다.

```text
active document ID == request documentId
active document width == request width
active document height == request height
0 <= x < width
0 <= y < height
```

불일치 시 `DOCUMENT_MISMATCH` 또는 `OUT_OF_RANGE`를 반환하고 Photoshop을
수정하지 않는다.

Mutation 전 active layer ID 목록을 저장하고 helper 작업 후 Photoshop 2026의
`Document.activeLayers` setter로 복원을 시도한다. ACK와 UXP diagnostics에
`selectionRestored`를 기록한다. 삭제된 layer 등으로 완전 복원이 불가능하면
`false`로 명시하며, 다른 artwork layer를 임의 선택하지 않는다.

WebSocket ACK는 `executeAsModal()` 완료 후 전송한다. Auto Sync가 ON이면 pointer
history event가 기존 350 ms debounce를 거쳐 새 Full-Resolution frame을 보내는
것은 정상이다. Pointer ACK나 frame capture가 추가 pointer command를 생성하지
않으므로 재귀 경로는 없다.

## 자동 검증

### Canonical coordinate

4728×5760 기준 CENTER, 네 모서리 vicinity, arbitrary point를 FIT, 1:1, 200%,
400%, Pan camera에서 검사했다.

```text
Camera states: FIT / 1:1 / 200% / 400% / PAN
Points:        CENTER / 4 CORNERS / ARBITRARY
Forward assertions:          32
Marker projection assertions: 30
Total assertions:            62
Result:        PASS
```

### Pointer protocol / queue

```text
Renderer → Broker → Mock UXP: PASS
Mock UXP → Broker → Renderer ACK: PASS
POINTER_CLEAR_ACK: PASS
DOCUMENT_MISMATCH relay: PASS
OUT_OF_RANGE reject: PASS
UXP_DISCONNECTED reject: PASS
duplicate request reject: PASS
role violation reject: PASS
rapid click latest-wins 1 → 4: PASS
```

### Full-resolution link integration

Synthetic 4728×5760 live frame 2에서 renderer의 center POINT command를 실행했다.

```text
Source frame:      2
Requested:         2364, 2880
Applied ACK:       2364, 2880
Coordinate error:  0 px
Layer:             __LUUX_POINTER__
Pointer state:     READY
Previz marker:     ACKNOWLEDGED / VISIBLE
Result:            PASS
```

### Regression

```text
npm test:           PASS
npm run test:link:  PASS
Block 0 runtime:    PASS
Block 1 full-res:   PASS
Live zoom preserve: PASS
Texture count:      1
Context loss:       0
External network:   0
npm run test:portable: PASS
Portable packaged:     true
Portable hardware GPU: true
Portable EXE bytes:    157368755
```

## Photoshop 2026 User Pointer Check

사용자가 실제 Photoshop 2026에서 아래 항목을 모두 확인하고 문제없음을 선언했다.

```text
Basic point:             PASS
Observed requested:      1053,739
Observed applied:        1053,739
Coordinate error:        0.000 px
Reserved Pixel Layer:    __LUUX_POINTER__ / single transparent layer / PASS
FIT / 1:1 / 200% / 400%: PASS
Pan then point:          PASS
Rapid latest-wins:       PASS
CLEAR POINTER:           PASS
Artwork selection:       PRESERVED / PASS
Auto Sync ON / no loop:  PASS
Auto Sync OFF / Manual:  PASS
Stale document safety:   PASS
Different active doc:    previous document not modified / PASS
```

## Portable Photoshop 2026 User Check

Previz marker의 실제 표시와 위치 유지, POINT-mode middle-button pan은 사용자
PASS되었다. 최신 Portable EXE에서 Photoshop Live 연결, Full-Resolution Send,
point/marker, middle-button pan, clear, Auto Sync ON/OFF와 Manual Send를 최종
확인했으며 사용자가 PASS를 선언했다.

```text
PHOTOSHOP LIVE:                 PASS
FULL-RESOLUTION SEND:           PASS
POINT + PREVIZ MARKER:          PASS
POINT-MODE MIDDLE-BUTTON PAN:   PASS
CLEAR POINTER:                  PASS
AUTO SYNC ON/OFF + MANUAL SEND: PASS
PORTABLE USER VERDICT:          PASS
BLOCK 2:                        CLOSED
```
