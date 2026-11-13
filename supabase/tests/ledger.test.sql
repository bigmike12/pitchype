-- Proves the rules from the create_ledger migration: the seeded fee_config
-- matches src/lib/fees.ts, every ledger group balances, ledger rows can never
-- be changed or removed, wallet balances come from the ledger, and people read
-- only their own wallet rows and the escrow of their own hires.
-- Run with: supabase test db
--
-- The ledger is append-only, so a local database that has run
-- scripts/money-race.mjs keeps its rows for good. This file therefore never
-- assumes an empty ledger: it counts only its own fixture rows (by engagement)
-- and compares totals as changes from a baseline taken before it posts.
begin;

create extension if not exists pgtap with schema extensions;

select plan(46);

-- Ada is a business; Chidi is a creator hired by Ada; Uche is an unrelated
-- creator; Efe is an admin.
insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000c8001', '88888888-0000-0000-0000-0000000c8001', 'ada.ledger@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000c8002', '88888888-0000-0000-0000-0000000c8002', 'chidi.ledger@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000c8003', '88888888-0000-0000-0000-0000000c8003', 'uche.ledger@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000c8004', '88888888-0000-0000-0000-0000000c8004', 'efe.ledger@example.com', 'admin');

insert into public.business_profiles (user_id, business_name, contact_name, state, city) values
  ('00000000-0000-0000-0000-0000000c8001', 'Ada Ledger Kitchen', 'Ada Obi', 'Lagos', 'Ikeja');

insert into public.campaigns (id, business_id, status, title, brief, price_kobo, places,
                              applications_close_on, deliver_by, published_at, submitted_at) values
  ('c8000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000c8001', 'open', 'Ledger test',
   'A brief that is long enough for the checks.', 5000000, 2, public.lagos_today() + 10, public.lagos_today() + 20, now(), now());

insert into public.applications (id, campaign_id, creator_id, status) values
  ('c8000000-0000-0000-0000-0000000000a1', 'c8000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000c8002', 'approved');

insert into public.engagements (id, application_id, campaign_id, business_id, creator_id, agreed_price_kobo, pay_by) values
  ('c8000000-0000-0000-0000-0000000000e1', 'c8000000-0000-0000-0000-0000000000a1', 'c8000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000c8001', '00000000-0000-0000-0000-0000000c8002', 5000000, now() + interval '48 hours');

-- Taken before any posting below; every total is checked as a change from it.
create temp table baseline as
  select public.ledger_totals() as totals, (select count(*) from public.ledger_entries) as n;

-- Fee config ----------------------------------------------------------------------------------
select is((public.current_fee_config()).business_fee_bps, 500, 'business fee is 5%');
select is((public.current_fee_config()).creator_fee_bps, 500, 'creator fee is 5%');
select is((public.current_fee_config()).min_fee_kobo, 50000::bigint, 'minimum fee is ₦500');
select is((public.current_fee_config()).min_payout_kobo, 100000::bigint, 'minimum payout is ₦1,000');
select is((public.current_fee_config()).transfer_fee_tiers,
  '[{"up_to_kobo": 500000, "fee_kobo": 1000}, {"up_to_kobo": 5000000, "fee_kobo": 2500}, {"up_to_kobo": null, "fee_kobo": 5000}]'::jsonb,
  'transfer fee tiers: ₦10 to ₦5,000, ₦25 to ₦50,000, ₦50 above');
select is((public.current_fee_config()).transfer_stamp_duty_kobo, 5000::bigint, 'stamp duty is ₦50');
select is((public.current_fee_config()).transfer_stamp_duty_from_kobo, 1000000::bigint, 'from ₦10,000');
select is((public.current_fee_config()).paystack_rate,
  '{"rate_bps": 150, "flat_kobo": 10000, "flat_waived_under_kobo": 250000, "cap_kobo": 200000, "vat_bps": 750}'::jsonb,
  'Paystack charge model: 1.5% + ₦100 (waived under ₦2,500), capped at ₦2,000, plus 7.5% VAT');

-- A newer row becomes current; ties on created_at fall back to the id.
insert into public.fee_config (id, business_fee_bps, creator_fee_bps, min_fee_kobo, min_payout_kobo,
                               transfer_fee_tiers, transfer_stamp_duty_kobo, transfer_stamp_duty_from_kobo,
                               paystack_rate, created_at)
select 'ffffffff-0000-0000-0000-0000000c8001', 600, 500, min_fee_kobo, min_payout_kobo, transfer_fee_tiers,
       transfer_stamp_duty_kobo, transfer_stamp_duty_from_kobo, paystack_rate, now() + interval '1 day'
  from public.current_fee_config();
