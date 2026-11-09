"use server";

import { redirect } from "next/navigation";

import { requireUser, signOut } from "@/lib/auth";
import { createProfile, updateProfile } from "@/lib/db/profiles";
import type { FormState } from "@/lib/form-data";
import { parseProfileForm, type ProfileField } from "@/lib/profile";

export type ProfileState = FormState<ProfileField>;

const SAVE_FAILED =
  "We couldn’t save your profile just now. Please try again in a minute.";

// Each action checks the session itself: never trust that the page did.

export async function createProfileAction(
  _previous: ProfileState,
  form: FormData,
): Promise<ProfileState> {
  const user = await requireUser();
  if (user.role === "admin") redirect("/account");

  const parsed = parseProfileForm(user.role, form);
  if (!parsed.ok) {
    return { status: "error", errors: parsed.errors, values: parsed.values };
  }

  try {
    // "exists" means a second tab got there first; either way, carry on.
    await createProfile(user.id, parsed.value);
  } catch (error) {
    console.error(
      "onboarding: profile insert failed",
      error instanceof Error ? error.message : error,
    );
    return { status: "error", message: SAVE_FAILED, values: valuesOf(form) };
  }
  // Creators carry on to the rest of their public profile.
  redirect(user.role === "influencer" ? "/profile" : "/account");
}

export async function updateProfileAction(
  _previous: ProfileState,
  form: FormData,
): Promise<ProfileState> {
  const user = await requireUser();
  if (user.role === "admin") redirect("/account");

  const parsed = parseProfileForm(user.role, form);
  if (!parsed.ok) {
    return { status: "error", errors: parsed.errors, values: parsed.values };
  }

  try {
    await updateProfile(user.id, parsed.value);
  } catch (error) {
    console.error(
      "account: profile update failed",
      error instanceof Error ? error.message : error,
    );
    return { status: "error", message: SAVE_FAILED, values: valuesOf(form) };
  }
  return {
    status: "success",
    message: "Saved.",
    values: valuesOf(form),
  };
}

export async function signOutAction(): Promise<void> {
  await signOut();
  redirect("/login");
}

function valuesOf(form: FormData): ProfileState["values"] {
  const fields: ProfileField[] = [
    "businessName",
    "contactName",
    "displayName",
    "state",
    "city",
  ];
  return Object.fromEntries(
    fields.map((field) => [field, String(form.get(field) ?? "").trim()]),
  );
}
