// Races the Stage 6 and 7 money functions against each other on the local Supabase
// database, each call in its own Postgres session, and checks that money
// never moves twice and the ledger always balances. pgTAP runs in one
// transaction, so it cannot show what happens when sessions overlap; this can.
// Development only: never point it at the live database.
//
//   node scripts/money-race.mjs
//
// Needs Docker with local Supabase running (container supabase_db_pitchype,
// or set RACE_DB_CONTAINER). Reads no env file and no secrets. Prints one
// PASS/FAIL line per scenario and exits 1 if any fails. Every psql session is
// bounded (statement and lock timeouts, and a kill after 45 s), so a stuck
// call fails its scenario instead of hanging the run.
//
// What the invariants prove: the zero-sum, balanced-group and reconciliation
// checks are guaranteed by post_ledger_group() itself, so they are only a
// tripwire for writes that bypass it; the strong per-hire check is
// escrow_not_matching_status, with the overdraft checks per wallet and payout.
//
// The ledger is append-only, so the rows this makes stay in the local
// database for good. They are harmless: every person's email ends
// @race.pitchype.test and every id is random, so reruns never collide.
//
// How calls are made to overlap: see race() in money-race-lib.mjs.

import { randomUUID } from "node:crypto";

import {
  RUN,
  as,
  crayCreatorWithBalance,
  crayPayoutFacts,
  depositCall,
  depositFacts,
  getProvider,
  newDeposit,
  setProvider,
  startTransfer,
  transferAccount,
  clickCall,
  clickHireFacts,
  heldClickHire,
  startedClickHire,
  attempt,
  charge,
  checker,
  creatorWithBalance,
  denyCall,
  deniedHire,
  disputeFacts,
  disputedHire,
  eventKey,
  eventsStored,
  fmt,
  fund,
  hireFacts,
  invariants,
  json,
  lit,
  must,
  newAdmin,
  newHire,
  overdueHire,
  overlap,
  paymentFacts,
  paymentsOf,
  payoutFacts,
  race,
  racePair,
  recordCall,
  requestPayout,
  resetOverlap,
  run,
  settleCall,
  startPayment,
  startedHire,
  submissionFacts,
  submitCall,
  submittedHire,
  sweepCall,
  tally,
  times,
  wallet,
} from "./money-race-lib.mjs";

const PRICE = 5_000_000; // ₦50,000
const CREATOR_NET = 4_750_000; // after the 5% creator fee

function sameCounts(c, label, outcomes, expected) {
  c.eq(label, fmt(tally(outcomes)), fmt(expected));
}

// The hire's clock and its payment's age, set by hand (as the pgTAP tests do).
async function age(hire, payment, { payByAgo, paymentAgo }) {
  await run(`
update public.engagements set pay_by = now() - interval ${lit(payByAgo)} where id = ${lit(hire.id)};
update public.payments set created_at = now() - interval ${lit(paymentAgo)} where reference = ${lit(payment.reference)};`);
}

// 1–2 ---------------------------------------------------------------------------------------------------

async function sameEventKey(c) {
  const hire = await newHire(PRICE);
  const payment = await startPayment(hire);
  const key = `charge.success:${payment.reference}`;
  const outcomes = await race(
    times(5, () => ({ who: as.service, call: recordCall(payment, key) })),
  );
  sameCounts(c, "outcomes", outcomes, { funded: 1, duplicate: 4 });
  const f = await hireFacts(hire);
  c.eq("hire", f.status, "funded");
  c.eq("escrow", f.escrow, -PRICE);
  c.eq("funding groups", f.fundings, 1);
  c.eq("charge groups", f.charges, 1);
  c.eq("events stored", await eventsStored([key]), 1);
  return fmt(tally(outcomes));
}

async function differentEventKeys(c) {
  const hire = await newHire(PRICE);
  const payment = await startPayment(hire);
  const keys = times(
    5,
    (i) => `charge.success:${payment.reference}:${RUN}:${i}`,
  );
  const outcomes = await race(
    keys.map((key) => ({ who: as.service, call: recordCall(payment, key) })),
  );
  sameCounts(c, "outcomes", outcomes, { funded: 1, duplicate: 4 });
  const f = await hireFacts(hire);
  c.eq("hire", f.status, "funded");
  c.eq("escrow", f.escrow, -PRICE);
  c.eq("funding groups", f.fundings, 1);
  c.eq("charge groups", f.charges, 1);
  c.eq("events stored", await eventsStored(keys), 5);
  return fmt(tally(outcomes));
}

// 3 -----------------------------------------------------------------------------------------------------

// The lapse is scoped to the hire's own campaign so it never touches other local data.
function expireCall(hire) {
  return `public.expire_unpaid_engagements(${lit(hire.campaign)})`;
}

async function paymentVsLapse(c) {
  // Inside the 30-minute hold: the payment wins whatever the order. Five
  // rounds, launched in alternating order, so a missing in-flight guard
  // cannot pass by ordering luck.
  const inHold = [];
  for (let round = 1; round <= 5; round++) {
    const held = await newHire(PRICE);
    const p1 = await startPayment(held);
    await age(held, p1, { payByAgo: "1 minute", paymentAgo: "5 minutes" });
    const pair = await racePair(
      { who: as.service, call: recordCall(p1, eventKey("lapse-held")) },
      { who: as.service, call: expireCall(held) },
      round % 2 === 0,
    );
    inHold.push(...pair);
    c.eq(`in hold round ${round}: [payment, lapse]`, pair, ["funded", "0"]);
    const f1 = await hireFacts(held);
    c.eq(
      `in hold round ${round}: hire`,
      [f1.status, f1.cancel_reason, f1.escrow, f1.stranded],
      ["funded", null, -PRICE, 0],
    );
  }

  // Hold expired: the hire lapses and the late money lands in the wallet.
  const lapsed = await newHire(PRICE);
  const p2 = await startPayment(lapsed);
  await age(lapsed, p2, { payByAgo: "1 hour", paymentAgo: "40 minutes" });
  const late = await race([
    { who: as.service, call: recordCall(p2, eventKey("lapse-late")) },
    { who: as.service, call: expireCall(lapsed) },
  ]);
  c.eq("hold expired: [payment, lapse]", late, ["stranded", "1"]);
  const f2 = await hireFacts(lapsed);
  c.eq(
    "hold expired: hire",
    [f2.status, f2.cancel_reason],
    ["cancelled", "payment_expired"],
  );
  c.eq("hold expired: escrow", f2.escrow, 0);
  c.eq("hold expired: business wallet", f2.business_wallet, p2.card);
  return `in hold ${fmt(tally(inHold))} | expired ${fmt(tally(late))}`;
}

// 4 -----------------------------------------------------------------------------------------------------

async function paymentVsCancel(c) {
  // Payment in flight: the cancel is always refused.
  const fresh = await newHire(PRICE);
  const p = await startPayment(fresh);
  const [paid, cancel] = await race([
    { who: as.service, call: recordCall(p, eventKey("cancel-fresh")) },
    {
      who: as.user(fresh.business),
      call: `public.cancel_engagement(${lit(fresh.id)})`,
    },
  ]);
  c.eq("in flight: payment", paid, "funded");
  c.ok(
    `in flight: cancel refused (${cancel})`,
    ["error:payment_in_progress", "error:engagement_locked"].includes(cancel),
  );
  const f = await hireFacts(fresh);
  c.eq(
    "in flight: hire",
    [f.status, f.escrow, f.business_wallet],
    ["funded", -PRICE, 0],
  );

  // Payment older than the hold (pay_by still ahead): either side may win, never both.
  const winners = [];
  for (let round = 1; round <= 3; round++) {
    const hire = await newHire(PRICE);
    const old = await startPayment(hire);
    await run(
      `update public.payments set created_at = now() - interval '40 minutes' where reference = ${lit(old.reference)};`,
    );
    const [result, cancelled] = await racePair(
      { who: as.service, call: recordCall(old, eventKey("cancel-old")) },
      {
        who: as.user(hire.business),
        call: `public.cancel_engagement(${lit(hire.id)})`,
      },
      round % 2 === 0,
    );
    const h = await hireFacts(hire);
    if (result === "funded") {
      winners.push("payment");
      c.eq(
        `round ${round} payment won: cancel`,
        cancelled,
        "error:engagement_locked",
      );
      c.eq(
        `round ${round} payment won: hire`,
        [h.status, h.escrow, h.business_wallet, h.stranded],
        ["funded", -PRICE, 0, 0],
      );
    } else {
      winners.push("cancel");
      c.eq(
        `round ${round} cancel won: [payment, cancel]`,
        [result, cancelled],
        ["stranded", "ok"],
      );
      c.eq(
        `round ${round} cancel won: hire`,
        [h.status, h.cancel_reason, h.escrow, h.fundings],
        ["cancelled", "cancelled_by_business", 0, 0],
      );
      c.eq(
        `round ${round} cancel won: wallet holds the card amount`,
        h.business_wallet,
        old.card,
      );
    }
  }
  c.winners("stale hold", winners);
  return `in flight [${paid}, ${cancel}] | stale hold winners ${fmt(tally(winners))}`;
}

