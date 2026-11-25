// What the admin identity page lists from the screenings table: the people
// whose latest screening is a possible match or an error (these block payouts
// and, for a match, a first hire), and those with a confirmed match (listed
// apart, for the standing tools). Pure, so it can be tested.

import type { ScreeningState } from "./db/identity.ts";

export type ScreeningRow = {
  id: string;
  userId: string;
  subject: "person" | "business";
  trigger: "first_payout" | "first_hire" | "admin";
  status: "clear" | "possible_match" | "error";
  matchCount: number;
  reviewOutcome: "cleared" | "confirmed" | null;
  createdAt: string;
};

/**
 * `rows` are recent screenings that were not clear, any order; `stateOf` is
 * each person's current state (the database's screening_state, which looks at
 * their newest row of all). A person is listed only through their newest row
 * here and only while it is still what decides their state.
 */
export function screeningQueues(
  rows: ScreeningRow[],
  stateOf: (userId: string) => ScreeningState,
): { attention: ScreeningRow[]; confirmed: ScreeningRow[] } {
  const newest = new Map<string, ScreeningRow>();
  for (const r of [...rows].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )) {
    if (!newest.has(r.userId)) newest.set(r.userId, r);
  }
  const attention: ScreeningRow[] = [];
  const confirmed: ScreeningRow[] = [];
  for (const r of newest.values()) {
    const state = stateOf(r.userId);
    if (
      (state === "possible_match" || state === "error") &&
      r.status === state &&
      r.reviewOutcome === null
    ) {
      attention.push(r);
    } else if (state === "confirmed" && r.reviewOutcome === "confirmed") {
      confirmed.push(r);
    }
  }
  return { attention, confirmed };
}
