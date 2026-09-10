'use strict';

const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const liveLinkConfig = require('./live-link-config.json');
const { createLiveLinkBroker } = require('./live-link-broker.cjs');
const { WebSocket } = require('ws');

const smokeTest = process.argv.includes('--smoke-test');
const linkSmokeTest = process.argv.includes('--link-smoke-test');
const reportArgument = process.argv.find((argument) => argument.startsWith('--report='));
const screenshotArgument = process.argv.find((argument) => argument.startsWith('--screenshot='));
const externalNetworkRequests = [];
const loopbackRequests = [];
const criticalErrors = [];
const liveLinkEvents = [];
let liveLinkBroker = null;

if (smokeTest || linkSmokeTest) {
  const profileName = linkSmokeTest ? 'link-smoke-profile' : 'runtime-smoke-profile';
  app.setPath('userData', path.resolve(process.cwd(), '.runtime', profileName));
}

const securityPreferences = Object.freeze({
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true
});

function resolveArgumentPath(argument, fallbackName) {
  const value = argument ? argument.slice(argument.indexOf('=') + 1) : path.join('.runtime', fallbackName);
  return path.resolve(process.cwd(), value);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function waitForDiagnostics(window) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const result = await window.webContents.executeJavaScript('window.block0Diagnostics ?? null', true);
    if (result?.fullResolution || result?.error) return result;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Timed out waiting for renderer diagnostics.');
}

