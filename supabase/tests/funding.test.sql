-- Proves the rules from the create_funding migration: starting a payment
-- freezes the figures, a card payment funds escrow exactly once however many
-- times it is reported, a wrong amount funds nothing, a payment that arrives
-- after the approval lapsed lands in the business wallet, a payment in flight
-- holds the lapse and the cancel, wallet funding never overdraws, the fee
-- snapshot comes from the payment, and the ledger hardening holds.
-- Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(94);

-- Ada and Bola are businesses; creators c9011..c9016 are hired.
insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000c9001', '9c9c9c9c-0000-0000-0000-0000000c9001', 'ada.funding@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000c9002', '9c9c9c9c-0000-0000-0000-0000000c9002', 'bola.funding@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000c9011', '9c9c9c9c-0000-0000-0000-0000000c9011', 'c1.funding@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000c9012', '9c9c9c9c-0000-0000-0000-0000000c9012', 'c2.funding@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000c9013', '9c9c9c9c-0000-0000-0000-0000000c9013', 'c3.funding@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000c9015', '9c9c9c9c-0000-0000-0000-0000000c9015', 'c5.funding@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000c9016', '9c9c9c9c-0000-0000-0000-0000000c9016', 'c6.funding@example.com', 'influencer');

insert into public.business_profiles (user_id, business_name, contact_name, state, city) values
  ('00000000-0000-0000-0000-0000000c9001', 'Ada Funding Kitchen', 'Ada Obi', 'Lagos', 'Ikeja'),
  ('00000000-0000-0000-0000-0000000c9002', 'Bola Funding Shop', 'Bola A', 'Oyo', 'Ibadan');

insert into public.campaigns (id, business_id, status, title, brief, price_kobo, places,
                              applications_close_on, deliver_by, published_at, submitted_at) values
  ('c9000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000c9001', 'open', 'Funding test A',
   'A brief that is long enough for the checks.', 5000000, 6, public.lagos_today() + 10, public.lagos_today() + 20, now(), now()),
  ('c9000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000c9002', 'open', 'Funding test B',
   'A brief that is long enough for the checks.', 5000000, 6, public.lagos_today() + 10, public.lagos_today() + 20, now(), now());

insert into public.applications (id, campaign_id, creator_id, status) values
  ('c9000000-0000-0000-0000-0000000000a1', 'c9000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000c9011', 'approved'),
  ('c9000000-0000-0000-0000-0000000000a2', 'c9000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000c9012', 'approved'),
  ('c9000000-0000-0000-0000-0000000000a3', 'c9000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000c9013', 'approved'),
  ('c9000000-0000-0000-0000-0000000000a5', 'c9000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000c9015', 'approved'),
  ('c9000000-0000-0000-0000-0000000000a6', 'c9000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000c9016', 'approved'),
  ('c9000000-0000-0000-0000-0000000000b1', 'c9000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000c9011', 'approved'),
  ('c9000000-0000-0000-0000-0000000000b2', 'c9000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000c9012', 'approved'),
  ('c9000000-0000-0000-0000-0000000000b3', 'c9000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000c9013', 'approved');

-- ₦50,000 each, 48 hours to pay. Ada: e1, e2, e3, e5, e6. Bola: f1, f2, f3.
insert into public.engagements (id, application_id, campaign_id, business_id, creator_id, agreed_price_kobo, pay_by)
select ('c9000000-0000-0000-0000-0000000000' || x.tag)::uuid,
       ('c9000000-0000-0000-0000-0000000000' || x.app)::uuid,
       x.campaign::uuid, x.business::uuid, x.creator::uuid, 5000000, now() + interval '48 hours'
  from (values
    ('e1', 'a1', 'c9000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000c9001', '00000000-0000-0000-0000-0000000c9011'),
    ('e2', 'a2', 'c9000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000c9001', '00000000-0000-0000-0000-0000000c9012'),
    ('e3', 'a3', 'c9000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000c9001', '00000000-0000-0000-0000-0000000c9013'),
    ('e5', 'a5', 'c9000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000c9001', '00000000-0000-0000-0000-0000000c9015'),
    ('e6', 'a6', 'c9000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000c9001', '00000000-0000-0000-0000-0000000c9016'),
    ('f1', 'b1', 'c9000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000c9002', '00000000-0000-0000-0000-0000000c9011'),
    ('f2', 'b2', 'c9000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000c9002', '00000000-0000-0000-0000-0000000c9012'),
    ('f3', 'b3', 'c9000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000c9002', '00000000-0000-0000-0000-0000000c9013')
  ) x (tag, app, campaign, business, creator);

