import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * Supabase client for server code that acts as an anonymous visitor (the
 * waitlist insert). It carries no user session; session-aware clients arrive
 * with auth in Stage 2. The service-role key never belongs here (CLAUDE.md §7).
 */
export function createAnonServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // The publishable key (sb_publishable_…) or a legacy anon key; both act as
  // the `anon` database role, so RLS decides what they can do.
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set. See .env.example.",
    );
  }
  return createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
