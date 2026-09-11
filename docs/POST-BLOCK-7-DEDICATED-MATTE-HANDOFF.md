# LUUX Signage Previz — 전용 Bake Matte 종합 전달서

Date: 2026-09-12

Baseline HEAD: `5c4c89166df45f08ca7999f331911c9ac3031397`

Status: `PASS / CLOSED`

## 목적과 결론

FRONT75 및 BACK Projection Bake에서 J자형 사이니지의 반대편 면이 내부
공간을 통해 보이던 문제를 전용 내부 Matte 메시로 차폐했다. 최종 구현은
사용자가 제공한 `Previz_Anamorphic_BakeMatte_v01.glb`만을 정확한 이름으로
바인딩하며, 일반 SITE 3D에는 영향을 주지 않는다. 자동 기술 검증과 실제
GPU 회귀검사가 통과했고, 사용자가 허용한 미세 잔여 범위를 포함해
`PASS / CLOSED`로 인계한다.

## 원인 분석과 수정 경로

1. 초기 Canonical Bake는 8-bit authored UV 근접 판정에 의존해 다른 면의
   texel을 허용할 수 있었다.
2. Projection Camera의 실제 depth texture를 사용하도록 바꿨지만 Signage
   Surface만 깊이 소스로 쓰면 J자 내부의 반대편 면까지 차폐할 수 없었다.
3. 환경의 `BD_UP_geoShape001`을 depth holdout으로 쓴 V2는 문제를 크게
   줄였으나, 실제 건물과 사이니지 사이 거리 때문에 일부 틈이 남을 수
   있어 부분 PASS로 남았다.
4. 최종 V3는 사이니지 안쪽을 채우는 전용 Matte를 사용한다. 건물 메시를
   최종 depth source로 사용하지 않는다.

## 제공 Matte 자산

- 경로: `3DAsset/Signage/Previz_Anamorphic_BakeMatte_v01.glb`
- 용도: `PROJECTION_BAKE_DEPTH_HOLDOUT`
- logical id: `anamorphic-bake-matte-inner`
- exact node: `ANAM_BAKE_MATTE_INNER`
- 사용자 제공 간격: 사이니지 표면에서 안쪽으로 약 22.7 cm
- 크기: 82,352 bytes
- SHA-256: `378B97CACCA9D43E5DC02876F279D154E637D558E7D1AAE3F33D51B42FFA0B0D`
- glTF 2.0, scene 1, node 1, mesh 1, primitive 1, vertex 2,350
- world bounds min: `[-0.9421948795, 0, -0.7448392320]`
- world bounds max: `[2.2819307962, 9.9999997765, 0.9037888134]`
- UV0 없음: depth-only 처리이므로 정상

## 런타임 계약

- FRONT75와 BACK은 같은 전용 Matte를 사용한다.
- 바인딩은 `EXACT_NAME_ONLY_DEPTH_ONLY_NO_COLOR`이며 휴리스틱 탐색이나
  건물 메시 fallback을 사용하지 않는다.
- GLB는 사용자가 Projection Bake를 실행할 때만 lazy-load한다.
- `colorWrite: false`, `depthWrite: true`, `DoubleSide`로 깊이에만 참여한다.
- 일반 SITE 3D scene graph에는 절대 attach하지 않는다.
- 각 Bake 종료 후 복제 geometry/material/texture를 폐기한다.
- SITE 3D, NAVIGATE, POINT, 일반 렌더, 환경 재질과 가시성은 바뀌지 않는다.
- FRONT75/BACK Bake Mask 기본값은 OFF이며, 이번 검증도 full-white identity
  control로 MASK OFF 상태에서 수행했다.
- 기존 카메라 calibration, signage GLB geometry, Block 7 reverse transport
  계약은 변경하지 않았다.

## 실제 GPU 검증

검증 순서는 FRONT75 3회 → BACK 3회 → FRONT75 복귀 1회였다.

| Metric | FRONT 75F | BACK |
| --- | ---: | ---: |
| Direct resolution | 3000×3840 | 2100×3840 |
| Canonical resolution | 4728×5760 | 4728×5760 |
| Canonical coverage | 0.567169250 | 0.334987266 |
| Direct visible pixels | 6,543,109 | 2,704,422 |
| Reprojected visible pixels | 6,543,039 | 2,704,422 |
| Direct-only pixels | 70 | 0 |
| Reprojected-only pixels | 0 | 0 |
| Silhouette IoU | 0.999989302 | 1.000000000 |
| Round-trip MAE | 0.319583285 | 0.294387945 |
| Round-trip RMSE | 2.904452992 | 2.789850567 |

공통 검증 결과:

- family별 technical PASS: true
- 전체 correction technical PASS: true
- Matte manifest/fingerprint 검증: true
- exact node transform finite: true
- ordinary scene attached: false
- disposed after bake: true
- family-switch resource disposal: 3회
- WebGL context loss: 0회
- 외부 네트워크 요청: 0회
- GPU: NVIDIA GeForce RTX 5080, ANGLE Direct3D11 hardware path

## 결과 이미지

검증 런은 다음 이미지를 `desktop-app/.runtime/`에 생성하며, 사용자 검토용
복사본은 ignored 경로 `2DAsset/Calibration/Result/`에 둔다.

- `PostBlock7_FRONT75F_Direct_3000x3840.png`
- `PostBlock7_FRONT75F_Canonical_4728x5760.png`
- `PostBlock7_FRONT75F_Reprojected_3000x3840.png`
- `PostBlock7_BACK_Direct_2100x3840.png`
- `PostBlock7_BACK_Canonical_4728x5760.png`
- `PostBlock7_BACK_Reprojected_2100x3840.png`
- `PostBlock7_FRONT75F_VisibilityDiagnostic.png`
- `PostBlock7_BACK_VisibilityDiagnostic.png`

## 사용자 수용 범위와 후속 경계

전용 Matte를 사용해도 카메라 시차와 메시 간격 때문에 일부 경계에서
반대편 면이 아주 미세하게 보일 수 있다. 사용자는 이를 이번 단계의 허용
범위로 승인했다. 남는 보정은 향후 anamorphic-to-planar 평면 Bake 단계에서
다루며, 현재 Projection Bake visibility correction의 실패 조건이 아니다.

이번 변경은 Block 8 기능을 선행 구현하지 않는다. 사용자 소유의 작업 중
Mask PNG는 수정하거나 커밋하지 않았고, `luux-mockup/` 및 `_TestSource/`
참조도 변경하지 않았다.

## 검증 명령

```powershell
npm run build
npm run test:block6a
npm run test:block6b
npm run test:block7
npm run test:visibility-correction
npm run test:static
npm run test:protocol
npm run test:runtime
npm run test:link
npm test
git diff --check
```

최종 판정: `USER VISUAL VALIDATION = PASS / CLOSED`
