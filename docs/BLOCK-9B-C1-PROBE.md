# Block 9B-C1 — Photoshop Pixel Layer + user Layer Mask probe

## 판정

**STATUS: CLOSED / UNSUPPORTED / NON-BLOCKING.** 실제 Photoshop 2026에서 `FROM PHOTOSHOP SELECTION`은 마스크가 있는 보통 Pixel Layer를 받아들이지만, 반환된 Snapshot PNG에는 사용자 Layer Mask의 투명 구멍과 Feather가 반영되지 않았다. 단순 하드 마스크가 처음에 맞아 보인 것은 보이는 왼쪽 절반으로 `boundsNoEffects`가 줄어든 효과였다. 같은 경계 안에 투명 구멍을 추가하자 PNG는 이전 하드 마스크와 바이트 단위로 동일했다. 따라서 이 경로를 마스크의 **visible isolated RGBA** 지원으로 선언할 수 없다.

- **Implementation:** NONE (probe/documentation only).
- **Further implementation:** NOT PLANNED, including Mask Guard.
- **Workaround:** 원본 보존이 필요하면 Photoshop에서 레이어/작업 복제본을 만든 뒤 user Layer Mask 결과를 일반 Pixel Layer로 적용·병합·래스터화하고, 그 마스크 의존성이 없어진 일반 Pixel Layer에 `FROM PHOTOSHOP SELECTION`을 사용한다. 원본 artwork는 자동 변경하지 않는다.

이 미니블록에서는 제품 코드, Snapshot 프로토콜, schema를 변경하지 않았다. 마스크 합성 구현이나 우회 경로도 추가하지 않았다.

## 기준 및 범위

- 확인한 브랜치/HEAD: `main`, `6aa4763b3a2f6c1ab1c36694c37e3030bd9c3e58` (`Add Planar B output workflow and runtime smoke coverage`). 시작 시 작업 트리는 깨끗했고 `origin/main` 추적 상태였다. 직전 커밋은 `c5ecc8f`, `a56bacb`.
- 실제 호스트: Adobe Photoshop 2026, ProductVersion `27.10`, FileVersion `27.10 (20260824.r.26 9d9635d)`; Windows, 2026-09-14 (KST).
- 사용자가 열어 둔 기존 `제목 없음-1` 문서는 건드리지 않았다. 별도의 저장하지 않은 테스트 문서 `제목 없음-2`(Photoshop document ID 229)를 사용했다. RGB 8-bit, sRGB, 1024 × 1024, 투명 배경, 보통 Pixel Layer `레이어 1`(ID 2) 하나에 Photoshop **user Layer Mask** 하나. 채워진 원본 픽셀 영역은 문서 좌표 약 `x=224..769`, `y=215..772`의 진한 자홍색 직사각형이다. Smart Object, 그룹, Adjustment Layer, clipping, Layer Style은 없다.
- SMG는 `SITE 3D / ANAMORPHIC / FRONT 75F`에서 연결했다. 작업 해상도 `3000 × 3840`과 테스트 문서 `1024 × 1024`가 달라 매 가져오기마다 해상도 경고를 승인했다. 따라서 아래 위치 확인은 **정수 픽셀 경계/현행 배치 계산**에 대한 것이며, 동일 해상도 최종 시각 보정의 PASS가 아니다.

## 경로와 관측 방법

`photoshop-uxp/luux-live-link/index.js`의 `captureSnapshot`은 선택된 레이어가 정확히 하나이고 `LayerKind.NORMAL`인지 확인하고, `selectedLayerOpacity = layer.opacity / 100`, `sourceBounds = layer.boundsNoEffects`를 읽은 뒤 `imaging.getPixels({documentID, layerID, sourceBounds, colorSpace:'RGB', colorProfile:'sRGB IEC61966-2.1', componentSize:8})`를 실행한다(1292–1337행). 반환 `sourceBounds`와 이미지 크기의 1:1, pyramid level 0, RGB8/RGBA8, 선택·문서·opacity·history 안정성을 확인하고 이미지 데이터를 `dispose()`한다(1338–1413행). 이 코드에는 Layer Mask의 유효 알파를 별도로 취득하거나 적용하는 절차가 없다. `hasAlpha: true`와 `PHOTOSHOP_IMAGING_RGBA8_PROBE_PENDING` 표시는 **실제 알파값이 투명함을 증명하지 않는다**.

UI로 각 마스크 상태와 Photoshop 캔버스의 보이는 모양을 확인하고 기존 `FROM PHOTOSHOP SELECTION`을 실행했다. 저장된 프로젝트의 첫째(최신) 레이어 `source.provenance.captureBounds`, PNG 원본 크기·RGBA 샘플·알파값 집합·SHA-256을 확인했다. 결과 파일은 재현 조사용으로 무시되는 `desktop-app/.runtime/block9bc1-*/` 아래에 보존했다. 각 폴더에 `project.json`과 `assets/`가 있다.

