# PLANAR-A 해상도·소스 계약 교정

계약 교정 상태: **IMPLEMENTED / AUTOMATED TECHNICAL PASS** (2026-09-14). 추가로 동일 입력 Fixture에 대한 FRONT/BACK **USER VISUAL PASS**를 받았다. 실무 이미지의 앱 내 `BAKE PLANAR`·`SAVE PLANAR PNG` 최종 흐름은 아직 구현·검증되지 않았다.

## 교정 이유

초기 Planar-A는 4728 × 5760 Full Merge `CANONICAL`을 Planar 입력으로 강제했다. 이는 실무에서 확인된 FRONT 75F 3000 × 3840, BACK 2100 × 3840 입력과 다르다. 기존 `luux-mockup/baker.html`은 이 면별 원본 해상도 이미지를 Slot A로 받아 4728 × 5760 결과를 만든다. 따라서 4728 × 5760은 Planar **출력/납품 프로필**의 권한이지, 모든 Family의 작업/합성 입력 해상도가 아니다.

## 권한과 현재 계약

| 단계 | 해상도 권한 | FRONT 75F | BACK |
| --- | --- | ---: | ---: |
| SOURCE NATIVE | 파일·Photoshop snapshot 자체 | 파일 고유 | 파일 고유 |
| FAMILY WORKING / COMPOSITE | 기존 Family Profile의 `workingResolution`(장래 별도 `compositeResolution` 가능) | 3000 × 3840 | 2100 × 3840 |
| FULL MERGED DIRECT / Planar source | 현재 Family의 `BAKE FULL MERGED` Direct 결과 | 3000 × 3840 | 2100 × 3840 |
| `LUUX_PLANAR_MASTER` output | 독립 `PLANAR_OUTPUT_PROFILE.outputResolution` | 4728 × 5760 | 4728 × 5760 |

Planar 소스는 **selected-layer `BAKE CURRENT` Direct가 아니다**. `FullMergeAccumulatorRuntime.readOutputRgba(familyId, 'DIRECT')`만 읽는다. `readPlanarSource()`는 현재 Family, Full Merge ready, 실제 `result.mergedRevision`과 전달된 `mergedDirectRevision` 일치, `DIRECT` kind, Family Profile에서 유래한 크기, RGBA8/RGB, STRAIGHT alpha, TOP_LEFT 방향을 검증한다. `ImageData`/`CanvasTexture`에 원본 크기 그대로 넣으며 사전 4728 확대·16:9 Fit을 하지 않는다.

`getFamilyCompositeResolution()`은 Family Profile의 `compositeResolution`이 있으면 이를, 없으면 기존 `workingResolution`을 사용한다. FRONT/BACK 숫자를 Planar runtime의 분기에 하드코딩하지 않았다. Planar GLB 지원 목록은 현재 FRONT/BACK으로 한정되지만 해상도 resolver는 1234 × 2345 synthetic Family에도 동작한다. 장래 90F·ILMIN은 해당 Family Profile과 자산 계약을 추가해야 하며, 이번 턴에 구현하지 않는다. SYNC처럼 서로 다른 Family를 동시에 쓰는 경우에도 전역 한 장의 Canonical 크기가 아니라 Family/content identity별 크기와 Planar 상태를 유지해야 한다. 이번 턴에 SYNC를 구현하거나 기존 동작을 변경하지 않았다.

Planar 카메라의 FOV 10°, aspect **4728/5760**, near/far 0.01/10000, 위치 `(0, 342.9015690828403, 0)`, XYZ 회전 `(-90°, 0, 0)`은 그대로다. aspect는 소스가 아니라 **출력 프레임**에 속한다. FRONT/BACK GLB, `SCREEN_Bake_Front`/`SCREEN_Bake_Back` 정확한 노드, authored UV, sRGB·flipY=false·linear filtering·clamp·identity UV도 유지했다.

## 기존 Canonical 경로와의 분리

현재 Block 8F Projection Bake/Full Merge는 기술 출력 `CANONICAL` 4728 × 5760을 이미 가지고 있다. Block 9B-B의 Canonical Photoshop Target도 동일 해상도로 CLOSED / USER PHOTOSHOP PASS다. 이 경로를 삭제·변경·전역 rename하지 않았다. 여기서 `CANONICAL`은 기존 기능의 역사적 명칭이며 **전 Family의 단일 해상도 동의어가 아니다**. 기존 Canonical과 Planar Master는 크기가 같아도 소스·변환·픽셀이 다르다. 9B-B Target은 Planar source authority가 아니며 추후 Planar Output Target 명칭/마이그레이션은 별도 작업이다. 프로젝트 schemaVersion 4, Photoshop target/session identity, Snapshot/OwnedLayer registry는 변경하지 않았다.

## Dirty/revision 의존성

