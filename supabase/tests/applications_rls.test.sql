-- Proves the rules from the create_applications migration: who can apply,
-- reviewing and approving without ever over-filling a campaign, frozen
-- prices, lapsing, blocks and standing, and that enforcement leaves
-- applications and engagements alone. Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(52);

-- Ada and Bola are businesses; Chidi, Dayo and Gbenga are listed creators;
-- Femi is a creator with an unpublished profile; Efe is an admin.
insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000a5001', 'eeeeeeee-0000-0000-0000-000000000001', 'ada.app@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000a5002', 'eeeeeeee-0000-0000-0000-000000000002', 'bola.app@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000a5003', 'eeeeeeee-0000-0000-0000-000000000003', 'chidi.app@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000a5004', 'eeeeeeee-0000-0000-0000-000000000004', 'dayo.app@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000a5005', 'eeeeeeee-0000-0000-0000-000000000005', 'femi.app@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000a5006', 'eeeeeeee-0000-0000-0000-000000000006', 'gbenga.app@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000a5007', 'eeeeeeee-0000-0000-0000-000000000007', 'efe.app@example.com', 'admin');

insert into public.business_profiles (user_id, business_name, contact_name, state, city) values
  ('00000000-0000-0000-0000-0000000a5001', 'Ada Apply Test', 'Ada Obi', 'Lagos', 'Ikeja'),
  ('00000000-0000-0000-0000-0000000a5002', 'Bola Apply Test', 'Bola A', 'Oyo', 'Ibadan');

insert into public.influencer_profiles (user_id, display_name, state, city, niches, published) values
  ('00000000-0000-0000-0000-0000000a5003', 'Chidi Apply Test', 'Lagos', 'Yaba', '{fashion}', true),
  ('00000000-0000-0000-0000-0000000a5004', 'Dayo Apply Test', 'Oyo', 'Ibadan', '{fashion}', true),
  ('00000000-0000-0000-0000-0000000a5005', 'Femi Apply Test', 'Oyo', 'Ibadan', '{fashion}', false),
  ('00000000-0000-0000-0000-0000000a5006', 'Gbenga Apply Test', 'Kano', 'Kano', '{fashion}', true);

insert into public.influencer_platforms (user_id, platform, handle, follower_range) values
  ('00000000-0000-0000-0000-0000000a5003', 'instagram', 'chidi.applytest', '10k_50k'),
  ('00000000-0000-0000-0000-0000000a5004', 'instagram', 'dayo.applytest', '1k_5k'),
  ('00000000-0000-0000-0000-0000000a5005', 'instagram', 'femi.applytest', '1k_5k'),
  ('00000000-0000-0000-0000-0000000a5006', 'instagram', 'gbenga.applytest', '1k_5k');

-- Ada's K1 (1 place) and K2 (2 places); Bola's K3 (3 places). ₦50,000 each.
insert into public.campaigns (id, business_id, status, title, brief, price_kobo, places,
                              applications_close_on, deliver_by, published_at) values
  ('c5000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000a5001', 'open', 'K1 apply test',
   'A brief that is long enough for the checks.', 5000000, 1, public.lagos_today() + 10, public.lagos_today() + 20, now()),
  ('c5000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000a5001', 'open', 'K2 apply test',
   'A brief that is long enough for the checks.', 5000000, 2, public.lagos_today() + 10, public.lagos_today() + 20, now()),
  ('c5000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000a5002', 'open', 'K3 apply test',
   'A brief that is long enough for the checks.', 5000000, 3, public.lagos_today() + 10, public.lagos_today() + 20, now());

insert into public.campaign_platforms (campaign_id, platform, min_followers) values
  ('c5000000-0000-0000-0000-000000000001', 'instagram', null),
  ('c5000000-0000-0000-0000-000000000002', 'instagram', null),
  ('c5000000-0000-0000-0000-000000000003', 'instagram', null);

set local role authenticated;

-- Applying ------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "eeeeeeee-0000-0000-0000-000000000003"}'; -- Chidi
select isnt(public.apply_to_campaign('c5000000-0000-0000-0000-000000000001', null, 'I love your brand'), null,
  'Chidi applies at the campaign price');
select throws_ok($$ select public.apply_to_campaign('c5000000-0000-0000-0000-000000000001', null, null) $$,
  'P0001', 'already_applied', 'one application per creator per campaign');

