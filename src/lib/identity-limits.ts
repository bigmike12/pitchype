// Rate limit for starting an identity check (CLAUDE.md §7). Each start can
// cost a provider call, so it is kept to a few an hour per person; the
// database's attempt cap (identity_attempt_state) is the stronger limit.

import { createRateLimiter } from "./rate-limit.ts";

export const isIdentityStartLimited = createRateLimiter({
  name: "identity-start",
  maxAttempts: 5,
  windowMs: 60 * 60 * 1000,
});

export const IDENTITY_LIMITED_MESSAGE =
  "That’s a lot of tries. Wait a while, then try again.";
