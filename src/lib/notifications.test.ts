import assert from "node:assert/strict";
import { test } from "node:test";

import { describeNotification, type NotificationRow } from "./notifications.ts";

const row = (
  kind: string,
  data: Record<string, unknown> = {},
): NotificationRow => ({
  id: "n1",
  kind,
  data,
  occurredAt: "2026-11-11T10:00:00Z",
  readAt: null,
});

const campaign = { campaign_id: "k1", campaign_title: "Zobo week" };

test("application events link the business to its applicants", () => {
  const d = describeNotification(
    row("application_received", { ...campaign, name: "Tolu" }),
  );
  assert.equal(d?.title, "Tolu applied to “Zobo week”");
  assert.equal(d?.href, "/business/campaigns/k1/applications");

  const w = describeNotification(
    row("application_withdrawn", { ...campaign, name: "Tolu" }),
  );
  assert.equal(w?.href, "/business/campaigns/k1/applications?tab=closed");
});

test("decisions link the creator to the campaign, with the note", () => {
  const hired = describeNotification(
    row("application_hired", { ...campaign, name: "E2E Kitchen" }),
  );
  assert.equal(hired?.title, "E2E Kitchen hired you for “Zobo week”");
  assert.match(hired?.body ?? "", /pay/);
  assert.equal(hired?.href, "/campaigns/k1");

  const passed = describeNotification(
    row("application_passed", {
      ...campaign,
      name: "E2E Kitchen",
      note: "Went with food.",
    }),
  );
  assert.equal(passed?.body, "Went with food.");
  const noNote = describeNotification(
    row("application_passed", { ...campaign, name: "E2E Kitchen", note: null }),
  );
  assert.equal(noNote?.body, null);
});

test("a lapsed hire reads differently for each side", () => {
  const facts = { ...campaign, engagement_id: "e1", name: "Someone" };
  const forBusiness = describeNotification(
    row("hire_lapsed", facts),
    "business",
  );
  const forCreator = describeNotification(
    row("hire_lapsed", facts),
    "influencer",
  );
  assert.equal(forBusiness?.href, "/business/engagements/e1/pay");
  assert.equal(forCreator?.href, "/campaigns/k1");
  assert.notEqual(forBusiness?.title, forCreator?.title);
});

test("messages count and preview, and open the thread", () => {
  const one = describeNotification(
    row("new_message", {
      conversation_id: "c1",
      name: "Ada",
      preview: "Hi",
      count: 1,
    }),
  );
  assert.equal(one?.title, "New message from Ada");
  assert.equal(one?.body, "Hi");
  assert.equal(one?.href, "/inbox/c1");
  const three = describeNotification(
    row("new_message", {
      conversation_id: "c1",
      name: "Ada",
      preview: "Hi",
      count: 3,
    }),
  );
  assert.equal(three?.title, "3 new messages from Ada");
});

test("verification names the platform", () => {
  const d = describeNotification(
    row("verification_approved", { platform: "instagram", handle: "tolu" }),
  );
  assert.equal(d?.title, "Your Instagram account is verified");
  assert.equal(d?.href, "/profile");
});

test("missing facts never show 'undefined'", () => {
  for (const kind of [
    "application_received",
    "application_updated",
    "application_withdrawn",
    "application_shortlisted",
    "application_hired",
    "application_passed",
    "hire_cancelled",
    "hire_lapsed",
    "new_message",
    "campaign_approved",
    "campaign_sent_back",
    "campaign_taken_down",
    "verification_approved",
    "verification_rejected",
    "profile_hidden",
    "profile_restored",
    "appeal_answered",
    "hire_funded",
    "work_started",
    "funded_hire_cancelled",
    "engagement_settled",
    "payout_paid",
    "payout_failed",
    "payout_rejected",
  ]) {
    const d = describeNotification(row(kind));
    assert.ok(d, kind);
    assert.doesNotMatch(
      `${d.title} ${d.body ?? ""} ${d.href}`,
      /undefined|null/,
      kind,
    );
  }
});

const hire = { ...campaign, engagement_id: "e1", name: "Ada Kitchen" };

