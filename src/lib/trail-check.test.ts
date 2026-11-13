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

// Shapes written by the database (20261113100100 funding, 100200 settlement,
// 100250 fault refund). Wallets, escrow and revenue are negative; paystack
// cash and expenses are positive.
const funding = (
  event: "payment_received" | "hire_funded" = "payment_received",
) =>
  event === "payment_received"
    ? group(event, [
        line("escrow", -5_000_000),
        line("platform_revenue", -250_000),
        line("paystack", 5_250_000),
      ])
    : group(event, [
        line("escrow", -5_000_000),
        line("platform_revenue", -250_000),
        line("business_wallet", 5_250_000),
      ]);

const paystackFee = (kobo: number) =>
  group("paystack_fee", [line("paystack", -kobo), line("paystack_fees", kobo)]);

// A late card payment that could not fund the hire lands in the wallet.
const stranded = () =>
  group("payment_received", [
    line("paystack", 5_250_000),
    line("business_wallet", -5_250_000),
  ]);

const fundedNotSettled = (): EngagementTrail => {
  const t = released();
  t.engagement.status = "in_progress";
  t.engagement.settledAt = null;
  t.engagement.settleOutcome = null;
  t.engagement.releasedKobo = null;
  t.engagement.refundedKobo = null;
  t.groups = [funding()];
  return t;
};

test("shape: a lapsed unpaid hire has nothing to check", () => {
  const t = fundedNotSettled();
  t.engagement.status = "cancelled";
  t.engagement.fundedAt = null;
  t.engagement.businessFeeKobo = null;
  t.groups = [];
  assert.deepEqual(checkTrail(t), { ok: true, problems: [] });
});

test("shape: a stranded payment on a hire that was never funded adds up", () => {
  const t = fundedNotSettled();
  t.engagement.fundedAt = null;
  t.engagement.businessFeeKobo = null;
  t.groups = [stranded(), paystackFee(95_406)];
  assert.deepEqual(checkTrail(t), { ok: true, problems: [] });
});

test("shape: a funded hire that has not been settled holds the price in escrow", () => {
  assert.deepEqual(checkTrail(fundedNotSettled()), { ok: true, problems: [] });
});

test("shape: a funded hire with a late stranded payment adds up", () => {
  const t = fundedNotSettled();
  t.groups = [funding(), paystackFee(95_406), stranded(), paystackFee(95_406)];
  assert.deepEqual(checkTrail(t), { ok: true, problems: [] });
});

test("shape: a hire paid wholly from the wallet (hire_funded) and released adds up", () => {
  const t = released();
  t.groups[0] = funding("hire_funded");
  assert.deepEqual(checkTrail(t), { ok: true, problems: [] });
});

test("shape: a paid cancellation by the business adds up", () => {
  const t = released();
  t.engagement.status = "cancelled";
  t.engagement.settleOutcome = "refund";
  t.engagement.releasedKobo = 0;
  t.engagement.refundedKobo = 5_000_000;
  t.engagement.cancelledAt = "2026-11-13T10:00:00Z";
  t.groups = [
    funding(),
    paystackFee(95_406),
    group("hire_settled", [
      line("escrow", 5_000_000),
      line("business_wallet", -5_000_000),
    ]),
  ];
  assert.deepEqual(checkTrail(t), { ok: true, problems: [] });
});

test("shape: a creator-fault refund (price + fee less the card charge) adds up", () => {
  const t = released();
  t.engagement.status = "refunded";
  t.engagement.settleOutcome = "refund_creator_fault";
  t.engagement.releasedKobo = 0;
  t.engagement.refundedKobo = 5_154_594;
  t.groups = [
    funding(),
    paystackFee(95_406),
    group("hire_settled", [
      line("escrow", 5_000_000),
      line("platform_revenue", 154_594),
      line("business_wallet", -5_154_594),
    ]),
  ];
  assert.deepEqual(checkTrail(t), { ok: true, problems: [] });
});

test("a settled hire with no settlement lines is flagged", () => {
  const t = released();
  t.groups = [funding()];
  const result = checkTrail(t);
  assert.equal(result.ok, false);
  assert.match(result.problems.join("\n"), /no settlement/);
});

test("two settlements on one hire are flagged", () => {
  const t = released();
  t.groups.push(
    group("hire_settled", [
      line("escrow", 100_000),
      line("business_wallet", -100_000),
    ]),
  );
  const result = checkTrail(t);
  assert.equal(result.ok, false);
  assert.match(result.problems.join("\n"), /more than one settlement/);
});

test("settlement lines on a hire not marked settled are flagged", () => {
  const t = released();
  t.engagement.settledAt = null;
  const result = checkTrail(t);
  assert.equal(result.ok, false);
  assert.match(result.problems.join("\n"), /not marked settled/);
});

test("escrow drained by another kind of group is flagged on a funded hire", () => {
  const t = fundedNotSettled();
  t.groups.push(
    group("correction", [
      line("escrow", 1_000_000),
      line("business_wallet", -1_000_000),
    ]),
  );
  const result = checkTrail(t);
  assert.equal(result.ok, false);
  assert.match(result.problems.join("\n"), /Escrow holds/);
});

test("escrow left over after settlement by another kind of group is flagged", () => {
  const t = released();
  t.groups.push(
    group("correction", [
      line("escrow", 1_000_000),
      line("business_wallet", -1_000_000),
    ]),
  );
  const result = checkTrail(t);
  assert.equal(result.ok, false);
  assert.match(result.problems.join("\n"), /Escrow holds/);
});

test("escrow lines on a hire that was never paid for are flagged", () => {
  const t = fundedNotSettled();
  t.engagement.fundedAt = null;
  const result = checkTrail(t);
  assert.equal(result.ok, false);
});
