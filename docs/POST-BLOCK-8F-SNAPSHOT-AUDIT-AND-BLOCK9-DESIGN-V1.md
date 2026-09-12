# LUUX Signage Previz — Post-Block-8F Snapshot Audit & Block 9 Master Design

**Document Version:** V1.0<br>
**Date:** 2026-09-12<br>
**Status:** ACTIVE DESIGN BASELINE<br>
**Scope:** Photoshop Snapshot Source / Block 9A–9B / Future Planar-Mapped Final Output<br>
**Repository Baseline at Audit:** `main` / `385cf098c51636122f5f8c9fc1baff7334c1b4aa`<br>
**Audit Verdict:** `GO WITH CORRECTIONS`<br>
**Supersedes:** none<br>
**Preserves:** Block 8D / 8E / 8F CLOSED baselines

---

# 0. Purpose

This document consolidates:

1. the Post-Block-8F Snapshot Readiness Audit;
2. user decisions made after that audit;
3. the architectural contract for Block 9A and Block 9B;
4. the required future Final-Output architecture;
5. the mandatory future Planar Mapping Bake stage.

It exists so that Block 9 does not need to be reinterpreted from conversation context.

The central decision is:

> **Photoshop Snapshot is a new Bitmap Source Adapter, not a replacement for File Source and not a new authoring engine.**

The second central decision is:

> **The anamorphic workflow is not complete with only a Canonical/Anamorphic Master. A later Planar Mapping Bake that produces a planar-mapped final canvas is mandatory and is one of the principal reasons this anamorphic feature exists.**

---

# 1. Closed Baseline — Do Not Reopen

The following blocks are CLOSED and USER VALIDATED.

```text
Block 8D
Project Save / Load
→ CLOSED

Block 8E
Layer-local Multi-Path Vector Mask
→ CLOSED

Block 8F
BAKE FULL MERGED
→ CLOSED
```

Their contracts remain authoritative unless a later explicitly approved design changes them.

## 1.1 Block 8D preserved contract

```text
Folder Project
├─ project.json
└─ assets/

Stable layerId
Source asset persistence
Transactional Load
Atomic Save
Family-independent stacks
Photoshop runtime identity not persisted
Bake cache not persisted
```

## 1.2 Block 8E preserved contract

```text
Layer-local Vector Mask
SOURCE_NORMALIZED_TOP_LEFT

Multiple Paths
ADD / SUBTRACT

LINEAR
CUBIC_BEZIER

Open / Closed Path
Point / Handle editing
Mask Enable / Invert
Persistent schema v2
```

## 1.3 Block 8F preserved contract

```text
BAKE CURRENT
→ selected layer only

SEND DIRECT
→ selected layer only

BAKE FULL MERGED
→ current-family visible layer stack

Blend:
NORMAL
MULTIPLY
SCREEN
LINEAR_DODGE

Merged Direct
Merged Canonical
PNG export
```

`SEND FULL MERGED` does not exist yet.

---

# 2. Audit Result

Post-Block-8F Snapshot Readiness Audit verdict:

```text
FINAL VERDICT:
GO WITH CORRECTIONS

Critical: 0
High:     0
Medium:   5
Low:      0

Block 9 can start:
YES WITH PRECONDITIONS

Pre-Block-9 refactor:
NONE
```

No structural blocker was found.

The current Layer / Vector Mask / Projection Bake / Full Merge architecture is already sufficiently bitmap-oriented to accept Photoshop Snapshot after a new source adapter is introduced.

The corrections are local to Block 9A.

---

# 3. Audit Findings Adopted as Block 9 Contract

## M-01 — Source origin / provenance is currently FILE-centric

Current runtime rendering can consume bitmap-like sources, but persistence and source normalization still assume `FILE`.

Block 9A must separate:

```text
Bitmap Runtime Data
≠
Source Origin
≠
Persistent Provenance
```

Required direction:

```text
BitmapSource
├─ common bitmap metadata
├─ runtime bitmap
└─ origin/provenance metadata
```

