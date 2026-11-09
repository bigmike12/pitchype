// Onboarding profiles: what each role fills in, and the rules for it.

import { text, type FieldErrors, type Parsed } from "./form-data.ts";

// Nigeria's 36 states and the FCT, as stored. Keep in step with the
// `nigerian_state` domain in
// supabase/migrations/20261108231856_create_users_and_profiles.sql.
export const NIGERIAN_STATES = [
  "Abia",
  "Adamawa",
  "Akwa Ibom",
  "Anambra",
  "Bauchi",
  "Bayelsa",
  "Benue",
  "Borno",
  "Cross River",
  "Delta",
  "Ebonyi",
  "Edo",
  "Ekiti",
  "Enugu",
  "FCT",
  "Gombe",
  "Imo",
  "Jigawa",
  "Kaduna",
  "Kano",
  "Katsina",
  "Kebbi",
  "Kogi",
  "Kwara",
  "Lagos",
  "Nasarawa",
  "Niger",
  "Ogun",
  "Ondo",
  "Osun",
  "Oyo",
  "Plateau",
  "Rivers",
  "Sokoto",
  "Taraba",
  "Yobe",
  "Zamfara",
] as const;

export type NigerianState = (typeof NIGERIAN_STATES)[number];

/** How a state is shown: people in Abuja look for "Abuja", not "FCT". */
export function stateLabel(state: NigerianState): string {
  return state === "FCT" ? "FCT (Abuja)" : state;
}

export function isNigerianState(value: string): value is NigerianState {
  return (NIGERIAN_STATES as readonly string[]).includes(value);
}

export type BusinessProfile = {
  role: "business";
  businessName: string;
  contactName: string;
  state: NigerianState;
  city: string;
};

export type InfluencerProfile = {
  role: "influencer";
  displayName: string;
  state: NigerianState;
  city: string;
};

export type Profile = BusinessProfile | InfluencerProfile;

export type ProfileField =
  "businessName" | "contactName" | "displayName" | "state" | "city";

// Same limits as the check constraints in the migration.
function lengthProblem(
  value: string,
  max: number,
  empty: string,
): string | null {
  if (value === "") return empty;
  if (value.length < 2) return "Use at least 2 characters.";
  if (value.length > max) return `Use ${max} characters or fewer.`;
  return null;
}

/** Collapses runs of spaces so "Lagos   Island" is stored as "Lagos Island". */
const tidy = (raw: string) => raw.trim().replace(/\s+/g, " ");

export function parseProfileForm(
  role: Profile["role"],
  form: FormData,
): Parsed<Profile, ProfileField> {
  const state = text(form, "state");
  const city = tidy(text(form, "city"));
  const errors: FieldErrors<ProfileField> = {};

  if (!isNigerianState(state)) errors.state = "Choose your state.";
  const cityError = lengthProblem(city, 60, "Enter your town or city.");
  if (cityError) errors.city = cityError;

  if (role === "business") {
    const businessName = tidy(text(form, "businessName"));
    const contactName = tidy(text(form, "contactName"));
    const nameError = lengthProblem(
      businessName,
      100,
      "Enter your business name.",
    );
    if (nameError) errors.businessName = nameError;
    const contactError = lengthProblem(contactName, 100, "Enter your name.");
    if (contactError) errors.contactName = contactError;

    if (Object.keys(errors).length > 0 || !isNigerianState(state)) {
      return {
        ok: false,
        errors,
        values: { businessName, contactName, state, city },
      };
    }
    return {
      ok: true,
      value: { role, businessName, contactName, state, city },
    };
  }

  const displayName = tidy(text(form, "displayName"));
  const nameError = lengthProblem(
    displayName,
    60,
    "Enter the name people know you by.",
  );
  if (nameError) errors.displayName = nameError;

  if (Object.keys(errors).length > 0 || !isNigerianState(state)) {
    return { ok: false, errors, values: { displayName, state, city } };
  }
  return { ok: true, value: { role, displayName, state, city } };
}
