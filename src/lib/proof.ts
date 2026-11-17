// Checks on proof of work and denial reasons before they reach the database.
// The database function checks the same limits again (submit_work,
// deny_submission); these give the person a message instead of a refusal code.
// No framework imports, so Node's test runner can load it.

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

function isWebLink(link: string): boolean {
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
