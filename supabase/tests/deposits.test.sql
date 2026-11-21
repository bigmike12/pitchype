-- Proves the rules from the deposits migration: a bank-transfer deposit is
-- credited to the business wallet once, net of Cray's charge; it funds a
-- waiting hire only when the business started a transfer payment for it and
-- the wallet covers the total; shortfalls, extras, lapsed hires and deposits
-- with no hire behind them are each told apart; the same deposit twice writes
-- once; and the account functions are service-role only.
-- Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(65);

-- Ada and Bola are businesses, Cora a creator who can't see accounts, Zed an admin.
-- Creators d5011..d5018 are hired.
insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000d5001', 'd5d5d5d5-0000-0000-0000-0000000d5001', 'ada.deposit@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000d5002', 'd5d5d5d5-0000-0000-0000-0000000d5002', 'bola.deposit@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000d5003', 'd5d5d5d5-0000-0000-0000-0000000d5003', 'zed.deposit@example.com', 'admin'),
  ('00000000-0000-0000-0000-0000000d5011', 'd5d5d5d5-0000-0000-0000-0000000d5011', 'c1.deposit@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000d5012', 'd5d5d5d5-0000-0000-0000-0000000d5012', 'c2.deposit@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000d5013', 'd5d5d5d5-0000-0000-0000-0000000d5013', 'c3.deposit@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000d5014', 'd5d5d5d5-0000-0000-0000-0000000d5014', 'c4.deposit@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000d5015', 'd5d5d5d5-0000-0000-0000-0000000d5015', 'c5.deposit@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000d5016', 'd5d5d5d5-0000-0000-0000-0000000d5016', 'c6.deposit@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000d5017', 'd5d5d5d5-0000-0000-0000-0000000d5017', 'c7.deposit@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000d5018', 'd5d5d5d5-0000-0000-0000-0000000d5018', 'c8.deposit@example.com', 'influencer');

insert into public.business_profiles (user_id, business_name, contact_name, state, city) values
  ('00000000-0000-0000-0000-0000000d5001', 'Ada Deposit Kitchen', 'Ada Obi', 'Lagos', 'Ikeja'),
  ('00000000-0000-0000-0000-0000000d5002', 'Bola Deposit Shop', 'Bola A', 'Oyo', 'Ibadan');

insert into public.campaigns (id, business_id, status, title, brief, price_kobo, places,
                              applications_close_on, deliver_by, published_at, submitted_at) values
  ('d5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000d5001', 'open', 'Deposit test A',
   'A brief that is long enough for the checks.', 5000000, 8, public.lagos_today() + 10, public.lagos_today() + 20, now(), now()),
  ('d5000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000d5002', 'open', 'Deposit test B',
   'A brief that is long enough for the checks.', 5000000, 8, public.lagos_today() + 10, public.lagos_today() + 20, now(), now());

-- Ada: e1..e6 (creators 1..6). Bola: f1, f2 (creators 7, 8).
insert into public.applications (id, campaign_id, creator_id, status) values
  ('d5000000-0000-0000-0000-0000000000a1', 'd5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000d5011', 'approved'),
  ('d5000000-0000-0000-0000-0000000000a2', 'd5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000d5012', 'approved'),
  ('d5000000-0000-0000-0000-0000000000a3', 'd5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000d5013', 'approved'),
  ('d5000000-0000-0000-0000-0000000000a4', 'd5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000d5014', 'approved'),
  ('d5000000-0000-0000-0000-0000000000a5', 'd5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000d5015', 'approved'),
  ('d5000000-0000-0000-0000-0000000000a6', 'd5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000d5016', 'approved'),
  ('d5000000-0000-0000-0000-0000000000b1', 'd5000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000d5017', 'approved'),
  ('d5000000-0000-0000-0000-0000000000b2', 'd5000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000d5018', 'approved');