async function waitForPointerDiagnostics(window, requestId) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const result = await window.webContents.executeJavaScript('window.block2PointerDiagnostics ?? null', true);
    if (result?.lastAck?.requestId === requestId && !result.queue.activeRequestId) return result;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for pointer diagnostics for request ${requestId}.`);
}

async function waitForSiteReady(window) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const result = await window.webContents.executeJavaScript('window.block3SiteDiagnostics ?? null', true);
    if (result?.status === 'READY') return result;
    if (result?.status === 'ERROR') throw new Error(result.error || 'Site scene load failed.');
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Timed out waiting for Site scene readiness.');
}

async function runSmokeTest(window) {
  const reportPath = resolveArgumentPath(reportArgument, 'runtime.json');
  const screenshotPath = resolveArgumentPath(screenshotArgument, 'runtime.png');
  try {
    await waitForDiagnostics(window);
    const runtime = await window.webContents.executeJavaScript('window.runBlock0SmokeActions()', true);
    await waitForSiteReady(window);
    const cameraEditor = await window.webContents.executeJavaScript('window.runBlock4BCameraEditorSmoke()', true);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const image = await window.webContents.capturePage();
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    fs.writeFileSync(screenshotPath, image.toPNG());

    const broker = liveLinkBroker?.getSnapshot() || null;
    const allActionsPass = Object.values(runtime.actions).every(Boolean);
    const technicalPass =
      runtime.fullResolution &&
      runtime.hardwareRendering &&
      runtime.contextLossCount === 0 &&
      runtime.memoryStable &&
      allActionsPass &&
      Object.values(cameraEditor).every(Boolean) &&
      broker?.address?.address === liveLinkConfig.host &&
      broker?.address?.port === liveLinkConfig.port &&
      broker?.rendererConnected === true &&
      externalNetworkRequests.length === 0 &&
      criticalErrors.length === 0;
    const report = {
      technicalPass,
      packaged: app.isPackaged,
      executable: process.execPath,
      securityPreferences,
      externalNetworkRequests,
      loopbackRequests,
      liveLink: { config: liveLinkConfig, broker, events: liveLinkEvents },
      criticalErrors,
      runtime,
      cameraEditor,
      screenshotPath
    };
    writeJson(reportPath, report);
    console.log(`BLOCK0_REPORT=${reportPath}`);
    console.log(`BLOCK0_TECHNICAL_PASS=${technicalPass}`);
    app.exit(technicalPass ? 0 : 2);
  } catch (error) {
    const report = {
      technicalPass: false,
      packaged: app.isPackaged,
      executable: process.execPath,
      securityPreferences,
      externalNetworkRequests,
      loopbackRequests,
      liveLink: { config: liveLinkConfig, broker: liveLinkBroker?.getSnapshot() || null, events: liveLinkEvents },
      criticalErrors,
      error: error.stack || error.message
    };
    writeJson(reportPath, report);
    console.error(error);
    app.exit(2);
  }
}

function waitForClientMessage(socket, predicate, timeoutMs = liveLinkConfig.ackTimeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('Timed out waiting for synthetic live-link response.'));
    }, timeoutMs);
    function onMessage(data, isBinary) {
      if (isBinary) return;
      try {
        const message = JSON.parse(data.toString('utf8'));
        if (!predicate(message)) return;
        clearTimeout(timer);
        socket.off('message', onMessage);
        resolve(message);
      } catch {
        // Ignore unrelated malformed messages; the broker validates them separately.
      }
    }
    socket.on('message', onMessage);
  });
}

async function waitForSocketBuffer(socket, limit) {
  while (socket.readyState === WebSocket.OPEN && socket.bufferedAmount > limit) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  if (socket.readyState !== WebSocket.OPEN) throw new Error('Synthetic Photoshop socket closed during transfer.');
}

async function sendSyntheticFrame(socket, frameId, bytes, width, height) {
  const captureStartedAtEpochMs = Date.now();
  const metadata = {
    type: 'FRAME_BEGIN',
    frameId,
    documentId: 9001,
    documentName: 'Block1-FullResolution-Synthetic.psd',
    documentWidth: width,
    documentHeight: height,
    documentMode: 'RGB',
    documentDepth: 8,
    documentColorProfile: 'sRGB IEC61966-2.1',
    width,
    height,
    components: 3,
    componentSize: 8,
    pixelFormat: 'RGB',
    colorSpace: 'RGB',
    colorProfile: 'sRGB IEC61966-2.1',
    hasAlpha: false,
    isChunky: true,
    level: 0,
    totalBytes: bytes.byteLength,
    chunkSize: liveLinkConfig.chunkSizeBytes,
    chunkCount: Math.ceil(bytes.byteLength / liveLinkConfig.chunkSizeBytes),
    captureMs: 0,
    captureStartedAtEpochMs,
    captureEndedAtEpochMs: Date.now()
  };
  socket.send(JSON.stringify(metadata));
  for (let offset = 0; offset < bytes.byteLength; offset += liveLinkConfig.chunkSizeBytes) {
    await waitForSocketBuffer(socket, liveLinkConfig.backpressureHighWaterMarkBytes);
    socket.send(bytes.subarray(offset, Math.min(offset + liveLinkConfig.chunkSizeBytes, bytes.byteLength)));
  }
  await waitForSocketBuffer(socket, liveLinkConfig.chunkSizeBytes);
  const ackPromise = waitForClientMessage(socket, (message) => message.type === 'FRAME_ACK' && message.frameId === frameId);
  socket.send(JSON.stringify({ type: 'FRAME_END', frameId }));
  return ackPromise;
}

async function runLinkSmokeTest(window) {
  const reportPath = resolveArgumentPath(reportArgument, 'link-runtime.json');
  const screenshotPath = resolveArgumentPath(screenshotArgument, 'link-runtime.png');
  let photoshopClient = null;
  try {
    await waitForDiagnostics(window);
    photoshopClient = new WebSocket(liveLinkConfig.endpoint);
    await new Promise((resolve, reject) => {
      photoshopClient.once('open', resolve);
      photoshopClient.once('error', reject);
    });
    const helloPromise = waitForClientMessage(photoshopClient, (message) => message.type === 'HELLO_ACK');
    photoshopClient.send(JSON.stringify({
      type: 'HELLO',
      protocol: liveLinkConfig.protocol,
      protocolVersion: liveLinkConfig.protocolVersion,
      role: 'photoshop'
    }));
    await helloPromise;

    const width = 4728;
    const height = 5760;
    const frameBytes = Buffer.alloc(width * height * 3);
    frameBytes.fill(32);
    const firstAck = await sendSyntheticFrame(photoshopClient, 1, frameBytes, width, height);
    await window.webContents.executeJavaScript("document.querySelector('#two-button').click()", true);
    const viewBeforeSecondFrame = await window.webContents.executeJavaScript(
      '({ zoom: window.block0Diagnostics.zoom, viewMode: window.block0Diagnostics.viewMode })',
      true
    );
    frameBytes.fill(192);
    const secondAck = await sendSyntheticFrame(photoshopClient, 2, frameBytes, width, height);
    const runtime = await window.webContents.executeJavaScript('window.block1Diagnostics', true);
    const viewAfterSecondFrame = await window.webContents.executeJavaScript(
      '({ zoom: window.block0Diagnostics.zoom, viewMode: window.block0Diagnostics.viewMode })',
      true
    );
    const liveViewPreserved =
      viewBeforeSecondFrame.zoom === 2 && viewBeforeSecondFrame.viewMode === '200%' &&
      viewAfterSecondFrame.zoom === viewBeforeSecondFrame.zoom &&
      viewAfterSecondFrame.viewMode === viewBeforeSecondFrame.viewMode;

    const pointer2dSetPromise = waitForClientMessage(
      photoshopClient,
      (message) => message.type === 'POINTER_SET'
    );
    const pointer2dRequest = await window.webContents.executeJavaScript('window.runBlock2PointerSmokeRequest()', true);
    const pointer2dSet = await pointer2dSetPromise;
    const pointer2dAck = {
      type: 'POINTER_ACK',
      requestId: pointer2dSet.requestId,
      documentId: pointer2dSet.documentId,
      requestedX: pointer2dSet.x,
      requestedY: pointer2dSet.y,
      appliedX: pointer2dSet.x,
      appliedY: pointer2dSet.y,
      layerName: '__LUUX_POINTER__',
      selectionRestored: true
    };
    photoshopClient.send(JSON.stringify(pointer2dAck));
    const pointer2dRuntime = await waitForPointerDiagnostics(window, pointer2dSet.requestId);

    const pointer3dSetPromise = waitForClientMessage(
      photoshopClient,
      (message) => message.type === 'POINTER_SET'
    );
    const pointer3dRequest = await window.webContents.executeJavaScript('window.runBlock3PlanePointerSmokeRequest()', true);
    const pointer3dSet = await pointer3dSetPromise;
    const pointer3dAck = {
      type: 'POINTER_ACK',
      requestId: pointer3dSet.requestId,
      documentId: pointer3dSet.documentId,
      requestedX: pointer3dSet.x,
      requestedY: pointer3dSet.y,
      appliedX: pointer3dSet.x,
      appliedY: pointer3dSet.y,
      layerName: '__LUUX_POINTER__',
      selectionRestored: true
    };
    photoshopClient.send(JSON.stringify(pointer3dAck));
    const pointer3dRuntime = await waitForPointerDiagnostics(window, pointer3dSet.requestId);
    const markerCameraSmoke = await window.webContents.executeJavaScript('window.runBlock3PlaneMarkerCameraSmoke()', true);
    const plane3dRuntime = await window.webContents.executeJavaScript('window.block3PlaneDiagnostics', true);

    const sitePointerSetPromise = waitForClientMessage(
      photoshopClient,
      (message) => message.type === 'POINTER_SET'
    );
    const sitePointerRequest = await window.webContents.executeJavaScript('window.runBlock3SitePointerSmokeRequest()', true);
    const sitePointerSet = await sitePointerSetPromise;
    const sitePointerAck = {
      type: 'POINTER_ACK',
      requestId: sitePointerSet.requestId,
      documentId: sitePointerSet.documentId,
      requestedX: sitePointerSet.x,
      requestedY: sitePointerSet.y,
      appliedX: sitePointerSet.x,
      appliedY: sitePointerSet.y,
      layerName: '__LUUX_POINTER__',
      selectionRestored: true
    };
    photoshopClient.send(JSON.stringify(sitePointerAck));
    const sitePointerRuntime = await waitForPointerDiagnostics(window, sitePointerSet.requestId);
    const siteMarkerCameraSmoke = await window.webContents.executeJavaScript('window.runBlock3SiteMarkerCameraSmoke()', true);
    const site3dRuntime = await window.webContents.executeJavaScript('window.block3SiteDiagnostics', true);
    const missingAnamorphicSmoke = await window.webContents.executeJavaScript('window.runBlock3MissingAnamorphicSmoke()', true);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const image = await window.webContents.capturePage();
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    fs.writeFileSync(screenshotPath, image.toPNG());

    const broker = liveLinkBroker.getSnapshot();
    const technicalPass =
      firstAck.receivedWidth === width && firstAck.receivedHeight === height &&
      firstAck.textureWidth === width && firstAck.textureHeight === height &&
      firstAck.receivedBytes === frameBytes.byteLength &&
      secondAck.receivedWidth === width && secondAck.receivedHeight === height &&
      secondAck.textureWidth === width && secondAck.textureHeight === height &&
      secondAck.receivedBytes === frameBytes.byteLength &&
      runtime.documentWidth === width && runtime.documentHeight === height &&
      runtime.captureWidth === width && runtime.captureHeight === height &&
      runtime.receivedWidth === width && runtime.receivedHeight === height &&
      runtime.textureWidth === width && runtime.textureHeight === height &&
      runtime.framesReceived === 2 && runtime.framesDropped === 0 && runtime.framesReplaced === 1 &&
      liveViewPreserved &&
      pointer2dRequest.command.requestId === pointer2dSet.requestId &&
      pointer2dRequest.canonical.x === pointer2dSet.x && pointer2dRequest.canonical.y === pointer2dSet.y &&
      pointer2dSet.sourceFrameId === 2 && pointer2dSet.documentId === 9001 &&
      pointer2dRuntime.state === 'READY' && pointer2dRuntime.coordinateError === 0 &&
      pointer2dRuntime.applied.x === pointer2dSet.x && pointer2dRuntime.applied.y === pointer2dSet.y &&
      pointer3dRequest.command.requestId === pointer3dSet.requestId &&
      pointer3dRequest.canonical.x === pointer3dSet.x && pointer3dRequest.canonical.y === pointer3dSet.y &&
      pointer3dSet.x === 1053 && pointer3dSet.y === 739 &&
      pointer3dSet.sourceFrameId === 2 && pointer3dSet.documentId === 9001 &&
      pointer3dRuntime.state === 'READY' && pointer3dRuntime.coordinateError === 0 &&
      pointer3dRuntime.applied.x === pointer3dSet.x && pointer3dRuntime.applied.y === pointer3dSet.y &&
      pointer3dRuntime.marker?.requestId === pointer3dSet.requestId &&
      pointer3dRuntime.marker?.view === '3d-plane' &&
      pointer3dRuntime.marker?.status === 'acknowledged' && pointer3dRuntime.marker?.visible === true &&
      markerCameraSmoke.screenPositionChanged === true && markerCameraSmoke.canonicalPreserved === true &&
      markerCameraSmoke.after.visible === true &&
      plane3dRuntime.cameraType === 'PerspectiveCamera' && plane3dRuntime.textureShared === true &&
      sitePointerRequest.command.requestId === sitePointerSet.requestId &&
      sitePointerRequest.canonical.x === sitePointerSet.x && sitePointerRequest.canonical.y === sitePointerSet.y &&
      sitePointerSet.sourceFrameId === 2 && sitePointerSet.documentId === 9001 &&
      sitePointerRuntime.state === 'READY' && sitePointerRuntime.coordinateError === 0 &&
      sitePointerRuntime.marker?.view === 'site-3d' && sitePointerRuntime.marker?.status === 'acknowledged' &&
      Boolean(sitePointerRuntime.marker?.surfaceRole) && Boolean(sitePointerRuntime.marker?.meshName) &&
      siteMarkerCameraSmoke.screenPositionChanged === true && siteMarkerCameraSmoke.canonicalPreserved === true &&
      siteMarkerCameraSmoke.meshPreserved === true && siteMarkerCameraSmoke.after.visible === true &&
      site3dRuntime.status === 'READY' && site3dRuntime.surfaceSetAvailable === true &&
      site3dRuntime.activeSurfaces.length === 2 && site3dRuntime.activeSurfaces.every((surface) => surface.textureShared) &&
      missingAnamorphicSmoke.surfaceSetAvailable === false && missingAnamorphicSmoke.activeSurfaceCount === 0 &&
      missingAnamorphicSmoke.visibleSurfaceCount === 0 && missingAnamorphicSmoke.pointDisabled === true &&
      missingAnamorphicSmoke.controlsDisabled === true &&
      missingAnamorphicSmoke.missingMeshes.join(',') === 'LUUX_Front_3Dworld_Anamorphic,ILMIN_Back_3Dworld_Anamorphic' &&
      runtime.rendererTextureCount === 1 && runtime.contextLossCount === 0 &&
      runtime.textureGlError === 0 &&
      runtime.centerPixel.slice(0, 3).every((value) => value >= 188 && value <= 196) &&
      broker.address.address === liveLinkConfig.host && broker.address.port === liveLinkConfig.port &&
      externalNetworkRequests.length === 0 && criticalErrors.length === 0;
    const report = {
      technicalPass,
      syntheticSource: true,
      packaged: app.isPackaged,
      securityPreferences,
      externalNetworkRequests,
      loopbackRequests,
      broker,
      firstAck,
      secondAck,
      viewBeforeSecondFrame,
      viewAfterSecondFrame,
      liveViewPreserved,
      pointer2d: { request: pointer2dRequest, set: pointer2dSet, ack: pointer2dAck, runtime: pointer2dRuntime },
      pointer3d: { request: pointer3dRequest, set: pointer3dSet, ack: pointer3dAck, runtime: pointer3dRuntime },
      markerCameraSmoke,
      plane3dRuntime,
      sitePointer: { request: sitePointerRequest, set: sitePointerSet, ack: sitePointerAck, runtime: sitePointerRuntime },
      siteMarkerCameraSmoke,
      site3dRuntime,
      missingAnamorphicSmoke,
      runtime,
      screenshotPath,
      criticalErrors
    };
    writeJson(reportPath, report);
    console.log(`BLOCK3C_SITE_LINK_REPORT=${reportPath}`);
    console.log(`BLOCK3C_SYNTHETIC_SITE_PASS=${technicalPass}`);
    photoshopClient.close();
    app.exit(technicalPass ? 0 : 2);
  } catch (error) {
    if (photoshopClient?.readyState === WebSocket.OPEN) photoshopClient.close();
    writeJson(reportPath, {
      technicalPass: false,
      syntheticSource: true,
      externalNetworkRequests,
      loopbackRequests,
      criticalErrors,
      error: error.stack || error.message
    });
    console.error(error);
    app.exit(2);
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#111317',
    show: true,
    webPreferences: {
      ...securityPreferences,
      backgroundThrottling: false
    }
  });

  window.removeMenu();
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('did-fail-load', (_event, code, description, url) => {
    criticalErrors.push({ type: 'did-fail-load', code, description, url });
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    criticalErrors.push({ type: 'render-process-gone', details });
  });
  window.on('unresponsive', () => {
    criticalErrors.push({ type: 'unresponsive' });
  });

  const pagePath = path.join(__dirname, '..', 'build', 'index.html');
  window.loadFile(pagePath);
  if (smokeTest) window.webContents.once('did-finish-load', () => runSmokeTest(window));
  if (linkSmokeTest) window.webContents.once('did-finish-load', () => runLinkSmokeTest(window));
  return window;
}

app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    if (details.url === liveLinkConfig.endpoint || details.url.startsWith(`${liveLinkConfig.endpoint}/`)) {
      loopbackRequests.push(details.url);
      callback({ cancel: false });
      return;
    }
    if (/^(?:https?|wss?):/i.test(details.url)) {
      externalNetworkRequests.push(details.url);
      callback({ cancel: true });
      return;
    }
    callback({ cancel: false });
  });

  liveLinkBroker = createLiveLinkBroker({
    config: liveLinkConfig,
    replaceExistingRoles: linkSmokeTest,
    onEvent: (event) => {
      liveLinkEvents.push(event);
      if (event.type === 'server-error') criticalErrors.push({ type: 'live-link-server', message: event.message });
    }
  });
  createWindow();
});

app.on('before-quit', () => {
  if (liveLinkBroker) void liveLinkBroker.close();
});

app.on('window-all-closed', () => app.quit());