select is((public.current_fee_config()).business_fee_bps, 600, 'the latest fee_config row is the current one');
select throws_ok($$ update public.fee_config set business_fee_bps = 700 $$, 'P0001', 'fee_config_append_only',
  'fee_config rows cannot be changed');
select throws_ok($$ delete from public.fee_config $$, 'P0001', 'fee_config_append_only',
  'fee_config rows cannot be deleted');

-- Posting groups ------------------------------------------------------------------------------
-- Ada pays ₦52,500 by card: escrow ₦50,000 and the ₦2,500 business fee.
select isnt(public.post_ledger_group('payment_received', null, null, 'c8000000-0000-0000-0000-0000000000e1', null, null,
  'ref-ledger-1', null,
  '[{"account": "paystack", "amount": 5250000},
    {"account": "escrow", "amount": -5000000},
    {"account": "platform_revenue", "amount": -250000}]'), null,
  'a balanced group is posted and returns its id');
select is((select count(distinct group_id)::integer from public.ledger_entries
            where engagement_id = 'c8000000-0000-0000-0000-0000000000e1'), 1, 'as one group');
select is((select count(*)::integer from public.ledger_entries
            where engagement_id = 'c8000000-0000-0000-0000-0000000000e1'), 3, 'of three rows');
select is((select array_agg(distinct fee_config_id) from public.ledger_entries
            where engagement_id = 'c8000000-0000-0000-0000-0000000000e1'), array[(public.current_fee_config()).id],
  'with no config given, every row records the current fee_config');
select is((select array_agg(distinct paystack_reference) from public.ledger_entries
            where engagement_id = 'c8000000-0000-0000-0000-0000000000e1'), array['ref-ledger-1'],
  'and the Paystack reference');

