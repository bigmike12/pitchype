-- Proves the rules from the email_queue migration: when notify() makes a row
-- due for email, the one-email-per-thread-per-hour cap, that old rows are
-- never queued, that claim_due_emails() hands each row out once and pushes it
-- 5 minutes out, preferences, and who may call what.
-- Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(35);

-- Pia is a creator, Quin a business, Remi a second creator who never saves
-- preferences.
insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000e8001', '99999999-0000-0000-0000-000000000001', 'pia.email@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000e8002', '99999999-0000-0000-0000-000000000002', 'quin.email@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000e8003', '99999999-0000-0000-0000-000000000003', 'remi.email@example.com', 'influencer');

-- The local database may hold queued rows from other runs; none of them
-- should be claimed here (rolled back with everything else).
update public.notifications set email_due_at = null;

create function pg_temp.row_of(person uuid, key text) returns public.notifications
language sql as $$
  select n from public.notifications n where n.user_id = person and n.group_key = key
$$;

-- Due times ------------------------------------------------------------------------------------------
select public.notify('00000000-0000-0000-0000-0000000e8001', 'new_message', '{"count": 1}', 'k1');
select ok(
  (select email_due_at between now() + interval '15 minutes' - interval '1 second'
                           and now() + interval '15 minutes' + interval '1 second'
     from public.notifications where group_key = 'k1'),
  'new_message gets a due time 15 minutes out');

select public.notify('00000000-0000-0000-0000-0000000e8001', 'hire_funded', '{}', 'k2');
select ok(
  (select email_due_at <= now() from public.notifications where group_key = 'k2'),
  'other kinds are due now');

-- Rows made before the migration have no due time and are never queued.
insert into public.notifications (id, user_id, kind, data) values
  ('e8000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-0000000e8001', 'payout_paid', '{}');
select is((select email_due_at from public.notifications where id = 'e8000000-0000-0000-0000-0000000000a0'), null,
  'existing rows are never queued');

-- Bumps -------------------------------------------------------------------------------------------------
-- An unsent chat row keeps the time it was already due, so a busy chat cannot
-- push its own email back forever.
update public.notifications set email_due_at = now() + interval '3 minutes' where group_key = 'k1';
select public.notify('00000000-0000-0000-0000-0000000e8001', 'new_message', '{"count": 2}', 'k1');
select is((select email_due_at from public.notifications where group_key = 'k1'), now() + interval '3 minutes',
  'a bumped unsent chat row keeps its due time');
select is((select data ->> 'count' from public.notifications where group_key = 'k1'), '2',
  'while still showing the latest facts');

-- An unsent grouped row that has no due time (skipped earlier) gets one.
select public.notify('00000000-0000-0000-0000-0000000e8001', 'new_message', '{}', 'k3');
update public.notifications set email_due_at = null where group_key = 'k3';
select public.notify('00000000-0000-0000-0000-0000000e8001', 'new_message', '{}', 'k3');
select is((select email_due_at from public.notifications where group_key = 'k3'), now() + interval '15 minutes',
  'an unsent grouped row with no due time gets one');

-- Emailed under an hour ago: the email columns stay as they were.
select public.finish_email((select id from public.notifications where group_key = 'k1'), true);
update public.notifications set email_attempts = 1 where group_key = 'k1';
select public.notify('00000000-0000-0000-0000-0000000e8001', 'new_message', '{"count": 3}', 'k1');
select is((select emailed_at from public.notifications where group_key = 'k1'), now(),
  'a chat row emailed under an hour ago is not requeued');
select is((select email_attempts from public.notifications where group_key = 'k1'), 1,
  'and its attempts are left alone');

-- Emailed an hour or more ago: a new email is due.
update public.notifications set emailed_at = now() - interval '2 hours', email_attempts = 2 where group_key = 'k1';
select public.notify('00000000-0000-0000-0000-0000000e8001', 'new_message', '{"count": 4}', 'k1');
select is((select emailed_at from public.notifications where group_key = 'k1'), null,
  'a chat row emailed over an hour ago is requeued');
select is((select email_attempts from public.notifications where group_key = 'k1'), 0, 'with no attempts used');
select is((select email_due_at from public.notifications where group_key = 'k1'), now() + interval '15 minutes',
  'and due 15 minutes out');

-- Out of attempts and never emailed (say Resend was down): a new event starts
-- the row afresh instead of leaving it silent for good.
select public.notify('00000000-0000-0000-0000-0000000e8001', 'new_message', '{"count": 1}', 'k4');
update public.notifications
   set email_attempts = 5, email_due_at = now() - interval '1 minute'
 where group_key = 'k4';
select is((select count(*)::integer from public.claim_due_emails(50) where id = (select id from public.notifications where group_key = 'k4')), 0,
  'a row with all 5 attempts used is not claimed');
select public.notify('00000000-0000-0000-0000-0000000e8001', 'new_message', '{"count": 2}', 'k4');
select is((select email_attempts from public.notifications where group_key = 'k4'), 0,
  'a bump of a never-emailed row out of attempts gives it 5 more');
select is((select email_due_at from public.notifications where group_key = 'k4'), now() + interval '15 minutes',
  'and a fresh due time 15 minutes out');
