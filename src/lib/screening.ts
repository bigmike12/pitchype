// Sanctions and PEP screening, once per person at their first money event
// (design §5.6): a creator's first payout request, a business's first hire
// approval. Afterwards only an admin screens again.
//
// Invariants:
//   - While identity checks are switched off (identity_settings), nobody is
//     screened and Dojah is never called: the answer is "off" and no row is
//     written. Otherwise a screening is never skipped silently: every attempt
//     writes a `screenings` row, including when Dojah is down (status `error`).
//   - Someone already screened costs no second Dojah call; an admin's
//     "screen again" always runs.
//   - A business is screened by its CAC name when registered, otherwise by the
//     owner's verified name and date of birth. The names come from our own
//     verified record, never from the request.
//   - A creator or business is never told a match was found: the callers show
//     the same neutral waiting words (policy §5.3).
//   - Logs carry the error class and status only.
//
// No Supabase or fetch of its own: the database and Dojah come in through
// `deps`, so node tests pass fakes without a mocking framework.

import type { ScreeningResult } from "./dojah.ts";

export type ScreeningTrigger = "first_payout" | "first_hire" | "admin";
export type ScreeningStatus = "clear" | "possible_match" | "error";

export type ScreeningDeps = {
  checksRequired: () => Promise<boolean>;
  getState: (
    userId: string,
  ) => Promise<"none" | "clear" | "possible_match" | "error" | "confirmed">;
  getFacts: (userId: string) => Promise<{
    subject: "person" | "business";
    name: string;
    dateOfBirth: string | null;
  } | null>;
  screenPerson: (input: {
    name: string;
    dateOfBirth: string | null;
    reference: string;
  }) => Promise<ScreeningResult>;
  screenBusiness: (input: {
    name: string;
    reference: string;
  }) => Promise<ScreeningResult>;
  record: (input: {
    userId: string;
    subject: "person" | "business";
    trigger: ScreeningTrigger;
    status: ScreeningStatus;
    matchCount: number;
    providerReference: string | null;
  }) => Promise<string>;
  newReference: () => string;
};

// The real dependencies, in one place. The database module is imported lazily
// because it loads the Supabase clients, which node tests cannot.
async function realDeps(): Promise<ScreeningDeps> {
  const db = await import("./db/identity.ts");
  const dojah = await import("./dojah.ts");
  const { randomUUID } = await import("node:crypto");
  return {
    checksRequired: db.identityChecksRequired,
    getState: db.getScreeningState,
    getFacts: db.getScreeningFacts,
    screenPerson: dojah.screenPerson,
    screenBusiness: dojah.screenBusiness,
    record: db.recordScreening,
    newReference: () => `pit_sc_${randomUUID().replaceAll("-", "")}`,
  };
}

function describeError(error: unknown): string {
  const name = error instanceof Error ? error.name : "NonError";
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? `${name} ${status}` : name;
}

/**
 * Screens the person unless they already have a screening (an admin's
 * "screen again" always runs). Returns the new result, "already", or "off"
 * while identity checks are switched off.
 */
export async function ensureScreened(
  person: { id: string; role: "business" | "influencer" },
  trigger: ScreeningTrigger,
  deps?: ScreeningDeps,
): Promise<ScreeningStatus | "already" | "off"> {
  const d = deps ?? (await realDeps());
  if (!(await d.checksRequired())) return "off";
  if (trigger !== "admin" && (await d.getState(person.id)) !== "none") {
    return "already";
  }

  const facts = await d.getFacts(person.id);
  const subject =
    facts?.subject ?? (person.role === "business" ? "business" : "person");
  let status: ScreeningStatus = "error";
  let matchCount = 0;
  let providerReference: string | null = null;

  if (facts !== null) {
    const reference = d.newReference();
    try {
      const result =
        facts.subject === "business"
          ? await d.screenBusiness({ name: facts.name, reference })
          : await d.screenPerson({
              name: facts.name,
              dateOfBirth: facts.dateOfBirth,
              reference,
            });
      matchCount = result.matchCount;
      providerReference = result.providerReference ?? reference;
      status = matchCount > 0 ? "possible_match" : "clear";
    } catch (error) {
      // Dojah down, out of wallet, or a bad key: recorded as an error for an
      // admin to screen again. Never treated as clear.
      console.error("screening failed", describeError(error));
    }
  } else {
    console.error("screening skipped: no verified identity for the person");
  }

  await d.record({
    userId: person.id,
    subject,
    trigger,
    status,
    matchCount,
    providerReference,
  });
  return status;
}

/**
 * Before a business's first hire approval: screen if never screened, then say
 * whether the approval may go ahead. A possible or confirmed match holds it;
 * clear, an error and no screening proceed (payments stay protected by escrow
 * and payouts stay gated by admin approval).
 */
export async function screenBeforeHire(
  business: { id: string; role: "business" | "influencer" },
  deps?: ScreeningDeps,
): Promise<"proceed" | "hold"> {
  const d = deps ?? (await realDeps());
  const result = await ensureScreened(business, "first_hire", d);
  if (result === "off") return "proceed";
  if (result === "possible_match") return "hold";
  if (result !== "already") return "proceed";
  const state = await d.getState(business.id);
  return state === "possible_match" || state === "confirmed"
    ? "hold"
    : "proceed";
}
