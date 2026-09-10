# LUUX Signage Previz — Block 3A Plane Validation

작성일: 2026-09-09
상태: **TECHNICAL PASS / USER PASS / CLOSED**

## 기준선과 범위

```text
Repository:           C:\_InternalProjects\SignagePrevizMaster
Branch:               main
Block 2 closing HEAD: 383fdf016ddf99bc1cb3fcac84cddbffc060c800
Block 0–2:            CLOSED
Block 3A:             CLOSED
Block 3B:             IN PROGRESS
```

Block 3A는 GLB 없이 `PerspectiveCamera + PlaneGeometry + OrbitControls`만으로
3D signage surface에서 기존 Canonical/Photoshop pointer 계약까지 연결한다.
`luux-mockup/`은 이번 단계에서 읽거나 수정하지 않았다.

## View와 입력 계약

```text
2D VIEW
  기존 FIT / 1:1 / 200% / 400% / Pan / Pixel Inspection 유지

3D PLANE — NAVIGATE
  Left drag:   Orbit
  Middle drag: Pan
  Wheel:       Dolly

3D PLANE — POINT
  Left click <= 4 px: 기존 POINTER_SET
  Left drag  >  4 px: Orbit only / no pointer
  Middle drag:        Pan only / no pointer
  Wheel:              Dolly
```

3D plane은 현재 source aspect ratio를 사용한다.

```text
Plane width:  1.0
Plane height: sourceHeight / sourceWidth
4728×5760:    1.0 × 1.218274111675127
```

## Texture Ownership

2D material과 3D signage material은 동일한 `THREE.Texture` 객체를 참조한다.
live frame마다 `THREE.DataTexture`는 한 번만 생성하며 2D/3D view 때문에 pixel
buffer나 GPU texture를 복제하지 않는다.

```text
Master live DataTexture: 1
2D material.map:         master texture
3D material.map:         master texture
Observed texture count:  1
```

Display orientation은 geometry UV로 처리하고 hit mapping은 UV를 신뢰하지 않는다.

## Surface → Canonical Contract

3D raycast 경로:

```text
Screen Pointer
→ THREE.Raycaster / active 3D plane only
→ intersection world point
→ plane.worldToLocal()
→ u = localX / planeWidth + 0.5
→ v = 0.5 - localY / planeHeight
→ x = min(width - 1, floor(u × width))
→ y = min(height - 1, floor(v × height))
→ existing Block 2 POINTER_SET
```

Canonical origin은 top-left, X right, Y down이며 Block 2 protocol과 UXP write
경로는 변경하지 않았다.

## 3D Marker

3D marker는 `view + mesh UUID + mesh local hit point + canonical + document ID`에
묶인다. Photoshop pixel과 texture에는 그리지 않으며 DOM overlay로 투영한다.

```text
PENDING:      yellow
ACKNOWLEDGED: green
ERROR:        red
```

Orbit/Pan/Dolly의 camera change마다 동일 mesh local point를 다시 screen-space로
투영한다. document가 바뀌면 Block 2와 동일하게 제거한다.

## 자동 검증

### Perspective camera independence

```text
Camera states: FRONT / LEFT_OBLIQUE / RIGHT_OBLIQUE
               TOP_OBLIQUE / BOTTOM_OBLIQUE
               ZOOM_IN / ZOOM_OUT / PAN
Points:        CENTER / 4 CORNERS / ARBITRARY
Mappings:      8 × 6 = 48
Max error:     0 px
Result:        PASS
```

### Full-Resolution link integration

하나의 synthetic 4728×5760 live texture를 2D와 3D view가 공유한 상태에서 기존
Photoshop protocol을 연속 검증했다.

```text
2D requested/applied: 2364,2880 / 2364,2880
2D error:             0 px
3D requested/applied: 1053,739 / 1053,739
3D error:             0 px
3D marker:            ACKNOWLEDGED / VISIBLE
Marker camera move:   screen position changed / canonical preserved
Texture shared:       true
Texture count:        1
Context loss:         0
External network:     0
Result:               PASS
```

### Regression

```text
npm test:          PASS
npm run test:link: PASS
Block 0:           PASS
Block 1:           PASS
Block 2:           PASS
Electron security: PASS
```

한 차례의 `EADDRINUSE`는 사용자가 실행 중이던 오래된 Block 2 인스턴스가
`127.0.0.1:34100`을 점유한 환경 충돌이었다. 해당 인스턴스 종료 후 동일 테스트가
PASS했으므로 3A 결함으로 분류하지 않는다.

## 사용자 체크포인트

실제 Photoshop Live document에서 다음을 확인한다.

1. `2D VIEW`의 기존 Send/Auto Sync/Point/Clear/zoom/pan이 그대로 동작한다.
2. `3D PLANE`에 현재 Full-Resolution Photoshop texture가 같은 방향으로 보인다.
3. NAVIGATE에서 left orbit, middle pan, wheel dolly를 확인한다.
4. POINT에서 짧은 left click만 Photoshop point를 만들고 green marker가 보인다.
5. POINT에서 left drag는 orbit하며 Photoshop point가 추가되지 않는다.
6. POINT에서 middle drag는 pan하며 Photoshop point가 추가되지 않는다.
7. 정면과 좌/우/상/하 사선, zoom, pan 후 식별 가능한 같은 surface 위치를
   클릭하여 Photoshop requested/applied 오차가 1 px 이내인지 본다.
8. marker가 Orbit/Pan/Dolly 이후에도 클릭한 3D surface 지점을 따라가는지 본다.
9. Auto Sync와 Clear Pointer가 기존처럼 동작하는지 본다.

사용자가 실제 Photoshop Live 환경에서 2D 회귀, 3D plane 표시, Orbit/Pan/Dolly,
POINT click/drag 분리, Photoshop pointer, surface-following marker, Auto Sync 및 Clear
Pointer를 확인했다.

```text
BLOCK 3A TECHNICAL: PASS
BLOCK 3A USER:      PASS
BLOCK 3A:           CLOSED
```
