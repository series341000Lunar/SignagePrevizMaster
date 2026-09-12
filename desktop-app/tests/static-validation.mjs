import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(appRoot, '..');
const packageJson = JSON.parse(await readFile(path.join(appRoot, 'package.json'), 'utf8'));
const mainSource = await readFile(path.join(appRoot, 'src', 'main.cjs'), 'utf8');
const brokerSource = await readFile(path.join(appRoot, 'src', 'live-link-broker.cjs'), 'utf8');
const liveLinkConfig = JSON.parse(await readFile(path.join(appRoot, 'src', 'live-link-config.json'), 'utf8'));
const rendererSource = await readFile(path.join(appRoot, 'src', 'renderer.js'), 'utf8');
const liveFrameInstallSource = rendererSource.slice(
  rendererSource.indexOf('async function installLiveFrame('),
  rendererSource.indexOf('function updateLinkStatus(')
);
const projectionBakeRuntimeSource = await readFile(path.join(appRoot, 'src', 'projection-bake-runtime.js'), 'utf8');
const screenImageAuthoringSource = await readFile(path.join(appRoot, 'src', 'screen-image-authoring.js'), 'utf8');
const authoringViewSettingsSource = await readFile(path.join(appRoot, 'src', 'authoring-view-settings.js'), 'utf8');
const projectPersistenceSource = await readFile(path.join(appRoot, 'src', 'project-persistence.js'), 'utf8');
const vectorMaskModelSource = await readFile(path.join(appRoot, 'src', 'vector-mask-model.js'), 'utf8');
const projectStorageSource = await readFile(path.join(appRoot, 'src', 'project-storage.cjs'), 'utf8');
const projectPreloadSource = await readFile(path.join(appRoot, 'src', 'project-preload.cjs'), 'utf8');
const coordinateSource = await readFile(path.join(appRoot, 'src', 'canonical-coordinate.js'), 'utf8');
const pointerQueueSource = await readFile(path.join(appRoot, 'src', 'pointer-command-queue.js'), 'utf8');
const siteProfileSource = await readFile(path.join(appRoot, 'src', 'site-scene-profile.js'), 'utf8');
const siteCalibrationSource = await readFile(path.join(appRoot, 'src', 'site-calibration-profile.js'), 'utf8');
const anamorphicCalibrationSource = await readFile(path.join(appRoot, 'src', 'anamorphic-calibration-profile.js'), 'utf8');
const siteEnvironmentSource = await readFile(path.join(appRoot, 'src', 'site-environment-profile.js'), 'utf8');
const photoRuntimeSource = await readFile(path.join(appRoot, 'src', 'photo-scene-runtime.js'), 'utf8');
const htmlSource = await readFile(path.join(appRoot, 'src', 'index.html'), 'utf8');
const builtRenderer = await readFile(path.join(appRoot, 'build', 'renderer.js'), 'utf8');
const manifest = JSON.parse(await readFile(path.join(appRoot, 'build', 'assets-manifest.json'), 'utf8'));
const uxpRoot = path.join(projectRoot, 'photoshop-uxp', 'luux-live-link');
const uxpManifest = JSON.parse(await readFile(path.join(uxpRoot, 'manifest.json'), 'utf8'));
const uxpConfigSource = await readFile(path.join(uxpRoot, 'config.js'), 'utf8');
const uxpHtmlSource = await readFile(path.join(uxpRoot, 'index.html'), 'utf8');
const uxpStylesSource = await readFile(path.join(uxpRoot, 'styles.css'), 'utf8');
const uxpSource = await readFile(path.join(uxpRoot, 'index.js'), 'utf8');
const captureSource = uxpSource.slice(
  uxpSource.indexOf('async function captureComposite()'),
  uxpSource.indexOf('async function sendCapture(')
);
const uxpContext = { window: {} };
vm.runInNewContext(uxpConfigSource, uxpContext);
const uxpConfig = uxpContext.window.LUUX_LIVE_LINK_CONFIG;

const failures = [];
function assert(condition, message) {
  if (!condition) failures.push(message);
}