-- Ledger hardening ------------------------------------------------------------------------------
select is((select string_agg(tgname || '=' || tgenabled::text, ',' order by tgname) from pg_trigger
            where tgrelid in ('public.ledger_entries'::regclass, 'public.fee_config'::regclass) and not tgisinternal),
  'fee_config_append_only=A,fee_config_no_truncate=A,ledger_entries_append_only=A,ledger_entries_no_truncate=A',
  'the append-only triggers fire always, even in replica mode');
select throws_ok($$ select public.post_ledger_group('correction', null, 'x', null, null, null, null, null,
  '[{"account": "paystack", "amount": "10"}, {"account": "platform_revenue", "amount": -10}]') $$,
  'P0001', 'ledger_bad_line', 'a quoted amount is refused');
select throws_ok($$ select public.post_ledger_group('correction', null, 'x', null, null, null, null, null,
  '[{"account": "paystack", "amount": null}, {"account": "platform_revenue", "amount": 0}]') $$,
  'P0001', 'ledger_bad_line', 'a null amount is refused');
select throws_ok($$ select public.post_ledger_group('correction', null, 'x', null, null, null, null, null,
  '[{"account": "paystack", "amount": 10}, {"account": "platform_revenue"}]') $$,
  'P0001', 'ledger_bad_line', 'a missing amount is refused');
select throws_ok($$ select public.post_ledger_group('correction', null, 'x', null, null, null, null, null,
  '["paystack", {"account": "paystack", "amount": 0}]') $$,
  'P0001', 'ledger_bad_line', 'a line that is not an object is refused');
select throws_ok($$ select public.post_ledger_group('correction', null, 'x', null, gen_random_uuid(), null, null, null,
  '[{"account": "paystack", "amount": 10}, {"account": "platform_revenue", "amount": -10}]') $$,
  '23503', null, 'a ledger row must point at a real payment');

-- Starting a payment ------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "9c9c9c9c-0000-0000-0000-0000000c9001"}'; -- Ada

select throws_ok($$ select public.start_payment('c9000000-0000-0000-0000-0000000000e1', false) $$,
  '22023', 'fee_notice_required', 'start_payment refuses unless the fee notice was seen');
select throws_ok($$ select public.start_payment('c9000000-0000-0000-0000-0000000000e1', null) $$,
  '22023', 'fee_notice_required', 'a null fee notice counts as not seen');
select is(public.start_payment('c9000000-0000-0000-0000-0000000000e1', true) ->> 'card_amount_kobo', '5250000',
  'a ₦50,000 hire with an empty wallet: the card pays ₦52,500');
select is(public.start_payment('c9000000-0000-0000-0000-0000000000e1', true) ->> 'email', 'ada.funding@example.com',
  'start_payment returns the business email for Paystack');

reset role;
select is((select count(*)::integer from public.payments where engagement_id = 'c9000000-0000-0000-0000-0000000000e1'), 2,
  'each call makes a new payment');
select is((select count(*)::integer from public.payments
            where engagement_id = 'c9000000-0000-0000-0000-0000000000e1' and status = 'initiated'), 1,
  'but only the newest stays initiated');
select is((select count(*)::integer from public.payments
            where engagement_id = 'c9000000-0000-0000-0000-0000000000e1' and status = 'failed'), 1,
  'the older one is marked failed, not deleted');
select is((select count(distinct reference)::integer from public.payments
            where engagement_id = 'c9000000-0000-0000-0000-0000000000e1'
              and reference ~ '^pit_[0-9a-f]{32}$'), 2,
  'references are distinct and look like pit_<32 hex>');
