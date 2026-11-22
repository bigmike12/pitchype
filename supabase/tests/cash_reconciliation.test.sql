-- Proves the rules from the cash_and_reconciliation migration: only an admin
-- records cash moved between paystack, cray and the bank, always as one
-- balanced group with a reason, never beyond what a provider account holds;
-- each provider is reconciled against its own cash account; runs stay
-- append-only.
-- Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(33);

insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000d7001', 'd7d7d7d7-0000-0000-0000-0000000d7001', 'ada.cash@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000d7002', 'd7d7d7d7-0000-0000-0000-0000000d7002', 'zed.cash@example.com', 'admin');

-- Whatever the local ledger already holds, this test reasons in differences.
create temp table base as select public.ledger_totals() as totals;
grant select on base to authenticated, service_role;

-- ₦100,000 of Paystack cash and ₦50,000 of Cray cash, matched by revenue.
select public.post_ledger_group('correction', null, 'test cash', null, null, null, null, null,
  '[{"account": "paystack", "amount": 10000000}, {"account": "cray", "amount": 5000000},
    {"account": "platform_revenue", "amount": -15000000}]'::jsonb);

-- Moving cash ---------------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "d7d7d7d7-0000-0000-0000-0000000d7001"}'; -- Ada, a business
select throws_ok($$ select public.record_cash_movement('paystack', 'cray', 100000, 'Top up Cray') $$,
  'P0001', 'not_allowed', 'a business cannot record a cash movement');
reset role;
set local role anon;
select throws_ok($$ select public.record_cash_movement('paystack', 'cray', 100000, 'Top up Cray') $$,
  '42501', null, 'anon cannot either');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "d7d7d7d7-0000-0000-0000-0000000d7002"}'; -- Zed, an admin
select throws_ok($$ select public.record_cash_movement('paystack', 'paystack', 100000, 'Same place') $$,
  'P0001', 'invalid_cash_account', 'from and to must differ');
select throws_ok($$ select public.record_cash_movement('paystack', 'escrow', 100000, 'Not cash') $$,
  'P0001', 'invalid_cash_account', 'only paystack, cray and bank are places');
select throws_ok($$ select public.record_cash_movement(null, 'cray', 100000, 'Nowhere') $$,
  'P0001', 'invalid_cash_account', 'and both must be given');
select throws_ok($$ select public.record_cash_movement('paystack', 'cray', 0, 'Nothing') $$,
  '22023', 'invalid_amount', 'the amount must be positive');
select throws_ok($$ select public.record_cash_movement('paystack', 'cray', -5, 'Backwards') $$,
  '22023', 'invalid_amount', 'not negative');
select throws_ok($$ select public.record_cash_movement('paystack', 'cray', 100000, 'ab') $$,
  'P0001', 'reason_required', 'a reason under 3 characters is refused');
select throws_ok($$ select public.record_cash_movement('paystack', 'cray', 100000, '   ') $$,
  'P0001', 'reason_required', 'so is a blank one');
select throws_ok($$ select public.record_cash_movement('cray', 'paystack', 999999999999, 'Too much') $$,
  'P0001', 'cash_not_available', 'a provider account cannot be moved below what the ledger says it holds');
select isnt(public.record_cash_movement('paystack', 'cray', 1000000, 'Top up Cray so payouts can go out'), null,
  'an admin moves ₦10,000 from Paystack to Cray and gets the group id');
select lives_ok($$ select public.record_cash_movement('bank', 'cray', 2500000, 'Owner topped up Cray from the bank') $$,
  'topping up from the bank works even though the ledger holds no bank cash');
reset role;

select is((select array_agg(account || ':' || amount_kobo order by account) from public.ledger_entries
            where event_type = 'cash_moved' and reason = 'Top up Cray so payouts can go out'),
  array['cray:1000000', 'paystack:-1000000'], 'the move is one group: cray in, paystack out');
select is((select count(distinct group_id)::integer from public.ledger_entries
            where event_type = 'cash_moved' and reason = 'Top up Cray so payouts can go out'), 1, 'one group');
