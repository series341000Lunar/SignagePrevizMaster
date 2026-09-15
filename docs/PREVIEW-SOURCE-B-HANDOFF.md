# PREVIEW-SOURCE-B — Auto Authoring Planar Physical Preview

Baseline HEAD: `fbe5b3e4097676a500a7ccda8102915119bdb978` (`Apply black matte to Photoshop preview in SITE FREE view`). Target: Local checkout `C:\_InternalProjects\SignagePrevizMaster`.

Production PHOTO/SITE 3D에서 `PREVIEW SOURCE = AUTHORING`을 선택하거나, 해당 SOURCE를 기억한 상태로 AUTHORING 작업공간에서 PHOTO/SITE 3D로 돌아올 때만 자동 Preview 요청을 만든다. 편집 드래그 중에는 Bake를 시작하지 않는다. PHOTO의 Front/Front Sweet는 FRONT75, Back/Night는 BACK을 사용한다. SITE ANAM_FRONT/ANAM_BACK은 각 View의 Family를 사용한다. SITE FREE VIEW는 직전에 AUTHORING 작업공간에서 선택한 Family를 사용하며, 별도 선택 이력이 없으면 FRONT75가 기본이다.

자동 경로는 기존 `FullMergeAccumulatorRuntime`과 `ProjectionBakeRuntime`으로 Family-native Full Merged DIRECT를 만들고, 기존 `PlanarOutputWorkflow`와 `PlanarMappingRuntime`으로 `LUUX_PLANAR_MASTER` 4728×5760 RGBA를 만든다. Technical Canonical 결과는 Planar 입력으로 사용하지 않는다. 현재 Family의 Full Merge와 Planar가 모두 같은 merged Direct revision에 READY이면 Bake 없이 재사용한다. Full Merge만 READY이면 Planar만 Bake한다. Full Merge가 dirty/missing이면 Full Merge 후 Planar를 Bake한다. 수동 BAKE FULL MERGED/BAKE PLANAR와 동일한 결과 및 one-job state를 공유한다.

Planar output Blob은 결과당 한 번만 정상 TextureLoader 경로로 디코드해 `SRGB`, `flipY=false`, Linear filtering, Clamp wrapping의 Preview texture로 캐시한다. PHOTO는 Legacy 2D World의 현재 Photo Scene에 선택된 `planar-uv` signage meshes에, SITE 3D는 Basic Mapping GLB의 planar-UV signage meshes에 이 텍스처를 설치한다. SITE에서 ANAM View가 선택되어 있어도 AUTHORING Source 동안에는 해당 ANAM-UV surface를 숨기고 물리 Basic Mapping surface를 표시한다. SOURCE를 IMAGE/PS PREVIEW로 바꾸면 원래 View surface의 표시 및 SOURCE map을 복구한다. AUTHORING의 물리 Preview 화면은 투명/반투명 Planar 픽셀을 검정색 불투명 매트로 표시한다. Planar PNG 자체의 RGBA는 바꾸지 않는다. Photo camera/background/location과 Site camera/orbit/FOV/reset baseline은 Preview 갱신에서 변경하지 않는다.

자동 요청은 project session ID, Family, merged revision, workspace/view/source, preview request generation을 캡처한다. 작업이 끝나도 이 값과 Planar READY output identity가 현재 요청과 정확히 일치할 때만 새 물리 텍스처를 게시한다. SOURCE/Family/Workspace/Project가 바뀐 오래된 완료는 게시하지 않는다. 작업 중에는 기존 정상 물리 Preview를 유지하고 `UPDATING`, 실패하면 같은 Family의 이전 물리 Preview를 유지하며 `ERROR`를 표시한다. 실패한 부분 결과를 READY로 승격하지 않는다. Project Open과 shutdown은 요청/Preview 캐시를 폐기한다.

자동 생성한 Full Merge/Planar READY 결과는 기존 Authoring UI의 VIEW PLANAR/SAVE PLANAR PNG에도 그대로 보인다. Project schemaVersion 4는 유지하며 derived Preview bitmap/job은 저장하지 않는다. Photoshop protocol, Planar-to-Photoshop Send, Full Merge 및 Planar 알고리즘은 변경하지 않았다. IMAGE와 PS PREVIEW의 routing도 유지했다.

검증과 실제 사용자 확인 결과는 [PREVIEW-SOURCE-B-VALIDATION.md](PREVIEW-SOURCE-B-VALIDATION.md)에 기록한다.
2026-09-16 상태: 기술 검증과 FRONT/BACK 편집 후 갱신, SOURCE 왕복, PHOTO Family 분리, 알파 표시의 사용자 확인이 완료되어 PREVIEW-SOURCE-B는 CLOSED다.