select is((select array[total_kobo, business_fee_kobo, card_amount_kobo, wallet_part_kobo] from public.payments
            where engagement_id = 'c9000000-0000-0000-0000-0000000000e1' and status = 'initiated'),
  array[5250000, 250000, 5250000, 0]::bigint[], 'the payment freezes total, fee, card part and wallet part');
select is((select fee_config_id from public.payments
            where engagement_id = 'c9000000-0000-0000-0000-0000000000e1' and status = 'initiated'),
  (public.current_fee_config()).id, 'and the fee_config it used');
select ok((select fee_notice_seen_at is not null from public.payments
            where engagement_id = 'c9000000-0000-0000-0000-0000000000e1' and status = 'initiated'),
  'and when the business saw the fee notice');

set local role authenticated;
set local request.jwt.claims = '{"sub": "9c9c9c9c-0000-0000-0000-0000000c9002"}'; -- Bola
select throws_ok($$ select public.start_payment('c9000000-0000-0000-0000-0000000000e1', true) $$,
  'P0001', 'no_such_engagement', 'another business cannot pay for Ada''s hire');
set local request.jwt.claims = '{"sub": "9c9c9c9c-0000-0000-0000-0000000c9011"}'; -- a creator
select throws_ok($$ select public.start_payment('c9000000-0000-0000-0000-0000000000e1', true) $$,
  '42501', null, 'creators do not start payments');
select throws_ok($$ select public.record_card_payment('x', 1, 0, 'k', '{}') $$,
  '42501', null, 'authenticated cannot call record_card_payment');
reset role;
set local role anon;
select throws_ok($$ select public.record_card_payment('x', 1, 0, 'k', '{}') $$,
  '42501', null, 'anon cannot call record_card_payment');
select throws_ok($$ select public.start_payment('c9000000-0000-0000-0000-0000000000e1', true) $$,
  '42501', null, 'anon cannot start a payment');
reset role;
select ok(not has_function_privilege('service_role', 'public.fund_engagement(uuid)', 'execute'),
  'fund_engagement is internal, not even the service role calls it');

-- A card payment succeeds -------------------------------------------------------------------------
set local role service_role;
select is(public.record_card_payment(
    (select reference from public.payments where engagement_id = 'c9000000-0000-0000-0000-0000000000e1' and status = 'initiated'),
    5250000, 95406, 'evt-e1', '{"event": "charge.success"}'),
  'funded', 'the right amount funds the hire');
reset role;

select is((select status::text from public.engagements where id = 'c9000000-0000-0000-0000-0000000000e1'), 'funded',
  'the engagement is funded');
select is((select array[business_fee_kobo, creator_fee_bps, creator_min_fee_kobo] from public.engagements
            where id = 'c9000000-0000-0000-0000-0000000000e1'),
  array[250000, 500, 50000]::bigint[], 'with the fee snapshot');
select ok((select funded_at is not null and fee_config_id = (public.current_fee_config()).id
             from public.engagements where id = 'c9000000-0000-0000-0000-0000000000e1'),
  'funded_at and the fee_config id are set');
select is((select sum(amount_kobo) from public.ledger_entries
            where engagement_id = 'c9000000-0000-0000-0000-0000000000e1' and account = 'escrow'), -5000000::numeric,
  'escrow holds ₦50,000 for the hire');
select is((select sum(amount_kobo) from public.ledger_entries
            where engagement_id = 'c9000000-0000-0000-0000-0000000000e1' and account = 'platform_revenue'), -250000::numeric,
  'platform revenue records the ₦2,500 fee');
select is((select sum(amount_kobo) from public.ledger_entries
            where engagement_id = 'c9000000-0000-0000-0000-0000000000e1' and account = 'paystack_fees'), 95406::numeric,
  'the Paystack charge is booked to paystack_fees');
select is((select sum(amount_kobo) from public.ledger_entries
            where engagement_id = 'c9000000-0000-0000-0000-0000000000e1' and account = 'paystack'), (5250000 - 95406)::numeric,
  'Paystack cash is the card amount less its charge');
