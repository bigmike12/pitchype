"use client";

import { createBrowserClient as createClient } from "@supabase/ssr";

import type { Database } from "@/types/database";

/**
 * Client for the browser, acting as the signed-in person from their session
 * cookies (publishable key only). Used only to subscribe to new messages over
 * Supabase Realtime; row level security decides what arrives. Everything
 * else goes through the server (lib/db).
 */
export function createBrowserClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  );
}
