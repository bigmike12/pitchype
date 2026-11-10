"use server";

import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { parseNiches, publishProblems } from "@/lib/creator-profile";
import {
  getOwnCreatorProfile,
  listNiches,
  setCreatorNiches,
  setCreatorPublished,
} from "@/lib/db/creators";
import type { FormState } from "@/lib/form-data";

export type NichesState = FormState<"niches">;

const SAVE_FAILED =
  "We couldn’t save that just now. Please try again in a minute.";

// Creator onboarding. Each action checks the session and role itself and
// only touches the signed-in creator's own row.

export async function saveNichesAction(
  _previous: NichesState,
  form: FormData,
): Promise<NichesState> {
  const user = await requireRole("influencer");
  const niches = await listNiches();
  const parsed = parseNiches(
    form,
    niches.map((n) => n.slug),
  );
  if (!parsed.ok) {
    return {
      status: "error",
      errors: { niches: parsed.error },
      values: { niches: parsed.chosen.join(",") },
    };
  }

  try {
    await setCreatorNiches(user.id, parsed.niches);
  } catch (error) {
    console.error(
      "onboarding: niches update failed",
      error instanceof Error ? error.message : error,
    );
    return {
      status: "error",
      message: SAVE_FAILED,
      values: { niches: parsed.niches.join(",") },
    };
  }
  redirect("/onboarding/platforms");
}

/**
 * The done step's Publish button. Checks the publishing rules again on fresh
 * data: if something is missing, back to the done step, which lists it.
 */
export async function publishFromOnboardingAction(): Promise<void> {
  const user = await requireRole("influencer");
  const profile = await getOwnCreatorProfile(user.id);
  if (
    !profile ||
    publishProblems({
      niches: profile.niches,
      platformCount: profile.platforms.length,
    }).length > 0
  ) {
    redirect("/onboarding/done");
  }
  await setCreatorPublished(user.id, true);
  redirect("/home");
}
