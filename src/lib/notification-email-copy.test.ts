import assert from "node:assert/strict";
import { test } from "node:test";

import {
  describeEmail,
  emailText,
  type EmailCopy,
} from "./notification-email-copy.ts";
import { EMAIL_POLICY } from "./notification-email.ts";
import { describeNotification, type NotificationRow } from "./notifications.ts";

const ROLES = ["business", "influencer"] as const;

const row = (
  kind: string,
  data: Record<string, unknown> = {},
): NotificationRow => ({
  id: "n1",
  kind,
  data,
  occurredAt: "2026-11-27T10:00:00Z",
  readAt: null,
});

// Facts every kind might carry, so the "typical" pass exercises the full copy.
const TYPICAL = {
  name: "Tolu Eats",
  campaign_title: "Summer launch",
  campaign_id: "c1",
  engagement_id: "e1",
  conversation_id: "m1",
  note: "Please remove the phone number.",
  preview: "Can we move the post to Friday?",
  count: 2,
  reasons: ["The caption is missing the hashtag", "The video is 10s, not 30s"],
  rounds_left: 2,
  review_deadline_at: "2026-12-04T10:00:00Z",
  amount_kobo: 2_500_000,
  released_kobo: 5_000_000,
  refunded_kobo: 0,
  creator_net_kobo: 4_750_000,
  creator_fee_kobo: 250_000,
  status: "accepted",
  settled_by: "business",
  outcome: "release",
  days_left: 2,
  due_on: "2026-11-30",
  due_at: "2026-11-30T22:59:59Z",
  dispute_from: "2026-12-02T10:00:00Z",
  settles_at: "2026-12-05T10:00:00Z",
  billable: 420,
  earned_kobo: 2_100_000,
  cap: 500,
  platform: "instagram",
  caption: "Jollof taste test",
  decision_reason: "The bank account name doesn’t match.",
  title: "Dark mode",
  number: 12,
  kind: "creator_nin",
  reason: "selfie_mismatch",
};

const all = (copy: EmailCopy) => emailText(copy);

test("every emailed kind has its own copy for both sides, with or without facts", () => {
  for (const kind of Object.keys(EMAIL_POLICY)) {
    for (const role of ROLES) {
      for (const data of [{}, TYPICAL]) {
        const copy = describeEmail(row(kind, data), role);
        assert.ok(copy, `${kind}/${role} has copy`);
        assert.ok(copy.subject.trim() !== "", `${kind} subject`);
        assert.ok(copy.blocks.length > 0, `${kind} has a body`);
        assert.notEqual(
          copy.button,
          "Open in Pitchype",
          `${kind} names its action`,
        );
        assert.ok(
          !/undefined|null|NaN|\[object/.test(all(copy)),
          `${kind}/${role}: ${all(copy)}`,
        );
        // The link is the bell's link: one place decides where a kind leads.
        assert.equal(
          copy.href,
          describeNotification(row(kind, data), role)?.href,
        );
      }
    }
  }
});

test("a kind the app doesn't know is left out, as in the bell", () => {
  assert.equal(describeEmail(row("from_the_future"), "business"), null);
});

test("the preview is the first paragraph on one line", () => {
  const copy = describeEmail(row("hire_funded", TYPICAL), "influencer")!;
  const first = copy.blocks.find((b) => b.type === "p");
  assert.equal(first?.type === "p" ? first.text : null, copy.preview);
});

test("hired: 48 hours to pay, and don't start before then", () => {
  const text = all(
    describeEmail(row("application_hired", TYPICAL), "influencer")!,
  );
  assert.match(text, /48 hours/);
  assert.match(text, /don’t start/i);
});

test("a dispute asks for a reply within 3 days and says an admin decides", () => {
  for (const role of ROLES) {
    const text = all(describeEmail(row("dispute_opened", TYPICAL), role)!);
    assert.match(text, /3 days/);
    assert.match(text, /admin/);
    assert.match(text, /escrow/);
  }
});

test("a denial lists each reason and the resubmissions left", () => {
  const copy = describeEmail(row("submission_denied", TYPICAL), "influencer")!;
  const list = copy.blocks.find((b) => b.type === "list");
  assert.deepEqual(list?.type === "list" ? list.items : null, TYPICAL.reasons);
  assert.match(all(copy), /2 more times/);
  const last = all(
    describeEmail(
      row("submission_denied", { ...TYPICAL, rounds_left: 0 }),
      "influencer",
    )!,
  );
  assert.match(last, /used all your resubmissions/);
});

test("checkpoint emails never tie a missed checkpoint to money", () => {
  for (const kind of [
    "checkpoint_late",
    "checkpoint_overdue",
    "checkpoint_warning",
    "checkpoint_reminder",
  ]) {
    for (const role of ROLES) {
      const text = all(describeEmail(row(kind, TYPICAL), role)!);
      assert.ok(
        !/forfeit|deduct|lose (your|the) (money|payment)|withheld/i.test(text),
        `${kind}/${role}`,
      );
    }
  }
});

test("identity review stays neutral", () => {
  const text = all(
    describeEmail(row("identity_needs_review", TYPICAL), "influencer")!,
  );
  assert.ok(!/match/i.test(text));
  assert.match(text, /1–2 working days/);
});

test("a creator's payment email shows the net and our fee, never the gross as the credit", () => {
  const copy = describeEmail(row("engagement_settled", TYPICAL), "influencer")!;
  assert.match(copy.subject, /paid/i);
  assert.match(all(copy), /₦47,500 was added to your wallet/);
  assert.match(all(copy), /₦2,500 fee/);
});

test("a full refund to the business is not worded as the creator being paid", () => {
  const data = {
    ...TYPICAL,
    released_kobo: 0,
    refunded_kobo: 5_000_000,
    status: "refunded",
    outcome: "refund",
    settled_by: "admin",
  };
  const creator = describeEmail(row("engagement_settled", data), "influencer")!;
  assert.ok(!/paid/i.test(creator.subject));
  const business = describeEmail(row("engagement_settled", data), "business")!;
  assert.match(all(business), /₦50,000 went back to your wallet/);
});

test("admin notes and message previews are quoted with a label", () => {
  const sentBack = describeEmail(
    row("campaign_sent_back", TYPICAL),
    "business",
  )!;
  const quote = sentBack.blocks.find((b) => b.type === "quote");
  assert.equal(quote?.type === "quote" ? quote.text : null, TYPICAL.note);
  const message = describeEmail(row("new_message", TYPICAL), "business")!;
  assert.ok(
    message.blocks.some(
      (b) => b.type === "quote" && b.text === TYPICAL.preview,
    ),
  );
  // Without a note there is no empty quote.
  const bare = describeEmail(row("campaign_sent_back", {}), "business")!;
  assert.ok(!bare.blocks.some((b) => b.type === "quote"));
});

test("chat emails steer the deal back onto Pitchype", () => {
  assert.match(
    all(describeEmail(row("new_message", TYPICAL), "influencer")!),
    /escrow/,
  );
});

test("no emoji anywhere in the copy", () => {
  for (const kind of Object.keys(EMAIL_POLICY)) {
    for (const role of ROLES) {
      const text = all(describeEmail(row(kind, TYPICAL), role)!);
      assert.ok(
        !/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u.test(text),
        kind,
      );
    }
  }
});

test("a subject that starts with the fallback title is capitalised", () => {
  const copy = describeEmail(row("campaign_approved", {}), "business")!;
  assert.match(copy.subject, /^Your campaign/);
});
