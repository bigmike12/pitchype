import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PlatformCard } from "@/app/(portal)/(influencer)/profile/platform-card";
import { LoadingNotice } from "@/app/(portal)/loading-notice";
import { requireRole } from "@/lib/auth";
import { PLATFORMS, verificationView } from "@/lib/creator-profile";
import { getOwnCreatorProfile } from "@/lib/db/creators";
import { listOwnVerificationRequests } from "@/lib/db/verification";

import { OnboardingStep, StepActions, continueClass } from "../onboarding-step";

export const metadata: Metadata = { title: "Where do you post?" };

export default function PlatformsPage() {
  return (
    <Suspense fallback={<LoadingNotice>Loading…</LoadingNotice>}>
      <Platforms />
    </Suspense>
  );
}

// Each card saves on its own and refreshes this page, so Continue appears
// as soon as one platform is saved.
async function Platforms() {
  const user = await requireRole("influencer");
  const [profile, requests] = await Promise.all([
    getOwnCreatorProfile(user.id),
    listOwnVerificationRequests(user.id),
  ]);
  if (!profile) redirect("/onboarding");
  const now = new Date();
  const hasPlatform = profile.platforms.length > 0;

  return (
    <OnboardingStep role="influencer" step="platforms">
      <ul className="space-y-4">
        {PLATFORMS.map((platform) => {
          const saved =
            profile.platforms.find((p) => p.platform === platform) ?? null;
          return (
            <PlatformCard
              key={platform}
              platform={platform}
              saved={saved}
              verification={
                saved
                  ? verificationView(requests, platform, saved.handle, now)
                  : null
              }
              showVerification={false}
            />
          );
        })}
      </ul>
      <StepActions>
        {hasPlatform ? (
          <Link href="/onboarding/photo" className={continueClass}>
            Continue
          </Link>
        ) : (
          <button
            type="button"
            disabled
            aria-describedby="platforms-needed"
            className={continueClass}
          >
            Continue
          </button>
        )}
      </StepActions>
      {!hasPlatform && (
        <p id="platforms-needed" className="mt-3 text-sm text-muted">
          Add at least one platform to continue.
        </p>
      )}
    </OnboardingStep>
  );
}
