// Which notification kinds are emailed, and which of them a person can switch
// off. Email is a delivery channel off the notifications table (CLAUDE.md §8):
// an email means you need to act, or money moved. Everything else can be
// turned off in three groups. A kind missing here is never emailed, and a test
// fails if describeNotification handles a kind that has no entry.

export type EmailGroup = "applications" | "campaigns" | "messages";

/** "always" kinds are money or deadline emails and ignore the switches. */
export type EmailPolicy = "always" | EmailGroup;

export type EmailPreferences = {
  applications: boolean;
  campaigns: boolean;
  messages: boolean;
};

/**
 * What a person has before they choose anything (no stored row). Chat email
 * is opt-in; it matches the database default and claim_due_emails().
 */
export const DEFAULT_EMAIL_PREFERENCES: EmailPreferences = {
  applications: true,
  campaigns: true,
  messages: false,
};

export const EMAIL_POLICY: Record<string, EmailPolicy> = {
  application_received: "applications",
  application_updated: "applications",
  application_withdrawn: "applications",
  application_shortlisted: "applications",
  application_passed: "applications",
  hire_cancelled: "applications",
  work_started: "applications",
  kickoff_done: "applications",
  checkpoint_done: "applications",
  checkpoint_late: "applications",

  campaign_approved: "campaigns",
  campaign_sent_back: "campaigns",

  new_message: "messages",

  application_hired: "always",
  checkpoint_reminder: "always",
  checkpoint_overdue: "always",
  checkpoint_warning: "always",
  checkpoint_dispute_available: "always",
  hire_lapsed: "always",
  hire_funded: "always",
  funded_hire_cancelled: "always",
  work_submitted: "always",
  submission_denied: "always",
  review_reminder: "always",
  dispute_opened: "always",
  dispute_statement: "always",
  dispute_withdrawn: "always",
  engagement_settled: "always",
  payout_paid: "always",
  payout_failed: "always",
  payout_rejected: "always",
  payment_stranded: "always",
  click_cap_reached: "always",
  click_hold_started: "always",
  clicks_stopped: "always",
  campaign_taken_down: "always",
  verification_approved: "always",
  verification_rejected: "always",
  profile_hidden: "always",
  portfolio_sample_hidden: "always",
  cover_removed: "always",
  profile_restored: "always",
  appeal_answered: "always",
  identity_verified: "always",
  identity_failed: "always",
  identity_needs_review: "always",
};

export function wantsEmail(
  kind: string,
  preferences: EmailPreferences,
): boolean {
  // Object.hasOwn: a kind like "constructor" must not find an inherited entry.
  if (!Object.hasOwn(EMAIL_POLICY, kind)) return false;
  const policy = EMAIL_POLICY[kind];
  return policy === "always" || preferences[policy];
}

/** An unchecked checkbox is absent from a form, so absent means off. */
export function parseEmailPreferences(form: FormData): EmailPreferences {
  return {
    applications: form.has("applications"),
    campaigns: form.has("campaigns"),
    messages: form.has("messages"),
  };
}
