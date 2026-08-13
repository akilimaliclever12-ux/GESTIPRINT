// Client-side image compression. Shrinks ANY image down to at most `maxBytes`
// by downscaling and re-encoding to WebP (JPEG fallback for older Safari).
// So a 5 MB phone photo comes out as a few KB before it is ever uploaded.
//
// Usage: const blob = await compressImage(file, { maxBytes: 5120, maxDim: 160 });
const DEFAULTS = { maxBytes: 5 * 1024, maxDim: 160, mime: 'image/webp' };

// Load the file into something drawable, respecting EXIF orientation so photos
// taken in portrait on a phone aren't rotated.
async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall through */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = () => rej(new Error('Image illisible.'));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function scaledCanvas(bitmap, dim) {
  const w = bitmap.width || bitmap.naturalWidth || 1;
  const h = bitmap.height || bitmap.naturalHeight || 1;
  const scale = Math.min(1, dim / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const toBlob = (canvas, mime, q) => new Promise((resolve) => canvas.toBlob(resolve, mime, q));

// Returns a Blob at most `maxBytes` when achievable, otherwise the smallest we
// could produce. Progressively lowers dimension and quality.
export async function compressImage(file, opts = {}) {
  const { maxBytes, maxDim, mime } = { ...DEFAULTS, ...opts };
  if (!file || !String(file.type || '').startsWith('image/')) throw new Error('Veuillez choisir une image.');
  const bitmap = await loadBitmap(file);
  const dims = [maxDim, Math.round(maxDim * 0.8), Math.round(maxDim * 0.6), Math.round(maxDim * 0.45)];
  const quals = [0.72, 0.6, 0.5, 0.4, 0.3, 0.22];
  let best = null;
  try {
    for (const dim of dims) {
      const canvas = scaledCanvas(bitmap, dim);
      for (const q of quals) {
        let blob = await toBlob(canvas, mime, q);
        if (!blob) blob = await toBlob(canvas, 'image/jpeg', q); // WebP encode unsupported
        if (!blob) continue;
        if (!best || blob.size < best.size) best = blob;
        if (blob.size <= maxBytes) return blob;
      }
    }
    return best; // couldn't reach the target — return the smallest achievable
  } finally {
    if (bitmap.close) bitmap.close();
  }
}

// Convenience: a Blob's file extension from its mime type.
export const blobExt = (blob) => (blob?.type === 'image/webp' ? 'webp' : blob?.type === 'image/png' ? 'png' : 'jpg');