| 경우 | Photoshop의 보이는 상태 | Snapshot 결과 | 판단 및 증거 |
| --- | --- | --- | --- |
| A — Density 100%, Feather 0 px, Opacity 100% | 오른쪽 절반이 숨겨지고 왼쪽만 보임 | `captureBounds=[224,215,497,772]`, PNG `273 × 557`, 알파 집합 `{255}`; 배치 중심 `x=0.1201666667`, `y=0.128515625` | 경계가 보이는 절반으로 줄었으므로 외관만으로 마스크 지원을 판정할 수 없음. `.runtime/block9bc1-hard/`, SHA-256 `430E0758A4476772397C3E67797E6C8B24E296AFAFA03066083B7AF59D434342`. |
| A 보강 — 위 하드 마스크의 **보이는 절반 내부**에 검은 사각형 구멍 | Photoshop은 안쪽에 투명 checkerboard 구멍을 표시; Density 100%, Feather 0 px, Opacity 100% | 같은 경계 `273 × 557`; 구멍 중앙에 해당하는 PNG `(130,260)`의 RGBA는 `[144,50,105,255]`; 전체 알파 `{255}`. **A와 SHA-256 동일** | 완전히 마스크된 내부 픽셀이 투명하게 오지 않았다. `.runtime/block9bc1-hard-hole/`, 첫째 PNG `assets/asset-a13052baf45d-0001.png`. |
| B — Density 100%, Feather 20 px, Opacity 100% | Photoshop 캔버스에서 부드러운 경계와 숨긴 오른쪽 영역 | `captureBounds=[224,215,769,772]`, PNG `545 × 557`; `(400,260)`은 `[144,50,105,255]`, 알파 `{255}` | 부분 알파 전이가 없고 숨긴 영역도 불투명하게 돌아왔다. SMG 화면에는 원래 폭의 자홍색 직사각형. `.runtime/block9bc1-feather/`, SHA-256 `BC3613897BF41B69883ED0DE2BFBE8F5957375D7EBE7EEBF09B3FEED008FCED3`. |
| C — B 상태에서 Photoshop Layer Opacity UI 62% | Feather 20 px와 숨긴 부분 유지, 레이어 반투명 | 같은 `545 × 557` PNG, B와 **SHA-256 동일** 및 알파 `{255}`; 프로젝트 레이어 `opacity=0.6196078431372549` | 레이어 opacity는 Photoshop의 8-bit 값에 맞춰 별도 메타데이터로 보존되고 픽셀에 중복 적용되지 않았다. 그러나 마스크 누락은 그대로다. `.runtime/block9bc1-opacity62/`. |

위 `captureBounds`의 네 숫자는 `[left,top,right,bottom]` 순서다. 모든 사례에서 `right-left=PNG.width`, `bottom-top=PNG.height`로 **native 1:1**이 유지되었다. `desktop-app/src/bitmap-source.js`의 `selectionSnapshotInitialLayerState`는 경계 중심을 작업 프레임 너비·높이로 나누므로, A의 중심 `(360.5,493.5)`는 `(0.1201666667,0.128515625)`, B/C의 중심 `(496.5,493.5)`는 `(0.1655,0.128515625)`가 된다. 저장 메타데이터 및 SMG 화면에서 해당 위치 변화가 확인되었다. 하지만 마스크 때문에 잘못된 경계가 반환되면 위치가 그 경계에 따라 바뀌며, 이는 RGBA fidelity를 보장하지 않는다.

## 비파괴성 및 한계

네 번의 가져오기가 성공했다. 현재 코드의 성공 반환은 캡처 전후 `doc.activeHistoryState.id`가 같을 때만 `nonDestructiveEvidence: HISTORY_STATE_ID_UNCHANGED`를 내보낸다. 호스트 UI에서도 마지막 캡처 뒤 테스트 문서의 선택 레이어/마스크와 안쪽 구멍, 레이어 표시 상태, Density 100%, Feather 0 px, Opacity 100%가 남아 있었다. Feather/Opacity 사례의 해당 값도 각 캡처 전후 UI에서 확인했다. 별도의 Photoshop History 패널 스냅샷이나 모든 상태의 수치화 전후 비교를 남기지는 않았으므로, **history 불변은 기존 런타임 검사에 근거**하고 마스크·선택 불변은 UI 관찰 범위에서만 주장한다. 테스트 fixture 제작 중 생긴 의도적 history는 Snapshot의 mutation과 구별한다.

마스크 알파가 빠졌으므로 V1 alpha fringe/halo 품질은 이 경로에서 평가할 유효한 반투명 경계가 없어 **판정 불가**다. 알파 0 아래 hidden RGB의 정확한 값은 요구하지 않는다. Mask Density 100% 이외의 선택적 D 사례는 수행하지 않았다. 생성 프로젝트의 `schemaVersion`은 계속 `4`였다.

## 종료 경계

현재 `SINGLE_PIXEL_LAYER` gate는 이 fixture를 거부하지 않고 불투명한 원본 픽셀을 성공적으로 가져온다. 따라서 마스크가 붙은 레이어를 그대로 가져오면 Photoshop의 보이는 결과와 다를 수 있다. 위 수동 우회 절차를 사용한다. **Mask Guard, 수동 `getLayerMask()` 알파 곱셈, Mask Density/Feather 재현, Photoshop 마스크 해석 복제, 새 Snapshot 런타임, Vector Mask 변환 또는 schema 변경은 계획하지 않는다.** 다른 9B-C2/C3 및 9C 범위와 기존 CLOSED 블록의 판정에는 영향이 없다.
