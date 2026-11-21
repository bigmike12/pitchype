-- creator_wallet_summary(): the wallet told as earned before our fee, the fee,
-- payouts and what is left. The rule that matters is that the parts always add
-- up to wallet_balance(), whatever has happened (a full release, a split, a
-- requested payout, a rejected one). Only the server may read it.
-- Run with: supabase test db
begin;

-- Cray is the default provider (payment_provider migration). This file proves
-- the Paystack path, which stays supported behind the admin switch, so it
-- pins Paystack for its own transaction; every assertion below is unchanged.
insert into public.payment_provider_settings (provider, reason)
values ('paystack', 'Test setup: exercise the Paystack path');

create extension if not exists pgtap with schema extensions;

select plan(13);

insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000d1001', 'd1d1d1d1-0000-0000-0000-0000000d1001', 'ada.summary@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000d1002', 'd1d1d1d1-0000-0000-0000-0000000d1002', 'efe.summary@example.com', 'admin'),
  ('00000000-0000-0000-0000-0000000d1101', 'd1d1d1d1-0000-0000-0000-0000000d1101', 'chidi.summary@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000d1102', 'd1d1d1d1-0000-0000-0000-0000000d1102', 'kemi.summary@example.com', 'influencer');

insert into public.business_profiles (user_id, business_name, contact_name, state, city) values
  ('00000000-0000-0000-0000-0000000d1001', 'Ada Summary Kitchen', 'Ada Obi', 'Lagos', 'Ikeja');

insert into public.campaigns (id, business_id, status, title, brief, price_kobo, places,
                              applications_close_on, deliver_by, published_at, submitted_at) values
  ('d1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000d1001', 'open', 'Summary test',
   'A brief that is long enough for the checks.', 2500000, 10, public.lagos_today() + 10, public.lagos_today() + 20, now(), now());

-- Chidi has two hires (₦25,000 each); Kemi has one that is refunded.
insert into public.applications (id, campaign_id, creator_id, status) values
  ('d1000000-0000-0000-0000-0000000a0001', 'd1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000d1101', 'approved'),
  ('d1000000-0000-0000-0000-0000000a0002', 'd1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000d1102', 'approved');
insert into public.engagements (id, application_id, campaign_id, business_id, creator_id, agreed_price_kobo, pay_by) values
  ('d1000000-0000-0000-0000-0000000e0001', 'd1000000-0000-0000-0000-0000000a0001', 'd1000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000d1001', '00000000-0000-0000-0000-0000000d1101', 2500000, now() + interval '48 hours'),
  ('d1000000-0000-0000-0000-0000000e0002', 'd1000000-0000-0000-0000-0000000a0002', 'd1000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000d1001', '00000000-0000-0000-0000-0000000d1102', 2500000, now() + interval '48 hours');
-- A second hire for Chidi, on a second campaign (one application per creator per campaign).
insert into public.campaigns (id, business_id, status, title, brief, price_kobo, places,
                              applications_close_on, deliver_by, published_at, submitted_at) values
  ('d1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000d1001', 'open', 'Summary test two',
   'A brief that is long enough for the checks.', 2500000, 10, public.lagos_today() + 10, public.lagos_today() + 20, now(), now());
insert into public.applications (id, campaign_id, creator_id, status) values
  ('d1000000-0000-0000-0000-0000000a0004', 'd1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000d1101', 'approved');
insert into public.engagements (id, application_id, campaign_id, business_id, creator_id, agreed_price_kobo, pay_by) values
  ('d1000000-0000-0000-0000-0000000e0003', 'd1000000-0000-0000-0000-0000000a0004', 'd1000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-0000000d1001', '00000000-0000-0000-0000-0000000d1101', 2500000, now() + interval '48 hours');

-- Fund all three by card the way the app does.
do $$
declare
  hire uuid;
  started jsonb;
  n integer := 0;
begin
  for hire in select id from public.engagements where id::text like 'd1000000-%' order by id loop
    n := n + 1;
    perform set_config('request.jwt.claims', '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1001"}', true);
    started := public.start_payment(hire, true);
    perform set_config('request.jwt.claims', '', true);
    perform public.record_card_payment(started ->> 'reference', (started ->> 'card_amount_kobo')::bigint,
      49375, 'evt-summary-fund-' || n, '{}');
  end loop;
end;
$$;

