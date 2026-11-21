-- Proves the rules from the provider_payouts migration: a creator holds one
-- bank account per provider; a payout snapshots the active provider's account
-- and cost and is sent only through it; Cray's id is set once; the two
-- "nothing settles" flags and the admin's attach work; finish_payout posts
-- cash to the payout's own provider, books any fee difference to cray_fees,
-- re-credits only a failure, and reverses a paid Cray payout once; the
-- 4-argument call and Paystack behave as before.
-- Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(78);

-- Efe is an admin, Chidi a creator with both accounts, Kemi a creator with only a Paystack account,
-- Ada a business (for a grant check).
insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000d6001', 'd6d6d6d6-0000-0000-0000-0000000d6001', 'ada.ppayout@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000d6002', 'd6d6d6d6-0000-0000-0000-0000000d6002', 'efe.ppayout@example.com', 'admin'),
  ('00000000-0000-0000-0000-0000000d6101', 'd6d6d6d6-0000-0000-0000-0000000d6101', 'chidi.ppayout@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000d6102', 'd6d6d6d6-0000-0000-0000-0000000d6102', 'kemi.ppayout@example.com', 'influencer');

-- Credits wallets the way a test can: a correction group from Cray cash.
select public.post_ledger_group('correction', null, 'test credit', null, null, null, null, null,
  '[{"account": "cray", "amount": 30000000},
    {"account": "creator_wallet", "owner": "00000000-0000-0000-0000-0000000d6101", "amount": -20000000},
    {"account": "creator_wallet", "owner": "00000000-0000-0000-0000-0000000d6102", "amount": -10000000}]'::jsonb);

-- Bank accounts per provider ----------------------------------------------------------------------------------
set local role service_role;
select lives_ok($$ select public.save_bank_account_for('00000000-0000-0000-0000-0000000d6101', '058', 'GTBank', '1234',
                                                      'CHIDI OKAFOR', 'RCP_chidi') $$,
  'a Paystack account is saved');
select lives_ok($$ select public.save_cray_bank_account_for('00000000-0000-0000-0000-0000000d6101', '000013', 'GTBank', '1234',
                                                           'CHIDI OKAFOR', 'v1:aXY=:dGFn:Y2lwaGVy') $$,
  'and a Cray account beside it');
select lives_ok($$ select public.save_bank_account_for('00000000-0000-0000-0000-0000000d6102', '058', 'GTBank', '9999',
                                                      'KEMI ADE', 'RCP_kemi') $$,
  'Kemi has only a Paystack account');
select throws_ok($$ select public.save_cray_bank_account_for('00000000-0000-0000-0000-0000000d6101', '000013', 'GTBank', '1234',
                                                            'CHIDI OKAFOR', '0123456789') $$,
  '22023', 'invalid_bank_account', 'a plain account number is refused for Cray');
select throws_ok($$ select public.save_cray_bank_account_for('00000000-0000-0000-0000-0000000d6001', '000013', 'GTBank', '1234',
                                                            'ADA', 'v1:aXY=:dGFn:Y2lwaGVy') $$,
  '42501', null, 'and only creators have one');
reset role;
select is((select count(*)::integer from public.bank_accounts where user_id = '00000000-0000-0000-0000-0000000d6101'), 2,
  'Chidi holds one account per provider');
select throws_ok($$ insert into public.bank_accounts (user_id, provider, bank_code, bank_name, last4, account_name, recipient_code)
  values ('00000000-0000-0000-0000-0000000d6101', 'paystack', '058', 'GTBank', '1234', 'X', 'RCP_again') $$,
  '23505', null, 'but only one per provider');
select throws_ok($$ insert into public.bank_accounts (user_id, provider, bank_code, bank_name, last4, account_name, account_number_encrypted)
  values ('00000000-0000-0000-0000-0000000d6102', 'cray', '058', 'GTBank', '1234', 'X', '0123456789') $$,
  '23514', null, 'a Cray row without v1 ciphertext is refused');
