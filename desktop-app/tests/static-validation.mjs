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
const htmlSource = await readFile(path.join(appRoot, 'src', 'index.html'), 'utf8');
const builtRenderer = await readFile(path.join(appRoot, 'build', 'renderer.js'), 'utf8');
const manifest = JSON.parse(await readFile(path.join(appRoot, 'build', 'assets-manifest.json'), 'utf8'));
const uxpRoot = path.join(projectRoot, 'photoshop-uxp', 'luux-live-link');
const uxpManifest = JSON.parse(await readFile(path.join(uxpRoot, 'manifest.json'), 'utf8'));
const uxpConfigSource = await readFile(path.join(uxpRoot, 'config.js'), 'utf8');
const uxpHtmlSource = await readFile(path.join(uxpRoot, 'index.html'), 'utf8');
const uxpSource = await readFile(path.join(uxpRoot, 'index.js'), 'utf8');
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
assert(/if\s*\(!replacingLiveTexture\)\s*applyFit\(\)/.test(rendererSource), 'Live texture replacement must preserve the current zoom, pan, and view mode.');
assert(/THREE\.RGBFormat/.test(rendererSource) && /THREE\.RGBAFormat/.test(rendererSource), 'Renderer must preserve RGB and RGBA layouts.');
assert(/texture\.internalFormat\s*=\s*sourceIsSrgb\s*\?\s*'SRGB8'\s*:\s*'RGB8'/.test(rendererSource), 'RGB DataTexture must use a WebGL2 sized internal format without RGB-to-RGBA expansion.');
assert(/metadata\.colorProfile\s*\|\|\s*metadata\.requestedColorProfile\s*\|\|\s*metadata\.documentColorProfile/.test(rendererSource), 'Live sRGB detection must retain the requested capture profile when ImageData omits its profile.');
assert(!/createElement\(['"]canvas/i.test(rendererSource), 'Renderer creates an intermediate canvas.');
assert(/new Uint8Array\(metadata\.totalBytes\)/.test(rendererSource), 'Renderer must preallocate the exact declared frame size.');
assert(/uv\.setY\(index,\s*1\s*-\s*uv\.getY\(index\)\)/.test(rendererSource), 'Live orientation must be corrected without flipping the full pixel buffer.');
assert(htmlSource.includes(`connect-src 'self' file: ${liveLinkConfig.endpoint}`), 'Renderer CSP must permit only the configured loopback WebSocket endpoint.');

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
assert(!/\b(?:layerID|sourceBounds|targetSize)\b/.test(uxpSource), 'UXP capture must not request a layer, bounds, or resized target.');
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
assert(!/id="auto-sync"[^>]*disabled/.test(uxpHtmlSource), 'Auto Sync checkbox must be enabled after the real event probe.');
assert(/id="probe-start"/.test(uxpHtmlSource) && /id="probe-operation"/.test(uxpHtmlSource), 'UXP must expose the temporary Block 1B event probe controls.');

for (const asset of manifest.assets) {
  const file = path.join(appRoot, 'build', 'assets', asset.fileName);
  const details = await stat(file);
  assert(details.size === asset.bytes, `Built asset size mismatch: ${asset.fileName}`);
}

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
  assets: manifest.assets
};
console.log(JSON.stringify(result, null, 2));
if (failures.length > 0) process.exitCode = 1;
