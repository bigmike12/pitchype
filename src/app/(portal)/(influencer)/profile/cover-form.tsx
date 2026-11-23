"use client";

import Image from "next/image";
import { startTransition, useActionState, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { FieldMessages } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";

import { removeCoverAction, uploadCoverAction, type CoverState } from "./actions";
import { shrinkForUpload } from "./shrink-image";

// Above the server's 1600px-wide crop, small enough for slow connections.
const MAX_EDGE = 2000;

/** The wide picture across the top of a creator's public page. */
export function CoverForm({ coverUrl }: { coverUrl: string | null }) {
  const [state, formAction, pending] = useActionState<CoverState, FormData>(
    uploadCoverAction,
    { status: "idle" },
  );
  const [preparing, setPreparing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const busy = pending || preparing;

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    const file = input.current?.files?.[0];
    if (!file) return;
    event.preventDefault();
    setPreparing(true);
    const prepared = await shrinkForUpload(file, MAX_EDGE).catch(() => file);
    setPreparing(false);
    const data = new FormData();
    data.set("cover", prepared, "cover.jpg");
    startTransition(() => formAction(data));
  }

  const error = state.errors?.cover;
  return (
    <div className="space-y-5">
      <div className="relative aspect-video overflow-hidden rounded-card bg-surface-soft ring-1 ring-hairline">
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt=""
            fill
            unoptimized
            sizes="(min-width: 1024px) 44rem, 90vw"
            className="object-cover"
          />
        ) : (
          <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-muted">
            No cover yet. Your page shows a plain colour band with your name instead.
          </p>
        )}
      </div>
      <form action={formAction} onSubmit={upload} className="space-y-3">
        <label htmlFor="cover-file" className="font-semibold text-ink">
          {coverUrl ? "Change your cover" : "Add a cover"}
        </label>
        <input
          ref={input}
          id="cover-file"
          name="cover"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "cover-file-hint cover-file-error" : "cover-file-hint"}
          className="block w-full text-sm text-body file:mr-4 file:h-11 file:cursor-pointer file:rounded-control file:border file:border-field file:bg-canvas file:px-4 file:font-semibold file:text-ink hover:file:bg-surface-soft"
        />
        <FieldMessages
          id="cover-file"
          hint="A wide picture of you or your work, landscape works best. JPEG, PNG or WebP, up to 5MB. We crop it to 16:9 and remove location data."
          error={error}
        />
        <FormMessage status={state.status} message={state.message} />
        <Button type="submit" disabled={busy}>
          {preparing ? "Preparing…" : pending ? "Uploading…" : "Upload cover"}
        </Button>
      </form>
      {coverUrl && (
        <form action={removeCoverAction}>
          <Button type="submit" variant="ghost" className="-ml-3">
            Remove cover
          </Button>
        </form>
      )}
    </div>
  );
}