// 5 -----------------------------------------------------------------------------------------------------

async function supersededPayments(c) {
  // As reported: the superseded payment A arrives first, then B.
  const hire = await newHire(PRICE);
  const a = await startPayment(hire);
  const b = await startPayment(hire); // marks A failed
  c.eq("A superseded", (await paymentFacts(a.reference)).status, "failed");
  const first = await attempt(
    as.service,
    recordCall(a, eventKey("superseded-a")),
  );
  const second = await attempt(
    as.service,
    recordCall(b, eventKey("superseded-b")),
  );
  c.eq("[A, B]", [first, second], ["funded", "stranded"]);
  const f = await hireFacts(hire);
  c.eq(
    "hire",
    [f.status, f.escrow, f.fundings, f.stranded],
    ["funded", -PRICE, 1, 1],
  );
  c.eq("business wallet holds B", f.business_wallet, b.card);
  c.eq("both charges booked", f.charges, 2);

  // Both successes at once: one funds, the other is stranded.
  const hire2 = await newHire(PRICE);
  const a2 = await startPayment(hire2);
  const b2 = await startPayment(hire2);
  const both = await race([
    { who: as.service, call: recordCall(a2, eventKey("superseded-a2")) },
    { who: as.service, call: recordCall(b2, eventKey("superseded-b2")) },
  ]);
  sameCounts(c, "concurrent outcomes", both, { funded: 1, stranded: 1 });
  const f2 = await hireFacts(hire2);
  c.eq(
    "concurrent hire",
    [f2.status, f2.escrow, f2.fundings, f2.stranded],
    ["funded", -PRICE, 1, 1],
  );
  c.eq("concurrent wallet holds one card amount", f2.business_wallet, b2.card);
  return `sequential [${first}, ${second}] | concurrent ${fmt(tally(both))}`;
}

// 6 -----------------------------------------------------------------------------------------------------

async function settlementRaces(c) {
  const hire = await newHire(PRICE);
  await fund(hire);
  const releases = await race(
    times(5, () => ({ who: as.postgres, call: settleCall(hire, "release") })),
  );
  sameCounts(c, "5× release", releases, { ok: 5 });
  const f = await hireFacts(hire);
  c.eq(
    "release: hire",
    [f.status, f.settle_outcome, f.escrow],
    ["accepted", "release", 0],
  );
  c.eq("release: settlement groups", f.settlements, 1);
  c.eq("release: creator fee lines", f.creator_fee_lines, 1);
  c.eq("release: creator wallet credited once", f.creator_wallet, CREATOR_NET);

  const winners = [];
  for (let round = 1; round <= 3; round++) {
    const h = await newHire(PRICE);
    await fund(h);
    const outcomes = await racePair(
      { who: as.postgres, call: settleCall(h, "release") },
      { who: as.postgres, call: settleCall(h, "refund") },
      round % 2 === 0,
    );
    sameCounts(c, `round ${round} release vs refund`, outcomes, { ok: 2 });
    const g = await hireFacts(h);
    winners.push(g.settle_outcome);
    c.eq(
      `round ${round}: escrow emptied once`,
      [g.escrow, g.settlements],
      [0, 1],
    );
    if (g.settle_outcome === "release") {
      c.eq(
        `round ${round} release won: wallets`,
        [g.creator_wallet, g.business_wallet],
        [CREATOR_NET, 0],
      );
    } else {
      c.eq(
        `round ${round} refund won: hire`,
        [g.status, g.settle_outcome],
        ["refunded", "refund"],
      );
      c.eq(
        `round ${round} refund won: wallets`,
        [g.creator_wallet, g.business_wallet],
        [0, PRICE],
      );
    }
  }
  c.winners("release vs refund", winners);
  return `5× release ${fmt(tally(releases))} | release vs refund winners ${fmt(tally(winners))}`;
}

// 7 -----------------------------------------------------------------------------------------------------

async function startVsCancel(c) {
  const winners = [];
  for (let round = 1; round <= 3; round++) {
    const hire = await newHire(PRICE);
    await fund(hire);
    const [started, cancelled] = await racePair(
      {
        who: as.user(hire.creator),
        call: `public.start_engagement(${lit(hire.id)})`,
      },
      {
        who: as.user(hire.business),
        call: `public.cancel_funded_engagement(${lit(hire.id)}, true)`,
      },
      round % 2 === 0,
    );
    const f = await hireFacts(hire);
    if (started === "ok") {
      winners.push("start");
      c.eq(
        `round ${round} start won: cancel`,
        cancelled,
        "error:engagement_locked",
      );
      c.eq(
        `round ${round} start won: hire`,
        [f.status, f.escrow, f.business_wallet],
        ["in_progress", -PRICE, 0],
      );
    } else {
      winners.push("cancel");
      c.eq(
        `round ${round} cancel won: [start, cancel]`,
        [started, cancelled],
        ["error:engagement_locked", "ok"],
      );
      c.eq(
        `round ${round} cancel won: hire`,
        [f.status, f.cancel_reason, f.escrow, f.settlements],
        ["cancelled", "cancelled_by_business", 0, 1],
      );
      c.eq(
        `round ${round} cancel won: business wallet got the price once`,
        f.business_wallet,
        PRICE,
      );
    }
  }
  c.winners("start vs cancel", winners);
  return `winners ${fmt(tally(winners))}`;
}

// 8 -----------------------------------------------------------------------------------------------------

function payoutCall(amount) {
  return `case when public.request_payout(${amount}) is not null then 'ok' end`;
}

async function payoutRequestRace(c) {
  // ₦5,000 hire, ₦2,000 released, ₦500 minimum creator fee: ₦1,500 in the wallet.
  const small = await creatorWithBalance(500_000, 200_000);
  c.eq("wallet before", await wallet(small.creator, "creator_wallet"), 150_000);
  const two = await race(
    times(2, () => ({
      who: as.user(small.creator),
      call: payoutCall(100_000),
    })),
  );
  sameCounts(c, "2× ₦1,000 against ₦1,500", two, {
    ok: 1,
    "error:payout_not_enough_balance": 1,
  });
  c.eq("wallet after", await wallet(small.creator, "creator_wallet"), 50_000);

  // ₦4,000 released: ₦3,500 in the wallet; five ₦1,000 requests (the minimum).
  const mid = await creatorWithBalance(500_000, 400_000);
  c.eq(
    "wallet before (second creator)",
    await wallet(mid.creator, "creator_wallet"),
    350_000,
  );
  const five = await race(
    times(5, () => ({ who: as.user(mid.creator), call: payoutCall(100_000) })),
  );
  const granted = five.filter((o) => o === "ok").length;
  sameCounts(c, "5× ₦1,000 against ₦3,500", five, {
    ok: 3,
    "error:payout_not_enough_balance": 2,
  });
  c.ok(`granted × ₦1,000 ≤ ₦3,500 (${granted})`, granted * 100_000 <= 350_000);
  c.eq(
    "wallet after (second creator)",
    await wallet(mid.creator, "creator_wallet"),
    350_000 - granted * 100_000,
  );
  return `2× ${fmt(tally(two))} | 5× ${fmt(tally(five))}`;
}

// 9 -----------------------------------------------------------------------------------------------------

