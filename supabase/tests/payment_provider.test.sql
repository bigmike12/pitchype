-- Proves the rules from the payment_provider migration: only an admin flips
-- the switch and every flip is recorded, a payment keeps the provider it
-- started on whatever the switch says afterwards, Cray payments post to the
-- `cray` accounts and Paystack payments to `paystack` exactly as before, a
-- bank-transfer payment needs Cray, and the ledger accepts the new accounts
-- and events and nothing else.
-- Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(49);

-- Ada is a business, Zed an admin; creators d4011..d4016 are hired.
insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000d4001', 'd4d4d4d4-0000-0000-0000-0000000d4001', 'ada.provider@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000d4002', 'd4d4d4d4-0000-0000-0000-0000000d4002', 'zed.provider@example.com', 'admin'),
  ('00000000-0000-0000-0000-0000000d4011', 'd4d4d4d4-0000-0000-0000-0000000d4011', 'c1.provider@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000d4012', 'd4d4d4d4-0000-0000-0000-0000000d4012', 'c2.provider@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000d4013', 'd4d4d4d4-0000-0000-0000-0000000d4013', 'c3.provider@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000d4014', 'd4d4d4d4-0000-0000-0000-0000000d4014', 'c4.provider@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000d4015', 'd4d4d4d4-0000-0000-0000-0000000d4015', 'c5.provider@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000d4016', 'd4d4d4d4-0000-0000-0000-0000000d4016', 'c6.provider@example.com', 'influencer');

insert into public.business_profiles (user_id, business_name, contact_name, state, city) values
  ('00000000-0000-0000-0000-0000000d4001', 'Ada Provider Kitchen', 'Ada Obi', 'Lagos', 'Ikeja');

insert into public.campaigns (id, business_id, status, title, brief, price_kobo, places,
                              applications_close_on, deliver_by, published_at, submitted_at) values
  ('d4000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000d4001', 'open', 'Provider test',
   'A brief that is long enough for the checks.', 5000000, 6, public.lagos_today() + 10, public.lagos_today() + 20, now(), now());

insert into public.applications (id, campaign_id, creator_id, status)
select ('d4000000-0000-0000-0000-0000000000a' || x.n)::uuid, 'd4000000-0000-0000-0000-000000000001',
       ('00000000-0000-0000-0000-0000000d401' || x.n)::uuid, 'approved'
  from generate_series(1, 6) as x (n);

-- ₦50,000 each, 48 hours to pay: e1 to e6.
insert into public.engagements (id, application_id, campaign_id, business_id, creator_id, agreed_price_kobo, pay_by)
select ('d4000000-0000-0000-0000-0000000000e' || x.n)::uuid,
       ('d4000000-0000-0000-0000-0000000000a' || x.n)::uuid,
       'd4000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000d4001',
       ('00000000-0000-0000-0000-0000000d401' || x.n)::uuid, 5000000, now() + interval '48 hours'
  from generate_series(1, 6) as x (n);

-- The switch -----------------------------------------------------------------------------------------
select is(public.active_payment_provider(), 'cray', 'Cray is the default provider');
select is((select count(*)::integer from public.payment_provider_settings
            where provider = 'cray' and changed_by is null and reason = 'Default since 2026-11-21'), 1,
  'seeded with one row, reason recorded, nobody as the author');

set local role authenticated;
set local request.jwt.claims = '{"sub": "d4d4d4d4-0000-0000-0000-0000000d4001"}'; -- Ada, a business
select throws_ok($$ select public.set_payment_provider('paystack', 'Trying it out') $$,
  'P0001', 'not_admin', 'a business cannot flip the switch');
select is(public.active_payment_provider(), 'cray', 'but can read which provider is active');
select is((select count(*)::integer from public.payment_provider_settings), 0,
  'and cannot read the history');
select throws_ok($$ insert into public.payment_provider_settings (provider, reason) values ('paystack', 'sneaky') $$,
  '42501', null, 'no direct insert for signed-in users');
reset role;

