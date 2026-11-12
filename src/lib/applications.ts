// Applications: the apply form's rules and the words for each refusal the
// database can give. No framework imports, so it can be unit-tested. The
// rules that protect places, prices and standing live in
// supabase/migrations/20261110100100_create_applications.sql.

import { parsePrice } from "./campaign.ts";
import { findContactDetails } from "./contact-details.ts";
import { text, type FieldErrors, type Parsed } from "./form-data.ts";

export const MAX_NOTE_LENGTH = 500;

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
