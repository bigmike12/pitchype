// Helpers for scripts/money-race.mjs: psql sessions inside the local Supabase
// database container, a start barrier that makes calls overlap, fixtures,
// and the ledger facts and invariants the scenarios assert. Development only.

import { spawn } from "node:child_process";
import { randomInt, randomUUID } from "node:crypto";

const CONTAINER = process.env.RACE_DB_CONTAINER ?? "supabase_db_pitchype";
const DOMAIN = "race.pitchype.test";

// A short id per run, in every email and event key, so reruns never collide.
export const RUN = randomUUID().slice(0, 8);

// psql -----------------------------------------------------------------------------------------------

// Database-side bounds for every session: a call stuck on a lock fails with
// Postgres's own message instead of hanging the run.
const PGOPTIONS = "-c statement_timeout=30s -c lock_timeout=20s";
// Client-side bound, above both, in case the session never reports back.
const KILL_AFTER_MS = 45_000;

// Every call is its own `docker exec … psql`, so its own Postgres backend:
// separate sessions and transactions, which is the point of this script.
function psql(text) {
  return new Promise((resolve) => {
    const child = spawn("docker", [
      "exec",
      "-i",
      "-e",
      `PGOPTIONS=${PGOPTIONS}`,
      CONTAINER,
      "psql",
      "-X",
      "-q",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ]);
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({
        code: -2,
        stdout,
        stderr: `ERROR:  timeout: psql did not finish within ${KILL_AFTER_MS / 1000} s`,
      });
    }, KILL_AFTER_MS);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: `ERROR:  ${error.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(text);
  });
}

function errorOf(stderr) {
  const match = stderr.match(/ERROR:\s+(.+)/);
  return match ? match[1].trim() : stderr.trim() || "unknown error";
}

export function lit(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

// Runs setup or check SQL as postgres; any error stops the scenario.
export async function run(text) {
  const result = await psql(text);
  if (result.code !== 0)
    throw new Error(`SQL failed: ${errorOf(result.stderr)}`);
  return result.stdout.trim();
}

// One JSON value from a select that returns a single json column.
export async function json(select) {
  return JSON.parse(await run(`select coalesce((${select})::text, 'null');`));
}

// Who a session acts as. The money functions read the signed-in person from
// the JWT claims (current_user_id() maps auth.uid() through users.auth_user_id).
export const as = {
  postgres: "",
  service: "set local role service_role;",
  user: (person) =>
    `set local role authenticated; set local request.jwt.claims = ${lit(
      JSON.stringify({ sub: person.auth, role: "authenticated" }),
    )};`,
};

// The SQL for one call in its own transaction. `gate` is an optional statement
// run inside the transaction just before the call (the barrier). The result
// is the call's value as text ('ok' for void), or `error:<message>`.
// STARTED and ENDED are clock_timestamp() just before the call and just after
// it (before commit, or after the rollback of a refused call), so race() can
// check every call started before any finished.
const now = `(extract(epoch from clock_timestamp()) * 1000)::text`;
function callText(who, expr, gate = "", delayMs = 0) {
  return `begin;
${who}
${gate}
${delayMs > 0 ? `select pg_sleep(${delayMs / 1000});` : ""}
select ${now} as race_started \\gset
\\echo STARTED :race_started
\\set ON_ERROR_STOP 0
select coalesce(nullif((${expr})::text, ''), 'ok') as race_result \\gset
\\if :ERROR
\\echo REFUSED :LAST_ERROR_MESSAGE
rollback;
\\endif
\\set ON_ERROR_STOP 1
select ${now} as race_ended \\gset
\\echo ENDED :race_ended
\\if :{?race_result}
commit;
\\echo RESULT :race_result
\\endif
`;
}

function outcomeOf(result) {
  const refused = result.stdout.match(/^REFUSED (.*)$/m);
  if (refused) return `error:${refused[1].trim()}`;
  if (result.code !== 0) return `error:${errorOf(result.stderr)}`;
  const line = result.stdout.match(/^RESULT (.*)$/m);
  return line ? line[1] : "error:no result";
}

function timing(result, label) {
  const value = Number(
    result.stdout.match(new RegExp(`^${label} (\\S+)$`, "m"))?.[1],
  );
  return Number.isNaN(value) ? null : value;
}

// One call, alone. Returns the outcome string.
export async function attempt(who, expr) {
  return outcomeOf(await psql(callText(who, expr)));
}

// One call that must succeed (fixture setup).
export async function must(who, expr) {
  const outcome = await attempt(who, expr);
  if (outcome.startsWith("error:"))
    throw new Error(`setup call failed: ${expr}: ${outcome}`);
  return outcome;
}

// The start barrier ---------------------------------------------------------------------------------
//
// Spawning `docker exec` takes 100–300 ms per process, far longer than the
// money functions run, so calls launched "at once" would really run one after
// another. To make them overlap:
//   1. A coordinator session takes an exclusive transaction-level advisory
//      lock on a random key, then loops until it sees `calls.length` waiters
//      on that key in pg_locks.
//   2. Once the lock is confirmed held, every worker session starts: it opens
//      its transaction, sets its role, and asks for the same key in SHARED
//      mode, so it blocks behind the coordinator.
//   3. The coordinator's transaction ends, releasing the key. Shared requests
//      do not conflict with each other, so Postgres grants all waiters in the
//      same instant, and each worker sends its money call immediately (its
//      snapshot is taken after the barrier, so nothing it reads is stale).
// From there the calls contend on the real row locks inside the functions.
export async function race(calls) {
  const key = randomInt(1, 2 ** 31 - 1);
  const onKey = `locktype = 'advisory' and classid = 0 and objid = ${key}::oid
    and database = (select oid from pg_database where datname = current_database())`;
  const coordinator = psql(`do $$
declare
  deadline timestamptz := clock_timestamp() + interval '20 seconds';
begin
  perform pg_advisory_xact_lock(${key});
  while (select count(*) from pg_locks where ${onKey} and not granted) < ${calls.length} loop
    if clock_timestamp() > deadline then
      raise exception 'barrier_timeout';
    end if;
    perform pg_sleep(0.005);
  end loop;
end
$$;`);

  // Workers may not start before the coordinator holds the key, or the
  // first ones would slip through ungated.
  for (let i = 0; ; i++) {
    if (
      (await run(
        `select exists (select 1 from pg_locks where ${onKey} and granted);`,
      )) === "t"
    )
      break;
    if (i >= 100)
      throw new Error("barrier: the coordinator never took the lock");
  }

  const gate = `select pg_advisory_xact_lock_shared(${key}) \\gset`;
  const workers = calls.map((c) =>
    psql(callText(c.who, c.call, gate, c.delayMs)),
  );
  const [held, ...results] = await Promise.all([coordinator, ...workers]);
  const outcomes = results.map(outcomeOf);
  if (held.code !== 0) throw new Error(`barrier: ${errorOf(held.stderr)}`);

  // Proof the calls overlapped: every call started before any call finished.
  const starts = results.map((r) => timing(r, "STARTED"));
  const ends = results.map((r) => timing(r, "ENDED"));
  if ([...starts, ...ends].includes(null)) {
    throw new Error(
      `race: a call did not report its timings (outcomes ${outcomes.join(", ")})`,
    );
  }
  const spread = Math.max(...starts) - Math.min(...starts);
  const margin = Math.min(...ends) - Math.max(...starts);
  overlap.races++;
  overlap.spreadMs = Math.max(overlap.spreadMs, spread);
  overlap.marginMs = Math.min(overlap.marginMs, margin);
  if (margin <= 0) overlap.misses++;
  return outcomes;
}

// Per scenario: how many races ran, the widest gap between the first and last
// call starting, the smallest time all calls were running together, and how
// many races had no such time. The runner resets it for each scenario.
export const overlap = {};
export function resetOverlap() {
  Object.assign(overlap, {
    races: 0,
    spreadMs: 0,
    marginMs: Infinity,
    misses: 0,
  });
}
resetOverlap();

// Two competing calls; `flip` launches them in the other order, so repeated
// rounds exercise both interleavings. Results come back in the given order.
export async function racePair(a, b, flip) {
  if (!flip) return race([a, b]);
  const [rb, ra] = await race([b, a]);
  return [ra, rb];
}

// A call may carry `delayMs`: it then sleeps after the barrier and before its
// start time is taken, so the call that is usually first to a lock can be made
// to arrive second. The start time is taken after the sleep, so the overlap
// check measures real work: a delayed call that only starts once the other has
// finished fails the "calls did not overlap" check instead of passing it.
export function times(n, make) {
  return Array.from({ length: n }, (_, i) => make(i));
}

// Fixtures ------------------------------------------------------------------------------------------
//
// Same shape as the pgTAP tests: app users with an auth_user_id, a business
// profile, an open campaign, an approved application and an awaiting_payment
// engagement due in 48 hours. Each hire gets its own business, so wallet
// money from one hire never changes how another is paid.

function newPerson(role, tag) {
  return {
    id: randomUUID(),
    auth: randomUUID(),
    role,
    email: `${tag}-${RUN}-${randomUUID().slice(0, 8)}@${DOMAIN}`,
  };
}

function userRow(p) {
  return `(${lit(p.id)}, ${lit(p.auth)}, ${lit(p.email)}, ${lit(p.role)})`;
}

export async function newAdmin() {
  const admin = newPerson("admin", "admin");
  await run(
    `insert into public.users (id, auth_user_id, email, role) values ${userRow(admin)};`,
  );
  return admin;
}

// `sameBusinessAs` (another hire) puts this hire on that hire's business and
// campaign, for the scenarios about one business's wallet.
export async function newHire(price, sameBusinessAs = null) {
  const business = sameBusinessAs?.business ?? newPerson("business", "biz");
  const creator = newPerson("influencer", "creator");
  const campaign = sameBusinessAs?.campaign ?? randomUUID();
  const application = randomUUID();
  const id = randomUUID();
  const businessSql = sameBusinessAs
    ? ""
    : `
insert into public.users (id, auth_user_id, email, role) values ${userRow(business)};
insert into public.business_profiles (user_id, business_name, contact_name, state, city)
values (${lit(business.id)}, 'Race Test Business', 'Race Tester', 'Lagos', 'Ikeja');
insert into public.campaigns (id, business_id, status, title, brief, price_kobo, places,
                              applications_close_on, deliver_by, published_at, submitted_at)
values (${lit(campaign)}, ${lit(business.id)}, 'open', 'Money race test',
        'A brief that is long enough for the checks.', 500000, 10,
        public.lagos_today() + 10, public.lagos_today() + 20, now(), now());`;
  await run(`${businessSql}
insert into public.users (id, auth_user_id, email, role) values ${userRow(creator)};
insert into public.applications (id, campaign_id, creator_id, status)
values (${lit(application)}, ${lit(campaign)}, ${lit(creator.id)}, 'approved');
insert into public.engagements (id, application_id, campaign_id, business_id, creator_id, agreed_price_kobo, pay_by)
values (${lit(id)}, ${lit(application)}, ${lit(campaign)}, ${lit(business.id)}, ${lit(creator.id)},
        ${price}, now() + interval '48 hours');`);
  return { id, price, business, creator, campaign };
}

export function eventKey(label) {
  return `race-${RUN}-${label}-${randomUUID().slice(0, 8)}`;
}

// Paystack's card charge (1.5% + ₦100, ₦100 waived under ₦2,500, capped at
// ₦2,000, plus 7.5% VAT); only needs to be a plausible 0..card amount.
export function charge(card) {
  const flat = card >= 250000 ? 10000 : 0;
  return Math.round(
    Math.min(Math.round((card * 150) / 10000) + flat, 200000) * 1.075,
  );
}

export async function startPayment(hire) {
  const started = JSON.parse(
    await must(
      as.user(hire.business),
      `public.start_payment(${lit(hire.id)}, true)`,
    ),
  );
  return {
    reference: started.reference,
    card: Number(started.card_amount_kobo),
  };
}

export function recordCall(
  payment,
  key,
  paid = payment.card,
  fee = charge(payment.card),
) {
  return `public.record_card_payment(${lit(payment.reference)}, ${paid}::bigint, ${fee}::bigint, ${lit(key)}, '{}'::jsonb)`;
}

export async function fund(hire) {
  const payment = await startPayment(hire);
  const outcome = await must(as.service, recordCall(payment, eventKey("fund")));
  if (outcome !== "funded")
    throw new Error(`setup: funding returned ${outcome}`);
  return payment;
}

// settle_engagement_internal() is internal (no role may call it), so as postgres.
export function settleCall(hire, outcome, release = null) {
  return `public.settle_engagement_internal(${lit(hire.id)}, ${lit(outcome)}, ${release ?? "null"}::bigint, 'race test', null)`;
}

// A creator with exactly `release − creator fee` in their wallet.
export async function creatorWithBalance(price, release) {
  const hire = await newHire(price);
  await fund(hire);
  await must(
    as.postgres,
    settleCall(hire, release === price ? "release" : "split", release),
  );
  await must(
    as.service,
    `public.save_bank_account_for(${lit(hire.creator.id)}, '058', 'GTBank', '1234', 'RACE TESTER', ${lit(`RCP_race_${RUN}`)})`,
  );
  return hire;
}

export async function requestPayout(creator, amount) {
  return must(as.user(creator), `public.request_payout(${amount})`);
}

// Stage 7 fixtures: a hire taken through the real functions, as the people
// would. Each helper builds on the one before it.

// Funded, then started by the creator.
export async function startedHire(price) {
  const hire = await newHire(price);
  await fund(hire);
  await must(as.user(hire.creator), `public.start_engagement(${lit(hire.id)})`);
  return hire;
}

// 'ok' when a submission was made. submit_work() returns the new id, which
// differs on every call, so it is turned into a word the outcomes can be counted by.
export function submitCall(hire) {
  return `case when public.submit_work(${lit(hire.id)}, null, array['https://example.com/race-proof']::text[], array[]::uuid[]) is not null then 'ok' end`;
}

export function denyCall(hire) {
  return `public.deny_submission(${lit(hire.id)}, array['The post is not what was agreed'])`;
}

// Submitted: round 1 waiting for review.
export async function submittedHire(price) {
  const hire = await startedHire(price);
  await must(as.user(hire.creator), submitCall(hire));
  return hire;
}

// Submitted, with the review deadline already past. Set by hand as the
// database owner; submit_work() always writes now() + 7 days.
export async function overdueHire(price) {
  const hire = await submittedHire(price);
  await run(
    `update public.submissions set review_deadline_at = now() - interval '1 minute' where engagement_id = ${lit(hire.id)};`,
  );
  return hire;
}

// Submitted, then denied by the business.
export async function deniedHire(price) {
  const hire = await submittedHire(price);
  await must(as.user(hire.business), denyCall(hire));
  return hire;
}

// Denied, then disputed by the creator. Returns the hire with its dispute id.
export async function disputedHire(price) {
  const hire = await deniedHire(price);
  const dispute = await must(
    as.user(hire.creator),
    `public.open_dispute(${lit(hire.id)}, 'The business denied work that matches the brief exactly.', array[]::text[], array[]::uuid[])`,
  );
  return { ...hire, dispute };
}

// What the release job returns, as one word: 'released/failed'.
export const sweepCall = `(select released::text || '/' || failed::text from public.release_overdue_submissions())`;

// Facts -----------------------------------------------------------------------------------------------

export function hireFacts(hire) {
  return json(`
select json_build_object(
  'status', e.status,
  'cancel_reason', e.cancel_reason,
  'settle_outcome', e.settle_outcome,
  'started', e.started_at is not null,
  'escrow', coalesce((select sum(l.amount_kobo) from public.ledger_entries l
                       where l.engagement_id = e.id and l.account = 'escrow'), 0),
  'fundings', (select count(distinct l.group_id) from public.ledger_entries l
                where l.engagement_id = e.id and l.account = 'escrow' and l.amount_kobo < 0),
  'settlements', (select count(distinct l.group_id) from public.ledger_entries l
                   where l.engagement_id = e.id and l.event_type = 'hire_settled'),
  'creator_fee_lines', (select count(*) from public.ledger_entries l
                         where l.engagement_id = e.id and l.event_type = 'hire_settled'
                           and l.account = 'platform_revenue' and l.amount_kobo < 0),
  'stranded', (select count(distinct l.group_id) from public.ledger_entries l
                where l.engagement_id = e.id and l.event_type = 'payment_received'
                  and l.account = 'business_wallet' and l.amount_kobo < 0),
  'charges', (select count(distinct l.group_id) from public.ledger_entries l
               where l.engagement_id = e.id and l.event_type = 'paystack_fee'),
  'business_wallet', public.wallet_balance(e.business_id, 'business_wallet'),
  'creator_wallet', public.wallet_balance(e.creator_id, 'creator_wallet')
) from public.engagements e where e.id = ${lit(hire.id)}`);
}

// A hire's submissions in round order: what was decided, whether reasons were
// stored, and whether the system (no person) decided it.
export function submissionFacts(hire) {
  return json(`
select coalesce(json_agg(json_build_object(
  'round', s.round, 'status', s.status,
  'has_reasons', s.denial_reasons is not null,
  'decided_by_system', s.decided_at is not null and s.decided_by is null) order by s.round), '[]'::json)
  from public.submissions s where s.engagement_id = ${lit(hire.id)}`);
}

// A hire's disputes, oldest first.
export function disputeFacts(hire) {
  return json(`
select coalesce(json_agg(json_build_object(
  'status', d.status, 'outcome', d.outcome, 'closed', d.closed_at is not null)
  order by d.opened_at), '[]'::json)
  from public.disputes d where d.engagement_id = ${lit(hire.id)}`);
}

export function payoutFacts(payoutId) {
  return json(`
select json_build_object(
  'status', p.status,
  'reference', p.reference,
  'in_flight', coalesce((select sum(l.amount_kobo) from public.ledger_entries l
                          where l.payout_id = p.id and l.account = 'payout_in_flight'), 0),
  'paystack', coalesce((select sum(l.amount_kobo) from public.ledger_entries l
                         where l.payout_id = p.id and l.account = 'paystack'), 0),
  'groups', (select coalesce(json_object_agg(g.event_type, g.n), '{}'::json) from (
               select l.event_type, count(distinct l.group_id) as n from public.ledger_entries l
                where l.payout_id = p.id group by l.event_type) g)
) from public.payouts p where p.id = ${lit(payoutId)}`);
}

// A hire's card payments, oldest first.
export function paymentsOf(hire) {
  return json(`
select coalesce(json_agg(json_build_object('reference', p.reference, 'status', p.status,
                                           'card', p.card_amount_kobo) order by p.created_at, p.id), '[]'::json)
  from public.payments p where p.engagement_id = ${lit(hire.id)}`);
}

export function paymentFacts(reference) {
  return json(`
select json_build_object(
  'status', p.status,
  'ledger_rows', (select count(*) from public.ledger_entries l where l.payment_id = p.id)
) from public.payments p where p.reference = ${lit(reference)}`);
}

export function wallet(person, kind) {
  return json(
    `select to_json(public.wallet_balance(${lit(person.id)}, ${lit(kind)}))`,
  );
}

export async function eventsStored(keys) {
  return Number(
    await run(
      `select count(*) from public.payment_events where event_key in (${keys.map(lit).join(", ")});`,
    ),
  );
}

// Invariants ----------------------------------------------------------------------------------------
//
// Checked after every scenario, over the whole ledger and over every person
// and hire this script has ever made (so earlier runs are re-checked too).
// Stored signs: cash and expense positive, liabilities and revenue negative,
// so a wallet, escrow or payout in flight summing above zero is overdrawn.
export async function invariants() {
  const f = await json(`
with totals as (select public.ledger_totals() as j),
v as (
  select (j ->> 'paystack')::numeric as ps, (j ->> 'escrow')::numeric as es,
         (j ->> 'business_wallet')::numeric as bw, (j ->> 'creator_wallet')::numeric as cw,
         (j ->> 'payout_in_flight')::numeric as pif, (j ->> 'platform_revenue')::numeric as pr,
         (j ->> 'paystack_fees')::numeric as pf
    from totals
),
race_users as (select id from public.users where email like ${lit(`%@${DOMAIN}`)})
select json_build_object(
  'sum', (select ps + es + bw + cw + pif + pr + pf from v),
  'identity_gap', (select ps - (-(es + bw + cw + pif + pr) - pf) from v),
  'unbalanced_groups', (select count(*) from (
      select 1 from public.ledger_entries group by group_id having sum(amount_kobo) <> 0) x),
  'overdrawn_wallets', (select count(*) from (
      select 1 from public.ledger_entries l
       where l.account in ('business_wallet', 'creator_wallet') and l.owner_user_id in (select id from race_users)
       group by l.owner_user_id, l.account having sum(l.amount_kobo) > 0) x),
  'overdrawn_escrow', (select count(*) from (
      select 1 from public.ledger_entries l join public.engagements e on e.id = l.engagement_id
       where l.account = 'escrow' and e.business_id in (select id from race_users)
       group by l.engagement_id having sum(l.amount_kobo) > 0) x),
  'overdrawn_in_flight', (select count(*) from (
      select 1 from public.ledger_entries l join public.payouts p on p.id = l.payout_id
       where l.account = 'payout_in_flight' and p.user_id in (select id from race_users)
       group by l.payout_id having sum(l.amount_kobo) > 0) x),
  -- A hire with work running, under review, denied or disputed holds exactly its
  -- price; any other status (settled, cancelled, refunded, unpaid) holds nothing.
  'escrow_not_matching_status', (select count(*) from public.engagements e
       where e.business_id in (select id from race_users)
         and coalesce((select sum(l.amount_kobo) from public.ledger_entries l
                        where l.engagement_id = e.id and l.account = 'escrow'), 0)
             <> case when e.status in ('funded', 'in_progress', 'submitted', 'denied', 'disputed')
                     then -e.agreed_price_kobo else 0 end)
)`);
  const problems = [];
  if (Number(f.sum) !== 0)
    problems.push(`ledger_totals() sums to ${f.sum}, not 0`);
  if (Number(f.identity_gap) !== 0)
    problems.push(`reconciliation identity off by ${f.identity_gap}`);
  for (const name of [
    "unbalanced_groups",
    "overdrawn_wallets",
    "overdrawn_escrow",
    "overdrawn_in_flight",
    "escrow_not_matching_status",
  ]) {
    if (Number(f[name]) !== 0) problems.push(`${name}: ${f[name]}`);
  }
  return problems;
}

// Reporting -------------------------------------------------------------------------------------------

export function tally(outcomes) {
  const counts = {};
  for (const o of outcomes) counts[o] = (counts[o] ?? 0) + 1;
  return counts;
}

export function fmt(counts) {
  return Object.keys(counts)
    .sort()
    .map((k) => `${k}:${counts[k]}`)
    .join(" ");
}

// Collects the facts a scenario asserts; any mismatch fails the scenario.
// Warnings (such as one winner every round) are printed but don't fail it.
export function checker() {
  const failures = [];
  const facts = [];
  const warnings = [];
  return {
    failures,
    facts,
    warnings,
    winners(label, list) {
      if (new Set(list).size < 2) {
        warnings.push(
          `${label}: only ${list[0]} ever won in ${list.length} rounds`,
        );
      }
    },
    eq(label, actual, expected) {
      const a = JSON.stringify(actual);
      const e = JSON.stringify(expected);
      if (a === e) facts.push(`${label} = ${a}`);
      else failures.push(`${label}: expected ${e}, got ${a}`);
    },
    ok(label, condition, detail = "") {
      if (condition) facts.push(label);
      else failures.push(`${label}${detail ? ` (${detail})` : ""}`);
    },
  };
}
