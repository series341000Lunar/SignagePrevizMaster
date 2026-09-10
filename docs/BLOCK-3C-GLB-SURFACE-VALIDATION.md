# LUUX Signage Previz — Block 3C GLB Surface Validation

작성일: 2026-09-09
상태: **AUTOMATED CONTRACT PASS / USER PASS**

## 구현 범위

3D World와 Legacy 2D World를 서로 다른 tracked asset으로 분리했다. ignored
reference 경로는 runtime에 포함되지 않는다.

```text
3D World:    3DAsset/Signage/Previz_3Dworld_BasicMapping.glb
Bytes:       3,243,084
SHA-256:     5F86D3FFEB1AC5D6D5048DCC1E99525C3038BFACC63A7A07088BDBBF5A3908D3
Legacy:      desktop-app/assets/site/Merged_Full_Format_v2.glb
Bytes:       6,169,280
SHA-256:     125264CC2DF826F5F698330B7A37D5FAE372ED85AD462102DEBCA8B61D97F2C1
Loader:      bundled local GLTFLoader
CDN:         none
```

`SITE 3D`는 기존 `2D VIEW`, `3D PLANE`을 대체하지 않고 추가된다. 실제 GLB의
scene/node transform을 그대로 보존하고 profile에 등록된 현재 surface만 visible 및
raycast 대상으로 둔다.

## World / Mapping 계약

### 3D World

```text
NORMAL:       LUUX_Front_3Dworld_Basic + ILMIN_Back_3Dworld_Basic
ANAMORPHIC:   LUUX_Front_3Dworld_Anamorphic + ILMIN_Back_3Dworld_Anamorphic
               현재 asset에 없음 → NONE
```

NORMAL selector는 정확한 node 이름 두 개만 허용한다. 현재 3D World GLB에는 이
두 node만 존재한다. 향후 다른 mesh나 예약 mesh가 같은 GLB에 추가되어도 NORMAL
mode에 섞이지 않는다.

### Legacy 2D World

```text
Front:        LUUX_Front
Front_Sweet:  LUUX_F_Sweet
Back:         LUUX_Back + ILMIN_Back
Night:        LUUX_B_Night + ILMIN_B_Night
```

Legacy ANAMORPHIC mesh 이름은 아직 정해지지 않았으므로 추측하지 않고 `NONE`으로
보류한다.

## Missing surface safety

ANAMORPHIC 또는 정의되지 않은 surface set을 선택하면:

```text
visible site meshes: 0
active raycast list: 0
OrbitControls:       disabled
POINT:               disabled
pointer command:     not generated
diagnostics:         missing mesh names / NONE
```

부분적으로 발견된 mesh만 표시하는 fallback도 허용하지 않는다. 필요한 set 전체가
확인되어야 활성화된다.

## Texture와 canonical mapping

현재 모든 surface는 일반 평면 UV mapping이다. Anamorphic 보정은 구현하지 않았다.

```text
Screen
→ Raycaster
→ active registered GLB mesh only
→ intersection.uv / TEXCOORD_0
→ normalizedPointToCanonical()
→ existing Block 2 POINTER_SET
→ Photoshop __LUUX_POINTER__
```

GLB surface materials는 unlit `MeshBasicMaterial`로 교체되지만 모든 활성 material의
`map`은 2D/3D Plane과 같은 master Full-Resolution texture 객체를 참조한다. surface
수만큼 `DataTexture`를 복제하지 않는다.

3D marker는 actual mesh UUID + mesh local hit point + canonical + document ID에
묶이며 camera 이동 뒤 같은 surface 지점을 다시 투영한다. variant/world/document가
바뀌면 이전 marker를 제거한다.

## 자동 검증 결과

```text
Static/security/offline validation: PASS
Protocol/canonical regressions:      PASS
Tracked GLB bytes/hash:              PASS
Actual GLB parse:                    PASS
3D World GLB mesh count:             2
3D World NORMAL active surfaces:     2
Inactive 3D World surfaces:          0
Actual geometry raycast + UV:        PASS (LUUX_Front_3Dworld_Basic, ILMIN_Back_3Dworld_Basic)
Marker projection after camera move: PASS
ANAMORPHIC missing detection:        PASS
ANAMORPHIC visible/raycast surfaces: 0
```

자동 Electron GPU smoke는 이 checkpoint 실행 시 Windows GPU subprocess가 renderer
생성 전에 `0xC0000135`로 종료되어 완료되지 않았다. 동일 로직의 asset parse,
selector, actual geometry raycast, canonical adapter 및 marker projection은 Node 기반
Three.js 검증에서 PASS했다. 하드웨어 GPU와 실제 Photoshop 경로는 아래 사용자
checkpoint에서 확인한다.

## 사용자 체크포인트

1. Photoshop Live 연결 후 Full Res를 전송한다.
2. `SITE 3D` → `3D WORLD` → `NORMAL`에서 `LUUX_Front_3Dworld_Basic + ILMIN_Back_3Dworld_Basic`만 보이는지 본다.
3. Orbit/Pan/Dolly 후 두 surface를 각각 POINT하고 Photoshop 위치와 marker를 본다.
4. `LEGACY 2D WORLD`의 `Front`, `Front_Sweet`, `Back`, `Night`가 위 계약의 mesh만
   표시하는지 확인한다.
5. 각 view에서 center/corner vicinity/arbitrary point를 확인한다.
6. `ANAMORPHIC (NONE)`을 선택하면 surface가 사라지고 POINT/조작이 차단되며
   missing mesh가 diagnostics에 표시되는지 확인한다.
7. NORMAL로 복귀했을 때 surface와 조작이 정상 복원되는지 확인한다.
8. 기존 2D VIEW/3D PLANE, Auto Sync, Clear Pointer가 그대로 동작하는지 확인한다.

```text
BLOCK 3C AUTOMATED CONTRACT: PASS
BLOCK 3C USER:               PASS
```

사용자는 최종 2-mesh `Previz_3Dworld_BasicMapping.glb`에서 3D World 표시와
Photoshop → Previz 및 Previz → Photoshop 양방향 링크가 정상 작동함을 확인했다.
