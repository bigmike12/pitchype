// Applications: the apply form's rules and the words for each refusal the
// database can give. No framework imports, so it can be unit-tested. The
// rules that protect places, prices and standing live in
// supabase/migrations/20261110100100_create_applications.sql.

import {
  MIN_CPC_NAIRA,
  fittingRatesNear,
  parsePrice,
  type PaymentModel,
} from "./campaign.ts";
import { findContactDetails } from "./contact-details.ts";
import { text, type FieldErrors, type Parsed } from "./form-data.ts";
import { formatNaira, KOBO_PER_NAIRA } from "./money.ts";

export const MAX_NOTE_LENGTH = 500;

/**
 * Whether an approved application's hire ended without ever being paid for
 * (it lapsed, or the business cancelled before payment). Then the place is open
 * again: the creator can apply again and the business can hire them again or
 * pass. A live, paid or finished hire, and any other application state, stay
 * as they are. The database applies the same rule (`hire_ended_unpaid` in
 * supabase/migrations/20261114100100_rehire_after_lapse.sql).
 */
export function hireEndedUnpaid(application: {
  status: string;
  engagement: { status: string; fundedAt: string | null } | null;
}): boolean {
  return (
    application.status === "approved" &&
    application.engagement?.status === "cancelled" &&
    application.engagement.fundedAt === null
  );
}

export type ApplicationField = "price" | "rate" | "note";

export type ApplicationInput = {
  /** Null: the creator accepts the campaign price. Fixed-price campaigns only. */
  proposedPriceKobo: number | null;
  /** Null: the creator accepts the campaign's price per click. Per-click campaigns only. */
  proposedCpcKobo: number | null;
  note: string | null;
};

/**
 * A creator's own price per click: whole naira, at least the minimum, and one
 * that fits the budget in whole clicks (the rule the campaign's own rate
 * follows). The database checks the same; this says what to try instead.
 */
export function parseProposedRate(
  raw: string,
  budgetKobo: number,
): { kobo: number } | { error: string } {
  const cleaned = raw.replace(/[₦,\s]/g, "");
  if (!/^\d+$/.test(cleaned)) {
    return { error: "Enter a whole number of naira, like 100." };
  }
  const naira = Number(cleaned);
  if (naira < MIN_CPC_NAIRA) {
    return {
      error: `The lowest price per click is ${formatNaira(MIN_CPC_NAIRA * KOBO_PER_NAIRA)}.`,
    };
  }
  const kobo = naira * KOBO_PER_NAIRA;
  if (!Number.isSafeInteger(kobo) || budgetKobo % kobo !== 0) {
    const near = fittingRatesNear(
      budgetKobo,
      Number.isSafeInteger(kobo) ? kobo : budgetKobo,
    );
    const tries = [near.below, near.above]
      .filter((rate): rate is number => rate !== null && rate !== kobo)
      .map((rate) => formatNaira(rate));
    return {
      error: `Your rate has to fit the ${formatNaira(budgetKobo)} budget in whole clicks.${tries.length > 0 ? ` Try ${tries.join(" or ")}.` : ""}`,
    };
  }
  return { kobo };
}

export function parseApplicationForm(
  form: FormData,
  campaignPriceKobo: number,
  paymentModel: PaymentModel = "fixed",
  campaignCpcKobo: number | null = null,
): Parsed<ApplicationInput, ApplicationField> {
  const errors: FieldErrors<ApplicationField> = {};
  // A per-click campaign's budget is fixed; the creator proposes a price per
  // click instead. A fixed-price campaign has no rate to propose.
  const perClick = paymentModel === "per_click";
  const rawPrice = perClick ? "" : text(form, "price").trim();
  const rawRate = perClick ? text(form, "rate").trim() : "";
  const note = text(form, "note").trim();

  let proposedPriceKobo: number | null = null;
  if (rawPrice !== "") {
    const price = parsePrice(rawPrice);
    if ("error" in price) errors.price = price.error;
    else if (price.kobo !== campaignPriceKobo) proposedPriceKobo = price.kobo;
  }

  let proposedCpcKobo: number | null = null;
  if (rawRate !== "") {
    const rate = parseProposedRate(rawRate, campaignPriceKobo);
    if ("error" in rate) errors.rate = rate.error;
    else if (rate.kobo !== campaignCpcKobo) proposedCpcKobo = rate.kobo;
  }

  const contact = findContactDetails(note);
  if (note.length > MAX_NOTE_LENGTH) {
    errors.note = `Use ${MAX_NOTE_LENGTH} characters or fewer (you have ${note.length}).`;
  } else if (contact) {
    errors.note = `Remove the ${contact}. Businesses contact you through Pitchype, which keeps your payment protected.`;
  }

  if (Object.keys(errors).length > 0) {
    return {
      ok: false,
      errors,
      values: { price: rawPrice, rate: rawRate, note },
    };
  }
  return {
    ok: true,
    value: { proposedPriceKobo, proposedCpcKobo, note: note || null },
  };
}

export type ApplicationStatus =
  "submitted" | "shortlisted" | "approved" | "rejected" | "withdrawn";

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  submitted: "Sent",
  shortlisted: "Shortlisted",
  approved: "Hired",
  rejected: "Not selected",
  withdrawn: "Withdrawn",
};

export type ApplicationBucket = "waiting" | "hired" | "closed";

/**
 * Which tab of the business's applications list an application belongs to.
 * A hire that ended unpaid is back with "waiting": the business needs to
 * decide again, and it must not look like a filled place under "hired".
 */
export function applicationBucket(application: {
  status: string;
  engagement: { status: string; fundedAt: string | null } | null;
}): ApplicationBucket {
  if (
    application.status === "submitted" ||
    application.status === "shortlisted"
  ) {
    return "waiting";
  }
  if (hireEndedUnpaid(application)) return "waiting";
  return application.status === "approved" ? "hired" : "closed";
}

/**
 * Whether a hire holds one of its campaign's places: not cancelled or
 * refunded, and not an unpaid hire past its pay-by time (that one has lapsed,
 * even if the database hasn't recorded it yet). Mirrors held_places() in the
 * database, which counts stored statuses after lapsing the stale ones; the
 * database is still what refuses to over-fill a campaign.
 */
export function holdsPlace(
  hire: { status: string; payBy: string },
  now: number,
): boolean {
  if (hire.status === "cancelled" || hire.status === "refunded") return false;
  return !(hire.status === "awaiting_payment" && Date.parse(hire.payBy) < now);
}