select is((select array_agg(distinct event_type order by event_type) from public.ledger_entries
            where engagement_id = 'c9000000-0000-0000-0000-0000000000e1'),
  '{payment_received,paystack_fee}'::text[], 'as a payment_received group and a paystack_fee group');
select is((select status || ':' || paystack_fee_kobo from public.payments
            where engagement_id = 'c9000000-0000-0000-0000-0000000000e1' and card_amount_kobo = 5250000
              and reference = (select paystack_reference from public.ledger_entries
                                where engagement_id = 'c9000000-0000-0000-0000-0000000000e1' limit 1)),
  'succeeded:95406', 'the payment is succeeded with its Paystack charge');
select is((select sum(value::bigint) from jsonb_each_text(public.ledger_totals())), 0::numeric,
  'ledger totals sum to zero after funding');

-- Duplicates ---------------------------------------------------------------------------------------
select is(public.record_card_payment(
    (select reference from public.payments where engagement_id = 'c9000000-0000-0000-0000-0000000000e1' and status = 'succeeded'),
    5250000, 95406, 'evt-e1', '{}'),
  'duplicate', 'the same event again is a duplicate');
select is(public.record_card_payment(
    (select reference from public.payments where engagement_id = 'c9000000-0000-0000-0000-0000000000e1' and status = 'succeeded'),
    5250000, 95406, 'evt-e1-callback', '{}'),
  'duplicate', 'the same reference with another event key does not fund twice');
select is((select count(*)::integer from public.ledger_entries where engagement_id = 'c9000000-0000-0000-0000-0000000000e1'), 5,
  'and no new ledger rows were written');
select throws_ok($$ select public.record_card_payment('pit_nope', 5250000, 0, 'evt-nope', '{}') $$,
  'P0001', 'no_such_payment', 'an unknown reference is refused');
select is((select count(*)::integer from public.payment_events where event_key = 'evt-nope'), 0,
  'and leaves no event behind');

-- A late success on the superseded payment: the hire is already funded, so it is stranded.
select is(public.record_card_payment(
    (select reference from public.payments where engagement_id = 'c9000000-0000-0000-0000-0000000000e1' and status = 'failed'),
    5250000, 95406, 'evt-e1-old', '{}'),
  'stranded', 'a late success on a superseded payment is stranded once the hire is funded');
select is(public.wallet_balance('00000000-0000-0000-0000-0000000c9001', 'business_wallet'), 5250000::bigint,
  'and lands in Ada''s wallet');
select is((select count(*)::integer from public.payments
            where engagement_id = 'c9000000-0000-0000-0000-0000000000e1' and status = 'succeeded'), 2,
  'both payments are now succeeded');
select is((select sum(amount_kobo) from public.ledger_entries
            where engagement_id = 'c9000000-0000-0000-0000-0000000000e1' and account = 'escrow'), -5000000::numeric,
  'escrow is not funded twice');

-- Paying from the wallet the stranded payment filled ------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "9c9c9c9c-0000-0000-0000-0000000c9001"}'; -- Ada
select throws_ok($$ select public.start_payment('c9000000-0000-0000-0000-0000000000e2', true) $$,
  'P0001', 'wallet_covers_total', 'when the wallet covers the total, start_payment points to the wallet');
select throws_ok($$ select public.pay_from_wallet('c9000000-0000-0000-0000-0000000000e5', false) $$,
  '22023', 'fee_notice_required', 'pay_from_wallet refuses unless the fee notice was seen');
select lives_ok($$ select public.pay_from_wallet('c9000000-0000-0000-0000-0000000000e5', true) $$,
  'Ada pays a hire from the wallet a stranded payment filled');
select throws_ok($$ select public.pay_from_wallet('c9000000-0000-0000-0000-0000000000e6', true) $$,
  'P0001', 'not_enough_balance', 'a second wallet payment with nothing left is refused');
select throws_ok($$ select public.pay_from_wallet('c9000000-0000-0000-0000-0000000000e5', true) $$,
  'P0001', 'engagement_locked', 'a funded hire cannot be paid again');
reset role;

select is((select status::text from public.engagements where id = 'c9000000-0000-0000-0000-0000000000e5'), 'funded',
  'the wallet-paid hire is funded');