select throws_ok($$ insert into public.bank_accounts (user_id, provider, bank_code, bank_name, last4, account_name, recipient_code, account_number_encrypted)
  values ('00000000-0000-0000-0000-0000000d6102', 'paystack', '058', 'GTBank', '1234', 'X', 'RCP_x', 'v1:a:b:c') $$,
  '23514', null, 'and a Paystack row never carries a number');
select is((select account_number_encrypted from public.bank_accounts
            where user_id = '00000000-0000-0000-0000-0000000d6101' and provider = 'cray'), 'v1:aXY=:dGFn:Y2lwaGVy',
  'the ciphertext is what was given');

-- Requesting under Cray (the default) --------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "d6d6d6d6-0000-0000-0000-0000000d6102"}'; -- Kemi
select throws_ok($$ select public.request_payout(2000000) $$,
  'P0001', 'no_bank_account', 'with only a Paystack account, a Cray-era request is refused');
set local request.jwt.claims = '{"sub": "d6d6d6d6-0000-0000-0000-0000000d6101"}'; -- Chidi
select lives_ok($$ select public.request_payout(2000000) $$, 'Chidi requests ₦20,000');
select lives_ok($$ select public.request_payout(2100000) $$, 'and more');
select lives_ok($$ select public.request_payout(2200000) $$, 'and more');
select lives_ok($$ select public.request_payout(2300000) $$, 'and more');
select lives_ok($$ select public.request_payout(2400000) $$, 'and more');
select lives_ok($$ select public.request_payout(2500000) $$, 'and more');
reset role;
select is((select provider || ':' || transfer_fee_kobo || ':' || bank_code || ':' || (recipient_code is null)::text
              || ':' || account_number_encrypted
             from public.payouts where amount_kobo = 2000000 and user_id = '00000000-0000-0000-0000-0000000d6101'),
  'cray:5000:000013:true:v1:aXY=:dGFn:Y2lwaGVy', 'the request snapshots provider, ₦50 fee, bank code and ciphertext');

-- Approving ----------------------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "d6d6d6d6-0000-0000-0000-0000000d6002"}'; -- Efe
select is(public.approve_payout((select id from public.payouts where amount_kobo = 2000000)) - 'reference',
  '{"provider": "cray", "bank_code": "000013", "bank_name": "GTBank", "last4": "1234", "send_kobo": 1995000,
    "account_name": "CHIDI OKAFOR", "account_number_encrypted": "v1:aXY=:dGFn:Y2lwaGVy"}'::jsonb,
  'approval returns the snapshot, the ciphertext and ₦19,950 to send');
select lives_ok($$ select public.approve_payout((select id from public.payouts where amount_kobo = 2100000)) $$, 'P2 approved');
select lives_ok($$ select public.approve_payout((select id from public.payouts where amount_kobo = 2200000)) $$, 'P3 approved');
select lives_ok($$ select public.approve_payout((select id from public.payouts where amount_kobo = 2300000)) $$, 'P4 approved');
select lives_ok($$ select public.approve_payout((select id from public.payouts where amount_kobo = 2500000)) $$, 'P6 approved');
reset role;

-- Cray's id is set once --------------------------------------------------------------------------------------------------
set local role service_role;
select is(public.record_payout_send((select reference from public.payouts where amount_kobo = 2000000), 'CRAY0001'), 'set',
  'the first send records Cray''s id');
select is(public.record_payout_send((select reference from public.payouts where amount_kobo = 2000000), 'CRAY0001'), 'already_set',
  'the same id again changes nothing');
select is(public.record_payout_send((select reference from public.payouts where amount_kobo = 2000000), 'CRAY9999'), 'conflict',
  'another id is a conflict and is not stored');
select throws_ok($$ select public.record_payout_send((select reference from public.payouts where amount_kobo = 2100000), 'CRAY0001') $$,
  '23505', null, 'Cray''s id belongs to one payout only');
select throws_ok($$ select public.record_payout_send((select id::text from public.payouts where amount_kobo = 2400000), 'CRAY0004') $$,
  'P0001', 'no_such_payout', 'an unknown reference is refused');
reset role;
select is((select provider_reference from public.payouts where amount_kobo = 2000000), 'CRAY0001', 'the stored id is the first');

