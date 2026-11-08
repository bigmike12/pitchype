// Parsing and validation for the waitlist form. Kept free of server-only
// imports so the client form can share the field names, and so the rules are
// unit-testable.

export const WAITLIST_ROLES = ["business", "creator"] as const;
export type WaitlistRole = (typeof WAITLIST_ROLES)[number];

/** Hidden field that people never see; bots that fill every input fill this one too. */
export const HONEYPOT_FIELD = "website";

/** Stored with each signup so we can tell where it came from later. */
export const WAITLIST_SOURCE = "landing";

// Deliberately loose: one @, something on each side, a dot in the domain, no
// spaces. Stricter patterns reject real addresses; the database enforces the
// same shape.
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_EMAIL_LENGTH = 254;

export type WaitlistResult =
  | { ok: true; message: string }
  // email and role are echoed back so the form can keep what was typed,
  // including when the page re-renders without JavaScript.
  | { ok: false; message: string; email?: string; role?: string };

export type ParsedWaitlistForm =
  | { kind: "valid"; email: string; role: WaitlistRole }
  | { kind: "invalid"; message: string; email: string; role: string }
  | { kind: "bot" };

export function isWaitlistRole(value: string): value is WaitlistRole {
  return (WAITLIST_ROLES as readonly string[]).includes(value);
}

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

export function parseWaitlistForm(form: FormData): ParsedWaitlistForm {
  if (text(form, HONEYPOT_FIELD).trim() !== "") {
    return { kind: "bot" };
  }

  const email = text(form, "email").trim().toLowerCase();
  const role = text(form, "role");
  const invalid = (message: string): ParsedWaitlistForm => ({
    kind: "invalid",
    message,
    email,
    role,
  });

  if (email === "") {
    return invalid("Enter your email address.");
  }
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    return invalid(
      "That email address doesn’t look right. Check it and try again.",
    );
  }
  if (!isWaitlistRole(role)) {
    return invalid("Choose whether you’re joining as a business or a creator.");
  }
  return { kind: "valid", email, role };
}