insert into public.engagements (id, application_id, campaign_id, business_id, creator_id, agreed_price_kobo, pay_by)
select ('d5000000-0000-0000-0000-0000000000' || x.tag)::uuid,
       ('d5000000-0000-0000-0000-0000000000' || x.app)::uuid,
       x.campaign::uuid, x.business::uuid, x.creator::uuid, 5000000, now() + interval '48 hours'
  from (values
    ('e1', 'a1', 'd5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000d5001', '00000000-0000-0000-0000-0000000d5011'),
    ('e2', 'a2', 'd5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000d5001', '00000000-0000-0000-0000-0000000d5012'),
    ('e3', 'a3', 'd5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000d5001', '00000000-0000-0000-0000-0000000d5013'),
    ('e4', 'a4', 'd5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000d5001', '00000000-0000-0000-0000-0000000d5014'),
    ('e5', 'a5', 'd5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000d5001', '00000000-0000-0000-0000-0000000d5015'),
    ('f1', 'b1', 'd5000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000d5002', '00000000-0000-0000-0000-0000000d5017'),
    ('f2', 'b2', 'd5000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000d5002', '00000000-0000-0000-0000-0000000d5018')
  ) x (tag, app, campaign, business, creator);

-- The transfer accounts ---------------------------------------------------------------------------------------------
set local role service_role;
select is(public.deposit_account_reference('00000000-0000-0000-0000-0000000d5001', 'cray'), public.deposit_account_reference('00000000-0000-0000-0000-0000000d5001', 'cray'),
  'asking twice gives the same account reference');
select throws_ok($$ select public.deposit_account_reference('00000000-0000-0000-0000-0000000d5011', 'cray') $$,
  'P0001', 'not_a_business', 'a creator has no transfer account');
select lives_ok($$ select public.deposit_account_reference('00000000-0000-0000-0000-0000000d5002', 'cray') $$,
  'Bola gets one too');
reset role;
select ok((select reference ~ '^pit_va_[0-9a-f]{32}$' from public.deposit_accounts
            where user_id = '00000000-0000-0000-0000-0000000d5001'), 'the reference looks like pit_va_<32 hex>');

set local role service_role;
select throws_ok($$ select public.complete_deposit_account('pit_va_nope', 'v1', '9012345678', 'Bloc', 'Name') $$,
  'P0001', 'no_such_deposit_account', 'an unknown reference cannot be completed');
select lives_ok($$ select public.complete_deposit_account(
    (select reference from public.deposit_accounts where user_id = '00000000-0000-0000-0000-0000000d5001'),
    'va_ada', '9012345678', 'Bloc Bank', 'Pitchype - Ada') $$,
  'the account is completed');
select lives_ok($$ select public.complete_deposit_account(
    (select reference from public.deposit_accounts where user_id = '00000000-0000-0000-0000-0000000d5001'),
    'va_ada', '9012345678', 'Bloc Bank', 'Pitchype - Ada') $$,
  'the same values again are a no-op');
select throws_ok($$ select public.complete_deposit_account(
    (select reference from public.deposit_accounts where user_id = '00000000-0000-0000-0000-0000000d5001'),
    'va_other', '9012345679', 'Bloc Bank', 'Pitchype - Ada') $$,
  'P0001', 'deposit_account_conflict', 'other values for a completed account are refused');
select lives_ok($$ select public.complete_deposit_account(
    (select reference from public.deposit_accounts where user_id = '00000000-0000-0000-0000-0000000d5002'),
    'va_bola', '9012345680', 'Bloc Bank', 'Pitchype - Bola') $$,
  'Bola''s account is completed');
reset role;
select throws_ok($$ update public.deposit_accounts set account_number = '9012345678'
    where user_id = '00000000-0000-0000-0000-0000000d5002' $$,
  '23505', null, 'two businesses can never share a receiving account number');

-- Access ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "d5d5d5d5-0000-0000-0000-0000000d5001"}'; -- Ada
select is((select count(*)::integer from public.deposit_accounts), 1, 'a business sees only its own account');
select throws_ok($$ select public.record_deposit('cray', 'x', '9012345678', 'd', 100, 0, 'k', '{}') $$,
  '42501', null, 'authenticated cannot call record_deposit');
select throws_ok($$ select public.deposit_account_reference('00000000-0000-0000-0000-0000000d5001', 'cray') $$,
  '42501', null, 'nor deposit_account_reference');