set local role anon;
select throws_ok($$ select public.set_payment_provider('paystack', 'Trying it out') $$,
  '42501', null, 'anon cannot call the switch');
reset role;
set local role service_role;
select throws_ok($$ insert into public.payment_provider_settings (provider, reason) values ('paystack', 'sneaky') $$,
  '42501', null, 'not even the service role writes the table directly');
reset role;
select throws_ok($$ update public.payment_provider_settings set reason = 'changed' $$,
  'P0001', 'payment_provider_settings_append_only', 'rows are never updated');
select throws_ok($$ delete from public.payment_provider_settings $$,
  'P0001', 'payment_provider_settings_append_only', 'or deleted');

set local role authenticated;
set local request.jwt.claims = '{"sub": "d4d4d4d4-0000-0000-0000-0000000d4002"}'; -- Zed, an admin
select throws_ok($$ select public.set_payment_provider('stripe', 'Not a provider') $$,
  'P0001', 'invalid_provider', 'an unknown provider is refused');
select throws_ok($$ select public.set_payment_provider('paystack', 'ab') $$,
  'P0001', 'reason_required', 'a reason under 3 characters is refused');
select throws_ok($$ select public.set_payment_provider('paystack', '   ') $$,
  'P0001', 'reason_required', 'a blank reason is refused');
select throws_ok($$ select public.set_payment_provider('cray', 'Already on Cray') $$,
  'P0001', 'already_active', 'switching to the active provider is refused');
select lives_ok($$ select public.set_payment_provider('paystack', 'Cray sandbox is down') $$,
  'an admin switches to Paystack with a reason');
select is(public.active_payment_provider(), 'paystack', 'and the latest row decides');
select is((select count(*)::integer from public.payment_provider_settings), 2,
  'an admin reads the history');
reset role;
select is((select changed_by || ':' || reason from public.payment_provider_settings order by seq desc limit 1),
  '00000000-0000-0000-0000-0000000d4002:Cray sandbox is down', 'the row records who and why');

-- A payment keeps the provider it started on ------------------------------------------------------------
-- Active is Paystack now: e1 starts a Paystack payment, then the switch goes back to Cray.
set local role authenticated;
set local request.jwt.claims = '{"sub": "d4d4d4d4-0000-0000-0000-0000000d4001"}'; -- Ada
select is(public.start_payment('d4000000-0000-0000-0000-0000000000e1', true) ->> 'provider', 'paystack',
  'a payment started while Paystack is active is a Paystack payment');
select throws_ok($$ select public.start_payment('d4000000-0000-0000-0000-0000000000e2', true, 'transfer') $$,
  'P0001', 'transfer_not_available', 'bank transfer is not offered while Paystack is active');
select throws_ok($$ select public.start_payment('d4000000-0000-0000-0000-0000000000e2', true, 'cheque') $$,
  '22023', 'invalid_method', 'an unknown method is refused');
set local request.jwt.claims = '{"sub": "d4d4d4d4-0000-0000-0000-0000000d4002"}'; -- Zed
select public.set_payment_provider('cray', 'Cray is back');
set local request.jwt.claims = '{"sub": "d4d4d4d4-0000-0000-0000-0000000d4001"}'; -- Ada
select is(public.start_payment('d4000000-0000-0000-0000-0000000000e2', true) ->> 'provider', 'cray',
  'a payment started while Cray is active is a Cray payment');
select is(public.start_payment('d4000000-0000-0000-0000-0000000000e3', true) ->> 'method', 'card',
  'the method defaults to card');
reset role;
select is((select provider || ':' || method from public.payments
            where engagement_id = 'd4000000-0000-0000-0000-0000000000e1' and status = 'initiated'),
  'paystack:card', 'the Paystack payment is stamped paystack and card');

