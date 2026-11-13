-- Proves the rules from the create_payouts migration: a creator saves a bank
-- account (last four digits only) and requests a payout, which moves wallet
-- money into payout_in_flight and is refused below the minimum, above the
-- balance or when the transfer fee eats it; only an admin approves or rejects,
-- once, from `requested`; approval fixes the transfer reference and returns the
-- destination saved at request time; finish_payout() settles a transfer once,
-- re-crediting the wallet on failure and ignoring a contradicting late event;
-- suspension does not stop payouts; every group balances.
-- Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(124);

-- Ada is a business, Efe an admin. Chidi, Dayo and Funmi are creators paid
-- ₦47,500 each for a ₦50,000 hire; Kemi is a creator with nothing earned.
insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000cc001', 'cdcdcdcd-0000-0000-0000-0000000cc001', 'ada.payout@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000cc002', 'cdcdcdcd-0000-0000-0000-0000000cc002', 'efe.payout@example.com', 'admin'),
  ('00000000-0000-0000-0000-0000000cc101', 'cdcdcdcd-0000-0000-0000-0000000cc101', 'chidi.payout@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000cc102', 'cdcdcdcd-0000-0000-0000-0000000cc102', 'dayo.payout@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000cc103', 'cdcdcdcd-0000-0000-0000-0000000cc103', 'funmi.payout@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000cc104', 'cdcdcdcd-0000-0000-0000-0000000cc104', 'kemi.payout@example.com', 'influencer');

insert into public.business_profiles (user_id, business_name, contact_name, state, city) values
  ('00000000-0000-0000-0000-0000000cc001', 'Ada Payout Kitchen', 'Ada Obi', 'Lagos', 'Ikeja');

insert into public.campaigns (id, business_id, status, title, brief, price_kobo, places,
                              applications_close_on, deliver_by, published_at, submitted_at) values
  ('cc000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000cc001', 'open', 'Payout test',
   'A brief that is long enough for the checks.', 5000000, 10, public.lagos_today() + 10, public.lagos_today() + 20, now(), now());

-- Hire n belongs to creator n (101..103).
insert into public.applications (id, campaign_id, creator_id, status)
select ('cc000000-0000-0000-0000-0000000a000' || n)::uuid, 'cc000000-0000-0000-0000-000000000001',
       ('00000000-0000-0000-0000-0000000cc10' || n)::uuid, 'approved'
  from generate_series(1, 3) n;

insert into public.engagements (id, application_id, campaign_id, business_id, creator_id, agreed_price_kobo, pay_by)
select ('cc000000-0000-0000-0000-0000000e000' || n)::uuid, ('cc000000-0000-0000-0000-0000000a000' || n)::uuid,
       'cc000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000cc001',
       ('00000000-0000-0000-0000-0000000cc10' || n)::uuid, 5000000, now() + interval '48 hours'
  from generate_series(1, 3) n;

-- Fund each hire by card the way the app does, then release it in full: the
-- creator's wallet gets ₦50,000 − ₦2,500 fee = ₦47,500.
do $$
declare
  n integer;
  started jsonb;
begin
  for n in 1..3 loop
    perform set_config('request.jwt.claims', '{"sub": "cdcdcdcd-0000-0000-0000-0000000cc001"}', true);
    started := public.start_payment(('cc000000-0000-0000-0000-0000000e000' || n)::uuid, true);
    perform set_config('request.jwt.claims', '', true);
    perform public.record_card_payment(started ->> 'reference', (started ->> 'card_amount_kobo')::bigint,
      95406, 'evt-payout-fund-' || n, '{}');
    perform public.settle_engagement_internal(('cc000000-0000-0000-0000-0000000e000' || n)::uuid,
      'release', null, 'work done', '00000000-0000-0000-0000-0000000cc002');
  end loop;
end;
$$;

select is((select array_agg(public.wallet_balance(id, 'creator_wallet') order by id) from public.users
            where id in ('00000000-0000-0000-0000-0000000cc101', '00000000-0000-0000-0000-0000000cc102',
                         '00000000-0000-0000-0000-0000000cc103')),
  array[4750000, 4750000, 4750000]::bigint[], 'Chidi, Dayo and Funmi each have ₦47,500 in their wallet');

