// The one pipeline every profile photo goes through on the server. The
// browser shrinks photos before upload too, but that can be skipped, so this
// is the check that counts. Only its output is stored; the upload is dropped.

import sharp from "sharp";

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_SIZE = 512;

// Detected from the file's contents, never its name or declared type.
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);

// Refuses "decompression bombs": small files that expand to huge images.
const MAX_INPUT_PIXELS = 50_000_000;

export type PhotoResult =
  | { ok: true; webp: Buffer }
  | { ok: false; reason: "too_large" | "unsupported" | "unreadable" };

export async function processProfilePhoto(
  input: Uint8Array,
): Promise<PhotoResult> {
  if (input.byteLength > MAX_PHOTO_BYTES) {
    return { ok: false, reason: "too_large" };
  }

  let format: string | undefined;
  try {
    ({ format } = await sharp(input, {
      limitInputPixels: MAX_INPUT_PIXELS,
    }).metadata());
  } catch {
    return { ok: false, reason: "unsupported" };
  }
  if (!format || !ACCEPTED_FORMATS.has(format)) {
    return { ok: false, reason: "unsupported" };
  }

  try {
    const webp = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      // Apply the camera's rotation before the metadata that records it goes.
      .autoOrient()
      .resize(PHOTO_SIZE, PHOTO_SIZE, { fit: "cover", position: "centre" })
      // sharp writes no metadata unless asked, so EXIF (GPS, camera) is gone.
      .webp({ quality: 80 })
      .toBuffer();
    return { ok: true, webp };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}