-- The switch goes back to Paystack with e2 (Cray) and e3 (Cray) payments in flight.
set local role authenticated;
set local request.jwt.claims = '{"sub": "d4d4d4d4-0000-0000-0000-0000000d4002"}'; -- Zed
select public.set_payment_provider('paystack', 'Flipping again mid-checkout');
reset role;
select is((select provider from public.payments
            where engagement_id = 'd4000000-0000-0000-0000-0000000000e2' and status = 'initiated'),
  'cray', 'a started payment keeps its provider after the switch is flipped');

-- Cray payment confirmed while Paystack is active: posts to cray, no fee group when the business bore the charge.
set local role service_role;
select is(public.record_card_payment(
    (select reference from public.payments where engagement_id = 'd4000000-0000-0000-0000-0000000000e2' and status = 'initiated'),
    5250000, 0, 'cray.charge:e2', '{}'),
  'funded', 'the Cray payment funds the hire even though Paystack is now active');
reset role;
select is((select sum(amount_kobo) from public.ledger_entries
            where engagement_id = 'd4000000-0000-0000-0000-0000000000e2' and account = 'cray'), 5250000::numeric,
  'Cray cash is the full card amount (the business carried Cray''s charge)');
select is((select sum(amount_kobo) from public.ledger_entries
            where engagement_id = 'd4000000-0000-0000-0000-0000000000e2' and account = 'escrow'), -5000000::numeric,
  'escrow holds the full price');
select is((select sum(amount_kobo) from public.ledger_entries
            where engagement_id = 'd4000000-0000-0000-0000-0000000000e2' and account = 'platform_revenue'), -250000::numeric,
  'and we keep the whole fee');
select is((select count(*)::integer from public.ledger_entries
            where engagement_id = 'd4000000-0000-0000-0000-0000000000e2'
              and account in ('paystack', 'paystack_fees', 'cray_fees')), 0,
  'nothing touched the Paystack accounts or the fee accounts');

-- Cray payment with a charge we bore: processor_fee to cray_fees.
set local role service_role;
select is(public.record_card_payment(
    (select reference from public.payments where engagement_id = 'd4000000-0000-0000-0000-0000000000e3' and status = 'initiated'),
    5250000, 10000, 'cray.charge:e3', '{}'),
  'funded', 'a Cray payment with a charge on our side funds the hire');
reset role;
select is((select array_agg(distinct event_type order by event_type) from public.ledger_entries
            where engagement_id = 'd4000000-0000-0000-0000-0000000000e3'),
  '{payment_received,processor_fee}'::text[], 'as payment_received and processor_fee groups');
select is((select sum(amount_kobo) from public.ledger_entries
            where engagement_id = 'd4000000-0000-0000-0000-0000000000e3' and account = 'cray_fees'), 10000::numeric,
  'the charge is booked to cray_fees');

-- Paystack payment is exactly as before: paystack and paystack_fees.
set local role service_role;
select is(public.record_card_payment(
    (select reference from public.payments where engagement_id = 'd4000000-0000-0000-0000-0000000000e1' and status = 'initiated'),
    5250000, 95406, 'evt-e1', '{}'),
  'funded', 'the Paystack payment funds the hire');
reset role;
select is((select sum(amount_kobo) from public.ledger_entries
            where engagement_id = 'd4000000-0000-0000-0000-0000000000e1' and account = 'paystack'), (5250000 - 95406)::numeric,
  'Paystack cash is the card amount less its charge');
select is((select array_agg(distinct event_type order by event_type) from public.ledger_entries
            where engagement_id = 'd4000000-0000-0000-0000-0000000000e1'),
  '{payment_received,paystack_fee}'::text[], 'with a paystack_fee group, as before');

-- Bank transfer payments (Cray active) ----------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "d4d4d4d4-0000-0000-0000-0000000d4002"}'; -- Zed
select public.set_payment_provider('cray', 'Cray again');
set local request.jwt.claims = '{"sub": "d4d4d4d4-0000-0000-0000-0000000d4001"}'; -- Ada
select is(public.start_payment('d4000000-0000-0000-0000-0000000000e5', true, 'transfer') ->> 'method', 'transfer',
  'bank transfer is offered while Cray is active');
