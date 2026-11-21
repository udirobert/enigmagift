// EXIF stripping — phone photos carry GPS/camera/timestamp metadata in EXIF.
// The frontend re-encodes most uploads through canvas (which drops EXIF); this
// is the server-side guarantee for pass-through and fallback cases.
// JPEG: drop APP1 (Exif + XMP, where GPS lives), APP13 (IPTC) and COM segments,
// keep the rest (APP0/JFIF, APP2/ICC). PNG: drop the eXIf chunk.
// WebP/GIF/HEIC: passed through untouched (documented gap).

function stripExifJpeg(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return buf;
  const out = [buf.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) { out.push(buf.subarray(i)); return Buffer.concat(out); }
    const marker = buf[i + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(buf.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (marker === 0xda) { out.push(buf.subarray(i)); return Buffer.concat(out); } // SOS → image data
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) { out.push(buf.subarray(i)); return Buffer.concat(out); }
    const seg = buf.subarray(i, i + 2 + len);
    if (marker !== 0xe1 && marker !== 0xed && marker !== 0xfe) out.push(seg);
    i += 2 + len;
  }
  return Buffer.concat(out);
}

function stripExifPng(buf) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) return buf; // ‰PNG
  const out = [buf.subarray(0, 8)];
  let i = 8;
  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('ascii', i + 4, i + 8);
    const total = 12 + len;
    if (i + total > buf.length) { out.push(buf.subarray(i)); break; }
    if (type !== 'eXIf') out.push(buf.subarray(i, i + total));
    i += total;
  }
  return Buffer.concat(out);
}

export function stripExif(buf) {
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) return stripExifJpeg(buf);
  if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47) return stripExifPng(buf);
  return buf;
}
