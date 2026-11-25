-- Proves the rules from the create_audit migration: a reconciliation run
-- compares Paystack's balance with the cash the ledger expects (escrow +
-- wallets + payouts in flight + platform revenue − Paystack fees) and stores
-- the difference in an append-only table only admins read; the expected-cash
-- formula equals the ledger's own `paystack` account whenever the ledger
-- balances; an admin can read one hire's whole money trail (engagement,
-- payments, ledger groups in time order with actor and reason, the creator's
-- payouts) and search the ledger by person, engagement, event type and date,
-- at most 200 rows a page; nobody else can call any of it.
-- Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(67);

-- Bola is a business, Ngozi an admin, Tunde and Sade creators. Tunde's ₦50,000
-- hire is paid by card, released in full and partly paid out; Sade's is paid
-- by card and still running.
insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000cf001', 'cfcfcfcf-0000-0000-0000-0000000cf001', 'bola.audit@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000cf002', 'cfcfcfcf-0000-0000-0000-0000000cf002', 'ngozi.audit@example.com', 'admin'),
  ('00000000-0000-0000-0000-0000000cf101', 'cfcfcfcf-0000-0000-0000-0000000cf101', 'tunde.audit@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000cf102', 'cfcfcfcf-0000-0000-0000-0000000cf102', 'sade.audit@example.com', 'influencer');

-- Identity fixtures: the people made above count as verified, so the identity
-- gates (identity_gates migration) are not what this file is about.
insert into public.identity_checks (user_id, kind, status, reference, legal_name_entered, legal_name_on_record,
                                    id_last3, id_fingerprint, counted, decided_at)
select u.id, case u.role when 'influencer' then 'creator_nin' else 'owner_nin' end, 'verified',
       'pit_id_fx_' || replace(u.id::text, '-', ''), 'Fixture Person', 'FIXTURE PERSON', '000',
       'v1:fx-' || u.id::text, true, now()
  from public.users u
 where u.created_at = now() and u.role in ('influencer', 'business')
   and not exists (select 1 from public.identity_checks c where c.user_id = u.id);
insert into public.screenings (user_id, subject, trigger, status)
select u.id, 'person', 'admin', 'clear'
  from public.users u
 where u.created_at = now() and u.role = 'influencer'
   and not exists (select 1 from public.screenings s where s.user_id = u.id);

insert into public.business_profiles (user_id, business_name, contact_name, state, city) values
  ('00000000-0000-0000-0000-0000000cf001', 'Bola Audit Bakery', 'Bola Ade', 'Lagos', 'Ikeja');

insert into public.influencer_profiles (user_id, display_name, state, city, niches, published) values
  ('00000000-0000-0000-0000-0000000cf101', 'Tunde Audit', 'Lagos', 'Yaba', '{fashion}', true),
  ('00000000-0000-0000-0000-0000000cf102', 'Sade Audit', 'Lagos', 'Yaba', '{fashion}', true);

insert into public.campaigns (id, business_id, status, title, brief, price_kobo, places,
                              applications_close_on, deliver_by, published_at, submitted_at) values
  ('cf000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000cf001', 'open', 'Audit test',
   'A brief that is long enough for the checks.', 5000000, 10, public.lagos_today() + 10, public.lagos_today() + 20, now(), now());

-- Hire n belongs to creator n (101 Tunde, 102 Sade).
insert into public.applications (id, campaign_id, creator_id, status)
select ('cf000000-0000-0000-0000-0000000a000' || n)::uuid, 'cf000000-0000-0000-0000-000000000001',
       ('00000000-0000-0000-0000-0000000cf10' || n)::uuid, 'approved'
  from generate_series(1, 2) n;

insert into public.engagements (id, application_id, campaign_id, business_id, creator_id, agreed_price_kobo, pay_by)
select ('cf000000-0000-0000-0000-0000000e000' || n)::uuid, ('cf000000-0000-0000-0000-0000000a000' || n)::uuid,
       'cf000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000cf001',
       ('00000000-0000-0000-0000-0000000cf10' || n)::uuid, 5000000, now() + interval '48 hours'
  from generate_series(1, 2) n;