async function payoutApprovalRace(c) {
  const admin = await newAdmin();
  const hire = await creatorWithBalance(PRICE, PRICE);
  const payouts = [];
  for (let i = 0; i < 4; i++)
    payouts.push(await requestPayout(hire.creator, 100_000));

  const approve = (id) =>
    `case when public.approve_payout(${lit(id)}) is not null then 'ok' end`;
  const five = await race(
    times(5, () => ({ who: as.user(admin), call: approve(payouts[0]) })),
  );
  sameCounts(c, "5× approve", five, { ok: 1, "error:payout_not_pending": 4 });
  const first = await payoutFacts(payouts[0]);
  c.eq(
    "approved payout",
    [first.status, first.reference, first.in_flight],
    ["processing", `pit_po_${payouts[0].replaceAll("-", "")}`, -100_000],
  );
  c.eq("approval moves no money", first.groups, { payout_requested: 1 });

  const winners = [];
  for (const [i, id] of payouts.slice(1).entries()) {
    const round = i + 1;
    const [approved, rejected] = await racePair(
      { who: as.user(admin), call: approve(id) },
      {
        who: as.user(admin),
        call: `public.reject_payout(${lit(id)}, 'race test')`,
      },
      round % 2 === 0,
    );
    const p = await payoutFacts(id);
    if (approved === "ok") {
      winners.push("approve");
      c.eq(
        `round ${round} approve won: reject`,
        rejected,
        "error:payout_not_pending",
      );
      c.eq(
        `round ${round} approve won: payout`,
        [p.status, p.in_flight],
        ["processing", -100_000],
      );
    } else {
      winners.push("reject");
      c.eq(
        `round ${round} reject won: [approve, reject]`,
        [approved, rejected],
        ["error:payout_not_pending", "ok"],
      );
      c.eq(
        `round ${round} reject won: payout`,
        [p.status, p.in_flight, p.groups.payout_rejected],
        ["rejected", 0, 1],
      );
    }
  }
  const held = 100_000 * (1 + winners.filter((w) => w === "approve").length);
  c.eq(
    "creator wallet",
    await wallet(hire.creator, "creator_wallet"),
    CREATOR_NET - held,
  );
  c.winners("approve vs reject", winners);
  return `5× approve ${fmt(tally(five))} | approve vs reject winners ${fmt(tally(winners))}`;
}

// 10 ----------------------------------------------------------------------------------------------------

async function finishRace(c) {
  const admin = await newAdmin();
  const hire = await creatorWithBalance(PRICE, PRICE);
  const winners = [];
  const all = [];
  for (let round = 1; round <= 3; round++) {
    const id = await requestPayout(hire.creator, 100_000);
    const reference = JSON.parse(
      await must(as.user(admin), `public.approve_payout(${lit(id)})`),
    ).reference;
    const finish = (outcome, i) => ({
      who: as.service,
      call: `public.finish_payout(${lit(reference)}, ${lit(outcome)}, ${lit(eventKey(`transfer-${outcome}-${i}`))}, '{}'::jsonb)`,
    });
    const outcomes = await race([
      ...times(3, (i) => finish("paid", i)),
      ...times(2, (i) => finish("failed", i)),
    ]);
    all.push(...outcomes);
    const p = await payoutFacts(id);
    const paidWon = outcomes.slice(0, 3).includes("paid");
    winners.push(paidWon ? "paid" : "failed");
    sameCounts(
      c,
      `round ${round} outcomes`,
      outcomes,
      paidWon
        ? { paid: 1, duplicate: 2, ignored: 2 }
        : { failed: 1, duplicate: 1, ignored: 3 },
    );
    c.eq(
      `round ${round} payout`,
      [p.status, p.in_flight],
      [paidWon ? "paid" : "failed", 0],
    );
    c.eq(
      `round ${round} one final group`,
      (p.groups.payout_paid ?? 0) + (p.groups.payout_failed ?? 0),
      1,
    );
    c.eq(`round ${round} cash out`, p.paystack, paidWon ? -100_000 : 0);
  }
  const paid = winners.filter((w) => w === "paid").length;
  c.eq(
    "creator wallet (failed ones re-credited once)",
    await wallet(hire.creator, "creator_wallet"),
    CREATOR_NET - paid * 100_000,
  );
  c.winners("paid vs failed", winners);
  return `outcomes ${fmt(tally(all))} | winners ${fmt(tally(winners))}`;
}

// 11 ----------------------------------------------------------------------------------------------------

async function badReports(c) {
  const hire = await newHire(PRICE);
  const p = await startPayment(hire);
  const unknown = { reference: `pit_${RUN}${"0".repeat(24)}`, card: p.card };
  const keys = {
    unknown: eventKey("unknown"),
    over: eventKey("over"),
    under: eventKey("under"),
    missing: eventKey("missing"),
    fee: eventKey("fee"),
  };
  const outcomes = await race([
    { who: as.service, call: recordCall(unknown, keys.unknown) },
    { who: as.service, call: recordCall(p, keys.over, p.card + 100) },
    { who: as.service, call: recordCall(p, keys.under, p.card - 100) },
    { who: as.service, call: recordCall(p, keys.missing, "null") },
    { who: as.service, call: recordCall(p, keys.fee, p.card, p.card + 1) },
  ]);
  c.eq("[unknown, over, under, null amount, fee above amount]", outcomes, [
    "error:no_such_payment",
    "mismatch",
    "mismatch",
    "mismatch",
    "error:invalid_paystack_fee",
  ]);
  c.eq("payment untouched", await paymentFacts(p.reference), {
    status: "initiated",
    ledger_rows: 0,
  });
  c.eq(
    "ledger rows for the unknown reference",
    Number(
      await run(
        `select count(*) from public.ledger_entries where paystack_reference = ${lit(unknown.reference)};`,
      ),
    ),
    0,
  );
  c.eq(
    "mismatch events kept for audit",
    await eventsStored([keys.over, keys.under, keys.missing]),
    3,
  );
  c.eq(
    "refused events rolled back",
    await eventsStored([keys.unknown, keys.fee]),
    0,
  );
  const f = await hireFacts(hire);
  c.eq("hire", [f.status, f.escrow], ["awaiting_payment", 0]);

  const good = await attempt(
    as.service,
    recordCall(p, eventKey("good"), p.card, charge(p.card)),
  );
  c.eq("the correct report still funds", good, "funded");
  return `${fmt(tally(outcomes))} | then ${good}`;
}

// 12 ----------------------------------------------------------------------------------------------------

async function walletSpendRace(c) {
  // A ₦60,000 paid hire the business cancels puts ₦60,000 in its wallet
  // through the real functions: enough for one ₦52,500 hire total, not two.
  const seed = await newHire(6_000_000);
  await fund(seed);
  await must(
    as.user(seed.business),
    `public.cancel_funded_engagement(${lit(seed.id)}, true)`,
  );
  c.eq(
    "wallet before",
    await wallet(seed.business, "business_wallet"),
    6_000_000,
  );

  const h1 = await newHire(PRICE, seed);
  const h2 = await newHire(PRICE, seed);
  const pay = (h) => ({
    who: as.user(seed.business),
    call: `public.pay_from_wallet(${lit(h.id)}, true)`,
  });
  const fromWallet = await race([pay(h1), pay(h2)]);
  sameCounts(c, "2× pay_from_wallet", fromWallet, {
    ok: 1,
    "error:not_enough_balance": 1,
  });
  const [f1, f2] = [await hireFacts(h1), await hireFacts(h2)];
  c.eq("wallet only: one hire funded", [f1.status, f2.status].sort(), [
    "awaiting_payment",
    "funded",
  ]);
  c.eq("wallet only: escrow", f1.escrow + f2.escrow, -PRICE);
  c.eq(
    "wallet only: wallet after (₦60,000 − ₦52,500)",
    await wallet(seed.business, "business_wallet"),
    750_000,
  );

  // Card + wallet: two payments both count on the same ₦7,500 wallet part.
  const h3 = await newHire(PRICE, seed);
  const h4 = await newHire(PRICE, seed);
  const p3 = await startPayment(h3);
  const p4 = await startPayment(h4);
  c.eq(
    "card + wallet: both payments lean on the wallet",
    [p3.card, p4.card],
    [4_500_000, 4_500_000],
  );
  const cards = await race([
    { who: as.service, call: recordCall(p3, eventKey("wallet-part-3")) },
    { who: as.service, call: recordCall(p4, eventKey("wallet-part-4")) },
  ]);
  sameCounts(c, "card + wallet: 2 successes", cards, {
    funded: 1,
    stranded: 1,
  });
  const [f3, f4] = [await hireFacts(h3), await hireFacts(h4)];
  c.eq("card + wallet: one hire funded", [f3.status, f4.status].sort(), [
    "awaiting_payment",
    "funded",
  ]);
  c.eq("card + wallet: escrow", f3.escrow + f4.escrow, -PRICE);
  c.eq(
    "card + wallet: wallet after (₦7,500 spent once, ₦45,000 stranded back)",
    await wallet(seed.business, "business_wallet"),
    4_500_000,
  );
  return `wallet only ${fmt(tally(fromWallet))} | card + wallet ${fmt(tally(cards))}`;
}

// 13 ----------------------------------------------------------------------------------------------------

