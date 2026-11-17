// The one pipeline every proof screenshot goes through on the server. The
// browser's file type and size are not trusted: the contents are checked, the
// picture is turned upright, shrunk to 2,000 pixels on its longest side and
// saved as WebP with no metadata (EXIF holds GPS and camera details). Only
// that output is stored; the upload is dropped. Mirrors lib/profile-photo.ts.

import sharp from "sharp";

import {
  hasAcceptedFormat,
  MAX_INPUT_PIXELS,
  MAX_PHOTO_BYTES,
} from "./profile-photo.ts";

export const MAX_PROOF_BYTES = MAX_PHOTO_BYTES;
export const PROOF_LONGEST_SIDE = 2000;

export type ProofImageResult =
  { ok: true; webp: Buffer } | { ok: false; message: string };

export async function processProofImage(file: File): Promise<ProofImageResult> {
  if (file.size > MAX_PROOF_BYTES) {
    return { ok: false, message: "Each screenshot must be 5 MB or smaller." };
  }
  const input = new Uint8Array(await file.arrayBuffer());
  if (!(await hasAcceptedFormat(input))) {
    return {
      ok: false,
      message: "Screenshots must be JPEG, PNG or WebP pictures.",
    };
  }

  try {
    const webp = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      // Apply the camera's rotation before the metadata that records it goes.
      .autoOrient()
      .resize(PROOF_LONGEST_SIDE, PROOF_LONGEST_SIDE, {
        fit: "inside",
        withoutEnlargement: true,
      })
      // sharp writes no metadata unless asked, so EXIF is gone.
      .webp({ quality: 80 })
      .toBuffer();
    // The bucket and the database both stop at 5 MB.
    if (webp.byteLength > MAX_PROOF_BYTES) {
      return {
        ok: false,
        message: "That screenshot is too detailed to store. Try a smaller one.",
      };
    }
    return { ok: true, webp };
  } catch {
    return {
      ok: false,
      message: "We couldn’t read that picture. Try another.",
    };
  }
}
