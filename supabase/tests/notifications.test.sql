-- Proves the rules from the create_notifications migration: the events that
-- notify someone, one grouped entry per conversation that clears when the
-- thread is read, and that people only ever see and mark their own.
-- Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(35);

-- Ada is a business; Chidi, Dayo, Femi and Gbenga are listed creators; Efe
-- is an admin.
insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000c7001', '88888888-0000-0000-0000-000000000001', 'ada.notify@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000c7003', '88888888-0000-0000-0000-000000000003', 'chidi.notify@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000c7004', '88888888-0000-0000-0000-000000000004', 'dayo.notify@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000c7005', '88888888-0000-0000-0000-000000000005', 'femi.notify@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000c7006', '88888888-0000-0000-0000-000000000006', 'gbenga.notify@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000c7007', '88888888-0000-0000-0000-000000000007', 'efe.notify@example.com', 'admin');

insert into public.business_profiles (user_id, business_name, contact_name, state, city) values
  ('00000000-0000-0000-0000-0000000c7001', 'Ada Notify Kitchen', 'Ada Obi', 'Lagos', 'Ikeja');

insert into public.influencer_profiles (user_id, display_name, state, city, niches, published) values
  ('00000000-0000-0000-0000-0000000c7003', 'Chidi Notify', 'Lagos', 'Yaba', '{fashion}', true),
  ('00000000-0000-0000-0000-0000000c7004', 'Dayo Notify', 'Lagos', 'Yaba', '{fashion}', true),
  ('00000000-0000-0000-0000-0000000c7005', 'Femi Notify', 'Lagos', 'Yaba', '{fashion}', true),
  ('00000000-0000-0000-0000-0000000c7006', 'Gbenga Notify', 'Lagos', 'Yaba', '{fashion}', true);

insert into public.influencer_platforms (user_id, platform, handle, follower_range) values
  ('00000000-0000-0000-0000-0000000c7003', 'instagram', 'chidi.notifytest', '1k_5k'),
  ('00000000-0000-0000-0000-0000000c7004', 'instagram', 'dayo.notifytest', '1k_5k'),
  ('00000000-0000-0000-0000-0000000c7005', 'instagram', 'femi.notifytest', '1k_5k'),
  ('00000000-0000-0000-0000-0000000c7006', 'instagram', 'gbenga.notifytest', '1k_5k');

-- K1 is open with 3 places; K2 waits for an admin.
insert into public.campaigns (id, business_id, status, title, brief, price_kobo, places,
                              applications_close_on, deliver_by, published_at, submitted_at) values
  ('c7000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000c7001', 'open', 'K1 notify test',
   'A brief that is long enough for the checks.', 5000000, 3, public.lagos_today() + 10, public.lagos_today() + 20, now(), now()),
  ('c7000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000c7001', 'pending_review', 'K2 notify test',
   'A brief that is long enough for the checks.', 5000000, 1, public.lagos_today() + 10, public.lagos_today() + 20, null, now());

insert into public.campaign_platforms (campaign_id, platform, min_followers) values
  ('c7000000-0000-0000-0000-000000000001', 'instagram', null),
  ('c7000000-0000-0000-0000-000000000002', 'instagram', null);

-- How many notifications of a kind someone has (checked as the database
-- owner, so it isn't affected by who is signed in).
create function pg_temp.count_of(person uuid, what text) returns integer
language sql as $$
  select count(*)::integer from public.notifications n
   where n.user_id = person and n.kind::text = what
$$;

set local role authenticated;

-- Applications ------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "88888888-0000-0000-0000-000000000003"}'; -- Chidi
select public.apply_to_campaign('c7000000-0000-0000-0000-000000000001', null, 'Keen to work with you');
select public.edit_application((select id from public.applications where creator_id = '00000000-0000-0000-0000-0000000c7003'), 6000000, null);
select public.edit_application((select id from public.applications where creator_id = '00000000-0000-0000-0000-0000000c7003'), 6500000, null);
select is((select count(*)::integer from public.notifications), 0, 'Chidi sees none of Ada''s notifications');

set local request.jwt.claims = '{"sub": "88888888-0000-0000-0000-000000000001"}'; -- Ada
select is((select count(*)::integer from public.notifications where kind = 'application_received'), 1,
  'a new application notifies the business');
select is((select data ->> 'name' from public.notifications where kind = 'application_received'), 'Chidi Notify',
  'with the creator''s name');
select is((select data ->> 'campaign_title' from public.notifications where kind = 'application_received'), 'K1 notify test',
  'and the campaign');
select is((select count(*)::integer from public.notifications where kind = 'application_updated'), 1,
  'edits to an application are one entry, however many');

select public.decide_application((select id from public.applications where creator_id = '00000000-0000-0000-0000-0000000c7003'), 'shortlisted', null);