select throws_ok($$ select public.complete_deposit_account('x', 'a', '9012345678', 'b', 'c') $$,
  '42501', null, 'nor complete_deposit_account');
set local request.jwt.claims = '{"sub": "d5d5d5d5-0000-0000-0000-0000000d5011"}'; -- a creator
select is((select count(*)::integer from public.deposit_accounts), 0, 'a creator sees no accounts');
set local request.jwt.claims = '{"sub": "d5d5d5d5-0000-0000-0000-0000000d5003"}'; -- Zed
select cmp_ok((select count(*)::integer from public.deposit_accounts), '>=', 2, 'an admin sees them all');
reset role;
set local role anon;
select throws_ok($$ select public.record_deposit('cray', 'x', '9012345678', 'd', 100, 0, 'k', '{}') $$,
  '42501', null, 'anon cannot call record_deposit');
reset role;

-- An exact deposit funds the hire --------------------------------------------------------------------------------------
-- e1: ₦50,000 + ₦2,500 fee = ₦52,500; the business sends ₦52,700 and Cray's charge is ₦200.
set local role authenticated;
set local request.jwt.claims = '{"sub": "d5d5d5d5-0000-0000-0000-0000000d5001"}'; -- Ada
select is(public.start_payment('d5000000-0000-0000-0000-0000000000e1', true, 'transfer') ->> 'method', 'transfer',
  'Ada starts a transfer payment for e1');
reset role;
select ok((select fee_notice_seen_at is not null from public.payments
            where engagement_id = 'd5000000-0000-0000-0000-0000000000e1' and method = 'transfer'),
  'the fee notice time is stored on the transfer payment');

set local role service_role;
select is(public.record_deposit('cray',
    (select reference from public.deposit_accounts where user_id = '00000000-0000-0000-0000-0000000d5001'),
    '9012345678', 'dep-1', 5270000, 20000, 'cray.deposit:dep-1', '{"gross": 5270000}') ->> 'outcome',
  'funded', 'an exact deposit funds the hire');
reset role;
select is((select status::text from public.engagements where id = 'd5000000-0000-0000-0000-0000000000e1'), 'funded',
  'the hire is funded');
select is(public.wallet_balance('00000000-0000-0000-0000-0000000d5001', 'business_wallet'), 0::bigint,
  'the wallet is back to zero');
select is((select sum(amount_kobo) from public.ledger_entries
            where engagement_id = 'd5000000-0000-0000-0000-0000000000e1' and account = 'escrow'), -5000000::numeric,
  'escrow holds the price');
select is((select sum(amount_kobo) from public.ledger_entries
            where engagement_id = 'd5000000-0000-0000-0000-0000000000e1' and account = 'platform_revenue'), -250000::numeric,
  'we keep the whole fee');
select is((select sum(amount_kobo) from public.ledger_entries where account = 'cray'
             and paystack_reference = 'dep-1'), 5250000::numeric,
  'cray cash is what arrived net of Cray''s charge');
select is((select count(*)::integer from public.ledger_entries
            where engagement_id = 'd5000000-0000-0000-0000-0000000000e1' and account in ('cray_fees', 'paystack', 'paystack_fees')), 0,
  'no processor charge landed in our accounts');
select is((select status || ':' || paystack_fee_kobo from public.payments
            where engagement_id = 'd5000000-0000-0000-0000-0000000000e1'), 'succeeded:0',
  'the transfer payment is succeeded with a charge of 0 on our side');
select is((select data ->> 'outcome' || ':' || (data ->> 'amount_sent_kobo') || ':' || (data ->> 'charge_kobo') || ':' || (data ->> 'credited_kobo')
             from public.notifications where user_id = '00000000-0000-0000-0000-0000000d5001' and kind = 'deposit_received'
              and data ->> 'engagement_id' = 'd5000000-0000-0000-0000-0000000000e1'),
  'funded:5270000:20000:5250000', 'the business is told: sent, charge and credited');

-- The same event twice ---------------------------------------------------------------------------------------------------
set local role service_role;
select is(public.record_deposit('cray',
    (select reference from public.deposit_accounts where user_id = '00000000-0000-0000-0000-0000000d5001'),
    '9012345678', 'dep-1', 5270000, 20000, 'cray.deposit:dep-1', '{}') ->> 'outcome',
  'duplicate', 'the same event again is a duplicate');