async function settleVsCancel(c) {
  // Release vs the business cancelling: exactly one applies.
  const winners = [];
  for (let round = 1; round <= 3; round++) {
    const hire = await newHire(PRICE);
    await fund(hire);
    const [settled, cancelled] = await racePair(
      { who: as.postgres, call: settleCall(hire, "release") },
      {
        who: as.user(hire.business),
        call: `public.cancel_funded_engagement(${lit(hire.id)}, true)`,
      },
      round % 2 === 0,
    );
    const f = await hireFacts(hire);
    // A settle after the cancel is the silent no-op on a settled hire.
    c.eq(`round ${round}: settle call`, settled, "ok");
    c.eq(
      `round ${round}: escrow emptied once`,
      [f.escrow, f.settlements],
      [0, 1],
    );
    if (f.status === "accepted") {
      winners.push("settle");
      c.eq(
        `round ${round} settle won: cancel`,
        cancelled,
        "error:engagement_locked",
      );
      c.eq(
        `round ${round} settle won: wallets`,
        [f.creator_wallet, f.business_wallet],
        [CREATOR_NET, 0],
      );
    } else {
      winners.push("cancel");
      c.eq(
        `round ${round} cancel won: hire`,
        [cancelled, f.status, f.cancel_reason, f.settle_outcome],
        ["ok", "cancelled", "cancelled_by_business", "refund"],
      );
      c.eq(
        `round ${round} cancel won: wallets`,
        [f.creator_wallet, f.business_wallet],
        [0, PRICE],
      );
    }
  }
  c.winners("release vs cancel", winners);

  // Refund vs the creator starting: settling from in_progress is allowed, so
  // the hire always ends refunded; start either got in first or was refused.
  const orders = [];
  for (let round = 1; round <= 3; round++) {
    const hire = await newHire(PRICE);
    await fund(hire);
    const [refunded, started] = await racePair(
      { who: as.postgres, call: settleCall(hire, "refund") },
      {
        who: as.user(hire.creator),
        call: `public.start_engagement(${lit(hire.id)})`,
      },
      round % 2 === 0,
    );
    const f = await hireFacts(hire);
    c.eq(`refund round ${round}: settle call`, refunded, "ok");
    c.eq(
      `refund round ${round}: hire`,
      [f.status, f.settle_outcome, f.escrow, f.settlements],
      ["refunded", "refund", 0, 1],
    );
    c.eq(
      `refund round ${round}: wallets`,
      [f.creator_wallet, f.business_wallet],
      [0, PRICE],
    );
    if (started === "ok") {
      orders.push("start first");
      c.eq(
        `refund round ${round} start first: started_at set`,
        f.started,
        true,
      );
    } else {
      orders.push("refund first");
      c.eq(
        `refund round ${round} refund first: start`,
        [started, f.started],
        ["error:engagement_locked", false],
      );
    }
  }
  c.winners("refund vs start", orders);
  return `release vs cancel winners ${fmt(tally(winners))} | refund vs start ${fmt(tally(orders))}`;
}

// 14 ----------------------------------------------------------------------------------------------------

async function concurrentStartPayment(c) {
  const hire = await newHire(PRICE);
  const start = {
    who: as.user(hire.business),
    call: `case when public.start_payment(${lit(hire.id)}, true) is not null then 'ok' end`,
  };
  const starts = await race([start, start]);
  sameCounts(c, "2× start_payment", starts, { ok: 2 });
  const payments = await paymentsOf(hire);
  c.eq(
    "one payment initiated, the other superseded",
    payments.map((p) => p.status).sort(),
    ["failed", "initiated"],
  );

  // Paystack then reports success for both: the hire is funded once.
  const late = await race(
    payments.map((p) => ({
      who: as.service,
      call: recordCall(p, eventKey("start-late")),
    })),
  );
  sameCounts(c, "late successes on both", late, { funded: 1, stranded: 1 });
  const f = await hireFacts(hire);
  c.eq(
    "hire",
    [f.status, f.escrow, f.fundings, f.stranded],
    ["funded", -PRICE, 1, 1],
  );
  c.eq(
    "business wallet holds one card amount",
    f.business_wallet,
    payments[0].card,
  );
  return `starts ${fmt(tally(starts))} | late successes ${fmt(tally(late))}`;
}

// 15 ----------------------------------------------------------------------------------------------------

async function requestVsFailedTransfer(c) {
  const admin = await newAdmin();
  const orders = [];
  for (let round = 1; round <= 2; round++) {
    // ₦1,500 in the wallet, ₦1,000 of it in a transfer that is about to fail.
    const hire = await creatorWithBalance(500_000, 200_000);
    const id = await requestPayout(hire.creator, 100_000);
    const reference = JSON.parse(
      await must(as.user(admin), `public.approve_payout(${lit(id)})`),
    ).reference;
    const [requested, finished] = await racePair(
      { who: as.user(hire.creator), call: payoutCall(100_000) },
      {
        who: as.service,
        call: `public.finish_payout(${lit(reference)}, 'failed', ${lit(eventKey("transfer-failed"))}, '{}'::jsonb)`,
      },
      round % 2 === 0,
    );
    c.eq(`round ${round}: transfer`, finished, "failed");
    const balance = await wallet(hire.creator, "creator_wallet");
    if (requested === "ok") {
      orders.push("re-credit first");
      c.eq(`round ${round} re-credit first: wallet`, balance, 50_000);
    } else {
      orders.push("request first");
      c.eq(
        `round ${round} request first: [request, wallet]`,
        [requested, balance],
        ["error:payout_not_enough_balance", 150_000],
      );
    }
  }
  c.winners("request vs re-credit", orders);
  return `orders ${fmt(tally(orders))}`;
}

// The job sweeps every overdue hire in the local database, so a hire left over
// from an aborted run can add to its count. The scenarios therefore judge the
// job's answer only by 'none failed' and 'at least this many released', and
// read what happened to their own hire from the hire itself.
function sweepCounts(answer) {
  const [released, failed] = String(answer).split("/").map(Number);
  return { released, failed };
}

// 16 ----------------------------------------------------------------------------------------------------
//
// Stage 7. Every scenario below ends with exactly one settlement group (or none,
// when the race is not about money) and the shared invariants, which now count
// submitted, denied and disputed hires as holding their price.

async function acceptVsAutoRelease(c) {
  // The business accepts an overdue hire while the daily job releases it.
  // Whoever is second finds it released: accept after the job is refused
  // (engagement_locked), the job after accept finds nothing to do (0).
  // Which call reaches its lock first varies run to run, so later rounds hold
  // one back a few milliseconds ([accept delay, job delay]) to reach both orders.
  const orders = [];
  const lateBy = [
    [0, 0],
    [2, 0],
    [0, 2],
    [4, 0],
    [0, 4],
  ];
  for (let round = 1; round <= lateBy.length; round++) {
    const hire = await overdueHire(PRICE);
    const [accepted, swept] = await racePair(
      {
        who: as.user(hire.business),
        call: `public.accept_submission(${lit(hire.id)})`,
        delayMs: lateBy[round - 1][0],
      },
      {
        who: as.service,
        call: sweepCall,
        delayMs: lateBy[round - 1][1],
      },
      round % 2 === 0,
    );
    const f = await hireFacts(hire);
    c.eq(
      `round ${round}: hire`,
      [
        f.status,
        f.settle_outcome,
        f.escrow,
        f.settlements,
        f.creator_fee_lines,
      ],
      ["auto_released", "release", 0, 1, 1],
    );
    c.eq(
      `round ${round}: wallets`,
      [f.creator_wallet, f.business_wallet],
      [CREATOR_NET, 0],
    );
    c.eq(`round ${round}: submission`, await submissionFacts(hire), [
      {
        round: 1,
        status: "auto_accepted",
        has_reasons: false,
        decided_by_system: true,
      },
    ]);
    if (accepted === "auto_released") {
      orders.push("accept first");
      c.eq(
        `round ${round} accept first: [accept, job]`,
        [accepted, sweepCounts(swept).failed],
        ["auto_released", 0],
      );
    } else {
      orders.push("job first");
      c.eq(
        `round ${round} job first: [accept, job]`,
        [accepted, sweepCounts(swept).released >= 1, sweepCounts(swept).failed],
        ["error:engagement_locked", true, 0],
      );
    }
  }
  c.winners("accept vs auto-release", orders);

  // The job run three times at once on one overdue hire releases it once.
  const hire = await overdueHire(PRICE);
  const sweeps = await race(
    times(3, () => ({ who: as.service, call: sweepCall })),
  );
  c.ok(
    `3× job: ${fmt(tally(sweeps))} (none failed)`,
    sweeps.every((o) => sweepCounts(o).failed === 0),
  );
  const f = await hireFacts(hire);
  c.eq(
    "3× job: hire",
    [f.status, f.escrow, f.settlements, f.creator_wallet],
    ["auto_released", 0, 1, CREATOR_NET],
  );
  c.ok(
    "3× job: someone released it",
    sweeps.some((o) => sweepCounts(o).released >= 1),
  );
  return `accept vs job ${fmt(tally(orders))} | 3× job ${fmt(tally(sweeps))}`;
}

// 17 ----------------------------------------------------------------------------------------------------

