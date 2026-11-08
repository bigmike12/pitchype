// Per-key (usually per-IP) rate limits, kept in this server instance's memory.
//
// Limits of this approach: on Vercel every serverless instance has its own
// memory, instances start and stop freely, and a restart clears the counts.
// So it slows down a single noisy client; it is not a real quota. Supabase
// Auth applies its own limits too, and the database constraints hold whatever
// happens here. Move to a shared store if abuse shows up.

export function createRateLimiter({
  maxAttempts,
  windowMs,
}: {
  maxAttempts: number;
  windowMs: number;
}) {
  const attemptsByKey = new Map<string, number[]>();

  /** Records an attempt for `key` and reports whether it is over the limit. */
  return function isRateLimited(key: string, now = Date.now()): boolean {
    const windowStart = now - windowMs;
    const recent = (attemptsByKey.get(key) ?? []).filter(
      (at) => at > windowStart,
    );
    const limited = recent.length >= maxAttempts;
    if (!limited) recent.push(now);
    attemptsByKey.set(key, recent);

    // Drop idle keys now and then so the map can't grow without bound.
    if (attemptsByKey.size > 10_000) {
      for (const [k, times] of attemptsByKey) {
        if (times.every((at) => at <= windowStart)) attemptsByKey.delete(k);
      }
    }
    return limited;
  };
}
