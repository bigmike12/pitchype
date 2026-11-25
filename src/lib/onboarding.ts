// Onboarding's steps, in order, for the progress bar and back links. The
// first screens (names, location) are one form shown a screen at a time, so
// their "back" is a button in the form, not a link. Creators can't go back
// past the niches step: by then their profile exists, and the first screens
// would create it again. The identity step is in the flow only while identity
// checks are switched on (identity_settings).

export type BusinessStep =
  "business-name" | "contact-name" | "location" | "identity" | "done";

export type CreatorStep =
  | "display-name"
  | "location"
  | "niches"
  | "platforms"
  | "photo"
  | "identity"
  | "done";

export const BUSINESS_STEPS: readonly BusinessStep[] = [
  "business-name",
  "contact-name",
  "location",
  "identity",
  "done",
];

export const CREATOR_STEPS: readonly CreatorStep[] = [
  "display-name",
  "location",
  "niches",
  "platforms",
  "photo",
  "identity",
  "done",
];

const CREATOR_BACK: Partial<Record<CreatorStep, string>> = {
  platforms: "/onboarding/niches",
  photo: "/onboarding/platforms",
  identity: "/onboarding/photo",
  done: "/onboarding/identity",
};

/** Where onboarding goes after the step before identity: identity, or straight to done. */
export function afterProfileSteps(withIdentity: boolean): string {
  return withIdentity ? "/onboarding/identity" : "/onboarding/done";
}

export function stepInfo(
  role: "business" | "influencer",
  step: BusinessStep | CreatorStep,
  withIdentity: boolean,
): { number: number; total: number; backHref: string | null } {
  const all: readonly string[] =
    role === "business" ? BUSINESS_STEPS : CREATOR_STEPS;
  const steps = withIdentity ? all : all.filter((s) => s !== "identity");
  const index = steps.indexOf(step);
  if (index === -1) throw new Error(`no ${role} onboarding step "${step}"`);
  let backHref =
    role === "influencer" ? (CREATOR_BACK[step as CreatorStep] ?? null) : null;
  // Without the identity step, a creator's done step comes after the photo.
  if (role === "influencer" && step === "done" && !withIdentity) {
    backHref = "/onboarding/photo";
  }
  return { number: index + 1, total: steps.length, backHref };
}
