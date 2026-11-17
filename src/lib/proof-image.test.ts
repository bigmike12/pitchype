import assert from "node:assert/strict";
import { test } from "node:test";

import sharp from "sharp";

import { MAX_PROOF_BYTES, processProofImage } from "./proof-image.ts";

async function screenshot(width: number, height: number) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 20, g: 120, b: 200 },
    },
  })
    .jpeg()
    .withExif({ IFD0: { Make: "PhoneCo" } })
    .toBuffer();
}

const asFile = (data: Uint8Array | string, name = "shot.jpg") =>
  new File([data as BlobPart], name);

test("a big screenshot is shrunk to 2,000 px, stored as WebP with no metadata", async () => {
  const result = await processProofImage(asFile(await screenshot(3000, 1500)));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const meta = await sharp(result.webp).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.width, 2000);
  assert.equal(meta.height, 1000);
  assert.equal(meta.exif, undefined);
});

test("a small screenshot is not enlarged", async () => {
  const result = await processProofImage(asFile(await screenshot(300, 200)));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const meta = await sharp(result.webp).metadata();
  assert.deepEqual([meta.width, meta.height], [300, 200]);
});

test("a file that is not a picture is refused, whatever its name", async () => {
  const result = await processProofImage(asFile("not a picture", "shot.png"));
  assert.equal(result.ok, false);
});

test("a file over 5 MB is refused before it is read", async () => {
  const result = await processProofImage(
    asFile(new Uint8Array(MAX_PROOF_BYTES + 1)),
  );
  assert.equal(result.ok, false);
});
