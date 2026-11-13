import assert from "node:assert/strict";
import { test } from "node:test";

import type { EngagementTrail } from "./db/money.ts";
import { checkTrail } from "./trail-check.ts";

type Group = EngagementTrail["groups"][number];
type Line = Group["lines"][number];

const line = (account: string, amountKobo: number): Line => ({
  account,
  ownerName: null,
  amountKobo,
});

const group = (eventType: string, lines: Line[]): Group => ({
  groupId: `${eventType}-${lines.length}`,
  eventType,
  createdAt: "2026-11-13T09:00:00Z",
  actorUserId: null,
  actorName: "System",
  reason: null,
  paystackReference: null,
  paymentId: null,
  payoutId: null,
  lines,
});

// A ₦50,000 hire paid by card (₦52,500) and released in full: the creator
// gets ₦47,500 and the platform ₦2,500 from each side.
function released(): EngagementTrail {
  return {
    engagement: {
      id: "e1",
      status: "accepted",
      agreedPriceKobo: 5_000_000,
      approvedAt: "",
      payBy: "",
      cancelledAt: null,
      cancelReason: null,
      fundedAt: "2026-11-13T09:00:00Z",
      startedAt: null,
      settledAt: "2026-11-13T10:00:00Z",
      settleOutcome: "release",
      releasedKobo: 5_000_000,
      refundedKobo: 0,
      businessFeeKobo: 250_000,
      creatorFeeBps: 500,
      creatorMinFeeKobo: 50_000,
      campaignId: "c1",
      campaignTitle: "Campaign",
      businessId: "b1",
      businessName: "Biz",
      creatorId: "u1",
      creatorName: "Ada",
      feeConfigId: "f1",
      cancelFeeNoticeSeenAt: null,
    },
    payments: [],
    groups: [
      group("payment_received", [
        line("escrow", -5_000_000),
        line("platform_revenue", -250_000),
        line("paystack", 5_250_000),
      ]),
      group("hire_settled", [
        line("escrow", 5_000_000),
        line("creator_wallet", -4_750_000),
        line("platform_revenue", -250_000),
      ]),
    ],
    payouts: [],
  };
}

test("a consistent trail adds up", () => {
  assert.deepEqual(checkTrail(released()), { ok: true, problems: [] });
});

test("a hire that was refunded with the business fee kept adds up", () => {
  const trail = released();
  trail.engagement.releasedKobo = 0;
  trail.engagement.refundedKobo = 5_000_000;
  trail.groups[1] = group("hire_settled", [
    line("escrow", 5_000_000),
    line("business_wallet", -5_000_000),
  ]);
  assert.deepEqual(checkTrail(trail), { ok: true, problems: [] });
});

test("a hire that never reached funding has nothing to check", () => {
  const trail = released();
  trail.groups = [];
  trail.engagement.fundedAt = null;
  trail.engagement.settledAt = null;
  trail.engagement.releasedKobo = null;
  trail.engagement.refundedKobo = null;
  trail.engagement.businessFeeKobo = null;
  assert.deepEqual(checkTrail(trail), { ok: true, problems: [] });
});

test("a group whose lines do not sum to zero is named", () => {
  const trail = released();
  trail.groups[0]!.lines[2] = line("paystack", 5_250_100);
  const result = checkTrail(trail);
  assert.equal(result.ok, false);
  assert.match(result.problems.join("\n"), /do not add up to zero/);
});

test("escrow funded for a different amount than the price is named", () => {
  const trail = released();
  trail.groups[0]!.lines[0] = line("escrow", -4_900_000);
  trail.groups[0]!.lines[2] = line("paystack", 5_150_000);
  const result = checkTrail(trail);
  assert.equal(result.ok, false);
  assert.match(result.problems.join("\n"), /put into escrow/);
});

test("a business fee recorded as a different amount is named", () => {
  const trail = released();
  trail.groups[0]!.lines[1] = line("platform_revenue", -200_000);
  trail.groups[0]!.lines[2] = line("paystack", 5_200_000);
  const result = checkTrail(trail);
  assert.equal(result.ok, false);
  assert.match(result.problems.join("\n"), /business fee/);
});

test("escrow that is not emptied by the settlement is named", () => {
  const trail = released();
  trail.groups[1]!.lines[0] = line("escrow", 4_000_000);
  trail.groups[1]!.lines[1] = line("creator_wallet", -3_750_000);
  const result = checkTrail(trail);
  assert.equal(result.ok, false);
  assert.match(result.problems.join("\n"), /taken out of escrow/);
});

test("a creator credit and fee that do not make the released amount are named", () => {
  const trail = released();
  trail.groups[1]!.lines[1] = line("creator_wallet", -4_700_000);
  trail.groups[1]!.lines[2] = line("platform_revenue", -250_000);
  trail.groups[1]!.lines.push(line("business_wallet", -50_000));
  trail.groups[1]!.lines[0] = line("escrow", 5_000_000);
  const result = checkTrail(trail);
  assert.equal(result.ok, false);
  assert.match(result.problems.join("\n"), /released/);
});

test("a paid hire with no payment lines is named", () => {
  const trail = released();
  trail.groups = [];
  trail.engagement.settledAt = null;
  const result = checkTrail(trail);
  assert.equal(result.ok, false);
  assert.match(result.problems.join("\n"), /no payment/);
});