set local request.jwt.claims = '{"sub": "eeeeeeee-0000-0000-0000-000000000004"}'; -- Dayo
select throws_ok($$ select public.apply_to_campaign('c5000000-0000-0000-0000-000000000001', 450000, null) $$,
  'P0001', 'price_invalid', 'a proposal under ₦5,000 is refused');
select throws_ok($$ select public.apply_to_campaign('c5000000-0000-0000-0000-000000000001', 600050, null) $$,
  'P0001', 'price_invalid', 'a proposal must be whole naira');
select isnt(public.apply_to_campaign('c5000000-0000-0000-0000-000000000001', 6000000, null), null,
  'Dayo proposes ₦60,000');
select lives_ok($$
  select public.edit_application(
    (select id from public.applications where campaign_id = 'c5000000-0000-0000-0000-000000000001'),
    6500000, 'Two reels for ₦65,000')
$$, 'Dayo edits his proposal before a decision');

set local request.jwt.claims = '{"sub": "eeeeeeee-0000-0000-0000-000000000005"}'; -- Femi
select throws_ok($$ select public.apply_to_campaign('c5000000-0000-0000-0000-000000000001', null, null) $$,
  'P0001', 'profile_not_listed', 'an unpublished profile cannot apply');

set local request.jwt.claims = '{"sub": "eeeeeeee-0000-0000-0000-000000000001"}'; -- Ada
select throws_ok($$ select public.apply_to_campaign('c5000000-0000-0000-0000-000000000003', null, null) $$,
  '42501', null, 'businesses do not apply');

-- Who sees what ----------------------------------------------------------------------------
select is((select count(*)::integer from public.applications), 2, 'Ada sees the applications on her campaign');
select is(jsonb_array_length(public.campaign_applications('c5000000-0000-0000-0000-000000000001')), 2,
  'with each creator''s details');

set local request.jwt.claims = '{"sub": "eeeeeeee-0000-0000-0000-000000000002"}'; -- Bola
select is((select count(*)::integer from public.applications), 0, 'Bola sees none of them');
select throws_ok($$ select public.campaign_applications('c5000000-0000-0000-0000-000000000001') $$,
  'P0001', 'no_such_campaign', 'nor the details');
select throws_ok($$
  select public.decide_application(
    (select id from public.applications limit 1), 'rejected', null)
$$, 'P0001', 'no_such_application', 'nor can he decide on them');

set local request.jwt.claims = '{"sub": "eeeeeeee-0000-0000-0000-000000000003"}'; -- Chidi
select is((select count(*)::integer from public.applications), 1, 'Chidi sees only his own');
select is(jsonb_array_length(public.my_applications()), 1, 'and lists it');
select throws_ok($$
  select public.edit_application(
    (select id from public.applications where creator_id <> public.current_user_id() limit 1), 7000000, null)
$$, 'P0001', 'no_such_application', 'he cannot edit Dayo''s');

set local request.jwt.claims = '{"sub": "eeeeeeee-0000-0000-0000-000000000007"}'; -- Efe
select is((select count(*)::integer from public.applications), 2, 'admins see all');

-- Reviewing and approving K1 (1 place) ----------------------------------------------------------
set local request.jwt.claims = '{"sub": "eeeeeeee-0000-0000-0000-000000000001"}'; -- Ada
select lives_ok($$
  select public.decide_application(
    (select id from public.applications where creator_id = '00000000-0000-0000-0000-0000000a5003'
       and campaign_id = 'c5000000-0000-0000-0000-000000000001'), 'shortlisted', null)
$$, 'Ada shortlists Chidi');
select throws_ok($$
  select public.approve_application(
    (select id from public.applications where creator_id = '00000000-0000-0000-0000-0000000a5004'
       and campaign_id = 'c5000000-0000-0000-0000-000000000001'), 6000000)
$$, 'P0001', 'price_changed', 'approving a price that has since changed is refused');
select isnt(public.approve_application(
    (select id from public.applications where creator_id = '00000000-0000-0000-0000-0000000a5003'
       and campaign_id = 'c5000000-0000-0000-0000-000000000001'), 5000000), null,
  'Ada approves Chidi at the campaign price');
select is((select status::text from public.engagements
            where creator_id = '00000000-0000-0000-0000-0000000a5003'
              and campaign_id = 'c5000000-0000-0000-0000-000000000001'),
  'awaiting_payment', 'an engagement waits for payment');
select ok((select pay_by between now() + interval '47 hours' and now() + interval '49 hours'
             from public.engagements where campaign_id = 'c5000000-0000-0000-0000-000000000001'),
  'for 48 hours');