`Authoring 변경 → Full Merge dirty → Merged Direct stale → 해당 Family Planar dirty`이다. `BAKE FULL MERGED`가 새 `mergedRevision`의 Direct를 만들면 Planar는 그 revision에서 DIRTY가 되고, 장래 `BAKE PLANAR` 후 READY가 될 수 있다. 지금 Planar-A foundation은 `sourceFamilyId`와 `sourceMergedDirectRevision`을 Family별로 기록하고, `markMergedDirectRevision()`·`invalidateFamily()`를 제공한다. 동일 Direct revision은 READY를 보존하며 기존 Canonical만 따로 바뀌는 경우는 Planar 소스 revision이 아니다. FRONT/BACK state는 서로 독립이고 교차 Family 입력은 거부한다. 실제 UI invalidation wiring/cache는 Planar-B로 미뤘다.

## 자동 검증과 회귀

- `npm run build`: PASS. Family source resolution과 별도 output profile이 manifest에 기록되고 GLB hash/node/UV/copy가 검증된다.
- `npm run test:planar-a`: PASS. 면별 크기·미래 Family resolver·DIRECT-only adapter·Canonical-only 독립성·Direct revision stale/dirty·교차 Family 거부·소스 형식·무사전확대·카메라·자산을 확인한다.
- `npm run test:planar-a:runtime`: PASS. Electron GPU에서 FRONT 3000 × 3840, BACK 2100 × 3840 fixture를 각각 두 차례 4728 × 5760으로 렌더했다. 출력 랜드마크와 alpha/texture 계약, resource delta 0, authoring/Full Merge/source/SITE 카메라 불변을 확인했다. 보고서는 `desktop-app/.runtime/planar-a-runtime.json`이다.
- `npm run test:static`: PASS. 빌드와 정적 자산·프로필 검증을 통과했다.
- `npm run test:protocol`: PASS. Block 8D–8F, 9A, 9B-A, preview background, 9B-B, Snapshot resolution consent 및 Planar-A를 포함한 프로토콜 회귀를 통과했다.
- `npm run test:runtime`: PASS. 전체 Electron 런타임 회귀를 통과했다. 이는 실제 Photoshop/현장 송출 육안 검증을 대신하지 않는다.
- `git diff --check`: PASS.

## 실무 증거와 추가 사용자 육안 검증

`2DAsset/Calibration/PlanarBakeTest/`의 두 JPG는 실제 사용한 면별 소스다. 사용자가 추가한 `Signage_front_4728x5760_1789363265422.png`, `Signage_back_4728x5760_1789363306167.png`의 SHA-256은 직전 격리 베이커 경로 출력과 각각 일치한다. `Front_Diff_BakerHTML-SMG.png`, `Back_Diff_BakerHTML-SMG.png`는 디코딩 기준 전 RGB 0값이다. `mychoice2026_RealFootage.png`는 실제 송출 화면 캡처 참고 자료다. 지시문에는 사용자가 격자/형상 기준 기존 Fusion 결과와 실용적으로 일치한다고 판단했다고 기록돼 있다. 이 자료는 **기존 베이커 경로의 실용성**에 관한 증거이며, 아래의 새 런타임 동일 입력 Fixture 비교와 구분한다.

사용자는 FRONT `PlanarA_FamilyDirect_Asymmetric_ANAMORPHIC_FRONT_75F_3000x3840.png`와 BACK `PlanarA_FamilyDirect_Asymmetric_ANAMORPHIC_BACK_2100x3840.png`를 각각 기존 `baker.html` Slot A에 넣어, Gain 1·흰 Tint·identity UV·16:9 Fit 미적용 조건에서 새 Signage Planar-A 런타임의 대응 Fixture 출력과 비교했다. `Baker-SMG_Front75F_Difference_.png`와 `Baker-SMG_Back_Difference_.png`를 제공했고, 방향·형상·배치가 일치하며 검정·흰색 배경 모두 눈에 띄는 검은 테두리나 번짐이 없다고 확인했다. **동일 입력 Fixture의 FRONT/BACK 사용자 육안 PASS**로 기록한다.

픽셀 진단에서도 두 면 모두 4728 × 5760 출력의 알파 값이 전 픽셀에서 일치하고 완전 불투명·완전 투명 영역의 RGB가 일치했다. FRONT는 반투명 401,464픽셀 중 401,389픽셀, BACK은 반투명 688,103픽셀 중 687,928픽셀에서 RGB 저장값이 달랐다. 이는 byte-equal PASS가 아니며, 반투명 픽셀의 RGB 표현 차이로 기록한다. 알파 채널 손실이나 가시적 halo의 증거는 확인되지 않았다. 이 차이의 원인을 최종 규명하거나 AA/filter/alpha 변환을 변경한 것은 아니다.

이번 교정 Block은 원래 시각 비교를 closure gate로 요구하지 않았지만, 위 동일 입력 Fixture 비교는 추가 사용자 증거로 수락했다. 실무 JPG를 **새 앱의 Full Merged Direct → BAKE PLANAR → SAVE PLANAR PNG** 최종 흐름으로 검증하는 작업, 반투명 RGB 표현 원인 분석, AA/filter tuning, Planar-B UX·PNG export·Photoshop target/SEND, 9B-C, 9C, 90F, ILMIN, SYNC는 후속 범위다. `luux-mockup/` 및 사용자 소스/캡처는 수정하지 않았다.
