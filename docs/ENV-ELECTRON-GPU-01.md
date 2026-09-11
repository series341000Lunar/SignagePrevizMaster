# LUUX Signage Previz — ENV-ELECTRON-GPU-01

작성일: 2026-09-11
판정: **INTERMITTENT / UNRESOLVED**
범위: 개발환경 / Electron runtime 진단 전용

## A. Diagnostic Verdict

과거 관찰된 Chromium GPU subprocess의 `0xC0000135` 종료는 현재 동일 revision에서
재현되지 않았다. 공식 Electron 44.3.0 Windows x64 ZIP과 DEV runtime의 전체
73개 파일이 크기와 SHA-256까지 일치하므로, 조사 후보였던 Electron payload DLL
누락 또는 DEV runtime 손상은 지지되지 않는다.

정확한 missing module 이름, fault module, loader trace가 확보되지 않았으므로 원인은
확정하지 않는다. 현재 판정은 **INTERMITTENT / UNRESOLVED**다.

~~~text
Most likely category: transient Windows child-process loader/execution environment
Confidence: LOW at category level; root cause unconfirmed
~~~

## Symptom

~~~text
Issue ID: ENV-ELECTRON-GPU-01
Symptom: Chromium GPU subprocess exits before runtime smoke assertion
Exit decimal: -1073741515
Exit hex: 0xC0000135
Frequency: historical intermittent; current formal matrix not reproduced
Affected: historical DEV observed; current DEV and Portable both start GPU successfully
~~~

과거 실패 시 renderer smoke report가 생성되기 전에 GPU subprocess가 종료됐다.
Fusion 종료 뒤에도 재발한 기록이 있으므로 Fusion/GPU saturation을 단독 원인으로
판정하지 않는다. 과거 stderr에 `os_crypt_win.cc:105` DPAPI decrypt 오류도 별도로
관찰됐지만, 현재 같은 Codex 실행 계정에서 GPU가 정상 시작되므로 직접 원인으로
연결할 증거는 없다.

## Baseline

~~~text
Repository: C:\_InternalProjects\SignagePrevizMaster
HEAD: 96bcf18660be051d48f76eb5bba79f2092a5f97c
git diff --check: PASS
Worktree: existing uncommitted Block 5B implementation preserved

Windows: Windows 10 Pro 25H2, build 26200.9445, x64
Electron: 44.3.0
Node: v24.21.0
npm: 12.0.2

GPU: NVIDIA GeForce RTX 5080
Driver: 591.86

Current user: BNC-P049\CodexSandboxOffline
Node process.execPath: C:\Program Files\nodejs\node.exe
DEV Electron executable: C:\_InternalProjects\SignagePrevizMaster\desktop-app\node_modules\electron\dist\electron.exe
Portable child executable: C:\Users\user\AppData\Local\Temp\<portable-extract>\LUUX Signage Previz.exe
CWD: C:\_InternalProjects\SignagePrevizMaster
TEMP: C:\Users\user\AppData\Local\Temp
TMP: C:\Users\user\AppData\Local\Temp
~~~

PATH는 진단 시점에 전체 캡처했다. 선두에 Codex runtime의 PowerShell/native/image/PDF
override 경로가 있고, 뒤에 Windows System32, Autodesk shared, Git, Node.js,
Codex, npm 및 Codex runtime fallback 경로가 함께 존재했다. credential/token은
PATH에 관찰되지 않았으며 문서에는 중복 전체 목록을 싣지 않는다.

## B. Reproduction

### DEV Electron

2026-09-11 16:32:57–16:35:18 KST에 현재 소스/빌드와 같은 실행 명령을 사용했다.

~~~text
Formal runs: 10
GPU startup passes: 10
GPU startup failures: 0
Renderer reached: 10
WebGL reached: 10
GPU: ANGLE / NVIDIA GeForce RTX 5080 / Direct3D11
Context loss: 0 each
Critical errors: 0 each
Main exit code: 2 each
~~~

10회의 exit code `2`는 GPU startup 실패가 아니다. 모든 report가 생성됐고 WebGL까지
도달했으며, 기존 Block 5B integrated smoke의
`anamorphicBack.cameraForwardMatches=false` 때문에 `technicalPass=false`가 됐다.
이 환경 진단에서는 해당 기능 assertion을 조사하거나 수정하지 않았다.

### Portable

정확한 Portable outer executable:

~~~text
Path: desktop-app/dist/LUUX Signage Previz.exe
Bytes: 207,196,053
SHA-256: 75611C2396AB12D14D062841F4D353C9626F51C32BC89DED8DC709C2FE7E9185
Valid waited runs: 3
GPU startup passes: 3
GPU startup failures: 0
Renderer reached: 3
WebGL reached: 3
GPU: ANGLE / NVIDIA GeForce RTX 5080 / Direct3D11
Context loss: 0 each
Critical errors: 0 each
Main exit code: 2 each
~~~

