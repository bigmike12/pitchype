import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { requireUser } from "@/lib/auth";
import { getProfile } from "@/lib/db/profiles";

import { ProfileSteps } from "./profile-steps";
import { OnboardingStepSkeleton } from "./onboarding-step";

export const metadata: Metadata = { title: "Set up your profile" };

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={<OnboardingStepSkeleton label="Loading your account…" />}
    >
      <Onboarding />
    </Suspense>
  );
}

// The first questions create the profile. Anyone who already has one (or is
// an admin) goes home: going "back" here would try to create it again.
async function Onboarding() {
  const user = await requireUser();
  if (user.role === "admin") redirect("/home");
  if (await getProfile(user)) redirect("/home");
  return <ProfileSteps role={user.role} />;
}
