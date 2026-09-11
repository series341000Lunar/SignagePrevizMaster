import { createHash } from 'node:crypto';
import { rm, mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import sharp from 'sharp';
import { SITE_ASSETS } from '../src/site-scene-profile.js';
import { PHOTO_SCENE_RECORDS } from '../src/site-calibration-profile.js';
import { ENVIRONMENT_ASSET } from '../src/site-environment-profile.js';
import { PROJECTION_BAKE_PROFILE, validateProjectionBakeProfile } from '../src/projection-bake-profile.js';
import { inspectEnvironmentGlb } from './glb-inspection.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(appRoot, '..');
const sourceRoot = path.join(appRoot, 'src');
const assetRoot = path.join(appRoot, 'assets');
const buildRoot = path.join(appRoot, 'build');

const assets = [
  { id: 'original-png', label: 'Original PNG', fileName: 'AnamorphicTest_rocket_Original_0379f_.png', mime: 'image/png' },
  { id: 'original-jpg', label: 'Original JPG', fileName: 'AnamorphicTest_rocket_Original_0379f_.jpg', mime: 'image/jpeg' },
  { id: 'small-png', label: 'Small PNG', fileName: 'AnamorphicTest_rocket_Small_0379f_.png', mime: 'image/png' }
];

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex').toUpperCase();
}