-- Transfer fee ------------------------------------------------------------------------------------------
select is(public.transfer_fee_for(100000), 1000::bigint, '₦1,000: ₦10');
select is(public.transfer_fee_for(500000), 1000::bigint, '₦5,000: ₦10 (bound is inclusive)');
select is(public.transfer_fee_for(500001), 2500::bigint, 'just over ₦5,000: ₦25');
select is(public.transfer_fee_for(999999), 2500::bigint, '₦9,999.99: ₦25, no stamp duty');
select is(public.transfer_fee_for(1000000), 7500::bigint, '₦10,000: ₦25 + ₦50 stamp duty');
select is(public.transfer_fee_for(5000000), 7500::bigint, '₦50,000: ₦25 + ₦50 stamp duty');
select is(public.transfer_fee_for(5000001), 10000::bigint, 'over ₦50,000: ₦50 + ₦50 stamp duty');

-- Bank accounts -------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cc101"}'; -- Chidi
select throws_ok($$ select public.request_payout(100000) $$,
  'P0001', 'no_bank_account', 'no payout before a bank account is saved');
select throws_ok($$ select public.save_bank_account('058', 'GTBank', '12345', 'CHIDI OKAFOR', 'RCP_chidi1') $$,
  '22023', 'invalid_bank_account', 'five digits is not the last four');
select throws_ok($$ select public.save_bank_account('058', 'GTBank', '12a4', 'CHIDI OKAFOR', 'RCP_chidi1') $$,
  '22023', 'invalid_bank_account', 'the last four must be digits');
select throws_ok($$ select public.save_bank_account('058', '   ', '1234', 'CHIDI OKAFOR', 'RCP_chidi1') $$,
  '22023', 'invalid_bank_account', 'a blank bank name is refused');
select throws_ok($$ select public.save_bank_account('058', 'GTBank', '1234', null, 'RCP_chidi1') $$,
  '22023', 'invalid_bank_account', 'a missing account name is refused');
select throws_ok($$ select public.save_bank_account('058', 'GTBank', '1234', repeat('x', 201), 'RCP_chidi1') $$,
  '22023', 'invalid_bank_account', 'an account name over 200 characters is refused');
select lives_ok($$ select public.save_bank_account(' 058 ', ' GTBank ', '1234', ' CHIDI OKAFOR ', ' RCP_chidi1 ') $$,
  'Chidi saves his bank account');
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cc102"}'; -- Dayo
select lives_ok($$ select public.save_bank_account('044', 'Access Bank', '5678', 'DAYO ADE', 'RCP_dayo1') $$,
  'Dayo saves his bank account');
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cc001"}'; -- Ada
select throws_ok($$ select public.save_bank_account('044', 'Access Bank', '5678', 'ADA OBI', 'RCP_ada') $$,
  '42501', null, 'a business cannot save a payout account');
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cc002"}'; -- Efe
select throws_ok($$ select public.save_bank_account('044', 'Access Bank', '5678', 'EFE', 'RCP_efe') $$,
  '42501', null, 'an admin cannot save a payout account');
reset role;

select is((select array[bank_code, bank_name, last4, account_name, recipient_code] from public.bank_accounts
            where user_id = '00000000-0000-0000-0000-0000000cc101'),
  array['058', 'GTBank', '1234', 'CHIDI OKAFOR', 'RCP_chidi1'], 'the account is stored trimmed');
select hasnt_column('public', 'bank_accounts', 'account_number', 'no full account number is stored');

-- Requesting a payout -------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cc101"}'; -- Chidi
select throws_ok($$ select public.request_payout(99999) $$,
  'P0001', 'payout_too_small', 'below ₦1,000 is refused');
select throws_ok($$ select public.request_payout(0) $$,
  'P0001', 'payout_too_small', 'zero is refused');
