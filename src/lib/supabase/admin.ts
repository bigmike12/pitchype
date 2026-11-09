import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { supabaseEnv } from "./env";

/**
 * Client with the secret key: it bypasses row level security. Used only for
 * what nobody may do through the API: writing profile photos (lib/storage.ts)
 * and recording which photo is current (lib/db/creators.ts). Every use takes
 * the user id from the session, never from the request. CLAUDE.md §7.
 */
export function createAdminClient() {
  const { url } = supabaseEnv();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "SUPABASE_SECRET_KEY must be set for photo uploads. See .env.example.",
    );
  }
  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