-- A correction booked a day before anything else (₦100 of Paystack credit
-- booked as revenue; no wallet, so it can't pay for the hires), so the trail
-- must put it first even though its event type would sort last.
insert into public.ledger_entries (group_id, event_type, account, owner_user_id, engagement_id, amount_kobo,
                                   actor_user_id, reason, fee_config_id, created_at)
select 'cf000000-0000-0000-0000-0000000c0001', 'correction', l.account, l.owner, 'cf000000-0000-0000-0000-0000000e0001',
       l.amount, '00000000-0000-0000-0000-0000000cf002', 'Unbooked Paystack credit', (public.current_fee_config()).id,
       now() - interval '1 day'
  from (values ('paystack', null::uuid, 10000::bigint),
               ('platform_revenue', null::uuid, -10000::bigint)) l (account, owner, amount);

-- Fund both hires by card the way the app does; release Tunde's in full.
do $$
declare
  n integer;
  started jsonb;
begin
  for n in 1..2 loop
    perform set_config('request.jwt.claims', '{"sub": "cfcfcfcf-0000-0000-0000-0000000cf001"}', true);
    started := public.start_payment(('cf000000-0000-0000-0000-0000000e000' || n)::uuid, true);
    perform set_config('request.jwt.claims', '', true);
    perform public.record_card_payment(started ->> 'reference', (started ->> 'card_amount_kobo')::bigint,
      95406, 'evt-audit-fund-' || n, '{}');
  end loop;
  perform public.settle_engagement_internal('cf000000-0000-0000-0000-0000000e0001',
    'release', null, 'work done', '00000000-0000-0000-0000-0000000cf002');
end;
$$;

-- Tunde has a payout account and takes ₦10,000 out; it is approved and paid.
insert into public.bank_accounts (user_id, bank_code, bank_name, last4, account_name, recipient_code) values
  ('00000000-0000-0000-0000-0000000cf101', '058', 'GTBank', '4321', 'TUNDE AUDIT', 'RCP_tunde_audit');
set local role authenticated;
set local request.jwt.claims = '{"sub": "cfcfcfcf-0000-0000-0000-0000000cf101"}'; -- Tunde
select lives_ok($$ select public.request_payout(1000000) $$, 'Tunde requests ₦10,000');
set local request.jwt.claims = '{"sub": "cfcfcfcf-0000-0000-0000-0000000cf002"}'; -- Ngozi
select lives_ok($$ select public.approve_payout((select id from public.payouts
                                                  where user_id = '00000000-0000-0000-0000-0000000cf101')) $$,
  'Ngozi approves it');
reset role;
set local role service_role;
select is(public.finish_payout((select reference from public.payouts where user_id = '00000000-0000-0000-0000-0000000cf101'),
                               'paid', 'evt-audit-po-1', '{"event": "transfer.success"}'),
  'paid', 'and Paystack confirms the transfer');
reset role;

-- Reconciliation -------------------------------------------------------------------------------------------
-- The expected-cash formula, on stubbed totals. Signs as stored: cash and
-- expense positive, liabilities and revenue negative.
select is(public.reconciliation_figures(
            '{"paystack": 5154594, "escrow": -5000000, "business_wallet": 0, "creator_wallet": 0,
              "payout_in_flight": 0, "platform_revenue": -250000, "paystack_fees": 95406}', 5154594),
  '{"expected_cash_kobo": 5154594, "difference_kobo": 0, "ledger_balanced": true, "note": null}'::jsonb,
  '₦52,500 paid, ₦954.06 charge: Paystack holds ₦51,545.94 and the ledger expects exactly that');
select is(public.reconciliation_figures(
            '{"paystack": 5154594, "escrow": -5000000, "business_wallet": -100, "creator_wallet": -200,
              "payout_in_flight": -300, "platform_revenue": -250000, "paystack_fees": 95406}', 5155294),
  '{"expected_cash_kobo": 5155194, "difference_kobo": 100, "ledger_balanced": false,
    "note": "Ledger accounts sum to -600 kobo, not 0. Paystack balance differs from expected cash by 100 kobo."}'::jsonb,
  'an unbalanced ledger is reported, and wallets and payouts in flight count as cash owed');