Supported logical origins after Block 9:

```text
FILE
PHOTOSHOP_SELECTION_SNAPSHOT
PHOTOSHOP_COMPOSITE_SNAPSHOT
```

## M-02 — Snapshot transport must not reuse Live semantics directly

Existing Photoshop Live Link semantics are:

```text
Photoshop Composite
→ latest frame
→ replace current Preview texture
```

Snapshot semantics are:

```text
Explicit Capture
→ immutable independent asset
→ create/replace Authoring Layer source
```

Therefore Block 9A must use:

```text
same binary/chunk transport infrastructure
+
separate Snapshot job/message namespace
```

Do not make Snapshot use Live `latest-wins` frame semantics.

## M-03 — Selection capture cannot be assumed to equal visible Photoshop result

Arbitrary Photoshop Layer / Group / Adjustment configurations may depend on:

```text
Layer Mask
Layer Style
Clipping
Adjustment
Pass Through Group
Backdrop-dependent Blend
External Group context
```

Therefore support must expand only through actual Photoshop Probe results.

No unsupported selection type may be silently treated as a valid isolated RGBA source.

## M-04 — Snapshot lifetime / ownership must be explicit

Snapshot introduces additional temporary resources:

```text
UXP image data
outbound typed array
inbound RGBA
optional encode scratch
project asset bytes
decoded runtime image
GPU texture
```

Block 9A must define:

```text
job
→ validated asset
→ runtime source
→ layer ownership
```

and dispose temporary resources on every terminal path.

Late Snapshot completion after project/session replacement must be rejected.

## M-05 — Live Composite and editable Snapshot can duplicate content

Possible problem:

```text
Photoshop Composite already contains A
+
Previz editable Snapshot A
=
A shown twice
```

Block 9A may initially avoid this through a clearly defined operating rule.

Block 9B must provide a clearer Authoring / Final Preview separation.

---

# 4. User Decisions — Authoritative

The following decisions were explicitly accepted after the audit.

## 4.1 Photoshop Selection Snapshot support policy

### Initial supported target

```text
Single Pixel Layer
```

is the first Selection Snapshot target.

### Probe-gated expansion candidates

```text
Pixel Layer + Photoshop Layer Mask
Smart Object
Self-contained Group
Group containing internal Adjustment Layers
Nested Group
```

These become supported only if actual Photoshop Probe results demonstrate a stable isolated RGBA contract.

### Initially unsupported

```text
Adjustment Layer by itself
Arbitrary multi-selection
Backdrop-dependent selection
Unverified clipping / external dependency cases
```

Previz must not attempt to recreate Photoshop's layer system.

The intended architecture is:

```text
Photoshop internal structure
→ Photoshop renders result
→ Previz receives RGBA Snapshot
```

not:

```text
Photoshop structure
→ Previz reimplements Photoshop compositing
```

---

# 5. Snapshot Geometry Decision — Native-Pixel Trim, Not Resize

The Snapshot may trim transparent/unoccupied document area.

This is explicitly **not downsampling**.

Example:

```text
Photoshop Document:
4000 × 4000

Actual selected content:
x = 1200..2200
y =  900..1900
```

Allowed Snapshot:

```text
Snapshot Bitmap:
1000 × 1000

Document Size:
4000 × 4000

Capture Bounds:
left   = 1200
top    = 900
right  = 2200
bottom = 1900
```

The 1000 × 1000 pixels must remain native 1:1 source pixels.

## 5.1 Mandatory quality rule

```text
NO RESIZE
NO DOWNSAMPLE
NO LOSSY COMPRESSION
```

Trim/crop of transparent/unoccupied area is allowed.

## 5.2 Reconstruction contract

Metadata must preserve enough information to reconstruct the original document-space placement:

```text
documentWidth
documentHeight

captureBounds
  left
  top
  right
  bottom
```

Therefore a Snapshot can later be placed back into a full-size transparent document canvas without resampling.

---

# 6. Snapshot Bitmap Coordinate Contract

