import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(await readFile(path.join(appRoot, 'package.json'), 'utf8'));
const packageLock = JSON.parse(await readFile(path.join(appRoot, 'package-lock.json'), 'utf8'));
const rendererSource = await readFile(path.join(appRoot, 'src', 'renderer.js'), 'utf8');
const htmlSource = await readFile(path.join(appRoot, 'src', 'index.html'), 'utf8');
const mainSource = await readFile(path.join(appRoot, 'src', 'main.cjs'), 'utf8');

const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

assert(packageLock.version === packageJson.version && packageLock.packages[''].version === packageJson.version,
  'package-lock must track the current package version after Block 4F.');
assert(packageJson.scripts['test:block4f'] === 'node tests/block-4f-validation.mjs',
  'Block 4F must expose its dedicated validation script.');
assert(packageJson.scripts['test:protocol'].includes('npm run test:block4f'),
  'The full protocol regression must include Block 4F.');

assert(/const DEFAULT_ACTIVE_VIEW = 'site-3d'/.test(rendererSource), 'SITE 3D must be the named runtime default.');
assert(/activeView:\s*DEFAULT_ACTIVE_VIEW/.test(rendererSource), 'Initial renderer state must use the SITE 3D default.');
assert(/setActiveView\(DEFAULT_ACTIVE_VIEW\);\s*\n}/.test(rendererSource),
  'Startup must finish by synchronizing the SITE 3D controls and runtime.');
assert(/id="view-site-3d-button" class="view-button active"/.test(htmlSource),
  'SITE 3D button must be visually active in the initial HTML.');
assert(!/id="view-2d-button" class="view-button active"/.test(htmlSource),
  '2D VIEW must not be visually active in the initial HTML.');

assert(/window\.runBlock4FStartupViewSmoke = async/.test(rendererSource),
  'Renderer must expose the Block 4F startup regression entrypoint.');
assert(/setActiveView\('2d'\)[\s\S]*setActiveView\(DEFAULT_ACTIVE_VIEW\)/.test(rendererSource),
  'Block 4F smoke must exercise SITE 3D to 2D and back to SITE 3D.');
assert(/const previousView = state\.activeView;\s*\n\s*setActiveView\('2d'\)/.test(rendererSource) &&
  /setActiveView\(previousView\);/.test(rendererSource),
  'Block 0 smoke must verify 2D without depending on it being the application default.');
assert((mainSource.match(/startupView\.pass === true/g) || []).length === 2,
  'Development and live-link Electron smoke tests must both enforce the startup contract.');
assert(/document\.querySelector\('#view-2d-button'\)\.click\(\)/.test(mainSource),
  'Live-link smoke must explicitly enter 2D before its zoom preservation check.');
assert(/const liveTextureCountStable =/.test(mainSource) && /liveViewPreserved && liveTextureCountStable/.test(mainSource),
  'Live-link regression must prove texture replacement stability against the observed startup baseline.');

if (failures.length) {
  console.error('Block 4F validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    block: '4F',
    status: 'PASS',
    defaultView: 'SITE 3D',
    twoDViewPreserved: true,
    startupRuntimeSmokeRequired: true,
    userValidation: 'REQUIRED_OPEN',
    maxLikeCalibration: 'CANDIDATE_USER_CALIBRATION_OPEN'
  }, null, 2));
}