select throws_ok($$ select public.request_payout(null) $$,
  'P0001', 'payout_too_small', 'null is refused');
select throws_ok($$ select public.request_payout(4750001) $$,
  'P0001', 'payout_not_enough_balance', 'more than the wallet holds is refused');
select lives_ok($$ select public.request_payout(4750000) $$, 'Chidi requests his whole ₦47,500');
select throws_ok($$ select public.request_payout(100000) $$,
  'P0001', 'payout_not_enough_balance', 'he cannot request more from an empty wallet');
reset role;
select is(public.wallet_balance('00000000-0000-0000-0000-0000000cc101', 'creator_wallet'), 0::bigint,
  'his wallet is now empty');

select is((select array[status, coalesce(reference, 'none'), transfer_fee_kobo::text, bank_name, last4,
                        account_name, recipient_code]
             from public.payouts where user_id = '00000000-0000-0000-0000-0000000cc101'),
  array['requested', 'none', '7500', 'GTBank', '1234', 'CHIDI OKAFOR', 'RCP_chidi1'],
  'the payout is requested, has no reference yet, and snapshots the fee and the destination');
select is((select array_agg(account || ':' || amount_kobo order by account) from public.ledger_entries
            where payout_id = (select id from public.payouts where user_id = '00000000-0000-0000-0000-0000000cc101')),
  '{creator_wallet:4750000,payout_in_flight:-4750000}'::text[], 'the request moves the wallet into payout in flight');
select ok((select bool_and(event_type = 'payout_requested' and actor_user_id = '00000000-0000-0000-0000-0000000cc101'
                           and owner_user_id is not distinct from
                             case when account = 'creator_wallet' then '00000000-0000-0000-0000-0000000cc101'::uuid end)
             from public.ledger_entries
            where payout_id = (select id from public.payouts where user_id = '00000000-0000-0000-0000-0000000cc101')),
  'as a payout_requested group by Chidi');
select ok(pg_get_functiondef('public.request_payout(bigint)'::regprocedure) ~ 'for no key update',
  'request_payout locks the creator before reading the balance');

-- Two requests whose sum exceeds the balance: the second is refused.
set local role authenticated;
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cc102"}'; -- Dayo
select lives_ok($$ select public.request_payout(3000000) $$, 'Dayo requests ₦30,000');
select throws_ok($$ select public.request_payout(2000000) $$,
  'P0001', 'payout_not_enough_balance', 'his second request for ₦20,000 is refused (₦17,500 left)');
reset role;
select is(public.wallet_balance('00000000-0000-0000-0000-0000000cc102', 'creator_wallet'), 1750000::bigint,
  'Dayo''s wallet holds ₦17,500, never below zero');
select is((select count(*)::integer from public.payouts where user_id = '00000000-0000-0000-0000-0000000cc102'), 1,
  'and only one payout exists for him');

-- The destination is fixed at request time.
set local role authenticated;
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cc101"}'; -- Chidi
select lives_ok($$ select public.save_bank_account('057', 'Zenith Bank', '9999', 'SOMEONE ELSE', 'RCP_other') $$,
  'Chidi changes his bank account while the payout waits');
reset role;
select is((select array[bank_name, last4, recipient_code] from public.bank_accounts
            where user_id = '00000000-0000-0000-0000-0000000cc101'),
  array['Zenith Bank', '9999', 'RCP_other'], 'the saved account is updated in place');
select is((select count(*)::integer from public.bank_accounts where user_id = '00000000-0000-0000-0000-0000000cc101'), 1,
  'still one account per creator');

-- Approving ---------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cc101"}'; -- Chidi
select throws_ok($$ select public.approve_payout((select id from public.payouts
                                                  where user_id = '00000000-0000-0000-0000-0000000cc101')) $$,
  'P0001', 'not_allowed', 'a creator cannot approve his own payout');
