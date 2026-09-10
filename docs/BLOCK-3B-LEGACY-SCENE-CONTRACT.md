# LUUX Signage Previz — Block 3B Legacy Scene Contract

작성일: 2026-09-09
상태: **TECHNICAL PASS / CONTRACT EXTRACTED**

## 조사 원칙

`luux-mockup/`은 ignored, read-only reference implementation으로 유지했다. 이
문서는 `luux-mockup/index.html`과 GLB 2.0 JSON/BIN chunk를 직접 조사한 결과다.
Standalone runtime은 해당 디렉터리나 CDN에 의존하지 않는다.

```text
Primary source of truth: luux-mockup/index.html
GLB inspected:          luux-mockup/assets/Merged_Full_Format_v2.glb
GLB bytes:              6,169,280
GLB SHA-256:            125264CC2DF826F5F698330B7A37D5FAE372ED85AD462102DEBCA8B61D97F2C1
Generator:              Khronos glTF Blender I/O v4.5.48
```

## Asset/load 계약

레거시 HTML의 기본 asset은 `./assets/Merged_Full_Format_v2.glb` 한 개다
(`index.html:731-732`). `GLTFLoader`로 한 번 로드한 뒤 LUUX slot은 원본
`gltf.scene`, ILMIN slot은 `gltf.scene.clone()`을 사용한다
(`index.html:1130-1140`). scene root에 추가적인 position/rotation/scale은 적용하지
않는다. GLB scene 자체는 identity이며 아래 node transform을 그대로 보존한다.

배경 이미지는 별도 camera-child plane용이며 actual signage surface geometry가 아니다.

| Variant | Background |
|---|---|
| `front` | `bg_front.jpg` |
| `frontSweetSpot` | `bg_sweet.jpg` |
| `back` | `bg_back.jpg` |
| `backNight` | `bg_night.jpg` |

## GLB hierarchy

GLB에는 scene 1, root node 6, mesh 6, material 1, camera 0, animation 0이 있다.
모든 node는 root이며 child hierarchy가 없다. 각 mesh는 triangle primitive 1개다.

| Node / actual selector name | Node T | Node S | Vertices | Indices | UV channels |
|---|---:|---:|---:|---:|---|
| `LUUX_F_Sweet` | `2.306321,2.396667,0.836945` | `0.01` | 23,100 | 136,206 | 0, 1 |
| `LUUX_B_Night` | same | `0.01` | 11,778 | 60,714 | 0, 1, 2 |
| `LUUX_Back` | same | `0.01` | 11,701 | 60,765 | 0, 1, 2 |
| `LUUX_Front` | same | `0.01` | 23,100 | 136,206 | 0, 1 |
| `ILMIN_B_Night` | `-1.557461,3.290496,-3.619172` | `0.01` | 30,591 | 179,889 | 0 |
| `ILMIN_Back` | same | `0.01` | 30,465 | 179,145 | 0 |

모든 node rotation은 quaternion identity다. `LUUX_F_Sweet`과 `LUUX_Front`는
index topology hash가 같지만 POSITION과 UV accessor hash가 다르다. 이는 두
mesh가 별도 geometry/UV asset이라는 뜻일 뿐 anamorphic mapping을 의미하지 않는다.

주요 UV0 observed range:

| Surface family | U range | V range |
|---|---:|---:|
| LUUX Front/Sweet | 약 `0.146545 … 1.0` | 약 `0.0 … 1.0` |
| LUUX Back/Night | 약 `0.0 … 0.388863` | 약 `0.0 … 1.0` |
| ILMIN Back/Night | 약 `0.0 … 1.000001` | `0.0 … 1.0` |

GLB material `Material #66`은 double-sided PBR material이나 레거시는 선택된
signage mesh에서 이를 폐기하고 unlit `MeshBasicMaterial`로 교체한다.

## Mesh selector와 visibility 계약

선택 규칙은 exact-name hardcode가 아니라 다음 포함 조건이다
(`index.html:1070-1101`).

```text
isMatch = child.isMesh
       && child.name.includes(slot.prefix)
       && child.name.includes(sceneVariant.suffix)
```

