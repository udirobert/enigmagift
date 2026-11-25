// Upload normalization — the server-side privacy boundary. Re-encoding drops
// metadata regardless of input format, applies any EXIF orientation before
// discarding it, flattens alpha onto white, caps decompression size at
// 30MP (phone photos fit; pixel bombs do not), and rejects undecodable bytes.
import sharp from 'sharp';

export async function normalizeImageFile(path) {
  return sharp(path, { failOn: 'truncated', limitInputPixels: 30_000_000 })
    .rotate()
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
}