select is(public.reconciliation_figures('{"paystack": 1000, "escrow": -1000}', 900) -> 'difference_kobo',
  '-100'::jsonb, 'missing accounts count as zero, and a shortfall is negative');

set local role service_role;
select is(public.record_reconciliation((public.ledger_totals() ->> 'paystack')::bigint),
  jsonb_build_object('expected_cash_kobo', (public.ledger_totals() ->> 'paystack')::bigint,
                     'difference_kobo', 0, 'ledger_balanced', true),
  'on the real ledger, expected cash equals the paystack account: a matching balance has no difference');
select is(public.record_reconciliation((public.ledger_totals() ->> 'paystack')::bigint + 100) -> 'difference_kobo',
  '100'::jsonb, 'a balance ₦1 over shows a difference of 100 kobo');
select throws_ok($$ select public.record_reconciliation(null) $$,
  '22023', 'invalid_amount', 'a missing balance is refused');
select throws_ok($$ select public.record_reconciliation(-1) $$,
  '22023', 'invalid_amount', 'a negative balance is refused');
reset role;

select is((select array_agg(difference_kobo order by difference_kobo) from (
             select difference_kobo from public.reconciliation_runs order by ran_at desc, difference_kobo limit 2) r),
  array[0, 100]::bigint[], 'both runs are stored with their difference');
select ok((select bool_and(difference_kobo = paystack_balance_kobo - expected_cash_kobo
                           and expected_cash_kobo = (public.ledger_totals() ->> 'paystack')::bigint)
             from public.reconciliation_runs where ran_at = now()),
  'each run stores the balance, the expected cash and their difference');
select is((select note from public.reconciliation_runs where ran_at = now() and difference_kobo = 0), null,
  'a clean run has no note');
select is((select note from public.reconciliation_runs where ran_at = now() and difference_kobo = 100),
  'Paystack balance differs from expected cash by 100 kobo.', 'a run with a difference says so');

select throws_ok($$ update public.reconciliation_runs set difference_kobo = 0 $$,
  'P0001', 'reconciliation_runs_append_only', 'a run cannot be changed, even by the owner');
select throws_ok($$ delete from public.reconciliation_runs $$,
  'P0001', 'reconciliation_runs_append_only', 'or deleted');
select throws_ok($$ truncate public.reconciliation_runs $$,
  'P0001', 'reconciliation_runs_append_only', 'or truncated');
select is((select array_agg(tgenabled::text order by tgname) from pg_trigger
            where tgrelid = 'public.reconciliation_runs'::regclass and not tgisinternal),
  array['A', 'A'], 'the append-only triggers fire always, even in replica mode');

set local role service_role;
select throws_ok($$ insert into public.reconciliation_runs (paystack_balance_kobo, expected_cash_kobo, difference_kobo)
                    values (0, 0, 0) $$, '42501', null, 'the server cannot write a run directly');
select throws_ok($$ select public.reconciliation_figures('{}', 0) $$,
  '42501', null, 'reconciliation_figures is internal');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "cfcfcfcf-0000-0000-0000-0000000cf002"}'; -- Ngozi
select ok((select count(*) from public.reconciliation_runs where ran_at = now()) = 2, 'an admin reads the runs');
select throws_ok($$ select public.record_reconciliation(0) $$,
  '42501', null, 'an admin cannot record a run (the server does, with Paystack''s balance)');