select throws_ok($$ select public.reject_payout((select id from public.payouts
                                                 where user_id = '00000000-0000-0000-0000-0000000cc101'), 'no') $$,
  'P0001', 'not_allowed', 'or reject it');
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cc001"}'; -- Ada
select throws_ok($$ select public.approve_payout('00000000-0000-0000-0000-000000000000') $$,
  'P0001', 'not_allowed', 'a business cannot approve payouts');
select throws_ok($$ select public.reject_payout('00000000-0000-0000-0000-000000000000', 'no') $$,
  'P0001', 'not_allowed', 'or reject them');
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cc002"}'; -- Efe
select throws_ok($$ select public.approve_payout(gen_random_uuid()) $$,
  'P0001', 'no_such_payout', 'an unknown payout cannot be approved');
select is(public.approve_payout((select id from public.payouts where user_id = '00000000-0000-0000-0000-0000000cc101')),
  (select jsonb_build_object('reference', 'pit_po_' || replace(id::text, '-', ''), 'recipient_code', 'RCP_chidi1',
                             'send_kobo', 4742500, 'bank_name', 'GTBank', 'last4', '1234',
                             'account_name', 'CHIDI OKAFOR')
     from public.payouts where user_id = '00000000-0000-0000-0000-0000000cc101'),
  'Efe approves: the reference, the destination saved at request time, and ₦47,425 to send');
select throws_ok($$ select public.approve_payout((select id from public.payouts
                                                  where user_id = '00000000-0000-0000-0000-0000000cc101')) $$,
  'P0001', 'payout_not_pending', 'approving twice is refused');
select throws_ok($$ select public.reject_payout((select id from public.payouts
                                                 where user_id = '00000000-0000-0000-0000-0000000cc101'), 'changed my mind') $$,
  'P0001', 'payout_not_pending', 'rejecting after approval is refused');
reset role;

select ok((select status = 'processing' and approved_by = '00000000-0000-0000-0000-0000000cc002'
                  and approved_at is not null and reference = 'pit_po_' || replace(id::text, '-', '')
                  and decision_reason is null and paid_at is null
             from public.payouts where user_id = '00000000-0000-0000-0000-0000000cc101'),
  'the payout is processing with the approver, the time and the reference');
select is((select count(*)::integer from public.ledger_entries
            where payout_id = (select id from public.payouts where user_id = '00000000-0000-0000-0000-0000000cc101')), 2,
  'approval moves no money');

-- Rejecting ---------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cc002"}'; -- Efe
select throws_ok($$ select public.reject_payout((select id from public.payouts
                                                 where user_id = '00000000-0000-0000-0000-0000000cc102'), '   ') $$,
  'P0001', 'payout_reason_required', 'a blank reason is refused');
select throws_ok($$ select public.reject_payout((select id from public.payouts
                                                 where user_id = '00000000-0000-0000-0000-0000000cc102'), null) $$,
  'P0001', 'payout_reason_required', 'a missing reason is refused');
select throws_ok($$ select public.reject_payout((select id from public.payouts
                                                 where user_id = '00000000-0000-0000-0000-0000000cc102'), repeat('x', 501)) $$,
  'P0001', 'payout_reason_required', 'a reason over 500 characters is refused');
select throws_ok($$ select public.reject_payout(gen_random_uuid(), 'no') $$,
  'P0001', 'no_such_payout', 'an unknown payout cannot be rejected');
select lives_ok($$ select public.reject_payout((select id from public.payouts
                                                where user_id = '00000000-0000-0000-0000-0000000cc102'),
                                               '  Bank details look wrong  ') $$,
  'Efe rejects Dayo''s payout with a reason');
select throws_ok($$ select public.reject_payout((select id from public.payouts
                                                 where user_id = '00000000-0000-0000-0000-0000000cc102'), 'again') $$,
  'P0001', 'payout_not_pending', 'rejecting twice is refused');
select throws_ok($$ select public.approve_payout((select id from public.payouts
                                                  where user_id = '00000000-0000-0000-0000-0000000cc102')) $$,
  'P0001', 'payout_not_pending', 'approving after rejection is refused');
reset role;

