// Data access for onboarding profiles. Runs as the signed-in person; row
// level security only lets them reach the profile that matches their role.

import type { Profile } from "@/lib/profile";
import { createSessionClient } from "@/lib/supabase/server";

import type { AppUser } from "./users";

/** Postgres unique_violation: the profile already exists. */
const UNIQUE_VIOLATION = "23505";

export async function getProfile(user: AppUser): Promise<Profile | null> {
  const supabase = await createSessionClient();

  if (user.role === "business") {
    const { data, error } = await supabase
      .from("business_profiles")
      .select("business_name, contact_name, state, city")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error)
      throw new Error(`business profile lookup failed (${error.code})`);
    return data
      ? {
          role: "business",
          businessName: data.business_name,
          contactName: data.contact_name,
          state: data.state as Profile["state"],
          city: data.city,
        }
      : null;
  }

  if (user.role === "influencer") {
    const { data, error } = await supabase
      .from("influencer_profiles")
      .select("display_name, state, city")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw new Error(`creator profile lookup failed (${error.code})`);
    return data
      ? {
          role: "influencer",
          displayName: data.display_name,
          state: data.state as Profile["state"],
          city: data.city,
        }
      : null;
  }

  // Admins have no onboarding profile.
  return null;
}

/** Creates the profile during onboarding. "exists" if it was already there. */
export async function createProfile(
  userId: string,
  profile: Profile,
): Promise<"created" | "exists"> {
  const supabase = await createSessionClient();
  const { error } =
    profile.role === "business"
      ? await supabase.from("business_profiles").insert({
          user_id: userId,
          business_name: profile.businessName,
          contact_name: profile.contactName,
          state: profile.state,
          city: profile.city,
        })
      : await supabase.from("influencer_profiles").insert({
          user_id: userId,
          display_name: profile.displayName,
          state: profile.state,
          city: profile.city,
        });

  if (!error) return "created";
  if (error.code === UNIQUE_VIOLATION) return "exists";
  throw new Error(`profile insert failed (${error.code})`);
}

export async function updateProfile(
  userId: string,
  profile: Profile,
): Promise<void> {
  const supabase = await createSessionClient();
  const { error } =
    profile.role === "business"
      ? await supabase
          .from("business_profiles")
          .update({
            business_name: profile.businessName,
            contact_name: profile.contactName,
            state: profile.state,
            city: profile.city,
          })
          .eq("user_id", userId)
      : await supabase
          .from("influencer_profiles")
          .update({
            display_name: profile.displayName,
            state: profile.state,
            city: profile.city,
          })
          .eq("user_id", userId);

  if (error) throw new Error(`profile update failed (${error.code})`);
}
