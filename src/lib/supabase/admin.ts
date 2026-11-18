import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { supabaseEnv } from "./env";

/**
 * Client with the secret key: it bypasses row level security. Used only for
 * what nobody may do through the API: writing profile photos and proof
 * screenshots (lib/storage.ts, lib/db/proof-files.ts), recording which photo
 * is current (lib/db/creators.ts), counting rate-limit attempts, including
 * for people who are not signed in (lib/db/rate-limits.ts), and the daily
 * jobs that lapse unpaid approvals and release overdue reviews
 * (lib/db/applications.ts, lib/db/submissions.ts, which act on no one
 * person's behalf). Every other use takes the user id from the session,
 * never from the request. CLAUDE.md §7.
 */
export function createAdminClient() {
  const { url } = supabaseEnv();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "SUPABASE_SECRET_KEY must be set for photo uploads and scheduled jobs. See .env.example.",
    );
  }
  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