reset role;
select is((select count(*)::integer from public.ledger_entries where paystack_reference = 'dep-1' and account = 'cray'), 1,
  'and wrote nothing');
select is((select count(*)::integer from public.notifications where user_id = '00000000-0000-0000-0000-0000000d5001'
            and kind = 'deposit_received'), 1, 'and told nobody again');

-- Extra money stays in the wallet ------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "d5d5d5d5-0000-0000-0000-0000000d5001"}';
select public.start_payment('d5000000-0000-0000-0000-0000000000e2', true, 'transfer');
reset role;
set local role service_role;
select is(public.record_deposit('cray',
    (select reference from public.deposit_accounts where user_id = '00000000-0000-0000-0000-0000000d5001'),
    '9012345678', 'dep-2', 6000000, 20000, 'cray.deposit:dep-2', '{}') ->> 'outcome',
  'funded_with_extra', '₦60,000 sent for a ₦52,500 hire is funded with extra');
reset role;
select is(public.wallet_balance('00000000-0000-0000-0000-0000000d5001', 'business_wallet'), 730000::bigint,
  'the extra ₦7,300 is in the wallet');

-- Too little: short, then topped up ---------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "d5d5d5d5-0000-0000-0000-0000000d5001"}';
select public.start_payment('d5000000-0000-0000-0000-0000000000e3', true, 'transfer');
reset role;
set local role service_role;
select is(public.record_deposit('cray',
    (select reference from public.deposit_accounts where user_id = '00000000-0000-0000-0000-0000000d5001'),
    '9012345678', 'dep-3', 4000000, 20000, 'cray.deposit:dep-3', '{}'),
  jsonb_build_object('outcome', 'short', 'business_user_id', '00000000-0000-0000-0000-0000000d5001',
                     'engagement_id', 'd5000000-0000-0000-0000-0000000000e3', 'credited_kobo', 3980000,
                     'still_needed_kobo', 540000, 'wallet_after_kobo', 4710000),
  'a short deposit says how much is still needed');
reset role;
select is((select status::text from public.engagements where id = 'd5000000-0000-0000-0000-0000000000e3'), 'awaiting_payment',
  'the hire still waits');
select is(public.wallet_balance('00000000-0000-0000-0000-0000000d5001', 'business_wallet'), 4710000::bigint,
  'and the money is in the wallet, to be used first');
select is((select data ->> 'still_needed_kobo' from public.notifications
            where user_id = '00000000-0000-0000-0000-0000000d5001' and kind = 'deposit_received'
              and data ->> 'outcome' = 'short'), '540000', 'the notice carries what is still to pay');
set local role service_role;
select is(public.record_deposit('cray',
    (select reference from public.deposit_accounts where user_id = '00000000-0000-0000-0000-0000000d5001'),
    '9012345678', 'dep-4', 560000, 20000, 'cray.deposit:dep-4', '{}') ->> 'outcome',
  'funded', 'a second deposit tops it up and funds the hire');
reset role;
select is((select status::text from public.engagements where id = 'd5000000-0000-0000-0000-0000000000e3'), 'funded',
  'the hire is funded');
select is(public.wallet_balance('00000000-0000-0000-0000-0000000d5001', 'business_wallet'), 0::bigint,
  'with nothing left over');

-- No transfer payment behind it: credited (also when only a card payment was started) ------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "d5d5d5d5-0000-0000-0000-0000000d5001"}';
select public.start_payment('d5000000-0000-0000-0000-0000000000e4', true);
reset role;
set local role service_role;
select is(public.record_deposit('cray',
    (select reference from public.deposit_accounts where user_id = '00000000-0000-0000-0000-0000000d5001'),
    '9012345678', 'dep-5', 5270000, 20000, 'cray.deposit:dep-5', '{}') ->> 'outcome',
  'credited', 'a deposit is only credited when the hire has a card payment, not a transfer payment');
reset role;
select is((select status::text from public.engagements where id = 'd5000000-0000-0000-0000-0000000000e4'), 'awaiting_payment',
  'the hire was not funded behind the business''s back');