async function denyVsAutoRelease(c) {
  // The deadline has passed, so the business may no longer deny: either deny
  // closes the review itself (review_closed) or the job got there first
  // (engagement_locked). Either way the hire is auto-released and no denial is stored.
  const orders = [];
  // Which call reaches its lock first varies run to run, so each round holds
  // one back a few milliseconds ([deny delay, job delay]) to reach both orders.
  const lateBy = [
    [0, 0],
    [0, 2],
    [0, 4],
    [2, 0],
    [4, 0],
  ];
  for (let round = 1; round <= lateBy.length; round++) {
    const hire = await overdueHire(PRICE);
    const [denied, swept] = await racePair(
      {
        who: as.user(hire.business),
        call: denyCall(hire),
        delayMs: lateBy[round - 1][0],
      },
      {
        who: as.service,
        call: sweepCall,
        delayMs: lateBy[round - 1][1],
      },
      round % 2 === 0,
    );
    const f = await hireFacts(hire);
    c.eq(
      `round ${round}: hire`,
      [f.status, f.settle_outcome, f.escrow, f.settlements, f.creator_wallet],
      ["auto_released", "release", 0, 1, CREATOR_NET],
    );
    c.eq(
      `round ${round}: submission, no denial stored`,
      await submissionFacts(hire),
      [
        {
          round: 1,
          status: "auto_accepted",
          has_reasons: false,
          decided_by_system: true,
        },
      ],
    );
    if (denied === "review_closed") {
      orders.push("deny first");
      c.eq(
        `round ${round} deny first: [deny, job]`,
        [denied, sweepCounts(swept).failed],
        ["review_closed", 0],
      );
    } else {
      orders.push("job first");
      c.eq(
        `round ${round} job first: [deny, job]`,
        [denied, sweepCounts(swept).released >= 1, sweepCounts(swept).failed],
        ["error:engagement_locked", true, 0],
      );
    }
  }
  c.winners("deny vs auto-release", orders);
  return `orders ${fmt(tally(orders))}`;
}

// 18 ----------------------------------------------------------------------------------------------------

async function decideVsAcceptOnDispute(c) {
  // Denied work, disputed by the creator: the business may still accept it
  // while the admin decides. One of them settles; the other is refused.
  const admin = await newAdmin();
  const winners = [];
  // The business's accept usually reaches its lock first, so later rounds start
  // it a few milliseconds late to let the admin go first too.
  const lateBy = [0, 1, 2, 3, 4];
  for (let round = 1; round <= lateBy.length; round++) {
    const hire = await disputedHire(PRICE);
    const [decided, accepted] = await racePair(
      {
        who: as.user(admin),
        call: `public.decide_dispute(${lit(hire.dispute)}, 'release', null::bigint, 'race test')`,
      },
      {
        who: as.user(hire.business),
        call: `public.accept_submission(${lit(hire.id)})`,
        delayMs: lateBy[round - 1],
      },
      round % 2 === 0,
    );
    const f = await hireFacts(hire);
    const [dispute] = await disputeFacts(hire);
    c.eq(
      `round ${round}: hire`,
      [
        f.status,
        f.settle_outcome,
        f.escrow,
        f.settlements,
        f.creator_wallet,
        f.business_wallet,
      ],
      ["accepted", "release", 0, 1, CREATOR_NET, 0],
    );
    if (decided === "ok") {
      winners.push("admin decides");
      c.eq(
        `round ${round} admin won: [decide, accept]`,
        [decided, accepted],
        ["ok", "error:engagement_locked"],
      );
      c.eq(`round ${round} admin won: dispute`, dispute, {
        status: "decided",
        outcome: "release",
        closed: true,
      });
      c.eq(
        `round ${round} admin won: submission stays denied`,
        (await submissionFacts(hire)).map((s) => s.status),
        ["denied"],
      );
    } else {
      winners.push("business accepts");
      c.eq(
        `round ${round} business won: [decide, accept]`,
        [decided, accepted],
        ["error:dispute_closed", "accepted"],
      );
      c.eq(`round ${round} business won: dispute`, dispute, {
        status: "decided",
        outcome: "accepted_by_business",
        closed: true,
      });
      c.eq(
        `round ${round} business won: submission`,
        (await submissionFacts(hire)).map((s) => s.status),
        ["accepted"],
      );
    }
  }
  c.winners("decide vs accept", winners);
  return `winners ${fmt(tally(winners))}`;
}

// 19 ----------------------------------------------------------------------------------------------------

async function doubleSubmit(c) {
  // Two submits at once on work in progress: one round 1.
  const fresh = await startedHire(PRICE);
  const first = await race(
    times(2, () => ({ who: as.user(fresh.creator), call: submitCall(fresh) })),
  );
  sameCounts(c, "2× submit_work", first, {
    ok: 1,
    "error:engagement_locked": 1,
  });
  const f1 = await hireFacts(fresh);
  c.eq(
    "hire",
    [f1.status, f1.escrow, f1.settlements],
    ["submitted", -PRICE, 0],
  );
  c.eq("one round 1 waiting for review", await submissionFacts(fresh), [
    {
      round: 1,
      status: "pending_review",
      has_reasons: false,
      decided_by_system: false,
    },
  ]);

  // Two resubmits at once after a denial: one round 2.
  const denied = await deniedHire(PRICE);
  const again = await race(
    times(2, () => ({
      who: as.user(denied.creator),
      call: submitCall(denied),
    })),
  );
  sameCounts(c, "2× resubmit", again, { ok: 1, "error:engagement_locked": 1 });
  const f2 = await hireFacts(denied);
  c.eq(
    "resubmitted hire",
    [f2.status, f2.escrow, f2.settlements],
    ["submitted", -PRICE, 0],
  );
  c.eq("one round 2 waiting for review", await submissionFacts(denied), [
    { round: 1, status: "denied", has_reasons: true, decided_by_system: false },
    {
      round: 2,
      status: "pending_review",
      has_reasons: false,
      decided_by_system: false,
    },
  ]);
  return `first ${fmt(tally(first))} | resubmit ${fmt(tally(again))}`;
}

// 20 ----------------------------------------------------------------------------------------------------

async function withdrawVsAccept(c) {
  // The creator can't walk away once work is submitted, in either order: the
  // withdrawal is refused and the accept releases once.
  const withdrawn = [];
  for (let round = 1; round <= 3; round++) {
    const hire = await submittedHire(PRICE);
    const [withdraw, accepted] = await racePair(
      {
        who: as.user(hire.creator),
        call: `public.withdraw_from_engagement(${lit(hire.id)})`,
      },
      {
        who: as.user(hire.business),
        call: `public.accept_submission(${lit(hire.id)})`,
      },
      round % 2 === 0,
    );
    withdrawn.push(withdraw);
    c.eq(
      `round ${round}: [withdraw, accept]`,
      [withdraw, accepted],
      ["error:engagement_locked", "accepted"],
    );
    const f = await hireFacts(hire);
    c.eq(
      `round ${round}: hire`,
      [
        f.status,
        f.settle_outcome,
        f.escrow,
        f.settlements,
        f.creator_wallet,
        f.business_wallet,
      ],
      ["accepted", "release", 0, 1, CREATOR_NET, 0],
    );
  }
  return `withdraw ${fmt(tally(withdrawn))}`;
}

// 21 ----------------------------------------------------------------------------------------------------

async function decideVsWithdrawDispute(c) {
  // An open dispute is either decided by the admin or withdrawn by its opener,
  // never both. A withdrawal moves no money and returns the hire to denied.
  const admin = await newAdmin();
  const winners = [];
  // Which call reaches its lock first varies run to run, so each round holds
  // one back a few milliseconds ([decide delay, withdraw delay]).
  const lateBy = [
    [0, 0],
    [0, 2],
    [2, 0],
    [0, 4],
    [4, 0],
  ];
  for (let round = 1; round <= lateBy.length; round++) {
    const hire = await disputedHire(PRICE);
    const [decided, withdrew] = await racePair(
      {
        who: as.user(admin),
        call: `public.decide_dispute(${lit(hire.dispute)}, 'release', null::bigint, 'race test')`,
        delayMs: lateBy[round - 1][0],
      },
      {
        who: as.user(hire.creator),
        call: `public.withdraw_dispute(${lit(hire.dispute)})`,
        delayMs: lateBy[round - 1][1],
      },
      round % 2 === 0,
    );
    const f = await hireFacts(hire);
    const [dispute] = await disputeFacts(hire);
    if (decided === "ok") {
      winners.push("admin decides");
      c.eq(
        `round ${round} admin won: [decide, withdraw]`,
        [decided, withdrew],
        ["ok", "error:dispute_closed"],
      );
      c.eq(
        `round ${round} admin won: hire`,
        [f.status, f.settle_outcome, f.escrow, f.settlements, f.creator_wallet],
        ["accepted", "release", 0, 1, CREATOR_NET],
      );
      c.eq(`round ${round} admin won: dispute`, dispute, {
        status: "decided",
        outcome: "release",
        closed: true,
      });
    } else {
      winners.push("creator withdraws");
      c.eq(
        `round ${round} withdraw won: [decide, withdraw]`,
        [decided, withdrew],
        ["error:dispute_closed", "ok"],
      );
      c.eq(
        `round ${round} withdraw won: hire`,
        [
          f.status,
          f.settle_outcome,
          f.escrow,
          f.settlements,
          f.creator_wallet,
          f.business_wallet,
        ],
        ["denied", null, -PRICE, 0, 0, 0],
      );
      c.eq(`round ${round} withdraw won: dispute`, dispute, {
        status: "withdrawn",
        outcome: null,
        closed: true,
      });
    }
  }
  c.winners("decide vs withdraw", winners);
  return `winners ${fmt(tally(winners))}`;
}

