// The notification email send run (Stage 8; CLAUDE.md §8). One function that
// every caller uses: actions and webhooks (after the response), the daily jobs
// and the /api/cron/send-emails backstop. It claims what is due and sends it.
//
// Invariants:
//   - A row is sent at most once. The claim hides it from other runs for 5
//     minutes, and Resend's idempotency key (`id:occurred_at`) covers a crash
//     between Resend accepting the email and finishEmail(id, true).
//   - Rows are sent one at a time, never in parallel, and a run claims at most
//     MAX_PER_RUN. Each send is capped at 15 s by the Resend wrapper, so a
//     run's worst case (claim size x 15 s = 225 s) stays under the 5-minute
//     hide and a row is not re-claimed while it waits its turn. If that ever
//     failed (a slower wrapper timeout, a bigger claim), the idempotency key
//     is the guard against a double email, not the hide.
//   - A failed send leaves the row alone. It comes due again after the push-out
//     and the SQL stops claiming it after 5 attempts; `attempts` is the count
//     including this claim, so 5 is the last try and is logged once.
//   - One row failing never stops the others, and sendDueEmailsSafely never
//     throws into a caller (an action or webhook must not fail over an email).
//   - Preferences and the read state come with the claim, so the skip decision
//     is made right after it. A skip clears the row with finishEmail(id, false);
//     a bump that arrives in the narrow gap between claim and finish can be
//     cleared with it (accepted: the next notification bumps it again).
//   - Logs carry a step and an error class only: never an address, a title,
//     a body or a key.
//
// The database and Resend come in through `deps`, so node tests pass fakes.

import type { DueEmail } from "./db/notification-emails.ts";
import { describeNotification } from "./notifications.ts";
import { wantsEmail } from "./notification-email.ts";
import { renderEmail } from "./email-template.ts";
import type { EmailMessage } from "./resend.ts";

// One run's cap. Worst case is MAX_PER_RUN x the 15 s Resend timeout, which must
// stay under the queue's 5-minute hide: 15 x 15 s = 225 s.
const MAX_PER_RUN = 15;
const LAST_ATTEMPT = 5;

export type SendEmailsDeps = {
  claimDueEmails: (max: number) => Promise<DueEmail[]>;
  finishEmail: (id: string, wasSent: boolean) => Promise<void>;
  sendEmail: (message: EmailMessage) => Promise<void>;
  siteUrl: string;
};

export type SendEmailsResult = {
  sent: number;
  skipped: number;
  failed: number;
};

// Imported lazily because these load the Supabase client and read env vars at
// import time, which node tests cannot.
async function realDeps(): Promise<SendEmailsDeps> {
  const queue = await import("./db/notification-emails.ts");
  const resend = await import("./resend.ts");
  const site = await import("./site.ts");
  return {
    claimDueEmails: queue.claimDueEmails,
    finishEmail: queue.finishEmail,
    sendEmail: resend.sendEmail,
    siteUrl: site.SITE_URL,
  };
}

/** HTTP status for the cron response: 500 when any send failed. */
export function sendEmailsStatus(result: SendEmailsResult): 200 | 500 {
  return result.failed > 0 ? 500 : 200;
}

/** Handles one claimed row; throws if the send or a database call fails. */
async function handleRow(
  row: DueEmail,
  d: SendEmailsDeps,
): Promise<"sent" | "skipped"> {
  const { notification, role, preferences } = row;

  // Admins have no bell, so nothing describes a notification for them.
  if (role === "admin") {
    await d.finishEmail(notification.id, false);
    return "skipped";
  }
  const skip =
    !wantsEmail(notification.kind, preferences) ||
    // A chat email is for an unread thread; money emails send even if read.
    (notification.kind === "new_message" && notification.readAt !== null);
  const view = skip ? null : describeNotification(notification, role);
  if (!view) {
    await d.finishEmail(notification.id, false);
    return "skipped";
  }

  const { subject, html, text } = renderEmail(view, d.siteUrl);
  await d.sendEmail({
    to: row.to,
    subject,
    html,
    text,
    idempotencyKey: `${notification.id}:${notification.occurredAt}`,
  });
  await d.finishEmail(notification.id, true);
  return "sent";
}

export async function sendDueEmails(
  deps?: SendEmailsDeps,
): Promise<SendEmailsResult> {
  const d = deps ?? (await realDeps());
  const rows = await d.claimDueEmails(MAX_PER_RUN);
  const result: SendEmailsResult = { sent: 0, skipped: 0, failed: 0 };

  for (const row of rows) {
    try {
      const outcome = await handleRow(row, d);
      result[outcome] += 1;
    } catch (error) {
      result.failed += 1;
      if (row.attempts >= LAST_ATTEMPT) {
        console.error("send-emails: gave up after 5 attempts");
      } else if (!(error instanceof Error) || error.name !== "ResendError") {
        // A Resend failure is expected and retried; anything else is a bug.
        console.error(
          "send-emails:",
          error instanceof Error ? error.name : "NonError",
        );
      }
    }
  }
  return result;
}

/** For actions and webhooks: never throws, logs the error class only. */
export async function sendDueEmailsSafely(
  deps?: SendEmailsDeps,
): Promise<void> {
  try {
    await sendDueEmails(deps);
  } catch (error) {
    console.error(
      "send-emails:",
      error instanceof Error ? error.name : "NonError",
    );
  }
}
