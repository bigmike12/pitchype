"use server";

import { refresh } from "next/cache";

import { requireRole } from "@/lib/auth";
import {
  isPlatform,
  MAX_SAMPLES,
  parseAboutForm,
  parsePlatformForm,
  parseSampleForm,
  publishProblems,
  type AboutField,
  type PlatformField,
  type SampleField,
} from "@/lib/creator-profile";
import {
  createSample,
  deleteSample,
  getOwnCreatorProfile,
  listNiches,
  listOwnSamples,
  removePlatform,
  savePlatform,
  setCoverVersion,
  setCreatorIndexing,
  setCreatorPublished,
  setPhotoVersion,
  setSampleImageVersion,
  swapSamples,
  updateCreatorAbout,
  updateSample,
} from "@/lib/db/creators";
import { requestVerification, submitVerification } from "@/lib/db/verification";
import { isUuid, text, type FormState } from "@/lib/form-data";
import {
  nextImageVersion,
  processImage,
  processProfilePhoto,
} from "@/lib/profile-photo";
import { createRateLimiter } from "@/lib/rate-limit";
import {
  deleteCover,
  deleteProfilePhoto,
  deleteSampleImage,
  saveCover,
  saveProfilePhoto,
  saveSampleImage,
} from "@/lib/storage";

export type AboutState = FormState<AboutField>;
export type PlatformState = FormState<PlatformField>;
export type PhotoState = FormState<"photo">;
export type CoverState = FormState<"cover">;
export type SampleState = FormState<SampleField | "image">;

const SAVE_FAILED =
  "We couldn’t save that just now. Please try again in a minute.";

// Every action checks the session and role itself, and only ever touches the
// signed-in creator's own rows: the user id comes from the session.

export async function saveAboutAction(
  _previous: AboutState,
  form: FormData,
): Promise<AboutState> {
  const user = await requireRole("influencer");
  const niches = await listNiches();
  const parsed = parseAboutForm(
    form,
    niches.map((n) => n.slug),
  );
  if (!parsed.ok) {
    return { status: "error", errors: parsed.errors, values: parsed.values };
  }
  try {
    await updateCreatorAbout(user.id, parsed.value);
  } catch (error) {
    logFailure("about", error);
    return { status: "error", message: SAVE_FAILED };
  }
  refresh();
  return { status: "success", message: "Saved." };
}

export async function savePlatformAction(
  _previous: PlatformState,
  form: FormData,
): Promise<PlatformState> {
  const user = await requireRole("influencer");
  const parsed = parsePlatformForm(form);
  if (!parsed) return { status: "error", message: SAVE_FAILED };
  if (!parsed.ok) {
    return { status: "error", errors: parsed.errors, values: parsed.values };
  }
  try {
    await savePlatform(user.id, parsed.value);
  } catch (error) {
    logFailure("platform", error);
    return { status: "error", message: SAVE_FAILED, values: valuesOf(form) };
  }
  refresh();
  // Show what was stored ("bayo.cooks"), not what was typed (a pasted link).
  return {
    status: "success",
    message: "Saved.",
    values: {
      handle: parsed.value.handle,
      followerRange: parsed.value.followerRange,
    },
  };
}

export async function removePlatformAction(form: FormData): Promise<void> {
  const user = await requireRole("influencer");
  const platform = text(form, "platform");
  if (!isPlatform(platform)) return;
  await removePlatform(user.id, platform);
  refresh();
}

// Codes are cheap to make but each one replaces the last; this stops a stuck
// button from churning them.
const isVerificationRateLimited = createRateLimiter({
  name: "verification",
  maxAttempts: 10,
  windowMs: 60 * 60 * 1000,
});

export async function requestVerificationAction(form: FormData): Promise<void> {
  const user = await requireRole("influencer");
  const platform = text(form, "platform");
  if (!isPlatform(platform) || (await isVerificationRateLimited(user.id)))
    return;
  await requestVerification(platform);
  refresh();
}

export async function submitVerificationAction(form: FormData): Promise<void> {
  await requireRole("influencer");
  const requestId = text(form, "requestId");
  if (!/^[0-9a-f-]{36}$/.test(requestId)) return;
  // "expired" needs no message: the page then offers a new code.
  await submitVerification(requestId);
  refresh();
}