Previz Authoring uses Snapshot bitmap coordinates, not Photoshop document coordinates.

```text
Snapshot Bitmap
(0,0)
→ source-local origin
```

Vector Mask continues to use:

```text
SOURCE_NORMALIZED_TOP_LEFT
```

Photoshop document-space offsets remain provenance metadata only.

Do not mix:

```text
Photoshop document coordinates
```

into:

```text
Vector Mask point coordinates
Layer Transform coordinates
```

---

# 7. Color / Bit Depth Decision

Block 9 Snapshot V1 supports:

```text
RGB 8-bit
sRGB-oriented internal contract
```

The following are deferred:

```text
16-bit
32-bit
HDR Snapshot workflow
extended color-management workflow
```

Rationale:

- this tool is primarily for Previz / Mockup / internal authoring;
- final production work remains primarily in Fusion / After Effects / existing compositing pipelines;
- 16/32-bit is uncommon in the intended Previz workflow;
- supporting it now would add disproportionate complexity.

Important:

```text
Do NOT silently convert the original Photoshop document
from 16/32 bit to 8 bit.
```

Unsupported source states should be clearly reported.

---

# 8. Snapshot Immutability

Default Snapshot semantics:

```text
Photoshop
→ explicit capture
→ independent immutable Bitmap Source
```

After capture:

```text
Photoshop source changes
≠
automatic Snapshot change
```

No automatic Snapshot refresh.

No feedback loop.

Possible future command:

```text
REFRESH FROM PHOTOSHOP
```

is deferred unless separately approved.

---

# 9. Source / Destination Separation

Same Photoshop document may eventually act as both:

```text
Snapshot source document
and
Bake target document
```

but these roles must remain distinct.

```text
Snapshot provenance physical layer ID
≠
Bake output ownership physical layer ID
```

Input provenance must never become an overwrite authority.

Output ownership continues to use the existing session-scoped target/owned-layer system.

---

# 10. Project Schema Direction

Current schema:

```text
v1
→ File authoring

v2
→ Vector Mask
```

Block 9 requires:

```text
schemaVersion = 3
```

because source origin/provenance semantics are being expanded.

## 10.1 Compatibility

Reader must continue to support:

```text
v1
v2
v3
```

Migration:

```text
v1/v2 FILE
→ in-memory common bitmap source model
→ FILE provenance
```

Opening an old project must not rewrite it immediately.

Next Save may write v3.

---

# 11. Recommended Source Model

Logical direction:

```text
BitmapSource {
  sourceId
  sourceType

  assetReference

  width
  height

  mimeType
  byteLength
  sha256

  alpha
  colorContract

  provenance
}
```

Possible provenance:

```text
FILE {
  originalFilename
}
```

```text
PHOTOSHOP_SELECTION_SNAPSHOT {
  documentName
  captureDocumentId
  selectedLayerIds
  selectedLayerNames

  documentWidth
  documentHeight

  captureBounds

  captureTimestamp

  captureMode
}
```

```text
PHOTOSHOP_COMPOSITE_SNAPSHOT {
  documentName
  captureDocumentId

  documentWidth
  documentHeight

  captureBounds

  captureTimestamp
}
```

Exact schema keys remain an implementation detail, but these semantic boundaries must be preserved.

---

# 12. Asset Storage

All Snapshot pixels must become project-owned lossless assets.

Recommended:

```text
assets/
  asset-xxxx.png
```

Requirements:

```text
lossless
project-relative
generated safe filename
hash validated
```

Photoshop-provided names must not be used directly as filesystem paths.

---

# 13. Runtime Asset Installation

Project asset representation and runtime representation are different responsibilities.

Allowed implementation:

```text
Inbound RGBA
├─ Runtime bitmap installation
└─ Lossless project asset generation
```

Runtime does **not** have to encode to PNG and decode again before first display if a more memory-efficient path is available.

The only required invariant is:

```text
runtime bitmap pixels
==
persisted Snapshot asset pixels
```

within the defined RGBA/color contract.

---

