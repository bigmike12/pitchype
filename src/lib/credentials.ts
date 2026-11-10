// Rules for the sign-up, login and password forms.

import { text, type FieldErrors, type Parsed } from "./form-data.ts";

export const SIGNUP_ROLES = ["business", "influencer"] as const;
export type SignupRole = (typeof SIGNUP_ROLES)[number];

export const MIN_PASSWORD_LENGTH = 8;
// bcrypt, which Supabase Auth uses, ignores everything past 72 bytes.
const MAX_PASSWORD_LENGTH = 72;

// Deliberately loose: the confirmation email is
// the real proof an address works.
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function isSignupRole(value: string): value is SignupRole {
  return (SIGNUP_ROLES as readonly string[]).includes(value);
}

function emailProblem(email: string): string | null {
  if (email === "") return "Enter your email address.";
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return "Enter an email address like name@example.com.";
  }
  return null;
}

function newPasswordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_LENGTH) {
    return "That password is too long. Use 72 characters or fewer.";
  }
  return null;
}

const normaliseEmail = (raw: string) => raw.trim().toLowerCase();

export function parseSignUpForm(
  form: FormData,
): Parsed<
  { email: string; password: string; role: SignupRole },
  "email" | "password" | "role"
> {
  const email = normaliseEmail(text(form, "email"));
  const password = text(form, "password");
  const role = text(form, "role");

  const errors: FieldErrors<"email" | "password" | "role"> = {};
  if (!isSignupRole(role)) {
    errors.role = "Choose whether you’re a business or a creator.";
  }
  const emailError = emailProblem(email);
  if (emailError) errors.email = emailError;
  const passwordError = newPasswordProblem(password);
  if (passwordError) errors.password = passwordError;

  if (Object.keys(errors).length > 0 || !isSignupRole(role)) {
    return { ok: false, errors, values: { email, role } };
  }
  return { ok: true, value: { email, password, role } };
}

export function parseLoginForm(
  form: FormData,
): Parsed<{ email: string; password: string }, "email" | "password"> {
  const email = normaliseEmail(text(form, "email"));
  const password = text(form, "password");

  const errors: FieldErrors<"email" | "password"> = {};
  const emailError = emailProblem(email);
  if (emailError) errors.email = emailError;
  // No length rules here: say nothing about what a valid password looks like.
  if (password === "") errors.password = "Enter your password.";

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors, values: { email } };
  }
  return { ok: true, value: { email, password } };
}

export function parseEmailForm(
  form: FormData,
): Parsed<{ email: string }, "email"> {
  const email = normaliseEmail(text(form, "email"));
  const emailError = emailProblem(email);
  if (emailError) {
    return { ok: false, errors: { email: emailError }, values: { email } };
  }
  return { ok: true, value: { email } };
}

export function parseNewPasswordForm(
  form: FormData,
): Parsed<{ password: string }, "password"> {
  const password = text(form, "password");
  const passwordError = newPasswordProblem(password);
  if (passwordError) {
    return { ok: false, errors: { password: passwordError }, values: {} };
  }
  return { ok: true, value: { password } };
}
