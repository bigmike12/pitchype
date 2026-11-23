"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { FieldMessages, SelectField, TextField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import {
  MAX_CAPTION_LENGTH,
  PLATFORM_RULES,
  PLATFORMS,
  type Platform,
} from "@/lib/creator-profile";

import {
  addSampleAction,
  updateSampleAction,
  type SampleState,
} from "./actions";
import { shrinkForUpload } from "./shrink-image";

// Above the server's 1200px edge, small enough for slow connections.
const MAX_EDGE = 1600;

const PLATFORM_OPTIONS = PLATFORMS.map((p) => ({
  value: p,
  label: PLATFORM_RULES[p].label,
}));

/** Caption, platform and post link: the same three fields when adding and editing. */
function SampleFields({
  idPrefix,
  state,
  initial,
}: {
  idPrefix: string;
  state: SampleState;
  initial: { caption: string; platform: string; postUrl: string };
}) {
  const values = { ...initial, ...state.values };
  return (
    <>
      <TextField
        id={`${idPrefix}-caption`}
        label="Caption (optional)"
        name="caption"
        maxLength={MAX_CAPTION_LENGTH}
        hint={`What it was, in a line. Up to ${MAX_CAPTION_LENGTH} characters.`}
        defaultValue={values.caption}
        error={state.errors?.caption}
      />
      <SelectField
        id={`${idPrefix}-platform`}
        label="Where it ran (optional)"
        name="platform"
        placeholder="Not saying"
        options={PLATFORM_OPTIONS}
        defaultValue={values.platform}
      />
      <TextField
        id={`${idPrefix}-postUrl`}
        label="Link to the post (optional)"
        name="postUrl"
        type="url"
        inputMode="url"
        placeholder="https://"
        hint="Only businesses see this link: a post’s address shows your account."
        defaultValue={values.postUrl}
        error={state.errors?.postUrl}
      />
    </>
  );
}

export function AddSampleForm() {
  const [state, formAction, pending] = useActionState<SampleState, FormData>(
    addSampleAction,
    { status: "idle" },
  );
  const [preparing, setPreparing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const busy = pending || preparing;

  // An empty form after each success, ready for the next sample.
  useEffect(() => {
    if (state.status === "success") form.current?.reset();
  }, [state]);

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    const file = input.current?.files?.[0];
    if (!file) return;
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPreparing(true);
    const prepared = await shrinkForUpload(file, MAX_EDGE).catch(() => file);
    setPreparing(false);
    data.set("image", prepared, "sample.jpg");
    startTransition(() => formAction(data));
  }

  const error = state.errors?.image;
  return (
    <form
      ref={form}
      action={formAction}
      onSubmit={upload}
      className="space-y-5"
    >
      <div>
        <label htmlFor="sample-image" className="font-semibold text-ink">
          Picture of the work
        </label>
        <input
          ref={input}
          id="sample-image"
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={
            error ? "sample-image-hint sample-image-error" : "sample-image-hint"
          }
          className="mt-2 block w-full text-sm text-body file:mr-4 file:h-11 file:cursor-pointer file:rounded-control file:border file:border-field file:bg-canvas file:px-4 file:font-semibold file:text-ink hover:file:bg-surface-soft"
        />
        <FieldMessages
          id="sample-image"
          hint="A screenshot or a still from a post you made. JPEG, PNG or WebP, up to 5MB."
          error={error}
        />
      </div>
      <SampleFields
        idPrefix="sample-new"
        state={state}
        initial={{ caption: "", platform: "", postUrl: "" }}
      />
      <FormMessage status={state.status} message={state.message} />
      <Button type="submit" disabled={busy}>
        {preparing ? "Preparing…" : pending ? "Uploading…" : "Add sample"}
      </Button>
    </form>
  );
}

export function EditSampleForm({
  sampleId,
  caption,
  platform,
  postUrl,
}: {
  sampleId: string;
  caption: string | null;
  platform: Platform | null;
  postUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState<SampleState, FormData>(
    updateSampleAction,
    { status: "idle" },
  );
  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="sampleId" value={sampleId} />
      <SampleFields
        idPrefix={`sample-${sampleId}`}
        state={state}
        initial={{
          caption: caption ?? "",
          platform: platform ?? "",
          postUrl: postUrl ?? "",
        }}
      />
      <FormMessage status={state.status} message={state.message} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