-- Chat --------------------------------------------------------------------------------------------
select public.start_conversation('00000000-0000-0000-0000-0000000c7003');
select public.send_message((select id from public.conversations where creator_id = '00000000-0000-0000-0000-0000000c7003'),
  'Hi Chidi, are you free next week?', '66666666-0000-0000-0000-000000000001');
select public.send_message((select id from public.conversations where creator_id = '00000000-0000-0000-0000-0000000c7003'),
  'We would love a reel.', '66666666-0000-0000-0000-000000000002');

set local request.jwt.claims = '{"sub": "88888888-0000-0000-0000-000000000003"}'; -- Chidi
select is((select count(*)::integer from public.notifications where kind = 'application_shortlisted'), 1,
  'shortlisting notifies the creator');
select is((select count(*)::integer from public.notifications where kind = 'new_message'), 1,
  'two messages make one entry for the thread');
select is((select data ->> 'count' from public.notifications where kind = 'new_message'), '2', 'counting both');
select is((select data ->> 'preview' from public.notifications where kind = 'new_message'), 'We would love a reel.',
  'showing the latest');
select public.mark_conversation_read((select id from public.conversations where creator_id = '00000000-0000-0000-0000-0000000c7003'));
select isnt((select read_at from public.notifications where kind = 'new_message'), null,
  'reading the thread clears its notification');

set local request.jwt.claims = '{"sub": "88888888-0000-0000-0000-000000000001"}'; -- Ada
select public.send_message((select id from public.conversations where creator_id = '00000000-0000-0000-0000-0000000c7003'),
  'Any update?', '66666666-0000-0000-0000-000000000003');

set local request.jwt.claims = '{"sub": "88888888-0000-0000-0000-000000000003"}'; -- Chidi
select is((select read_at from public.notifications where kind = 'new_message'), null,
  'a new message makes it unread again');
select is((select data ->> 'count' from public.notifications where kind = 'new_message'), '1',
  'counting only what is new');
select public.send_message((select id from public.conversations where creator_id = '00000000-0000-0000-0000-0000000c7003'),
  'Yes, next week works.', '66666666-0000-0000-0000-000000000004');

set local request.jwt.claims = '{"sub": "88888888-0000-0000-0000-000000000001"}'; -- Ada
select is((select data ->> 'name' from public.notifications where kind = 'new_message'), 'Chidi Notify',
  'a reply notifies the business, by the creator''s name');

-- Hiring, cancelling, lapsing, passing, withdrawing ---------------------------------------------------
select public.approve_application((select id from public.applications where creator_id = '00000000-0000-0000-0000-0000000c7003'), 6500000);
select public.cancel_engagement((select id from public.engagements where creator_id = '00000000-0000-0000-0000-0000000c7003'));

set local request.jwt.claims = '{"sub": "88888888-0000-0000-0000-000000000004"}'; -- Dayo
select public.apply_to_campaign('c7000000-0000-0000-0000-000000000001', null, null);
set local request.jwt.claims = '{"sub": "88888888-0000-0000-0000-000000000005"}'; -- Femi
select public.apply_to_campaign('c7000000-0000-0000-0000-000000000001', null, null);
select public.withdraw_application((select id from public.applications where creator_id = '00000000-0000-0000-0000-0000000c7005'));
set local request.jwt.claims = '{"sub": "88888888-0000-0000-0000-000000000006"}'; -- Gbenga
select public.apply_to_campaign('c7000000-0000-0000-0000-000000000001', null, null);

set local request.jwt.claims = '{"sub": "88888888-0000-0000-0000-000000000001"}'; -- Ada
select public.approve_application((select id from public.applications where creator_id = '00000000-0000-0000-0000-0000000c7004'), 5000000);
select public.decide_application((select id from public.applications where creator_id = '00000000-0000-0000-0000-0000000c7006'),
  'rejected', 'We went with a food creator.');

reset role;
update public.engagements set pay_by = now() - interval '1 minute'
 where creator_id = '00000000-0000-0000-0000-0000000c7004';
select public.expire_unpaid_engagements();

select is(pg_temp.count_of('00000000-0000-0000-0000-0000000c7003', 'application_hired'), 1, 'hiring notifies the creator');
select is(pg_temp.count_of('00000000-0000-0000-0000-0000000c7003', 'hire_cancelled'), 1, 'so does cancelling the hire');
select is(pg_temp.count_of('00000000-0000-0000-0000-0000000c7004', 'hire_lapsed'), 1, 'a lapsed hire notifies the creator');
select is(pg_temp.count_of('00000000-0000-0000-0000-0000000c7001', 'hire_lapsed'), 1, 'and the business');
select is(pg_temp.count_of('00000000-0000-0000-0000-0000000c7001', 'application_withdrawn'), 1, 'withdrawing notifies the business');
select is(pg_temp.count_of('00000000-0000-0000-0000-0000000c7006', 'application_passed'), 1, 'passing notifies the creator');
select is((select data ->> 'note' from public.notifications
            where user_id = '00000000-0000-0000-0000-0000000c7006' and kind = 'application_passed'),
  'We went with a food creator.', 'with the business''s note');
