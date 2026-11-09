// The auth boundary (CLAUDE.md §2a): the only module that talks to Supabase
// Auth. Pages and actions ask it who is signed in and call it to sign people
// up, in and out. Moving to another auth provider means rewriting this file
// and the two SQL functions named in the users migration; callers don't change.

import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";

import { isSignupRole, type SignupRole } from "@/lib/credentials";
import {
  ensureUserForSession,
  getUserByAuthId,
  type AppUser,
  type UserRole,
} from "@/lib/db/users";
import { SITE_URL } from "@/lib/site";
import { createSessionClient } from "@/lib/supabase/server";

// Where links in auth emails point (the templates use {{ .RedirectTo }}).
// It comes from configuration, never from the request's Host header: a forged
// host would otherwise put someone's reset token in a link to another site.
// Supabase also only accepts addresses on its allow-list.
const EMAIL_LINK_BASE = SITE_URL;

type Failure<Reason extends string> = { ok: false; reason: Reason };
const fail = <Reason extends string>(reason: Reason): Failure<Reason> => ({
  ok: false,
  reason,
});

const RATE_LIMIT_CODES = new Set([
  "over_request_rate_limit",
  "over_email_send_rate_limit",
]);

type AuthError = { code?: string; status?: number };

// Code and status only: auth errors can echo the email address.
function logAuthError(action: string, error: AuthError) {
  console.error(`auth: ${action} failed`, {
    code: error.code,
    status: error.status,
  });
}

type SessionClient = Awaited<ReturnType<typeof createSessionClient>>;

/**
 * Makes sure the person who just signed in has an app user, created with the
 * role they picked at sign-up. Returns null if that can't be done (no session,
 * or no usable role), in which case callers sign them out.
 */
async function finishSignIn(supabase: SessionClient): Promise<AppUser | null> {
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  const existing = await getUserByAuthId(claims.sub);
  if (existing) return existing;

  const role = (claims.user_metadata as { signup_role?: unknown } | undefined)
    ?.signup_role;
  if (typeof role !== "string" || !isSignupRole(role)) return null;

  await ensureUserForSession(role);
  return getUserByAuthId(claims.sub);
}

export async function signUp(input: {
  email: string;
  password: string;
  role: SignupRole;
}): Promise<
  | { ok: true }
  | Failure<"weak_password" | "email_rejected" | "rate_limited" | "unavailable">
> {
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      // Kept on the auth record until the email is confirmed; the app user
      // is created from it at first sign-in.
      data: { signup_role: input.role },
      emailRedirectTo: EMAIL_LINK_BASE,
    },
  });

  // An email that already has an account also comes back as success (and
  // gets no email), so sign-up never reveals who is registered.
  if (!error) return { ok: true };
  if (error.code === "weak_password") return fail("weak_password");
  if (RATE_LIMIT_CODES.has(error.code ?? "")) return fail("rate_limited");
  if (
    error.code === "email_address_invalid" ||
    error.code === "email_address_not_authorized"
  ) {
    return fail("email_rejected");
  }
  logAuthError("sign-up", error);
  return fail("unavailable");
}

export async function signIn(input: {
  email: string;
  password: string;
}): Promise<
  | { ok: true; user: AppUser }
  | Failure<
      | "invalid_credentials"
      | "email_not_confirmed"
      | "rate_limited"
      | "unavailable"
    >
> {
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.signInWithPassword(input);

  if (error) {
    if (error.code === "invalid_credentials")
      return fail("invalid_credentials");
    if (error.code === "email_not_confirmed") {
      // Send a fresh link in case the old one expired. Supabase refuses if
      // one went out very recently, which is fine: that one still works.
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: input.email,
        options: { emailRedirectTo: EMAIL_LINK_BASE },
      });
      if (resendError && !RATE_LIMIT_CODES.has(resendError.code ?? "")) {
        logAuthError("resend confirmation", resendError);
      }
      return fail("email_not_confirmed");
    }
    if (RATE_LIMIT_CODES.has(error.code ?? "")) return fail("rate_limited");
    logAuthError("sign-in", error);
    return fail("unavailable");
  }

  const user = await finishSignIn(supabase);
  if (!user) {
    await supabase.auth.signOut({ scope: "local" });
    return fail("unavailable");
  }
  return { ok: true, user };
}

/** Signs the person in from an emailed link (confirmation or password reset). */
export async function verifyEmailLink(
  tokenHash: string,
  type: Extract<EmailOtpType, "email" | "recovery">,
): Promise<boolean> {
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type,
  });
  if (error) {
    // Expired or already-used links are normal; only log the unexpected.
    if (error.code !== "otp_expired")
      logAuthError(`verify ${type} link`, error);
    return false;
  }
  const user = await finishSignIn(supabase);
  if (!user) {
    await supabase.auth.signOut({ scope: "local" });
    return false;
  }
  return true;
}

/** Repairs a session that has no app user yet. False means it signed them out. */
export async function repairSession(): Promise<boolean> {
  const supabase = await createSessionClient();
  const user = await finishSignIn(supabase);
  if (!user) await supabase.auth.signOut({ scope: "local" });
  return user !== null;
}

/**
 * Emails a password-reset link if the account exists. Says nothing about
 * whether it does; errors are logged, not shown.
 */
export async function sendPasswordReset(email: string): Promise<void> {
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: EMAIL_LINK_BASE,
  });
  if (error && !RATE_LIMIT_CODES.has(error.code ?? "")) {
    logAuthError("password reset email", error);
  }
}

export async function updatePassword(
  password: string,
): Promise<
  | { ok: true }
  | Failure<"weak_password" | "same_password" | "signed_out" | "unavailable">
> {
  const supabase = await createSessionClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (!error) return { ok: true };
  if (error.code === "weak_password") return fail("weak_password");
  if (error.code === "same_password") return fail("same_password");
  if (error.status === 401 || error.code === "session_not_found") {
    return fail("signed_out");
  }
  logAuthError("password update", error);
  return fail("unavailable");
}

export async function signOut(): Promise<void> {
  const supabase = await createSessionClient();
  await supabase.auth.signOut({ scope: "local" });
}

/**
 * For pages and actions that need someone signed in. Sends people without a
 * session to /login, and a session without an app user to /auth/finish to be
 * repaired (sending them to /login would loop, since they are signed in).
 * Cached per request, so the portal layout and the page share one lookup.
 */
export const requireUser = cache(async (): Promise<AppUser> => {
  const supabase = await createSessionClient();
  const { data } = await supabase.auth.getClaims();
  const authUserId = data?.claims?.sub;
  if (!authUserId) redirect("/login");

  const user = await getUserByAuthId(authUserId);
  if (!user) redirect("/auth/finish");
  return user;
});

/** Like requireUser, and sends anyone with another role to their home page. */
export async function requireRole(role: UserRole): Promise<AppUser> {
  const user = await requireUser();
  if (user.role !== role) redirect("/home");
  return user;
}

/**
 * The signed-in person, or null, for public pages that look different when
 * signed in (the directory shows businesses a price filter) and for the
 * portal shell. Not an access check: what each viewer may read is enforced by
 * the database. Cached per request.
 */
export const getSignedInUser = cache(async (): Promise<AppUser | null> => {
  const supabase = await createSessionClient();
  const { data } = await supabase.auth.getClaims();
  const authUserId = data?.claims?.sub;
  return authUserId ? getUserByAuthId(authUserId) : null;
});
