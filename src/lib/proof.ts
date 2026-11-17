// Checks on proof of work and denial reasons before they reach the database.
// The database function checks the same limits again (submit_work,
// deny_submission); these give the person a message instead of a refusal code.
// No framework imports, so Node's test runner can load it.

import { findContactDetails } from "./contact-details.ts";

export const MAX_PROOF_LINKS = 10;
export const MAX_PROOF_LINK_LENGTH = 500;
export const MAX_PROOF_FILES = 5;
export const MAX_PROOF_NOTE_LENGTH = 1000;
export const MAX_DENIAL_REASONS = 5;

export type ParseResult<Key extends string, Value> =
  ({ ok: true } & Record<Key, Value>) | { ok: false; message: string };

// Counted in characters as the database counts them (code points), so an
// emoji is one.
const length = (text: string) => [...text].length;

// No whitespace anywhere: new URL() would percent-encode an inner space and
// accept "https://x.com/post and more text", but the database requires
// ^https?://\S+$ and would refuse it with a bare code.
function isWebLink(link: string): boolean {
  if (/\s/.test(link)) return false;
  try {
    const url = new URL(link);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname !== ""
    );
  } catch {
    return false;
  }
}

/**
 * Links typed one per line. `fileCount` is how many screenshots come with
 * them: proof needs at least one link or one screenshot.
 */
export function parseProofLinks(
  raw: string,
  fileCount = 0,
): ParseResult<"links", string[]> {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const links = [...new Set(lines)];

  if (links.length === 0 && fileCount === 0) {
    return { ok: false, message: "Add a link or a screenshot." };
  }
  if (links.length > MAX_PROOF_LINKS) {
    return {
      ok: false,
      message: `Add up to ${MAX_PROOF_LINKS} links, one per line.`,
    };
  }
  if (
    links.some(
      (link) => length(link) > MAX_PROOF_LINK_LENGTH || !isWebLink(link),
    )
  ) {
    return {
      ok: false,
      message: `Each link must start with http:// or https:// and be up to ${MAX_PROOF_LINK_LENGTH} characters.`,
    };
  }
  return { ok: true, links };
}

/** The optional note: trimmed, null when empty. */
export function parseProofNote(
  raw: string,
): ParseResult<"note", string | null> {
  const note = raw.trim();
  if (length(note) > MAX_PROOF_NOTE_LENGTH) {
    return {
      ok: false,
      message: `Keep the note to ${MAX_PROOF_NOTE_LENGTH.toLocaleString("en-NG")} characters or fewer.`,
    };
  }
  return { ok: true, note: note === "" ? null : note };
}

/** One to five reasons, each 3 to 500 characters; empty fields are skipped. */
export function parseDenialReasons(
  raw: string[],
): ParseResult<"reasons", string[]> {
  const reasons = raw.map((reason) => reason.trim()).filter((r) => r !== "");
  if (
    reasons.length < 1 ||
    reasons.length > MAX_DENIAL_REASONS ||
    reasons.some((reason) => length(reason) < 3 || length(reason) > 500)
  ) {
    return {
      ok: false,
      message: "Give 1 to 5 reasons, each 3 to 500 characters.",
    };
  }
  return { ok: true, reasons };
}

/**
 * Links that may be left out (a dispute's opening statement): nothing typed
 * is fine, anything typed is checked like proof links.
 */
export function parseOptionalProofLinks(
  raw: string,
): ParseResult<"links", string[]> {
  if (raw.trim() === "") return { ok: true, links: [] };
  return parseProofLinks(raw);
}

/** Shown when text in a dispute holds a phone number, email or chat link (no strike; strikes are for chat). */
export const CONTACT_DETAILS_IN_DISPUTE_MESSAGE =
  "Keep contact details out of disputes.";

export const MIN_DISPUTE_REASON_LENGTH = 20;
export const MAX_DISPUTE_REASON_LENGTH = 2000;

/** What went wrong, in the person's words: 20 to 2,000 characters. */
export function parseDisputeReason(raw: string): ParseResult<"reason", string> {
  const reason = raw.trim();
  if (
    length(reason) < MIN_DISPUTE_REASON_LENGTH ||
    length(reason) > MAX_DISPUTE_REASON_LENGTH
  ) {
    return {
      ok: false,
      message: `Explain the problem in ${MIN_DISPUTE_REASON_LENGTH} to ${MAX_DISPUTE_REASON_LENGTH.toLocaleString("en-NG")} characters.`,
    };
  }
  if (findContactDetails(reason)) {
    return { ok: false, message: CONTACT_DETAILS_IN_DISPUTE_MESSAGE };
  }
  return { ok: true, reason };
}

export const MAX_STATEMENT_LENGTH = 2000;

/**
 * A dispute statement: 1 to 2,000 characters after trimming, with no contact
 * details (the same check as the opening reason). Links are not checked,
 * because a link to another app is what proof often is.
 */
export function parseStatementBody(raw: string): ParseResult<"body", string> {
  const body = raw.trim();
  if (length(body) < 1 || length(body) > MAX_STATEMENT_LENGTH) {
    return {
      ok: false,
      message: `Write a statement of up to ${MAX_STATEMENT_LENGTH.toLocaleString("en-NG")} characters.`,
    };
  }
  if (findContactDetails(body)) {
    return { ok: false, message: CONTACT_DETAILS_IN_DISPUTE_MESSAGE };
  }
  return { ok: true, body };
}
