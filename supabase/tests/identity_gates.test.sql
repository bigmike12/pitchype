-- Proves the identity gates from the identity_gates migration: an unverified
-- creator cannot apply, an unverified business cannot approve a hire or send
-- a campaign for listing, an unverified creator cannot request a payout (and
-- their wallet is untouched), and an admin cannot approve a payout while the
-- creator's latest screening is missing, a possible match, an error or a
-- confirmed match. What was already agreed is not touched: a hire approved
-- earlier can still be paid, a paused campaign resumes, admin takedowns work.
-- Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(41);

-- Ada is a verified business, Bob starts unverified. Chi is an unverified creator,
-- Dee and Fay are verified, Eli is unverified with earnings. Zed is an admin.
insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000e1001', 'e1e1e1e1-0000-0000-0000-0000000e1001', 'ada.gate@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000e1002', 'e1e1e1e1-0000-0000-0000-0000000e1002', 'bob.gate@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000e1101', 'e1e1e1e1-0000-0000-0000-0000000e1101', 'chi.gate@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000e1102', 'e1e1e1e1-0000-0000-0000-0000000e1102', 'dee.gate@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000e1103', 'e1e1e1e1-0000-0000-0000-0000000e1103', 'fay.gate@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000e1104', 'e1e1e1e1-0000-0000-0000-0000000e1104', 'eli.gate@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000e1900', 'e1e1e1e1-0000-0000-0000-0000000e1900', 'zed.gate@example.com', 'admin');

insert into public.identity_checks (user_id, kind, status, reference, legal_name_entered, legal_name_on_record,
                                    id_last3, id_fingerprint, counted, decided_at)
select u.id, case u.role when 'influencer' then 'creator_nin' else 'owner_bvn' end, 'verified',
       'pit_id_gate_' || replace(u.id::text, '-', ''), 'Gate Person', 'GATE PERSON', '000',
       'v1:gate-' || u.id::text, true, now()
  from public.users u
 where u.id in ('00000000-0000-0000-0000-0000000e1001', '00000000-0000-0000-0000-0000000e1102',
                '00000000-0000-0000-0000-0000000e1103');

insert into public.business_profiles (user_id, business_name, contact_name, state, city) values
  ('00000000-0000-0000-0000-0000000e1001', 'Ada Gate Kitchen', 'Ada Obi', 'Lagos', 'Ikeja'),
  ('00000000-0000-0000-0000-0000000e1002', 'Bob Gate Shop', 'Bob A', 'Oyo', 'Ibadan');

insert into public.influencer_profiles (user_id, display_name, state, city, niches, published) values
  ('00000000-0000-0000-0000-0000000e1101', 'Chi Gate Test', 'Lagos', 'Yaba', '{fashion}', true),
  ('00000000-0000-0000-0000-0000000e1102', 'Dee Gate Test', 'Lagos', 'Yaba', '{fashion}', true);
insert into public.influencer_platforms (user_id, platform, handle, follower_range) values
  ('00000000-0000-0000-0000-0000000e1101', 'instagram', 'chi.gatetest', '1k_5k'),
  ('00000000-0000-0000-0000-0000000e1102', 'instagram', 'dee.gatetest', '1k_5k');

-- K1 is Ada's; K2 (open), K3 (paused) and K5 (open) are Bob's.
insert into public.campaigns (id, business_id, status, title, brief, price_kobo, places,
                              applications_close_on, deliver_by, published_at) values
  ('e1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000e1001', 'open', 'K1 gate test',
   'A brief that is long enough for the checks.', 2500000, 3, public.lagos_today() + 10, public.lagos_today() + 20, now()),
  ('e1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000e1002', 'open', 'K2 gate test',
   'A brief that is long enough for the checks.', 2500000, 3, public.lagos_today() + 10, public.lagos_today() + 20, now()),
  ('e1000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000e1002', 'paused', 'K3 gate test',
   'A brief that is long enough for the checks.', 2500000, 3, public.lagos_today() + 10, public.lagos_today() + 20, now()),
  ('e1000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000e1002', 'open', 'K5 gate test',
   'A brief that is long enough for the checks.', 2500000, 3, public.lagos_today() + 10, public.lagos_today() + 20, now());
