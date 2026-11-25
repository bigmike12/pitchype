-- Proves the identity switch (20261129100000): off by default; while off an
-- unverified creator applies and requests a payout, an unverified business
-- approves a hire and sends a campaign for listing, and an admin approves a
-- payout without any screening. Only an admin flips it, the table is closed
-- to clients, and switching it on brings the gates back (a payout requested
-- while it was off then waits for a screening).
-- Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(22);

-- Bo is a business, Cy a creator, neither verified. Zo is an admin.
insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000f1001', 'f1f1f1f1-0000-0000-0000-0000000f1001', 'bo.switch@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000f1101', 'f1f1f1f1-0000-0000-0000-0000000f1101', 'cy.switch@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000f1900', 'f1f1f1f1-0000-0000-0000-0000000f1900', 'zo.switch@example.com', 'admin');

insert into public.business_profiles (user_id, business_name, contact_name, state, city) values
  ('00000000-0000-0000-0000-0000000f1001', 'Bo Switch Shop', 'Bo A', 'Lagos', 'Ikeja');
insert into public.influencer_profiles (user_id, display_name, state, city, niches, published) values
  ('00000000-0000-0000-0000-0000000f1101', 'Cy Switch Test', 'Lagos', 'Yaba', '{fashion}', true);
insert into public.influencer_platforms (user_id, platform, handle, follower_range) values
  ('00000000-0000-0000-0000-0000000f1101', 'instagram', 'cy.switchtest', '1k_5k');

insert into public.campaigns (id, business_id, status, title, brief, price_kobo, places,
                              applications_close_on, deliver_by, published_at) values
  ('f1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000f1001', 'open', 'S1 switch test',
   'A brief that is long enough for the checks.', 2500000, 3, public.lagos_today() + 10, public.lagos_today() + 20, now()),
  ('f1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000f1001', 'open', 'S2 switch test',
   'A brief that is long enough for the checks.', 2500000, 3, public.lagos_today() + 10, public.lagos_today() + 20, now());
insert into public.campaign_platforms (campaign_id, platform, min_followers) values
  ('f1000000-0000-0000-0000-000000000001', 'instagram', null),
  ('f1000000-0000-0000-0000-000000000002', 'instagram', null);

-- Cy has earnings and a bank account.
select public.post_ledger_group('correction', null, 'test credit', null, null, null, null, null,
  '[{"account": "paystack", "amount": 5000000},
    {"account": "creator_wallet", "owner": "00000000-0000-0000-0000-0000000f1101", "amount": -5000000}]'::jsonb);
set local role service_role;
select public.save_bank_account_for('00000000-0000-0000-0000-0000000f1101', '000013', 'GTBank', '4321',
                                    'CY TEST', 'RCP_cy_test');

-- Off by default ------------------------------------------------------------------------------------------
select is(public.identity_checks_required(), false, 'identity checks are off by default');
select is(public.identity_verified('00000000-0000-0000-0000-0000000f1101'), true,
  'while off, an unverified creator passes the gate');
select is(public.identity_verified('00000000-0000-0000-0000-0000000f1001'), true,
  'and so does an unverified business');
reset role;

-- While off, everything works without verifying ---------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f1101"}'; -- Cy
select isnt(public.apply_to_campaign('f1000000-0000-0000-0000-000000000001', null, 'Pick me'), null,
  'an unverified creator applies');
select lives_ok($$ select public.request_payout(1000000) $$, 'and requests a payout');
select lives_ok($$ select public.request_payout(1010000) $$, 'and another');

set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f1001"}'; -- Bo
select isnt(public.approve_application(
    (select a.id from public.applications a where a.campaign_id = 'f1000000-0000-0000-0000-000000000001'), 2500000), null,
  'an unverified business approves a hire');
select isnt(public.save_campaign_draft(
    campaign_id => null, title => 'Bo draft', brief => 'Show our shop to your followers, please.',
    guidelines => null, niches => '{fashion}', states => '{Lagos}', verified_only => false,
    price_kobo => 5000000, places => 2, applications_close_on => public.lagos_today() + 10,
    post_from => null, deliver_by => public.lagos_today() + 20,
    platforms => '[{"platform": "instagram", "min_followers": null}]',
    deliverables => '[{"platform": "instagram", "kind": "reel", "quantity": 1}]'), null,
  'saves a draft');
update public.campaigns set post_from = public.lagos_today() + 12, ends_on = deliver_by + 10
 where title = 'Bo draft'; -- fixture: a new campaign needs a timeline (campaign_timeline migration)
select is(public.transition_campaign((select id from public.campaigns where title = 'Bo draft'), 'submit')::text,
  'pending_review', 'and sends it for listing');

set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f1900"}'; -- Zo
select isnt(public.approve_payout((select id from public.payouts where amount_kobo = 1000000
    and user_id = '00000000-0000-0000-0000-0000000f1101')), null,
  'an admin approves a payout with no screening at all');
reset role;
select is((select count(*)::int from public.screenings where user_id = '00000000-0000-0000-0000-0000000f1101'), 0,
  'and nobody was screened');

-- Only an admin flips it; the table is closed ------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f1001"}'; -- Bo
select throws_ok($$ select public.set_identity_checks_required(true) $$,
  'P0001', 'not_allowed', 'a business cannot switch identity checks on');
set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f1101"}'; -- Cy
select throws_ok($$ select public.set_identity_checks_required(true) $$,
  'P0001', 'not_allowed', 'nor can a creator');
select throws_ok($$ select checks_required from public.identity_settings $$,
  '42501', null, 'clients cannot read the settings table directly');
select is(public.identity_checks_required(), false, 'but anyone signed in can ask whether checks are on');
reset role;
set local role anon;
select throws_ok($$ select public.set_identity_checks_required(true) $$,
  '42501', null, 'anonymous callers cannot reach the setter');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f1900"}'; -- Zo
select is(public.set_identity_checks_required(true), true, 'an admin switches identity checks on');
reset role;
select is((select updated_by from public.identity_settings), '00000000-0000-0000-0000-0000000f1900'::uuid,
  'and who did it is recorded');

-- On again: the gates are back ---------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f1101"}'; -- Cy
select throws_ok($$ select public.apply_to_campaign('f1000000-0000-0000-0000-000000000002', null, 'Me again') $$,
  'P0001', 'identity_required', 'once on, the unverified creator cannot apply');
select throws_ok($$ select public.request_payout(1020000) $$,
  'P0001', 'identity_required', 'nor request a payout');
set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f1900"}'; -- Zo
select throws_ok($$ select public.approve_payout((select id from public.payouts where amount_kobo = 1010000
    and user_id = '00000000-0000-0000-0000-0000000f1101')) $$,
  'P0001', 'screening_hold', 'a payout requested while off now waits for a screening');
reset role;
select is((select status from public.payouts where amount_kobo = 1000000
    and user_id = '00000000-0000-0000-0000-0000000f1101'), 'processing',
  'and the payout approved while off is untouched');

select * from finish();
rollback;
