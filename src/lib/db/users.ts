// Data access for app users. Runs as the signed-in person, so row level
// security limits every query to their own row. See docs/PROVIDERS.md.

import type { SignupRole } from "@/lib/credentials";
import { createSessionClient } from "@/lib/supabase/server";

export type UserRole = SignupRole | "admin";

export type AppUser = {
  id: string;
  email: string;
  role: UserRole;
};

export async function getUserByAuthId(
  authUserId: string,
): Promise<AppUser | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, email, role")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw new Error(`users lookup failed (${error.code})`);
  return data;
}

/**
 * Creates the signed-in person's app user if it doesn't exist yet. The
 * database takes identity and email from the session and keeps an existing
 * role, so this is safe to call on every sign-in.
 */
export async function ensureUserForSession(role: SignupRole): Promise<void> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("create_app_user", {
    requested_role: role,
  });
  if (error) throw new Error(`create_app_user failed (${error.code})`);
}