update public.notifications set email_due_at = now() - interval '1 minute' where group_key = 'k4';
select ok((select count(*) = 1 from public.claim_due_emails(50) where id = (select id from public.notifications where group_key = 'k4')),
  'and it is claimed once due');

-- Claiming --------------------------------------------------------------------------------------------------
-- Start from a clean slate for these people, then set up one row in each state.
delete from public.notifications
 where user_id in ('00000000-0000-0000-0000-0000000e8001', '00000000-0000-0000-0000-0000000e8003');

insert into public.notifications (id, user_id, kind, data, email_due_at, emailed_at, email_attempts) values
  -- due, never tried
  ('e8000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000e8003', 'hire_funded',
   '{"campaign_title": "K"}', now() - interval '1 minute', null, 0),
  -- not due yet
  ('e8000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000e8003', 'hire_lapsed',
   '{}', now() + interval '1 hour', null, 0),
  -- five attempts already
  ('e8000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000e8003', 'payout_paid',
   '{}', now() - interval '1 minute', null, 5),
  -- already emailed
  ('e8000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000e8003', 'payout_failed',
   '{}', now() - interval '1 minute', now() - interval '10 minutes', 1),
  -- made before the migration
  ('e8000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000e8003', 'payout_rejected',
   '{}', null, null, 0);

create temp table first_claim on commit drop as select * from public.claim_due_emails(50);

select results_eq(
  $$ select id::text from first_claim $$,
  $$ values ('e8000000-0000-0000-0000-0000000000b1') $$,
  'claim returns only due, unsent, under-5-attempt rows');

select is((select email_attempts from public.notifications where id = 'e8000000-0000-0000-0000-0000000000b1'), 1,
  'claim counts the attempt');
select is((select email_due_at from public.notifications where id = 'e8000000-0000-0000-0000-0000000000b1'),
  now() + interval '5 minutes', 'and pushes the due time out 5 minutes');
select is((select count(*)::integer from public.claim_due_emails(50)), 0,
  'a second claim straight after returns nothing');
select is((select email_attempts from public.notifications where id = 'e8000000-0000-0000-0000-0000000000b1'), 1,
  'and does not count another attempt');

select results_eq(
  $$ select kind, email, role, attempts, email_applications, email_campaigns, email_messages from first_claim $$,
  $$ values ('hire_funded', 'remi.email@example.com', 'influencer', 1, true, true, true) $$,
  'claim returns the recipient''s email, role and defaulted preferences');
select is((select data ->> 'campaign_title' from first_claim), 'K', 'and the facts');

-- Preferences ------------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "99999999-0000-0000-0000-000000000001"}'; -- Pia
select public.save_email_preferences(false, true, false);
set local request.jwt.claims = '{"sub": "99999999-0000-0000-0000-000000000002"}'; -- Quin
select public.save_email_preferences(true, true, true);
select public.save_email_preferences(true, false, true);
select is((select count(*)::integer from public.notification_preferences), 1,
  'a person sees only their own preferences row, however often they save');
select is((select email_campaigns from public.notification_preferences), false, 'saving again replaces it');
set local request.jwt.claims = '{"sub": "99999999-0000-0000-0000-000000000001"}'; -- Pia
select is((select count(*)::integer from public.notification_preferences), 1, 'and Pia sees hers');
select throws_ok($$ insert into public.notification_preferences (user_id) values
  ('00000000-0000-0000-0000-0000000e8003') $$, '42501', null, 'nobody writes preferences directly');

reset role;
insert into public.notifications (id, user_id, kind, data, email_due_at) values
  ('e8000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000e8001', 'application_received',
   '{}', now() - interval '1 minute');
select results_eq(
  $$ select email_applications, email_campaigns, email_messages from public.claim_due_emails(50) $$,
  $$ values (false, true, false) $$,
  'claim reflects saved preferences');

-- Finishing -------------------------------------------------------------------------------------------------
select public.finish_email('e8000000-0000-0000-0000-0000000000c1', false);
select results_eq(
  $$ select email_due_at is null, emailed_at is null from public.notifications
      where id = 'e8000000-0000-0000-0000-0000000000c1' $$,
  $$ values (true, true) $$,
  'finish_email(false) clears the due time and leaves emailed_at empty');
select public.finish_email('e8000000-0000-0000-0000-0000000000c1', true);
select is((select emailed_at from public.notifications where id = 'e8000000-0000-0000-0000-0000000000c1'), now(),
  'finish_email(true) sets emailed_at');

-- Who may call what ---------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "99999999-0000-0000-0000-000000000001"}'; -- Pia
select throws_ok($$ select * from public.claim_due_emails(50) $$, '42501', null,
  'a signed-in person cannot claim emails');
select throws_ok($$ select public.finish_email('e8000000-0000-0000-0000-0000000000c1', true) $$, '42501', null,
  'or finish one');

set local role anon;
select throws_ok($$ select public.save_email_preferences(true, true, true) $$, '42501', null,
  'signed out, nobody saves preferences');

reset role;
set local role service_role;
select lives_ok($$ select * from public.claim_due_emails(50) $$, 'the service role can claim');
select lives_ok($$ select public.finish_email('e8000000-0000-0000-0000-0000000000c1', true) $$,
  'and finish');
select throws_ok($$ select public.save_email_preferences(true, true, true) $$, '42501', null,
  'but not save someone''s preferences, which are the person''s own');

select * from finish();
rollback;
