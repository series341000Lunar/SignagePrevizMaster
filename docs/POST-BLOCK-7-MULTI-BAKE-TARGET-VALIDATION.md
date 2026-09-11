# LUUX Signage Previz — Multi Bake Target Validation

Date: 2026-09-12

Baseline HEAD: `36e66d238fae77cc402f17a4dd41623131d229c9`

Status: **IMPLEMENTED / AUTOMATED TECHNICAL PASS / USER VALIDATION PASS / CLOSED**

## Scope

Block 7의 단일 Photoshop Bake Target을 UXP-authoritative, session-scoped
`BakeTargetRegistry`로 확장했다. 이번 변경은 Post-Block-7 extension이며 Block 8을
시작하지 않는다.

다음 CLOSED 계약은 변경하지 않았다.

- `ProjectionBakeRuntime` 및 Canonical/Direct pixel generation
- Projection Camera calibration 및 Family Surface binding
- `ANAM_BAKE_MATTE_INNER` 전용 depth-only Matte
- Planar Mask와 Mask 기본 OFF 정책
- Photoshop staging apply, owned layer 교체, active document restore
- Auto Sync self-feedback suppression
- Block 7 binary transport와 one-active-job 정책

## Registry와 binding 계약

- Authority: Photoshop UXP
- Scope: 현재 UXP 실행 session만
- Capacity: 일반화된 N-target `Map`; FRONT/BACK 변수 하드코딩 없음
- Target identity: `targetId`, label, `documentId`, documentName, width, height,
  mode, depth, status
- Binding identity: `familyId:outputKind`
- 지원 outputKind: `DIRECT`, `CANONICAL`
- Renderer는 UXP registry snapshot의 mirror만 유지한다.
- Broker는 snapshot을 검증해 전달하고 Bake Job의 명시적 `targetId`와
  `targetSessionId`를 그대로 route한다.
- Photoshop Active Document는 Add/Register 또는 Target의 `SET ACTIVE DOCUMENT`
  동작에만 사용한다. 문서 탭 전환만으로 destination은 변하지 않는다.
- UXP disconnect 시 renderer mirror를 지워 이전 session의 `documentId`를
  재사용하지 않는다.

## Output resolution 계약

| Binding | Expected target |
| --- | ---: |
| `ANAMORPHIC_FRONT_75F:DIRECT` | 3000 × 3840 RGB8 |
| `ANAMORPHIC_BACK:DIRECT` | 2100 × 3840 RGB8 |
| `ANAMORPHIC_FRONT_75F:CANONICAL` | 4728 × 5760 RGB8 |
| `ANAMORPHIC_BACK:CANONICAL` | 4728 × 5760 RGB8 |

Canonical slot은 구조상 지원하지만 필수 등록 대상은 아니다. Binding이 없거나,
문서가 닫혔거나, identity/크기/mode/depth가 바뀌면 UXP는 Apply 전에 거부한다.
Active Document, 같은 이름, 같은 크기의 다른 문서를 fallback으로 선택하지 않는다.
Resize, crop, fit, mode conversion, bit-depth conversion도 수행하지 않는다.

## Write safety

- 한 Bake Job은 한 family, 한 output, 한 target, 한 Photoshop mutation만 수행한다.
- Broadcast 및 parallel Photoshop write는 없다.
- 기존 `2 MiB` chunk, `8 MiB` high-water mark, `120 s` timeout,
  `512 MiB` maximum, top-left straight RGBA8 계약을 공유한다.
- `BAKE_RECEIVED`와 `BAKE_APPLIED`는 계속 별도 상태다.
- Apply ACK는 job뿐 아니라 target/session/document identity까지 일치해야 한다.
- Owned layer key는 Target Document + family/output identity를 유지하므로 같은
  문서를 여러 binding에 등록해도 해당 output layer만 교체한다.
- 하나의 Target이 CLOSED/INVALID가 되어도 다른 Target 상태와 binding에는
  영향을 주지 않는다.

## Automated validation

`npm run test:multi-target`:

- 3개 Target 등록 및 unique targetId: PASS
- FRONT75/DIRECT 및 BACK/DIRECT resolve: PASS
- CANONICAL architecture와 선택적 slot: PASS
- unbound output refuse: PASS
- wrong-size target refuse: PASS
- closed BACK isolation 및 FRONT READY 유지: PASS
- explicit Back_A → Back_B replacement: PASS
- Active Document 변경만으로 target 불변: PASS
- 같은 Photoshop 문서를 여러 Target으로 등록: PASS
- one active Bake Job / `BAKE_BUSY`: PASS
- broadcast/parallel write 없음: PASS

회귀 결과:

| Command | Result |
| --- | --- |
| `npm run test:block7` | PASS |
| `npm run test:visibility-correction` | PASS |
| `npm run test:multi-target` | PASS |
| `npm run test:static` | PASS |
| `npm run test:protocol` | PASS |
| `npm run test:runtime` | PASS on clean retry |
| `npm run test:link` | PASS, synthetic SITE/LINK smoke |
| `npm test` | PASS |
| `git diff --check` | PASS |

첫 `test:runtime` 시도는 기존 프로젝트 `electron.exe`가 34100 포트를 점유해
`EADDRINUSE`로 실패했다. 점유 중인 프로젝트 프로세스 PID 61136을 확인·종료한
뒤 동일 명령을 재실행해 `BLOCK0_TECHNICAL_PASS=true`를 확인했다. GPU/WebGL
오류나 이번 extension의 기능 실패가 아니었다.

## Real Photoshop validation

Status: **USER VALIDATION PASS**

자동 smoke와 별도로 사용자가 실제 Photoshop 대상 문서를 이용한 동작 결과를
2026-09-12에 승인했다. 다음 절차는 승인된 운영·재검증 기준으로 유지한다.

1. 3000 × 3840 RGB8 `Front_Target.psd`를 `FRONT75 / DIRECT`로 등록한다.
2. 2100 × 3840 RGB8 `Back_Target.psd`를 `BACK / DIRECT`로 등록한다.
3. FRONT Send 후 Front만 변경되는지 확인한다.
4. BACK Send 후 Back만 변경되는지 확인한다.
5. FRONT를 다시 Send해 Front만 교체되는지 확인한다.
6. 제3 문서를 Active로 바꾼 뒤 BACK Send가 여전히 Back에만 적용되는지 확인한다.

선택 검증으로 4728 × 5760 RGB8 문서를 각 family의 `CANONICAL`에 등록할 수
있다. 이 slot들은 필수 대상이 아니며 등록되지 않은 상태에서는 Send가
`NO BAKE TARGET ASSIGNED`로 비활성화된다.

## Acceptance state

- Automated acceptance: **PASS**
- Actual multi-document Photoshop mutation: **USER VALIDATION PASS**
- USER VALIDATION: **PASS**
- Extension closure: **CLOSED**