-- Nobody has earned anything yet.
select results_eq(
  $$ select earned_kobo, fee_kobo, payouts_kobo, other_kobo
       from public.creator_wallet_summary('00000000-0000-0000-0000-0000000d1101') $$,
  $$ values (0::bigint, 0::bigint, 0::bigint, 0::bigint) $$,
  'a creator with nothing settled has an all-zero summary');

-- The ₦25,000 job: ₦25,000 before our fee, ₦1,250 fee, ₦23,750 in the wallet.
select public.settle_engagement_internal('d1000000-0000-0000-0000-0000000e0001',
  'release', null, 'done', '00000000-0000-0000-0000-0000000d1002');
select results_eq(
  $$ select earned_kobo, fee_kobo, payouts_kobo, other_kobo
       from public.creator_wallet_summary('00000000-0000-0000-0000-0000000d1101') $$,
  $$ values (2500000::bigint, 125000::bigint, 0::bigint, 0::bigint) $$,
  'a full release: ₦25,000 earned, ₦1,250 fee');
select is(public.wallet_balance('00000000-0000-0000-0000-0000000d1101', 'creator_wallet'), 2375000::bigint,
  'and the wallet holds the ₦23,750');

-- A split: only the released part earns, and only that part pays the fee.
select public.settle_engagement_internal('d1000000-0000-0000-0000-0000000e0003',
  'split', 1000000, 'half done', '00000000-0000-0000-0000-0000000d1002');
select results_eq(
  $$ select earned_kobo, fee_kobo from public.creator_wallet_summary('00000000-0000-0000-0000-0000000d1101') $$,
  $$ values (3500000::bigint, 175000::bigint) $$,
  'a split adds only the released ₦10,000 and a fee on that part (the ₦500 minimum is below 5%)');

-- A refund releases nothing, so Kemi earned nothing.
select public.settle_engagement_internal('d1000000-0000-0000-0000-0000000e0002',
  'refund', null, 'cancelled', '00000000-0000-0000-0000-0000000d1002');
select results_eq(
  $$ select earned_kobo, fee_kobo, payouts_kobo, other_kobo
       from public.creator_wallet_summary('00000000-0000-0000-0000-0000000d1102') $$,
  $$ values (0::bigint, 0::bigint, 0::bigint, 0::bigint) $$,
  'a refunded hire earns the creator nothing');

-- A payout request moves money out; a rejection gives it back.
insert into public.bank_accounts (user_id, bank_code, bank_name, last4, account_name, recipient_code) values
  ('00000000-0000-0000-0000-0000000d1101', '058', 'GTBank', '1234', 'CHIDI', 'RCP_sum1');
set local role authenticated;
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1101"}';
select public.request_payout(2000000);
reset role;
select results_eq(
  $$ select earned_kobo, fee_kobo, payouts_kobo from public.creator_wallet_summary('00000000-0000-0000-0000-0000000d1101') $$,
  $$ values (3500000::bigint, 175000::bigint, 2000000::bigint) $$,
  'a requested payout counts as paid out or on its way');

select is(
  (select earned_kobo - fee_kobo - payouts_kobo + other_kobo
     from public.creator_wallet_summary('00000000-0000-0000-0000-0000000d1101')),
  public.wallet_balance('00000000-0000-0000-0000-0000000d1101', 'creator_wallet'),
  'earned − fee − payouts + other is the wallet balance');

set local role authenticated;
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1002"}';
select public.reject_payout((select id from public.payouts where user_id = '00000000-0000-0000-0000-0000000d1101'), 'test');
reset role;
select is(
  (select payouts_kobo from public.creator_wallet_summary('00000000-0000-0000-0000-0000000d1101')), 0::bigint,
  'a rejected payout is no longer counted');
select is(
  (select earned_kobo - fee_kobo - payouts_kobo + other_kobo
     from public.creator_wallet_summary('00000000-0000-0000-0000-0000000d1101')),
  public.wallet_balance('00000000-0000-0000-0000-0000000d1101', 'creator_wallet'),
  'and the parts still add up to the balance');

-- Only the server reads it.
select ok(not has_function_privilege('authenticated', 'public.creator_wallet_summary(uuid)', 'execute'),
  'a signed-in person cannot call it');
select ok(not has_function_privilege('anon', 'public.creator_wallet_summary(uuid)', 'execute'),
  'nor can anon');
select ok(has_function_privilege('service_role', 'public.creator_wallet_summary(uuid)', 'execute'),
  'the server can');
select ok(pg_get_functiondef('public.creator_wallet_summary(uuid)'::regprocedure) ~ 'search_path',
  'it pins its search path');

select * from finish();
rollback;