select is((select actor_user_id from public.ledger_entries
            where event_type = 'cash_moved' and reason = 'Top up Cray so payouts can go out' limit 1),
  '00000000-0000-0000-0000-0000000d7002'::uuid, 'with the acting admin recorded');
select is((select sum(amount_kobo) from public.ledger_entries where account = 'bank'
             and reason = 'Owner topped up Cray from the bank'), -2500000::numeric,
  'the bank is the other side of a top-up');
select is((select sum(value::bigint) from jsonb_each_text(public.ledger_totals())), 0::numeric,
  'ledger totals still sum to zero');
select is((public.ledger_totals() ->> 'cray')::bigint - (select (totals ->> 'cray')::bigint from base), (5000000 + 1000000 + 2500000)::bigint,
  'Cray holds what was seeded plus both movements');
select is((public.ledger_totals() ->> 'paystack')::bigint - (select (totals ->> 'paystack')::bigint from base), (10000000 - 1000000)::bigint,
  'Paystack holds what was seeded less the move');

-- Reconciliation per provider --------------------------------------------------------------------------------------------
set local role service_role;
select is(public.record_reconciliation('cray', (public.ledger_totals() ->> 'cray')::bigint),
  jsonb_build_object('expected_cash_kobo', (public.ledger_totals() ->> 'cray')::bigint, 'difference_kobo', 0,
                     'ledger_balanced', true),
  'a Cray run expects the cray account and matches');
select is(public.record_reconciliation('cray', (public.ledger_totals() ->> 'cray')::bigint + 500) -> 'difference_kobo',
  '500'::jsonb, 'a Cray balance ₦5 over shows 500 kobo');
select is(public.record_reconciliation('paystack', (public.ledger_totals() ->> 'paystack')::bigint) -> 'difference_kobo',
  '0'::jsonb, 'the Paystack run is unaffected by the Cray rows');
select is(public.record_reconciliation((public.ledger_totals() ->> 'paystack')::bigint) -> 'difference_kobo',
  '0'::jsonb, 'the original one-argument call is still a Paystack run');
select lives_ok($$ select public.record_reconciliation('cray', (public.ledger_totals() ->> 'cray')::bigint,
  '[{"name": "Main Balance", "kobo": 100}, {"name": "Settlement Balance", "kobo": 200}]'::jsonb) $$,
  'a Cray run can carry the parts of the balance');
select throws_ok($$ select public.record_reconciliation('stripe', 100) $$,
  '22023', 'invalid_provider', 'only paystack and cray are reconciled');
select throws_ok($$ select public.record_reconciliation('cray', -1) $$,
  '22023', 'invalid_amount', 'a negative balance is refused');
reset role;

select is((select provider from public.reconciliation_runs where difference_kobo = 500 and ran_at = now()), 'cray',
  'the run records its provider');
select ok((select note like '%Balance parts: Main Balance 100 kobo; Settlement Balance 200 kobo.%'
             from public.reconciliation_runs where provider = 'cray' and ran_at = now() and note like '%Balance parts%'),
  'and the parts of the balance are in the note');
select ok((select note like 'Cray balance differs from expected cash by 500 kobo.%'
             from public.reconciliation_runs where difference_kobo = 500 and ran_at = now()),
  'a difference is named for the right provider');
select is((select count(*)::integer from public.reconciliation_runs where ran_at = now() and provider = 'paystack'), 2,
  'two Paystack runs, from the two Paystack calls');
select is((select note from public.reconciliation_runs where ran_at = now() and provider = 'paystack' limit 1), null,
  'a clean run has no note');
select throws_ok($$ update public.reconciliation_runs set note = 'edited' $$,
  'P0001', 'reconciliation_runs_append_only', 'runs are still append-only');
set local role authenticated;
select throws_ok($$ select public.record_reconciliation('cray', 100) $$, '42501', null,
  'signed-in people cannot record runs');
reset role;

select * from finish();
rollback;
