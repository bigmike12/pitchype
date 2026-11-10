import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { connection } from "next/server";

import type { Database } from "@/types/database";

import { supabaseEnv } from "./env";

/**
 * Client that acts as an anonymous visitor and carries no session (the
 * public directory and campaign counts). The service-role key never belongs
 * here (CLAUDE.md §7).
 */
export function createAnonServerClient() {
  const { url, publishableKey } = supabaseEnv();
  return createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Client that acts as the signed-in person, from their session cookies, so
 * row level security applies to everything it does. Only lib/auth.ts and
 * lib/db/* should use it.
 */
export async function createSessionClient() {
  const { url, publishableKey } = supabaseEnv();
  const cookieStore = await cookies();
  // The auth client checks token expiry against the clock. Under Cache
  // Components a clock read during a prerender (even a per-session one) is an
  // error, so mark everything after this point as request-time only.
  await connection();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components can't write cookies. That's fine: proxy.ts
          // refreshes the session before any page that reads it renders.
        }
      },
    },
  });
}