select ok((select status = 'rejected' and decision_reason = 'Bank details look wrong' and reference is null
                  and approved_by is null and approved_at is null
             from public.payouts where user_id = '00000000-0000-0000-0000-0000000cc102'),
  'the payout is rejected with the trimmed reason and never got a reference');
select is(public.wallet_balance('00000000-0000-0000-0000-0000000cc102', 'creator_wallet'), 4750000::bigint,
  'Dayo''s ₦30,000 is back in his wallet');
select is((select array_agg(account || ':' || amount_kobo || ':' || event_type order by account) from public.ledger_entries
            where payout_id = (select id from public.payouts where user_id = '00000000-0000-0000-0000-0000000cc102')
              and event_type = 'payout_rejected'),
  '{creator_wallet:-3000000:payout_rejected,payout_in_flight:3000000:payout_rejected}'::text[],
  'with one reversing payout_rejected group');
select ok((select bool_and(actor_user_id = '00000000-0000-0000-0000-0000000cc002' and reason = 'Bank details look wrong')
             from public.ledger_entries
            where payout_id = (select id from public.payouts where user_id = '00000000-0000-0000-0000-0000000cc102')
              and event_type = 'payout_rejected'),
  'recorded with Efe as the actor and the reason');

-- Finishing a transfer ------------------------------------------------------------------------------------
set local role authenticated;
select throws_ok($$ select public.finish_payout('pit_po_x', 'paid', 'evt-x', '{}') $$,
  '42501', null, 'a signed-in person cannot finish a payout');
reset role;
set local role service_role;
select throws_ok($$ select public.finish_payout('pit_po_00000000000000000000000000000000', 'paid', 'evt-po-none', '{}') $$,
  'P0001', 'no_such_payout', 'an unknown reference is refused');
select throws_ok($$ select public.finish_payout((select reference from public.payouts
                                                 where user_id = '00000000-0000-0000-0000-0000000cc101'),
                                                'reversed', 'evt-po-bad', '{}') $$,
  '22023', 'invalid_outcome', 'only paid or failed');
select is(public.finish_payout((select reference from public.payouts where user_id = '00000000-0000-0000-0000-0000000cc101'),
                               'paid', 'evt-po-chidi-paid', '{"event": "transfer.success"}'),
  'paid', 'transfer.success marks Chidi''s payout paid');
select is(public.finish_payout((select reference from public.payouts where user_id = '00000000-0000-0000-0000-0000000cc101'),
                               'paid', 'evt-po-chidi-paid', '{"event": "transfer.success"}'),
  'duplicate', 'the same event again is a duplicate');
select is(public.finish_payout((select reference from public.payouts where user_id = '00000000-0000-0000-0000-0000000cc101'),
                               'paid', 'evt-po-chidi-paid-2', '{"event": "transfer.success"}'),
  'duplicate', 'a second success event is a duplicate');
select is(public.finish_payout((select reference from public.payouts where user_id = '00000000-0000-0000-0000-0000000cc101'),
                               'failed', 'evt-po-chidi-failed', '{"event": "transfer.failed"}'),
  'ignored', 'a failure after success is ignored');
reset role;

select ok((select status = 'paid' and paid_at is not null from public.payouts
            where user_id = '00000000-0000-0000-0000-0000000cc101'), 'Chidi''s payout is paid');
select is(public.wallet_balance('00000000-0000-0000-0000-0000000cc101', 'creator_wallet'), 0::bigint,
  'and his wallet is not re-credited by the late failure');
select is((select array_agg(account || ':' || amount_kobo order by account) from public.ledger_entries
            where payout_id = (select id from public.payouts where user_id = '00000000-0000-0000-0000-0000000cc101')
              and event_type = 'payout_paid'),
  '{payout_in_flight:4750000,paystack:-4750000}'::text[], 'paid: the money leaves Paystack once');
select ok((select bool_and(actor_user_id is null and paystack_reference = (select reference from public.payouts
                                                                           where user_id = '00000000-0000-0000-0000-0000000cc101'))
             from public.ledger_entries
            where payout_id = (select id from public.payouts where user_id = '00000000-0000-0000-0000-0000000cc101')
              and event_type = 'payout_paid'),
  'by the system, with the transfer reference');