-- Flags ----------------------------------------------------------------------------------------------------------------------
set local role service_role;
select lives_ok($$ select public.flag_payout((select reference from public.payouts where amount_kobo = 2100000), 'waiting_for_funds') $$,
  'a processing Cray payout can wait for funds');
reset role;
select is((select waiting_for_funds::text || ':' || needs_reference::text || ':' || status from public.payouts where amount_kobo = 2100000),
  'true:false:processing', 'and stays processing');
set local role service_role;
select lives_ok($$ select public.flag_payout((select reference from public.payouts where amount_kobo = 2100000), 'needs_reference') $$,
  'or need a reference');
reset role;
select is((select waiting_for_funds::text || ':' || needs_reference::text from public.payouts where amount_kobo = 2100000),
  'false:true', 'one flag at a time');
set local role service_role;
select throws_ok($$ select public.flag_payout((select reference from public.payouts where amount_kobo = 2100000), 'paid') $$,
  'P0001', 'payout_not_flaggable', 'only the two known flags');
select throws_ok($$ select public.flag_payout('pit_po_nope', 'needs_reference') $$,
  'P0001', 'no_such_payout', 'an unknown payout is refused');
reset role;

-- An admin attaches Cray's id ----------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "d6d6d6d6-0000-0000-0000-0000000d6101"}'; -- Chidi
select throws_ok($$ select public.attach_payout_reference((select id from public.payouts where amount_kobo = 2100000), 'CRAY0002') $$,
  'P0001', 'not_allowed', 'a creator cannot attach a reference');
set local request.jwt.claims = '{"sub": "d6d6d6d6-0000-0000-0000-0000000d6002"}'; -- Efe
select throws_ok($$ select public.attach_payout_reference((select id from public.payouts where amount_kobo = 2000000), 'CRAY0003') $$,
  'P0001', 'payout_not_attachable', 'an id already set cannot be replaced');
select throws_ok($$ select public.attach_payout_reference((select id from public.payouts where amount_kobo = 2400000), 'CRAY0003') $$,
  'P0001', 'payout_not_attachable', 'a payout still waiting for approval cannot take one');
select lives_ok($$ select public.attach_payout_reference((select id from public.payouts where amount_kobo = 2100000), 'CRAY0002') $$,
  'the admin attaches Cray''s id to P2');
reset role;
select is((select provider_reference || ':' || needs_reference::text || ':' || (reference_attached_by is not null)::text
             from public.payouts where amount_kobo = 2100000), 'CRAY0002:false:true',
  'the flag clears and who attached it is recorded');

-- Paid on Cray -------------------------------------------------------------------------------------------------------------------
set local role service_role;
select is(public.finish_payout((select reference from public.payouts where amount_kobo = 2000000), 'paid',
    'cray.payout.paid:CRAY0001', '{"data": {"reference": "CRAY0001"}}', 1995000, 5000), 'paid',
  'sent ₦19,950 plus Cray''s ₦50 charge settles P1 as paid');
reset role;
select is((select array_agg(account || ':' || amount_kobo order by account) from public.ledger_entries
            where payout_id = (select id from public.payouts where amount_kobo = 2000000) and event_type = 'payout_paid'),
  array['cray:-2000000', 'payout_in_flight:2000000'], 'cash leaves cray by the whole amount, in one balanced group');
select is((select sent_kobo || ':' || provider_charge_kobo from public.payouts where amount_kobo = 2000000), '1995000:5000',
  'the payout records what Cray sent and charged');
set local role service_role;
select is(public.finish_payout((select reference from public.payouts where amount_kobo = 2100000), 'paid',
    'cray.payout.paid:CRAY0002', '{}', 2095000, 3000), 'paid', 'a cheaper charge still pays');
reset role;
select is((select array_agg(account || ':' || amount_kobo order by account) from public.ledger_entries
            where payout_id = (select id from public.payouts where amount_kobo = 2100000) and event_type = 'payout_paid'),
  array['cray:-2098000', 'cray_fees:-2000', 'payout_in_flight:2100000'],
  'the ₦20 difference is booked to cray_fees in the same group, not charged to the creator');
