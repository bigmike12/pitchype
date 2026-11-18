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
    "payment_stranded",
    "work_submitted",
    "submission_denied",
    "review_reminder",
    "dispute_opened",
    "dispute_statement",
    "dispute_withdrawn",
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
  assert.equal(
    forCreator?.title,
    "Ada Kitchen cancelled your paid hire for “Zobo week”",
  );
  assert.equal(forCreator?.href, "/jobs/e1");
  assert.equal(
    forBusiness?.title,
    "Tolu withdrew from your paid hire for “Zobo week”",
  );
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

test("a creator is told what their wallet got, not the gross release", () => {
  const release = describeNotification(
    row("engagement_settled", {
      ...hire,
      outcome: "release",
      released_kobo: 2500000,
      refunded_kobo: 0,
      creator_net_kobo: 2375000,
      creator_fee_kobo: 125000,
    }),
    "influencer",
  );
  assert.equal(
    release?.body,
    "₦23,750 was added to your wallet: the ₦25,000 job price less our ₦1,250 fee.",
  );

  const split = describeNotification(
    row("engagement_settled", {
      ...hire,
      outcome: "split",
      released_kobo: 2000000,
      refunded_kobo: 3000000,
      creator_net_kobo: 1900000,
      creator_fee_kobo: 100000,
    }),
    "influencer",
  );
  assert.equal(
    split?.body,
    "₦19,000 was added to your wallet: ₦20,000 of the job price less our ₦1,000 fee. ₦30,000 went back to the business.",
  );

  // A notice sent before the net was recorded never claims the gross amount
  // reached the wallet.
  const old = describeNotification(
    row("engagement_settled", {
      ...hire,
      outcome: "release",
      released_kobo: 2500000,
      refunded_kobo: 0,
    }),
    "influencer",
  );
  assert.equal(
    old?.body,
    "₦25,000 was released for you. Your wallet gets that less our fee: see the exact amount in your wallet.",
  );

  // The business still hears the gross release: that is what it paid for.
  const business = describeNotification(
    row("engagement_settled", {
      ...hire,
      outcome: "release",
      released_kobo: 2500000,
      refunded_kobo: 0,
      creator_net_kobo: 2375000,
    }),
    "business",
  );
  assert.equal(business?.body, "₦25,000 was released to the creator.");
});

