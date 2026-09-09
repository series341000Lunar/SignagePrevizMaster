# Block 0 Technical Validation

Date: 2026-09-09  
Platform: Windows x64  
Package manager: npm 12.0.2

## Result

`BLOCK 0: TECHNICAL PASS`

User visual fidelity validation remains pending.

## Runtime evidence

The development runtime and packaged portable executable reported the same
primary-source values:

| Field | Value |
| --- | --- |
| Source | `AnamorphicTest_rocket_Original_0379f_.png` |
| Source dimensions | 4728 x 5760 |
| Decoded dimensions | 4728 x 5760 |
| Texture image dimensions | 4728 x 5760 |
| WebGL | WebGL 2.0 (OpenGL ES 3.0 Chromium) |
| MAX_TEXTURE_SIZE | 16384 |
| GPU | NVIDIA GeForce RTX 5080 via ANGLE Direct3D11 |
| Device pixel ratio | 1.5 |
| Software renderer | false |
| Context losses | 0 |

FIT, 1:1, 200%, 400%, pan, Pixel Inspection, reload, and all three source
selections passed the automated action checks. Texture memory remained at one
texture through repeated reload and source switching. No HTTP(S) request or
critical renderer error was recorded.

## Pixel pipeline

```text
Packaged source file
-> Chromium image decoder (natural dimensions)
-> THREE.Texture (no intermediate canvas and no resize)
-> WebGL upload
-> source-sized PlaneGeometry
-> Orthographic camera
```

FIT changes camera zoom only. At 1:1, one plane world unit maps to one display
CSS pixel. Pixel Inspection changes `magFilter` to `NearestFilter`; it does not
change source or texture dimensions.

## Source integrity

| Source | Bytes | SHA-256 |
| --- | ---: | --- |
| Original PNG | 48,142,345 | `58884AACB627929A8D43E7580E2599FFBC96EE37EF23ABEDAAFF50868F24C097` |
| Original JPG | 5,081,381 | `1E43A8B2F7E195297F0329B6DBFADB5CA61ACD4FCDA83B8B7C3548D40DB2248F` |
| Small PNG | 4,163,050 | `C989189A3050FE2B99EEB465E5BF875B4C5339F198FA8BAE823584D1CD12C923` |

The local `_TestSource` files and the tracked application asset copies were
byte-identical at the end of validation.

## Portable executable

The generated local artifact was:

```text
desktop-app/dist/LUUX Signage Previz.exe
157,327,558 bytes (150.04 MiB)
Windows x64 portable
Unsigned
```

The portable artifact exceeds GitHub's general 100 MB per-file limit and is
therefore intentionally excluded by `.gitignore`. The source, embedded test
assets, exact dependency lockfile, build configuration, and validation tests
remain tracked and can reproduce it.

## Manual visual check required

1. Run the portable executable.
2. Select Original PNG and use 1:1.
3. Inspect fine text, small details, and one-pixel or two-pixel edges.
4. Repeat at 200% and 400%.
5. Toggle Normal and Pixel Inspection.
6. Compare Original PNG with Small PNG.