export async function setPublishedAction(form: FormData): Promise<void> {
  const user = await requireRole("influencer");
  const publish = text(form, "published") === "true";
  if (publish) {
    const profile = await getOwnCreatorProfile(user.id);
    if (
      !profile ||
      publishProblems({
        niches: profile.niches,
        platformCount: profile.platforms.length,
      }).length > 0
    ) {
      return;
    }
  }
  await setCreatorPublished(user.id, publish);
  refresh();
}

export async function setIndexingAction(form: FormData): Promise<void> {
  const user = await requireRole("influencer");
  await setCreatorIndexing(user.id, text(form, "allowIndexing") === "true");
  refresh();
}

// Photos ------------------------------------------------------------------------------

// Shared by the photo, the cover and work samples (up to eight pictures).
const isUploadRateLimited = createRateLimiter({
  name: "photo-upload",
  maxAttempts: 20,
  windowMs: 10 * 60 * 1000,
});

const TOO_MANY_UPLOADS =
  "That’s a lot of uploads. Wait a few minutes, then try again.";

const PHOTO_PROBLEMS = {
  too_large: "That photo is over 5MB. Choose a smaller one.",
  unsupported: "Use a JPEG, PNG or WebP photo.",
  unreadable: "We couldn’t read that photo. Try another one.",
} as const;

export async function uploadPhotoAction(
  _previous: PhotoState,
  form: FormData,
): Promise<PhotoState> {
  const user = await requireRole("influencer");
  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", errors: { photo: "Choose a photo first." } };
  }
  if (await isUploadRateLimited(user.id)) {
    return {
      status: "error",
      errors: { photo: TOO_MANY_UPLOADS },
    };
  }

  const result = await processProfilePhoto(
    new Uint8Array(await file.arrayBuffer()),
  );
  if (!result.ok) {
    return {
      status: "error",
      errors: { photo: PHOTO_PROBLEMS[result.reason] },
    };
  }

  try {
    const profile = await getOwnCreatorProfile(user.id);
    if (!profile) return { status: "error", message: SAVE_FAILED };
    const previous = profile.photoVersion;
    const next = nextImageVersion(previous);

    await saveProfilePhoto(user.id, next, result.webp);
    await setPhotoVersion(user.id, next);
    if (previous !== null) {
      // Best effort: a leftover old file is harmless, a failed upload isn't.
      await deleteProfilePhoto(user.id, previous).catch((error) =>
        logFailure("old photo delete", error),
      );
    }
  } catch (error) {
    logFailure("photo", error);
    return { status: "error", message: SAVE_FAILED };
  }
  refresh();
  return { status: "success", message: "Photo updated." };
}

export async function removePhotoAction(): Promise<void> {
  const user = await requireRole("influencer");
  const profile = await getOwnCreatorProfile(user.id);
  if (profile?.photoVersion == null) return;
  await setPhotoVersion(user.id, null);
  await deleteProfilePhoto(user.id, profile.photoVersion).catch((error) =>
    logFailure("photo delete", error),
  );
  refresh();
}

// Covers -----------------------------------------------------------------------------

const COVER_PROBLEMS = {
  too_large: "That picture is over 5MB. Choose a smaller one.",
  unsupported: "Use a JPEG, PNG or WebP picture.",
  unreadable: "We couldn’t read that picture. Try another one.",
} as const;

export async function uploadCoverAction(
  _previous: CoverState,
  form: FormData,
): Promise<CoverState> {
  const user = await requireRole("influencer");
  const file = form.get("cover");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", errors: { cover: "Choose a picture first." } };
  }
  if (await isUploadRateLimited(user.id)) {
    return { status: "error", errors: { cover: TOO_MANY_UPLOADS } };
  }

  const result = await processImage(
    new Uint8Array(await file.arrayBuffer()),
    "cover",
  );
  if (!result.ok) {
    return {
      status: "error",
      errors: { cover: COVER_PROBLEMS[result.reason] },
    };
  }

  try {
    const profile = await getOwnCreatorProfile(user.id);
    if (!profile) return { status: "error", message: SAVE_FAILED };
    const previous = profile.coverVersion;
    const next = nextImageVersion(previous);

    await saveCover(user.id, next, result.webp);
    await setCoverVersion(user.id, next);
    if (previous !== null) {
      await deleteCover(user.id, previous).catch((error) =>
        logFailure("old cover delete", error),
      );
    }
  } catch (error) {
    logFailure("cover", error);
    return { status: "error", message: SAVE_FAILED };
  }
  refresh();
  return { status: "success", message: "Cover updated." };
}

