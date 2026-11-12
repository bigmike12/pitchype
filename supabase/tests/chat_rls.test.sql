-- Proves the rules from the create_chat migration: only businesses start
-- threads, only the two people read and write them, contact details are never
-- delivered and earn strikes, standing and blocks stop sending but keep
-- history readable. Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(29);

-- Ada is a business; Chidi, Dayo and Femi are listed creators; Gbenga's
-- profile is unpublished.
insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000b6001', '99999999-0000-0000-0000-000000000001', 'ada.chat@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000b6003', '99999999-0000-0000-0000-000000000003', 'chidi.chat@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000b6004', '99999999-0000-0000-0000-000000000004', 'dayo.chat@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000b6005', '99999999-0000-0000-0000-000000000005', 'femi.chat@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000b6006', '99999999-0000-0000-0000-000000000006', 'gbenga.chat@example.com', 'influencer');

insert into public.business_profiles (user_id, business_name, contact_name, state, city) values
  ('00000000-0000-0000-0000-0000000b6001', 'Ada Chat Test', 'Ada Obi', 'Lagos', 'Ikeja');

insert into public.influencer_profiles (user_id, display_name, state, city, niches, published) values
  ('00000000-0000-0000-0000-0000000b6003', 'Chidi Chat Test', 'Lagos', 'Yaba', '{fashion}', true),
  ('00000000-0000-0000-0000-0000000b6004', 'Dayo Chat Test', 'Lagos', 'Yaba', '{fashion}', true),
  ('00000000-0000-0000-0000-0000000b6005', 'Femi Chat Test', 'Lagos', 'Yaba', '{fashion}', true),
  ('00000000-0000-0000-0000-0000000b6006', 'Gbenga Chat Test', 'Lagos', 'Yaba', '{fashion}', false);

insert into public.influencer_platforms (user_id, platform, handle, follower_range) values
  ('00000000-0000-0000-0000-0000000b6003', 'instagram', 'chidi.chattest', '1k_5k'),
  ('00000000-0000-0000-0000-0000000b6004', 'instagram', 'dayo.chattest', '1k_5k'),
  ('00000000-0000-0000-0000-0000000b6005', 'instagram', 'femi.chattest', '1k_5k'),
  ('00000000-0000-0000-0000-0000000b6006', 'instagram', 'gbenga.chattest', '1k_5k');

set local role authenticated;

-- Starting a thread -------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "99999999-0000-0000-0000-000000000003"}'; -- Chidi
select throws_ok($$ select public.start_conversation('00000000-0000-0000-0000-0000000b6001') $$,
  '42501', null, 'creators do not start threads');

set local request.jwt.claims = '{"sub": "99999999-0000-0000-0000-000000000001"}'; -- Ada
select isnt(public.start_conversation('00000000-0000-0000-0000-0000000b6003'), null, 'Ada starts a thread with Chidi');
select is(public.start_conversation('00000000-0000-0000-0000-0000000b6003'),
          (select id from public.conversations where creator_id = '00000000-0000-0000-0000-0000000b6003'),
  'starting again returns the same thread');
select throws_ok($$ select public.start_conversation('00000000-0000-0000-0000-0000000b6006') $$,
  'P0001', 'not_allowed', 'nobody can be messaged before their profile is listed or they apply');

-- Talking ----------------------------------------------------------------------------------------------
select is(public.send_message(
    (select id from public.conversations where creator_id = '00000000-0000-0000-0000-0000000b6003'),
    'Hi Chidi, are you free next week?', '77777777-0000-0000-0000-000000000001') ->> 'delivered',
  'true', 'Ada sends a message');
select is(public.send_message(
    (select id from public.conversations where creator_id = '00000000-0000-0000-0000-0000000b6003'),
    'Hi Chidi, are you free next week?', '77777777-0000-0000-0000-000000000001') ->> 'delivered',
  'true', 'a retried send is fine');
select is((select count(*)::integer from public.messages), 1, 'and stored once');
select throws_ok($$
  select public.send_message(
    (select id from public.conversations where creator_id = '00000000-0000-0000-0000-0000000b6003'),
    '   ', gen_random_uuid())
$$, 'P0001', 'message_length', 'an empty message is refused');

