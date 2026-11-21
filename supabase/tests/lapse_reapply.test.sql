-- Proves that a hire which isn't paid in time reads as lapsed everywhere the
-- moment its deadline passes (not when the daily job runs), frees its place,
-- and lets the creator apply again and be hired again. Also that a creator
-- with a live hire, a withdrawn or a passed-over application still can't.
-- Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(48);

-- Ada is a business. Chidi, Dayo, Femi, Gita and Hana are listed creators.
insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000d3001', 'dddddddd-0000-0000-0000-0000000d3001', 'ada.lapse@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000d3002', 'dddddddd-0000-0000-0000-0000000d3002', 'chidi.lapse@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000d3003', 'dddddddd-0000-0000-0000-0000000d3003', 'dayo.lapse@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000d3004', 'dddddddd-0000-0000-0000-0000000d3004', 'femi.lapse@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000d3005', 'dddddddd-0000-0000-0000-0000000d3005', 'gita.lapse@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000d3006', 'dddddddd-0000-0000-0000-0000000d3006', 'hana.lapse@example.com', 'influencer');

-- Identity fixtures: the people made above count as verified, so the identity
-- gates (identity_gates migration) are not what this file is about.
insert into public.identity_checks (user_id, kind, status, reference, legal_name_entered, legal_name_on_record,
                                    id_last3, id_fingerprint, counted, decided_at)
select u.id, case u.role when 'influencer' then 'creator_nin' else 'owner_bvn' end, 'verified',
       'pit_id_fx_' || replace(u.id::text, '-', ''), 'Fixture Person', 'FIXTURE PERSON', '000',
       'v1:fx-' || u.id::text, true, now()
  from public.users u
 where u.created_at = now() and u.role in ('influencer', 'business')
   and not exists (select 1 from public.identity_checks c where c.user_id = u.id);

insert into public.business_profiles (user_id, business_name, contact_name, state, city) values
  ('00000000-0000-0000-0000-0000000d3001', 'Ada Lapse Test', 'Ada Obi', 'Lagos', 'Ikeja');

insert into public.influencer_profiles (user_id, display_name, state, city, niches, published) values
  ('00000000-0000-0000-0000-0000000d3002', 'Chidi Lapse Test', 'Lagos', 'Yaba', '{fashion}', true),
  ('00000000-0000-0000-0000-0000000d3003', 'Dayo Lapse Test', 'Lagos', 'Yaba', '{fashion}', true),
  ('00000000-0000-0000-0000-0000000d3004', 'Femi Lapse Test', 'Lagos', 'Yaba', '{fashion}', true),
  ('00000000-0000-0000-0000-0000000d3005', 'Gita Lapse Test', 'Lagos', 'Yaba', '{fashion}', true),
  ('00000000-0000-0000-0000-0000000d3006', 'Hana Lapse Test', 'Lagos', 'Yaba', '{fashion}', true);

insert into public.influencer_platforms (user_id, platform, handle, follower_range) values
  ('00000000-0000-0000-0000-0000000d3002', 'instagram', 'chidi.lapsetest', '1k_5k'),
  ('00000000-0000-0000-0000-0000000d3003', 'instagram', 'dayo.lapsetest', '1k_5k'),
  ('00000000-0000-0000-0000-0000000d3004', 'instagram', 'femi.lapsetest', '1k_5k'),
  ('00000000-0000-0000-0000-0000000d3005', 'instagram', 'gita.lapsetest', '1k_5k'),
  ('00000000-0000-0000-0000-0000000d3006', 'instagram', 'hana.lapsetest', '1k_5k');

-- K1 has ONE place, so a lapsed hire still holding it would block everyone.
-- K2 has two places. ₦25,000 each.
insert into public.campaigns (id, business_id, status, title, brief, price_kobo, places,
                              applications_close_on, deliver_by, published_at) values
  ('d3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000d3001', 'open', 'K1 lapse test',
   'A brief that is long enough for the checks.', 2500000, 1, public.lagos_today() + 10, public.lagos_today() + 20, now()),
  ('d3000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000d3001', 'open', 'K2 lapse test',
   'A brief that is long enough for the checks.', 2500000, 2, public.lagos_today() + 10, public.lagos_today() + 20, now());

