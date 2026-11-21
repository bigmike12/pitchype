-- Proves the rules from the message_email_defaults migration: a chat email is
-- due 6 hours after the message, a thread emails at most once in 6 hours, and
-- people with no saved preferences get no chat email. (The one-time backfill
-- that gave existing people their old behaviour runs at migration time, so it
-- is checked on the database after `supabase migration up`, not here.)
-- Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

-- Sam is a creator who never saves preferences.
insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000e9001', '99999999-0000-0000-0000-0000000e9001', 'sam.defaults@example.com', 'influencer');

select col_default_is('public', 'notification_preferences', 'email_messages', 'false',
  'a new preferences row has chat email off unless the person ticks it');

-- Due time ----------------------------------------------------------------------------------------
select public.notify('00000000-0000-0000-0000-0000000e9001', 'new_message', '{"count": 1}', 'd1');
select is((select email_due_at from public.notifications where group_key = 'd1'),
  now() + interval '6 hours', 'a new chat message is due for email 6 hours out');

-- The per-thread cap matches the delay -----------------------------------------------------------------
select public.finish_email((select id from public.notifications where group_key = 'd1'), true);
update public.notifications set emailed_at = now() - interval '5 hours', email_attempts = 1 where group_key = 'd1';
select public.notify('00000000-0000-0000-0000-0000000e9001', 'new_message', '{"count": 2}', 'd1');
select isnt((select emailed_at from public.notifications where group_key = 'd1'), null,
  'a thread emailed 5 hours ago is not queued again');
select is((select email_attempts from public.notifications where group_key = 'd1'), 1,
  'and its attempts are left alone');

update public.notifications set emailed_at = now() - interval '7 hours' where group_key = 'd1';
select public.notify('00000000-0000-0000-0000-0000000e9001', 'new_message', '{"count": 3}', 'd1');
select is((select emailed_at from public.notifications where group_key = 'd1'), null,
  'a thread emailed over 6 hours ago is queued again');
select is((select email_due_at from public.notifications where group_key = 'd1'),
  now() + interval '6 hours', 'and due 6 hours out');

-- Someone with no preferences row ----------------------------------------------------------------------
-- The local database may hold queued rows from other runs; none should be claimed here.
update public.notifications set email_due_at = null where group_key <> 'd1' or group_key is null;
update public.notifications set email_due_at = now() - interval '1 minute' where group_key = 'd1';
select results_eq(
  $$ select email_applications, email_campaigns, email_messages from public.claim_due_emails(50)
      where id = (select id from public.notifications where group_key = 'd1') $$,
  $$ values (true, true, false) $$,
  'a person with no saved row is claimed with chat email off and the other two on');

select * from finish();
rollback;