test("a funded hire tells the creator to start, and links to the job", () => {
  const d = describeNotification(row("hire_funded", hire), "influencer");
  assert.equal(d?.title, "Ada Kitchen paid for “Zobo week”");
  assert.match(d?.body ?? "", /start work/i);
  assert.equal(d?.href, "/jobs/e1");
});

test("starting work tells the business, and links to the hire", () => {
  const d = describeNotification(
    row("work_started", { ...hire, name: "Tolu" }),
    "business",
  );
  assert.equal(d?.title, "Tolu started work on “Zobo week”");
  assert.equal(d?.href, "/business/engagements/e1");
});

test("a cancelled paid hire reads differently for each side", () => {
  const forCreator = describeNotification(
    row("funded_hire_cancelled", hire),
    "influencer",
  );
  const forBusiness = describeNotification(
    row("funded_hire_cancelled", { ...hire, name: "Tolu" }),
    "business",
  );
  assert.equal(forCreator?.title, "Ada Kitchen cancelled your paid hire for “Zobo week”");
  assert.equal(forCreator?.href, "/jobs/e1");
  assert.equal(forBusiness?.title, "Tolu withdrew from your paid hire for “Zobo week”");
  assert.match(forBusiness?.body ?? "", /wallet/i);
  assert.equal(forBusiness?.href, "/business/engagements/e1");
});

test("a settlement says how the money went, with a link for each side", () => {
  const release = describeNotification(
    row("engagement_settled", {
      ...hire,
      outcome: "release",
      released_kobo: 5000000,
      refunded_kobo: 0,
    }),
    "influencer",
  );
  assert.equal(release?.title, "“Zobo week” was settled");
  assert.match(release?.body ?? "", /₦50,000/);
  assert.match(release?.body ?? "", /released to your wallet/i);
  assert.equal(release?.href, "/jobs/e1");

  const refund = describeNotification(
    row("engagement_settled", {
      ...hire,
      outcome: "refund",
      released_kobo: 0,
      refunded_kobo: 5000000,
    }),
    "business",
  );
  assert.match(refund?.body ?? "", /₦50,000/);
  assert.match(refund?.body ?? "", /back to your wallet/i);
  assert.equal(refund?.href, "/business/engagements/e1");

  const split = describeNotification(
    row("engagement_settled", {
      ...hire,
      outcome: "split",
      released_kobo: 2000000,
      refunded_kobo: 3000000,
    }),
    "business",
  );
  assert.match(split?.body ?? "", /₦20,000/);
  assert.match(split?.body ?? "", /₦30,000/);

  const fault = describeNotification(
    row("engagement_settled", {
      ...hire,
      outcome: "refund_creator_fault",
      released_kobo: 0,
      refunded_kobo: 5154594,
    }),
    "business",
  );
  assert.match(fault?.body ?? "", /₦51,545\.94/);
});

test("payout notifications show the amount and link to the wallet", () => {
  const paid = describeNotification(
    row("payout_paid", { payout_id: "p1", amount_kobo: 4750000 }),
    "influencer",
  );
  assert.equal(paid?.title, "Your ₦47,500 payout was sent");
  assert.equal(paid?.href, "/wallet");

  const failed = describeNotification(
    row("payout_failed", { payout_id: "p1", amount_kobo: 4750000 }),
    "influencer",
  );
  assert.equal(failed?.title, "Your ₦47,500 payout didn’t go through");
  assert.match(failed?.body ?? "", /back in your wallet/i);
  assert.equal(failed?.href, "/wallet");

  const rejected = describeNotification(
    row("payout_rejected", {
      payout_id: "p1",
      amount_kobo: 4750000,
      decision_reason: "The account name does not match.",
    }),
    "influencer",
  );
  assert.equal(rejected?.title, "We couldn’t approve your ₦47,500 payout");
  assert.equal(rejected?.body, "The account name does not match.");
  assert.equal(rejected?.href, "/wallet");
});

test("unknown kinds are skipped, not shown blank", () => {
  assert.equal(describeNotification(row("payment_received")), null);
});