select is(pg_temp.count_of('00000000-0000-0000-0000-0000000c7001', 'application_received'), 4,
  'every application is its own entry');

-- Admin decisions -----------------------------------------------------------------------------------------
insert into public.verification_requests (id, user_id, platform, handle, code, status, submitted_at, expires_at) values
  ('c7000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000c7004', 'instagram', 'dayo.notifytest',
   'pitchype-NTF001', 'pending', now(), now() + interval '7 days'),
  ('c7000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000c7005', 'instagram', 'femi.notifytest',
   'pitchype-NTF002', 'pending', now(), now() + interval '7 days');
select public.record_strike('00000000-0000-0000-0000-0000000c7005', 'phone number', '0803 000 0000', gen_random_uuid());

set local role authenticated;
set local request.jwt.claims = '{"sub": "88888888-0000-0000-0000-000000000005"}'; -- Femi
select public.submit_appeal('That was an order number.');

set local request.jwt.claims = '{"sub": "88888888-0000-0000-0000-000000000007"}'; -- Efe
select public.transition_campaign('c7000000-0000-0000-0000-000000000002', 'approve');
select public.transition_campaign('c7000000-0000-0000-0000-000000000002', 'take_down', 'Breaks the rules on alcohol.');
select public.review_handle_verification('c7000000-0000-0000-0000-0000000000f1', true, 4200);
select public.review_handle_verification('c7000000-0000-0000-0000-0000000000f2', false);
select public.set_creator_hidden('00000000-0000-0000-0000-0000000c7006', 'Photo breaks the rules.');
select public.set_creator_hidden('00000000-0000-0000-0000-0000000c7006', null);
select public.answer_appeal((select id from public.moderation_appeals where user_id = '00000000-0000-0000-0000-0000000c7005'),
  'We removed the strike.', false);
select is((select count(*)::integer from public.notifications), 0, 'admins get none of these');

reset role;
select is(pg_temp.count_of('00000000-0000-0000-0000-0000000c7001', 'campaign_approved'), 1, 'approving a first campaign notifies the business');
select is(pg_temp.count_of('00000000-0000-0000-0000-0000000c7001', 'campaign_taken_down'), 1, 'so does a takedown');
select is(pg_temp.count_of('00000000-0000-0000-0000-0000000c7004', 'verification_approved'), 1, 'a verified handle notifies the creator');
select is(pg_temp.count_of('00000000-0000-0000-0000-0000000c7005', 'verification_rejected'), 1, 'so does a refused one');
select is(pg_temp.count_of('00000000-0000-0000-0000-0000000c7006', 'profile_hidden')
        + pg_temp.count_of('00000000-0000-0000-0000-0000000c7006', 'profile_restored'), 2,
  'hiding and restoring a profile notify the creator');
select is(pg_temp.count_of('00000000-0000-0000-0000-0000000c7005', 'appeal_answered'), 1, 'an answered appeal notifies the person');

-- Reading and writing ------------------------------------------------------------------------------------
select set_config('test.adas', (select id::text from public.notifications
                                  where user_id = '00000000-0000-0000-0000-0000000c7001' limit 1), true);
set local role authenticated;
set local request.jwt.claims = '{"sub": "88888888-0000-0000-0000-000000000004"}'; -- Dayo
select is(public.mark_notifications_read(array[current_setting('test.adas')::uuid]), 0,
  'nobody can mark someone else''s as read');
select throws_ok($$ insert into public.notifications (user_id, kind) values
  ('00000000-0000-0000-0000-0000000c7004', 'appeal_answered') $$, '42501', null, 'nobody writes them directly');
select throws_ok($$ update public.notifications set read_at = now() $$, '42501', null, 'or changes them');

set local request.jwt.claims = '{"sub": "88888888-0000-0000-0000-000000000001"}'; -- Ada
select is(public.mark_notifications_read(array[(select id from public.notifications
                                                 where kind = 'campaign_approved')]), 1, 'marking one as read');
select ok(public.mark_notifications_read(null) > 1, 'marking all as read');
select is((select count(*)::integer from public.notifications where read_at is null), 0, 'leaves none unread');

reset role;
select is((select count(*)::integer from public.notifications
            where user_id = '00000000-0000-0000-0000-0000000c7004' and read_at is null),
          pg_temp.count_of('00000000-0000-0000-0000-0000000c7004', 'hire_lapsed')
        + pg_temp.count_of('00000000-0000-0000-0000-0000000c7004', 'application_hired')
        + pg_temp.count_of('00000000-0000-0000-0000-0000000c7004', 'verification_approved'),
  'and someone else''s stay unread');

select * from finish();
rollback;