// 22 ----------------------------------------------------------------------------------------------------

async function twoClaimsAtOnce(c) {
  // Two email sends running at once must never get the same notification, or a
  // person would be emailed twice. A claim takes its rows with skip locked and
  // counts the attempt in the same statement.
  const person = await newAdmin();
  const ids = times(20, () => randomUUID());
  // Due long ago, so these 20 come first in the claim order even if other
  // runs have left due rows in the local database.
  await run(`
insert into public.notifications (id, user_id, kind, data, email_due_at)
values ${ids
    .map(
      (id) =>
        `(${lit(id)}, ${lit(person.id)}, 'hire_funded', '{}', '2000-01-01')`,
    )
    .join(", ")};`);
  const claim = `(select coalesce(string_agg(id::text, ',' order by id), '') from public.claim_due_emails(50))`;
  const outcomes = await race([
    { who: as.service, call: claim },
    { who: as.service, call: claim },
  ]);
  // An empty claim reads back as "ok" (race() turns an empty result into ok).
  const claimed = outcomes.map((o) => (o === "ok" ? [] : o.split(",")));
  const mine = new Set(ids);
  const [a, b] = claimed.map((list) => list.filter((id) => mine.has(id)));
  c.eq(
    "no row went to both claims",
    a.filter((id) => b.includes(id)),
    [],
  );
  c.eq(
    "together they hold exactly the 20 rows",
    [...a, ...b].sort(),
    [...ids].sort(),
  );
  const attempts = await json(
    `select jsonb_agg(distinct email_attempts) from public.notifications where user_id = ${lit(person.id)}`,
  );
  c.eq("every row was tried once", attempts, [1]);
  return `claims of ${a.length} and ${b.length}`;
}

async function twoClicksAtTheCap(c) {
  // One click below the cap, two visitors click at once: the link row lock
  // means exactly one counts and the other is over the cap.
  for (let round = 1; round <= 10; round++) {
    const hire = await startedClickHire(99);
    const outcomes = await racePair(
      { who: as.service, call: clickCall(hire, `a${round}`) },
      { who: as.service, call: clickCall(hire, `b${round}`) },
      round % 2 === 0,
    );
    c.eq(
      `round ${round}: one billable (no reason), one over the cap`,
      [...outcomes].sort(),
      ["cap_reached", "ok"],
    );
    const counts = await json(`select jsonb_build_object(
        'billable', t.billable_clicks, 'hits', t.total_hits,
        'rowsBillable', (select count(*) filter (where l.is_billable) from public.link_clicks l where l.link_id = t.id),
        'rows', (select count(*) from public.link_clicks l where l.link_id = t.id))
      from public.tracked_links t where t.code = ${lit(hire.code)}`);
    // jsonb orders keys shortest first.
    c.eq(`round ${round}: counters`, counts, {
      hits: 101,
      rows: 2,
      billable: 100,
      rowsBillable: 1,
    });
  }
  return "10 rounds";
}

async function clickVsHireEnding(c) {
  // A click while the creator withdraws: the click either counts (it read the
  // hire before the withdrawal committed) or is refused as hire_ended. The
  // withdrawal always goes through, and nothing errors or deadlocks.
  const seen = [];
  // The click is usually first to its row, so later rounds hold it back.
  // A per-click withdrawal only stops the clicks (no money moves), so it is
  // quicker than a click: holding the withdrawal back lets the click win too.
  const withdrawLateBy = [0, 0, 1, 1, 2, 0, 1, 1, 2, 2];
  for (let round = 1; round <= withdrawLateBy.length; round++) {
    const hire = await startedClickHire();
    const [click, withdraw] = await racePair(
      {
        who: as.service,
        call: clickCall(hire, `v${round}`),
      },
      {
        who: as.user(hire.creator),
        call: `public.withdraw_from_engagement(${lit(hire.id)})`,
        delayMs: withdrawLateBy[round - 1],
      },
      round % 2 === 0,
    );
    seen.push(click === "ok" ? "click first" : "withdraw first");
    c.eq(`round ${round}: withdrawal`, withdraw, "ok");
    c.eq(
      `round ${round}: click outcome is billable or hire_ended`,
      ["ok", "hire_ended"].includes(click),
      true,
    );
  }
  c.winners("click vs withdraw", seen);
  return seen.join(", ");
}

const REASON = "These clicks look wrong to me, please check them.";
const settleJob = "public.settle_due_click_hires() ->> 'failed'";

async function settleJobTwice(c) {
  // Two daily runs at once: every due hire settles exactly once.
  for (let round = 1; round <= 3; round++) {
    const hires = [
      await heldClickHire(10),
      await heldClickHire(0),
      await heldClickHire(500),
    ];
    const [a, b] = await racePair(
      { who: as.service, call: settleJob },
      { who: as.service, call: settleJob },
      round % 2 === 0,
    );
    c.eq(`round ${round}: no failures`, [a, b], ["0", "0"]);
    for (const [i, hire] of hires.entries()) {
      const f = await clickHireFacts(hire);
      c.eq(
        `round ${round} hire ${i + 1}: settled once`,
        [f.settled, f.groups],
        [true, 1],
      );
    }
  }
  return "3 rounds";
}

async function settleJobVsOpenDispute(c) {
  // The job settles a held hire or the business disputes it first; never both.
  const seen = [];
  const lateBy = [0, 1, 2, 3, 4, 0];
  for (let round = 1; round <= lateBy.length; round++) {
    const hire = await heldClickHire(20);
    const [, disputed] = await racePair(
      { who: as.service, call: settleJob },
      {
        who: as.user(hire.business),
        call: `case when public.open_dispute(${lit(hire.id)}, ${lit(REASON)}, '{}', '{}') is not null then 'ok' end`,
        delayMs: lateBy[round - 1],
      },
      round % 2 === 0,
    );
    const f = await clickHireFacts(hire);
    if (disputed === "ok") {
      seen.push("dispute first");
      c.eq(
        `round ${round}: disputed, not settled`,
        [f.status, f.settled, f.groups],
        ["disputed", false, 0],
      );
    } else {
      seen.push("settle first");
      c.eq(
        `round ${round}: settled, dispute refused`,
        [f.settled, f.groups, disputed],
        [true, 1, "error:engagement_locked"],
      );
    }
  }
  c.winners("settle vs dispute", seen);
  return seen.join(", ");
}

async function settleJobVsDecide(c) {
  // An admin decides a disputed held hire while the job runs: one settlement.
  const admin = await newAdmin();
  for (let round = 1; round <= 4; round++) {
    const hire = await heldClickHire(30);
    await must(
      as.user(hire.business),
      `public.open_dispute(${lit(hire.id)}, ${lit(REASON)}, '{}', '{}')`,
    );
    const dispute = await run(
      `select id from public.disputes where engagement_id = ${lit(hire.id)};`,
    );
    const [job, decided] = await racePair(
      { who: as.service, call: settleJob },
      {
        who: as.user(admin),
        call: `public.decide_dispute(${lit(dispute)}, 'split', 100000::bigint, 'race test')`,
      },
      round % 2 === 0,
    );
    const f = await clickHireFacts(hire);
    c.eq(`round ${round}: job and decision`, [job, decided], ["0", "ok"]);
    c.eq(
      `round ${round}: one settlement of ₦1,000`,
      [f.groups, f.released],
      [1, 100000],
    );
  }
  return "4 rounds";
}

