// Account standing as people see it: the state of their account and the
// warning when a message is held back. The rules themselves (escalation,
// voiding, the log) live in supabase/migrations/20261110100000_create_moderation.sql.
// No framework imports, so it can be unit-tested.

export const RESTRICT_DAYS = 3;

export type Standing = {
  activeStrikes: number;
  restrictedUntil: string | null;
  suspendedAt: string | null;
};

export type StandingState = "clear" | "warned" | "paused" | "suspended";

export function standingView(
  standing: Standing,
  now: Date,
): { state: StandingState; until: string | null } {
  if (standing.suspendedAt) return { state: "suspended", until: null };
  if (
    standing.restrictedUntil &&
    Date.parse(standing.restrictedUntil) > now.getTime()
  ) {
    return { state: "paused", until: standing.restrictedUntil };
  }
  if (standing.activeStrikes > 0) return { state: "warned", until: null };
  return { state: "clear", until: null };
}

const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");

/** What the sender sees when a message with contact details is held back. */
export function flagMessage(flag: string, strikes: number): string {
  const found = `This looks like ${article(flag)} ${flag}, so we didn’t send it. Deals that move off Pitchype lose payment protection.`;
  if (strikes >= 3) {
    return `${found} This is strike ${strikes}: your account is suspended until we review it.`;
  }
  if (strikes === 2) {
    return `${found} Strike 2 of 3: messaging and new activity are paused for ${RESTRICT_DAYS} days.`;
  }
  return `${found} This is a warning (strike 1 of 3).`;
}