set local role service_role;
select throws_ok($$ select public.finish_payout((select reference from public.payouts where amount_kobo = 2200000), 'paid',
    'cray.payout.paid:wrong', '{}', 2000000, 5000) $$,
  'P0001', 'payout_amount_mismatch', 'Cray paying an amount we did not ask for is refused');
select throws_ok($$ select public.finish_payout((select reference from public.payouts where amount_kobo = 2200000), 'paid',
    'cray.payout.paid:none', '{}') $$,
  '22023', 'invalid_amount', 'a Cray payout cannot be marked paid without the amount sent');
reset role;
select is((select count(*)::integer from public.payment_events where event_key in ('cray.payout.paid:wrong', 'cray.payout.paid:none')), 0,
  'and the refused events leave no key behind');
set local role service_role;
select is(public.finish_payout((select reference from public.payouts where amount_kobo = 2000000), 'paid',
    'cray.payout.paid:CRAY0001', '{}', 1995000, 5000), 'duplicate', 'the same event again is a duplicate');

-- Reversed after paid -----------------------------------------------------------------------------------------------------------------
select is(public.finish_payout((select reference from public.payouts where amount_kobo = 2200000), 'paid',
    'cray.payout.paid:CRAY0003', '{}', 2195000, 5000), 'paid', 'P3 is paid');
select is(public.finish_payout((select reference from public.payouts where amount_kobo = 2200000), 'reversed',
    'cray.payout.reversed:CRAY0003', '{"data": {"status": "reversed"}}', 2195000, null), 'reversed',
  'Cray takes it back: reversed');
reset role;
select is((select status || ':' || reversed_kobo from public.payouts where amount_kobo = 2200000), 'reversed:2195000',
  'the payout is reversed with the amount returned');
select is((select array_agg(account || ':' || amount_kobo order by account) from public.ledger_entries
            where payout_id = (select id from public.payouts where amount_kobo = 2200000) and event_type = 'payout_reversed'),
  array['cray:2195000', 'creator_wallet:-2195000'], 'cash comes back to cray and the creator is re-credited');
select is((select data ->> 'credited_kobo' from public.notifications
            where user_id = '00000000-0000-0000-0000-0000000d6101' and kind = 'payout_reversed'), '2195000',
  'the creator is told');
set local role service_role;
select is(public.finish_payout((select reference from public.payouts where amount_kobo = 2200000), 'reversed',
    'cray.payout.reversed:CRAY0003-again', '{}', 2195000, null), 'duplicate',
  'a second reversal is a duplicate and moves nothing');
select is(public.finish_payout((select reference from public.payouts where amount_kobo = 2200000), 'failed',
    'cray.payout.failed:CRAY0003', '{}'), 'ignored', 'a failure after a reversal is ignored');
select is(public.finish_payout((select reference from public.payouts where amount_kobo = 2200000), 'paid',
    'cray.payout.paid:CRAY0003-late', '{}', 2195000, 5000), 'ignored', 'and so is a late paid');
select is(public.finish_payout((select reference from public.payouts where amount_kobo = 2500000), 'reversed',
    'cray.payout.reversed:none', '{}', 2495000, null), 'ignored',
  'reversed for a payout that is only processing is ignored (the caller decides it failed)');
reset role;
select is((select count(*)::integer from public.ledger_entries
            where payout_id = (select id from public.payouts where amount_kobo = 2500000) and event_type <> 'payout_requested'), 0,
  'and moved nothing');

-- Failed on Cray: the wallet gets it back -------------------------------------------------------------------------------------------------
select is(public.wallet_balance('00000000-0000-0000-0000-0000000d6101', 'creator_wallet'), 20000000::bigint - 2000000 - 2100000 - 2200000 - 2300000 - 2400000 - 2500000 + 2195000,
  'the wallet before the failure');
set local role service_role;
select is(public.finish_payout((select reference from public.payouts where amount_kobo = 2300000), 'failed',
    'cray.payout.failed:P4', '{}'), 'failed', 'Cray says P4 failed');