select is(public.wallet_balance('00000000-0000-0000-0000-0000000d5001', 'business_wallet'), 5250000::bigint,
  'the money is in the wallet');
select is((select data ->> 'engagement_id' from public.notifications
            where user_id = '00000000-0000-0000-0000-0000000d5001' and kind = 'deposit_received'
              and data ->> 'outcome' = 'credited'), 'd5000000-0000-0000-0000-0000000000e4',
  'the notice names the hire that is waiting so it can be paid from the wallet');

-- The hire ended first --------------------------------------------------------------------------------------------------
-- Ada's wallet holds ₦52,500, so e5's transfer payment is set up directly, then the hire lapses.
insert into public.payments (engagement_id, reference, total_kobo, business_fee_kobo, fee_config_id,
                             card_amount_kobo, wallet_part_kobo, fee_notice_seen_at, provider, method, created_at)
values ('d5000000-0000-0000-0000-0000000000e5', 'pit_' || replace(gen_random_uuid()::text, '-', ''), 5250000, 250000,
        (public.current_fee_config()).id, 5250000, 0, now() - interval '3 hours', 'cray', 'transfer', now() - interval '3 hours');
update public.engagements set pay_by = now() - interval '1 hour' where id = 'd5000000-0000-0000-0000-0000000000e5';
set local role service_role;
select is(public.record_deposit('cray',
    (select reference from public.deposit_accounts where user_id = '00000000-0000-0000-0000-0000000d5001'),
    '9012345678', 'dep-6', 5270000, 20000, 'cray.deposit:dep-6', '{}') ->> 'outcome',
  'hire_ended', 'a deposit after the hire lapsed says so');
reset role;
select is((select status || ':' || (select status::text from public.engagements where id = 'd5000000-0000-0000-0000-0000000000e5')
             from public.payments where engagement_id = 'd5000000-0000-0000-0000-0000000000e5'),
  'failed:awaiting_payment', 'the transfer payment is closed and the lapsed hire is not funded');
select is(public.wallet_balance('00000000-0000-0000-0000-0000000d5001', 'business_wallet'), 10500000::bigint,
  'the money is safe in the wallet');

-- Two waiting hires, the wallet covers only the older ------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "d5d5d5d5-0000-0000-0000-0000000d5002"}'; -- Bola
select public.start_payment('d5000000-0000-0000-0000-0000000000f1', true, 'transfer');
select public.start_payment('d5000000-0000-0000-0000-0000000000f2', true, 'transfer');
reset role;
update public.payments set created_at = now() - interval '10 minutes'
 where engagement_id = 'd5000000-0000-0000-0000-0000000000f1';
set local role service_role;
select is(public.record_deposit('cray',
    (select reference from public.deposit_accounts where user_id = '00000000-0000-0000-0000-0000000d5002'),
    '9012345680', 'dep-7', 5270000, 20000, 'cray.deposit:dep-7', '{}') ->> 'outcome',
  'short', 'with two waiting hires and money for one, the second is short');
reset role;
select is((select string_agg(status::text, ',' order by id) from public.engagements
            where id in ('d5000000-0000-0000-0000-0000000000f1', 'd5000000-0000-0000-0000-0000000000f2')),
  'funded,awaiting_payment', 'the older is funded and the newer waits');

-- Unknown accounts and bad figures -----------------------------------------------------------------------------------------
set local role service_role;
select is(public.record_deposit('cray',
    (select reference from public.deposit_accounts where user_id = '00000000-0000-0000-0000-0000000d5001'),
    '9012345999', 'dep-8', 100000, 0, 'cray.deposit:dep-8', '{}') ->> 'outcome',
  'unknown_account', 'the right reference with the wrong account number is unknown');
select is(public.record_deposit('cray', 'pit_va_00000000000000000000000000000000', '9012345678', 'dep-9', 100000, 0,
    'cray.deposit:dep-9', '{}') ->> 'outcome',
  'unknown_account', 'an unknown reference is unknown');
reset role;
select is((select count(*)::integer from public.payment_events where event_key in ('cray.deposit:dep-8', 'cray.deposit:dep-9')), 0,
  'an unknown account leaves no event key, so a retry after the fix is not swallowed');
