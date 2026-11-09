import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LoadingNotice } from "@/app/(portal)/loading-notice";
import { requireRole } from "@/lib/auth";
import { getOwnCreatorProfile, listNiches } from "@/lib/db/creators";

import { OnboardingStep } from "../onboarding-step";
import { NichesForm } from "./niches-form";

export const metadata: Metadata = { title: "What do you post about?" };

export default function NichesPage() {
  return (
    <Suspense fallback={<LoadingNotice>Loading…</LoadingNotice>}>
      <Niches />
    </Suspense>
  );
}

async function Niches() {
  const user = await requireRole("influencer");
  const [profile, niches] = await Promise.all([
    getOwnCreatorProfile(user.id),
    listNiches(),
  ]);
  if (!profile) redirect("/onboarding");

  return (
    <OnboardingStep role="influencer" step="niches">
      <NichesForm niches={niches} initial={profile.niches} />
    </OnboardingStep>
  );
}