-- The work is accepted: ₦47,500 to Chidi, ₦2,500 creator fee.
select lives_ok($$ select public.post_ledger_group('hire_settled', '00000000-0000-0000-0000-0000000c8004', 'accepted',
  'c8000000-0000-0000-0000-0000000000e1', null, null, null, null,
  '[{"account": "escrow", "amount": 5000000},
    {"account": "creator_wallet", "owner": "00000000-0000-0000-0000-0000000c8002", "amount": -4750000},
    {"account": "platform_revenue", "amount": -250000}]') $$, 'a settlement group posts');

-- A stranded ₦1,000 payment credits Ada's wallet.
select lives_ok($$ select public.post_ledger_group('payment_received', null, null, null, null, null, 'ref-ledger-2', null,
  '[{"account": "paystack", "amount": 100000},
    {"account": "business_wallet", "owner": "00000000-0000-0000-0000-0000000c8001", "amount": -100000}]') $$,
  'a stranded payment group posts');

select throws_ok($$ select public.post_ledger_group('payment_received', null, null, null, null, null, null, null,
  '[{"account": "paystack", "amount": 100000},
    {"account": "platform_revenue", "amount": -99999}]') $$, 'P0001', 'ledger_unbalanced',
  'an unbalanced group is refused');
select throws_ok($$ select public.post_ledger_group('payment_received', null, null, null, null, null, null, null, '[]') $$,
  'P0001', 'ledger_empty', 'an empty group is refused');
select throws_ok($$ select public.post_ledger_group('payment_received', null, null, null, null, null, null, null,
  '[{"account": "paystack", "amount": 0}]') $$, '23514', null, 'a zero line is refused');
select throws_ok($$ select public.post_ledger_group('payment_received', null, null, null, null, null, null, null,
  '[{"account": "paystack", "amount": 100000}, {"account": "creator_wallet", "amount": -100000}]') $$,
  '23514', null, 'a wallet line needs an owner');
select throws_ok($$ select public.post_ledger_group('payment_received', null, null, null, null, null, null, null,
  '[{"account": "paystack", "amount": 100000}, {"account": "escrow", "amount": -100000}]') $$,
  '23514', null, 'an escrow line needs an engagement');
select throws_ok($$ select public.post_ledger_group('payment_received', null, null, null, null, null, null, null,
  '[{"account": "piggy_bank", "amount": 100000}, {"account": "paystack", "amount": -100000}]') $$,
  '23514', null, 'an unknown account is refused');
select throws_ok($$ select public.post_ledger_group('gift', null, null, null, null, null, null, null,
  '[{"account": "paystack", "amount": 100000}, {"account": "platform_revenue", "amount": -100000}]') $$,
  '23514', null, 'an unknown event type is refused');
-- Three groups posted above (3 + 3 + 2 rows); the refused ones add nothing.
select is((select count(*)::integer from public.ledger_entries) - (select n from baseline)::integer, 8,
  'refused groups leave nothing behind');
select is((select count(*)::integer from (
  select group_id from public.ledger_entries group by group_id having sum(amount_kobo) <> 0) g), 0,
  'every group sums to zero');

-- Append-only, even for the table owner -------------------------------------------------------
select throws_ok($$ update public.ledger_entries set amount_kobo = amount_kobo * 2 $$, 'P0001', 'ledger_append_only',
  'ledger rows cannot be updated, even by the owner');
select throws_ok($$ delete from public.ledger_entries $$, 'P0001', 'ledger_append_only',
  'ledger rows cannot be deleted, even by the owner');
select throws_ok($$ truncate public.ledger_entries $$, 'P0001', 'ledger_append_only',
  'the ledger cannot be truncated');

-- Balances and totals -------------------------------------------------------------------------
select is(public.wallet_balance('00000000-0000-0000-0000-0000000c8002', 'creator_wallet'), 4750000::bigint,
  'Chidi''s wallet holds ₦47,500');
select is(public.wallet_balance('00000000-0000-0000-0000-0000000c8001', 'business_wallet'), 100000::bigint,
  'Ada''s wallet holds ₦1,000');
select is(public.wallet_balance('00000000-0000-0000-0000-0000000c8003', 'creator_wallet'), 0::bigint,
  'an empty wallet holds nothing');
select throws_ok($$ select public.wallet_balance('00000000-0000-0000-0000-0000000c8001', 'escrow') $$,
  'P0001', 'invalid_wallet_kind', 'wallet_balance only reads wallets');

select is((select sum(value::bigint) from jsonb_each_text(public.ledger_totals())), 0::numeric,
  'ledger totals sum to zero across all accounts');
select is((public.ledger_totals() ->> 'paystack')::bigint - (select (totals ->> 'paystack')::bigint from baseline),
  5350000::bigint, 'Paystack cash grew by ₦53,500');
select is((public.ledger_totals() ->> 'escrow')::bigint - (select (totals ->> 'escrow')::bigint from baseline),
  0::bigint, 'escrow is unchanged: this file''s hire was paid in and settled out');

-- Who reads what ------------------------------------------------------------------------------
-- The true row count, read as the owner before the role switch (people cannot
-- see all rows), for the admin check below.
create temp table all_rows as select count(*)::integer as n from public.ledger_entries;
grant select on all_rows to authenticated;

set local role authenticated;

set local request.jwt.claims = '{"sub": "88888888-0000-0000-0000-0000000c8001"}'; -- Ada
select is((select array_agg(account order by account) from public.ledger_entries),
  '{business_wallet,escrow,escrow}'::text[], 'Ada reads her wallet and her hire''s escrow, nothing internal');
select ok(exists (select 1 from public.fee_config), 'a signed-in person can read fee_config');
select throws_ok($$ select public.wallet_balance('00000000-0000-0000-0000-0000000c8001', 'business_wallet') $$,
  '42501', null, 'people cannot call wallet_balance directly');
select throws_ok($$ select public.post_ledger_group('correction', null, 'x', null, null, null, null, null,
  '[{"account": "paystack", "amount": 1}, {"account": "creator_wallet", "owner": "00000000-0000-0000-0000-0000000c8001", "amount": -1}]') $$,
  '42501', null, 'people cannot post to the ledger');
select throws_ok($$ insert into public.ledger_entries (group_id, event_type, account, amount_kobo, fee_config_id)
  values (gen_random_uuid(), 'correction', 'paystack', 1, (select id from public.fee_config limit 1)) $$,
  '42501', null, 'people cannot insert ledger rows');

set local request.jwt.claims = '{"sub": "88888888-0000-0000-0000-0000000c8002"}'; -- Chidi
select is((select array_agg(account order by account) from public.ledger_entries),
  '{creator_wallet,escrow,escrow}'::text[], 'Chidi reads his wallet and his hire''s escrow');

set local request.jwt.claims = '{"sub": "88888888-0000-0000-0000-0000000c8003"}'; -- Uche
select is((select count(*)::integer from public.ledger_entries), 0, 'an unrelated person reads nothing');

set local request.jwt.claims = '{"sub": "88888888-0000-0000-0000-0000000c8004"}'; -- Efe
select is((select count(*)::integer from public.ledger_entries), (select n from all_rows), 'an admin reads every row');

reset role;
set local role anon;
select throws_ok($$ select count(*) from public.ledger_entries $$, '42501', null, 'anon cannot read the ledger');

select * from finish();
rollback;
