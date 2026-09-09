import { spawn } from 'node:child_process';
import { readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executablePath = path.join(appRoot, 'dist', 'LUUX Signage Previz.exe');
const runtimeDir = path.join(appRoot, '.runtime');
const reportPath = path.join(runtimeDir, 'portable-runtime.json');
const screenshotPath = path.join(runtimeDir, 'portable-runtime.png');

await stat(executablePath);
await rm(reportPath, { force: true });
await rm(screenshotPath, { force: true });

const exitCode = await new Promise((resolve, reject) => {
  const child = spawn(executablePath, [
    '--smoke-test',
    `--report=${reportPath}`,
    `--screenshot=${screenshotPath}`
  ], { cwd: appRoot, stdio: 'inherit', windowsHide: false });
  const timer = setTimeout(() => {
    child.kill();
    reject(new Error('Portable executable timed out after 120 seconds.'));
  }, 120000);
  child.once('error', reject);
  child.once('exit', (code) => {
    clearTimeout(timer);
    resolve(code);
  });
});

const report = JSON.parse(await readFile(reportPath, 'utf8'));
const validation = {
  processExitCode: exitCode,
  technicalPass: report.technicalPass,
  packaged: report.packaged,
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
  noExternalNetwork: report.externalNetworkRequests.length === 0,
  noCriticalErrors: report.criticalErrors.length === 0,
  screenshotPath
};
validation.pass = exitCode === 0 && Object.entries(validation)
  .filter(([key]) => !['processExitCode', 'executablePath', 'executableBytes', 'screenshotPath'].includes(key))
  .every(([, value]) => value === true);

console.log(JSON.stringify(validation, null, 2));
if (!validation.pass) process.exitCode = 1;