select is((select count(*)::integer from public.payment_events where event_key like 'evt-po-chidi-%'), 3,
  'every distinct event is kept for audit');

-- A transfer that fails re-credits the wallet exactly once.
set local role authenticated;
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cc102"}'; -- Dayo
select lives_ok($$ select public.request_payout(2000000) $$, 'Dayo requests ₦20,000');
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cc002"}'; -- Efe
select is(public.approve_payout((select id from public.payouts where user_id = '00000000-0000-0000-0000-0000000cc102'
                                   and status = 'requested')) ->> 'send_kobo',
  '1992500', 'Efe approves it: ₦19,925 to send');
reset role;
select is(public.wallet_balance('00000000-0000-0000-0000-0000000cc102', 'creator_wallet'), 2750000::bigint,
  'Dayo''s wallet holds ₦27,500 while the transfer runs');
set local role service_role;
select is(public.finish_payout((select reference from public.payouts where user_id = '00000000-0000-0000-0000-0000000cc102'
                                  and amount_kobo = 2000000),
                               'failed', 'evt-po-dayo-failed', '{"event": "transfer.failed"}'),
  'failed', 'transfer.failed marks it failed');
select is(public.finish_payout((select reference from public.payouts where user_id = '00000000-0000-0000-0000-0000000cc102'
                                  and amount_kobo = 2000000),
                               'failed', 'evt-po-dayo-failed', '{"event": "transfer.failed"}'),
  'duplicate', 'the same event again is a duplicate');
select is(public.finish_payout((select reference from public.payouts where user_id = '00000000-0000-0000-0000-0000000cc102'
                                  and amount_kobo = 2000000),
                               'failed', 'evt-po-dayo-reversed', '{"event": "transfer.reversed"}'),
  'duplicate', 'a reversal after the failure is a duplicate');
select is(public.finish_payout((select reference from public.payouts where user_id = '00000000-0000-0000-0000-0000000cc102'
                                  and amount_kobo = 2000000),
                               'paid', 'evt-po-dayo-paid', '{"event": "transfer.success"}'),
  'ignored', 'a success after the failure is ignored');
reset role;

select ok((select status = 'failed' and paid_at is null from public.payouts
            where user_id = '00000000-0000-0000-0000-0000000cc102' and amount_kobo = 2000000),
  'the payout stays failed');
select is(public.wallet_balance('00000000-0000-0000-0000-0000000cc102', 'creator_wallet'), 4750000::bigint,
  'Dayo''s ₦20,000 is back in his wallet, once');
select is((select array_agg(account || ':' || amount_kobo order by account) from public.ledger_entries
            where payout_id = (select id from public.payouts where user_id = '00000000-0000-0000-0000-0000000cc102'
                                 and amount_kobo = 2000000)
              and event_type = 'payout_failed'),
  '{creator_wallet:-2000000,payout_in_flight:2000000}'::text[], 'with one reversing payout_failed group');
select is((select count(*)::integer from public.ledger_entries
            where payout_id = (select id from public.payouts where user_id = '00000000-0000-0000-0000-0000000cc102'
                                 and amount_kobo = 2000000)
              and account = 'paystack'), 0, 'no cash moved for the failed transfer');

-- A suspended creator keeps getting paid (CLAUDE.md §6.5) ----------------------------------------------------
update public.users set suspended_at = now() where id = '00000000-0000-0000-0000-0000000cc103';
set local role authenticated;
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cc103"}'; -- Funmi
select lives_ok($$ select public.save_bank_account('033', 'UBA', '4321', 'FUNMI BELLO', 'RCP_funmi') $$,
  'a suspended creator can save a bank account');
select lives_ok($$ select public.request_payout(1000000) $$, 'and request a payout');
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cc002"}'; -- Efe
select is(public.approve_payout((select id from public.payouts where user_id = '00000000-0000-0000-0000-0000000cc103'))
            ->> 'recipient_code',
  'RCP_funmi', 'and an admin can approve it');
