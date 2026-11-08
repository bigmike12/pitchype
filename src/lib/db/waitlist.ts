// Data access for the waitlist. Like every file in lib/db, this is the only
// code that knows how its tables are reached (today: Supabase's API with the
// publishable key). Callers get plain results, so moving to a direct Postgres
// client later changes this file and nothing else. See docs/PROVIDERS.md.

import type { WaitlistRole } from "@/components/landing/waitlist-input";
import { createAnonServerClient } from "@/lib/supabase/server";

export type WaitlistSignup = {
  email: string;
  role: WaitlistRole;
  source: string;
};

/** Postgres unique_violation: the email (in any case) is already on the list. */
const UNIQUE_VIOLATION = "23505";

/**
 * Stores a signup. Resolves to "added" or "already_on_list", and throws on
 * anything else so the caller decides what the visitor sees.
 */
export async function addToWaitlist(
  signup: WaitlistSignup,
): Promise<"added" | "already_on_list"> {
  const supabase = createAnonServerClient();
  const { error } = await supabase.from("waitlist").insert(signup);

  if (!error) return "added";
  if (error.code === UNIQUE_VIOLATION) return "already_on_list";
  // Code and message only: Postgres puts row values in `details`, which we drop.
  throw new Error(`waitlist insert failed (${error.code}): ${error.message}`);
}
