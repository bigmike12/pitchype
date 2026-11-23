// The one pipeline every profile photo, cover and work sample goes through on
// the server. The
// browser shrinks photos before upload too, but that can be skipped, so this
// is the check that counts. Only its output is stored; the upload is dropped.

import sharp, { type ResizeOptions } from "sharp";

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const PHOTO_SIZE = 512;
export const COVER_WIDTH = 1600;
export const COVER_HEIGHT = 900;
export const SAMPLE_EDGE = 1200;

// The profile-photos bucket refuses objects over 1MB
// (20261109133550_create_profile_photos_bucket.sql).
export const MAX_STORED_BYTES = 1024 * 1024;

export type ImageKind = "photo" | "cover" | "sample";

const RESIZE: Record<ImageKind, ResizeOptions> = {
  photo: { width: PHOTO_SIZE, height: PHOTO_SIZE, fit: "cover", position: "centre" },
  cover: { width: COVER_WIDTH, height: COVER_HEIGHT, fit: "cover", position: "attention" },
  // Keeps the shape; never enlarges a small image.
  sample: { width: SAMPLE_EDGE, height: SAMPLE_EDGE, fit: "inside", withoutEnlargement: true },
};

// Tried in turn until the result fits the bucket; real photos fit at the first.
const QUALITIES = [80, 65, 50];

// Detected from the file's contents, never its name or declared type.
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);

// Refuses "decompression bombs": small files that expand to huge images.
export const MAX_INPUT_PIXELS = 50_000_000;

/** True when the file's contents (not its name) are a JPEG, PNG or WebP. */
export async function hasAcceptedFormat(input: Uint8Array): Promise<boolean> {
  try {
    const { format } = await sharp(input, {
      limitInputPixels: MAX_INPUT_PIXELS,
    }).metadata();
    return format !== undefined && ACCEPTED_FORMATS.has(format);
  } catch {
    return false;
  }
}

export type PhotoResult =
  | { ok: true; webp: Buffer }
  | { ok: false; reason: "too_large" | "unsupported" | "unreadable" };

export function processProfilePhoto(input: Uint8Array): Promise<PhotoResult> {
  return processImage(input, "photo");
}

export async function processImage(
  input: Uint8Array,
  kind: ImageKind,
): Promise<PhotoResult> {
  if (input.byteLength > MAX_PHOTO_BYTES) {
    return { ok: false, reason: "too_large" };
  }

  if (!(await hasAcceptedFormat(input))) {
    return { ok: false, reason: "unsupported" };
  }

  try {
    for (const quality of QUALITIES) {
      const webp = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
        // Apply the camera's rotation before the metadata that records it goes.
        .autoOrient()
        .resize(RESIZE[kind])
        // sharp writes no metadata unless asked, so EXIF (GPS, camera) is gone.
        .webp({ quality })
        .toBuffer();
      if (webp.byteLength <= MAX_STORED_BYTES) return { ok: true, webp };
    }
    return { ok: false, reason: "unreadable" };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}
