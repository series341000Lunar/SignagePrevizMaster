import { PLANAR_CANONICAL, getPlanarMappingProfile } from './planar-mapping-profile.js';

export function createPlanarAsymmetricFixture(familyId) {
  getPlanarMappingProfile(familyId);
  const { width, height } = PLANAR_CANONICAL;
  const bytes = new Uint8Array(width * height * 4);
  const corners = [
    [255, 0, 0], [0, 255, 0],
    [0, 0, 255], [255, 255, 0]
  ];
  for (let y = 0; y < height; y += 1) {
    const bottom = y >= height / 2 ? 2 : 0;
    for (let x = 0; x < width; x += 1) {
      const color = corners[bottom + (x >= width / 2 ? 1 : 0)];
      const offset = (y * width + x) * 4;
      bytes[offset] = color[0];
      bytes[offset + 1] = color[1];
      bytes[offset + 2] = color[2];
      bytes[offset + 3] = 255;
      // Three asymmetric alpha bands and an unmistakable white center mark.
      if (x > width * 0.30 && x < width * 0.40 && y > height * 0.30 && y < height * 0.40) bytes[offset + 3] = 0;
      if (x > width * 0.60 && x < width * 0.70 && y > height * 0.30 && y < height * 0.40) bytes[offset + 3] = 128;
      if (x > width / 2 - 65 && x < width / 2 + 65 && y > height / 2 - 85 && y < height / 2 + 85) {
        bytes[offset] = 255;
        bytes[offset + 1] = 255;
        bytes[offset + 2] = 255;
      }
    }
  }
  return {
    bytes, width, height, components: 4, componentSize: 8,
    pixelFormat: 'RGBA', colorSpace: 'RGB', alpha: 'STRAIGHT', orientation: 'TOP_LEFT',
    outputKind: 'CANONICAL', familyId
  };
}