insert into public.campaign_platforms (campaign_id, platform, min_followers) values
  ('d3000000-0000-0000-0000-000000000001', 'instagram', null),
  ('d3000000-0000-0000-0000-000000000002', 'instagram', null);

set local role authenticated;

-- Chidi applies to K1 and Ada hires her (a 48-hour clock starts).
set local request.jwt.claims = '{"sub": "dddddddd-0000-0000-0000-0000000d3002"}';
select isnt(public.apply_to_campaign('d3000000-0000-0000-0000-000000000001', null, 'First try'), null,
  'Chidi applies to K1');
set local request.jwt.claims = '{"sub": "dddddddd-0000-0000-0000-0000000d3001"}';
select isnt(public.approve_application(
  (select a.id from public.applications a where a.campaign_id = 'd3000000-0000-0000-0000-000000000001'
      and a.creator_id = '00000000-0000-0000-0000-0000000d3002'), 2500000), null,
  'Ada hires Chidi');

-- Before the deadline: nothing is lapsed, and the hire holds the only place.
set local request.jwt.claims = '{"sub": "dddddddd-0000-0000-0000-0000000d3002"}';
select is(
  (select e->'engagement'->>'status' from jsonb_array_elements(public.my_applications()) e
    where e->'campaign'->>'id' = 'd3000000-0000-0000-0000-000000000001'),
  'awaiting_payment', 'before the deadline Chidi sees the hire waiting for payment');
select throws_ok($$ select public.apply_to_campaign('d3000000-0000-0000-0000-000000000001', null, 'x') $$,
  'P0001', null, 'a live hire blocks re-applying (the only place is held)');

-- The deadline passes. The daily job has NOT run.
reset role;
update public.engagements set pay_by = now() - interval '1 hour'
 where campaign_id = 'd3000000-0000-0000-0000-000000000001';
select is((select status::text from public.engagements where campaign_id = 'd3000000-0000-0000-0000-000000000001'),
  'awaiting_payment', 'the stored status still lags: the daily job has not run');
set local role authenticated;

-- Everyone reads it as lapsed straight away.
set local request.jwt.claims = '{"sub": "dddddddd-0000-0000-0000-0000000d3002"}';
select is(
  (select e->'engagement'->>'status' || ':' || (e->'engagement'->>'cancel_reason')
     from jsonb_array_elements(public.my_applications()) e
    where e->'campaign'->>'id' = 'd3000000-0000-0000-0000-000000000001'),
  'cancelled:payment_expired', 'the creator sees the hire as lapsed once the deadline passes');
set local request.jwt.claims = '{"sub": "dddddddd-0000-0000-0000-0000000d3001"}';
select is(
  (select e->'engagement'->>'status'
     from jsonb_array_elements(public.campaign_applications('d3000000-0000-0000-0000-000000000001')) e
    where e->'creator'->>'id' = '00000000-0000-0000-0000-0000000d3002'),
  'cancelled', 'the business sees it as lapsed too (no more Pay link)');
select is(
  public.engagement_details((select x.id from public.engagements x
     where x.campaign_id = 'd3000000-0000-0000-0000-000000000001'))->>'status',
  'cancelled', 'the pay page data agrees');

-- Applying again: allowed, frees the lapsed place, reuses the same application.
set local request.jwt.claims = '{"sub": "dddddddd-0000-0000-0000-0000000d3002"}';
select is(
  public.apply_to_campaign('d3000000-0000-0000-0000-000000000001', 3000000, 'Second try'),
  (select a.id from public.applications a where a.campaign_id = 'd3000000-0000-0000-0000-000000000001'
      and a.creator_id = '00000000-0000-0000-0000-0000000d3002'),
  'Chidi applies again and gets her same application back');
reset role;
select is((select status::text from public.applications
   where campaign_id = 'd3000000-0000-0000-0000-000000000001'
     and creator_id = '00000000-0000-0000-0000-0000000d3002'),
  'submitted', 'the application is waiting for a decision again');
