'use strict';

const { app, BrowserWindow, dialog, ipcMain, session } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const liveLinkConfig = require('./live-link-config.json');
const { createLiveLinkBroker } = require('./live-link-broker.cjs');
const {
  loadProjectFromDirectory,
  projectDirectoryFromManifestPath,
  saveProjectToDirectory
} = require('./project-storage.cjs');
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
let currentProjectDirectory = null;
let projectPersistencePromise = null;
const pendingProjectOpens = new Map();

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

function writePngDataUrl(filePath, dataUrl) {
  const match = /^data:image\/png;base64,(.+)$/i.exec(dataUrl || '');
  if (!match) throw new Error(`Invalid PNG data URL for ${path.basename(filePath)}.`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.from(match[1], 'base64'));
}

function projectPersistence() {
  if (!projectPersistencePromise) {
    projectPersistencePromise = import(pathToFileURL(path.join(__dirname, 'project-persistence.js')).href);
  }
  return projectPersistencePromise;
}

function projectError(error) {
  return {
    ok: false,
    error: {
      code: error?.code || 'PROJECT_OPERATION_FAILED',
      message: error?.message || String(error),
      details: error?.details || null
    }
  };
}

function projectState() {
  return {
    hasCurrentProject: Boolean(currentProjectDirectory),
    projectName: currentProjectDirectory ? path.basename(currentProjectDirectory) : null
  };
}

async function prepareProjectOpen(manifestPath) {
  const projectDirectory = projectDirectoryFromManifestPath(manifestPath);
  const { validateProjectManifest } = await projectPersistence();
  const loaded = await loadProjectFromDirectory(projectDirectory, { validateManifest: validateProjectManifest });
  const token = crypto.randomUUID();
  pendingProjectOpens.set(token, loaded.projectDirectory);
  return {
    ok: true,
    canceled: false,
    token,
    projectName: loaded.projectName,
    manifest: loaded.manifest,
    assets: loaded.assets
  };
}