assert(/nodeIntegration:\s*false/.test(mainSource), 'nodeIntegration must be false.');
assert(/contextIsolation:\s*true/.test(mainSource), 'contextIsolation must be true.');
assert(/sandbox:\s*true/.test(mainSource), 'sandbox must be true.');
assert(/webSecurity:\s*true/.test(mainSource), 'webSecurity must be true.');
const rendererRuntimeReferences = `${rendererSource}\n${htmlSource}`;
assert(
  !/(?:src|href)=["']https?:|(?:import|from)\s*["']https?:|fetch\(\s*["']https?:|new URL\(\s*["']https?:/i.test(rendererRuntimeReferences),
  'Renderer contains a remote runtime reference.'
);
assert(!/unpkg\.com|cdn\.jsdelivr\.net/i.test(`${rendererSource}\n${htmlSource}\n${builtRenderer}`), 'Renderer contains a CDN dependency.');
assert(!/createElement\(['"]canvas/i.test(liveFrameInstallSource), 'Live frame installation creates an intermediate canvas.');
assert(!/_TestSource/i.test(`${mainSource}\n${rendererSource}\n${htmlSource}`), 'Runtime references _TestSource.');
assert(/DEFAULT_OUTSIDE_SIGNAGE_OPACITY = 0\.5/.test(authoringViewSettingsSource), 'Outside Signage Preview must default to 0.5 at View level.');
assert(/class AuthoringViewSettings/.test(authoringViewSettingsSource), 'Outside Signage Preview must be owned by AuthoringViewSettings.');
assert(/computeAuthoringPreviewAlpha/.test(authoringViewSettingsSource), 'Outside Signage Preview must preserve multiplicative source-alpha behavior.');
assert(!/outsideSignageOpacity|outside-signage|outside preview/i.test(projectionBakeRuntimeSource), 'Outside Signage Preview must not enter ProjectionBakeRuntime.');
assert(/id="authoring-coverage-mask"/.test(htmlSource) && /id="authoring-coverage-preview"/.test(htmlSource), 'Authoring Coverage must use dedicated preview-only canvases.');
assert(/window\.runOutsideSignagePreviewSmoke/.test(rendererSource), 'Outside Signage Preview runtime smoke must be exposed.');
assert(/runOutsideSignagePreviewSmoke/.test(mainSource), 'Outside Signage Preview runtime smoke must be included in the desktop report.');
assert(packageJson.packageManager === 'npm@12.0.2', 'packageManager must record the active npm version.');
assert(packageJson.version === '0.8.5-block8e2', 'Package version must identify Block 8E-2 vector mask raster integration.');
assert(packageJson.dependencies.ws === '8.21.3', 'ws must be pinned as a production dependency.');
assert(packageJson.build.win.target[0].target === 'portable', 'Windows target must be portable.');
assert(packageJson.build.win.target[0].arch.includes('x64'), 'Windows target must include x64.');
assert(packageJson.build.files.includes('src/live-link-broker.cjs'), 'Packaged app must include the broker.');
assert(packageJson.build.files.includes('src/live-link-config.json'), 'Packaged app must include live-link config.');
assert(packageJson.build.files.includes('src/project-preload.cjs') &&
  packageJson.build.files.includes('src/project-storage.cjs') &&
  packageJson.build.files.includes('src/project-persistence.js') &&
  packageJson.build.files.includes('src/vector-mask-model.js'),
  'Packaged app must include the narrow Block 8D project persistence boundary.');
assert(/PROJECT_SCHEMA_VERSION = 2/.test(projectPersistenceSource) &&
  /PROJECT_SUPPORTED_SCHEMA_VERSIONS = Object\.freeze\(\[1, 2\]\)/.test(projectPersistenceSource) &&
  /PROJECT_SCHEMA_UNSUPPORTED/.test(projectPersistenceSource) &&
  /PROJECT_ASSET_PATH_INVALID/.test(projectPersistenceSource) &&
  /prepareProjectLoad/.test(projectPersistenceSource),
  'Block 8D must validate schema, paths, and transactional Load preparation.');
assert(/SOURCE_NORMALIZED_TOP_LEFT/.test(vectorMaskModelSource) &&
  /CUBIC_BEZIER/.test(vectorMaskModelSource) && /splitVectorMaskSegment/.test(vectorMaskModelSource) &&
  /createEmptyVectorMask/.test(vectorMaskModelSource),
  'Block 8E must provide a layer-local multi-path vector mask model.');
assert(/id="vector-mask-edit"/.test(htmlSource) && /id="vector-mask-overlay"/.test(htmlSource) &&
  /enterVectorMaskEdit/.test(rendererSource) && /beginVectorMaskSegmentInsert/.test(rendererSource),
  'Block 8E must expose the mask editor and source-coordinate overlay interactions.');
assert(/beginVectorMaskMarquee/.test(rendererSource) && /selectVectorMaskPointsInOverlayRect/.test(rendererSource) &&
  /translateVectorMaskPoints/.test(screenImageAuthoringSource) && /tryCloseVectorMaskAtFirstPoint/.test(rendererSource),
  'Block 8E must support marquee-selected anchor movement and first-anchor close gesture.');
assert(/rasterizeVectorMask/.test(vectorMaskModelSource) &&
  /rasterizeVectorMask/.test(rendererSource) && /authoringVectorMaskScratch/.test(rendererSource) &&
  /makeTemporaryVectorMaskTexture/.test(projectionBakeRuntimeSource) &&
  /source\.a \*= texture2D\(vectorMaskTexture, textureUv\)\.a/.test(projectionBakeRuntimeSource) &&
  /temporaryVectorMask\?\.dispose\(\)/.test(projectionBakeRuntimeSource) &&
  /permanentPerLayerVectorMaskTextures: 0/.test(projectionBakeRuntimeSource),
  'Block 8E-2 Preview and Bake must share hard-edge paths and dispose the selected-layer source-resolution mask texture.');
assert(/createVectorMaskPathByDoubleClick/.test(rendererSource) && /\+ NEW PATH/.test(htmlSource) &&
  /authoringCameraInterlock\.maskEditing && !exitVectorMaskEdit\(\)/.test(rendererSource) &&
  /authoringCameraInterlock\.layoutEditing && !exitLayoutEdit\(\)/.test(rendererSource),
  'Block 8E editor must prevent single-click path creation and switch directly between Layout and Mask edit modes.');
assert(/\.project\.json\.tmp-/.test(projectStorageSource) &&
  /before-manifest-commit/.test(projectStorageSource) &&
  /PROJECT_ASSET_MISSING/.test(projectStorageSource),
  'Block 8D storage must stage atomic Save and refuse missing assets.');
assert(/contextBridge\.exposeInMainWorld\('luuxProject'/.test(projectPreloadSource) &&
  !/readAnyPath|writeAnyPath|node:fs/.test(projectPreloadSource),
  'Renderer must receive only project-specific IPC operations, never generic filesystem access.');
assert(/webUtils\.getPathForFile/.test(projectPreloadSource) && /openDroppedManifest/.test(projectPreloadSource) &&
  /open-dropped-manifest/.test(mainSource),
  'Project drag/drop must resolve a dropped project.json through the narrow preload boundary.');
assert(/properties:\s*\['openFile'\]/.test(mainSource) && /extensions:\s*\['json'\]/.test(mainSource) &&
  /projectDirectoryFromManifestPath/.test(projectStorageSource),
  'Open Project must select and validate the exact project.json file.');
assert(/preload:\s*path\.join\(__dirname, 'project-preload\.cjs'\)/.test(mainSource),
  'The secure BrowserWindow must install the project-specific preload bridge.');
assert(/window\.runBlock8DProjectSmoke/.test(rendererSource) && /block8d\.technicalPass === true/.test(mainSource),
  'Block 8D runtime smoke must be part of integrated Electron acceptance.');
assert(/window\.runBlock8EFoundationSmoke/.test(rendererSource) && /block8e\.technicalPass === true/.test(mainSource) &&
  /rasterBakeIntegration:\s*'IMPLEMENTED'/.test(rendererSource),
  'Block 8E-2 editor and raster smoke must be integrated and retain the recorded user closure state.');
assert(/id="authoring-project-save-as"/.test(htmlSource) && /id="authoring-project-save"/.test(htmlSource) &&
  /id="authoring-project-open"/.test(htmlSource), 'Block 8D must expose minimal Save As, Save, and Open controls.');
assert(/DROP project\.json HERE TO OPEN/.test(htmlSource) && /addEventListener\('drop'/.test(rendererSource),
  'Block 8D must expose project.json drag/drop loading.');
assert(/class="panel-scroll"/.test(uxpHtmlSource) && /overflow-y:\s*scroll/.test(uxpStylesSource) &&
  /height:\s*100vh/.test(uxpStylesSource),
  'The UXP panel must provide an explicit full-height vertical scroll container.');
assert(/PROJECTION_FRAME_NORMALIZED_TOP_LEFT/.test(screenImageAuthoringSource) &&
  /class ScreenImageAuthoringSession/.test(screenImageAuthoringSource),
  'Block 8A must store one authoring layer in projection-frame normalized coordinates.');
assert(/new THREE\.Texture\(authoringSource\.image\)/.test(projectionBakeRuntimeSource) &&
  /ORIGINAL_FILE_BITMAP_DIRECT_TEXTURE_SAMPLE/.test(projectionBakeRuntimeSource),
  'Block 8A Production Bake must sample the original decoded file bitmap directly.');
assert(/id="authoring-image-input"/.test(htmlSource) && /id="layout-edit-button"/.test(htmlSource) &&
  /id="authoring-camera-lock"/.test(htmlSource),
  'Block 8A must expose file import, Layout Edit, and camera lock controls.');
assert(/authoringCameraInterlock\.cameraLocked/.test(rendererSource) &&
  /controlsSite\.enabled =[\s\S]*!authoringLocked/.test(rendererSource) &&
  /window\.runBlock8AInterlockSmoke/.test(rendererSource) &&
  /window\.runBlock8AAuthoringBakeSmoke/.test(rendererSource) &&
  /block8a\.pass === true/.test(mainSource),
  'Block 8A must force-disable real camera controls and include the interlock in runtime acceptance.');
assert(/setPointerCapture\(event\.pointerId\)/.test(rendererSource) &&
  /event\.preventDefault\(\)/.test(rendererSource) && /event\.stopPropagation\(\)/.test(rendererSource),
  'Block 8A direct manipulation must own pointer input without leaking it to camera controls.');

assert(liveLinkConfig.host === '127.0.0.1', 'Broker must bind only to 127.0.0.1.');
const configuredEndpoint = new URL(liveLinkConfig.endpoint);
assert(configuredEndpoint.protocol === 'ws:' && configuredEndpoint.hostname === 'localhost' && Number(configuredEndpoint.port) === liveLinkConfig.port, 'Endpoint must use localhost and the configured broker port.');
assert(liveLinkConfig.chunkSizeBytes >= 1048576 && liveLinkConfig.chunkSizeBytes <= 4194304, 'Chunk size must remain in the 1-4 MiB range.');
assert(liveLinkConfig.backpressureHighWaterMarkBytes > liveLinkConfig.chunkSizeBytes, 'Backpressure high-water mark must exceed one chunk.');
assert(manifest.reverseTransport?.block === '7', 'Build manifest must identify the Block 7 reverse transport contract.');
assert(manifest.reverseTransport?.chunkSizeBytes === liveLinkConfig.chunkSizeBytes &&
  manifest.reverseTransport?.backpressureHighWaterMarkBytes === liveLinkConfig.backpressureHighWaterMarkBytes &&
  manifest.reverseTransport?.ackTimeoutMs === liveLinkConfig.ackTimeoutMs &&
  manifest.reverseTransport?.maxFrameBytes === liveLinkConfig.maxFrameBytes,
  'Build manifest reverse transport limits must match live-link configuration.');
assert(manifest.reverseTransport?.completionGate === 'PHOTOSHOP_APPLIED', 'Block 7 success must be gated by Photoshop apply completion.');
assert(/new WebSocketServer\(options\)/.test(brokerSource), 'Broker must instantiate a WebSocket server.');
assert(/replaceExistingRoles:\s*linkSmokeTest/.test(mainSource), 'Only the isolated link smoke test may replace an already connected role.');
assert(/isolatedSmokeTestClient:\s*true/.test(mainSource), 'Synthetic Photoshop must identify itself as the isolated smoke-test client.');
assert(
  /incomingIsIsolatedTestClient\s*=\s*replaceExistingRoles\s*&&\s*message\.isolatedSmokeTestClient\s*===\s*true/.test(brokerSource) &&
  /if\s*\(!incomingIsIsolatedTestClient\)/.test(brokerSource) &&
  /ROLE_IN_USE/.test(brokerSource),
  'Production broker must reject duplicate client roles; replacement must require an explicitly isolated smoke client.'
);
assert(/maxPayload:\s*config\.chunkSizeBytes/.test(brokerSource), 'Broker maxPayload must be bounded by chunk configuration.');
assert(/bufferedAmount\s*>\s*config\.backpressureHighWaterMarkBytes/.test(brokerSource), 'Broker must apply relay backpressure.');
assert(/new THREE\.DataTexture/.test(rendererSource), 'Renderer must create a THREE.DataTexture for live frames.');
assert((rendererSource.match(/new THREE\.DataTexture/g) || []).length === 1, '2D and 3D views must not create duplicate live DataTextures.');
assert(/if\s*\(!replacingLiveTexture\)\s*applyFit\(\)/.test(rendererSource), 'Live texture replacement must preserve the current zoom, pan, and view mode.');
assert(/THREE\.RGBFormat/.test(rendererSource) && /THREE\.RGBAFormat/.test(rendererSource), 'Renderer must preserve RGB and RGBA layouts.');
assert(/texture\.internalFormat\s*=\s*sourceIsSrgb\s*\?\s*'SRGB8'\s*:\s*'RGB8'/.test(rendererSource), 'RGB DataTexture must use a WebGL2 sized internal format without RGB-to-RGBA expansion.');
assert(/metadata\.colorProfile\s*\|\|\s*metadata\.requestedColorProfile\s*\|\|\s*metadata\.documentColorProfile/.test(rendererSource), 'Live sRGB detection must retain the requested capture profile when ImageData omits its profile.');
assert(!/createElement\(['"]canvas/i.test(liveFrameInstallSource), 'Live frame installation creates an intermediate canvas.');
assert(/new Uint8Array\(metadata\.totalBytes\)/.test(rendererSource), 'Renderer must preallocate the exact declared frame size.');
assert(/uv\.setY\(index,\s*1\s*-\s*uv\.getY\(index\)\)/.test(rendererSource), 'Live orientation must be corrected without flipping the full pixel buffer.');
assert(htmlSource.includes(`connect-src 'self' file: ${liveLinkConfig.endpoint}`), 'Renderer CSP must permit only the configured loopback WebSocket endpoint.');
assert(/new THREE\.Raycaster/.test(rendererSource) && /intersectObject\(pointerMesh/.test(rendererSource), 'Pointer mapping must raycast only the active signage surface.');
assert(/worldToLocal\(hit\.point\.clone\(\)\)/.test(rendererSource), 'Pointer mapping must use the mesh local intersection point.');
assert(/localX \/ surfaceWidth \+ 0\.5/.test(coordinateSource) && /0\.5 - localY \/ surfaceHeight/.test(coordinateSource), 'Canonical mapping must use top-left normalized coordinates from centered surface-local coordinates.');
assert(/origin:\s*'top-left'/.test(coordinateSource), 'Canonical Signage Coordinate origin must be top-left.');
assert(/canonicalToLocalPoint/.test(rendererSource) && /id="pointer-marker"/.test(htmlSource), 'Previz must project a persistent marker from canonical source coordinates.');
assert(/new THREE\.PerspectiveCamera/.test(rendererSource), 'Block 3A must use a PerspectiveCamera for the 3D plane view.');
assert(/new OrbitControls\(camera3d, canvas\)/.test(rendererSource), 'Block 3A must use bundled OrbitControls.');
assert(/controls\.mouseButtons\.LEFT = THREE\.MOUSE\.ROTATE/.test(rendererSource), '3D left drag must orbit.');
assert(/controls\.mouseButtons\.MIDDLE = THREE\.MOUSE\.PAN/.test(rendererSource), '3D middle drag must pan.');
assert(/surfaceLocalPointToCanonical/.test(rendererSource), '3D hit mapping must use the surface-to-canonical contract.');
assert(/state\.mesh\?\.material\.map === state\.texture/.test(rendererSource) && /state\.plane3d\?\.material\.map === state\.texture/.test(rendererSource), '2D and 3D materials must share one texture object.');
assert(/id="view-2d-button"/.test(htmlSource) && /id="view-3d-plane-button"/.test(htmlSource), 'Renderer must expose separate 2D VIEW and 3D PLANE controls.');
assert(/movement > 4/.test(rendererSource) && /runBlock3PlanePointerSmokeRequest/.test(rendererSource), '3D POINT mode must preserve the click/drag threshold and smoke entrypoint.');
assert(/runBlock3PlaneMarkerCameraSmoke/.test(rendererSource) && /screenPositionChanged/.test(rendererSource), '3D marker must be smoke-tested across camera movement.');
assert(/new GLTFLoader/.test(rendererSource) && /Object\.entries\(SITE_SCENE_PROFILE\.assets\)/.test(rendererSource), 'SITE 3D must load both tracked GLBs through bundled GLTFLoader.');
assert(/intersectObjects\(pointerMeshes, false\)/.test(rendererSource), 'SITE 3D must raycast only registered active signage surfaces.');
assert(/normalizedPointToCanonical\(hit\.uv\.x, hit\.uv\.y/.test(rendererSource), 'GLB ordinary planar UV hits must map through the canonical adapter.');
assert(/id="view-site-3d-button"/.test(htmlSource) && /id="site-mapping-select"/.test(htmlSource), 'Renderer must expose SITE 3D and NORMAL/ANAMORPHIC controls.');
assert(/const DEFAULT_ACTIVE_VIEW = 'site-3d'/.test(rendererSource) && /activeView:\s*DEFAULT_ACTIVE_VIEW/.test(rendererSource), 'Block 4F must default the runtime to SITE 3D.');
assert(/id="view-site-3d-button" class="view-button active"/.test(htmlSource) && !/id="view-2d-button" class="view-button active"/.test(htmlSource), 'Block 4F HTML must present SITE 3D as the startup view.');
assert(/runBlock4FStartupViewSmoke/.test(rendererSource) && /startupView\.pass === true/.test(mainSource), 'Runtime smoke must validate SITE 3D startup, 2D access, and SITE 3D re-entry.');
assert(/id="legacy-camera-lock-button"[^>]*aria-pressed="true"[^>]*hidden/.test(htmlSource), 'Legacy camera lock control must exist and default to locked/hidden.');
assert(/function isLegacyCameraContext\(\)/.test(rendererSource) && /state\.site\.world === 'legacy2d'/.test(rendererSource), 'Camera lock must be scoped to Legacy 2D World.');
assert(/enteringLegacy[\s\S]*state\.site\.legacyCameraLocked = true/.test(rendererSource), 'Entering Legacy 2D World must restore the default camera lock.');
assert(/siteSceneSelect\.addEventListener\('change',[\s\S]*lockLegacyCamera\(\)/.test(rendererSource), 'Every Legacy scene change must restore the camera lock.');
assert(/!legacyContext \|\| !state\.site\.legacyCameraLocked/.test(rendererSource), 'Legacy OrbitControls must only enable after explicit unlock.');
assert(/toggleLegacyCameraLock/.test(rendererSource) && /cameraControlsEnabled: controlsSite\.enabled/.test(rendererSource), 'Legacy camera lock must be user-toggleable and observable in diagnostics.');
assert(/ANAM_SURFACE_FRONT75F/.test(anamorphicCalibrationSource) &&
  /function anamorphicSurface\(profile\)/.test(siteProfileSource) &&
  /exactName:\s*profile\.surface\.surfaceNode/.test(siteProfileSource) &&
  /anamorphicSurface\(ANAMORPHIC_FRONT_75F_PROFILE\)/.test(siteProfileSource),
  'SceneProfile must use the exact 75F surface selector from the calibration profile.');
assert(/LUUX_Front_3Dworld_Basic/.test(siteProfileSource) && /ILMIN_Back_3Dworld_Basic/.test(siteProfileSource), 'SceneProfile must select only the named 3D World basic-mapping meshes.');
assert(/anamorphicScenes:\s*null/.test(siteProfileSource), 'Legacy anamorphic scene meshes must remain unguessed and unavailable.');
assert(/runBlock5AAnamorphicSmoke/.test(rendererSource) && /missingFamiliesUnavailable/.test(rendererSource), 'Block 5A must expose an explicit 75F and missing-family safety smoke test.');
assert(/runBlock5BBackSmoke/.test(rendererSource) && /ANAM_SURFACE_BACK/.test(anamorphicCalibrationSource) &&
  /anamorphicSurface\(ANAMORPHIC_BACK_PROFILE\)/.test(siteProfileSource),
  'Block 5B must expose an explicit BACK family smoke and exact surface contract.');
assert(/cameraProfile\.runtimeAspect/.test(rendererSource) && /projectionAndWorkingAspectSeparated/.test(rendererSource), 'Anamorphic camera projection aspect must remain independent from the working canvas aspect.');
assert(/Signage MockUp Generator/.test(htmlSource) && /LUNARGRAPHICS/.test(htmlSource), 'Block 5A must expose the user-visible product name and LUNARGRAPHICS branding.');
assert(/HORIZONTAL_3DS_MAX_DEFAULT_CAMERA_USER_CONFIRMED/.test(anamorphicCalibrationSource) &&
  /runtimeFov:\s*19\.778/.test(anamorphicCalibrationSource) &&
  /id="anamorphic-fov-input"/.test(htmlSource) &&
  /applyAnamorphicFovValue/.test(rendererSource),
  '75F must use the confirmed Max vertical FOV and expose a scoped editable FOV control.');
assert(/calibrationStatus:\s*'USER_VALIDATED'/.test(anamorphicCalibrationSource) &&
  /visualValidationState:\s*'PASS'/.test(anamorphicCalibrationSource) &&
  /validationDate:\s*'2026-09-11'/.test(anamorphicCalibrationSource),
  'The 75F calibration profile must record the explicit user visual validation.');
assert(/function isAnamorphicCalibrationFramingActive/.test(rendererSource) &&
  /freePreviewFovDefault/.test(rendererSource) &&
  /freePreviewCanvasUnrestricted/.test(rendererSource),
  'Leaving 75F calibration must restore default camera framing and release the canvas aspect restriction.');
assert(/ANAMORPHIC_CALIBRATION_MATTE_COLOR\s*=\s*0x20242c/.test(rendererSource) &&
  /anamorphicCalibrationActive\s*\?\s*ANAMORPHIC_CALIBRATION_MATTE_COLOR\s*:\s*siteClearColor/.test(rendererSource) &&
  /renderer\.setScissorTest\(true\);[\s\S]*renderer\.setClearColor\(siteClearColor, 1\);[\s\S]*renderer\.clear\(true, true, true\);[\s\S]*renderer\.render\(sceneSite, cameraSite\)/.test(rendererSource),
  '75F calibration must render a dark matte only outside the contained working canvas.');
assert(/DEFERRED_CANONICAL_INVERSE_MAPPING_UNPROVEN/.test(anamorphicCalibrationSource) &&
  /selectedSiteContract\(\)\.pointEnabled !== false/.test(rendererSource),
  '75F POINT must remain disabled until canonical inverse mapping is proven.');
assert(/new THREE\.Texture\(image\)/.test(rendererSource) && /scenePhoto/.test(rendererSource), 'Block 4C must render the selected photo through an independent Three.js background pass.');
assert(/renderer\.render\(scenePhoto, cameraPhoto\)[\s\S]*renderer\.clearDepth\(\)[\s\S]*renderer\.render\(sceneSite, cameraSite\)/.test(rendererSource), 'Block 4C layer order must be photo, then signage overlay.');
assert(/clientPointToContentNdc/.test(rendererSource) && /if \(state\.activeView === 'site-3d' && isPhotoSceneContext\(\) && !photoNdc\) return null/.test(rendererSource), 'Photo POINT must reject input outside the centered 3:2 content viewport.');
assert(/class LatestWinsPhotoSceneController/.test(photoRuntimeSource) && /token !== this\.requestToken/.test(photoRuntimeSource), 'Photo scene switching must use an explicit latest-wins request token.');
assert(/runtimeUrl: `\$\{PHOTO_RUNTIME_ROOT\}/.test(siteCalibrationSource) && /GENERATED_BUILD_ASSET/.test(siteCalibrationSource), 'Photo runtime URLs must resolve only to generated build assets.');
assert(/marker\.documentId === live\.documentId/.test(rendererSource), 'Previz marker must be bound to the matching live Photoshop document.');
assert(/Previz_3Dworld_Background_v02\.glb/.test(siteEnvironmentSource), 'Block 4D must select the corrected v02 environment revision.');
assert(/MUTABLE_INFORMATIONAL_FINGERPRINT/.test(siteEnvironmentSource), 'Environment revision metadata must remain informational.');
assert(/EXACT_ONLY_NO_FUZZY_SIGNAGE_SELECTOR/.test(siteEnvironmentSource), 'Environment exclusions must use exact names only.');
assert(/new THREE\.MeshStandardMaterial/.test(rendererSource) && /roughness:[\s\S]*metalness:[\s\S]*side: THREE\.DoubleSide/.test(rendererSource), 'Environment meshes must receive the neutral double-sided runtime material.');
assert(/child\.raycast = \(\) => \{\}/.test(rendererSource), 'Environment meshes must be excluded from runtime raycasting.');
assert(/id="environment-presentation-select"/.test(htmlSource), 'Block 4D must expose DAY and NIGHT environment presentation modes.');
assert(/pending/.test(rendererSource) && /acknowledged/.test(rendererSource) && /error/.test(rendererSource), 'Previz marker must expose pending, acknowledged, and error states.');
assert(/event\.button === 1[\s\S]*beginPan\(event\)/.test(rendererSource), 'Middle-button drag must begin pan in both interaction modes.');
assert(/state\.dragPointerId !== event\.pointerId/.test(rendererSource), 'Pan must track its initiating pointer ID.');
assert(/state\.dragging && state\.dragPointerId === event\.pointerId[\s\S]*endDrag\(event\)[\s\S]*return/.test(rendererSource), 'Middle-button pan release must finish before POINT click handling.');
assert(/state\.asset\?\.kind === 'live'/.test(rendererSource), 'Pointer commands must require a Photoshop Live source.');
assert(/class LatestWinsPointerQueue/.test(pointerQueueSource) && /this\.pending = command/.test(pointerQueueSource), 'Pointer commands must use one-in-flight latest-wins queuing.');
assert(/id="navigate-button"/.test(htmlSource) && /id="point-button"/.test(htmlSource) && /id="clear-pointer-button"/.test(htmlSource), 'Renderer must expose NAVIGATE, POINT, and CLEAR POINTER controls.');
assert(/case 'POINTER_ACK'/.test(rendererSource) && /case 'POINTER_ERROR'/.test(rendererSource), 'Renderer must handle pointer ACK and ERROR messages.');
assert(/case 'POINTER_SET'/.test(brokerSource) && /case 'POINTER_CLEAR'/.test(brokerSource), 'Broker must route reverse pointer control messages.');
assert(/DUPLICATE_REQUEST/.test(brokerSource) && /UXP_DISCONNECTED/.test(brokerSource) && /OUT_OF_RANGE/.test(brokerSource), 'Broker must enforce pointer safety validation.');

assert(uxpManifest.manifestVersion === 5, 'UXP manifest must use manifest v5.');
assert(uxpManifest.host.app === 'PS' && uxpManifest.host.minVersion === '23.3.0', 'UXP host baseline must be Photoshop 23.3 or newer.');
const liveLinkUrl = new URL(liveLinkConfig.endpoint);
const expectedUxpPermission = `${liveLinkUrl.protocol}//${liveLinkUrl.hostname}/`;
assert(JSON.stringify(uxpManifest.requiredPermissions?.network?.domains) === JSON.stringify([expectedUxpPermission]), 'UXP network permission must contain only the localhost WebSocket origin with a trailing slash and without a port.');
assert(uxpConfig.endpoint === liveLinkConfig.endpoint, 'UXP and Electron endpoints must match.');
assert(uxpConfig.chunkSizeBytes === liveLinkConfig.chunkSizeBytes, 'UXP and Electron chunk sizes must match.');
assert(uxpConfig.protocol === liveLinkConfig.protocol && uxpConfig.protocolVersion === liveLinkConfig.protocolVersion, 'UXP and Electron protocol identifiers must match.');
assert(/imaging\.getPixels\(\{[\s\S]*documentID:\s*doc\.id,[\s\S]*colorSpace:\s*'RGB',[\s\S]*colorProfile:\s*DISPLAY_COLOR_PROFILE,[\s\S]*componentSize:\s*8[\s\S]*\}\)/.test(uxpSource), 'UXP must request the active document composite as Photoshop-converted 8-bit sRGB pixels.');
assert(/core\.executeAsModal\(async\s*\(\)\s*=>\s*\{[\s\S]*imaging\.getPixels/.test(uxpSource), 'UXP imaging capture must run inside Photoshop modal scope.');
assert(!/\b(?:layerID|sourceBounds|targetSize)\b/.test(captureSource), 'UXP composite capture must not request a layer, bounds, or resized target.');
assert(/getData\(\{\s*chunky:\s*true\s*\}\)/.test(uxpSource), 'UXP must request chunky pixel data.');
assert(/finally\s*\{\s*photoshopImageData\.dispose\(\)/s.test(uxpSource), 'PhotoshopImageData must be disposed in finally.');
assert(/bufferedAmount\s*>\s*limit/.test(uxpSource), 'UXP sender must use WebSocket bufferedAmount backpressure.');
assert(/socket\.onopen\s*=/.test(uxpSource) && /socket\.onmessage\s*=/.test(uxpSource), 'UXP WebSocket must use the event-handler properties supported by the host runtime.');
assert(!/socket\.addEventListener/.test(uxpSource), 'UXP WebSocket must not depend on browser-only addEventListener support.');
assert(/state\.dirty/.test(uxpSource), 'UXP sender must implement latest-wins dirty state.');
const notificationRegistrations = uxpSource.match(/action\.addNotificationListener/g) || [];
assert(notificationRegistrations.length === 2 && /action\.addNotificationListener\(\['all'\],\s*probeNotificationListener\)/.test(uxpSource), 'Block 1B must retain one explicit developer-mode catch-all probe listener.');
assert(/action\.removeNotificationListener\(\['all'\],\s*probeNotificationListener\)/.test(uxpSource), 'Event probe must unregister the exact catch-all listener callback.');
assert(/const AUTO_SYNC_EVENTS = \['historyStateChanged'\]/.test(uxpSource), 'Production Auto Sync must use only the event observed across all representative Photoshop operations.');
assert(/const AUTO_SYNC_DEBOUNCE_MS = 350/.test(uxpSource), 'Auto Sync must use the selected 350 ms debounce interval.');
assert(/action\.addNotificationListener\(AUTO_SYNC_EVENTS,\s*autoSyncNotificationListener\)/.test(uxpSource), 'Auto Sync must register the single production listener callback.');
assert(/action\.removeNotificationListener\(AUTO_SYNC_EVENTS,\s*autoSyncNotificationListener\)/.test(uxpSource), 'Auto Sync OFF must remove the exact production listener callback.');
assert(/elements\.sendButton\.onclick = \(\) => requestLatestFrame\('manual'\)/.test(uxpSource), 'Manual Send must use the shared latest-frame request entrypoint.');
assert(/requestLatestFrame\('auto'\)/.test(uxpSource), 'Debounced Auto Sync must use the shared latest-frame request entrypoint.');
assert(/const POINTER_LAYER_NAME = '__LUUX_POINTER__'/.test(uxpSource), 'UXP pointer writes must use the reserved helper layer name.');
assert(/const POINTER_DIAMETER_PX = 25/.test(uxpSource), 'Pointer patch diameter must be one explicit native-pixel constant.');
assert(/doc\.id !== message\.documentId \|\| doc\.width !== message\.width \|\| doc\.height !== message\.height/.test(uxpSource), 'UXP must reject stale document ID or dimension mismatches.');
assert(/doc\.createLayer\(constants\.LayerKind\.NORMAL/.test(uxpSource), 'UXP must create a Pixel Layer through the supported DOM API.');
assert(/imaging\.createImageDataFromBuffer/.test(uxpSource) && /imaging\.putPixels/.test(uxpSource), 'UXP must write a small pixel patch through the official Imaging API.');
assert(/replace:\s*true/.test(uxpSource) && /targetBounds:\s*\{\s*left:\s*patch\.left,\s*top:\s*patch\.top\s*\}/.test(uxpSource), 'Pointer writes must replace the helper layer and use clipped target bounds.');
assert(/imageData\.dispose\(\)/.test(uxpSource), 'Created pointer image data must be disposed.');
assert(/core\.executeAsModal\(async\s*\(\)\s*=>\s*\{[\s\S]*validatePointerDocument/.test(uxpSource), 'Pointer document mutation must execute inside modal scope.');
assert(/id="pointer-state"/.test(uxpHtmlSource) && /id="pointer-requested"/.test(uxpHtmlSource) && /id="pointer-applied"/.test(uxpHtmlSource), 'UXP must expose reverse pointer diagnostics.');
assert(!/id="auto-sync"[^>]*disabled/.test(uxpHtmlSource), 'Auto Sync checkbox must be enabled after the real event probe.');
assert(/id="probe-start"/.test(uxpHtmlSource) && /id="probe-operation"/.test(uxpHtmlSource), 'UXP must expose the temporary Block 1B event probe controls.');

for (const asset of manifest.assets) {
  const file = path.join(appRoot, 'build', 'assets', asset.fileName);
  const details = await stat(file);
  assert(details.size === asset.bytes, `Built asset size mismatch: ${asset.fileName}`);
}
for (const siteAsset of Object.values(manifest.siteAssets)) {
  const siteAssetFile = path.join(appRoot, 'build', 'assets', 'site', siteAsset.fileName);
  const siteAssetDetails = await stat(siteAssetFile);
  assert(siteAssetDetails.size === siteAsset.byteLength, `Built site GLB size mismatch: ${siteAsset.fileName}`);
}
for (const photoAsset of manifest.photoAssets) {
  const photoFile = path.join(appRoot, 'build', 'assets', 'photo', photoAsset.runtimeFileName);
  const photoDetails = await stat(photoFile);
  assert(photoDetails.size === photoAsset.byteLength, `Built photo size mismatch: ${photoAsset.runtimeFileName}`);
  assert(photoAsset.sourceVerified === true && photoAsset.buildCopyVerified === true, `Photo verification flags missing: ${photoAsset.runtimeFileName}`);
}
const environmentFile = path.join(appRoot, 'build', 'assets', 'environment', path.basename(manifest.environmentAsset.runtimeUrl));
const environmentDetails = await stat(environmentFile);
assert(environmentDetails.size === manifest.environmentAsset.observedFingerprint.byteLength, 'Built environment GLB size mismatch.');
assert(manifest.environmentAsset.sourceVerified === true && manifest.environmentAsset.buildCopyVerified === true, 'Environment verification flags are missing.');
assert(manifest.environmentAsset.revisionPolicy === 'MUTABLE_INFORMATIONAL_FINGERPRINT', 'Environment revision policy must remain mutable/informational.');
const matteFile = path.join(appRoot, 'build', 'assets', 'projection', manifest.projectionBake.matte.fileName);
const matteDetails = await stat(matteFile);
assert(matteDetails.size === manifest.projectionBake.matte.byteLength, 'Built Projection Bake matte GLB size mismatch.');
assert(manifest.projectionBake.matte.sourceVerified === true && manifest.projectionBake.matte.buildCopyVerified === true, 'Projection Bake matte verification flags are missing.');
assert(manifest.projectionBake.matte.loadScope === 'PROJECTION_BAKE_RUN_ONLY', 'Projection Bake matte must be run-scoped.');
assert(manifest.projectionBake.matte.ordinarySceneAttachment === 'NEVER', 'Projection Bake matte must never attach to an ordinary scene.');

const result = {
  pass: failures.length === 0,
  failures,
  security: {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true
  },
  offlineRenderer: true,
  intermediateCanvas: false,
  liveLink: {
    endpoint: liveLinkConfig.endpoint,
    bindAddress: liveLinkConfig.host,
    chunkSizeBytes: liveLinkConfig.chunkSizeBytes,
    manifestVersion: uxpManifest.manifestVersion,
    permissionDomains: uxpManifest.requiredPermissions.network.domains,
    manualSendOnly: false,
    autoSyncEvent: 'historyStateChanged',
    autoSyncDebounceMs: 350,
    rgbToRgbaExpansion: false
  },
  pointerLink: {
    canonicalOrigin: 'top-left',
    mapping: 'raycast -> mesh local -> Canonical Signage Coordinate',
    layerName: '__LUUX_POINTER__',
    patchDiameterPx: 25,
    latestWins: true
  },
  assets: manifest.assets,
  photoAssets: manifest.photoAssets,
  environmentAsset: manifest.environmentAsset
};
console.log(JSON.stringify(result, null, 2));
if (failures.length > 0) process.exitCode = 1;
