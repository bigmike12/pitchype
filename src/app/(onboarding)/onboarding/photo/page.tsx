import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PhotoForm } from "@/app/(portal)/(influencer)/profile/photo-form";
import { buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { getOwnCreatorProfile } from "@/lib/db/creators";
import { identityChecksRequired } from "@/lib/db/identity";
import { afterProfileSteps } from "@/lib/onboarding";

import {
  OnboardingStep,
  StepActions,
  continueClass,
  OnboardingStepSkeleton,
} from "../onboarding-step";

export const metadata: Metadata = { title: "Add a photo" };

export default function PhotoPage() {
  return (
    <Suspense fallback={<OnboardingStepSkeleton label="Loading…" />}>
      <Photo />
    </Suspense>
  );
}

async function Photo() {
  const user = await requireRole("influencer");
  const profile = await getOwnCreatorProfile(user.id);
  if (!profile) redirect("/onboarding");
  const withIdentity = await identityChecksRequired();

  return (
    <OnboardingStep role="influencer" step="photo" withIdentity={withIdentity}>
      <PhotoForm name={profile.displayName} photoUrl={profile.photoUrl} />
      <StepActions>
        <Link
          href={afterProfileSteps(withIdentity)}
          className={
            profile.photoUrl
              ? continueClass
              : buttonVariants({
                  variant: "secondary",
                  size: "lg",
                  className: "w-full sm:w-auto",
                })
          }
        >
          {profile.photoUrl ? "Continue" : "Skip for now"}
        </Link>
      </StepActions>
    </OnboardingStep>
  );
}