select is((select status::text from public.applications
            where creator_id = '00000000-0000-0000-0000-0000000a5003'
              and campaign_id = 'c5000000-0000-0000-0000-000000000001'),
  'approved', 'and the application is approved');
select throws_ok($$
  select public.approve_application(
    (select id from public.applications where creator_id = '00000000-0000-0000-0000-0000000a5004'
       and campaign_id = 'c5000000-0000-0000-0000-000000000001'), 6500000)
$$, 'P0001', 'campaign_full', 'a second approval never over-fills the campaign');

set local request.jwt.claims = '{"sub": "eeeeeeee-0000-0000-0000-000000000006"}'; -- Gbenga
select throws_ok($$ select public.apply_to_campaign('c5000000-0000-0000-0000-000000000001', null, null) $$,
  'P0001', 'campaign_full', 'nobody applies to a full campaign');
select is((select count(*)::integer from public.list_open_campaigns()
            where campaign ->> 'id' = 'c5000000-0000-0000-0000-000000000001'), 0,
  'and it is no longer listed');

set local request.jwt.claims = '{"sub": "eeeeeeee-0000-0000-0000-000000000003"}'; -- Chidi
select throws_ok($$
  select public.withdraw_application(
    (select id from public.applications where campaign_id = 'c5000000-0000-0000-0000-000000000001'))
$$, 'P0001', 'application_locked', 'an approved application cannot be withdrawn');
select is((select count(*)::integer from public.engagements), 1, 'Chidi sees his engagement');

set local request.jwt.claims = '{"sub": "eeeeeeee-0000-0000-0000-000000000002"}'; -- Bola
select is((select count(*)::integer from public.engagements), 0, 'Bola sees none');

-- Lapsing ---------------------------------------------------------------------------------------------
reset role;
update public.engagements set pay_by = now() - interval '1 minute'
 where campaign_id = 'c5000000-0000-0000-0000-000000000001';
select is(public.expire_unpaid_engagements(), 1, 'an unpaid approval lapses');
select is(public.expire_unpaid_engagements(), 0, 'running it again changes nothing');
select is((select cancel_reason from public.engagements where campaign_id = 'c5000000-0000-0000-0000-000000000001'),
  'payment_expired', 'with the reason recorded');
select is(public.held_places('c5000000-0000-0000-0000-000000000001'), 0, 'and the place is free');

set local role authenticated;
set local request.jwt.claims = '{"sub": "eeeeeeee-0000-0000-0000-000000000001"}'; -- Ada
select isnt(public.approve_application(
    (select id from public.applications where creator_id = '00000000-0000-0000-0000-0000000a5004'
       and campaign_id = 'c5000000-0000-0000-0000-000000000001'), 6500000), null,
  'Ada approves Dayo at his price once the place is free');
select lives_ok($$
  select public.cancel_engagement(
    (select id from public.engagements where creator_id = '00000000-0000-0000-0000-0000000a5004'))
$$, 'Ada cancels before paying');
select throws_ok($$
  select public.cancel_engagement(
    (select id from public.engagements where creator_id = '00000000-0000-0000-0000-0000000a5004'))
$$, 'P0001', 'engagement_locked', 'cancelling twice is refused');

-- Places can't drop below those held (K2, 2 places) -----------------------------------------------------
set local request.jwt.claims = '{"sub": "eeeeeeee-0000-0000-0000-000000000003"}';
select isnt(public.apply_to_campaign('c5000000-0000-0000-0000-000000000002', null, null), null, 'Chidi applies to K2');
set local request.jwt.claims = '{"sub": "eeeeeeee-0000-0000-0000-000000000004"}';
select isnt(public.apply_to_campaign('c5000000-0000-0000-0000-000000000002', null, null), null, 'Dayo applies to K2');
set local request.jwt.claims = '{"sub": "eeeeeeee-0000-0000-0000-000000000001"}';
select isnt(public.approve_application(
    (select id from public.applications where creator_id = '00000000-0000-0000-0000-0000000a5003'
       and campaign_id = 'c5000000-0000-0000-0000-000000000002'), 5000000), null, 'Ada approves Chidi on K2');
select isnt(public.approve_application(
    (select id from public.applications where creator_id = '00000000-0000-0000-0000-0000000a5004'
       and campaign_id = 'c5000000-0000-0000-0000-000000000002'), 5000000), null, 'and Dayo');
