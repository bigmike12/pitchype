// Data access for notification emails and the preferences that gate them.
//
// The send run (a daily-style job that acts for no one person) claims due
// rows and reports each result through the secret-key client; both SQL
// functions are service_role-only (the email_queue migration). A person reads
// and saves only their own preferences, through their session, so row level
// security and save_email_preferences() decide what they can touch. Errors
// carry the database code only: never the recipient's address.

import { DEFAULT_EMAIL_PREFERENCES, type EmailPreferences } from "@/lib/notification-email";
import type { NotificationRow } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSessionClient } from "@/lib/supabase/server";

import { isObject } from "./json";

export type DueEmail = {
  notification: NotificationRow;
  /** Tries used including this claim, so 5 means the last try. */
  attempts: number;
  /** The recipient's address. Never put it in an error or a log line. */
  to: string;
  role: "business" | "influencer" | "admin";
  preferences: EmailPreferences;
};

function toRole(role: string): DueEmail["role"] {
  if (role === "business" || role === "influencer" || role === "admin") {
    return role;
  }
  throw new Error("due email has an unexpected role");
}

/**
 * Hands out up to `max` emails that are due, each already counted as one
 * attempt and pushed 5 minutes out, so a failed send comes due again later.
 */
export async function claimDueEmails(max: number): Promise<DueEmail[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("claim_due_emails", { max });
  if (error) throw new Error(`claim due emails failed (${error.code})`);
  return data.map((r) => ({
    notification: {
      id: r.id,
      kind: r.kind,
      data: isObject(r.data) ? r.data : {},
      occurredAt: r.occurred_at,
      // The generated type calls every column of a RETURNS TABLE function
      // non-null; read_at is nullable (a notification not yet read).
      readAt: (r.read_at as string | null) ?? null,
    },
    attempts: r.attempts,
    to: r.email,
    role: toRole(r.role),
    preferences: {
      applications: r.email_applications,
      campaigns: r.email_campaigns,
      messages: r.email_messages,
    },
  }));
}

/**
 * Records one send. `wasSent` false means nothing is pending any more (a
 * switched-off group, a thread already read); a failed send is not reported,
 * the row simply comes due again.
 */
export async function finishEmail(
  notificationId: string,
  wasSent: boolean,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("finish_email", {
    notification: notificationId,
    was_sent: wasSent,
  });
  if (error) throw new Error(`finish email failed (${error.code})`);
}

/** The signed-in person's email switches; no stored row means the defaults (chat email off). */
export async function getMyEmailPreferences(): Promise<EmailPreferences> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("email_applications, email_campaigns, email_messages")
    .maybeSingle();
  if (error) throw new Error(`email preferences failed (${error.code})`);
  if (!data) return DEFAULT_EMAIL_PREFERENCES;
  return {
    applications: data.email_applications,
    campaigns: data.email_campaigns,
    messages: data.email_messages,
  };
}

/** Saves the signed-in person's email switches. */
export async function saveMyEmailPreferences(
  preferences: EmailPreferences,
): Promise<void> {
  const supabase = await createSessionClient();
  const { error } = await supabase.rpc("save_email_preferences", {
    applications: preferences.applications,
    campaigns: preferences.campaigns,
    messages: preferences.messages,
  });
  if (error) throw new Error(`save email preferences failed (${error.code})`);
}
