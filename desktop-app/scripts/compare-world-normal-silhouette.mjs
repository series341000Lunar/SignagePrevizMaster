import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const options = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => {
  if (!value.startsWith('--')) return pairs;
  pairs.push([value.slice(2), values[index + 1]]);
  return pairs;
}, []));

for (const required of ['reference', 'actual', 'output', 'report']) {
  if (!options[required]) throw new Error(`Missing --${required} argument.`);
}

const referenceImage = await sharp(options.reference)
  .removeAlpha()
  .toColourspace('srgb')
  .raw({ depth: 'uchar' })
  .toBuffer({ resolveWithObject: true });
const actualImage = await sharp(options.actual)
  .ensureAlpha()
  .toColourspace('srgb')
  .raw({ depth: 'uchar' })
  .toBuffer({ resolveWithObject: true });

const width = referenceImage.info.width;
const height = referenceImage.info.height;
if (actualImage.info.width !== width || actualImage.info.height !== height) {
  throw new Error(`Dimension mismatch: reference ${width}x${height}, actual ${actualImage.info.width}x${actualImage.info.height}`);
}

const referenceChannels = referenceImage.info.channels;
const actualChannels = actualImage.info.channels;
const reference = referenceImage.data;
const actual = actualImage.data;
const cornerPixels = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]];
const background = [0, 1, 2].map((channel) => Math.round(cornerPixels.reduce((sum, [x, y]) =>
  sum + reference[(y * width + x) * referenceChannels + channel], 0) / cornerPixels.length));
const referenceMask = new Uint8Array(width * height);
const actualMask = new Uint8Array(width * height);

for (let pixel = 0; pixel < width * height; pixel++) {
  const referenceOffset = pixel * referenceChannels;
  const actualOffset = pixel * actualChannels;
  const referenceDelta = Math.max(
    Math.abs(reference[referenceOffset] - background[0]),
    Math.abs(reference[referenceOffset + 1] - background[1]),
    Math.abs(reference[referenceOffset + 2] - background[2])
  );
  referenceMask[pixel] = referenceDelta > 6 ? 1 : 0;
  actualMask[pixel] = actual[actualOffset + 3] > 8 ? 1 : 0;
}

const hasNeighbor = (mask, x, y) => {
  for (let offsetY = -1; offsetY <= 1; offsetY++) {
    const sampleY = y + offsetY;
    if (sampleY < 0 || sampleY >= height) continue;
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      const sampleX = x + offsetX;
      if (sampleX < 0 || sampleX >= width) continue;
      if (mask[sampleY * width + sampleX]) return true;
    }
  }
  return false;
};

const overlay = Buffer.alloc(width * height * 4);
let referenceVisible = 0;
let actualVisible = 0;
let intersection = 0;
let referenceOnly = 0;
let actualOnly = 0;
let referenceOnlyBeyondOnePixel = 0;
let actualOnlyBeyondOnePixel = 0;

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const pixel = y * width + x;
    const referenceOn = referenceMask[pixel] === 1;
    const actualOn = actualMask[pixel] === 1;
    referenceVisible += Number(referenceOn);
    actualVisible += Number(actualOn);
    intersection += Number(referenceOn && actualOn);
    referenceOnly += Number(referenceOn && !actualOn);
    actualOnly += Number(!referenceOn && actualOn);
    if (referenceOn && !actualOn && !hasNeighbor(actualMask, x, y)) referenceOnlyBeyondOnePixel++;
    if (!referenceOn && actualOn && !hasNeighbor(referenceMask, x, y)) actualOnlyBeyondOnePixel++;

    const offset = pixel * 4;
    const color = referenceOn && actualOn
      ? [196, 196, 196, 255]
      : referenceOn
        ? [255, 64, 64, 255]
        : actualOn
          ? [0, 210, 255, 255]
          : [18, 22, 28, 255];
    overlay[offset] = color[0];
    overlay[offset + 1] = color[1];
    overlay[offset + 2] = color[2];
    overlay[offset + 3] = color[3];
  }
}

const union = referenceVisible + actualVisible - intersection;
const report = {
  reference: path.resolve(options.reference),
  actual: path.resolve(options.actual),
  output: path.resolve(options.output),
  dimensions: { width, height },
  referenceBackgroundRgb8: background,
  thresholds: { referenceBackgroundMaxChannelDelta: 6, actualAlphaMinExclusive: 8 },
  legend: {
    gray: 'REFERENCE_AND_PREVIZ',
    red: 'REFERENCE_ONLY',
    cyan: 'PREVIZ_ONLY',
    dark: 'BACKGROUND'
  },
  pixels: {
    referenceVisible,
    actualVisible,
    intersection,
    union,
    referenceOnly,
    actualOnly,
    referenceOnlyBeyondOnePixel,
    actualOnlyBeyondOnePixel
  },
  strictSilhouetteIou: union ? intersection / union : 1,
  interpretation: 'VISUAL_EVIDENCE_ONLY_NOT_AN_AUTOMATIC_USER_PASS'
};

await fs.mkdir(path.dirname(path.resolve(options.output)), { recursive: true });
await sharp(overlay, { raw: { width, height, channels: 4 } }).png().toFile(options.output);
await fs.writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