select throws_ok($$ update public.campaigns set places = 1 where id = 'c5000000-0000-0000-0000-000000000002' $$,
  'P0001', 'places_below_held', 'places cannot drop below the creators already approved');

-- Standing: a paused business can still cancel, not approve ----------------------------------------------
reset role;
update public.users set messaging_restricted_until = now() + interval '1 day'
 where id = '00000000-0000-0000-0000-0000000a5001';
set local role authenticated;
set local request.jwt.claims = '{"sub": "eeeeeeee-0000-0000-0000-000000000001"}';
select lives_ok($$
  select public.cancel_engagement(
    (select id from public.engagements where creator_id = '00000000-0000-0000-0000-0000000a5003'
       and campaign_id = 'c5000000-0000-0000-0000-000000000002'))
$$, 'a paused business can still end an unpaid hire');
set local request.jwt.claims = '{"sub": "eeeeeeee-0000-0000-0000-000000000006"}';
select isnt(public.apply_to_campaign('c5000000-0000-0000-0000-000000000002', null, null), null, 'Gbenga applies to K2');
set local request.jwt.claims = '{"sub": "eeeeeeee-0000-0000-0000-000000000001"}';
select throws_ok($$
  select public.approve_application(
    (select id from public.applications where creator_id = '00000000-0000-0000-0000-0000000a5006'), 5000000)
$$, 'P0001', 'activity_paused', 'but cannot approve anyone new');

-- Blocks (K3 is Bola's) ----------------------------------------------------------------------------------------
reset role;
insert into public.user_blocks (blocker_id, blocked_id)
values ('00000000-0000-0000-0000-0000000a5003', '00000000-0000-0000-0000-0000000a5002');
set local role authenticated;
set local request.jwt.claims = '{"sub": "eeeeeeee-0000-0000-0000-000000000003"}';
select throws_ok($$ select public.apply_to_campaign('c5000000-0000-0000-0000-000000000003', null, null) $$,
  'P0001', 'not_allowed', 'Chidi cannot apply to someone he blocked');

set local request.jwt.claims = '{"sub": "eeeeeeee-0000-0000-0000-000000000004"}';
select isnt(public.apply_to_campaign('c5000000-0000-0000-0000-000000000003', null, null), null, 'Dayo applies to K3');
reset role;
insert into public.user_blocks (blocker_id, blocked_id)
values ('00000000-0000-0000-0000-0000000a5004', '00000000-0000-0000-0000-0000000a5002');
set local role authenticated;
set local request.jwt.claims = '{"sub": "eeeeeeee-0000-0000-0000-000000000002"}';
select throws_ok($$
  select public.approve_application(
    (select id from public.applications where campaign_id = 'c5000000-0000-0000-0000-000000000003'), 5000000)
$$, 'P0001', 'not_allowed', 'Bola cannot approve a creator who blocked him');
select is((select status::text from public.applications where campaign_id = 'c5000000-0000-0000-0000-000000000003'),
  'submitted', 'and the application itself is unchanged');

-- Suspension hides, and changes nothing ---------------------------------------------------------------------------
reset role;
update public.users set suspended_at = now() where id in ('00000000-0000-0000-0000-0000000a5002', '00000000-0000-0000-0000-0000000a5006');
select is((select count(*)::integer from public.listed_creators where user_id = '00000000-0000-0000-0000-0000000a5006'), 0,
  'a suspended creator leaves the directory');
select is((select status::text from public.campaigns where id = 'c5000000-0000-0000-0000-000000000003'), 'open',
  'a suspended business''s campaign keeps its status');
set local role authenticated;
set local request.jwt.claims = '{"sub": "eeeeeeee-0000-0000-0000-000000000004"}';
select is((select count(*)::integer from public.list_open_campaigns()
            where campaign ->> 'id' = 'c5000000-0000-0000-0000-000000000003'), 0,
  'but is no longer listed');

-- Strikes never touch engagements ---------------------------------------------------------------------------------
reset role;
select is(
  (with before as (select array_agg(status::text order by id) s from public.engagements),
        strikes as (
          select public.record_strike('00000000-0000-0000-0000-0000000a5004', 'phone number', '08031234567', gen_random_uuid())
          from generate_series(1, 3)
        )
   select (select count(*) from strikes)::integer
     + case when (select s from before) = (select array_agg(status::text order by id) from public.engagements) then 0 else 100 end),
  3, 'three strikes and a suspension leave every engagement as it was');

select * from finish();
rollback;