insert into public.campaign_platforms (campaign_id, platform, min_followers) values
  ('e1000000-0000-0000-0000-000000000001', 'instagram', null),
  ('e1000000-0000-0000-0000-000000000002', 'instagram', null),
  ('e1000000-0000-0000-0000-000000000003', 'instagram', null),
  ('e1000000-0000-0000-0000-000000000005', 'instagram', null);

-- Applying ---------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "e1e1e1e1-0000-0000-0000-0000000e1101"}'; -- Chi, unverified
select throws_ok($$ select public.apply_to_campaign('e1000000-0000-0000-0000-000000000001', null, 'Pick me') $$,
  'P0001', 'identity_required', 'an unverified creator cannot apply');
set local request.jwt.claims = '{"sub": "e1e1e1e1-0000-0000-0000-0000000e1102"}'; -- Dee, verified
select isnt(public.apply_to_campaign('e1000000-0000-0000-0000-000000000001', null, 'Pick me'), null,
  'a verified creator applies');
select isnt(public.apply_to_campaign('e1000000-0000-0000-0000-000000000002', null, 'Pick me too'), null,
  'to any campaign');

-- Hiring ------------------------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "e1e1e1e1-0000-0000-0000-0000000e1002"}'; -- Bob, unverified
select throws_ok($$ select public.approve_application(
    (select a.id from public.applications a where a.campaign_id = 'e1000000-0000-0000-0000-000000000002'), 2500000) $$,
  'P0001', 'identity_required', 'an unverified business cannot approve a hire');
select lives_ok($$ select public.decide_application(
    (select a.id from public.applications a where a.campaign_id = 'e1000000-0000-0000-0000-000000000002'), 'shortlisted', null) $$,
  'but can still shortlist');
set local request.jwt.claims = '{"sub": "e1e1e1e1-0000-0000-0000-0000000e1001"}'; -- Ada, verified
select isnt(public.approve_application(
    (select a.id from public.applications a where a.campaign_id = 'e1000000-0000-0000-0000-000000000001'), 2500000), null,
  'a verified business approves a hire');

-- Publishing ----------------------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "e1e1e1e1-0000-0000-0000-0000000e1002"}'; -- Bob, unverified
select isnt(public.save_campaign_draft(
    campaign_id => null, title => 'Bob draft', brief => 'Show our shop to your followers, please.',
    guidelines => null, niches => '{fashion}', states => '{Oyo}', verified_only => false,
    price_kobo => 5000000, places => 2, applications_close_on => public.lagos_today() + 10,
    post_from => null, deliver_by => public.lagos_today() + 20,
    platforms => '[{"platform": "instagram", "min_followers": null}]',
    deliverables => '[{"platform": "instagram", "kind": "reel", "quantity": 1}]'), null,
  'an unverified business can still save a draft');
select throws_ok($$ select public.transition_campaign((select id from public.campaigns where title = 'Bob draft'), 'submit') $$,
  'P0001', 'identity_required', 'but cannot send it for listing');
select is(public.transition_campaign('e1000000-0000-0000-0000-000000000003', 'resume')::text, 'open',
  'a paused campaign resumes without verification');
select is(public.transition_campaign('e1000000-0000-0000-0000-000000000003', 'pause')::text, 'paused',
  'and can be paused again');
set local request.jwt.claims = '{"sub": "e1e1e1e1-0000-0000-0000-0000000e1900"}'; -- Zed
select is(public.transition_campaign('e1000000-0000-0000-0000-000000000005', 'take_down', 'Against the rules')::text, 'closed',
  'an admin takes down an unverified business''s campaign');
reset role;

-- Bob becomes verified; the same actions now work.
insert into public.identity_checks (user_id, kind, status, reference, legal_name_entered, legal_name_on_record,
                                    id_last3, id_fingerprint, counted, decided_at)
values ('00000000-0000-0000-0000-0000000e1002', 'owner_bvn', 'verified', 'pit_id_gate_bob', 'Bob Owner', 'BOB OWNER',
        '000', 'v1:gate-bob', true, now());
