"use server";

import { headers } from "next/headers";

import { createAnonServerClient } from "@/lib/supabase/server";

import {
  WAITLIST_SOURCE,
  parseWaitlistForm,
  type WaitlistResult,
} from "./waitlist-input";

const JOINED = "You’re on the list. We’ll email you when Pitchype opens.";
const ALREADY_JOINED =
  "You’re already on the list. We’ll email you when Pitchype opens.";

// Per-IP rate limit, kept in this server instance's memory.
// Limits: on Vercel every serverless instance has its own memory, instances
// start and stop freely, and a restart clears the counts. So this only slows
// down a single noisy client; it is not a real quota, and anyone can skip it by
// calling the Supabase REST API with the public anon key (the database
// constraints still apply there). Move to a shared store if spam shows up.
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const attemptsByIp = new Map<string, number[]>();

function isRateLimited(ip: string, now: number): boolean {
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const recent = (attemptsByIp.get(ip) ?? []).filter((at) => at > windowStart);
  const limited = recent.length >= RATE_LIMIT_MAX_ATTEMPTS;
  if (!limited) recent.push(now);
  attemptsByIp.set(ip, recent);

  // Drop idle IPs now and then so the map can't grow without bound.
  if (attemptsByIp.size > 10_000) {
    for (const [key, times] of attemptsByIp) {
      if (times.every((at) => at <= windowStart)) attemptsByIp.delete(key);
    }
  }
  return limited;
}

async function clientIp(): Promise<string> {
  const requestHeaders = await headers();
  // Vercel sets x-forwarded-for itself, with the client's address first.
  const forwarded = requestHeaders
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return forwarded || requestHeaders.get("x-real-ip") || "unknown";
}

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
    const supabase = createAnonServerClient();
    const { error } = await supabase.from("waitlist").insert({
      email: parsed.email,
      role: parsed.role,
      source: WAITLIST_SOURCE,
    });

    if (!error) return { ok: true, message: JOINED };

    // 23505 = unique_violation on lower(email): they've already joined. Not an error for them.
    if (error.code === "23505") return { ok: true, message: ALREADY_JOINED };

    // Log the code and message only; never the email address.
    console.error("waitlist insert failed", {
      code: error.code,
      message: error.message,
    });
  } catch (error) {
    console.error(
      "waitlist insert threw",
      error instanceof Error ? error.message : error,
    );
  }

  return {
    ok: false,
    message:
      "We couldn’t save your signup just now. Please try again in a minute.",
    ...retry,
  };
}