select throws_ok($$ insert into public.reconciliation_runs (paystack_balance_kobo, expected_cash_kobo, difference_kobo)
                    values (0, 0, 0) $$, '42501', null, 'or write one directly');
set local request.jwt.claims = '{"sub": "cfcfcfcf-0000-0000-0000-0000000cf101"}'; -- Tunde
select is((select count(*)::integer from public.reconciliation_runs), 0, 'a creator sees no runs');
select throws_ok($$ select public.record_reconciliation(0) $$, '42501', null, 'nor records one');
set local request.jwt.claims = '{"sub": "cfcfcfcf-0000-0000-0000-0000000cf001"}'; -- Bola
select is((select count(*)::integer from public.reconciliation_runs), 0, 'a business sees no runs');
reset role;
set local role anon;
select throws_ok($$ select count(*) from public.reconciliation_runs $$, '42501', null, 'anon cannot read runs');
select throws_ok($$ select public.record_reconciliation(0) $$, '42501', null, 'nor record one');
reset role;

-- Who can read the audit -------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "cfcfcfcf-0000-0000-0000-0000000cf001"}'; -- Bola
select throws_ok($$ select public.admin_engagement_trail('cf000000-0000-0000-0000-0000000e0001') $$,
  'P0001', 'not_allowed', 'the business on the hire cannot read the admin trail');
select throws_ok($$ select public.admin_ledger(null, null, null, null, null, null, null) $$,
  'P0001', 'not_allowed', 'nor the admin ledger');
set local request.jwt.claims = '{"sub": "cfcfcfcf-0000-0000-0000-0000000cf101"}'; -- Tunde
select throws_ok($$ select public.admin_engagement_trail('cf000000-0000-0000-0000-0000000e0001') $$,
  'P0001', 'not_allowed', 'nor can the creator');
select throws_ok($$ select public.admin_ledger('00000000-0000-0000-0000-0000000cf101', null, null, null, null, null, null) $$,
  'P0001', 'not_allowed', 'even filtered to himself');
reset role;
set local role anon;
select throws_ok($$ select public.admin_engagement_trail('cf000000-0000-0000-0000-0000000e0001') $$,
  '42501', null, 'anon cannot call the trail');
select throws_ok($$ select public.admin_ledger(null, null, null, null, null, null, null) $$,
  '42501', null, 'or the ledger');
reset role;

-- One hire's trail -----------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "cfcfcfcf-0000-0000-0000-0000000cf002"}'; -- Ngozi
select throws_ok($$ select public.admin_engagement_trail(gen_random_uuid()) $$,
  'P0001', 'no_such_engagement', 'an unknown hire is refused');

create temporary table trail on commit drop as
  select public.admin_engagement_trail('cf000000-0000-0000-0000-0000000e0001') as t;

select is((select t -> 'engagement' ->> 'status' from trail), 'accepted', 'the trail shows the settled hire');
select is((select array[t -> 'engagement' ->> 'settle_outcome', t -> 'engagement' ->> 'released_kobo',
                        t -> 'engagement' ->> 'refunded_kobo', t -> 'engagement' ->> 'business_fee_kobo'] from trail),
  array['release', '5000000', '0', '250000'], 'with its settled amounts and fee snapshot');
select is((select array[t -> 'engagement' ->> 'business_name', t -> 'engagement' ->> 'creator_name',
                        t -> 'engagement' ->> 'campaign_title'] from trail),
  array['Bola Audit Bakery', 'Tunde Audit', 'Audit test'], 'the people and the campaign by name');

select is((select jsonb_array_length(t -> 'payments') from trail), 1, 'one payment');
select is((select array(select jsonb_object_keys(t -> 'payments' -> 0) order by 1) from trail),
  array['card_amount_kobo', 'created_at', 'id', 'paystack_fee_kobo', 'reference', 'status', 'total_kobo',
        'wallet_part_kobo'], 'payments carry only the audit columns');
