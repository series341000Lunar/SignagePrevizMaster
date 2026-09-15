# PREVIEW-SOURCE-B — Validation

Baseline HEAD: `fbe5b3e4097676a500a7ccda8102915119bdb978`. Target: Local `main` checkout.

`desktop-app/.runtime/preview-source-b-runtime.json`의 `PREVIEW_SOURCE_B_TECHNICAL_PASS=true`는 두 종류의 검사를 분리해 기록한다. 상태/실패 Smoke는 동일 Production SOURCE/View 이벤트를 사용하고 Bake 호출 경계만 강제 fixture로 제어한다. 실제 물리 통합 Smoke는 기존 Full Merge DIRECT → Planar renderer → 4728×5760 PNG Blob → TextureLoader → planar-UV meshes를 FRONT/BACK 모두에서 실행한다.

상태 Smoke: 현재 Full Merge+Planar의 재사용은 Full Merge +0, Planar +0이었다. Full Merge READY/Planar missing에서는 +0/+1, Full Merge dirty에서는 +1/+1이었다. 후자의 실제 texture 교체까지 이전 물리 map은 `UPDATING` 상태에서 유지됐다. Full Merge와 Planar 각각의 강제 실패는 `ERROR`를 표시하고 마지막 물리 Preview를 유지했다. AUTHORING→IMAGE 중 늦은 Planar 완료와 project session ID 변경 중 늦은 완료는 새 texture를 게시하지 않았다. 수동 Planar job이 슬롯을 소유한 동안 자동 Planar 호출은 시작되지 않았고, 슬롯이 풀린 뒤 한 번만 시작됐다. SOURCE를 IMAGE로 바꾼 뒤 IMAGE map이 복구됐다. SITE FREE/ANAM_FRONT/ANAM_BACK과 PHOTO Front/Front Sweet/Back/Night 모두 선택 View와 Family를 유지하면서 해당 Planar texture를 물리 planar-UV surfaces에 설치했고, AUTHORING 물리 Preview의 검정 매트 shader가 선택된 것을 확인했다. SITE FREE는 Authoring 선택 이력이 없을 때 FRONT75, Authoring에서 BACK을 선택한 뒤에는 BACK을 표시했다. SITE/PHOTO 카메라, Authoring layer snapshot 및 project state는 자동 갱신 전후 유지됐다.

실제 물리 통합 Smoke: FRONT75 SITE FREE VIEW는 Full Merged DIRECT `3000×3840`, BACK PHOTO Back은 `2100×3840`이었다. 둘 다 현재 merged revision 1의 Planar `4728×5760` PNG를 READY로 만들고, 그 정확한 output identity에서 디코드한 texture를 물리 planar-UV surfaces에 설치했다. FRONT SITE의 surfaces는 `LUUX_Front_3Dworld_Basic`/`ILMIN_Back_3Dworld_Basic`; BACK PHOTO의 surfaces는 `LUUX_Back`/`ILMIN_Back`이었다. 설치된 texture는 SRGB, `flipY=false`, Linear/Clamp이고, 물리 materials에서 black-matte shader를 켜 SOURCE AUTHORING의 투명 영역을 화면에서 검정 불투명으로 합성한다. 원본 Planar PNG의 straight RGBA는 유지한다. 두 View의 camera pose와 project state가 유지됐고, AUTHORING으로 돌아갔을 때 두 Family의 기존 VIEW PLANAR/SAVE PLANAR PNG 컨트롤이 사용 가능했다. 실행 시간은 runtime report의 `physical.families[].timing`에 기록했다. 성능 Gate가 아닌 fixture 관찰값이다.

회귀: `npm run test:static`, `npm run test:protocol`, `npm run test:runtime` (`BLOCK0_TECHNICAL_PASS=true`), `npm run test:planar-b:runtime` (`PLANAR_B_TECHNICAL_PASS=true`), PREVIEW-SOURCE-A Electron Smoke (`PREVIEW_SOURCE_A_TECHNICAL_PASS=true`), PREVIEW-SOURCE-B Electron Smoke (`PREVIEW_SOURCE_B_TECHNICAL_PASS=true`)를 실행했다. Block 8F의 오래된 정적 assertion은 수동 경로의 활성 Family layers와 자동 경로의 명시적 Family layers를 모두 확인하도록 수정했다. 알고리즘은 수정하지 않았다.

2026-09-16 검정 매트 후속 검증: `npm run test:static`, PREVIEW-SOURCE-A/B Electron Smoke를 다시 실행해 모두 PASS했다. B report의 `siteBack`, `siteFront`, `siteFreeLastSelected`, `photoFront`, `photoBack`, `photoOtherViews`의 `blackMatte`는 모두 true이며, 실제 Full Merge→Planar 통합의 FRONT/BACK `textureContract`도 모두 true다. A report는 IMAGE 및 PS PREVIEW의 기존 소스 경로와 알파 컷아웃 GPU 합성이 유지됨을 확인했다.

실제 사용자 확인: SITE 3D 및 PHOTO에서 알파가 다시 투명하게 보이는 문제는 해소됐다고 사용자가 확인했다. PHOTO Front/Front Sweet는 FRONT75 Authoring 결과만, Back/Night는 BACK Authoring 결과만 출력되는 것도 네 View에서 확인했다. 이 두 후속 수정은 `USER PASS / CLOSED`로 기록한다.

실제 사용자 Probe PASS: (1) AUTHORING FRONT75에서 레이어 이동, Opacity, Mask 변경 후 SITE 3D의 자동 Preview가 갱신됐다. (2) BACK에서도 동일한 편집 후 자동 갱신이 확인됐다. (3) AUTHORING→IMAGE→AUTHORING SOURCE 왕복 후 해당 Preview가 복구됐다. 앞서 기록한 알파 검정 매트와 PHOTO 네 뷰의 Family 분리 확인을 포함해 B의 실제 화면 Gate가 충족됐다.

Schema change: NO (`schemaVersion=4`). Photoshop protocol change: NO. Full Merge algorithm change: NO. Planar algorithm change: NO. Planar-to-Photoshop Send: NO. Project-persisted Preview: NO.

PREVIEW-SOURCE-B 전체 상태: `CLOSED / TECHNICAL PASS / PRACTICAL USER PASS`. 추가 ANAM_BACK Authoring orbit 시작 카메라 보정은 Production UI 후속 항목으로 별도 검증한다.
