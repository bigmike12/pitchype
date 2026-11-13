// Races the Stage 6 money functions against each other on the local Supabase
// database, each call in its own Postgres session, and checks that money
// never moves twice and the ledger always balances. pgTAP runs in one
// transaction, so it cannot show what happens when sessions overlap; this can.
// Development only: never point it at the live database.
//
//   node --env-file=.env.local scripts/money-race.mjs
//
// Needs Docker with local Supabase running (container supabase_db_pitchype,
// or set RACE_DB_CONTAINER). Reads no secrets. Prints one PASS/FAIL line per
// scenario and exits 1 if any fails.
//
// The ledger is append-only, so the rows this makes stay in the local
// database for good. They are harmless: every person's email ends
// @race.pitchype.test and every id is random, so reruns never collide.
//
// How calls are made to overlap: see race() in money-race-lib.mjs.

import {
  RUN,
  as,
  attempt,
  barrier,
  charge,
  checker,
  creatorWithBalance,
  eventKey,
  eventsStored,
  fmt,
  fund,
  hireFacts,
  invariants,
  lit,
  must,
  newAdmin,
  newHire,
  paymentFacts,
  payoutFacts,
  race,
  racePair,
  recordCall,
  requestPayout,
  run,
  settleCall,
  startPayment,
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
  // Inside the 30-minute hold: the payment wins whatever the order.
  const held = await newHire(PRICE);
  const p1 = await startPayment(held);
  await age(held, p1, { payByAgo: "1 minute", paymentAgo: "5 minutes" });
  const inHold = await race([
    { who: as.service, call: recordCall(p1, eventKey("lapse-held")) },
    { who: as.service, call: expireCall(held) },
  ]);
  c.eq("in hold: [payment, lapse]", inHold, ["funded", "0"]);
  const f1 = await hireFacts(held);
  c.eq("in hold: hire", [f1.status, f1.cancel_reason], ["funded", null]);
  c.eq("in hold: escrow", f1.escrow, -PRICE);
  c.eq("in hold: stranded", f1.stranded, 0);

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
];

console.log(`money race, run ${RUN}`);
let failed = 0;
for (const [name, scenario] of scenarios) {
  const c = checker();
  let counts = "";
  try {
    counts = await scenario(c);
  } catch (error) {
    c.failures.push(`stopped: ${error.message}`);
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
}

const totals = await run("select public.ledger_totals();");
console.log(
  `\n${scenarios.length - failed}/${scenarios.length} scenarios PASS  ledger_totals ${totals}`,
);
console.log(
  `${barrier.races} races; the widest gap between first and last call start was ${barrier.spreadMs.toFixed(1)} ms.`,
);
console.log(
  "Note: the ledger is append-only, so this run's rows (people @race.pitchype.test) stay in the local database.",
);
process.exit(failed ? 1 : 0);
