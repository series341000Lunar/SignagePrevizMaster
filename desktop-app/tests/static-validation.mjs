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
const coordinateSource = await readFile(path.join(appRoot, 'src', 'canonical-coordinate.js'), 'utf8');
const pointerQueueSource = await readFile(path.join(appRoot, 'src', 'pointer-command-queue.js'), 'utf8');
const siteProfileSource = await readFile(path.join(appRoot, 'src', 'site-scene-profile.js'), 'utf8');
const siteCalibrationSource = await readFile(path.join(appRoot, 'src', 'site-calibration-profile.js'), 'utf8');
const siteEnvironmentSource = await readFile(path.join(appRoot, 'src', 'site-environment-profile.js'), 'utf8');
const photoRuntimeSource = await readFile(path.join(appRoot, 'src', 'photo-scene-runtime.js'), 'utf8');
const htmlSource = await readFile(path.join(appRoot, 'src', 'index.html'), 'utf8');
const builtRenderer = await readFile(path.join(appRoot, 'build', 'renderer.js'), 'utf8');
const manifest = JSON.parse(await readFile(path.join(appRoot, 'build', 'assets-manifest.json'), 'utf8'));
const uxpRoot = path.join(projectRoot, 'photoshop-uxp', 'luux-live-link');
const uxpManifest = JSON.parse(await readFile(path.join(uxpRoot, 'manifest.json'), 'utf8'));
const uxpConfigSource = await readFile(path.join(uxpRoot, 'config.js'), 'utf8');
const uxpHtmlSource = await readFile(path.join(uxpRoot, 'index.html'), 'utf8');
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
assert(!/createElement\(['"]canvas/i.test(rendererSource), 'Renderer creates an intermediate canvas.');
assert(!/_TestSource/i.test(`${mainSource}\n${rendererSource}\n${htmlSource}`), 'Runtime references _TestSource.');
assert(packageJson.packageManager === 'npm@12.0.2', 'packageManager must record the active npm version.');
assert(packageJson.version === '0.4.0-block4d', 'Package version must identify the Block 4D checkpoint.');
assert(packageJson.dependencies.ws === '8.21.3', 'ws must be pinned as a production dependency.');
assert(packageJson.build.win.target[0].target === 'portable', 'Windows target must be portable.');
assert(packageJson.build.win.target[0].arch.includes('x64'), 'Windows target must include x64.');
assert(packageJson.build.files.includes('src/live-link-broker.cjs'), 'Packaged app must include the broker.');
assert(packageJson.build.files.includes('src/live-link-config.json'), 'Packaged app must include live-link config.');

assert(liveLinkConfig.host === '127.0.0.1', 'Broker must bind only to 127.0.0.1.');
const configuredEndpoint = new URL(liveLinkConfig.endpoint);
assert(configuredEndpoint.protocol === 'ws:' && configuredEndpoint.hostname === 'localhost' && Number(configuredEndpoint.port) === liveLinkConfig.port, 'Endpoint must use localhost and the configured broker port.');
assert(liveLinkConfig.chunkSizeBytes >= 1048576 && liveLinkConfig.chunkSizeBytes <= 4194304, 'Chunk size must remain in the 1-4 MiB range.');
assert(liveLinkConfig.backpressureHighWaterMarkBytes > liveLinkConfig.chunkSizeBytes, 'Backpressure high-water mark must exceed one chunk.');
assert(/new WebSocketServer\(options\)/.test(brokerSource), 'Broker must instantiate a WebSocket server.');
assert(/replaceExistingRoles:\s*linkSmokeTest/.test(mainSource), 'Only the isolated link smoke test may replace an already connected role.');
assert(/if\s*\(!replaceExistingRoles\)/.test(brokerSource), 'Production broker must reject duplicate client roles.');
assert(/maxPayload:\s*config\.chunkSizeBytes/.test(brokerSource), 'Broker maxPayload must be bounded by chunk configuration.');
assert(/bufferedAmount\s*>\s*config\.backpressureHighWaterMarkBytes/.test(brokerSource), 'Broker must apply relay backpressure.');
assert(/new THREE\.DataTexture/.test(rendererSource), 'Renderer must create a THREE.DataTexture for live frames.');
assert((rendererSource.match(/new THREE\.DataTexture/g) || []).length === 1, '2D and 3D views must not create duplicate live DataTextures.');
assert(/if\s*\(!replacingLiveTexture\)\s*applyFit\(\)/.test(rendererSource), 'Live texture replacement must preserve the current zoom, pan, and view mode.');
assert(/THREE\.RGBFormat/.test(rendererSource) && /THREE\.RGBAFormat/.test(rendererSource), 'Renderer must preserve RGB and RGBA layouts.');
assert(/texture\.internalFormat\s*=\s*sourceIsSrgb\s*\?\s*'SRGB8'\s*:\s*'RGB8'/.test(rendererSource), 'RGB DataTexture must use a WebGL2 sized internal format without RGB-to-RGBA expansion.');
assert(/metadata\.colorProfile\s*\|\|\s*metadata\.requestedColorProfile\s*\|\|\s*metadata\.documentColorProfile/.test(rendererSource), 'Live sRGB detection must retain the requested capture profile when ImageData omits its profile.');
assert(!/createElement\(['"]canvas/i.test(rendererSource), 'Renderer creates an intermediate canvas.');
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
assert(/id="legacy-camera-lock-button"[^>]*aria-pressed="true"[^>]*hidden/.test(htmlSource), 'Legacy camera lock control must exist and default to locked/hidden.');
assert(/function isLegacyCameraContext\(\)/.test(rendererSource) && /state\.site\.world === 'legacy2d'/.test(rendererSource), 'Camera lock must be scoped to Legacy 2D World.');
assert(/enteringLegacy[\s\S]*state\.site\.legacyCameraLocked = true/.test(rendererSource), 'Entering Legacy 2D World must restore the default camera lock.');
assert(/siteSceneSelect\.addEventListener\('change',[\s\S]*lockLegacyCamera\(\)/.test(rendererSource), 'Every Legacy scene change must restore the camera lock.');
assert(/!legacyContext \|\| !state\.site\.legacyCameraLocked/.test(rendererSource), 'Legacy OrbitControls must only enable after explicit unlock.');
assert(/toggleLegacyCameraLock/.test(rendererSource) && /cameraControlsEnabled: controlsSite\.enabled/.test(rendererSource), 'Legacy camera lock must be user-toggleable and observable in diagnostics.');
assert(/LUUX_Front_3Dworld_Anamorphic/.test(siteProfileSource) && /ILMIN_Back_3Dworld_Anamorphic/.test(siteProfileSource), 'SceneProfile must reserve the named 3D World anamorphic meshes.');
assert(/LUUX_Front_3Dworld_Basic/.test(siteProfileSource) && /ILMIN_Back_3Dworld_Basic/.test(siteProfileSource), 'SceneProfile must select only the named 3D World basic-mapping meshes.');
assert(/anamorphicScenes:\s*null/.test(siteProfileSource), 'Legacy anamorphic scene meshes must remain unguessed and unavailable.');
assert(/runBlock3MissingAnamorphicSmoke/.test(rendererSource) && /visibleSurfaceCount/.test(rendererSource), 'Missing anamorphic surfaces must have an explicit safety smoke test.');
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
