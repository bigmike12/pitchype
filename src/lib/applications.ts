// Applications: the apply form's rules and the words for each refusal the
// database can give. No framework imports, so it can be unit-tested. The
// rules that protect places, prices and standing live in
// supabase/migrations/20261110100100_create_applications.sql.

import { parsePrice } from "./campaign.ts";
import { findContactDetails } from "./contact-details.ts";
import { text, type FieldErrors, type Parsed } from "./form-data.ts";

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

export type ApplicationField = "price" | "note";

export type ApplicationInput = {
  /** Null: the creator accepts the campaign price. */
  proposedPriceKobo: number | null;
  note: string | null;
};

export function parseApplicationForm(
  form: FormData,
  campaignPriceKobo: number,
): Parsed<ApplicationInput, ApplicationField> {
  const errors: FieldErrors<ApplicationField> = {};
  const rawPrice = text(form, "price").trim();
  const note = text(form, "note").trim();

  let proposedPriceKobo: number | null = null;
  if (rawPrice !== "") {
    const price = parsePrice(rawPrice);
    if ("error" in price) errors.price = price.error;
    else if (price.kobo !== campaignPriceKobo) proposedPriceKobo = price.kobo;
  }

  const contact = findContactDetails(note);
  if (note.length > MAX_NOTE_LENGTH) {
    errors.note = `Use ${MAX_NOTE_LENGTH} characters or fewer (you have ${note.length}).`;
  } else if (contact) {
    errors.note = `Remove the ${contact}. Businesses contact you through Pitchype, which keeps your payment protected.`;
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors, values: { price: rawPrice, note } };
  }
  return { ok: true, value: { proposedPriceKobo, note: note || null } };
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
  if (application.status === "submitted" || application.status === "shortlisted") {
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