# 14. Snapshot Transport Contract

Recommended architecture:

```text
Photoshop UXP
→ SNAPSHOT_BEGIN
→ binary/chunks
→ SNAPSHOT_END

Electron Broker
→ validation/routing

Renderer / Snapshot Adapter
→ validate
→ immutable asset/runtime source
→ Layer registration

→ SNAPSHOT_COMPLETE
```

Names are illustrative; exact protocol naming may differ.

## 14.1 Required separation

```text
Live Frame Job
Snapshot Job
Reverse Bake Job
```

must remain semantically distinct.

## 14.2 V1 concurrency policy

Recommended:

```text
Photoshop → Previz large-image transfer
Live / Snapshot
→ one active transfer at a time
```

Reverse Bake concurrency must remain compatible with current safety behavior.

---

# 15. Snapshot ACK Meaning

Snapshot success must mean more than socket receipt.

Success should require:

```text
all bytes received
metadata validated
bitmap valid
project asset established
runtime source established
Layer registration succeeded
```

Only then is Snapshot creation considered complete.

Duplicate completion must not create duplicate Layers.

---

# 16. Snapshot Capture Bounds

Every Snapshot must distinguish:

```text
bitmapWidth / bitmapHeight
```

from:

```text
documentWidth / documentHeight
captureBounds
```

Unexpected scaling must be refused.

If Photoshop returns a reduced-resolution or pyramid-level result unexpectedly, the Snapshot must not be accepted as native-resolution content.

---

# 17. Alpha Contract

Block 9A must explicitly determine through Probe whether Photoshop Snapshot bytes are:

```text
straight alpha
or
premultiplied alpha
```

Previz internal bitmap pipeline must normalize to the alpha representation expected by:

```text
Vector Mask
ProjectionBakeRuntime
Full Merge
```

Do not infer alpha representation from appearance alone.

Transparent RGB edge behavior must be tested.

---

# 18. Photoshop Probe Gate

The following Probe categories are mandatory before declaring broad Selection support.

## Probe 1 — Pixel Layer

```text
single selected Pixel Layer
native dimensions
alpha
bounds
color
```

## Probe 2 — Offset / Transparent Layer

```text
trimmed bounds
document-space offset
transparent edges
empty layer behavior
```

## Probe 3 — Layer Mask

```text
Pixel Layer + Photoshop Layer Mask
```

Determine whether capture returns the expected masked RGBA.

## Probe 4 — Smart Object

Determine whether capture is stable and visually correct.

## Probe 5 — Group / Nested Group

Check:

```text
internal compositing
Pass Through
group-local effects
external dependency
```

## Probe 6 — Adjustment / Clipping Dependency

Determine what isolated capture actually means.

## Probe 7 — Color / Alpha

```text
0 alpha
partial alpha
255 alpha
edge halo
sRGB
```

## Probe 8 — Non-destructive capture

Verify Snapshot capture does not modify:

```text
history
visibility
selection
profile
depth
source document artwork
```

---

# 19. Block 9A Scope

## Title

```text
Block 9A
Photoshop Snapshot Transport / Source Foundation
```

## 19.1 Mandatory implementation

```text
Common Bitmap Source model

Source origin/provenance

Schema v3

v1/v2 compatibility

Snapshot transport job

Snapshot validation

Native-pixel trimmed capture

Project-owned lossless asset

Composite Snapshot

Single Pixel Layer Snapshot

Actual Photoshop Probe

Resource ownership/disposal

FILE + Snapshot mixed Layer Stack

Vector Mask compatibility

BAKE CURRENT compatibility

BAKE FULL MERGED compatibility
```

## 19.2 Initial official support target

```text
PHOTOSHOP_COMPOSITE_SNAPSHOT
→ supported

PHOTOSHOP_SELECTION_SNAPSHOT
Single Pixel Layer
→ supported after real Probe PASS
```

## 19.3 Probe-gated extension

```text
Pixel Layer + Mask
Smart Object
Self-contained Group
Nested Group
```