set local role authenticated;
set local request.jwt.claims = '{"sub": "e1e1e1e1-0000-0000-0000-0000000e1002"}';
update public.campaigns set post_from = public.lagos_today() + 12, ends_on = deliver_by + 10
 where title = 'Bob draft'; -- fixture: a new campaign needs a timeline (campaign_timeline migration)
select is(public.transition_campaign((select id from public.campaigns where title = 'Bob draft'), 'submit')::text, 'pending_review',
  'a verified business sends a campaign for listing');
select isnt(public.approve_application(
    (select a.id from public.applications a where a.campaign_id = 'e1000000-0000-0000-0000-000000000002'), 2500000), null,
  'and approves a hire');
reset role;

-- A hire approved before verification existed can still be paid -------------------------------------------------
delete from public.identity_checks where user_id = '00000000-0000-0000-0000-0000000e1002';
set local role authenticated;
set local request.jwt.claims = '{"sub": "e1e1e1e1-0000-0000-0000-0000000e1002"}';
select lives_ok($$ select public.start_payment(
    (select e.id from public.engagements e where e.campaign_id = 'e1000000-0000-0000-0000-000000000002'), true) $$,
  'a business that lost verification can still pay a hire it already approved');
reset role;

-- Admins count as verified for the function itself.
set local role service_role;
select is(public.identity_verified('00000000-0000-0000-0000-0000000e1900'), true, 'admins are always verified');
select is(public.identity_verified('00000000-0000-0000-0000-0000000e1002'), false, 'a business without a check is not');
reset role;

-- Payouts --------------------------------------------------------------------------------------------------------
select public.post_ledger_group('correction', null, 'test credit', null, null, null, null, null,
  '[{"account": "paystack", "amount": 10000000},
    {"account": "creator_wallet", "owner": "00000000-0000-0000-0000-0000000e1104", "amount": -5000000},
    {"account": "creator_wallet", "owner": "00000000-0000-0000-0000-0000000e1103", "amount": -5000000}]'::jsonb);
set local role service_role;
select lives_ok($$ select public.save_bank_account_for('00000000-0000-0000-0000-0000000e1104', '000013', 'GTBank', '1234',
                                                      'ELI TEST', 'RCP_eli_test') $$, 'Eli has a bank account');
select lives_ok($$ select public.save_bank_account_for('00000000-0000-0000-0000-0000000e1103', '000013', 'GTBank', '5678',
                                                      'FAY TEST', 'RCP_fay_test') $$, 'and so does Fay');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub": "e1e1e1e1-0000-0000-0000-0000000e1104"}'; -- Eli, unverified with earnings
select throws_ok($$ select public.request_payout(1000000) $$,
  'P0001', 'identity_required', 'an unverified creator with earnings cannot request a payout');
reset role;
set local role service_role;
select is(public.wallet_balance('00000000-0000-0000-0000-0000000e1104', 'creator_wallet'), 5000000::bigint,
  'and the wallet is untouched');
reset role;
select is((select count(*)::int from public.payouts where user_id = '00000000-0000-0000-0000-0000000e1104'), 0,
  'no payout was made');

set local role authenticated;
set local request.jwt.claims = '{"sub": "e1e1e1e1-0000-0000-0000-0000000e1103"}'; -- Fay, verified
select lives_ok($$ select public.request_payout(1000000) $$, 'a verified creator requests a payout');
select lives_ok($$ select public.request_payout(1010000) $$, 'and another');
select lives_ok($$ select public.request_payout(1020000) $$, 'and another');
reset role;

-- Approving needs a clear screening -----------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "e1e1e1e1-0000-0000-0000-0000000e1900"}'; -- Zed
select throws_ok($$ select public.approve_payout((select id from public.payouts where amount_kobo = 1000000
    and user_id = '00000000-0000-0000-0000-0000000e1103')) $$,
  'P0001', 'screening_hold', 'a payout cannot be approved before the creator was screened');
reset role;
set local role service_role;
select lives_ok($$ select public.record_screening('00000000-0000-0000-0000-0000000e1103', 'person', 'first_payout', 'possible_match', 1, null) $$,
  'a possible match is recorded');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub": "e1e1e1e1-0000-0000-0000-0000000e1900"}';
