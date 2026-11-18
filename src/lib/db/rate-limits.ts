// Counts attempts for the rate limiters in lib/rate-limit.ts. The counting
// itself is consume_rate_limit() in the database, so every server instance
// shares one count (migration 20261118100200).

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Records one attempt under `key` and reports whether it is over the limit.
 * A blocked attempt is not recorded. Throws if the database cannot answer:
 * a limiter that can't count fails closed, so it never lets an attempt
 * through silently.
 */
export async function consumeRateLimitHit(
  key: string,
  maxAttempts: number,
  windowSeconds: number,
): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("consume_rate_limit", {
    p_key: key,
    p_max: maxAttempts,
    p_window_seconds: windowSeconds,
  });
  if (error) throw new Error(`rate limit check failed (${error.code})`);
  return data === true;
}
