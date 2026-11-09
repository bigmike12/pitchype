import assert from "node:assert/strict";
import { test } from "node:test";

import sharp from "sharp";

import {
  MAX_PHOTO_BYTES,
  PHOTO_SIZE,
  processProfilePhoto,
} from "./profile-photo.ts";

// A phone-style photo: landscape, with GPS and an orientation tag saying
// "rotate 90°" (so it should come out portrait-correct, then square).
async function phonePhoto() {
  return sharp({
    create: {
      width: 1200,
      height: 800,
      channels: 3,
      background: { r: 200, g: 80, b: 40 },
    },
  })
    .jpeg()
    .withExif({
      IFD0: { Orientation: "6", Make: "PhoneCo" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "6/1 27/1 0/1" },
    })
    .toBuffer();
}

test("turns a photo into a 512px square WebP", async () => {
  const result = await processProfilePhoto(await phonePhoto());
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const output = await sharp(result.webp).metadata();
  assert.equal(output.format, "webp");
  assert.equal(output.width, PHOTO_SIZE);
  assert.equal(output.height, PHOTO_SIZE);
});

test("strips EXIF, including GPS location", async () => {
  const input = await phonePhoto();
  assert.ok((await sharp(input).metadata()).exif, "the test photo has EXIF");

  const result = await processProfilePhoto(input);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const output = await sharp(result.webp).metadata();
  assert.equal(output.exif, undefined);
  assert.equal(output.icc, undefined);
  assert.equal(output.orientation, undefined);
});

test("keeps the result small", async () => {
  const noisy = await sharp(Buffer.from(randomPixels(1600, 1600)), {
    raw: { width: 1600, height: 1600, channels: 3 },
  })
    .png()
    .toBuffer();
  const result = await processProfilePhoto(noisy);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  // Pure noise is the worst case; real photos land around 30–80KB.
  assert.ok(
    result.webp.byteLength < 250_000,
    `${result.webp.byteLength} bytes`,
  );
});

test("accepts PNG and WebP too", async () => {
  for (const format of ["png", "webp"] as const) {
    const input = await sharp({
      create: { width: 600, height: 900, channels: 4, background: "#ffffff" },
    })
      .toFormat(format)
      .toBuffer();
    assert.equal((await processProfilePhoto(input)).ok, true, format);
  }
});

test("rejects other formats by content, whatever the file is called", async () => {
  const gif = await sharp({
    create: { width: 10, height: 10, channels: 3, background: "#000" },
  })
    .gif()
    .toBuffer();
  assert.deepEqual(await processProfilePhoto(gif), {
    ok: false,
    reason: "unsupported",
  });

  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
  );
  assert.deepEqual(await processProfilePhoto(svg), {
    ok: false,
    reason: "unsupported",
  });

  const notAnImage = Buffer.from("definitely not a photo");
  assert.deepEqual(await processProfilePhoto(notAnImage), {
    ok: false,
    reason: "unsupported",
  });
});

test("rejects files over 5MB before decoding them", async () => {
  const big = new Uint8Array(MAX_PHOTO_BYTES + 1);
  assert.deepEqual(await processProfilePhoto(big), {
    ok: false,
    reason: "too_large",
  });
});

test("rejects a truncated JPEG", async () => {
  const photo = await phonePhoto();
  const result = await processProfilePhoto(photo.subarray(0, 200));
  assert.equal(result.ok, false);
});

function randomPixels(width: number, height: number) {
  const pixels = new Uint8Array(width * height * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 2654435761) >>> 24;
  return pixels;
}
