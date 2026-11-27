// Feedback requests: the words for kinds and statuses, and the rules for the
// three forms (sending a request, an admin's status change, merging a
// duplicate). The database checks the same rules again
// (20261202100100_create_feedback_requests.sql); these give a message
// instead of a refusal code. No framework imports, so Node's test runner can
// load it.

import { isUuid, text, type FieldErrors, type Parsed } from "./form-data.ts";

export const FEEDBACK_KINDS = [
  { value: "idea", label: "Suggest an idea" },
  { value: "problem", label: "Something’s not working" },
] as const;

export const FEEDBACK_STATUSES = [
  { value: "received", label: "Received" },
  { value: "planned", label: "Planned" },
  { value: "shipped", label: "Shipped" },
  { value: "not_planned", label: "Not planned" },
] as const;

export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]["value"];
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number]["value"];

export const FEEDBACK_LIMITS = {
  titleMin: 3,
  titleMax: 120,
  detailsMin: 10,
  detailsMax: 2000,
  noteMax: 1000,
} as const;

export function isFeedbackKind(value: string): value is FeedbackKind {
  return FEEDBACK_KINDS.some((kind) => kind.value === value);
}

export function isFeedbackStatus(value: string): value is FeedbackStatus {
  return FEEDBACK_STATUSES.some((status) => status.value === value);
}

export function kindLabel(kind: string): string {
  return FEEDBACK_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

export function statusLabel(status: string): string {
  return FEEDBACK_STATUSES.find((s) => s.value === status)?.label ?? status;
}

export type FeedbackField = "kind" | "title" | "details";

export function parseFeedbackForm(
  form: FormData,
): Parsed<
  { kind: FeedbackKind; title: string; details: string },
  FeedbackField
> {
  const kind = text(form, "kind");
  const title = text(form, "title").trim();
  const details = text(form, "details").trim();
  const { titleMin, titleMax, detailsMin, detailsMax } = FEEDBACK_LIMITS;

  const errors: FieldErrors<FeedbackField> = {};
  if (!isFeedbackKind(kind)) {
    errors.kind = "Choose an idea or something that’s not working.";
  }
  if (title.length < titleMin || title.length > titleMax) {
    errors.title = `Give it a short title, ${titleMin} to ${titleMax} characters.`;
  }
  if (details.length < detailsMin) {
    errors.details = `Tell us a little more, at least ${detailsMin} characters.`;
  } else if (details.length > detailsMax) {
    errors.details = `Keep it to ${detailsMax.toLocaleString("en-NG")} characters.`;
  }

  if (!isFeedbackKind(kind) || Object.keys(errors).length > 0) {
    return { ok: false, errors, values: { kind, title, details } };
  }
  return { ok: true, value: { kind, title, details } };
}

export type StatusField = "status" | "note";

export function parseStatusForm(
  form: FormData,
): Parsed<
  { id: string; status: FeedbackStatus; note: string | null },
  StatusField
> {
  const id = text(form, "id");
  const status = text(form, "status");
  const note = text(form, "note").trim();

  const errors: FieldErrors<StatusField> = {};
  if (!isUuid(id) || !isFeedbackStatus(status)) {
    errors.status = "Choose a status.";
  }
  if (note.length > FEEDBACK_LIMITS.noteMax) {
    errors.note = `Keep the note to ${FEEDBACK_LIMITS.noteMax.toLocaleString("en-NG")} characters.`;
  }

  if (!isFeedbackStatus(status) || Object.keys(errors).length > 0) {
    return { ok: false, errors, values: { status, note } };
  }
  return { ok: true, value: { id, status, note: note === "" ? null : note } };
}

export function parseDuplicateForm(
  form: FormData,
): Parsed<{ id: string; mainNumber: number }, "main"> {
  const id = text(form, "id");
  const main = text(form, "main").trim().replace(/^#/, "");

  if (!isUuid(id) || !/^[1-9][0-9]{0,15}$/.test(main)) {
    return {
      ok: false,
      errors: { main: "Enter the number of the main request, like #42." },
      values: { main },
    };
  }
  return { ok: true, value: { id, mainNumber: Number(main) } };
}