slot prefix는 `LUUX`, `ILMIN`; suffix는 `Front`, `F_Sweet`, `Back`, `B_Night`다.
각 clone root를 traverse하며 non-match mesh는 모두 숨긴다. match가 여러 개면
traversal의 마지막 match가 `targetMesh`가 되는 레거시 동작도 계약에 기록한다.

실제 조합:

| Scene variant | suffix | LUUX match | ILMIN match |
|---|---|---|---|
| `front` | `Front` | `LUUX_Front` | 없음 |
| `frontSweetSpot` | `F_Sweet` | `LUUX_F_Sweet` | 없음 |
| `back` | `Back` | `LUUX_Back` | `ILMIN_Back` |
| `backNight` | `B_Night` | `LUUX_B_Night` | `ILMIN_B_Night` |

따라서 실제 surface role은 위 6개다. 사전 제안 이름
`FRONT_ANAMORPHIC`은 asset에서 발견되지 않았으므로 만들지 않는다.
사용자 계약에 따라 actual node `LUUX_F_Sweet`은 Front 계열 surface이며
Standalone 공개 role은 정확히 `Front_Sweet`으로 식별한다.

## Camera 계약

GLB 내부 camera는 없다. HTML이 `PerspectiveCamera`를 생성하고 직접 Euler XYZ를
설정한다. target/lookAt/OrbitControls는 존재하지 않는다.

```text
Type:          PerspectiveCamera
Aspect:        fixed 1.5
Near / Far:    0.1 / 10000
Rotation:      direct THREE.Euler XYZ, degrees converted to radians
Target:        none
Quaternion:    derived from Euler only; no stored source quaternion
```

| Scene | FOV | Position | Euler XYZ degrees |
|---|---:|---|---|
| `front` | 52.4 | `[-8.587, 1.4, 12.330]` | `[16.5, -39.5, 10.3]` |
| `frontSweetSpot` | 49.2 | `[-7.243, -0.031, 12.760]` | `[22.3, -34.5, 13.1]` |
| `back` | 46.4 | `[-9.869, 0.04, -9.425]` | `[-30.1, -130.95, -24.6]` |
| `backNight` | 47.9 | `[-9.869, 0.04, -9.425]` | `[-29.3, -132.3, -21.9]` |

Optical zoom은 camera position이나 `camera.zoom`이 아니라 FOV를 다음 식으로
바꾼다. zoom은 `1 … 10`이다.

```text
zoomedFov = 2 * atan(tan(baseFov / 2) / zoom)
```

Lens shift는 `-100 … 100`, 기본값 0이며 projection matrix를 직접 쓰지 않고
`camera.setViewOffset()`을 사용한다.

```text
effectiveShift = UI shift * currentCameraZoom
offsetX = -effectiveShiftX * 0.005 * viewportWidth
offsetY =  effectiveShiftY * 0.005 * viewportHeight
```

resize는 화면을 1.5 aspect letterbox하고 camera aspect도 항상 1.5로 둔다.

## Display mapping 계약

선택 signage mesh material은 다음 unlit 계약으로 교체된다.

```text
MeshBasicMaterial
transparent: true
opacity: 1
side: DoubleSide
depthTest / depthWrite: true
toneMapped: false
color: tint * emissive gain
```

기본 texture transform:

```text
UV channel: TEXCOORD_0 (Three.js material.map default)
flipY:      false
offset:     [0, 0]
repeat:     [1, 1]
rotation:   0, around Three.js default texture center [0, 0]
wrap:       ClampToEdgeWrapping
```

UI의 16:9 preset은 기본값이 아니며 사용자가 눌렀을 때만 적용된다.

| Slot | offset | repeat |
|---|---|---|
| LUUX | `[0.2691, 0]` | `[0.4617, 1]` |
| ILMIN | `[0, 0.2247]` | `[1, 0.5506]` |

flip은 repeat 부호로, rotation은 90-degree quarter turn으로 구현한다. 별도 shader,
homography, projection texture 또는 UV channel 선택 UI는 없다.

## Hit/canonical mapping 계약

레거시 HTML에는 `Raycaster`, `intersection.uv`, pointer write 또는 canonical
coordinate 구현이 **없다**. 사용자 GLB 검토 결과, 현재 모든 surface는 일반 평면
UV mapping이다. reverse hit mapping은 이 확인을 기준으로 3C에서 검증한다.

3C 계약:

