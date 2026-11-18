// Server error reporting to PostHog (CLAUDE.md §2a). The only file that talks
// to PostHog. Errors only: no session replay, no autocapture, no user ids and
// no personal data. One plain fetch, no SDK.
//
// Off unless POSTHOG_PROJECT_API_KEY is set, so local development sends
// nothing. It never throws: a failed report must not hide the error it was
// reporting, or cause another one.
//
// No `import "server-only"`: node tests cannot resolve it. The key has no
// NEXT_PUBLIC_ prefix, so Next never bundles it into client code.

const DEFAULT_HOST = "https://us.i.posthog.com";
const TIMEOUT_MS = 5_000;

// Secret values that must never leave the server, even inside an error message.
const SECRET_ENV_NAMES = [
  "SUPABASE_SECRET_KEY",
  "PAYSTACK_SECRET_KEY",
  "RESEND_API_KEY",
  "CRON_SECRET",
];

/** Removes secrets, email addresses and long digit runs (phone numbers, account numbers). */
export function scrub(text: string): string {
  let out = text;
  for (const name of SECRET_ENV_NAMES) {
    const value = process.env[name];
    if (value) out = out.split(value).join("[secret]");
  }
  return out
    .replace(/[^\s<>"',;()]+@[^\s<>"',;()]+/g, "[address]")
    .replace(/\+?\d{9,}/g, "[number]");
}

function describe(error: unknown): {
  name: string;
  message: string;
  stack: string;
} {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? "",
    };
  }
  // Next.js passes a plain object with the same fields when it reports a request error.
  if (typeof error === "object" && error !== null) {
    const fields = error as {
      name?: unknown;
      message?: unknown;
      stack?: unknown;
    };
    return {
      name: typeof fields.name === "string" ? fields.name : "Error",
      message:
        typeof fields.message === "string" ? fields.message : String(error),
      stack: typeof fields.stack === "string" ? fields.stack : "",
    };
  }
  return { name: "Error", message: String(error), stack: "" };
}

/**
 * Reports one server error. `where` names the place it happened (a route
 * pattern such as "POST /api/webhooks/paystack"), never a URL with ids in it.
 */
export async function reportServerError(
  error: unknown,
  where: string,
): Promise<void> {
  const apiKey = process.env.POSTHOG_PROJECT_API_KEY;
  if (!apiKey) return;

  const host = (process.env.POSTHOG_HOST || DEFAULT_HOST).replace(/\/+$/, "");
  const { name, message, stack } = describe(error);
  const body = {
    api_key: apiKey,
    event: "$exception",
    // One fixed id: the errors are not about any one person, and PostHog
    // should not build a person profile from them.
    distinct_id: "server",
    timestamp: new Date().toISOString(),
    properties: {
      $process_person_profile: false,
      $exception_type: name,
      $exception_message: scrub(message).slice(0, 500),
      $exception_stack_trace_raw: scrub(stack).slice(0, 4000),
      where: scrub(where).slice(0, 200),
    },
  };

  try {
    const response = await fetch(`${host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(
        `PostHog did not accept an error report (HTTP ${response.status})`,
      );
    }
  } catch {
    // Deliberately silent: the original error is what matters, and the caller
    // is already handling it.
  }
}