reset role;
select is((select status from public.payouts where user_id = '00000000-0000-0000-0000-0000000cc103'), 'processing',
  'Funmi''s payout is processing');

-- Who can see and change what ------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cc101"}'; -- Chidi
select is((select count(*)::integer from public.payouts), 1, 'Chidi sees only his own payout');
select is((select count(*)::integer from public.bank_accounts), 1, 'and only his own bank account');
select is((select count(*)::integer from public.payouts where user_id <> '00000000-0000-0000-0000-0000000cc101'), 0,
  'none of anyone else''s payouts');
select throws_ok($$ insert into public.payouts (user_id, amount_kobo, transfer_fee_kobo, bank_name, last4, account_name,
                                                recipient_code, fee_config_id)
                    values ('00000000-0000-0000-0000-0000000cc101', 100000, 1000, 'X', '1111', 'X', 'X',
                            (select id from public.fee_config limit 1)) $$,
  '42501', null, 'a creator cannot write a payout directly');
select throws_ok($$ update public.payouts set status = 'paid' $$,
  '42501', null, 'or change one');
select throws_ok($$ update public.bank_accounts set recipient_code = 'RCP_x' $$,
  '42501', null, 'or change a bank account directly');
select throws_ok($$ delete from public.bank_accounts $$,
  '42501', null, 'or delete one');
select throws_ok($$ select public.transfer_fee_for(100000) $$,
  '42501', null, 'transfer_fee_for is internal');
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cc102"}'; -- Dayo
select is((select count(*)::integer from public.payouts), 2, 'Dayo sees his two payouts');
select is((select count(*)::integer from public.payouts where user_id = '00000000-0000-0000-0000-0000000cc101'), 0,
  'and none of Chidi''s');
select is((select count(*)::integer from public.bank_accounts where user_id <> '00000000-0000-0000-0000-0000000cc102'), 0,
  'nor anyone else''s bank account');
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cc104"}'; -- Kemi
select is((select count(*)::integer from public.payouts), 0, 'Kemi, with no payouts, sees none');
select is((select count(*)::integer from public.bank_accounts), 0, 'and no bank accounts');
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cc001"}'; -- Ada
select is((select count(*)::integer from public.payouts), 0, 'a business sees no payouts');
select is((select count(*)::integer from public.bank_accounts), 0, 'and no bank accounts');
select throws_ok($$ select public.request_payout(100000) $$,
  '42501', null, 'a business cannot request a payout');
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cc002"}'; -- Efe
select is((select count(*)::integer from public.payouts where user_id::text like '00000000-0000-0000-0000-0000000cc1%'), 4,
  'an admin sees every payout');
select is((select count(*)::integer from public.bank_accounts where user_id::text like '00000000-0000-0000-0000-0000000cc1%'), 3,
  'and every bank account');
select throws_ok($$ select public.request_payout(100000) $$,
  '42501', null, 'an admin cannot request a payout');
reset role;
set local role anon;
select throws_ok($$ select count(*) from public.payouts $$, '42501', null, 'anon cannot read payouts');
select throws_ok($$ select count(*) from public.bank_accounts $$, '42501', null, 'anon cannot read bank accounts');
select throws_ok($$ select public.request_payout(100000) $$, '42501', null, 'anon cannot request a payout');
select throws_ok($$ select public.save_bank_account('058', 'GTBank', '1234', 'X', 'RCP_x') $$,
  '42501', null, 'anon cannot save a bank account');
select throws_ok($$ select public.approve_payout(gen_random_uuid()) $$, '42501', null, 'anon cannot approve');
select throws_ok($$ select public.reject_payout(gen_random_uuid(), 'no') $$, '42501', null, 'anon cannot reject');
select throws_ok($$ select public.finish_payout('pit_po_x', 'paid', 'evt-y', '{}') $$,
  '42501', null, 'anon cannot finish a payout');
reset role;