select is((select (proposed_price_kobo::text || '|' || note) from public.applications
   where campaign_id = 'd3000000-0000-0000-0000-000000000001'
     and creator_id = '00000000-0000-0000-0000-0000000d3002'),
  '3000000|Second try', 'the new price and note replaced the old ones');
select is((select status::text || ':' || cancel_reason from public.engagements
   where campaign_id = 'd3000000-0000-0000-0000-000000000001'),
  'cancelled:payment_expired', 'applying again made the lapse official and freed the place');
select is((select count(*)::int from public.notifications n
   where n.user_id = '00000000-0000-0000-0000-0000000d3001' and n.kind = 'application_received'
     and n.data->>'campaign_id' = 'd3000000-0000-0000-0000-000000000001'
     and n.data->>'name' = 'Chidi Lapse Test'),
  2, 'Ada is told about the second application too (the first notice stays)');
set local role authenticated;

-- Hired again: a second engagement for the same application is allowed.
set local request.jwt.claims = '{"sub": "dddddddd-0000-0000-0000-0000000d3001"}';
select isnt(public.approve_application(
  (select a.id from public.applications a where a.campaign_id = 'd3000000-0000-0000-0000-000000000001'
      and a.creator_id = '00000000-0000-0000-0000-0000000d3002'), 3000000), null,
  'Ada hires Chidi again at the new price');
reset role;
select is((select count(*)::int from public.engagements where campaign_id = 'd3000000-0000-0000-0000-000000000001'),
  2, 'the lapsed hire is kept as history beside the new one');
select throws_ok($$
  insert into public.engagements (application_id, campaign_id, business_id, creator_id, agreed_price_kobo, pay_by)
  select a.id, a.campaign_id, k.business_id, a.creator_id, 3000000, now() + interval '48 hours'
    from public.applications a join public.campaigns k on k.id = a.campaign_id
   where a.campaign_id = 'd3000000-0000-0000-0000-000000000001'
     and a.creator_id = '00000000-0000-0000-0000-0000000d3002'
$$, '23505', null, 'an application still can''t have two live hires');
set local role authenticated;

-- One row per application, showing the latest hire (not a duplicate per hire).
set local request.jwt.claims = '{"sub": "dddddddd-0000-0000-0000-0000000d3002"}';
select is(
  (select count(*)::int from jsonb_array_elements(public.my_applications()) e
    where e->'campaign'->>'id' = 'd3000000-0000-0000-0000-000000000001'),
  1, 'my_applications lists the application once');
select is(
  (select e->'engagement'->>'status' from jsonb_array_elements(public.my_applications()) e
    where e->'campaign'->>'id' = 'd3000000-0000-0000-0000-000000000001'),
  'awaiting_payment', 'and shows the newest hire');
set local request.jwt.claims = '{"sub": "dddddddd-0000-0000-0000-0000000d3001"}';
select is(
  (select count(*)::int from jsonb_array_elements(public.campaign_applications('d3000000-0000-0000-0000-000000000001')) e
    where e->'creator'->>'id' = '00000000-0000-0000-0000-0000000d3002'),
  1, 'campaign_applications lists the application once');

-- A payment in flight keeps the hire alive past its deadline.
set local request.jwt.claims = '{"sub": "dddddddd-0000-0000-0000-0000000d3003"}';
select isnt(public.apply_to_campaign('d3000000-0000-0000-0000-000000000002', null, null), null, 'Dayo applies to K2');
set local request.jwt.claims = '{"sub": "dddddddd-0000-0000-0000-0000000d3001"}';
select isnt(public.approve_application(
  (select a.id from public.applications a where a.campaign_id = 'd3000000-0000-0000-0000-000000000002'
      and a.creator_id = '00000000-0000-0000-0000-0000000d3003'), 2500000), null, 'Ada hires Dayo');
select isnt(public.start_payment(
  (select x.id from public.engagements x where x.campaign_id = 'd3000000-0000-0000-0000-000000000002'), true),
  null, 'Ada starts paying for Dayo''s hire');
reset role;
update public.engagements set pay_by = now() - interval '1 minute'
 where campaign_id = 'd3000000-0000-0000-0000-000000000002';