async function clickVsSettlement(c) {
  // A click and the settlement on the same hire: the amount released always
  // matches the final count, so no click counts after settlement read it.
  const seen = [];
  const clickLateBy = [0, 1, 2, 3, 0, 1, 2, 3];
  for (let round = 1; round <= clickLateBy.length; round++) {
    const hire = await startedClickHire(10);
    const [click, settled] = await racePair(
      {
        who: as.service,
        call: clickCall(hire, `s${round}`),
        delayMs: clickLateBy[round - 1],
      },
      {
        who: as.postgres,
        call: `public.settle_click_hire(${lit(hire.id)}, null, 'race test')`,
      },
      round % 2 === 0,
    );
    const f = await clickHireFacts(hire);
    seen.push(click === "ok" ? "click first" : "settle first");
    c.eq(
      `round ${round}: click result`,
      ["ok", "hire_ended"].includes(click),
      true,
    );
    c.eq(`round ${round}: settled`, settled, "true");
    c.eq(
      `round ${round}: released matches the count`,
      f.released,
      Math.min(f.billable * 5000, 500000),
    );
  }
  c.winners("click vs settlement", seen);
  return seen.join(", ");
}

// 29–35: Cray bank-transfer deposits, the provider switch and Cray payouts ----------------------------

// The total a ₦50,000 hire costs the business (price plus the 5% fee), and what
// they send for it: the total plus the ₦200 allowance, less Cray's ₦200 charge.
const TOTAL = PRICE + 250_000;

// A hire with a waiting bank-transfer payment and its transfer account.
async function transferHire() {
  const hire = await newHire(PRICE);
  const account = await transferAccount(hire.business);
  await startTransfer(hire);
  return { hire, account };
}

async function sameDepositTwice(c) {
  await setProvider("cray");
  const { hire, account } = await transferHire();
  const deposit = newDeposit(TOTAL + 20_000);
  const outcomes = await race(
    times(5, () => ({ who: as.service, call: depositCall(account, deposit) })),
  );
  sameCounts(c, "outcomes", outcomes, { funded: 1, duplicate: 4 });
  const f = await hireFacts(hire);
  const d = await depositFacts(deposit);
  c.eq("hire", f.status, "funded");
  c.eq("escrow", f.escrow, -PRICE);
  c.eq("funding groups", f.fundings, 1);
  c.eq("business wallet", f.business_wallet, 0);
  c.eq("deposit groups", d.groups, 1);
  c.eq("cray cash from the deposit", d.cray, TOTAL);
  c.eq("events stored", d.events, 1);
  return fmt(tally(outcomes));
}

async function depositVsLapse(c) {
  await setProvider("cray");
  // Inside the 30-minute hold the deposit always funds the hire.
  const inHold = [];
  for (let round = 1; round <= 4; round++) {
    const { hire, account } = await transferHire();
    await run(`
update public.engagements set pay_by = now() - interval '1 minute' where id = ${lit(hire.id)};
update public.payments set created_at = now() - interval '5 minutes' where engagement_id = ${lit(hire.id)};`);
    const pair = await racePair(
      {
        who: as.service,
        call: depositCall(account, newDeposit(TOTAL + 20_000)),
      },
      { who: as.service, call: expireCall(hire) },
      round % 2 === 0,
    );
    inHold.push(...pair);
    c.eq(`in hold round ${round}: [deposit, lapse]`, pair, ["funded", "0"]);
    const f = await hireFacts(hire);
    c.eq(
      `in hold round ${round}: hire`,
      [f.status, f.cancel_reason, f.escrow],
      ["funded", null, -PRICE],
    );
  }

  // Hold over: the hire ends and the money waits in the wallet, whichever is first.
  const ended = [];
  for (let round = 1; round <= 4; round++) {
    const { hire, account } = await transferHire();
    await run(`
update public.engagements set pay_by = now() - interval '1 hour' where id = ${lit(hire.id)};
update public.payments set created_at = now() - interval '40 minutes' where engagement_id = ${lit(hire.id)};`);
    const pair = await racePair(
      {
        who: as.service,
        call: depositCall(account, newDeposit(TOTAL + 20_000)),
      },
      { who: as.service, call: expireCall(hire) },
      round % 2 === 0,
    );
    ended.push(pair[0]);
    c.eq(`hold over round ${round}: deposit`, pair[0], "hire_ended");
    const f = await hireFacts(hire);
    c.eq(
      `hold over round ${round}: hire`,
      [f.status, f.cancel_reason, f.escrow, f.business_wallet],
      ["cancelled", "payment_expired", 0, TOTAL],
    );
  }
  return `in hold ${fmt(tally(inHold))} | over ${fmt(tally(ended))}`;
}

async function depositVsCancel(c) {
  await setProvider("cray");
  const seen = [];
  for (let round = 1; round <= 4; round++) {
    const { hire, account } = await transferHire();
    const [deposit, cancel] = await racePair(
      {
        who: as.service,
        call: depositCall(account, newDeposit(TOTAL + 20_000)),
      },
      {
        who: as.user(hire.business),
        call: `public.cancel_engagement(${lit(hire.id)})`,
      },
      round % 2 === 0,
    );
    seen.push(deposit);
    c.eq(`round ${round}: deposit`, deposit, "funded");
    c.ok(
      `round ${round}: cancel refused (${cancel})`,
      ["error:payment_in_progress", "error:engagement_locked"].includes(cancel),
    );
    const f = await hireFacts(hire);
    c.eq(
      `round ${round}: hire`,
      [f.status, f.escrow, f.business_wallet],
      ["funded", -PRICE, 0],
    );
  }
  return fmt(tally(seen));
}

async function depositVsCardPayment(c) {
  await setProvider("cray");
  const seen = [];
  for (let round = 1; round <= 6; round++) {
    const { hire, account } = await transferHire();
    const deposit = newDeposit(TOTAL + 20_000);
    const pair = await racePair(
      { who: as.service, call: depositCall(account, deposit) },
      {
        who: as.user(hire.business),
        call: `(public.start_payment(${lit(hire.id)}, true, 'card')) ->> 'method'`,
      },
      round % 2 === 0,
    );
    seen.push(pair.join("+"));
    // Either the deposit funded first and the card start was refused, or the
    // card start superseded the transfer payment and the deposit was only credited.
    const fundedFirst =
      pair[0] === "funded" && pair[1] === "error:engagement_locked";
    const cardFirst = pair[0] === "credited" && pair[1] === "card";
    c.ok(
      `round ${round}: a consistent pair (${pair.join(", ")})`,
      fundedFirst || cardFirst,
    );
    const f = await hireFacts(hire);
    c.ok(`round ${round}: funded at most once`, f.fundings <= 1);
    if (fundedFirst) {
      c.eq(
        `round ${round}: funded hire`,
        [f.status, f.escrow, f.business_wallet],
        ["funded", -PRICE, 0],
      );
    } else if (cardFirst) {
      c.eq(
        `round ${round}: waiting hire, money in the wallet`,
        [f.status, f.escrow, f.business_wallet],
        ["awaiting_payment", 0, TOTAL],
      );
    }
    c.eq(
      `round ${round}: deposit groups`,
      (await depositFacts(deposit)).groups,
      1,
    );
  }
  return fmt(tally(seen));
}

async function switchDuringStartPayment(c) {
  const admin = await newAdmin();
  const seen = [];
  let current = await getProvider();
  for (let round = 1; round <= 4; round++) {
    const hire = await newHire(PRICE);
    const target = current === "cray" ? "paystack" : "cray";
    const pair = await racePair(
      {
        who: as.user(admin),
        call: `public.set_payment_provider(${lit(target)}, 'race flip')`,
      },
      {
        who: as.user(hire.business),
        call: `(public.start_payment(${lit(hire.id)}, true, 'card')) ->> 'provider'`,
      },
      round % 2 === 0,
    );
    c.eq(`round ${round}: the switch`, pair[0], "ok");
    // The payment is stamped with the provider it saw: the old or the new one.
    c.ok(
      `round ${round}: stamped ${pair[1]}`,
      pair[1] === current || pair[1] === target,
    );
    seen.push(pair[1]);

    // It then follows its own provider: cash lands in that provider's account.
    const [payment] = await paymentsOf(hire);
    const stamped = pair[1];
    await must(
      as.service,
      `public.record_card_payment(${lit(payment.reference)}, ${payment.card}::bigint, 0::bigint, ${lit(eventKey("switch"))}, '{}'::jsonb)`,
    );
    const cash =
      await json(`select coalesce(json_agg(distinct l.account), '[]'::json)
        from public.ledger_entries l
       where l.engagement_id = ${lit(hire.id)} and l.account in ('paystack', 'cray')`);
    c.eq(`round ${round}: cash account follows the payment`, cash, [stamped]);
    const f = await hireFacts(hire);
    c.eq(`round ${round}: hire`, [f.status, f.escrow], ["funded", -PRICE]);
    current = target;
  }
  c.winners("switch vs start_payment", seen);
  return fmt(tally(seen));
}

