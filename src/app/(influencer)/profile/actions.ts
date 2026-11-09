"use server";

import { refresh } from "next/cache";

import { requireRole } from "@/lib/auth";
import {
  isPlatform,
  parseAboutForm,
  parsePlatformForm,
  publishProblems,
  type AboutField,
  type PlatformField,
} from "@/lib/creator-profile";
import {
  getOwnCreatorProfile,
  listNiches,
  removePlatform,
  savePlatform,
  setCreatorIndexing,
  setCreatorPublished,
  setPhotoVersion,
  updateCreatorAbout,
} from "@/lib/db/creators";
import { requestVerification, submitVerification } from "@/lib/db/verification";
import { text, type FormState } from "@/lib/form-data";
import { processProfilePhoto } from "@/lib/profile-photo";
import { createRateLimiter } from "@/lib/rate-limit";
import { deleteProfilePhoto, saveProfilePhoto } from "@/lib/storage";

export type AboutState = FormState<AboutField>;
export type PlatformState = FormState<PlatformField>;
export type PhotoState = FormState<"photo">;

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
  maxAttempts: 10,
  windowMs: 60 * 60 * 1000,
});

export async function requestVerificationAction(form: FormData): Promise<void> {
  const user = await requireRole("influencer");
  const platform = text(form, "platform");
  if (!isPlatform(platform) || isVerificationRateLimited(user.id)) return;
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

const isUploadRateLimited = createRateLimiter({
  maxAttempts: 10,
  windowMs: 10 * 60 * 1000,
});

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
  if (isUploadRateLimited(user.id)) {
    return {
      status: "error",
      errors: {
        photo: "That’s a lot of uploads. Wait a few minutes, then try again.",
      },
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
    const next = (previous ?? 0) + 1;

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