select is((select count(*)::integer from public.ledger_entries where paystack_reference in ('dep-8', 'dep-9')), 0,
  'and writes nothing to the ledger');
set local role service_role;
select throws_ok($$ select public.record_deposit('cray',
    (select reference from public.deposit_accounts where user_id = '00000000-0000-0000-0000-0000000d5001'),
    '9012345678', 'dep-10', 100000, 100001, 'cray.deposit:dep-10', '{}') $$,
  '22023', 'invalid_deposit', 'a charge larger than the amount is refused');
select throws_ok($$ select public.record_deposit('cray',
    (select reference from public.deposit_accounts where user_id = '00000000-0000-0000-0000-0000000d5001'),
    '9012345678', 'dep-11', 100000, 100000, 'cray.deposit:dep-11', '{}') $$,
  '22023', 'invalid_deposit', 'a charge equal to the amount is refused too');
select throws_ok($$ select public.record_deposit('cray',
    (select reference from public.deposit_accounts where user_id = '00000000-0000-0000-0000-0000000d5001'),
    '9012345678', 'dep-12', 0, 0, 'cray.deposit:dep-12', '{}') $$,
  '22023', 'invalid_deposit', 'a deposit of nothing is refused');
select throws_ok($$ select public.record_deposit('paystack',
    (select reference from public.deposit_accounts where user_id = '00000000-0000-0000-0000-0000000d5001'),
    '9012345678', 'dep-13', 100000, 0, 'cray.deposit:dep-13', '{}') $$,
  '22023', 'invalid_deposit', 'only Cray deposits are recorded');
reset role;

-- A creator-fault refund on a deposit-funded hire is break-even for us ---------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "d5d5d5d5-0000-0000-0000-0000000d5011"}'; -- e1's creator
select public.start_engagement('d5000000-0000-0000-0000-0000000000e1');
select public.withdraw_from_engagement('d5000000-0000-0000-0000-0000000000e1');
reset role;
select is((select sum(amount_kobo) from public.ledger_entries
            where engagement_id = 'd5000000-0000-0000-0000-0000000000e1' and account = 'escrow'), 0::numeric,
  'escrow is empty after the creator withdraws');
select is(public.wallet_balance('00000000-0000-0000-0000-0000000d5001', 'business_wallet'), 10500000::bigint + 5250000,
  'the business gets the price and the whole fee back');
select is((select coalesce(sum(amount_kobo), 0) from public.ledger_entries
            where engagement_id = 'd5000000-0000-0000-0000-0000000000e1' and account in ('platform_revenue', 'cray_fees')), 0::numeric,
  'nothing is left over for us: break-even');

-- The ledger --------------------------------------------------------------------------------------------------------------------
select is((select count(*)::integer from (
  select group_id from public.ledger_entries group by group_id having sum(amount_kobo) <> 0) x), 0,
  'every group balances');
select is((select sum(value::bigint) from jsonb_each_text(public.ledger_totals())), 0::numeric,
  'ledger totals sum to zero');
select is((select count(*)::integer from (
  select owner_user_id from public.ledger_entries
   where account = 'business_wallet' and owner_user_id in ('00000000-0000-0000-0000-0000000d5001', '00000000-0000-0000-0000-0000000d5002')
   group by owner_user_id having sum(amount_kobo) > 0) w), 0, 'no wallet is overdrawn');
select is((select count(*)::integer from public.notifications where kind = 'deposit_received'
            and user_id in ('00000000-0000-0000-0000-0000000d5001', '00000000-0000-0000-0000-0000000d5002')), 7,
  'one notice per recorded deposit (duplicates and unknown accounts tell nobody)');
select is((select array_agg(distinct data ->> 'outcome' order by data ->> 'outcome') from public.notifications
            where kind = 'deposit_received'
              and user_id in ('00000000-0000-0000-0000-0000000d5001', '00000000-0000-0000-0000-0000000d5002')),
  '{credited,funded,funded_with_extra,hire_ended,short}'::text[], 'every outcome has been told');

select * from finish();
rollback;
