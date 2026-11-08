"use server";

import { clientIp } from "@/lib/client-ip";
import { addToWaitlist } from "@/lib/db/waitlist";
import { createRateLimiter } from "@/lib/rate-limit";

import {
  WAITLIST_SOURCE,
  parseWaitlistForm,
  type WaitlistResult,
} from "./waitlist-input";

const JOINED = "You’re on the list. We’ll email you when Pitchype opens.";
const ALREADY_JOINED =
  "You’re already on the list. We’ll email you when Pitchype opens.";

// Anyone can skip this by calling the Supabase REST API with the public key;
// the database constraints still apply there.
const isRateLimited = createRateLimiter({
  maxAttempts: 5,
  windowMs: 10 * 60 * 1000,
});

export async function joinWaitlist(
  _previous: WaitlistResult | null,
  formData: FormData,
): Promise<WaitlistResult> {
  const parsed = parseWaitlistForm(formData);

  if (parsed.kind === "bot") {
    // Look like success so bots get no signal to adapt to. Nothing is stored.
    return { ok: true, message: JOINED };
  }
  if (parsed.kind === "invalid") {
    return {
      ok: false,
      message: parsed.message,
      email: parsed.email,
      role: parsed.role,
    };
  }

  const retry = { email: parsed.email, role: parsed.role };

  if (isRateLimited(await clientIp(), Date.now())) {
    return {
      ok: false,
      message:
        "Too many tries from this connection. Wait a few minutes, then try again.",
      ...retry,
    };
  }

  try {
    const outcome = await addToWaitlist({
      email: parsed.email,
      role: parsed.role,
      source: WAITLIST_SOURCE,
    });
    // Already joined is not an error for them.
    return {
      ok: true,
      message: outcome === "added" ? JOINED : ALREADY_JOINED,
    };
  } catch (error) {
    // The error message never includes the email address.
    console.error(
      "waitlist signup failed",
      error instanceof Error ? error.message : error,
    );
    return {
      ok: false,
      message:
        "We couldn’t save your signup just now. Please try again in a minute.",
      ...retry,
    };
  }
}
