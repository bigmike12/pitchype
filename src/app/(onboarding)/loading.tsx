import { OnboardingStepSkeleton } from "./onboarding/onboarding-step";

// A safety net for onboarding pages that suspend before their own boundary.
export default function Loading() {
  return <OnboardingStepSkeleton label="Loading…" />;
}