select is((select array[t -> 'payments' -> 0 ->> 'status', t -> 'payments' -> 0 ->> 'total_kobo',
                        t -> 'payments' -> 0 ->> 'paystack_fee_kobo'] from trail),
  array['succeeded', '5250000', '95406'], 'the ₦52,500 card payment and Paystack''s charge');

select is((select array(select g ->> 'event_type' from jsonb_array_elements(t -> 'groups') g) from trail),
  array['correction', 'payment_received', 'paystack_fee', 'hire_settled'],
  'ledger groups in time order: the earlier correction first, then funding, the charge and settlement');
select is((select array(select g ->> 'actor_name' from jsonb_array_elements(t -> 'groups') g) from trail),
  array['ngozi.audit@example.com', 'System', 'System', 'ngozi.audit@example.com'],
  'each with who did it: the admin, or the system for Paystack events');
select is((select array(select coalesce(g ->> 'reason', '-') from jsonb_array_elements(t -> 'groups') g) from trail),
  array['Unbooked Paystack credit', '-', '-', 'work done'], 'and why');
select ok((select bool_and((select sum((l ->> 'amount_kobo')::bigint) from jsonb_array_elements(g -> 'lines') l) = 0)
             from trail, jsonb_array_elements(t -> 'groups') g), 'every group in the trail sums to zero');
select is((select array(select (l ->> 'account') || ':' || coalesce(l ->> 'owner_name', '-') || ':' || (l ->> 'amount_kobo')
                          from jsonb_array_elements(t -> 'groups' -> 3 -> 'lines') l order by 1) from trail),
  array['creator_wallet:Tunde Audit:-4750000', 'escrow:-:5000000', 'platform_revenue:-:-250000'],
  'settlement lines: escrow out, ₦47,500 to Tunde, ₦2,500 creator fee');
select is((select t -> 'groups' -> 1 ->> 'paystack_reference' from trail),
  (select reference from public.payments where engagement_id = 'cf000000-0000-0000-0000-0000000e0001'),
  'the funding group carries the Paystack reference');

select is((select jsonb_array_length(t -> 'payouts') from trail), 1, 'Tunde''s payout is listed');
select is((select array[t -> 'payouts' -> 0 ->> 'status', t -> 'payouts' -> 0 ->> 'amount_kobo',
                        t -> 'payouts' -> 0 ->> 'approved_by_name', t -> 'payouts' -> 0 ->> 'last4'] from trail),
  array['paid', '1000000', 'ngozi.audit@example.com', '4321'], 'paid, ₦10,000, approved by Ngozi, to the account ending 4321');
select ok((select position('RCP_' in t::text) = 0 and position('payload' in t::text) = 0
                  and position('event_key' in t::text) = 0 from trail),
  'no recipient codes, payloads or event keys in the trail');

-- The ledger search ----------------------------------------------------------------------------------------
select is((public.admin_ledger(null, 'cf000000-0000-0000-0000-0000000e0001', null, null, null, null, null) ->> 'total')::integer,
  (select count(*)::integer from public.ledger_entries where engagement_id = 'cf000000-0000-0000-0000-0000000e0001'),
  'by engagement: every row of that hire');
select ok((select bool_and(r ->> 'engagement_id' = 'cf000000-0000-0000-0000-0000000e0001')
             from jsonb_array_elements(public.admin_ledger(null, 'cf000000-0000-0000-0000-0000000e0001',
                                                           null, null, null, null, null) -> 'rows') r),
  'and only that hire');
select is((select array(select r ->> 'event_type' from jsonb_array_elements(public.admin_ledger(null,
             'cf000000-0000-0000-0000-0000000e0001', null, null, null, null, null) -> 'rows') r)) [1:3],
  array['hire_settled', 'hire_settled', 'hire_settled'], 'newest first');
select is((select array(select r ->> 'event_type' from jsonb_array_elements(public.admin_ledger(null,
             'cf000000-0000-0000-0000-0000000e0001', null, null, null, null, null) -> 'rows') r)) [9:10],
  array['correction', 'correction'], 'the day-old correction last');
