import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LoadingNotice } from "@/app/(portal)/loading-notice";
import { requireUser } from "@/lib/auth";
import { getProfile } from "@/lib/db/profiles";

import { ProfileSteps } from "./profile-steps";

export const metadata: Metadata = { title: "Set up your profile" };

export default function OnboardingPage() {
  return (
    <Suspense fallback={<LoadingNotice>Loading your account…</LoadingNotice>}>
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
