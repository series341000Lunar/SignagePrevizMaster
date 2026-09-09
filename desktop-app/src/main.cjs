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

async function runSmokeTest(window) {
  const reportPath = resolveArgumentPath(reportArgument, 'runtime.json');
  const screenshotPath = resolveArgumentPath(screenshotArgument, 'runtime.png');
  try {
    await waitForDiagnostics(window);
    const runtime = await window.webContents.executeJavaScript('window.runBlock0SmokeActions()', true);
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
      runtime,
      screenshotPath,
      criticalErrors
    };
    writeJson(reportPath, report);
    console.log(`BLOCK1_LINK_REPORT=${reportPath}`);
    console.log(`BLOCK1_SYNTHETIC_LINK_PASS=${technicalPass}`);
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
