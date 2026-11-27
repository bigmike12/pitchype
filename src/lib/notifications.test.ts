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
    "portfolio_sample_hidden",
    "cover_removed",
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
    "identity_verified",
    "identity_failed",
    "identity_needs_review",
    "kickoff_done",
    "checkpoint_done",
    "checkpoint_late",
    "checkpoint_reminder",
    "checkpoint_overdue",
    "checkpoint_warning",
    "checkpoint_dispute_available",
    "feedback_shipped",
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

test("an extra the card payment collected is not called stranded", () => {
  const d = describeNotification(
    row("payment_stranded", {
      ...campaign,
      engagement_id: "e1",
      amount_kobo: 18528,
      extra: true,
    }),
    "business",
  );
  assert.equal(
    d?.title,
    "The extra ₦185.28 you paid is in your Pitchype wallet",
  );
  assert.match(d?.body ?? "", /^Your hire is paid\./);
  assert.equal(d?.href, "/business/wallet");
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

test("the business hears a per-click creator withdrew", () => {
  const d = describeNotification(
    row("clicks_stopped", { ...hire, settles_at: "2026-12-28T00:00:00+01:00" }),
    "business",
  );
  assert.equal(d?.title, "Ada Kitchen withdrew from “Zobo week”");
  assert.match(d?.body ?? "", /stopped counting/);
  assert.equal(d?.href, "/business/engagements/e1");
});

test("a taken-down sample and a removed cover say why, and link to the editor", () => {
  const sample = describeNotification(
    row("portfolio_sample_hidden", {
      note: "Shows a phone number",
      caption: "Party jollof",
    }),
  );
  assert.equal(sample?.title, "We took down a work sample: “Party jollof”");
  assert.equal(sample?.body, "Shows a phone number");
  assert.equal(sample?.href, "/profile#samples");

  const untitled = describeNotification(
    row("portfolio_sample_hidden", { note: "Not your work" }),
  );
  assert.equal(untitled?.title, "We took down one of your work samples");

  const cover = describeNotification(
    row("cover_removed", { note: "Shows a phone number" }),
  );
  assert.equal(cover?.title, "We removed your cover picture");
  assert.equal(cover?.body, "Shows a phone number");
  assert.equal(cover?.href, "/profile#cover");
});

test("a confirmed identity says so and links to the account page", () => {
  const d = describeNotification(
    row("identity_verified", { kind: "creator_nin" }),
    "influencer",
  );
  assert.equal(d?.title, "Your identity is confirmed");
  assert.equal(d?.href, "/account#identity");
});

test("a check in review says how long it usually takes, without saying why", () => {
  const d = describeNotification(row("identity_needs_review", {}), "business");
  assert.equal(d?.title, "We’re taking a closer look");
  assert.match(d?.body ?? "", /1–2 working days/);
  assert.doesNotMatch(`${d?.title} ${d?.body}`, /duplicate|sanction|match/i);
});

test("a failed identity check says what to fix for each reason", () => {
  const cases: [string, string, RegExp][] = [
    ["creator_nin", "name_mismatch", /NIN/],
    ["owner_nin", "name_mismatch", /NIN/],
    ["business_cac", "name_mismatch", /CAC/],
    ["creator_nin", "selfie_mismatch", /light/i],
    ["creator_nin", "liveness_failed", /light/i],
    ["creator_nin", "id_not_found", /NIN/],
    ["owner_nin", "id_not_found", /NIN/],
    ["business_cac", "company_not_found", /registration number/i],
    ["business_cac", "company_inactive", /not active/i],
    ["director_nin", "not_a_director", /director/i],
    ["creator_nin", "provider_unavailable", /try again/i],
    ["creator_nin", "other", /try again/i],
    ["creator_nin", "something_new", /try again/i],
  ];
  for (const [kind, reason, expected] of cases) {
    const d = describeNotification(
      row("identity_failed", { kind, reason }),
      "influencer",
    );
    assert.equal(d?.title, "We couldn’t confirm your identity", reason);
    assert.match(d?.body ?? "", expected, `${kind} ${reason}`);
    assert.equal(d?.href, "/account#identity");
  }
});

test("a duplicate-identity rejection stays neutral about why", () => {
  const d = describeNotification(
    row("identity_failed", {
      kind: "creator_nin",
      reason: "duplicate_identity",
    }),
    "influencer",
  );
  assert.match(d?.body ?? "", /contact us/i);
  assert.doesNotMatch(d?.body ?? "", /another account|duplicate/i);
});

test("checkpoint notices tell the business who sent what, and link to the hire", () => {
  const kickoff = describeNotification(
    row("kickoff_done", { ...hire, name: "Tolu", kickoff: true }),
    "business",
  );
  assert.equal(kickoff?.title, "Tolu confirmed the kickoff for “Zobo week”");
  assert.equal(kickoff?.href, "/business/engagements/e1");

  const done = describeNotification(
    row("checkpoint_done", { ...hire, name: "Tolu", due_on: "2026-12-08" }),
    "business",
  );
  assert.equal(done?.title, "Tolu sent a progress checkpoint for “Zobo week”");
  assert.match(done?.body ?? "", /8 Dec 2026/);

  const late = describeNotification(
    row("checkpoint_late", { ...hire, name: "Tolu", due_on: "2026-12-08" }),
    "business",
  );
  assert.match(late?.title ?? "", /late/);
  assert.match(late?.body ?? "", /No money is held back/);

  const lateKickoff = describeNotification(
    row("checkpoint_late", { ...hire, name: "Tolu", kickoff: true }),
    "business",
  );
  assert.match(lateKickoff?.title ?? "", /kickoff/);
  assert.match(lateKickoff?.title ?? "", /after it was due/);
});

test("the reminder and warning go to the creator and never threaten money", () => {
  const reminder = describeNotification(
    row("checkpoint_reminder", {
      ...hire,
      kickoff: true,
      due_at: "2026-12-07T09:00:00Z",
    }),
    "influencer",
  );
  assert.match(reminder?.title ?? "", /Your kickoff/);
  assert.equal(reminder?.href, "/jobs/e1");

  const warning = describeNotification(
    row("checkpoint_warning", {
      ...hire,
      dispute_from: "2026-12-12T09:00:00Z",
    }),
    "influencer",
  );
  assert.match(warning?.body ?? "", /open a dispute/);
  assert.match(warning?.body ?? "", /No money is held back/);
  assert.equal(warning?.href, "/jobs/e1");
});

test("an overdue checkpoint reads differently for each side", () => {
  const forBusiness = describeNotification(
    row("checkpoint_overdue", { ...hire, name: "Tolu" }),
    "business",
  );
  const forCreator = describeNotification(
    row("checkpoint_overdue", { ...hire, name: "Ada Kitchen" }),
    "influencer",
  );
  assert.match(forBusiness?.title ?? "", /Tolu’s checkpoint/);
  assert.equal(forBusiness?.href, "/business/engagements/e1");
  assert.match(forCreator?.title ?? "", /Your checkpoint/);
  assert.equal(forCreator?.href, "/jobs/e1");
});

test("dispute available tells the business, and leads to the dispute page", () => {
  const d = describeNotification(
    row("checkpoint_dispute_available", { ...hire, name: "Tolu" }),
    "business",
  );
  assert.match(d?.title ?? "", /open a dispute about missing work/);
  assert.equal(d?.href, "/business/engagements/e1/dispute");
});

test("a shipped request names it and carries the admin's note", () => {
  const d = describeNotification(
    row("feedback_shipped", {
      number: 42,
      title: "Dark mode",
      note: "In your settings",
    }),
    "influencer",
  );
  assert.equal(d?.title, "Something you asked for is live");
  assert.equal(d?.body, "#42 Dark mode. In your settings");
  assert.equal(d?.href, "/feedback");
});

test("a shipped request without a note ends at its title", () => {
  const d = describeNotification(
    row("feedback_shipped", { number: 42, title: "Dark mode", note: null }),
  );
  assert.equal(d?.body, "#42 Dark mode");
});
