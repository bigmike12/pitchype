import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { requireUser } from "@/lib/auth";
import { getProfile } from "@/lib/db/profiles";

import { createProfileAction } from "../actions";
import { LoadingNotice } from "../loading-notice";
import { ProfileForm } from "../profile-form";

export const metadata: Metadata = { title: "Set up your profile" };

export default function OnboardingPage() {
  return (
    <Suspense fallback={<LoadingNotice>Loading your account…</LoadingNotice>}>
      <Onboarding />
    </Suspense>
  );
}

async function Onboarding() {
  const user = await requireUser();
  if (user.role === "admin") redirect("/account");
  if (await getProfile(user)) redirect("/account");

  const isBusiness = user.role === "business";
  return (
    <>
      <h1 className="text-display-lg">
        {isBusiness
          ? "Tell us about your business"
          : "Set up your creator profile"}
      </h1>
      <p className="mt-3 mb-8 max-w-xl text-lg">
        {isBusiness
          ? "Creators see this when you invite them or they apply to your campaigns."
          : "Businesses see this when you apply to their campaigns. You can add your platforms and audience later."}
      </p>
      <ProfileForm
        role={user.role}
        action={createProfileAction}
        submitLabel="Save and continue"
        pendingLabel="Saving…"
      />
    </>
  );
}