export async function removeCoverAction(): Promise<void> {
  const user = await requireRole("influencer");
  const profile = await getOwnCreatorProfile(user.id);
  if (profile?.coverVersion == null) return;
  await setCoverVersion(user.id, null);
  await deleteCover(user.id, profile.coverVersion).catch((error) =>
    logFailure("cover delete", error),
  );
  refresh();
}

// Work samples --------------------------------------------------------------------------

export async function addSampleAction(
  _previous: SampleState,
  form: FormData,
): Promise<SampleState> {
  const user = await requireRole("influencer");
  const parsed = parseSampleForm(form);
  const file = form.get("image");
  const hasFile = file instanceof File && file.size > 0;
  if (!parsed.ok || !hasFile) {
    return {
      status: "error",
      errors: {
        ...(parsed.ok ? {} : parsed.errors),
        ...(hasFile ? {} : { image: "Choose a picture of your work." }),
      },
      values: parsed.ok ? undefined : parsed.values,
    };
  }
  if (await isUploadRateLimited(user.id)) {
    return { status: "error", errors: { image: TOO_MANY_UPLOADS } };
  }

  const samples = await listOwnSamples(user.id);
  if (samples.length >= MAX_SAMPLES) {
    return {
      status: "error",
      message: `You have ${MAX_SAMPLES} samples, the most a profile shows. Remove one to add another.`,
    };
  }
  // The first free place, so a removed sample's gap is filled.
  const taken = new Set(samples.map((s) => s.position));
  const position = [0, 1, 2, 3, 4, 5].find((p) => !taken.has(p)) ?? 0;

  const result = await processImage(
    new Uint8Array(await file.arrayBuffer()),
    "sample",
  );
  if (!result.ok) {
    return {
      status: "error",
      errors: { image: COVER_PROBLEMS[result.reason] },
    };
  }

  let sampleId: string | null = null;
  try {
    const created = await createSample(user.id, position, parsed.value);
    if (created === "taken") {
      return {
        status: "error",
        message:
          "Your samples changed in another tab. Reload the page and try again.",
      };
    }
    sampleId = created.id;
    await saveSampleImage(user.id, sampleId, 1, result.webp);
    await setSampleImageVersion(user.id, sampleId, 1);
  } catch (error) {
    logFailure("sample", error);
    // Don't leave a row without a picture behind.
    if (sampleId) await deleteSample(user.id, sampleId).catch(() => undefined);
    return { status: "error", message: SAVE_FAILED };
  }
  refresh();
  return { status: "success", message: "Sample added." };
}

export async function updateSampleAction(
  _previous: SampleState,
  form: FormData,
): Promise<SampleState> {
  const user = await requireRole("influencer");
  const sampleId = text(form, "sampleId");
  if (!isUuid(sampleId)) return { status: "error", message: SAVE_FAILED };
  const parsed = parseSampleForm(form);
  if (!parsed.ok) {
    return { status: "error", errors: parsed.errors, values: parsed.values };
  }
  try {
    await updateSample(user.id, sampleId, parsed.value);
  } catch (error) {
    logFailure("sample update", error);
    return { status: "error", message: SAVE_FAILED };
  }
  refresh();
  return { status: "success", message: "Saved." };
}

export async function removeSampleAction(form: FormData): Promise<void> {
  const user = await requireRole("influencer");
  const sampleId = text(form, "sampleId");
  if (!isUuid(sampleId)) return;
  const removed = await deleteSample(user.id, sampleId);
  if (removed?.imageVersion != null) {
    await deleteSampleImage(user.id, sampleId, removed.imageVersion).catch(
      (error) => logFailure("sample image delete", error),
    );
  }
  refresh();
}

/** Moves a sample one place earlier ("up") or later ("down"). */
export async function moveSampleAction(form: FormData): Promise<void> {
  const user = await requireRole("influencer");
  const sampleId = text(form, "sampleId");
  const direction = text(form, "direction");
  if (!isUuid(sampleId) || (direction !== "up" && direction !== "down")) return;
  const samples = await listOwnSamples(user.id);
  const index = samples.findIndex((s) => s.id === sampleId);
  const neighbour = samples[direction === "up" ? index - 1 : index + 1];
  if (index === -1 || !neighbour) return;
  await swapSamples(sampleId, neighbour.id);
  refresh();
}

function valuesOf(form: FormData): PlatformState["values"] {
  return {
    handle: text(form, "handle").trim(),
    followerRange: text(form, "followerRange"),
  };
}

function logFailure(what: string, error: unknown) {
  console.error(
    `profile: ${what} failed`,
    error instanceof Error ? error.message : error,
  );
}
