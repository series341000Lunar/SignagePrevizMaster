import { spawn } from 'node:child_process';
import { readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executablePath = path.join(appRoot, 'dist', 'LUUX Signage Previz.exe');
const runtimeDir = path.join(appRoot, '.runtime');
const reportPath = path.join(runtimeDir, 'portable-runtime.json');
const screenshotPath = path.join(runtimeDir, 'portable-runtime.png');
const linkReportPath = path.join(runtimeDir, 'portable-link-runtime.json');
const linkScreenshotPath = path.join(runtimeDir, 'portable-link-runtime.png');

await stat(executablePath);
await rm(reportPath, { force: true });
await rm(screenshotPath, { force: true });
await rm(linkReportPath, { force: true });
await rm(linkScreenshotPath, { force: true });

async function runPortable(argumentsList, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(executablePath, argumentsList, { cwd: appRoot, stdio: 'inherit', windowsHide: false });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Portable ${label} timed out after 120 seconds.`));
    }, 120000);
    child.once('error', reject);
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

const exitCode = await runPortable([
  '--smoke-test',
  `--report=${reportPath}`,
  `--screenshot=${screenshotPath}`
], 'runtime smoke');
const linkExitCode = await runPortable([
  '--link-smoke-test',
  `--report=${linkReportPath}`,
  `--screenshot=${linkScreenshotPath}`
], 'link smoke');

const report = JSON.parse(await readFile(reportPath, 'utf8'));
const linkReport = JSON.parse(await readFile(linkReportPath, 'utf8'));
const validation = {
  processExitCode: exitCode,
  technicalPass: report.technicalPass,
  packaged: report.packaged,
  startupDefaultSite3d: report.startupView?.pass === true && report.startupView.startup.activeView === 'site-3d',
  twoDViewPreserved: report.startupView?.twoD.activeView === '2d' && report.startupView.twoD.fullResolution === true,
  siteReentryPass: report.startupView?.reentry.activeView === 'site-3d' && report.startupView.reentry.siteStatus === 'READY',
  executablePath,
  executableBytes: (await stat(executablePath)).size,
  sourceEqualsDecoded:
    report.runtime.sourceWidth === report.runtime.decodedWidth &&
    report.runtime.sourceHeight === report.runtime.decodedHeight,
  decodedEqualsTexture:
    report.runtime.decodedWidth === report.runtime.textureWidth &&
    report.runtime.decodedHeight === report.runtime.textureHeight,
  textureLimitPass: report.runtime.textureLimitPass,
  hardwareRendering: report.runtime.hardwareRendering,
  noContextLoss: report.runtime.contextLossCount === 0,
  memoryStable: report.runtime.memoryStable,
  allActionsPass: Object.values(report.runtime.actions).every(Boolean),
  photoScenePass: report.photoScene?.allScenesReady === true && report.photoScene.rapidLatestWins === true,
  environmentPass: report.environment?.status === 'READY' && report.environment.pointTargetCount === 0,
  locationReturnPass: report.locations?.exactReturns === true && report.locations.finalSiteExact === true,
  noExternalNetwork: report.externalNetworkRequests.length === 0,
  noCriticalErrors: report.criticalErrors.length === 0,
  screenshotPath,
  linkProcessExitCode: linkExitCode,
  packagedLinkPass: linkReport.technicalPass === true && linkReport.packaged === true,
  packagedLinkStartupPass: linkReport.startupView?.pass === true,
  packagedLiveFullResolution:
    linkReport.runtime?.documentWidth === linkReport.runtime?.textureWidth &&
    linkReport.runtime?.documentHeight === linkReport.runtime?.textureHeight,
  packagedLiveTextureCountStable: linkReport.liveTextureCountStable === true,
  packagedSitePointPass: linkReport.sitePointer?.runtime?.state === 'READY',
  packagedEnvironmentPointThroughPass:
    linkReport.environmentSmoke?.pointTargetCount === 0 &&
    linkReport.environmentSmoke?.strictSignageStillActive === true,
  packagedPhotoPointPass: linkReport.photoPointer?.runtime?.state === 'READY',
  packagedLocationReturnPass:
    linkReport.locationSmoke?.exactReturns === true && linkReport.locationSmoke?.finalSiteExact === true,
  packagedLinkNoExternalNetwork: linkReport.externalNetworkRequests.length === 0,
  packagedLinkNoCriticalErrors: linkReport.criticalErrors.length === 0,
  linkScreenshotPath
};
validation.pass = exitCode === 0 && linkExitCode === 0 && Object.entries(validation)
  .filter(([key]) => !['processExitCode', 'linkProcessExitCode', 'executablePath', 'executableBytes', 'screenshotPath', 'linkScreenshotPath'].includes(key))
  .every(([, value]) => value === true);

console.log(JSON.stringify(validation, null, 2));
if (!validation.pass) process.exitCode = 1;
