/* Local photo preparation: decode, orient, bound and re-encode to a clean
   JPEG entirely in the browser — the original file and its metadata never
   leave the device. */

export const MAX_ORIGINAL = 20 * 1024 * 1024;
export const MAX_PREPARED = 2 * 1024 * 1024;
const MAX_SIDE = 1600;

export interface PreparedPhoto { blob: Blob; width: number; height: number }

export type PhotoReject = 'not_an_image' | 'too_large' | 'cannot_prepare';

const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ACCEPTED_EXT = /\.(jpe?g|png|webp)$/i;

export const photoAcceptAttr =
  'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';

/* Decode one file into a normalized JPEG. Returns a reject reason rather
   than throwing so the caller keeps the previous draft untouched. */
export async function preparePhoto(file: File | Blob): Promise<PreparedPhoto | PhotoReject> {
  if (file.size > MAX_ORIGINAL) return 'too_large';
  /* A stated MIME must be on the list; an unstated one (empty type, as some
     pickers produce) needs an allowed extension — SVG is rejected either way. */
  if (file.type) {
    if (!ACCEPTED.has(file.type.toLowerCase())) return 'not_an_image';
  } else if (!(file instanceof File) || !ACCEPTED_EXT.test(file.name)) {
    return 'not_an_image';
  }
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'cannot_prepare';
    ctx.fillStyle = '#ffffff'; // white behind transparency
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    const encode = (quality: number) => new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality));
    let blob = await encode(0.9);
    if (blob && blob.size > MAX_PREPARED) blob = await encode(0.72);
    if (!blob) return 'cannot_prepare';
    if (blob.size > MAX_PREPARED) return 'too_large';
    return { blob, width: w, height: h };
  } catch {
    return 'cannot_prepare';
  } finally {
    bitmap?.close();
  }
}