```text
intersection.uv on registered signage mesh
→ active surface의 일반 TEXCOORD_0 mapping
→ 표시 방향과 top-left canonical 방향을 분리한 adapter
→ existing Block 2 canonicalToPixel / POINTER_SET
```

이는 screen coordinate 비례 계산이 아니며 camera와 독립적이다. 실제 GLB
surface의 center/corners/arbitrary-point를 Photoshop pointer와 비교하여 방향을
검증한다.

## Sweet와 Anamorphic 보류 계약

현재 어느 surface에도 anamorphic mapping은 없으며 모두 일반 평면 UV mapping이다.
`Front_Sweet`은 회사의 주력 anamorphic 기준 **시점**을 나타내지만 현재 anamorphic
용 모델링/UV는 준비되지 않았다. 따라서 현 단계에서 왜곡, 보정 shader, homography,
inverse anamorphic mapping을 작성하지 않는다.

UI/SceneProfile에는 `NORMAL`/`ANAMORPHIC` mode 경계만 둔다. 갱신된 3D World의
예약 mesh 이름은 `LUUX_Front_3Dworld_Anamorphic`,
`ILMIN_Back_3Dworld_Anamorphic`이다. 현재 GLB에 없으므로 ANAMORPHIC은
`NONE`/disabled이며 화면, raycast, pointer 조작을 모두 막는다.

Legacy 2D World의 각 view용 anamorphic mesh 이름은 아직 정해지지 않았으므로
추측하지 않고 mode 자리만 예약한다.

## World별 surface 계약

### 3D World

```text
NORMAL:       LUUX_Front_3Dworld_Basic + ILMIN_Back_3Dworld_Basic
ANAMORPHIC:   LUUX_Front_3Dworld_Anamorphic + ILMIN_Back_3Dworld_Anamorphic (reserved / currently NONE)
```

### Legacy 2D World

| SceneManager view | 현재 일반 mapping mesh | 의미 |
|---|---|---|
| `Front` | `LUUX_Front` | 건물 2층 촬영 시점 |
| `Front_Sweet` | `LUUX_F_Sweet` | 회사 주력 anamorphic 기준 시점; 현재 ANA mesh 없음 |
| `Back` | `LUUX_Back` + `ILMIN_Back` | 원통 뒷면, 광화문에서 남쪽 방향 |
| `Night` | `LUUX_B_Night` + `ILMIN_B_Night` | Back과 같은 방향의 야간 촬영본 |

현재 Legacy 2D World mesh는 기존 SceneManager와 1:1 대응한다. 추후 view별
anamorphic UV mesh가 제공되기 전까지 ANAMORPHIC은 `NONE`/disabled다.

## Standalone SceneProfile 계약

3C에서는 다음 정보를 정적 profile로 옮긴다.

```text
SceneProfile
  assetFile + expectedSha256
  selector: prefixIncludes + variantSuffixIncludes
  worlds[]: 3D World + Legacy 2D World
  mappingModes[]: NORMAL + ANAMORPHIC
  variants[]: id + suffix + perspective camera contract
  surfaces[]: actual role + actual node name + displayMapping + hitMapping adapter
  missing surface set: NONE + disabled controls + no raycast
```

GLB node transform과 scene root identity는 loader가 그대로 보존한다. raycast 대상은
profile로 등록된 현재 visible signage mesh만 허용한다.

## Uncertainties / review disposition

```text
CONFIRMED
  GLB asset, hashes, hierarchy, transforms, mesh names
  selector/visibility behavior
  camera presets and projection controls
  material replacement and display texture transforms
  Sweet variant is a Front viewpoint with normal planar UV mapping

3C USER VALIDATION REQUIRED
  canonical top-left orientation against GLB UV0
  center/corners/arbitrary coordinate accuracy
  NORMAL mode visual selection

DEFERRED BY CONTRACT
  all anamorphic mapping and geometry
  Legacy 2D World anamorphic mesh names
  16:9 UI preset (optional legacy operation, not Photoshop Live default)
```

Block 3B는 모호한 값을 임의 확정하지 않고 위 검증 책임을 3C acceptance gate로
명시했으므로 완료한다.

```text
BLOCK 3B LEGACY INSPECTION: PASS
BLOCK 3B CONTRACT:          PASS
BLOCK 3B:                   CLOSED
```