test("payout notifications show the amount and link to the wallet", () => {
  const paid = describeNotification(
    row("payout_paid", { payout_id: "p1", amount_kobo: 4750000 }),
    "influencer",
  );
  assert.equal(paid?.title, "Your ₦47,500 payout was sent");
  // ₦47,500 is over ₦10,000 and up to ₦50,000: ₦25 tier fee + ₦50 stamp duty.
  assert.equal(
    paid?.body,
    "₦47,425 is on its way to your bank after the ₦75 transfer cost.",
  );
  assert.equal(paid?.href, "/wallet");

  const paidNoAmount = describeNotification(
    row("payout_paid", { payout_id: "p1" }),
    "influencer",
  );
  assert.equal(paidNoAmount?.title, "Your payout was sent");
  assert.equal(paidNoAmount?.body, "It’s on its way to your bank account.");

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

test("a stranded payment tells the business where its money is", () => {
  const d = describeNotification(
    row("payment_stranded", {
      ...campaign,
      engagement_id: "e1",
      amount_kobo: 5250000,
    }),
    "business",
  );
  assert.equal(
    d?.title,
    "Your payment of ₦52,500 arrived, but this hire could not be started",
  );
  assert.equal(d?.body, "The money is in your Pitchype wallet.");
  assert.equal(d?.href, "/business/wallet");

  const noAmount = describeNotification(row("payment_stranded"), "business");
  assert.equal(
    noAmount?.title,
    "Your payment arrived, but this hire could not be started",
  );
});

test("a creator's job link falls back to their applications without a hire", () => {
  for (const kind of ["hire_funded", "engagement_settled"]) {
    const d = describeNotification(row(kind, campaign), "influencer");
    assert.equal(d?.href, "/applications", kind);
  }
});

test("a submission tells the business to review, with the deadline", () => {
  const d = describeNotification(
    row("work_submitted", {
      ...hire,
      name: "Tolu",
      review_deadline_at: "2026-11-24T10:00:00Z",
    }),
    "business",
  );
  assert.equal(d?.title, "Tolu submitted work for “Zobo week”");
  assert.match(d?.body ?? "", /24 Nov/);
  assert.match(d?.body ?? "", /automatically/);
  assert.equal(d?.href, "/business/engagements/e1");
});

test("a denial gives the creator the reasons and the rounds left", () => {
  const d = describeNotification(
    row("submission_denied", {
      ...hire,
      reasons: ["Wrong hashtag", "Post is too short"],
      rounds_left: 3,
    }),
    "influencer",
  );
  assert.equal(d?.title, "Ada Kitchen sent back your work for “Zobo week”");
  assert.match(d?.body ?? "", /Wrong hashtag/);
  assert.match(d?.body ?? "", /Post is too short/);
  assert.match(d?.body ?? "", /3 times left/);
  assert.equal(d?.href, "/jobs/e1");

  const last = describeNotification(
    row("submission_denied", {
      ...hire,
      reasons: ["Off brief"],
      rounds_left: 0,
    }),
    "influencer",
  );
  assert.match(last?.body ?? "", /can’t resubmit/);
  const one = describeNotification(
    row("submission_denied", {
      ...hire,
      reasons: ["Off brief"],
      rounds_left: 1,
    }),
    "influencer",
  );
  assert.match(one?.body ?? "", /1 time left/);
});

test("a review reminder says how long is left, with the date", () => {
  const facts = {
    ...hire,
    name: "Tolu",
    review_deadline_at: "2026-11-24T10:00:00Z",
  };
  const last = describeNotification(
    row("review_reminder", { ...facts, days_left: 1 }),
    "business",
  );
  assert.match(last?.title ?? "", /about a day left/i);
  assert.match(last?.body ?? "", /24 Nov/);
  assert.equal(last?.href, "/business/engagements/e1");

  const earlier = describeNotification(
    row("review_reminder", { ...facts, days_left: 3 }),
    "business",
  );
  assert.match(earlier?.title ?? "", /3 days left/);
});

test("dispute notices go to the dispute page for each role", () => {
  const facts = { ...hire, dispute_id: "d1", name: "Tolu" };
  for (const kind of [
    "dispute_opened",
    "dispute_statement",
    "dispute_withdrawn",
  ]) {
    const forBusiness = describeNotification(row(kind, facts), "business");
    const forCreator = describeNotification(row(kind, facts), "influencer");
    assert.equal(forBusiness?.href, "/business/engagements/e1/dispute", kind);
    assert.equal(forCreator?.href, "/jobs/e1/dispute", kind);
    assert.match(forBusiness?.title ?? "", /Tolu/, kind);
  }
  assert.match(
    describeNotification(row("dispute_opened", facts), "business")?.title ?? "",
    /opened a dispute/,
  );
  assert.match(
    describeNotification(row("dispute_withdrawn", facts), "business")?.title ??
      "",
    /withdrew/,
  );
});

test("a creator withdrawing after starting reads as a withdrawal for the business", () => {
  const withdrew = describeNotification(
    row("engagement_settled", {
      ...hire,
      name: "Tolu",
      status: "refunded",
      outcome: "refund_creator_fault",
      settled_by: "influencer",
      released_kobo: 0,
      refunded_kobo: 5154594,
    }),
    "business",
  );
  assert.equal(withdrew?.title, "Tolu withdrew from “Zobo week”");
  assert.match(withdrew?.body ?? "", /₦51,545\.94/);
  assert.equal(withdrew?.href, "/business/engagements/e1");

  // An admin refunding at the creator's fault is not a withdrawal.
  const adminFault = describeNotification(
    row("engagement_settled", {
      ...hire,
      name: "Tolu",
      status: "refunded",
      outcome: "refund_creator_fault",
      settled_by: "admin",
      released_kobo: 0,
      refunded_kobo: 5154594,
    }),
    "business",
  );
  assert.equal(adminFault?.title, "“Zobo week” was settled");
  assert.match(adminFault?.body ?? "", /₦51,545\.94/);

  // Any other settlement keeps the settled wording.
  const refund = describeNotification(
    row("engagement_settled", {
      ...hire,
      name: "Tolu",
      status: "refunded",
      outcome: "refund",
      released_kobo: 0,
      refunded_kobo: 5000000,
    }),
    "business",
  );
  assert.equal(refund?.title, "“Zobo week” was settled");
});

test("an automatic release reads differently from a settlement", () => {
  const auto = describeNotification(
    row("engagement_settled", {
      ...hire,
      status: "auto_released",
      outcome: "release",
      released_kobo: 5000000,
      refunded_kobo: 0,
    }),
    "business",
  );
  assert.equal(auto?.title, "“Zobo week” was released automatically");
  assert.match(auto?.body ?? "", /₦50,000/);
  assert.equal(auto?.href, "/business/engagements/e1");

  const accepted = describeNotification(
    row("engagement_settled", {
      ...hire,
      status: "accepted",
      outcome: "release",
      released_kobo: 5000000,
      refunded_kobo: 0,
    }),
    "influencer",
  );
  assert.equal(accepted?.title, "“Zobo week” was settled");
});

test("unknown kinds are skipped, not shown blank", () => {
  assert.equal(describeNotification(row("payment_received")), null);
});

// Pay per click ----------------------------------------------------------------------------

test("the creator hears their link reached its cap", () => {
  const d = describeNotification(
    row("click_cap_reached", { ...hire, cap: 500, earned_kobo: 2500000 }),
    "influencer",
  );
  assert.equal(d?.title, "Your link for “Zobo week” reached 500 clicks");
  assert.match(d?.body ?? "", /₦25,000/);
  assert.equal(d?.href, "/jobs/e1");
});

test("both sides hear the clicks are in, and when it settles", () => {
  const facts = {
    ...hire,
    settles_at: "2026-12-28T00:00:00+01:00",
    billable: 200,
    earned_kobo: 1000000,
  };
  const creator = describeNotification(
    row("click_hold_started", facts),
    "influencer",
  );
  assert.equal(creator?.title, "Clicks are in for “Zobo week”");
  assert.match(creator?.body ?? "", /200 clicks/);
  assert.match(creator?.body ?? "", /You’ll be paid on/);
  assert.equal(creator?.href, "/jobs/e1");

  const business = describeNotification(
    row("click_hold_started", facts),
    "business",
  );
  assert.equal(business?.title, "Clicks are in for “Zobo week”");
  assert.match(business?.body ?? "", /settles on/);
  assert.match(business?.body ?? "", /raise it before then/i);
  assert.equal(business?.href, "/business/engagements/e1");
});
