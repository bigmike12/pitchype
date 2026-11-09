import { Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LoadingNotice } from "@/app/(portal)/loading-notice";
import { ActionCard } from "@/components/ui/action-card";
import { requireUser } from "@/lib/auth";
import { getProfile } from "@/lib/db/profiles";

import { OnboardingStep } from "../onboarding-step";

export const metadata: Metadata = { title: "You’re all set" };

export default function DonePage() {
  return (
    <Suspense fallback={<LoadingNotice>Loading…</LoadingNotice>}>
      <Done />
    </Suspense>
  );
}

async function Done() {
  const user = await requireUser();
  if (user.role === "admin") redirect("/home");
  const profile = await getProfile(user);
  if (!profile) redirect("/onboarding");
  if (profile.role !== "business") redirect("/home");

  const firstName = profile.contactName.trim().split(/\s+/)[0] ?? "";
  return (
    <OnboardingStep role="business" step="done" firstName={firstName}>
      <div className="grid gap-4 sm:grid-cols-2">
        <ActionCard
          href="/business/campaigns/new"
          icon={Plus}
          tone="sun"
          title="Post your first campaign"
        >
          Say what to post and who can apply.
        </ActionCard>
        <ActionCard
          href="/business/creators"
          icon={Search}
          tone="lilac"
          title="Find creators"
        >
          Browse by niche, platform, state and rate.
        </ActionCard>
      </div>
      <Link href="/home" className="link mt-8 inline-block">
        Go to your home
      </Link>
    </OnboardingStep>
  );
}