set local role authenticated;
set local request.jwt.claims = '{"sub": "dddddddd-0000-0000-0000-0000000d3003"}';
select is(
  (select e->'engagement'->>'status' from jsonb_array_elements(public.my_applications()) e
    where e->'campaign'->>'id' = 'd3000000-0000-0000-0000-000000000002'),
  'awaiting_payment', 'a payment started in the last 30 minutes holds the hire past its deadline');

-- Passed over or withdrawn creators still can't come back.
set local request.jwt.claims = '{"sub": "dddddddd-0000-0000-0000-0000000d3004"}';
select isnt(public.apply_to_campaign('d3000000-0000-0000-0000-000000000002', null, null), null, 'Femi applies to K2');
select lives_ok($$ select public.withdraw_application(
  (select a.id from public.applications a where a.campaign_id = 'd3000000-0000-0000-0000-000000000002'
      and a.creator_id = '00000000-0000-0000-0000-0000000d3004')) $$, 'Femi withdraws');
select throws_ok($$ select public.apply_to_campaign('d3000000-0000-0000-0000-000000000002', null, null) $$,
  'P0001', 'already_applied', 'a withdrawn application can''t be reopened');

-- The business side: a hire that ended unpaid is back in front of the business ----------
-- Gita applies to K2 and is hired; her deadline passes.
set local request.jwt.claims = '{"sub": "dddddddd-0000-0000-0000-0000000d3005"}';
select isnt(public.apply_to_campaign('d3000000-0000-0000-0000-000000000002', null, null), null, 'Gita applies to K2');
set local request.jwt.claims = '{"sub": "dddddddd-0000-0000-0000-0000000d3001"}';
select isnt(public.approve_application(
  (select a.id from public.applications a where a.campaign_id = 'd3000000-0000-0000-0000-000000000002'
      and a.creator_id = '00000000-0000-0000-0000-0000000d3005'), 2500000), null, 'Ada hires Gita');
reset role;
update public.engagements set pay_by = now() - interval '1 hour'
 where campaign_id = 'd3000000-0000-0000-0000-000000000002'
   and creator_id = '00000000-0000-0000-0000-0000000d3005';

select is(public.hire_ended_unpaid((select a.id from public.applications a
   where a.campaign_id = 'd3000000-0000-0000-0000-000000000002' and a.creator_id = '00000000-0000-0000-0000-0000000d3005')),
  true, 'a hire past its deadline with no payment under way has ended unpaid');
select is(public.hire_ended_unpaid((select a.id from public.applications a
   where a.campaign_id = 'd3000000-0000-0000-0000-000000000002' and a.creator_id = '00000000-0000-0000-0000-0000000d3003')),
  false, 'not while a payment started in the last 30 minutes holds it');
select is(public.hire_ended_unpaid((select a.id from public.applications a
   where a.campaign_id = 'd3000000-0000-0000-0000-000000000001' and a.creator_id = '00000000-0000-0000-0000-0000000d3002')),
  false, 'and not for a live hire');
set local role authenticated;

set local request.jwt.claims = '{"sub": "dddddddd-0000-0000-0000-0000000d3001"}';
select is((select c.waiting from public.campaign_application_counts() c where c.campaign_id = 'd3000000-0000-0000-0000-000000000002'),
  1, 'Gita counts as waiting for Ada''s decision again (Dayo''s live hire and Femi''s withdrawal do not)');
select is((select c.waiting from public.campaign_application_counts() c where c.campaign_id = 'd3000000-0000-0000-0000-000000000001'),
  0, 'a campaign whose only hire is live has nobody waiting');
select throws_ok($$ select public.approve_application(
  (select a.id from public.applications a where a.campaign_id = 'd3000000-0000-0000-0000-000000000002'
      and a.creator_id = '00000000-0000-0000-0000-0000000d3003'), 2500000) $$,
  'P0001', 'application_locked', 'a hire a payment is still holding can''t be hired again');
select throws_ok($$ select public.decide_application(
  (select a.id from public.applications a where a.campaign_id = 'd3000000-0000-0000-0000-000000000002'
      and a.creator_id = '00000000-0000-0000-0000-0000000d3003'), 'rejected', null) $$,
  'P0001', 'application_locked', 'nor passed over');