reset role;
select is(public.wallet_balance('00000000-0000-0000-0000-0000000d6101', 'creator_wallet'),
  20000000::bigint - 2000000 - 2100000 - 2200000 - 2300000 - 2400000 - 2500000 + 2195000 + 2300000,
  'the whole amount returns to the wallet');
select is((select status from public.payouts where amount_kobo = 2300000), 'failed', 'and the payout is failed');

-- Paystack behaves as before ---------------------------------------------------------------------------------------------------------------
insert into public.payment_provider_settings (provider, reason) values ('paystack', 'Test: back to Paystack');
set local role authenticated;
set local request.jwt.claims = '{"sub": "d6d6d6d6-0000-0000-0000-0000000d6101"}';
select lives_ok($$ select public.request_payout(2600000) $$, 'Chidi requests under Paystack');
reset role;
select is((select provider || ':' || transfer_fee_kobo || ':' || recipient_code || ':' || (account_number_encrypted is null)::text
             from public.payouts where amount_kobo = 2600000), 'paystack:7500:RCP_chidi:true',
  'the snapshot is Paystack''s account and its tier fee plus stamp duty');
set local role authenticated;
set local request.jwt.claims = '{"sub": "d6d6d6d6-0000-0000-0000-0000000d6002"}';
select is(public.approve_payout((select id from public.payouts where amount_kobo = 2600000)) - 'reference',
  '{"last4": "1234", "bank_name": "GTBank", "send_kobo": 2592500, "account_name": "CHIDI OKAFOR", "recipient_code": "RCP_chidi"}'::jsonb,
  'a Paystack approval returns exactly the old shape');
reset role;
set local role service_role;
select throws_ok($$ select public.flag_payout((select reference from public.payouts where amount_kobo = 2600000), 'needs_reference') $$,
  'P0001', 'payout_not_flaggable', 'a Paystack payout cannot be flagged');
select throws_ok($$ select public.record_payout_send((select reference from public.payouts where amount_kobo = 2600000), 'X1') $$,
  'P0001', 'payout_not_processing', 'or given a Cray id');
select throws_ok($$ select public.finish_payout((select reference from public.payouts where amount_kobo = 2600000), 'reversed',
    'evt-ps-rev', '{}', 2592500, null) $$,
  '22023', 'invalid_outcome', 'reversed is not an outcome for a Paystack payout');
select is(public.finish_payout((select reference from public.payouts where amount_kobo = 2600000), 'paid', 'evt-ps-paid', '{}'), 'paid',
  'the 4-argument call still settles a Paystack payout');
reset role;
select is((select array_agg(account || ':' || amount_kobo order by account) from public.ledger_entries
            where payout_id = (select id from public.payouts where amount_kobo = 2600000) and event_type = 'payout_paid'),
  array['payout_in_flight:2600000', 'paystack:-2600000'], 'cash leaves paystack by the whole amount, as before');

-- Access and the books -------------------------------------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "d6d6d6d6-0000-0000-0000-0000000d6101"}';
select throws_ok($$ select public.record_payout_send('x', 'y') $$, '42501', null, 'authenticated cannot call record_payout_send');
select throws_ok($$ select public.flag_payout('x', 'needs_reference') $$, '42501', null, 'nor flag_payout');
select throws_ok($$ select public.finish_payout('x', 'paid', 'k', '{}', 1, 1) $$, '42501', null, 'nor finish_payout');
select throws_ok($$ select public.save_cray_bank_account_for('00000000-0000-0000-0000-0000000d6101', '1', 'B', '1234', 'N', 'v1:a:b:c') $$,
  '42501', null, 'nor save_cray_bank_account_for');
reset role;
select is((select count(*)::integer from (
  select group_id from public.ledger_entries group by group_id having sum(amount_kobo) <> 0) x), 0, 'every group balances');
select is((select sum(value::bigint) from jsonb_each_text(public.ledger_totals())), 0::numeric, 'ledger totals sum to zero');
select is((select count(*)::integer from (
  select owner_user_id from public.ledger_entries where account = 'creator_wallet'
   group by owner_user_id having sum(amount_kobo) > 0) w), 0, 'no creator wallet is overdrawn');

select * from finish();
rollback;
