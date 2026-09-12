const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function uint32Bytes(value) {
  return new Uint8Array([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
}

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
  }
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = new Uint8Array()) {
  const typeBytes = new TextEncoder().encode(type);
  const crcInput = new Uint8Array(typeBytes.byteLength + data.byteLength);
  crcInput.set(typeBytes);
  crcInput.set(data, typeBytes.byteLength);
  const chunk = new Uint8Array(12 + data.byteLength);
  chunk.set(uint32Bytes(data.byteLength), 0);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  chunk.set(uint32Bytes(crc32(crcInput)), 8 + data.byteLength);
  return chunk;
}

async function deflateRgbaScanlines(rgba, width, height) {
  if (typeof CompressionStream !== 'function') throw new Error('SNAPSHOT_PNG_ENCODER_UNAVAILABLE: CompressionStream is required.');
  const stream = new CompressionStream('deflate');
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const compressed = [];
  let compressedLength = 0;
  const consume = (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      compressed.push(value);
      compressedLength += value.byteLength;
    }
  })();
  const rowBytes = width * 4;
  for (let y = 0; y < height; y += 1) {
    const row = new Uint8Array(rowBytes + 1);
    row[0] = 0;
    row.set(rgba.subarray(y * rowBytes, (y + 1) * rowBytes), 1);
    await writer.write(row);
  }
  await writer.close();
  await consume;
  const result = new Uint8Array(compressedLength);
  let offset = 0;
  for (const chunk of compressed) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export function rgba8FromChunky(bytes, width, height, components) {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const pixelCount = width * height;
  if (![3, 4].includes(components) || input.byteLength !== pixelCount * components) {
    throw new Error('SNAPSHOT_PIXEL_BYTES_INVALID: Chunky RGB/RGBA bytes do not match dimensions.');
  }
  if (components === 4) return input;
  const rgba = new Uint8Array(pixelCount * 4);
  for (let source = 0, target = 0; source < input.byteLength; source += 3, target += 4) {
    rgba[target] = input[source];
    rgba[target + 1] = input[source + 1];
    rgba[target + 2] = input[source + 2];
    rgba[target + 3] = 255;
  }
  return rgba;
}

export async function encodeRgba8Png(rgbaValue, width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error('SNAPSHOT_PNG_DIMENSIONS_INVALID: PNG dimensions must be positive integers.');
  }
  const rgba = rgbaValue instanceof Uint8Array ? rgbaValue : new Uint8Array(rgbaValue);
  if (rgba.byteLength !== width * height * 4) throw new Error('SNAPSHOT_PNG_BYTES_INVALID: RGBA byte length does not match dimensions.');
  const header = new Uint8Array(13);
  header.set(uint32Bytes(width), 0);
  header.set(uint32Bytes(height), 4);
  header.set([8, 6, 0, 0, 0], 8);
  const compressed = await deflateRgbaScanlines(rgba, width, height);
  const chunks = [
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('sRGB', new Uint8Array([0])),
    pngChunk('IDAT', compressed),
    pngChunk('IEND')
  ];
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    png.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return png;
}
