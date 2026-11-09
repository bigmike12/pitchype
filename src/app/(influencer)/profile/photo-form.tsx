"use client";

import { useActionState, useRef, useState, startTransition } from "react";

import { CreatorPhoto } from "@/components/creators/creator-photo";
import { Button } from "@/components/ui/button";
import { FieldMessages } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";

import {
  removePhotoAction,
  uploadPhotoAction,
  type PhotoState,
} from "./actions";

// Big enough for the server's 512px square crop with room to spare.
const MAX_EDGE = 1024;

/**
 * Shrinks the photo in the browser before upload: quicker on mobile data,
 * and under the hosting limit on request size. The server processes it
 * again either way, so if this fails the original goes up instead.
 */
async function shrinkForUpload(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file); // applies EXIF rotation
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
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

export function PhotoForm({
  name,
  photoUrl,
}: {
  name: string;
  photoUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState<PhotoState, FormData>(
    uploadPhotoAction,
    { status: "idle" },
  );
  const [preparing, setPreparing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const busy = pending || preparing;

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    const file = input.current?.files?.[0];
    if (!file) return; // the browser's own "required" message shows
    event.preventDefault();
    setPreparing(true);
    const prepared = await shrinkForUpload(file).catch(() => file);
    setPreparing(false);
    const data = new FormData();
    data.set("photo", prepared, "photo.jpg");
    startTransition(() => formAction(data));
  }

  const error = state.errors?.photo;
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
      <CreatorPhoto
        name={name}
        url={photoUrl}
        sizes="8rem"
        className="size-32 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <form action={formAction} onSubmit={upload} className="space-y-3">
          <label htmlFor="photo" className="font-semibold text-ink">
            {photoUrl ? "Change your photo" : "Add a photo"}
          </label>
          <input
            ref={input}
            id="photo"
            name="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            required
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "photo-hint photo-error" : "photo-hint"}
            className="block w-full text-sm text-body file:mr-4 file:h-11 file:cursor-pointer file:rounded-control file:border file:border-field file:bg-canvas file:px-4 file:font-semibold file:text-ink hover:file:bg-surface-card"
          />
          <FieldMessages
            id="photo"
            hint="A clear, recent photo of you. JPEG, PNG or WebP, up to 5MB. We crop it square and remove location data."
            error={error}
          />
          <FormMessage status={state.status} message={state.message} />
          <Button type="submit" disabled={busy}>
            {preparing ? "Preparing…" : pending ? "Uploading…" : "Upload photo"}
          </Button>
        </form>
        {photoUrl && (
          <form action={removePhotoAction} className="mt-2">
            <Button type="submit" variant="ghost" className="-ml-3">
              Remove photo
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
