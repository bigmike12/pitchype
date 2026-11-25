import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  DEFAULT_EMAIL_PREFERENCES,
  EMAIL_POLICY,
  parseEmailPreferences,
  wantsEmail,
} from "./notification-email.ts";
import { describeNotification } from "./notifications.ts";

const ALL_OFF = { applications: false, campaigns: false, messages: false };
const ALL_EMAILS_ON = { applications: true, campaigns: true, messages: true };

const describes = (kind: string) =>
  describeNotification(
    {
      id: "n1",
      kind,
      data: {},
      occurredAt: "2026-11-18T10:00:00Z",
      readAt: null,
    },
    "business",
  ) !== null;

// The kinds describeNotification names in its case labels, read from the
// source so a new kind added there without a policy here fails this test.
const handledKinds = [
  ...readFileSync(
    new URL("./notifications.ts", import.meta.url),
    "utf8",
  ).matchAll(/case "([a-z_]+)":/g),
].map((match) => match[1]);

test("every kind describeNotification handles has a policy", () => {
  assert.ok(handledKinds.length > 20);
  for (const kind of handledKinds) {
    assert.ok(kind in EMAIL_POLICY, `${kind} has no email policy`);
  }
});

test("every kind with a policy is handled by describeNotification", () => {
  for (const kind of Object.keys(EMAIL_POLICY)) {
    assert.ok(describes(kind), `${kind} is not handled`);
  }
});

test("money and deadline kinds always send", () => {
  const always = [
    "hire_funded",
    "engagement_settled",
    "payout_paid",
    "payout_failed",
    "payout_rejected",
    "payment_stranded",
    "review_reminder",
    "work_submitted",
    "submission_denied",
    "dispute_opened",
    "hire_lapsed",
    "application_hired",
    "campaign_taken_down",
    "verification_approved",
    "profile_hidden",
    "portfolio_sample_hidden",
    "cover_removed",
    "appeal_answered",
    "click_cap_reached",
    "click_hold_started",
    "checkpoint_reminder",
    "checkpoint_overdue",
    "checkpoint_warning",
    "checkpoint_dispute_available",
    "clicks_stopped",
    "identity_verified",
    "identity_failed",
    "identity_needs_review",
  ];
  for (const kind of always) {
    assert.equal(wantsEmail(kind, ALL_OFF), true, kind);
  }
});

test("switches control their group", () => {
  const only = (group: keyof typeof ALL_OFF) => ({ ...ALL_OFF, [group]: true });

  const groups = {
    applications: [
      "application_received",
      "work_started",
      "hire_cancelled",
      "kickoff_done",
      "checkpoint_done",
      "checkpoint_late",
    ],
    campaigns: ["campaign_approved", "campaign_sent_back"],
    messages: ["new_message"],
  } as const;

  for (const [group, kinds] of Object.entries(groups)) {
    for (const kind of kinds) {
      assert.equal(wantsEmail(kind, ALL_OFF), false, `${kind} off`);
      assert.equal(
        wantsEmail(kind, only(group as keyof typeof ALL_OFF)),
        true,
        `${kind} on`,
      );
      assert.equal(wantsEmail(kind, ALL_EMAILS_ON), true, `${kind} all on`);
    }
  }
});

test("a switch does not control another group", () => {
  assert.equal(
    wantsEmail("new_message", { ...ALL_EMAILS_ON, messages: false }),
    false,
  );
  assert.equal(
    wantsEmail("application_received", { ...ALL_OFF, messages: true }),
    false,
  );
});

test("an unknown kind is not emailed", () => {
  assert.equal(wantsEmail("kind_from_the_future", ALL_EMAILS_ON), false);
});

test("parseEmailPreferences reads checkboxes", () => {
  const form = new FormData();
  form.set("messages", "on");
  assert.deepEqual(parseEmailPreferences(form), {
    applications: false,
    campaigns: false,
    messages: true,
  });
});

test("a person who has chosen nothing gets no chat email", () => {
  assert.deepEqual(DEFAULT_EMAIL_PREFERENCES, {
    applications: true,
    campaigns: true,
    messages: false,
  });
  assert.equal(wantsEmail("new_message", DEFAULT_EMAIL_PREFERENCES), false);
  assert.equal(
    wantsEmail("application_received", DEFAULT_EMAIL_PREFERENCES),
    true,
  );
});