-- A fee that eats the payout is refused ---------------------------------------------------------------------
-- A later fee_config version with a ₦5 minimum and a flat ₦10 fee.
insert into public.fee_config (business_fee_bps, creator_fee_bps, min_fee_kobo, min_payout_kobo, transfer_fee_tiers,
                               transfer_stamp_duty_kobo, transfer_stamp_duty_from_kobo, paystack_rate, created_at)
select business_fee_bps, creator_fee_bps, min_fee_kobo, 500, '[{"up_to_kobo": null, "fee_kobo": 1000}]',
       0, 0, paystack_rate, now() + interval '1 second'
  from public.fee_config order by created_at desc, id desc limit 1;
set local role authenticated;
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cc102"}'; -- Dayo
select throws_ok($$ select public.request_payout(1000) $$,
  'P0001', 'payout_fee_too_high', 'a ₦10 payout with a ₦10 fee is refused');
select throws_ok($$ select public.request_payout(999) $$,
  'P0001', 'payout_fee_too_high', 'a ₦9.99 payout with a ₦10 fee is refused');
select lives_ok($$ select public.request_payout(1001) $$, 'a ₦10.01 payout is allowed under that config');
reset role;
select is((select transfer_fee_kobo from public.payouts where user_id = '00000000-0000-0000-0000-0000000cc102'
            and amount_kobo = 1001), 1000::bigint, 'with the fee from the current config');
select is((select fee_config_id from public.payouts where user_id = '00000000-0000-0000-0000-0000000cc102'
            and amount_kobo = 1001), (select id from public.fee_config order by created_at desc, id desc limit 1),
  'and that config recorded on the payout');

-- Totals ---------------------------------------------------------------------------------------------------
select is((select count(*)::integer from (
  select group_id from public.ledger_entries group by group_id having sum(amount_kobo) <> 0) g), 0,
  'every group sums to zero');
select is((select sum(value::bigint) from jsonb_each_text(public.ledger_totals())), 0::numeric,
  'ledger totals sum to zero after every flow');
select ok((select (t ->> 'paystack')::bigint
                  = -((t ->> 'escrow')::bigint + (t ->> 'business_wallet')::bigint + (t ->> 'creator_wallet')::bigint
                      + (t ->> 'payout_in_flight')::bigint + (t ->> 'platform_revenue')::bigint)
                    - (t ->> 'paystack_fees')::bigint
             from public.ledger_totals() t),
  'cash = escrow + wallets + payouts in flight + revenue − Paystack fees');
select is((select count(*)::integer from (
  select owner_user_id from public.ledger_entries where account = 'creator_wallet'
   group by owner_user_id having sum(amount_kobo) > 0) w), 0, 'no creator wallet is overdrawn');
select is((select coalesce(sum(l.amount_kobo), 0) from public.ledger_entries l
            join public.payouts p on p.id = l.payout_id
           where p.user_id::text like '00000000-0000-0000-0000-0000000cc1%' and l.account = 'payout_in_flight'),
  (select -sum(amount_kobo) from public.payouts
    where user_id::text like '00000000-0000-0000-0000-0000000cc1%' and status in ('requested', 'processing')),
  'payout in flight holds exactly the requested and processing payouts');
select is((select count(*)::integer from public.payouts p
            where p.user_id::text like '00000000-0000-0000-0000-0000000cc1%'
              and p.status in ('paid', 'failed', 'rejected')
              and (select sum(l.amount_kobo) from public.ledger_entries l
                    where l.payout_id = p.id and l.account = 'payout_in_flight') <> 0), 0,
  'every finished payout has closed its payout in flight');
select is(
  array[public.wallet_balance('00000000-0000-0000-0000-0000000cc101', 'creator_wallet'),
        public.wallet_balance('00000000-0000-0000-0000-0000000cc102', 'creator_wallet'),
        public.wallet_balance('00000000-0000-0000-0000-0000000cc103', 'creator_wallet')],
  array[0, 4748999, 3750000]::bigint[], 'final wallets: Chidi paid out, Dayo less ₦10.01 in flight, Funmi less ₦10,000');

select * from finish();
rollback;
