// Rate limits for the creator's bank account, payout requests, submissions,
// disputes and dispute statements (CLAUDE.md §7). Kept apart from the Server
// Actions so the numbers can be tested. In-memory per instance, like every
// limiter here (see rate-limit.ts).

import { createRateLimiter } from "./rate-limit.ts";

/**
 * One limiter for checking and saving a bank account: both call Paystack's
 * account lookup, which would otherwise tell anyone whose account an
 * account number is, and uses up our Paystack quota.
 */
export const isBankCheckLimited = createRateLimiter({
  name: "bank-check",
  maxAttempts: 10,
  windowMs: 60 * 60 * 1000,
});

export const isPayoutLimited = createRateLimiter({
  name: "payout",
  maxAttempts: 5,
  windowMs: 10 * 60 * 1000,
});

/**
 * Sending in work: each submit uploads and processes pictures. Ten an hour
 * leaves room for a few honest mistakes and four rounds on several jobs.
 */
export const isSubmitLimited = createRateLimiter({
  name: "submit",
  maxAttempts: 10,
  windowMs: 60 * 60 * 1000,
});

/** Opening disputes: each one asks an admin to look, so it is kept rare. */
export const isDisputeOpenLimited = createRateLimiter({
  name: "dispute-open",
  maxAttempts: 5,
  windowMs: 24 * 60 * 60 * 1000,
});

/** Dispute statements: each one can carry pictures, and both sides write often while it is open. */
export const isStatementLimited = createRateLimiter({
  name: "statement",
  maxAttempts: 30,
  windowMs: 60 * 60 * 1000,
});

export const BANK_CHECK_LIMITED_MESSAGE =
  "That’s a lot of checks. Wait a while, then try again.";

export const PAYOUT_LIMITED_MESSAGE =
  "That’s a lot of payout requests. Wait a few minutes, then try again.";

export const SUBMIT_LIMITED_MESSAGE =
  "That’s a lot of submissions. Wait a while, then try again.";

export const DISPUTE_OPEN_LIMITED_MESSAGE =
  "You’ve opened several disputes today. Try again tomorrow.";

export const STATEMENT_LIMITED_MESSAGE =
  "That’s a lot of statements. Wait a while, then try again.";