select is((public.admin_ledger(null, 'cf000000-0000-0000-0000-0000000e0001', 'hire_settled', null, null, null, null)
             ->> 'total')::integer, 3, 'by engagement and event type: the three settlement rows');
select is((public.admin_ledger('00000000-0000-0000-0000-0000000cf102', null, null, null, null, null, null)
             ->> 'total')::integer,
  (select count(*)::integer from public.ledger_entries where engagement_id = 'cf000000-0000-0000-0000-0000000e0002'),
  'by person: Sade is in every row of her hire''s groups and nothing else');
select is((public.admin_ledger('00000000-0000-0000-0000-0000000cf101', null, null, null, null, null, null)
             ->> 'total')::integer,
  (select count(*)::integer from public.ledger_entries
    where engagement_id = 'cf000000-0000-0000-0000-0000000e0001'
       or payout_id in (select id from public.payouts where user_id = '00000000-0000-0000-0000-0000000cf101')),
  'Tunde: his hire''s groups and his payout''s groups');
select is((public.admin_ledger('00000000-0000-0000-0000-0000000cf101', null, 'payout_paid', null, null, null, null)
             -> 'rows' -> 0 ->> 'actor_name'), 'System', 'rows name the actor');
select is((public.admin_ledger(null, 'cf000000-0000-0000-0000-0000000e0001', null, public.lagos_today() + 1, null, null, null)
             ->> 'total')::integer, 0, 'from tomorrow: nothing');
select is((public.admin_ledger(null, 'cf000000-0000-0000-0000-0000000e0001', null, null, public.lagos_today() - 1, null, null)
             ->> 'total')::integer, 2, 'up to yesterday (Lagos time): only the correction');
select is((public.admin_ledger(null, 'cf000000-0000-0000-0000-0000000e0001', null, public.lagos_today(), public.lagos_today(),
                               null, null) ->> 'total')::integer, 8, 'today only: funding, charge and settlement');

select is(jsonb_array_length(public.admin_ledger(null, 'cf000000-0000-0000-0000-0000000e0001', null, null, null, 2, 0) -> 'rows'),
  2, 'row_limit pages the rows');
select isnt(public.admin_ledger(null, 'cf000000-0000-0000-0000-0000000e0001', null, null, null, 2, 2) -> 'rows' -> 0,
  public.admin_ledger(null, 'cf000000-0000-0000-0000-0000000e0001', null, null, null, 2, 0) -> 'rows' -> 0,
  'and row_offset moves through them');
select is((public.admin_ledger(null, 'cf000000-0000-0000-0000-0000000e0001', null, null, null, 2, 0) ->> 'total')::integer,
  10, 'the total counts every match, not just the page');
reset role;

-- 110 more two-line groups, so more than 200 rows match whatever else is in the database.
insert into public.ledger_entries (group_id, event_type, account, amount_kobo, reason, fee_config_id)
select ('cf000000-0000-0000-0000-' || lpad(to_hex(n), 12, '0'))::uuid, 'correction', l.account, l.amount,
       'Bulk test row', (public.current_fee_config()).id
  from generate_series(1, 110) n,
       (values ('paystack', 1::bigint), ('platform_revenue', -1::bigint)) l (account, amount);

set local role authenticated;
set local request.jwt.claims = '{"sub": "cfcfcfcf-0000-0000-0000-0000000cf002"}'; -- Ngozi
select is((public.admin_ledger(null, null, null, null, null, 10000, 0) ->> 'row_limit')::integer, 200,
  'a row_limit of 10,000 is clamped to 200');
select is(jsonb_array_length(public.admin_ledger(null, null, null, null, null, 10000, 0) -> 'rows'), 200,
  'and returns 200 rows though more match');
select ok((public.admin_ledger(null, null, null, null, null, 10000, 0) ->> 'total')::integer >= 220,
  'the total still counts them all');
reset role;

select * from finish();
rollback;