select throws_ok($$ select public.approve_payout((select id from public.payouts where amount_kobo = 1000000
    and user_id = '00000000-0000-0000-0000-0000000e1103')) $$,
  'P0001', 'screening_hold', 'a possible match blocks approval');
reset role;
set local role service_role;
select lives_ok($$ select public.record_screening('00000000-0000-0000-0000-0000000e1103', 'person', 'admin', 'error', 0, null) $$,
  'a screening error is recorded');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub": "e1e1e1e1-0000-0000-0000-0000000e1900"}';
select throws_ok($$ select public.approve_payout((select id from public.payouts where amount_kobo = 1000000
    and user_id = '00000000-0000-0000-0000-0000000e1103')) $$,
  'P0001', 'screening_hold', 'an error blocks approval too');
reset role;
set local role service_role;
select lives_ok($$ select public.record_screening('00000000-0000-0000-0000-0000000e1103', 'person', 'admin', 'clear', 0, null) $$,
  'a clear screening is recorded');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub": "e1e1e1e1-0000-0000-0000-0000000e1900"}';
select isnt(public.approve_payout((select id from public.payouts where amount_kobo = 1000000
    and user_id = '00000000-0000-0000-0000-0000000e1103')), null, 'a clear screening lets the admin approve');
reset role;

-- A possible match the admin cleared also lets approval through.
set local role service_role;
select lives_ok($$ select public.record_screening('00000000-0000-0000-0000-0000000e1103', 'person', 'admin', 'possible_match', 1, null) $$,
  'another possible match');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub": "e1e1e1e1-0000-0000-0000-0000000e1900"}';
select throws_ok($$ select public.approve_payout((select id from public.payouts where amount_kobo = 1010000
    and user_id = '00000000-0000-0000-0000-0000000e1103')) $$,
  'P0001', 'screening_hold', 'it blocks again');
select lives_ok($$ select public.review_screening(
    (select s.id from public.screenings s where s.user_id = '00000000-0000-0000-0000-0000000e1103'
      and s.status = 'possible_match' and s.review_outcome is null
      order by s.created_at desc limit 1), 'cleared', 'A different person') $$,
  'the admin clears it');
select isnt(public.approve_payout((select id from public.payouts where amount_kobo = 1010000
    and user_id = '00000000-0000-0000-0000-0000000e1103')), null, 'and approval goes through');

-- A confirmed match blocks approval, but the admin can still reject the payout.
reset role;
set local role service_role;
select lives_ok($$ select public.record_screening('00000000-0000-0000-0000-0000000e1103', 'person', 'admin', 'possible_match', 1, null) $$,
  'a third possible match');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub": "e1e1e1e1-0000-0000-0000-0000000e1900"}';
select lives_ok($$ select public.review_screening(
    (select s.id from public.screenings s where s.user_id = '00000000-0000-0000-0000-0000000e1103'
      and s.status = 'possible_match' and s.review_outcome is null
      order by s.created_at desc limit 1), 'confirmed', 'On a sanctions list') $$,
  'the admin confirms it');
select throws_ok($$ select public.approve_payout((select id from public.payouts where amount_kobo = 1020000
    and user_id = '00000000-0000-0000-0000-0000000e1103')) $$,
  'P0001', 'screening_hold', 'a confirmed match blocks approval');
select lives_ok($$ select public.reject_payout((select id from public.payouts where amount_kobo = 1020000
    and user_id = '00000000-0000-0000-0000-0000000e1103'), 'Account under review') $$,
  'but the payout can still be rejected, returning the money');
reset role;
set local role service_role;
select is(public.wallet_balance('00000000-0000-0000-0000-0000000e1103', 'creator_wallet'), 5000000::bigint - 1000000 - 1010000,
  'and only the two approved payouts left the wallet');
reset role;
select is((select status from public.payouts where amount_kobo = 1000000 and user_id = '00000000-0000-0000-0000-0000000e1103'),
  'processing', 'the approved payout is processing');

select * from finish();
rollback;
