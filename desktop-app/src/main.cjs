'use strict';

const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const smokeTest = process.argv.includes('--smoke-test');
const reportArgument = process.argv.find((argument) => argument.startsWith('--report='));
const screenshotArgument = process.argv.find((argument) => argument.startsWith('--screenshot='));
const externalNetworkRequests = [];
const criticalErrors = [];

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

    const allActionsPass = Object.values(runtime.actions).every(Boolean);
    const technicalPass =
      runtime.fullResolution &&
      runtime.hardwareRendering &&
      runtime.contextLossCount === 0 &&
      runtime.memoryStable &&
      allActionsPass &&
      externalNetworkRequests.length === 0 &&
      criticalErrors.length === 0;
    const report = {
      technicalPass,
      packaged: app.isPackaged,
      executable: process.execPath,
      securityPreferences,
      externalNetworkRequests,
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
      criticalErrors,
      error: error.stack || error.message
    };
    writeJson(reportPath, report);
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
  return window;
}

app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    if (/^https?:/i.test(details.url)) {
      externalNetworkRequests.push(details.url);
      callback({ cancel: true });
      return;
    }
    callback({ cancel: false });
  });
  createWindow();
});

app.on('window-all-closed', () => app.quit());