function readPngDimensions(buffer) {
  const signature = '89504E470D0A1A0A';
  if (buffer.subarray(0, 8).toString('hex').toUpperCase() !== signature) {
    throw new Error('Invalid PNG signature.');
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function readJpegDimensions(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) throw new Error('Invalid JPEG signature.');
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    const length = buffer.readUInt16BE(offset);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  throw new Error('JPEG dimensions were not found.');
}

function readDimensions(buffer, mime) {
  return mime === 'image/png' ? readPngDimensions(buffer) : readJpegDimensions(buffer);
}

await rm(buildRoot, { recursive: true, force: true });
await mkdir(path.join(buildRoot, 'assets'), { recursive: true });
await mkdir(path.join(buildRoot, 'assets', 'site'), { recursive: true });
await mkdir(path.join(buildRoot, 'assets', 'photo'), { recursive: true });
await mkdir(path.join(buildRoot, 'assets', 'photo', 'thumb'), { recursive: true });
await mkdir(path.join(buildRoot, 'assets', 'environment'), { recursive: true });
await mkdir(path.join(buildRoot, 'assets', 'projection'), { recursive: true });
await Promise.all([
  copyFile(path.join(sourceRoot, 'index.html'), path.join(buildRoot, 'index.html')),
  copyFile(path.join(sourceRoot, 'styles.css'), path.join(buildRoot, 'styles.css')),
  copyFile(path.join(sourceRoot, 'live-link-config.json'), path.join(buildRoot, 'live-link-config.json'))
]);

await build({
  entryPoints: [path.join(sourceRoot, 'renderer.js')],
  outfile: path.join(buildRoot, 'renderer.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['chrome140'],
  sourcemap: false,
  minify: false,
  legalComments: 'none'
});

const manifestAssets = [];
for (const asset of assets) {
  const sourcePath = path.join(assetRoot, asset.fileName);
  const destinationPath = path.join(buildRoot, 'assets', asset.fileName);
  const sourceBytes = await readFile(sourcePath);
  const dimensions = readDimensions(sourceBytes, asset.mime);
  await copyFile(sourcePath, destinationPath);
  const destinationBytes = await readFile(destinationPath);
  const sourceHash = sha256(sourceBytes);
  const destinationHash = sha256(destinationBytes);
  if (sourceHash !== destinationHash) throw new Error(`Asset copy hash mismatch: ${asset.fileName}`);
  manifestAssets.push({
    ...asset,
    sourceWidth: dimensions.width,
    sourceHeight: dimensions.height,
    bytes: sourceBytes.length,
    sha256: sourceHash
  });
}

const manifest = {
  generatedAt: new Date().toISOString(),
  primaryAssetId: 'original-png',
  assets: manifestAssets,
  siteAssets: SITE_ASSETS,
  photoAssets: [],
  projectionBake: null
};

const projectionProfileValidation = validateProjectionBakeProfile(PROJECTION_BAKE_PROFILE);
if (!projectionProfileValidation.valid) {
  throw new Error(`Projection Bake profile invalid: ${projectionProfileValidation.errors.join(', ')}`);
}
const maskContract = PROJECTION_BAKE_PROFILE.productionMask;
const maskSourcePath = path.join(projectRoot, maskContract.sourcePath);
const maskDestinationPath = path.join(buildRoot, 'assets', 'projection', maskContract.fileName);
const maskSourceBytes = await readFile(maskSourcePath);
const maskDimensions = readPngDimensions(maskSourceBytes);
const maskMetadata = await sharp(maskSourceBytes).metadata();
if (maskDimensions.width !== maskContract.width || maskDimensions.height !== maskContract.height ||
    sha256(maskSourceBytes) !== maskContract.sha256 || !['b-w', 'srgb', 'rgb16'].includes(maskMetadata.space)) {
  throw new Error(`Projection validity mask source contract mismatch: ${maskContract.sourcePath}`);
}
await copyFile(maskSourcePath, maskDestinationPath);
const maskDestinationBytes = await readFile(maskDestinationPath);
if (maskDestinationBytes.length !== maskSourceBytes.length || sha256(maskDestinationBytes) !== maskContract.sha256) {
  throw new Error(`Projection validity mask build copy mismatch: ${maskContract.fileName}`);
}
manifest.projectionBake = {
  profileId: PROJECTION_BAKE_PROFILE.id,
  familyId: PROJECTION_BAKE_PROFILE.familyId,
  workingResolution: PROJECTION_BAKE_PROFILE.workingResolution,
  canonicalResolution: PROJECTION_BAKE_PROFILE.canonicalResolution,
  mask: {
    ...maskContract,
    bytes: maskSourceBytes.length,
    decodedSpace: maskMetadata.space,
    decodedChannels: maskMetadata.channels,
    decodedDepth: maskMetadata.depth,
    sourceVerified: true,
    buildCopyVerified: true
  }
};

for (const photoScene of PHOTO_SCENE_RECORDS) {
  const contract = photoScene.photoAsset;
  const sourcePath = path.join(projectRoot, contract.path);
  const destinationPath = path.join(buildRoot, 'assets', 'photo', contract.runtimeFileName);
  const sourceBytes = await readFile(sourcePath);
  const sourceDimensions = readJpegDimensions(sourceBytes);
  const sourceHash = sha256(sourceBytes);
  if (sourceBytes.length !== contract.byteLength || sourceHash !== contract.sha256 ||
      sourceDimensions.width !== contract.nativeWidth || sourceDimensions.height !== contract.nativeHeight) {
    throw new Error(`Photo source contract mismatch: ${contract.path}`);
  }
  await copyFile(sourcePath, destinationPath);
  const destinationBytes = await readFile(destinationPath);
  const destinationDimensions = readJpegDimensions(destinationBytes);
  const destinationHash = sha256(destinationBytes);
  if (destinationBytes.length !== contract.byteLength || destinationHash !== contract.sha256 ||
      destinationDimensions.width !== contract.nativeWidth || destinationDimensions.height !== contract.nativeHeight) {
    throw new Error(`Photo build copy contract mismatch: ${contract.runtimeFileName}`);
  }
  const thumbnailFileName = `${path.parse(contract.runtimeFileName).name}-thumb.jpg`;
  const thumbnailPath = path.join(buildRoot, 'assets', 'photo', 'thumb', thumbnailFileName);
  let thumbnail;
  try {
    const thumbnailBytes = await sharp(sourceBytes)
      .rotate()
      .resize({ width: 450, height: 300, fit: 'contain', withoutEnlargement: true })
      .jpeg({ quality: 82, chromaSubsampling: '4:2:0' })
      .toBuffer();
    const thumbnailDimensions = readJpegDimensions(thumbnailBytes);
    if (thumbnailDimensions.width !== 450 || thumbnailDimensions.height !== 300) {
      throw new Error(`Generated thumbnail dimensions differ from 450x300: ${thumbnailFileName}`);
    }
    await writeFile(thumbnailPath, thumbnailBytes);
    thumbnail = {
      status: 'READY',
      derivedFromAssetId: contract.assetId,
      runtimeFileName: thumbnailFileName,
      runtimeUrl: `./assets/photo/thumb/${thumbnailFileName}`,
      width: 450,
      height: 300,
      aspect: 1.5,
      bytes: thumbnailBytes.length,
      sha256: sha256(thumbnailBytes),
      generation: {
        implementation: `sharp ${sharp.versions.sharp}`,
        fit: 'contain',
        crop: false,
        stretch: false,
        jpegQuality: 82
      }
    };
  } catch (error) {
    thumbnail = {
      status: 'UNAVAILABLE',
      derivedFromAssetId: contract.assetId,
      runtimeFileName: thumbnailFileName,
      runtimeUrl: null,
      width: null,
      height: null,
      error: error.message
    };
  }
  manifest.photoAssets.push({
    sceneId: photoScene.sceneId,
    cameraId: photoScene.cameraId,
    exactMeshNames: photoScene.mapping.exactMeshNames,
    ...contract,
    sourceVerified: true,
    buildCopyVerified: true,
    thumbnail
  });
}

const environmentSourcePath = path.join(projectRoot, ENVIRONMENT_ASSET.sourcePath);
const environmentDestinationPath = path.join(buildRoot, 'assets', 'environment', ENVIRONMENT_ASSET.fileName);
const environmentSourceBytes = await readFile(environmentSourcePath);
const environmentInspection = inspectEnvironmentGlb(environmentSourceBytes);
if (!environmentInspection.scenePresent || !environmentInspection.renderableMeshPresent ||
    !environmentInspection.nodeTransformsFinite) {
  throw new Error(`Environment GLB failed soft-asset runtime compatibility: ${ENVIRONMENT_ASSET.sourcePath}`);
}
await copyFile(environmentSourcePath, environmentDestinationPath);
const environmentDestinationBytes = await readFile(environmentDestinationPath);
if (sha256(environmentDestinationBytes) !== environmentInspection.sha256 ||
    environmentDestinationBytes.length !== environmentInspection.byteLength) {
  throw new Error(`Environment GLB build copy mismatch: ${ENVIRONMENT_ASSET.fileName}`);
}
manifest.environmentAsset = {
  assetRole: ENVIRONMENT_ASSET.assetRole,
  logicalId: ENVIRONMENT_ASSET.logicalId,
  sourcePath: ENVIRONMENT_ASSET.sourcePath,
  runtimeUrl: ENVIRONMENT_ASSET.runtimeUrl,
  revisionPolicy: ENVIRONMENT_ASSET.revisionPolicy,
  observedFingerprint: environmentInspection,
  profileFingerprint: ENVIRONMENT_ASSET.observedFingerprint,
  revisionChanged: environmentInspection.byteLength !== ENVIRONMENT_ASSET.observedFingerprint.byteLength ||
    environmentInspection.sha256 !== ENVIRONMENT_ASSET.observedFingerprint.sha256,
  sourceVerified: true,
  buildCopyVerified: true
};

const siteAssetSources = {
  world3d: path.join(projectRoot, '3DAsset', 'Signage', SITE_ASSETS.world3d.fileName),
  legacy2d: path.join(assetRoot, 'site', SITE_ASSETS.legacy2d.fileName),
  anamorphicFront75f: path.join(projectRoot, '3DAsset', 'Signage', SITE_ASSETS.anamorphicFront75f.fileName),
  anamorphicBack: path.join(projectRoot, '3DAsset', 'Signage', SITE_ASSETS.anamorphicBack.fileName)
};
for (const [assetId, siteAsset] of Object.entries(SITE_ASSETS)) {
  const siteSourcePath = siteAssetSources[assetId];
  const siteDestinationPath = path.join(buildRoot, 'assets', 'site', siteAsset.fileName);
  const siteSourceBytes = await readFile(siteSourcePath);
  if (siteSourceBytes.length !== siteAsset.byteLength || sha256(siteSourceBytes) !== siteAsset.sha256) {
    throw new Error(`Site asset source contract mismatch: ${siteAsset.fileName}`);
  }
  await copyFile(siteSourcePath, siteDestinationPath);
  const siteDestinationBytes = await readFile(siteDestinationPath);
  if (sha256(siteDestinationBytes) !== siteAsset.sha256) {
    throw new Error(`Site asset copy hash mismatch: ${siteAsset.fileName}`);
  }
}
await writeFile(path.join(buildRoot, 'assets-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(manifest, null, 2));