select is(public.wallet_balance('00000000-0000-0000-0000-0000000c9001', 'business_wallet'), 0::bigint,
  'and Ada''s wallet is empty, never negative');
select is((select array[card_amount_kobo, wallet_part_kobo, total_kobo] from public.payments
            where engagement_id = 'c9000000-0000-0000-0000-0000000000e5'),
  array[0, 5250000, 5250000]::bigint[], 'one payment row records it, all from the wallet');
select is((select status from public.payments where engagement_id = 'c9000000-0000-0000-0000-0000000000e5'),
  'succeeded', 'already succeeded');
select is((select array_agg(event_type || ':' || account || ':' || amount_kobo order by account) from public.ledger_entries
            where engagement_id = 'c9000000-0000-0000-0000-0000000000e5'),
  '{hire_funded:business_wallet:5250000,hire_funded:escrow:-5000000,hire_funded:platform_revenue:-250000}'::text[],
  'as one hire_funded group from the wallet');
select is((select status::text from public.engagements where id = 'c9000000-0000-0000-0000-0000000000e6'),
  'awaiting_payment', 'the refused hire still waits for payment');

-- A wrong amount -------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "9c9c9c9c-0000-0000-0000-0000000c9001"}'; -- Ada
select is(public.start_payment('c9000000-0000-0000-0000-0000000000e2', true) ->> 'card_amount_kobo', '5250000',
  'Ada starts paying for e2 by card');
reset role;

select is(public.record_card_payment(
    (select reference from public.payments where engagement_id = 'c9000000-0000-0000-0000-0000000000e2'),
    5000000, 90000, 'evt-e2-short', '{"amount": 5000000}'),
  'mismatch', 'a different amount is a mismatch');
select is((select status::text from public.engagements where id = 'c9000000-0000-0000-0000-0000000000e2'),
  'awaiting_payment', 'the hire still waits for payment');
select is((select status || ':' || coalesce(paystack_fee_kobo::text, 'null') from public.payments
            where engagement_id = 'c9000000-0000-0000-0000-0000000000e2'),
  'initiated:null', 'the payment is untouched');
select is((select count(*)::integer from public.ledger_entries where engagement_id = 'c9000000-0000-0000-0000-0000000000e2'), 0,
  'nothing is written to the ledger');
select is((select payload from public.payment_events where event_key = 'evt-e2-short'), '{"amount": 5000000}'::jsonb,
  'the event is kept for audit');

-- A payment in flight holds the lapse and the cancel --------------------------------------------------
update public.engagements set pay_by = now() - interval '1 minute' where id = 'c9000000-0000-0000-0000-0000000000e2';
update public.payments set created_at = now() - interval '5 minutes'
 where engagement_id = 'c9000000-0000-0000-0000-0000000000e2';
set local role service_role;
select is(public.expire_unpaid_engagements('c9000000-0000-0000-0000-000000000001'), 0,
  'a lapse run while a payment started 5 minutes ago cancels nothing');
reset role;
select is((select status::text from public.engagements where id = 'c9000000-0000-0000-0000-0000000000e2'),
  'awaiting_payment', 'the hire still waits');
set local role authenticated;
set local request.jwt.claims = '{"sub": "9c9c9c9c-0000-0000-0000-0000000c9001"}'; -- Ada
select throws_ok($$ select public.cancel_engagement('c9000000-0000-0000-0000-0000000000e2') $$,
  'P0001', 'payment_in_progress', 'cancel_engagement is refused while the payment is in flight');
select throws_ok($$ select public.start_payment('c9000000-0000-0000-0000-0000000000e2', true) $$,
  'P0001', 'engagement_locked', 'a new payment cannot start past the deadline');
reset role;

-- The payment started 25 minutes ago (inside the hold) and succeeds 1 minute past pay_by: it funds.
update public.payments set created_at = now() - interval '25 minutes'
 where engagement_id = 'c9000000-0000-0000-0000-0000000000e2';
select is(public.record_card_payment(
    (select reference from public.payments where engagement_id = 'c9000000-0000-0000-0000-0000000000e2'),
    5250000, 95406, 'evt-e2-ok', '{}'),
  'funded', 'a payment held inside the 30 minutes funds even just past pay_by');

