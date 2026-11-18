// The Resend boundary (CLAUDE.md §2a): the only file that talks to Resend for
// transactional email. One plain function over fetch. No retries here: the
// notification email queue retries, and the idempotency key makes a repeat of
// a send that did go through harmless.
//
// No `import "server-only"`: node tests cannot resolve it. RESEND_API_KEY has
// no NEXT_PUBLIC_ prefix, so Next never bundles it into client code.

const SEND_URL = "https://api.resend.com/emails";
// A send must stay far under the queue's 5-minute re-claim window.
const TIMEOUT_MS = 15_000;

/** `status` is the HTTP status, or 0 when no answer came back (network, timeout, missing config). */
export class ResendError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ResendError";
    this.status = status;
  }
}

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  // Sending the same key twice sends one email (Resend remembers it for 24 hours).
  idempotencyKey: string;
};

/** Strips the API key and any email address, so a log line never holds either. */
function safeMessage(message: string): string {
  const key = process.env.RESEND_API_KEY ?? "";
  const withoutKey = key === "" ? message : message.split(key).join("[key]");
  return withoutKey.replace(/[^\s<>"',;()]+@[^\s<>"',;()]+/g, "[address]");
}

function fail(message: string, status = 0): never {
  throw new ResendError(safeMessage(message), status);
}

/** Resolves on any 2xx; throws ResendError otherwise. */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const key = process.env.RESEND_API_KEY ?? "";
  const from = process.env.FROM_EMAIL ?? "";
  if (key === "") fail("RESEND_API_KEY is not set");
  if (from === "") fail("FROM_EMAIL is not set");

  let response: Response;
  try {
    response = await fetch(SEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": message.idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // The underlying error can echo the request, so say nothing of it.
    return fail("Could not reach Resend");
  }

  if (response.ok) return;

  // Resend's error body is `{ name, message }`; it can echo the address.
  let detail = "Resend returned an error";
  try {
    const parsed: unknown = JSON.parse(await response.text());
    if (typeof parsed === "object" && parsed !== null) {
      const text = (parsed as { message?: unknown }).message;
      if (typeof text === "string" && text !== "") detail = text;
    }
  } catch {
    // An unreadable body keeps the generic wording.
  }
  return fail(detail, response.status);
}