## 19.4 Explicitly deferred from 9A

```text
Adjustment Layer alone

arbitrary Group semantics without Probe

arbitrary multi-selection

automatic refresh

16/32-bit Snapshot

complex Preview-mode UX
```

---

# 20. Block 9B Scope

## Title

```text
Block 9B
Photoshop Snapshot Workflow / Preview Separation
```

Block 9B focuses on workflow meaning rather than transport foundation.

Planned scope:

```text
Selection support expansion based on Probe evidence

Group / Smart Object support where safe

Unsupported Selection messaging

Source / Target same-PSD workflow

Authoring Preview

Photoshop Final Preview

Duplicate-content prevention
```

Optional later consideration:

```text
REFRESH FROM PHOTOSHOP
```

only if separately approved.

---

# 21. Preview Architecture — User Decision

The long-term UI should distinguish Authoring/Source canvases from Final canvases.

---

# 22. Source / Authoring Canvases

Two primary Authoring canvases exist.

```text
SOURCE / AUTHORING CANVAS 01
FRONT75

Working Resolution:
3000 × 3840
```

```text
SOURCE / AUTHORING CANVAS 02
BACK

Working Resolution:
2100 × 3840
```

Each Family owns an independent Layer Stack.

Each Layer can use:

```text
FILE
Photoshop Snapshot
```

with:

```text
Transform
Vector Mask
Opacity
Blend
Visibility
Order
```

---

# 23. Final Canvas Architecture

Final output is not one canvas permanently.

The architecture must reserve two final-output roles.

```text
FINAL CANVAS 01
ANAMORPHIC / CANONICAL MASTER
```

and later:

```text
FINAL CANVAS 02
PLANAR-MAPPED MASTER
```

The second is not optional in the long-term workflow.

---

# 24. Final Canvas 01 — Anamorphic / Canonical Master

Current known canonical master:

```text
4728 × 5760
```

This is the existing anamorphic/canonical final representation produced by the Projection/Bake architecture.

It is not the end of the full future production workflow.

---

# 25. Mandatory Future Stage — Planar Mapping Bake

A later Block must implement:

```text
Anamorphic / Canonical Master
→ Planar Mapping Bake
→ Planar-Mapped Master
```

This is a **major functional requirement**.

It is one of the primary reasons the anamorphic feature exists.

Do not treat it as a convenience export.

---

# 26. Planar Mapping Bake Role

Planar Mapping Bake is:

```text
OUTPUT TRANSFORM
```

not:

```text
new Authoring Layer
```

The conceptual pipeline is:

```text
SOURCE AUTHORING
────────────────────
FRONT75
BACK

        ↓

ANAMORPHIC RESULT
────────────────────
Canonical / Anamorphic Master

        ↓

PLANAR MAPPING BAKE
────────────────────
Output remapping

        ↓

FINAL DELIVERY
────────────────────
Planar-Mapped Master
```

---

# 27. Planar Mapping Bake Timing

Planar Mapping Bake is **not part of Block 9A**.

It should be implemented after Snapshot / Preview architecture is sufficiently stable.

Recommended order:

```text
9A
Snapshot Source Foundation

9B
Snapshot Workflow + Preview Separation

POST-9
Planar Mapping Bake Block
```

Exact Block number is deferred.

---

# 28. Planar Mapping Output Contract — Not Yet Fixed

Do not invent the final planar output resolution or exact mapping matrix now.

These must be determined from:

```text
actual production pipeline
Fusion workflow
existing planar mapping method
required output resolution
real output comparison
```

The current document only mandates the architectural stage.

---

# 29. Canvas UI Direction

Long-term conceptual UI:

```text
AUTHORING / SOURCE

[ FRONT75 ]
[ BACK ]


FINAL

[ ANAMORPHIC MASTER ]
[ PLANAR MASTER ]
```

Before Planar Mapping Bake exists:

```text
PLANAR MASTER
→ unavailable / future
```

may be acceptable.

The UI should not require a full redesign when Planar Master is later added.

---