set local request.jwt.claims = '{"sub": "99999999-0000-0000-0000-000000000003"}'; -- Chidi
select is(public.unread_message_count(), 1, 'Chidi has one unread message');
select lives_ok($$ select public.mark_conversation_read((select id from public.conversations)) $$,
  'he opens the thread');
select is(public.unread_message_count(), 0, 'and has nothing unread');
select is(public.send_message((select id from public.conversations), 'Yes, I am free.', gen_random_uuid()) ->> 'delivered',
  'true', 'Chidi replies');

set local request.jwt.claims = '{"sub": "99999999-0000-0000-0000-000000000005"}'; -- Femi
select is((select count(*)::integer from public.conversations), 0, 'Femi sees no threads');
select is((select count(*)::integer from public.messages), 0, 'or messages');
select throws_ok($$
  select public.send_message('00000000-0000-0000-0000-000000000000', 'hello', gen_random_uuid())
$$, 'P0001', 'not_allowed', 'or writes in someone else''s thread');

-- Contact details -----------------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "99999999-0000-0000-0000-000000000003"}'; -- Chidi
select is(public.send_message((select id from public.conversations), 'Call me on 0803 123 4567', gen_random_uuid()),
  '{"delivered": false, "flag": "phone number", "strikes": 1, "suspended": false, "restricted_until": null}'::jsonb,
  'a phone number is not delivered: a first strike');

set local request.jwt.claims = '{"sub": "99999999-0000-0000-0000-000000000001"}'; -- Ada
select is((select count(*)::integer from public.messages), 2, 'Ada sees only the two real messages');
select is((select count(*)::integer from public.moderation_events), 0, 'and nothing of Chidi''s strike');

set local request.jwt.claims = '{"sub": "99999999-0000-0000-0000-000000000003"}'; -- Chidi
select is(public.send_message((select id from public.conversations), 'or chidi@mail.com', gen_random_uuid()) ->> 'strikes',
  '2', 'a second strike');
select throws_ok($$ select public.send_message((select id from public.conversations), 'Sorry!', gen_random_uuid()) $$,
  'P0001', 'activity_paused', 'which pauses sending');
select is((select count(*)::integer from public.messages), 2, 'but the thread is still readable');

reset role;
update public.users set messaging_restricted_until = now() - interval '1 minute'
 where id = '00000000-0000-0000-0000-0000000b6003';
set local role authenticated;
set local request.jwt.claims = '{"sub": "99999999-0000-0000-0000-000000000003"}';
select is(public.send_message((select id from public.conversations), 'wa.me/2348031234567', gen_random_uuid()) ->> 'suspended',
  'true', 'a third strike suspends');
select throws_ok($$ select public.send_message((select id from public.conversations), 'Hello?', gen_random_uuid()) $$,
  'P0001', 'account_suspended', 'and a suspended account cannot send');

-- Blocks -----------------------------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "99999999-0000-0000-0000-000000000001"}'; -- Ada
select isnt(public.start_conversation('00000000-0000-0000-0000-0000000b6004'), null, 'Ada starts a thread with Dayo');
select is(public.send_message(
    (select id from public.conversations where creator_id = '00000000-0000-0000-0000-0000000b6004'),
    'Hello Dayo', gen_random_uuid()) ->> 'delivered', 'true', 'and writes');

set local request.jwt.claims = '{"sub": "99999999-0000-0000-0000-000000000004"}'; -- Dayo
select lives_ok($$ select public.block_user('00000000-0000-0000-0000-0000000b6001') $$, 'Dayo blocks Ada');
select throws_ok($$ select public.send_message((select id from public.conversations), 'hi', gen_random_uuid()) $$,
  'P0001', 'not_allowed', 'neither of them can send');

set local request.jwt.claims = '{"sub": "99999999-0000-0000-0000-000000000001"}'; -- Ada
select throws_ok($$ select public.start_conversation('00000000-0000-0000-0000-0000000b6004') $$,
  'P0001', 'not_allowed', 'or start again');
select is(jsonb_array_length(public.my_conversations()), 2, 'but both threads stay listed and readable');

select * from finish();
rollback;