async function twoDepositsOneHire(c) {
  await setProvider("cray");
  const seen = [];
  for (let round = 1; round <= 3; round++) {
    const { hire, account } = await transferHire();
    // Each sends half the total (plus the charge), so only both together fund it.
    const half = TOTAL / 2;
    const a = newDeposit(half + 20_000);
    const b = newDeposit(half + 20_000);
    const outcomes = await race([
      { who: as.service, call: depositCall(account, a) },
      { who: as.service, call: depositCall(account, b) },
    ]);
    seen.push(...outcomes);
    sameCounts(c, `round ${round}: outcomes`, outcomes, {
      funded: 1,
      short: 1,
    });
    const f = await hireFacts(hire);
    c.eq(
      `round ${round}: hire`,
      [f.status, f.fundings, f.escrow, f.business_wallet],
      ["funded", 1, -PRICE, 0],
    );
    c.eq(
      `round ${round}: deposit groups`,
      [(await depositFacts(a)).groups, (await depositFacts(b)).groups],
      [1, 1],
    );
  }
  return fmt(tally(seen));
}

async function payoutSendVsFinish(c) {
  await setProvider("cray");
  const admin = await newAdmin();
  const seen = [];
  for (let round = 1; round <= 4; round++) {
    const hire = await crayCreatorWithBalance(PRICE, PRICE);
    const payoutId = await requestPayout(hire.creator, 2_000_000);
    const reference = await must(
      as.user(admin),
      `(public.approve_payout(${lit(payoutId)})) ->> 'reference'`,
    );
    const pair = await racePair(
      {
        who: as.service,
        call: `public.record_payout_send(${lit(reference)}, ${lit(`CRAY-${RUN}-${round}`)})`,
      },
      {
        who: as.service,
        call: `public.finish_payout(${lit(reference)}, 'paid', ${lit(eventKey("send-vs-finish"))}, '{}'::jsonb, 1995000::bigint, 5000::bigint)`,
      },
      round % 2 === 0,
    );
    seen.push(pair.join("+"));
    c.eq(`round ${round}: the finish`, pair[1], "paid");
    c.ok(
      `round ${round}: the send is recorded or refused because the payout was already paid (${pair[0]})`,
      pair[0] === "set" || pair[0] === "error:payout_not_processing",
    );
    const f = await crayPayoutFacts(payoutId);
    c.eq(`round ${round}: status`, f.status, "paid");
    c.eq(`round ${round}: in flight is empty`, f.in_flight, 0);
    c.eq(`round ${round}: cash left cray once`, f.cray, -2_000_000);
    c.eq(`round ${round}: one payout_paid group`, f.groups.payout_paid, 1);
    c.eq(
      `round ${round}: Cray's id is set only when it was recorded in time`,
      f.provider_reference,
      pair[0] === "set" ? `CRAY-${RUN}-${round}` : null,
    );
  }
  return fmt(tally(seen));
}

// Runner ------------------------------------------------------------------------------------------------

const scenarios = [
  ["1 same event key ×5", sameEventKey],
  ["2 same reference, 5 event keys", differentEventKeys],
  ["3 payment vs lapse", paymentVsLapse],
  ["4 payment vs business cancel", paymentVsCancel],
  ["5 superseded payments", supersededPayments],
  ["6 settlement races", settlementRaces],
  ["7 start vs cancel", startVsCancel],
  ["8 payout request race", payoutRequestRace],
  ["9 payout approval race", payoutApprovalRace],
  ["10 transfer finish race", finishRace],
  ["11 unknown reference, bad amounts", badReports],
  ["12 wallet spend race", walletSpendRace],
  ["13 settle vs cancel and start", settleVsCancel],
  ["14 concurrent start_payment", concurrentStartPayment],
  ["15 payout request vs failed transfer", requestVsFailedTransfer],
  ["16 accept vs auto-release", acceptVsAutoRelease],
  ["17 deny vs auto-release", denyVsAutoRelease],
  ["18 decide dispute vs accept", decideVsAcceptOnDispute],
  ["19 double submit", doubleSubmit],
  ["20 withdraw vs accept", withdrawVsAccept],
  ["21 decide dispute vs withdraw dispute", decideVsWithdrawDispute],
  ["22 two claims at once", twoClaimsAtOnce],
  ["23 two clicks at the cap", twoClicksAtTheCap],
  ["24 click vs hire ending", clickVsHireEnding],
  ["25 settle job twice at once", settleJobTwice],
  ["26 settle job vs open dispute", settleJobVsOpenDispute],
  ["27 settle job vs decide dispute", settleJobVsDecide],
  ["28 click vs settlement", clickVsSettlement],
  ["29 same deposit twice at once", sameDepositTwice],
  ["30 deposit vs lapse", depositVsLapse],
  ["31 deposit vs business cancel", depositVsCancel],
  ["32 deposit vs card payment for the same hire", depositVsCardPayment],
  ["33 provider switch during start_payment", switchDuringStartPayment],
  ["34 two deposits for one hire at once", twoDepositsOneHire],
  ["35 payout send record vs payout webhook finish", payoutSendVsFinish],
];

async function runOnce(scenario) {
  resetOverlap();
  const c = checker();
  let counts = "";
  try {
    counts = await scenario(c);
  } catch (error) {
    c.failures.push(`stopped: ${error.message}`);
  }
  return { c, counts, stats: { ...overlap } };
}

console.log(`money race, run ${RUN}`);
// The first 28 scenarios are about the Paystack path, so Paystack is the
// active provider for them; each Cray scenario switches to Cray itself. The
// provider the local database had is put back at the end.
const originalProvider = await getProvider();
let failed = 0;
const overall = { races: 0, spreadMs: 0, marginMs: Infinity };
for (const [name, scenario] of scenarios) {
  // Cray scenarios (29 onward) set Cray themselves; everything before is Paystack.
  if (Number.parseInt(name, 10) < 29) await setProvider("paystack");
  let { c, counts, stats } = await runOnce(scenario);
  // A race where some call finished before another started proves nothing.
  // That can be a scheduler hiccup, so the scenario (fresh fixtures) runs once more.
  let rerun = "";
  if (c.failures.length === 0 && stats.misses > 0) {
    rerun = `rerun once: calls did not overlap in ${stats.misses} of ${stats.races} races`;
    ({ c, counts, stats } = await runOnce(scenario));
  }
  if (stats.misses > 0) {
    c.failures.push(
      `calls did not overlap in ${stats.misses} of ${stats.races} races${rerun ? ", on the rerun too" : ""}`,
    );
  }
  try {
    for (const problem of await invariants())
      c.failures.push(`invariant: ${problem}`);
    c.facts.push("invariants hold");
  } catch (error) {
    c.failures.push(`invariants not checked: ${error.message}`);
  }

  const pass = c.failures.length === 0;
  if (!pass) failed++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}  ${counts}`);
  for (const line of pass ? c.facts : c.failures)
    console.log(`      ${pass ? "-" : "!"} ${line}`);
  for (const line of c.warnings) console.log(`      ~ warning: ${line}`);
  if (rerun) console.log(`      ~ ${rerun}`);
  if (stats.races > 0) {
    console.log(
      `      ~ overlap: ${stats.races} races, starts within ${stats.spreadMs.toFixed(1)} ms, ` +
        `all calls running together for at least ${stats.marginMs.toFixed(1)} ms`,
    );
    overall.races += stats.races;
    overall.spreadMs = Math.max(overall.spreadMs, stats.spreadMs);
    overall.marginMs = Math.min(overall.marginMs, stats.marginMs);
  }
}

try {
  await setProvider(originalProvider);
} catch (error) {
  console.log(`Could not restore the payment provider: ${error.message}`);
}

let totals = "not read";
try {
  totals = await run("select public.ledger_totals();");
} catch (error) {
  totals = `not read (${error.message})`;
}
console.log(
  `\n${scenarios.length - failed}/${scenarios.length} scenarios PASS  ledger_totals ${totals}`,
);
console.log(
  `${overall.races} races; starts within ${overall.spreadMs.toFixed(1)} ms; ` +
    `shortest time all of a race's calls were running together: ${overall.marginMs.toFixed(1)} ms ` +
    "(includes one client round trip of measuring).",
);
// A dev server with a real Resend key would otherwise try to email these
// fake addresses. Notifications are not append-only, so clearing is allowed.
try {
  await run(
    "update public.notifications n set email_due_at = null from public.users u " +
      "where u.id = n.user_id and u.email like '%@race.pitchype.test' and n.emailed_at is null;",
  );
} catch (error) {
  console.log(
    `Could not clear the email queue for race people: ${error.message}`,
  );
}
console.log(
  "Note: the ledger is append-only, so this run's rows (people @race.pitchype.test) stay in the local database.",
);
process.exit(failed ? 1 : 0);