-- A payment after the lapse is stranded -------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "9c9c9c9c-0000-0000-0000-0000000c9001"}'; -- Ada
select is(public.start_payment('c9000000-0000-0000-0000-0000000000e3', true) ->> 'card_amount_kobo', '5250000',
  'Ada starts paying for e3');
reset role;
update public.engagements set pay_by = now() - interval '1 hour' where id = 'c9000000-0000-0000-0000-0000000000e3';
update public.payments set created_at = now() - interval '40 minutes'
 where engagement_id = 'c9000000-0000-0000-0000-0000000000e3';
set local role service_role;
-- Scoped to this file's campaign: other unpaid hires in the local database may be past their 48 hours too.
select is(public.expire_unpaid_engagements('c9000000-0000-0000-0000-000000000001'), 1,
  'a payment started 40 minutes ago no longer holds the lapse');
reset role;
select is((select status::text || ':' || cancel_reason from public.engagements where id = 'c9000000-0000-0000-0000-0000000000e3'),
  'cancelled:payment_expired', 'the hire lapsed');
select is(public.record_card_payment(
    (select reference from public.payments where engagement_id = 'c9000000-0000-0000-0000-0000000000e3'),
    5250000, 95406, 'evt-e3-late', '{}'),
  'stranded', 'a payment after the lapse is stranded');
select is(public.wallet_balance('00000000-0000-0000-0000-0000000c9001', 'business_wallet'), 5250000::bigint,
  'Ada''s wallet holds the card amount');
select is((select status::text from public.engagements where id = 'c9000000-0000-0000-0000-0000000000e3'), 'cancelled',
  'and the hire stays cancelled');
select is((select count(*)::integer from public.ledger_entries
            where engagement_id = 'c9000000-0000-0000-0000-0000000000e3' and account = 'escrow'), 0,
  'nothing goes to escrow');
select is((select sum(value::bigint) from jsonb_each_text(public.ledger_totals())), 0::numeric,
  'ledger totals sum to zero after a stranded payment');

-- Card and wallet together (Bola) ------------------------------------------------------------------
select lives_ok($$ select public.post_ledger_group('correction', null, 'test credit', null, null, null, null, null,
  '[{"account": "paystack", "amount": 1000000},
    {"account": "business_wallet", "owner": "00000000-0000-0000-0000-0000000c9002", "amount": -1000000}]') $$,
  'Bola''s wallet holds ₦10,000');
set local role authenticated;
set local request.jwt.claims = '{"sub": "9c9c9c9c-0000-0000-0000-0000000c9002"}'; -- Bola
select is(public.start_payment('c9000000-0000-0000-0000-0000000000f1', true) ->> 'card_amount_kobo', '4250000',
  'the wallet pays ₦10,000 and the card the other ₦42,500');
reset role;
select is((select array[card_amount_kobo, wallet_part_kobo] from public.payments
            where engagement_id = 'c9000000-0000-0000-0000-0000000000f1'),
  array[4250000, 1000000]::bigint[], 'the payment freezes both parts');
select is(public.record_card_payment(
    (select reference from public.payments where engagement_id = 'c9000000-0000-0000-0000-0000000000f1'),
    4250000, 73906, 'evt-f1', '{}'),
  'funded', 'the card part succeeds and funds the hire');
select is(public.wallet_balance('00000000-0000-0000-0000-0000000c9002', 'business_wallet'), 0::bigint,
  'the wallet part was spent');
select is((select array_agg(account || ':' || amount_kobo order by account) from public.ledger_entries
            where engagement_id = 'c9000000-0000-0000-0000-0000000000f1' and event_type = 'payment_received'),
  '{business_wallet:1000000,escrow:-5000000,paystack:4250000,platform_revenue:-250000}'::text[],
  'one group takes the card and the wallet into escrow and revenue');

-- The wallet is spent between starting and finishing: the payment is stranded, never overdrawn.
select lives_ok($$ select public.post_ledger_group('correction', null, 'test credit', null, null, null, null, null,
  '[{"account": "paystack", "amount": 1000000},
    {"account": "business_wallet", "owner": "00000000-0000-0000-0000-0000000c9002", "amount": -1000000}]') $$,
  'Bola''s wallet holds ₦10,000 again');