# 30. Authoring Preview vs Photoshop Final Preview

Block 9A may initially rely on operating discipline:

```text
Snapshot is explicit and immutable

Avoid using a Photoshop base composite that already contains
the same baked object being edited
```

Block 9B should formalize:

```text
AUTHORING PREVIEW
```

versus:

```text
PHOTOSHOP FINAL PREVIEW
```

so editable projected content is not unintentionally displayed twice.

---

# 31. Same PSD Source / Target Policy

Same PSD may be used as both source and target.

Allowed:

```text
Source Layer / Group
→ Snapshot
→ Previz
→ Bake
→ same PSD output group
```

Required separation:

```text
Input capture identity
≠
Output ownership identity
```

Output overwrite authority remains limited to Previz-owned output layers.

---

# 32. Memory Policy

Representative worst-case raw RGBA:

```text
4728 × 5760 × 4
≈ 103.9 MiB
```

This is a worst-case planning value.

Trimmed Selection Snapshot should generally require less.

Block 9A must avoid unnecessary simultaneous copies.

Observe resource state at:

```text
before capture
peak capture
transfer complete
asset install complete
temporary disposal complete
```

Memory optimization must not introduce downsampling.

---

# 33. Snapshot Resource Disposal

Required terminal paths:

```text
success
failure
timeout
disconnect
cancel
project open
project replacement
layer delete
source replace
late completion
```

must all leave temporary Snapshot resources in a known state.

A late job must not install content into a newer project/session.

---

# 34. Existing Bake Compatibility Rule

Once Snapshot is normalized into the common runtime bitmap interface:

```text
Snapshot
→ existing Layer
→ existing Vector Mask
→ existing BAKE CURRENT
→ existing BAKE FULL MERGED
```

must be the normal path.

Do not create:

```text
SnapshotBakeRuntime
SnapshotVectorMask
SnapshotFullMerge
```

unless a proven technical constraint makes it unavoidable.

---

# 35. File Source Remains First-Class

File Import is never removed.

Long-term source tree:

```text
IMAGE SOURCE
├─ FILE
├─ PHOTOSHOP_SELECTION_SNAPSHOT
└─ PHOTOSHOP_COMPOSITE_SNAPSHOT
```

All three must converge into the same Bitmap Authoring Layer model.

---

# 36. Security Boundary

Preserve:

```text
nodeIntegration = false
contextIsolation = true
sandbox = true
webSecurity = true
```

Snapshot must not require broad Node/fs exposure to Renderer.

Use existing broker / narrow IPC patterns.

---

# 37. Known Issues That Remain Non-Blocking

Do not reopen unless directly required.

```text
Non-ASCII original filename
→ Project Load works
→ Photoshop SEND DIRECT may fail
→ accepted known issue

BACK ordinary-preview occlusion discrepancy
→ accepted known issue

Vector Mask floating panel size
→ later UI refinement
```

---

# 38. Explicitly Deferred

The following are not automatically part of Block 9.

```text
Bitmap Mask
Green Key
Feather
INTERSECT / XOR

16 / 32-bit Snapshot

automatic Snapshot refresh

Cloud sync
Recent project system

Photoshop Vector Path export

Camera Animation
JPG Sequence Render
```

---

# 39. Block 9 Acceptance Philosophy

Block 9 is successful when:

```text
Photoshop pixels
→ explicit independent Snapshot
→ normal Bitmap Layer
→ Project Save/Open
→ Vector Mask
→ BAKE CURRENT
→ BAKE FULL MERGED
```

works without weakening existing ownership, persistence, security, or source-quality contracts.

Photoshop internal structure does not need to be universally supported in the first version.

Correctly supported limited scope is preferable to ambiguous broad support.

---

# 40. Block 9A Required User Validation

Minimum real workflow should include:

```text
1. Photoshop Composite Snapshot
2. Native-pixel result confirmed
3. Trimmed bounds confirmed where applicable
4. Save Project
5. Restart / Open
6. Snapshot source restored
7. FILE + Snapshot mixed stack
8. Vector Mask on Snapshot
9. BAKE CURRENT
10. BAKE FULL MERGED
11. Single Pixel Layer Snapshot
12. Photoshop source document remains unchanged
```

Probe-based features must not be marked supported without user-visible or real Photoshop evidence.

---

# 41. Block 9B Required User Validation

Minimum later workflow:

```text
1. Supported Group / Smart Object capture
2. Unsupported case clearly rejected
3. Same PSD used as Source / Target
4. No ownership confusion
5. Authoring Preview
6. Photoshop Final Preview
7. No duplicate projected content
8. Existing File workflow unchanged
```

---

# 42. Future Planar Mapping Bake Validation — Mandatory

When the Planar Mapping Bake Block is implemented, its acceptance must include:

```text
[ ] Approved Anamorphic / Canonical input

[ ] deterministic planar transform

[ ] no unintended resampling beyond required mapping

[ ] explicit output resolution

[ ] repeatable pixel result

[ ] FRONT/BACK relation correctly represented

[ ] comparison with existing production/Fusion method

[ ] user visual approval

[ ] source/canonical result remains unchanged

[ ] planar result treated as derived output
```

This future stage must not overwrite the Authoring Source of Truth.

---

# 43. High-Level Long-Term Pipeline

```text
Photoshop / File
        ↓

Bitmap Sources
├─ FILE
├─ Photoshop Selection Snapshot
└─ Photoshop Composite Snapshot

        ↓

AUTHORING
├─ FRONT75
└─ BACK

Layer features
├─ Transform
├─ Vector Mask
├─ Opacity
├─ Blend
├─ Visibility
└─ Order

        ↓

PROJECTION
├─ BAKE CURRENT
└─ BAKE FULL MERGED

        ↓

FINAL 01
ANAMORPHIC / CANONICAL MASTER
4728 × 5760

        ↓

FUTURE REQUIRED OUTPUT TRANSFORM
PLANAR MAPPING BAKE

        ↓

FINAL 02
PLANAR-MAPPED MASTER

        ↓

Fusion / After Effects / Production Pipeline
```

---

# 44. Implementation Order

Recommended:

```text
Block 9A
Snapshot Transport / Source Foundation

        ↓

Block 9B
Snapshot Workflow / Preview Separation

        ↓

Future Output Block
Planar Mapping Bake

        ↓

Later optional features
as separately approved
```

---

# 45. Final Decision Summary

## Approved

```text
Photoshop Snapshot as first-class Bitmap Source

Composite Snapshot

Single Pixel Layer Snapshot first

Group / Mask / Smart Object support through Probe evidence

Native-pixel trimmed capture

No resize

No downsample

Lossless project asset

Document dimensions + captureBounds provenance

RGB 8-bit / sRGB-oriented V1

16/32-bit deferred

Explicit immutable Snapshot

No automatic refresh

Schema v3

9A / 9B split

Two source canvases:
FRONT75
BACK

Two final-canvas roles:
ANAMORPHIC MASTER
PLANAR MASTER
```

## Mandatory Future Requirement

```text
PLANAR MAPPING BAKE
```

is mandatory and must not be lost from the roadmap.

---

# 46. Final Architectural Principle

The system should evolve as:

```text
More Source Types
→ same Authoring Layer

More Output Forms
→ derived from same Authoring Source of Truth
```

not:

```text
Each Source
→ separate editor
→ separate mask
→ separate bake
→ separate persistence
```

The current 8D–8F architecture is accepted as the baseline.

Block 9 extends the input side.

The later Planar Mapping Bake extends the output side.

Both must preserve the same stable Authoring Source of Truth.

---

# 47. Status After This Document

```text
Block 8D
CLOSED

Block 8E
CLOSED

Block 8F
CLOSED

Post-8F Snapshot Audit
COMPLETE
GO WITH CORRECTIONS

Block 9A
NEXT

Block 9B
PLANNED

Planar Mapping Bake
FUTURE / MANDATORY
```