-- Ada passes on Gita.
select lives_ok($$ select public.decide_application(
  (select a.id from public.applications a where a.campaign_id = 'd3000000-0000-0000-0000-000000000002'
      and a.creator_id = '00000000-0000-0000-0000-0000000d3005'), 'rejected', 'Not this time') $$,
  'Ada passes on a creator whose hire lapsed');
reset role;
select is((select status::text from public.applications where campaign_id = 'd3000000-0000-0000-0000-000000000002'
    and creator_id = '00000000-0000-0000-0000-0000000d3005'), 'rejected', 'and the application is closed');
select is((select count(*)::int from public.notifications n
   where n.user_id = '00000000-0000-0000-0000-0000000d3005' and n.kind = 'application_passed'),
  1, 'Gita is told');
set local role authenticated;

-- Hana is hired, her deadline passes, and Ada hires her again.
set local request.jwt.claims = '{"sub": "dddddddd-0000-0000-0000-0000000d3006"}';
select isnt(public.apply_to_campaign('d3000000-0000-0000-0000-000000000002', null, null), null, 'Hana applies to K2');
set local request.jwt.claims = '{"sub": "dddddddd-0000-0000-0000-0000000d3001"}';
select isnt(public.approve_application(
  (select a.id from public.applications a where a.campaign_id = 'd3000000-0000-0000-0000-000000000002'
      and a.creator_id = '00000000-0000-0000-0000-0000000d3006'), 2500000), null, 'Ada hires Hana');
reset role;
update public.engagements set pay_by = now() - interval '1 hour'
 where campaign_id = 'd3000000-0000-0000-0000-000000000002'
   and creator_id = '00000000-0000-0000-0000-0000000d3006';
select is(public.hire_ended_unpaid((select a.id from public.applications a
   where a.campaign_id = 'd3000000-0000-0000-0000-000000000002' and a.creator_id = '00000000-0000-0000-0000-0000000d3006')),
  true, 'Hana''s hire ended unpaid');
set local role authenticated;
set local request.jwt.claims = '{"sub": "dddddddd-0000-0000-0000-0000000d3001"}';
select isnt(public.approve_application(
  (select a.id from public.applications a where a.campaign_id = 'd3000000-0000-0000-0000-000000000002'
      and a.creator_id = '00000000-0000-0000-0000-0000000d3006'), 2500000), null,
  'Ada hires Hana again, straight from the business side');
reset role;
select is((select count(*)::int from public.engagements e join public.applications a on a.id = e.application_id
   where a.campaign_id = 'd3000000-0000-0000-0000-000000000002' and a.creator_id = '00000000-0000-0000-0000-0000000d3006'),
  2, 'the lapsed hire is kept beside the new one');
select is((select count(*)::int from public.engagements e join public.applications a on a.id = e.application_id
   where a.campaign_id = 'd3000000-0000-0000-0000-000000000002' and a.creator_id = '00000000-0000-0000-0000-0000000d3006'
     and e.status <> 'cancelled' and e.pay_by > now()),
  1, 'with exactly one live');
select is((select status::text from public.applications where campaign_id = 'd3000000-0000-0000-0000-000000000002'
    and creator_id = '00000000-0000-0000-0000-0000000d3006'), 'approved', 'the application stays approved');
select is((select count(*)::int from public.notifications n
   where n.user_id = '00000000-0000-0000-0000-0000000d3006' and n.kind = 'application_hired'),
  2, 'Hana is told she is hired again');
select is(public.hire_ended_unpaid((select a.id from public.applications a
   where a.campaign_id = 'd3000000-0000-0000-0000-000000000002' and a.creator_id = '00000000-0000-0000-0000-0000000d3006')),
  false, 'and the new hire is live, so it has not ended');
set local role authenticated;
set local request.jwt.claims = '{"sub": "dddddddd-0000-0000-0000-0000000d3006"}';
select is(
  (select e->'engagement'->>'status' from jsonb_array_elements(public.my_applications()) e
    where e->'campaign'->>'id' = 'd3000000-0000-0000-0000-000000000002'),
  'awaiting_payment', 'Hana sees the new hire waiting for payment');

select * from finish();
rollback;