첫 PowerShell 직접 호출은 portable wrapper가 분리되어 exit code를 보존하지 않았고
report도 생성하지 않아 matrix에서 제외했다. 이후 기존 validation과 같은 Node
`spawn`/wait 방식의 3회만 유효 run으로 집계했다. exit code `2`는 DEV와 같은
비-GPU assertion 결과다.

## C. Runtime Payload

공식 원본은 Electron GitHub release의
`electron-v44.3.0-win32-x64.zip`을 사용했다.

~~~text
Official ZIP bytes: 158,149,320
Official/API SHA-256: 26BF9A617D58D81772B3D68305D59EE48272969C15083C06DB634A77358A8D9D
Downloaded ZIP SHA-256: 26BF9A617D58D81772B3D68305D59EE48272969C15083C06DB634A77358A8D9D
DEV files compared: 73
Missing: 0
Size mismatch: 0
Hash mismatch: 0
Extra: 0
Electron dist: PASS
Packaged support payload: PASS / no DEV-present candidate missing from package
Confirmed missing file: None
~~~

공식 참조:

- https://github.com/electron/electron/releases/tag/v44.3.0
- https://github.com/electron/electron/releases/download/v44.3.0/electron-v44.3.0-win32-x64.zip

`chrome_elf.dll`, `libEGL.dll`, `libGLESv2.dll`은 DEV와 package에 없지만 공식
Electron 44.3.0 Windows x64 ZIP에도 없으므로 정상 manifest다.

### Candidate inventory

`N/A`는 PE 서명 대상이 아닌 data/pak/bin/json 파일을 뜻한다.

| File | DEV | Package | Bytes | SHA-256 | Signature |
|---|---|---|---:|---|---|
| `electron.exe` / `LUUX Signage Previz.exe` | exists | exists | 246,070,272 | DEV `E048632E...F9D80`; package `7C9B93ED...04923` | NotSigned |
| `chrome_elf.dll` | official absent | official absent | 0 | - | - |
| `libEGL.dll` | official absent | official absent | 0 | - | - |
| `libGLESv2.dll` | official absent | official absent | 0 | - | - |
| `d3dcompiler_47.dll` | exists | exists | 4,741,488 | `A05F9973...CBBB` | Valid, Microsoft Windows |
| `icudtl.dat` | exists | exists | 10,876,560 | `9F48C7F9...2B6E` | N/A |
| `resources.pak` | exists | exists | 12,435,445 | `3D8C36B2...BA6` | N/A |
| `v8_context_snapshot.bin` | exists | exists | 742,208 | `D9D3EC18...2B7B` | N/A |
| `snapshot_blob.bin` | exists | exists | 368,776 | `1176CFA8...8458` | N/A |
| `vulkan-1.dll` | exists | exists | 939,008 | `C1B383F1...3B4F` | NotSigned |
| `vk_swiftshader.dll` | exists | exists | 5,520,384 | `CFB8A533...F0F8` | NotSigned |
| `vk_swiftshader_icd.json` | exists | exists | 106 | `32D83FF1...AFD9` | N/A |
| `dxcompiler.dll` | exists | exists | 25,744,896 | `B2B5C67B...B6AC` | NotSigned |
| `dxil.dll` | exists | exists | 1,509,760 | `77E039C9...59A` | Valid, Microsoft Windows |

Package executable hash 차이는 electron-builder의 product executable patch/rename 결과다.
GPU 지원 DLL/data는 DEV와 package 사이에 같은 크기와 SHA-256을 유지한다.

## D. Windows Evidence

~~~text
WER archive/queue matching Electron or LUUX crash: none
Application Error matching the 0xC0000135 incident window: none
Fault module: unavailable
Missing module name: unavailable
~~~

Application log에는 직접 crash 증거가 아닌 다음 Event ID 1001만 있었다.

- 2026-09-11 13:18:58 — `electron.exe 44.3.0.0`, `RADAR_PRE_LEAK_64`
- 2026-09-11 12:58:57 — `LUUX Signage Previz.exe 0.4.0.0`, `RADAR_PRE_LEAK_64`

두 event는 memory/leak radar이며 16시대 GPU child 종료의 fault module 또는 missing
DLL 이름을 제공하지 않는다. 기존 `ProcMon`, `Sigcheck`, `Dependencies`, `dumpbin`,
`llvm-readobj`, `objdump`은 발견되지 않았다.

## E. GPU / DCC Correlation

2026-09-11 16:40 KST 부근 snapshot:

~~~text
Fusion: 0 processes
After Effects: 0 processes
3ds Max: 3 processes, aggregate working set about 13.06 GB
Blender: 1 process, working set about 0.54 GB
GPU utilization: 2%
GPU memory: 7,496 / 16,303 MiB
~~~

