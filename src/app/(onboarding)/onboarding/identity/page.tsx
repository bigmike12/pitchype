import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import {
  IdentityPanel,
  OnboardingIdentityActions,
  loadIdentityPanel,
} from "@/components/identity/identity-panel";
import { requireUser } from "@/lib/auth";
import { identityChecksRequired } from "@/lib/db/identity";
import { getProfile } from "@/lib/db/profiles";

import { OnboardingStep, OnboardingStepSkeleton } from "../onboarding-step";

export const metadata: Metadata = { title: "Confirm it’s you" };

export default function IdentityPage() {
  return (
    <Suspense fallback={<OnboardingStepSkeleton label="Loading…" />}>
      <Identity />
    </Suspense>
  );
}

// Skippable: "Do this later" goes on to the last step, and the same check can
// be done any time from the account page. Not part of onboarding while
// identity checks are switched off.
async function Identity() {
  const user = await requireUser();
  if (user.role === "admin") redirect("/home");
  if (!(await getProfile(user))) redirect("/onboarding");
  if (!(await identityChecksRequired())) redirect("/onboarding/done");

  const data = await loadIdentityPanel(user.id, user.role);
  return (
    <OnboardingStep role={user.role} step="identity" withIdentity>
      <IdentityPanel data={data} next="onboarding" />
      <OnboardingIdentityActions state={data.state} />
    </OnboardingStep>
  );
}
