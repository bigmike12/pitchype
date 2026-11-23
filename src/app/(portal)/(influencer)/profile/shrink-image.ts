/**
 * Shrinks a picture in the browser before upload: quicker on mobile data, and
 * under the hosting limit on request size. The server processes it again
 * either way, so if this fails the caller sends the original instead.
 * `maxEdge` is the longest side kept: comfortably above what the server stores.
 */
export async function shrinkForUpload(
  file: File,
  maxEdge: number,
): Promise<Blob> {
  const bitmap = await createImageBitmap(file); // applies EXIF rotation
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no canvas");
  // JPEG has no transparency: put see-through PNGs on white, not black.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("no blob"))),
      "image/jpeg",
      0.9,
    ),
  );
}
