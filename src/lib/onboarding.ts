// Onboarding's steps, in order, for the progress bar and back links. The
// first screens (names, location) are one form shown a screen at a time, so
// their "back" is a button in the form, not a link. Creators can't go back
// past the niches step: by then their profile exists, and the first screens
// would create it again.

export type BusinessStep =
  "business-name" | "contact-name" | "location" | "done";

export type CreatorStep =
  "display-name" | "location" | "niches" | "platforms" | "photo" | "done";

export const BUSINESS_STEPS: readonly BusinessStep[] = [
  "business-name",
  "contact-name",
  "location",
  "done",
];

export const CREATOR_STEPS: readonly CreatorStep[] = [
  "display-name",
  "location",
  "niches",
  "platforms",
  "photo",
  "done",
];

const CREATOR_BACK: Partial<Record<CreatorStep, string>> = {
  platforms: "/onboarding/niches",
  photo: "/onboarding/platforms",
  done: "/onboarding/photo",
};

export function stepInfo(
  role: "business" | "influencer",
  step: BusinessStep | CreatorStep,
): { number: number; total: number; backHref: string | null } {
  const steps: readonly string[] =
    role === "business" ? BUSINESS_STEPS : CREATOR_STEPS;
  const index = steps.indexOf(step);
  if (index === -1) throw new Error(`no ${role} onboarding step "${step}"`);
  return {
    number: index + 1,
    total: steps.length,
    backHref:
      role === "influencer"
        ? (CREATOR_BACK[step as CreatorStep] ?? null)
        : null,
  };
}