현재 3ds Max/Blender가 실행 중인 상태에서도 DEV 10회와 Portable 3회가 모두 GPU
startup에 성공했다. 과거에는 Fusion 동시 렌더링 중과 Fusion 종료 뒤 모두 실패가
관찰됐다. 따라서 GPU workload와의 상관관계는 **WEAK / NOT ESTABLISHED**이며,
단순 GPU saturation을 root cause로 지지하지 않는다.

## F. Diagnostic A/B

| Case | Start | GPU child / renderer | GPU renderer | Same `0xC0000135` |
|---|---|---|---|---|
| Normal | starts, 10/10 | reached | NVIDIA D3D11 | no |
| `--disable-gpu` | starts, 1/1 | reached | Microsoft Basic Render Driver / D3D11 | no |
| `--disable-gpu-sandbox` | starts, 1/1 | reached | NVIDIA D3D11 | no |
| Software ANGLE/SwiftShader | not run | exact supported switch not independently verified | - | - |

두 A/B run도 동일한 비-GPU assertion 때문에 최종 exit code는 `2`였다. Normal이 현재
성공하므로 어느 A/B가 과거 실패를 해결했다고 해석할 수 없다. 어떠한 switch도 제품
설정에 반영하지 않았다.

GPU child의 실제 전체 command line은 short-lived process와 현재 WMI/CIM 접근 제한
때문에 캡처하지 못했다. DEV/Portable에 전달한 app arguments와 working directory는
위 matrix에 고정했지만, Chromium이 생성한 `--type=gpu-process` 전체 인자는 미확보다.

## G. Root Cause Candidates

| Candidate | Evidence | Confidence |
|---|---|---|
| Missing Electron payload DLL | 공식 ZIP과 DEV 73/73 exact; 의심 3 DLL도 공식 absent | **NOT SUPPORTED / HIGH** |
| Packaged payload corruption | GPU support payload DEV/package parity; Portable 3/3 starts | **NOT SUPPORTED / HIGH** |
| Windows loader/transient environment | status가 loader 계열이나 module 이름과 fault record 없음 | **PLAUSIBLE / MEDIUM-LOW** |
| Codex sandbox/process environment | sandbox 계정과 과거 DPAPI 오류가 있으나 같은 환경에서 13/13 starts | **PLAUSIBLE / LOW** |
| GPU sandbox | Normal과 sandbox-disabled 모두 starts; 실패 시점 비교 증거 없음 | **NOT SUPPORTED / MEDIUM** |
| NVIDIA/D3D driver | 현재 NVIDIA D3D11 13/13 starts, context loss 0 | **WEAK / LOW** |
| GPU workload contention | Fusion 유무 양쪽에서 과거 실패, 현재 DCC 실행 중 성공 | **WEAK / LOW** |

가장 가능성이 높은 범주는 아직 특정할 수 없는 **transient Windows child-process
loader/execution environment**지만, 이는 category 수준의 가설이며 root cause 확정이
아니다.

## H. Recommended Next Action

다음 `0xC0000135` 재발 시 **사용자 세션에서 수동 ProcMon loader trace 한 번**을
캡처해 실제 missing module 이름을 확인한다.

~~~text
Process Name is electron.exe OR LUUX Signage Previz.exe
Operation is Load Image OR CreateFile
Result is NAME NOT FOUND OR PATH NOT FOUND
Path ends with .dll
~~~

ProcMon은 현재 설치/발견되지 않았으며 이번 작업에서 설치하지 않았다. 설치, VC++
Runtime 복구, driver 변경, Electron 재설치, security switch 적용은 승인 전 수행하지
않는다.

## I. Block 5B

~~~text
Non-GPU validation: PASS
Packaging: PASS
GPU validation: OPEN / BLOCKED BY ENVIRONMENT DIAGNOSTIC
User BACK visual validation: OPEN
Commit/push: NOT PERFORMED
~~~

이번 matrix가 현재 GPU 시작 성공을 증명하더라도 과거 간헐 오류의 root cause가
미확정이므로 Block 5B GPU PASS로 자동 승격하지 않는다. 마찬가지로 현재 integrated
smoke의 별도 camera assertion을 이 환경 진단에서 Block 5B 기능 FAIL로 재분류하지
않는다.

AWAITING GPU DIAGNOSTIC REVIEW

## Subsequent Block 5B Closeout

이 문서의 `User BACK visual validation: OPEN`은 환경 진단 당시의 snapshot이다.
사용자는 2026-09-11에 corrected BACK camera calibration을 최종 승인했으며 Block 5B는
별도 [Validation](BLOCK-5B-VALIDATION.md)과 [Handoff](BLOCK-5B-HANDOFF.md)에서 CLOSED로
기록한다. 간헐적 환경 이슈 자체는 NON-BLOCKING / MONITOR 상태를 유지한다.
