# PREVIEW-SOURCE-A — Unified Preview Source Foundation

Baseline HEAD: `cbef701eb569de73f6f4f36218b93bfbc95c1fc5` (`Add production workspace UI and smoke coverage`). Target: Local checkout `C:\_InternalProjects\SignagePrevizMaster`.

Production PHOTO and SITE 3D have a separate `PREVIEW SOURCE` selector with `IMAGE`, `AUTHORING`, and `PS PREVIEW`. PHOTO location, SITE view, AUTHORING family, and Preview Source remain distinct state axes. PHOTO and SITE 3D remember their source independently for the current session; both default to IMAGE. AUTHORING workspace hides the selector and continues editing the Authoring source of truth.

IMAGE uses the existing simple bundled-source load path, plus a temporary PNG/JPG file control. A manually loaded file is decoded into a preview texture and added to the IMAGE dropdown under its filename. The session bank holds up to five files; the trash button deletes only the currently selected bank file and is disabled for bundled sources. Selecting another bank entry reuses its cached texture. The bank does not add an Authoring Layer or touch the project. Photoshop Live frames still arrive through the existing transport. The Production PS PREVIEW path retains the last accepted live texture and frame identity separately from IMAGE, so a live frame does not remove the chosen IMAGE and a source switch does not change camera or location. Disconnection, invalid/missing frames, and anamorphic Direct-resolution mismatches report an unavailable state while retaining the last valid display where possible. Developer source and Photoshop Final controls remain available.

Long bank filenames are shortened in the dropdown by keeping their beginning and ending; the full name remains in the selection/file-name tooltip. The controls stay within the Workspace card, and the file-name line uses an ellipsis when it exceeds the available width.

Simple IMAGE textures now use `flipY=false` on the Site GLB UVs. The bundled IMAGE path flips only the 2D/3D Plane geometry UVs in compensation, preserving those views. For simple PNG preview, the display shader composites source alpha over fixed black and outputs alpha 1: fully transparent cutouts display as RGB 0 / A 1 and partial-alpha edges blend over black. The decoded original pixels remain available to existing source/authoring probes; Photoshop and Authoring rendering contracts are unchanged.

AUTHORING selection performs no Bake. Existing ready Planar PNG is available only in its 2D preview overlay; current PHOTO/SITE 3D physical mesh routing does not safely consume it. A current Planar result therefore reports `UNAVAILABLE · physical display pending`; missing output reports `NOT READY` and a dirty merged result reports `OUTDATED`. The last valid IMAGE/PS texture stays displayed if present. The physical Planar route and conditional automatic Bake belong to PREVIEW-SOURCE-B.

Project schema remains version 4. Project Save/Open, Bake and Planar algorithms, Photoshop protocol, and Planar-to-Photoshop Send were unchanged. Existing Production cameras, reset actions, SITE FOV control, PHOTO navigation lock, and quick Bake menu remain in place.

Closeout state is recorded in [PREVIEW-SOURCE-A-VALIDATION.md](PREVIEW-SOURCE-A-VALIDATION.md).