set local role authenticated;
set local request.jwt.claims = '{"sub": "9c9c9c9c-0000-0000-0000-0000000c9002"}'; -- Bola
select is(public.start_payment('c9000000-0000-0000-0000-0000000000f3', true) ->> 'card_amount_kobo', '4250000',
  'Bola starts paying f3 with ₦10,000 from the wallet');
reset role;
select lives_ok($$ select public.post_ledger_group('correction', null, 'test debit', null, null, null, null, null,
  '[{"account": "paystack", "amount": -1000000},
    {"account": "business_wallet", "owner": "00000000-0000-0000-0000-0000000c9002", "amount": 1000000}]') $$,
  'the wallet is emptied before the card succeeds');
select is(public.record_card_payment(
    (select reference from public.payments where engagement_id = 'c9000000-0000-0000-0000-0000000000f3'),
    4250000, 73906, 'evt-f3', '{}'),
  'stranded', 'the card part alone cannot fund the hire, so it is stranded');
select is(public.wallet_balance('00000000-0000-0000-0000-0000000c9002', 'business_wallet'), 4250000::bigint,
  'the card amount waits in the wallet, which never went negative');
select is((select status::text from public.engagements where id = 'c9000000-0000-0000-0000-0000000000f3'),
  'awaiting_payment', 'the hire still waits for payment');

-- A fee_config change between start and success does not change the snapshot -------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "9c9c9c9c-0000-0000-0000-0000000c9002"}'; -- Bola
select is(public.start_payment('c9000000-0000-0000-0000-0000000000f2', true) ->> 'card_amount_kobo', '1000000',
  'Bola starts paying f2: ₦42,500 from the wallet, ₦10,000 by card');
reset role;
insert into public.fee_config (business_fee_bps, creator_fee_bps, min_fee_kobo, min_payout_kobo,
                               transfer_fee_tiers, transfer_stamp_duty_kobo, transfer_stamp_duty_from_kobo,
                               paystack_rate, created_at)
select 900, 900, 90000, min_payout_kobo, transfer_fee_tiers,
       transfer_stamp_duty_kobo, transfer_stamp_duty_from_kobo, paystack_rate, now() + interval '1 day'
  from public.current_fee_config();
select is(public.record_card_payment(
    (select reference from public.payments where engagement_id = 'c9000000-0000-0000-0000-0000000000f2'),
    1000000, 25000, 'evt-f2', '{}'),
  'funded', 'the payment succeeds after the fee_config changed');
select is((select array[business_fee_kobo, creator_fee_bps, creator_min_fee_kobo] from public.engagements
            where id = 'c9000000-0000-0000-0000-0000000000f2'),
  array[250000, 500, 50000]::bigint[], 'the snapshot comes from the payment''s frozen config');
select isnt((select fee_config_id from public.engagements where id = 'c9000000-0000-0000-0000-0000000000f2'),
  (public.current_fee_config()).id, 'not the current one');

-- Totals and replica mode -------------------------------------------------------------------------
select is((select count(*)::integer from (
  select group_id from public.ledger_entries group by group_id having sum(amount_kobo) <> 0) g), 0,
  'every group sums to zero');
select is((select sum(value::bigint) from jsonb_each_text(public.ledger_totals())), 0::numeric,
  'ledger totals sum to zero at the end');

set local session_replication_role = replica;
select throws_ok($$ update public.ledger_entries set amount_kobo = amount_kobo * 2 $$, 'P0001', 'ledger_append_only',
  'in replica mode ledger rows still cannot be updated');
select throws_ok($$ delete from public.ledger_entries $$, 'P0001', 'ledger_append_only',
  'in replica mode ledger rows still cannot be deleted');
select throws_ok($$ update public.fee_config set business_fee_bps = 1 $$, 'P0001', 'fee_config_append_only',
  'in replica mode fee_config rows still cannot be changed');
set local session_replication_role = origin;

select * from finish();
rollback;
