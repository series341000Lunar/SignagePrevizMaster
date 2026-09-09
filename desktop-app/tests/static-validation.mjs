import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(await readFile(path.join(appRoot, 'package.json'), 'utf8'));
const mainSource = await readFile(path.join(appRoot, 'src', 'main.cjs'), 'utf8');
const rendererSource = await readFile(path.join(appRoot, 'src', 'renderer.js'), 'utf8');
const htmlSource = await readFile(path.join(appRoot, 'src', 'index.html'), 'utf8');
const builtRenderer = await readFile(path.join(appRoot, 'build', 'renderer.js'), 'utf8');
const manifest = JSON.parse(await readFile(path.join(appRoot, 'build', 'assets-manifest.json'), 'utf8'));

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
assert(packageJson.build.win.target[0].target === 'portable', 'Windows target must be portable.');
assert(packageJson.build.win.target[0].arch.includes('x64'), 'Windows target must include x64.');

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
  assets: manifest.assets
};
console.log(JSON.stringify(result, null, 2));
if (failures.length > 0) process.exitCode = 1;