reset role;
set local role service_role;
select throws_ok($$ select public.record_card_payment(
    (select reference from public.payments where engagement_id = 'd4000000-0000-0000-0000-0000000000e5' and status = 'initiated'),
    5250000, 0, 'cray.charge:e5', '{}') $$,
  'P0001', 'no_such_payment', 'a card event for a transfer payment is refused');
reset role;

-- Stranded Cray payment: credited to the wallet at cray.
set local role authenticated;
set local request.jwt.claims = '{"sub": "d4d4d4d4-0000-0000-0000-0000000d4001"}'; -- Ada
select public.start_payment('d4000000-0000-0000-0000-0000000000e4', true);
select public.start_payment('d4000000-0000-0000-0000-0000000000e4', true);
reset role;
set local role service_role;
select is(public.record_card_payment(
    (select reference from public.payments where engagement_id = 'd4000000-0000-0000-0000-0000000000e4' and status = 'initiated'),
    5250000, 0, 'cray.charge:e4-new', '{}'),
  'funded', 'the newer Cray payment funds the hire');
select is(public.record_card_payment(
    (select reference from public.payments where engagement_id = 'd4000000-0000-0000-0000-0000000000e4' and status = 'failed'),
    5250000, 0, 'cray.charge:e4-old', '{}'),
  'stranded', 'a late success on the superseded Cray payment is stranded');
reset role;
select is(public.wallet_balance('00000000-0000-0000-0000-0000000d4001', 'business_wallet'), 5250000::bigint,
  'the stranded Cray money is in Ada''s wallet');
select is((select sum(amount_kobo) from public.ledger_entries
            where engagement_id = 'd4000000-0000-0000-0000-0000000000e4' and account = 'cray'), 10500000::numeric,
  'and it was received at cray, not at paystack');

-- A wallet-only payment is recorded as one (Ada's wallet holds the stranded ₦52,500) ----------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "d4d4d4d4-0000-0000-0000-0000000d4001"}'; -- Ada
select public.pay_from_wallet('d4000000-0000-0000-0000-0000000000e6', true);
reset role;
select is((select method from public.payments
            where engagement_id = 'd4000000-0000-0000-0000-0000000000e6' and status = 'succeeded'),
  'wallet', 'a wallet-only payment is stamped as a wallet payment');

-- The ledger ---------------------------------------------------------------------------------------------------
select lives_ok($$ select public.post_ledger_group('cash_moved', null, 'test', null, null, null, null, null,
  '[{"account": "bank", "amount": -100}, {"account": "cray", "amount": 100}]') $$,
  'the ledger accepts the bank and cray accounts and the cash_moved event');
select throws_ok($$ select public.post_ledger_group('correction', null, 'test', null, null, null, null, null,
  '[{"account": "stripe", "amount": 100}, {"account": "bank", "amount": -100}]') $$,
  '23514', null, 'but not an unknown account');
select throws_ok($$ select public.post_ledger_group('refund_cheque', null, 'test', null, null, null, null, null,
  '[{"account": "bank", "amount": 100}, {"account": "cray", "amount": -100}]') $$,
  '23514', null, 'or an unknown event type');
select ok((select public.ledger_totals() ?& array['cray', 'cray_fees', 'bank']),
  'ledger_totals() lists the new accounts');
select is((select sum(value::bigint) from jsonb_each_text(public.ledger_totals())), 0::numeric,
  'every group balanced: ledger totals sum to zero');
select throws_ok($$ insert into public.payments (engagement_id, reference, total_kobo, business_fee_kobo, fee_config_id,
                                   card_amount_kobo, wallet_part_kobo, fee_notice_seen_at, provider)
  values ('d4000000-0000-0000-0000-0000000000e6', 'pit_0123456789abcdef0123456789abcdef', 100, 10,
          (public.current_fee_config()).id, 100, 0, now(), 'stripe') $$,
  '23514', null, 'a payment can only be on cray or paystack');

select * from finish();
rollback;