function configureProjectIpc() {
  ipcMain.handle('luux-project:get-state', () => ({ ok: true, ...projectState() }));
  ipcMain.handle('luux-project:save-as', async (event, payload) => {
    try {
      const owner = BrowserWindow.fromWebContents(event.sender);
      const selection = await dialog.showOpenDialog(owner, {
        title: 'Save LUUX Signage Previz Project',
        buttonLabel: 'Select Project Folder',
        properties: ['openDirectory', 'createDirectory', 'promptToCreate']
      });
      if (selection.canceled || !selection.filePaths[0]) return { ok: true, canceled: true, ...projectState() };
      const { validateProjectManifest } = await projectPersistence();
      const result = await saveProjectToDirectory(selection.filePaths[0], payload, { validateManifest: validateProjectManifest });
      currentProjectDirectory = result.projectDirectory;
      return { ok: true, canceled: false, projectName: result.projectName, assetCount: result.assetCount, ...projectState() };
    } catch (error) {
      return projectError(error);
    }
  });
  ipcMain.handle('luux-project:save', async (_event, payload) => {
    try {
      if (!currentProjectDirectory) {
        return projectError(Object.assign(new Error('Use SAVE PROJECT AS before the first Save.'), { code: 'PROJECT_SAVE_AS_REQUIRED' }));
      }
      const { validateProjectManifest } = await projectPersistence();
      const result = await saveProjectToDirectory(currentProjectDirectory, payload, { validateManifest: validateProjectManifest });
      return { ok: true, canceled: false, projectName: result.projectName, assetCount: result.assetCount, ...projectState() };
    } catch (error) {
      return projectError(error);
    }
  });
  ipcMain.handle('luux-project:open', async (event) => {
    try {
      const owner = BrowserWindow.fromWebContents(event.sender);
      const selection = await dialog.showOpenDialog(owner, {
        title: 'Open LUUX Signage Previz Project',
        buttonLabel: 'Open Project',
        defaultPath: currentProjectDirectory ? path.join(currentProjectDirectory, 'project.json') : undefined,
        filters: [{ name: 'LUUX Signage Previz Project', extensions: ['json'] }],
        properties: ['openFile']
      });
      if (selection.canceled || !selection.filePaths[0]) return { ok: true, canceled: true, ...projectState() };
      return await prepareProjectOpen(selection.filePaths[0]);
    } catch (error) {
      return projectError(error);
    }
  });
  ipcMain.handle('luux-project:open-dropped-manifest', async (_event, manifestPath) => {
    try {
      return await prepareProjectOpen(manifestPath);
    } catch (error) {
      return projectError(error);
    }
  });
  ipcMain.handle('luux-project:accept-open', (_event, token) => {
    const directory = pendingProjectOpens.get(token);
    if (!directory) return projectError(Object.assign(new Error('Project open transaction is no longer available.'), { code: 'PROJECT_OPEN_TOKEN_INVALID' }));
    currentProjectDirectory = directory;
    pendingProjectOpens.delete(token);
    return { ok: true, ...projectState() };
  });
  ipcMain.handle('luux-project:cancel-open', (_event, token) => {
    pendingProjectOpens.delete(token);
    return { ok: true, ...projectState() };
  });
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

async function waitForBrokerRenderer() {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (liveLinkBroker?.getSnapshot()?.rendererConnected === true) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for Electron renderer broker connection.');
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

async function waitForEnvironmentReady(window) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const result = await window.webContents.executeJavaScript('window.block4DEnvironmentDiagnostics ?? null', true);
    if (result?.status === 'READY') return result;
    if (result?.status === 'ERROR') throw new Error(result.error || 'Environment scene load failed.');
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Timed out waiting for Environment scene readiness.');
}

function anamorphicSmokePass(result, familyId, surfaceName, projectionSeparated, visualValidationState) {
  return result.surfaceSetAvailable === true && result.activeSurfaceCount === 1 &&
    result.visibleSurfaceCount === 1 && result.visibleSurfaceExact === surfaceName &&
    result.expectedSurfaceExact === surfaceName && result.familyId === familyId &&
    result.inactiveAnamorphicVisibleCount === 0 && result.pointDisabled === true &&
    result.controlsEnabled === true && result.helperVisibleCount === 0 &&
    result.helperTextureMapCount === 0 && result.surfaceTextureShared === true &&
    result.cameraFinite === true && result.cameraQuaternionMatches === true &&
    result.cameraForwardMatches === true && result.runtimeProjectionAspectMatches === true &&
    result.projectionAndWorkingAspectSeparated === projectionSeparated &&
    result.workingCanvasAspectMatches === true && result.baselineVerticalFovMatches === true &&
    result.editableFovApplied === true && result.editableFovMatches === true &&
    result.editableFovMode === 'FOV_ADJUSTED' && result.fovResetReturned === true &&
    result.fovResetMatches === true && result.freePreviewState === 'FREE_PREVIEW' &&
    result.freePreviewFovDefault === true && result.freePreviewUpDefault === true &&
    result.freePreviewAspectUnrestricted === true && result.freePreviewCanvasUnrestricted === true &&
    result.resetReturned === true && result.resetMode === 'CALIBRATION' &&
    result.calibrationMatteActive === true && result.calibrationMatteColor === '#20242c' &&
    result.visualValidationState === visualValidationState && result.missingFamiliesUnavailable === true &&
    result.contextLossCount === 0;
}

async function runSmokeTest(window) {
  const reportPath = resolveArgumentPath(reportArgument, 'runtime.json');
  const screenshotPath = resolveArgumentPath(screenshotArgument, 'runtime.png');
  try {
    await waitForDiagnostics(window);
    await waitForSiteReady(window);
    await waitForEnvironmentReady(window);
    const startupView = await window.webContents.executeJavaScript('window.runBlock4FStartupViewSmoke()', true);
    const runtime = await window.webContents.executeJavaScript('window.runBlock0SmokeActions()', true);
    const cameraEditor = await window.webContents.executeJavaScript('window.runBlock4BCameraEditorSmoke()', true);
    const photoScene = await window.webContents.executeJavaScript('window.runBlock4CPhotoSceneSmoke()', true);
    const environment = await window.webContents.executeJavaScript('window.runBlock4DEnvironmentSmoke()', true);
    const locations = await window.webContents.executeJavaScript('window.runBlock4ELocationSmoke()', true);
    const anamorphic75f = await window.webContents.executeJavaScript('window.runBlock5AAnamorphicSmoke()', true);
    const anamorphicBack = await window.webContents.executeJavaScript('window.runBlock5BBackSmoke()', true);
    const anamorphicScreenshotState = await window.webContents.executeJavaScript(
      `(() => {
        const world = document.querySelector('#site-world-select');
        const mapping = document.querySelector('#site-mapping-select');
        world.value = 'world3d';
        world.dispatchEvent(new Event('change'));
        mapping.value = 'anamorphic';
        mapping.dispatchEvent(new Event('change'));
        const family = document.querySelector('#site-anamorphic-family-select');
        family.value = 'back';
        family.dispatchEvent(new Event('change'));
        return window.block5BBackDiagnostics;
      })()`,
      true
    );
    const block6b = await window.webContents.executeJavaScript('window.runBlock6BProjectionSmoke()', true);
    const block6a = block6b.frontReturn;
    const block6bPreviewData = await window.webContents.executeJavaScript('window.getBlock6BPreviewArtifacts()', true);
    const block6bFullSourceData = await window.webContents.executeJavaScript('window.getBlock6BFullSourceArtifact()', true);
    const block6bExportMetadata = {};
    for (const kind of ['source', 'direct', 'bake', 'reproject']) {
      block6bExportMetadata[kind] = await window.webContents.executeJavaScript(`window.inspectBlock6BExportPng('${kind}')`, true);
    }
    const block6bArtifactDirectory = path.dirname(reportPath);
    const block6bArtifacts = {
      fullSource: path.join(block6bArtifactDirectory, 'Block6B_FRONT75F_Source_3000x3840.png'),
      sourcePreview: path.join(block6bArtifactDirectory, 'block6b-source-preview.png'),
      directPreview: path.join(block6bArtifactDirectory, 'block6b-direct-preview.png'),
      bakePreview: path.join(block6bArtifactDirectory, 'block6b-bake-preview.png'),
      reprojectPreview: path.join(block6bArtifactDirectory, 'block6b-reproject-preview.png')
    };
    writePngDataUrl(block6bArtifacts.fullSource, block6bFullSourceData);
    writePngDataUrl(block6bArtifacts.sourcePreview, block6bPreviewData.source);
    writePngDataUrl(block6bArtifacts.directPreview, block6bPreviewData.direct);
    writePngDataUrl(block6bArtifacts.bakePreview, block6bPreviewData.bake);
    writePngDataUrl(block6bArtifacts.reprojectPreview, block6bPreviewData.reproject);
    const block7MaskOff = await window.webContents.executeJavaScript('window.runBlock7MaskOffSmoke()', true);
    const bakeVisibilityCorrection = await window.webContents.executeJavaScript(
      'window.runPostBlock7BakeVisibilityCorrectionSmoke()', true
    );
    const bakeVisibilityDiagnosticData = await window.webContents.executeJavaScript(
      'window.getPostBlock7VisibilityDiagnosticArtifacts()', true
    );
    const bakeVisibilityCorrectionData = await window.webContents.executeJavaScript(
      'window.getPostBlock7VisibilityCorrectionArtifacts()', true
    );
    const block8a = await window.webContents.executeJavaScript('window.runBlock8AInterlockSmoke()', true);
    const block8aAuthoringBake = await window.webContents.executeJavaScript('window.runBlock8AAuthoringBakeSmoke()', true);
    const outsideSignagePreview = await window.webContents.executeJavaScript('window.runOutsideSignagePreviewSmoke()', true);
    const block8b = await window.webContents.executeJavaScript('window.runBlock8BLayerStackSmoke()', true);
    const block8c = await window.webContents.executeJavaScript('window.runBlock8CCompositeSmoke()', true);
    const block8d = await window.webContents.executeJavaScript('window.runBlock8DProjectSmoke()', true);
    const block8e = await window.webContents.executeJavaScript('window.runBlock8EFoundationSmoke()', true);
    const bakeVisibilityArtifacts = {
      front: path.join(block6bArtifactDirectory, 'PostBlock7_FRONT75F_VisibilityDiagnostic.png'),
      back: path.join(block6bArtifactDirectory, 'PostBlock7_BACK_VisibilityDiagnostic.png'),
      frontDirect: path.join(block6bArtifactDirectory, 'PostBlock7_FRONT75F_Direct_3000x3840.png'),
      frontCanonical: path.join(block6bArtifactDirectory, 'PostBlock7_FRONT75F_Canonical_4728x5760.png'),
      frontReprojected: path.join(block6bArtifactDirectory, 'PostBlock7_FRONT75F_Reprojected_3000x3840.png'),
      backDirect: path.join(block6bArtifactDirectory, 'PostBlock7_BACK_Direct_2100x3840.png'),
      backCanonical: path.join(block6bArtifactDirectory, 'PostBlock7_BACK_Canonical_4728x5760.png'),
      backReprojected: path.join(block6bArtifactDirectory, 'PostBlock7_BACK_Reprojected_2100x3840.png')
    };
    writePngDataUrl(bakeVisibilityArtifacts.front, bakeVisibilityDiagnosticData.front);
    writePngDataUrl(bakeVisibilityArtifacts.back, bakeVisibilityDiagnosticData.back);
    writePngDataUrl(bakeVisibilityArtifacts.frontDirect, bakeVisibilityCorrectionData.front.direct);
    writePngDataUrl(bakeVisibilityArtifacts.frontCanonical, bakeVisibilityCorrectionData.front.canonical);
    writePngDataUrl(bakeVisibilityArtifacts.frontReprojected, bakeVisibilityCorrectionData.front.reprojected);
    writePngDataUrl(bakeVisibilityArtifacts.backDirect, bakeVisibilityCorrectionData.back.direct);
    writePngDataUrl(bakeVisibilityArtifacts.backCanonical, bakeVisibilityCorrectionData.back.canonical);
    writePngDataUrl(bakeVisibilityArtifacts.backReprojected, bakeVisibilityCorrectionData.back.reprojected);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const image = await window.webContents.capturePage();
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    fs.writeFileSync(screenshotPath, image.toPNG());

    const broker = liveLinkBroker?.getSnapshot() || null;
    const allActionsPass = Object.values(runtime.actions).every(Boolean);
    const technicalPass =
      startupView.pass === true &&
      runtime.fullResolution &&
      runtime.hardwareRendering &&
      runtime.contextLossCount === 0 &&
      runtime.memoryStable &&
      allActionsPass &&
      Object.values(cameraEditor).every(Boolean) &&
      photoScene.allScenesReady === true && photoScene.rapidLatestWins === true &&
      photoScene.contentAspectExact === true && photoScene.outsideContentRejected === true &&
      photoScene.centerNdcExact === true && photoScene.passiveRenderPreserved === true &&
      photoScene.photoResourceCount === 1 && photoScene.stressSwitchCount === 24 &&
      photoScene.stressLatestWins === true && photoScene.rendererTextureCountAfterStress <= photoScene.rendererTextureBudget &&
      photoScene.contextLossCount === 0 &&
      environment.status === 'READY' && environment.revisionChanged === false &&
      environment.coordinatePolicy === 'DIRECT_NO_CONVERSION' &&
      environment.meshCount === 18 && environment.visibleMeshCount === 18 &&
      environment.excludedMeshCount === 0 && environment.rootVisibleInWorld3d === true &&
      environment.hiddenOutsideWorld3d === true && environment.rootTransformIdentity === true &&
      environment.allTransformsFinite === true && environment.materialOverrideExact === true &&
      environment.pointTargetCount === 0 && environment.raycastDisabled === true &&
      environment.loadCount === 1 && environment.nightDarker === true &&
      environment.strictSignageStillActive === true && environment.presentationControlVisible === true &&
      locations.fourIndependent === true && locations.allProxiesReady === true &&
      locations.noVisualTextLabels === true && locations.visibleBeforeToggle === 4 &&
      locations.allHiddenWhenOff === true && locations.visibleAfterToggle === 4 &&
      locations.pointPassThrough === true && locations.allLocationsNavigate === true &&
      locations.exactReturns === true && locations.rapidLatestWins === true &&
      locations.rapidReturn === 'RETURNED' && locations.directEntryHasNoFakeReturn === true &&
      locations.finalSiteExact === true && locations.contextLossCount === 0 &&
      anamorphicSmokePass(anamorphic75f, 'ANAMORPHIC_FRONT_75F', 'ANAM_SURFACE_FRONT75F', false, 'PASS') &&
      anamorphicSmokePass(anamorphicBack, 'ANAMORPHIC_BACK', 'ANAM_SURFACE_BACK', false, 'PASS') &&
      anamorphicScreenshotState.mappingMode === 'anamorphic' &&
      anamorphicScreenshotState.anamorphicFamily === 'ANAMORPHIC_BACK' &&
      anamorphicScreenshotState.activeSurfaces.length === 1 &&
      anamorphicScreenshotState.activeSurfaces[0].meshName === 'ANAM_SURFACE_BACK' &&
      block6a.technicalPass === true &&
      block6a.block6AFrontValidation === 'PASS_CLOSED' &&
      block6a.profileValid === true &&
      block6a.calibrationCameraUnchanged === true &&
      block6a.productionMaskManifestVerified === true &&
      block6a.dedicatedMatteManifestVerified === true &&
      block6a.mask.mode === 'full-white' &&
      block6a.mask.status === 'DISABLED_FULL_WHITE_CONTROL' &&
      block6a.validCanonicalPixelCount > 0 &&
      block6a.transparentCanonicalPixelCount > 0 &&
      block6a.visibleScreenPixelCount > 0 &&
      block6a.resourcePolicy.stableAcrossRuns === true &&
      block6a.contextLossCount === 0 &&
      block6b.technicalPass === true && block6b.userValidation === 'PASS_CLOSED' &&
      block6b.normalBakeMaskMode === 'OFF_FULL_WHITE' &&
      block6b.back.familyId === 'ANAMORPHIC_BACK' && block6b.back.mask.status === 'DISABLED_FULL_WHITE_CONTROL' &&
      block6b.back.mask.mode === 'full-white' && block6b.back.mask.exactLinearInversion === false &&
      block6b.back.sourceWidth === 2100 && block6b.back.sourceHeight === 3840 &&
      block6b.frontReturn.sourceVsCanonicalReprojected.mae <= 1 && block6b.frontReturn.sourceVsCanonicalReprojected.rmse <= 5 &&
      block6bExportMetadata.source.width === 3000 && block6bExportMetadata.source.height === 3840 &&
      block6bExportMetadata.direct.width === 3000 && block6bExportMetadata.direct.height === 3840 &&
      block6bExportMetadata.bake.width === 4728 && block6bExportMetadata.bake.height === 5760 &&
      block6bExportMetadata.reproject.width === 3000 && block6bExportMetadata.reproject.height === 3840 &&
      Object.values(block6bExportMetadata).every((entry) => entry.mimeType === 'image/png' && entry.bytes > 0) &&
      block7MaskOff.technicalPass === true && block7MaskOff.defaultOff === true &&
      block7MaskOff.backCameraFamilyCorrect === true && block7MaskOff.contextLossCount === 0 &&
      bakeVisibilityCorrection.technicalPass === true &&
      bakeVisibilityCorrection.maskOff === true &&
      bakeVisibilityCorrection.visibilityArchitectureShared === true &&
      bakeVisibilityCorrection.familyCalibrationUnchanged === true &&
      bakeVisibilityCorrection.glbGeometryModified === false &&
      bakeVisibilityCorrection.contextLossCount === 0 &&
      block8a.pass === true && block8a.userValidation === 'PASS_CLOSED' &&
      block8a.forcedCameraLock === true && block8a.unlockRefusedDuringLayout === true &&
      block8a.cameraUnchangedDuringLayout === true && block8a.inspectionCameraRestored === true &&
      block8a.previousUnlockedRestored === true && block8a.previousLockedRestored === true &&
      block8a.frontFamilyApproved === true && block8a.backFamilyApproved === true &&
      block8aAuthoringBake.technicalPass === true && block8aAuthoringBake.frontPass === true &&
      block8aAuthoringBake.backPass === true && block8aAuthoringBake.contextLossCount === 0 &&
      outsideSignagePreview.technicalPass === true && outsideSignagePreview.defaultOpacity === 0.5 &&
      outsideSignagePreview.front.previewPixelIdentical === true && outsideSignagePreview.back.previewPixelIdentical === true &&
      outsideSignagePreview.front.readyInvariant === true && outsideSignagePreview.back.readyInvariant === true &&
      outsideSignagePreview.interlockPreserved === true && outsideSignagePreview.contextLossCount === 0 &&
      block8b.technicalPass === true && block8b.userValidation === 'PASS_CLOSED' &&
      block8b.frontLayerCount === 5 && block8b.backLayerCount === 2 &&
      block8b.stableUniqueIds === true && block8b.threeSelectedLayerBakesPass === true &&
      block8b.familyIsolation === true && block8b.hiddenSelected === true &&
      block8b.repeatedAddDeleteStable === true && block8b.outsidePreviewDirtyInvariant === true &&
      block8b.cameraUnchanged === true && block8b.photoshopMutationCount === 0 &&
      block8b.photoshopLastAppliedUnchanged === true &&
      block8b.contextLossCount === 0 && block8b.projectionRuntimeCount === 1 &&
      block8c.technicalPass === true && block8c.userValidation === 'PENDING' &&
      block8c.layerOpacityIndependent === true && block8c.blendModeIndependent === true &&
      block8c.pixelReadyPreservedByMetadata === true && block8c.hiddenPixelRevisionPreserved === true &&
      block8c.dragAndButtonSame === true && block8c.stableLayerIds === true && block8c.familyIsolation === true &&
      block8c.railCollapsedDefault === true && block8c.railExpanded === true && block8c.railCollapsedAgain === true &&
      block8c.railHiddenOutsideAnamorphic === true && block8c.bakeCurrentUsesExistingPath === true &&
      block8c.sendDirectRequiresReadyResult === true && block8c.layoutForcedLock === true &&
      block8c.cameraUnchanged === true && block8c.photoshopMutationCount === 0 &&
      block8c.photoshopLastAppliedUnchanged === true && block8c.contextLossCount === 0 &&
      block8c.projectionRuntimeCount === 1 &&
      block8d.technicalPass === true && block8d.userValidation === 'PENDING' &&
      block8d.schemaVersion === 2 && block8d.folderProject === true &&
      block8d.frontLayerCount === 3 && block8d.backLayerCount === 2 &&
      block8d.roundTripExact === true && block8d.stableLayerIds === true &&
      block8d.safeSequenceAfterLoad === true && block8d.loadedNeedsBake === true &&
      block8d.loadedPhotoshopUnsynced === true && block8d.sourceBytesPreserved === true &&
      block8d.relativeAssetPaths === true && block8d.calibrationReferenceOnly === true &&
      block8d.outsideSignageNotPersisted === true && block8d.photoshopRuntimeNotPersisted === true &&
      block8d.bakeCacheNotPersisted === true && block8d.quickRailNotPersisted === true &&
      block8d.cameraUnchanged === true && block8d.currentAuthoringSessionUnchanged === true &&
      block8d.targetRegistryUnchanged === true && block8d.layoutInterlockUnchanged === true &&
      block8d.quickRailUnchanged === true && block8d.contextLossCount === 0 &&
      block8e.technicalPass === true && block8e.userValidation === 'PASS_CLOSED' &&
      block8e.rasterBakeIntegration === 'IMPLEMENTED' &&
      block8e.coordinateSpace === 'SOURCE_NORMALIZED_TOP_LEFT' &&
      block8e.editorEntered === true && block8e.editorVisible === true &&
      block8e.interlock === true && block8e.layoutMutualExclusion === true && block8e.directModeSwitch === true &&
      block8e.singleClickNewPathBlocked === true && block8e.explicitNewPathWorks === true &&
      block8e.manualUnlockRefused === true && block8e.editorExited === true &&
      block8e.cameraRestored === true && block8e.layerLocal === true &&
      block8e.multiPathOperations === true && block8e.explicitClosedPaths === true &&
      block8e.cubicSegment === true && block8e.marqueeSelection === true &&
      block8e.groupMoveExact === true && block8e.closeByFirstAnchor === true &&
      block8e.stableIds === true && block8e.canvasRasterComposition === true &&
      block8e.previewMaskApplied === true && block8e.bakeMaskApplied === true &&
      block8e.frontBackBake === true && block8e.familyIndependence === true &&
      block8e.sourceResolutionTemporaryMask === true && block8e.temporaryMaskDisposed === true &&
      block8e.noPermanentPerLayerMaskTexture === true && block8e.opacityMetadataOnly === true &&
      block8e.photoshopMutationCount === 0 && block8e.photoshopLastAppliedUnchanged === true &&
      block8e.contextLossCount === 0 &&
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
      startupView,
      runtime,
      cameraEditor,
      photoScene,
      environment,
      locations,
      anamorphic75f,
      anamorphicBack,
      anamorphicScreenshotState,
      block6a,
      block6b,
      block6bArtifacts,
      block6bExportMetadata,
      block7MaskOff,
      bakeVisibilityCorrection,
      bakeVisibilityArtifacts,
      block8a,
      block8aAuthoringBake,
      outsideSignagePreview,
      block8b,
      block8c,
      block8d,
      block8e,
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

function waitForClientMessage(
  socket,
  predicate,
  timeoutMs = liveLinkConfig.ackTimeoutMs,
  responseLabel = 'synthetic live-link response'
) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error(`Timed out waiting for ${responseLabel}.`));
    }, timeoutMs);
    function onMessage(data, isBinary) {
      if (isBinary) return;
      try {
        const message = JSON.parse(data.toString('utf8'));
        if (message.type === 'ERROR' || message.type === 'FRAME_ABORT') {
          clearTimeout(timer);
          socket.off('message', onMessage);
          reject(new Error(
            `${responseLabel} failed: ${message.code || message.type}: ${message.message || 'No message.'}`
          ));
          return;
        }
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
  const ackPromise = waitForClientMessage(
    socket,
    (message) => message.type === 'FRAME_ACK' && message.frameId === frameId,
    liveLinkConfig.ackTimeoutMs,
    `FRAME_ACK ${frameId}`
  );
  ackPromise.catch(() => {});
  socket.send(JSON.stringify(metadata));
  for (let offset = 0; offset < bytes.byteLength; offset += liveLinkConfig.chunkSizeBytes) {
    await waitForSocketBuffer(socket, liveLinkConfig.backpressureHighWaterMarkBytes);
    socket.send(bytes.subarray(offset, Math.min(offset + liveLinkConfig.chunkSizeBytes, bytes.byteLength)));
  }
  await waitForSocketBuffer(socket, liveLinkConfig.chunkSizeBytes);
  socket.send(JSON.stringify({ type: 'FRAME_END', frameId }));
  return ackPromise;
}

async function runLinkSmokeTest(window) {
  const reportPath = resolveArgumentPath(reportArgument, 'link-runtime.json');
  const screenshotPath = resolveArgumentPath(screenshotArgument, 'link-runtime.png');
  let photoshopClient = null;
  try {
    await waitForDiagnostics(window);
    await waitForSiteReady(window);
    await waitForEnvironmentReady(window);
    const startupView = await window.webContents.executeJavaScript('window.runBlock4FStartupViewSmoke()', true);
    await waitForBrokerRenderer();
    photoshopClient = new WebSocket(liveLinkConfig.endpoint);
    await new Promise((resolve, reject) => {
      photoshopClient.once('open', resolve);
      photoshopClient.once('error', reject);
    });
    const helloPromise = waitForClientMessage(
      photoshopClient,
      (message) => message.type === 'HELLO_ACK',
      liveLinkConfig.ackTimeoutMs,
      'HELLO_ACK'
    );
    photoshopClient.send(JSON.stringify({
      type: 'HELLO',
      protocol: liveLinkConfig.protocol,
      protocolVersion: liveLinkConfig.protocolVersion,
      role: 'photoshop',
      isolatedSmokeTestClient: true
    }));
    await helloPromise;

    const width = 4728;
    const height = 5760;
    const frameBytes = Buffer.alloc(width * height * 3);
    frameBytes.fill(32);
    const firstAck = await sendSyntheticFrame(photoshopClient, 1, frameBytes, width, height);
    await window.webContents.executeJavaScript("document.querySelector('#view-2d-button').click(); document.querySelector('#two-button').click()", true);
    const viewBeforeSecondFrame = await window.webContents.executeJavaScript(
      '({ zoom: window.block0Diagnostics.zoom, viewMode: window.block0Diagnostics.viewMode, rendererTextureCount: window.block0Diagnostics.rendererMemoryTextures })',
      true
    );
    frameBytes.fill(192);
    const secondAck = await sendSyntheticFrame(photoshopClient, 2, frameBytes, width, height);
    const runtime = await window.webContents.executeJavaScript('window.block1Diagnostics', true);
    const viewAfterSecondFrame = await window.webContents.executeJavaScript(
      '({ zoom: window.block0Diagnostics.zoom, viewMode: window.block0Diagnostics.viewMode, rendererTextureCount: window.block0Diagnostics.rendererMemoryTextures })',
      true
    );
    const liveViewPreserved =
      viewBeforeSecondFrame.zoom === 2 && viewBeforeSecondFrame.viewMode === '200%' &&
      viewAfterSecondFrame.zoom === viewBeforeSecondFrame.zoom &&
      viewAfterSecondFrame.viewMode === viewBeforeSecondFrame.viewMode;
    const liveTextureCountStable =
      viewBeforeSecondFrame.rendererTextureCount <= startupView.startup.rendererTextureCount + 1 &&
      viewAfterSecondFrame.rendererTextureCount === viewBeforeSecondFrame.rendererTextureCount;

    const pointer2dSetPromise = waitForClientMessage(
      photoshopClient,
      (message) => message.type === 'POINTER_SET',
      liveLinkConfig.ackTimeoutMs,
      '2D POINTER_SET'
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
      (message) => message.type === 'POINTER_SET',
      liveLinkConfig.ackTimeoutMs,
      '3D PLANE POINTER_SET'
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
    const environmentSmoke = await window.webContents.executeJavaScript('window.runBlock4DEnvironmentSmoke()', true);

    const sitePointerSetPromise = waitForClientMessage(
      photoshopClient,
      (message) => message.type === 'POINTER_SET',
      liveLinkConfig.ackTimeoutMs,
      'SITE 3D POINTER_SET'
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
    const anamorphic75f = await window.webContents.executeJavaScript('window.runBlock5AAnamorphicSmoke()', true);
    const anamorphicBack = await window.webContents.executeJavaScript('window.runBlock5BBackSmoke()', true);
    const photoSceneSmoke = await window.webContents.executeJavaScript('window.runBlock4CPhotoSceneSmoke()', true);
    const photoPointerSetPromise = waitForClientMessage(
      photoshopClient,
      (message) => message.type === 'POINTER_SET',
      liveLinkConfig.ackTimeoutMs,
      'PHOTO POINTER_SET'
    );
    const photoPointerRequest = await window.webContents.executeJavaScript('window.runBlock4CPhotoPointerSmokeRequest()', true);
    const photoPointerSet = await photoPointerSetPromise;
    const photoPointerAck = {
      type: 'POINTER_ACK',
      requestId: photoPointerSet.requestId,
      documentId: photoPointerSet.documentId,
      requestedX: photoPointerSet.x,
      requestedY: photoPointerSet.y,
      appliedX: photoPointerSet.x,
      appliedY: photoPointerSet.y,
      layerName: '__LUUX_POINTER__',
      selectionRestored: true
    };
    photoshopClient.send(JSON.stringify(photoPointerAck));
    const photoPointerRuntime = await waitForPointerDiagnostics(window, photoPointerSet.requestId);
    const photoRuntime = await window.webContents.executeJavaScript('window.block4CPhotoDiagnostics', true);
    const photoSyncBefore = await window.webContents.executeJavaScript(
      '({ photo: window.block4CPhotoDiagnostics, site: window.block3SiteDiagnostics })',
      true
    );
    frameBytes.fill(96);
    const thirdAck = await sendSyntheticFrame(photoshopClient, 3, frameBytes, width, height);
    const photoSyncAfter = await window.webContents.executeJavaScript(
      '({ photo: window.block4CPhotoDiagnostics, site: window.block3SiteDiagnostics })',
      true
    );
    const photoSyncPreserved =
      photoSyncAfter.photo.sceneId === photoSyncBefore.photo.sceneId &&
      photoSyncAfter.photo.runtimeUrl === photoSyncBefore.photo.runtimeUrl &&
      photoSyncAfter.photo.loadCount === photoSyncBefore.photo.loadCount &&
      JSON.stringify(photoSyncAfter.site.cameraCurrentValues) === JSON.stringify(photoSyncBefore.site.cameraCurrentValues) &&
      JSON.stringify(photoSyncAfter.site.position) === JSON.stringify(photoSyncBefore.site.position);
    const locationSmoke = await window.webContents.executeJavaScript('window.runBlock4ELocationSmoke()', true);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const image = await window.webContents.capturePage();
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    fs.writeFileSync(screenshotPath, image.toPNG());

    const broker = liveLinkBroker.getSnapshot();
    const technicalPass =
      startupView.pass === true &&
      firstAck.receivedWidth === width && firstAck.receivedHeight === height &&
      firstAck.textureWidth === width && firstAck.textureHeight === height &&
      firstAck.receivedBytes === frameBytes.byteLength &&
      secondAck.receivedWidth === width && secondAck.receivedHeight === height &&
      secondAck.textureWidth === width && secondAck.textureHeight === height &&
      secondAck.receivedBytes === frameBytes.byteLength &&
      thirdAck.receivedWidth === width && thirdAck.receivedHeight === height &&
      thirdAck.textureWidth === width && thirdAck.textureHeight === height &&
      thirdAck.receivedBytes === frameBytes.byteLength && photoSyncPreserved === true &&
      runtime.documentWidth === width && runtime.documentHeight === height &&
      runtime.captureWidth === width && runtime.captureHeight === height &&
      runtime.receivedWidth === width && runtime.receivedHeight === height &&
      runtime.textureWidth === width && runtime.textureHeight === height &&
      runtime.framesReceived === 2 && runtime.framesDropped === 0 && runtime.framesReplaced === 1 &&
      liveViewPreserved && liveTextureCountStable &&
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
      anamorphicSmokePass(anamorphic75f, 'ANAMORPHIC_FRONT_75F', 'ANAM_SURFACE_FRONT75F', false, 'PASS') &&
      anamorphicSmokePass(anamorphicBack, 'ANAMORPHIC_BACK', 'ANAM_SURFACE_BACK', false, 'PASS') &&
      photoSceneSmoke.allScenesReady === true && photoSceneSmoke.rapidLatestWins === true &&
      photoSceneSmoke.contentAspectExact === true && photoSceneSmoke.outsideContentRejected === true &&
      photoSceneSmoke.stressSwitchCount === 24 && photoSceneSmoke.stressLatestWins === true &&
      photoSceneSmoke.rendererTextureCountAfterStress <= photoSceneSmoke.rendererTextureBudget &&
      photoPointerRequest.command.requestId === photoPointerSet.requestId &&
      photoPointerRequest.canonical.x === photoPointerSet.x && photoPointerRequest.canonical.y === photoPointerSet.y &&
      photoPointerRequest.surfaceHit.surfaceRole === 'Front' && photoPointerRequest.surfaceHit.meshName.includes('LUUX_Front') &&
      photoPointerRequest.photoSceneId === 'FRONT' && photoPointerRequest.photoResourceCount === 1 &&
      photoPointerRuntime.state === 'READY' && photoPointerRuntime.coordinateError === 0 &&
      photoPointerRuntime.marker?.view === 'site-3d' && photoPointerRuntime.marker?.status === 'acknowledged' &&
      photoPointerRuntime.marker?.visible === true && photoRuntime.ready === true && photoRuntime.sceneId === 'FRONT' &&
      environmentSmoke.status === 'READY' && environmentSmoke.revisionChanged === false &&
      environmentSmoke.meshCount === 18 && environmentSmoke.visibleMeshCount === 18 &&
      environmentSmoke.excludedMeshCount === 0 && environmentSmoke.pointTargetCount === 0 &&
      environmentSmoke.materialOverrideExact === true && environmentSmoke.rootTransformIdentity === true &&
      environmentSmoke.allTransformsFinite === true && environmentSmoke.hiddenOutsideWorld3d === true &&
      environmentSmoke.strictSignageStillActive === true && environmentSmoke.loadCount === 1 &&
      locationSmoke.fourIndependent === true && locationSmoke.allProxiesReady === true &&
      locationSmoke.noVisualTextLabels === true && locationSmoke.allHiddenWhenOff === true &&
      locationSmoke.pointPassThrough === true && locationSmoke.allLocationsNavigate === true &&
      locationSmoke.exactReturns === true && locationSmoke.rapidLatestWins === true &&
      locationSmoke.rapidReturn === 'RETURNED' && locationSmoke.directEntryHasNoFakeReturn === true &&
      locationSmoke.finalSiteExact === true && locationSmoke.contextLossCount === 0 &&
      runtime.rendererTextureCount === viewAfterSecondFrame.rendererTextureCount && runtime.contextLossCount === 0 &&
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
      startupView,
      firstAck,
      secondAck,
      thirdAck,
      viewBeforeSecondFrame,
      viewAfterSecondFrame,
      liveViewPreserved,
      liveTextureCountStable,
      pointer2d: { request: pointer2dRequest, set: pointer2dSet, ack: pointer2dAck, runtime: pointer2dRuntime },
      pointer3d: { request: pointer3dRequest, set: pointer3dSet, ack: pointer3dAck, runtime: pointer3dRuntime },
      markerCameraSmoke,
      plane3dRuntime,
      environmentSmoke,
      locationSmoke,
      sitePointer: { request: sitePointerRequest, set: sitePointerSet, ack: sitePointerAck, runtime: sitePointerRuntime },
      siteMarkerCameraSmoke,
      site3dRuntime,
      anamorphic75f,
      anamorphicBack,
      photoSceneSmoke,
      photoPointer: { request: photoPointerRequest, set: photoPointerSet, ack: photoPointerAck, runtime: photoPointerRuntime },
      photoRuntime,
      photoSyncBefore,
      photoSyncAfter,
      photoSyncPreserved,
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
      broker: liveLinkBroker?.getSnapshot() || null,
      liveLinkEvents,
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
      preload: path.join(__dirname, 'project-preload.cjs'),
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
  configureProjectIpc();
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
