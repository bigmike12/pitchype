"use server";

import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { saveMyEmailPreferences } from "@/lib/db/notification-emails";
import { createProfile, updateProfile } from "@/lib/db/profiles";
import type { FormState } from "@/lib/form-data";
import {
  parseEmailPreferences,
  type EmailPreferences,
} from "@/lib/notification-email";
import { parseProfileForm, type ProfileField } from "@/lib/profile";

export type ProfileState = FormState<ProfileField>;

// `values` is what the switches should show: the saved choices, or on a failed
// save the submitted ones, so a retry keeps what the person picked.
export type EmailPreferencesState = {
  status: "idle" | "error" | "success";
  message?: string;
  values?: EmailPreferences;
};

const SAVE_FAILED =
  "We couldn’t save your profile just now. Please try again in a minute.";

// Each action checks the session itself: never trust that the page did.

export async function createProfileAction(
  _previous: ProfileState,
  form: FormData,
): Promise<ProfileState> {
  const user = await requireUser();
  if (user.role === "admin") redirect("/home");

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
  // Both carry on through onboarding: creators to their niches, businesses
  // to the last step.
  redirect(
    user.role === "influencer" ? "/onboarding/niches" : "/onboarding/done",
  );
}

export async function updateProfileAction(
  _previous: ProfileState,
  form: FormData,
): Promise<ProfileState> {
  const user = await requireUser();
  if (user.role === "admin") redirect("/home");

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

export async function updateEmailPreferencesAction(
  _previous: EmailPreferencesState,
  form: FormData,
): Promise<EmailPreferencesState> {
  const user = await requireUser();
  // Admins have no bell and receive no notifications, so nothing to switch.
  if (user.role === "admin") redirect("/home");

  const preferences = parseEmailPreferences(form);
  try {
    await saveMyEmailPreferences(preferences);
  } catch (error) {
    console.error(
      "account: email preferences save failed",
      error instanceof Error ? error.message : error,
    );
    return {
      status: "error",
      message:
        "We couldn’t save your email settings just now. Please try again in a minute.",
      values: preferences,
    };
  }
  return { status: "success", message: "Saved.", values: preferences };
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
