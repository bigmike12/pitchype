// Per-key rate limits, counted in the database so that every server instance
// shares one count (lib/db/rate-limits.ts, migration 20261118100200).
//
// Each limiter has a name, and the name is part of its key, so two limiters
// can count the same person (say, messages and applications) without sharing
// a count. Supabase Auth applies its own limits to login and signup emails;
// these add to them. The database constraints hold whatever happens here.

import { consumeRateLimitHit } from "@/lib/db/rate-limits";

export function createRateLimiter({
  name,
  maxAttempts,
  windowMs,
}: {
  name: string;
  maxAttempts: number;
  /** Whole seconds, at least one. */
  windowMs: number;
}) {
  const windowSeconds = Math.max(1, Math.round(windowMs / 1000));

  /** Records an attempt for `key` and reports whether it is over the limit. */
  return function isRateLimited(key: string): Promise<boolean> {
    return consumeRateLimitHit(`${name}:${key}`, maxAttempts, windowSeconds);
  };
}
