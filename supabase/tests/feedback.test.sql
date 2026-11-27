-- Proves the rules from the create_feedback_requests migration: people send
-- requests and see only their own; only admins read them all, set statuses
-- and merge duplicates; and when a request ships, its sender and the sender
-- of every duplicate are told exactly once. Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(48);

-- Ada is a business; Chidi and Dayo are creators; Efe is an admin.
insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000f0001', 'ffffffff-0000-0000-0000-000000000001', 'ada.fb@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000f0002', 'ffffffff-0000-0000-0000-000000000002', 'chidi.fb@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000f0003', 'ffffffff-0000-0000-0000-000000000003', 'dayo.fb@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000f0004', 'ffffffff-0000-0000-0000-000000000004', 'efe.fb@example.com', 'admin');

-- Sending, as Chidi --------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "ffffffff-0000-0000-0000-000000000002"}';

select lives_ok($$ select * from public.submit_feedback('idea', 'Dark mode', 'Please add a dark mode for night work.') $$,
  'a creator sends an idea');
select throws_ok($$ select * from public.submit_feedback('idea', 'ab', 'Long enough details here.') $$,
  'P0001', 'feedback_invalid', 'a title needs 3 characters');
select throws_ok(format($$ select * from public.submit_feedback('idea', 'A title', %L) $$, repeat('a', 2001)),
  'P0001', 'feedback_invalid', 'details stop at 2,000 characters');
select throws_ok($$ select * from public.submit_feedback('bug', 'A title', 'Long enough details here.') $$,
  'P0001', 'feedback_invalid', 'the kind is idea or problem');
select is((select count(*)::integer from public.feedback_requests), 1, 'Chidi sees his request');
select is((select status from public.feedback_requests), 'received', 'it starts as received');

select throws_ok($$ insert into public.feedback_requests (user_id, kind, title, details)
                    values ('00000000-0000-0000-0000-0000000f0002', 'idea', 'Sneaky', 'Written straight to the table.') $$,
  '42501', null, 'nobody inserts directly');
select throws_ok($$ update public.feedback_requests set status = 'shipped' $$,
  '42501', null, 'nobody updates directly');
select throws_ok($$ delete from public.feedback_requests $$,
  '42501', null, 'nobody deletes');
select throws_ok($$ select public.set_feedback_status((select id from public.feedback_requests limit 1), 'shipped', null) $$,
  '42501', null, 'only admins set a status');
select throws_ok($$ select * from public.admin_feedback_requests() $$,
  '42501', null, 'only admins list every request');
select throws_ok($$ select public.mark_feedback_duplicate((select id from public.feedback_requests limit 1), 1) $$,
  '42501', null, 'only admins merge requests');

-- Dayo and Ada send theirs -----------------------------------------------------------
set local request.jwt.claims = '{"sub": "ffffffff-0000-0000-0000-000000000003"}';
select lives_ok($$ select * from public.submit_feedback('idea', 'Night theme', 'A darker look for the app, please.') $$,
  'Dayo sends a similar idea');
select is((select count(*)::integer from public.feedback_requests), 1, 'Dayo sees only his own request');
select is((select count(*)::integer from public.my_feedback_requests()), 1, 'and only his own through my_feedback_requests');

set local request.jwt.claims = '{"sub": "ffffffff-0000-0000-0000-000000000001"}';
select lives_ok($$ select * from public.submit_feedback('idea', 'Dark theme please', 'My eyes hurt at night.') $$,
  'Ada sends a third take on it');
select lives_ok($$ select * from public.submit_feedback('problem', 'Invoices', 'I cannot find my invoices anywhere.') $$,
  'and an unrelated problem');

-- Triage, as Efe ------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "ffffffff-0000-0000-0000-000000000004"}';
select throws_ok($$ select * from public.submit_feedback('idea', 'Admin idea', 'Admins do not send these.') $$,
  'P0001', 'not_allowed', 'admins do not send feedback');
select is((select count(*)::integer from public.feedback_requests), 4, 'Efe sees every request');
select is((select count(*)::integer from public.admin_feedback_requests()), 4, 'and lists them all');
select is((select sender_email from public.admin_feedback_requests() where title = 'Invoices'),
  'ada.fb@example.com', 'with who sent each');

select lives_ok($$ select public.mark_feedback_duplicate(
                     (select id from public.feedback_requests where title = 'Night theme'),
                     (select number from public.feedback_requests where title = 'Dark mode')) $$,
  'Dayo''s request is merged into Chidi''s');
select is((select duplicate_count from public.admin_feedback_requests() where title = 'Dark mode'),
  1, 'the main request counts its duplicate');
select throws_ok($$ select public.set_feedback_status((select id from public.feedback_requests where title = 'Night theme'), 'planned', null) $$,
  'P0001', 'is_duplicate', 'a merged request is changed through its main request');
select throws_ok($$ select public.mark_feedback_duplicate(
                     (select id from public.feedback_requests where title = 'Dark mode'),
                     (select number from public.feedback_requests where title = 'Invoices')) $$,
  'P0001', 'has_duplicates', 'a request with duplicates is not merged into another');
select throws_ok($$ select public.mark_feedback_duplicate(
                     (select id from public.feedback_requests where title = 'Invoices'),
                     (select number from public.feedback_requests where title = 'Night theme')) $$,
  'P0001', 'main_is_duplicate', 'nothing is merged into a merged request');
select throws_ok($$ select public.mark_feedback_duplicate(
                     (select id from public.feedback_requests where title = 'Invoices'),
                     (select number from public.feedback_requests where title = 'Invoices')) $$,
  'P0001', 'feedback_invalid', 'a request is not its own duplicate');
select throws_ok($$ select public.mark_feedback_duplicate(
                     (select id from public.feedback_requests where title = 'Invoices'), 999999) $$,
  'P0001', 'no_such_feedback', 'the main request must exist');
select throws_ok($$ select public.set_feedback_status((select id from public.feedback_requests where title = 'Dark mode'), 'done', null) $$,
  'P0001', 'feedback_invalid', 'only the four statuses');
select lives_ok($$ select public.set_feedback_status((select id from public.feedback_requests where title = 'Dark mode'), 'planned', 'Coming in December') $$,
  'Efe plans Chidi''s request');

-- What Dayo sees of a merged request ----------------------------------------------------
set local request.jwt.claims = '{"sub": "ffffffff-0000-0000-0000-000000000003"}';
select is((select title || '|' || merged || '|' || status || '|' || admin_note from public.my_feedback_requests()),
  'Night theme|true|planned|Coming in December',
  'his own words, with the main request''s status and note');

-- Shipping ---------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "ffffffff-0000-0000-0000-000000000004"}';
select lives_ok($$ select public.set_feedback_status((select id from public.feedback_requests where title = 'Dark mode'), 'shipped', 'In your settings') $$,
  'Efe ships it');

reset role;
select is((select count(*)::integer from public.notifications
            where user_id = '00000000-0000-0000-0000-0000000f0002' and kind = 'feedback_shipped'),
  1, 'Chidi is told');
select is((select count(*)::integer from public.notifications
            where user_id = '00000000-0000-0000-0000-0000000f0003' and kind = 'feedback_shipped'),
  1, 'Dayo is told too');
select is((select data ->> 'title' || '|' || (data ->> 'note') from public.notifications
            where user_id = '00000000-0000-0000-0000-0000000f0003' and kind = 'feedback_shipped'),
  'Night theme|In your settings', 'with his own title and the admin''s note');
select ok((select email_due_at is not null from public.notifications
            where user_id = '00000000-0000-0000-0000-0000000f0003' and kind = 'feedback_shipped'),
  'and it is queued for email');
select ok((select status = 'shipped' and shipped_at is not null from public.feedback_requests where title = 'Night theme'),
  'Dayo''s request shows as shipped');

set local role authenticated;
set local request.jwt.claims = '{"sub": "ffffffff-0000-0000-0000-000000000004"}';
select lives_ok($$ select public.set_feedback_status((select id from public.feedback_requests where title = 'Dark mode'), 'shipped', 'In your settings') $$,
  'shipping again');
select lives_ok($$ select public.set_feedback_status((select id from public.feedback_requests where title = 'Dark mode'), 'planned', null) $$,
  'moving it back');
select lives_ok($$ select public.set_feedback_status((select id from public.feedback_requests where title = 'Dark mode'), 'shipped', null) $$,
  'and shipping it once more');

reset role;
select is((select count(*)::integer from public.notifications
            where user_id in ('00000000-0000-0000-0000-0000000f0002', '00000000-0000-0000-0000-0000000f0003')
              and kind = 'feedback_shipped'),
  2, 'still one notice each');

-- Merging into a request that already shipped -------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "ffffffff-0000-0000-0000-000000000004"}';
select lives_ok($$ select public.mark_feedback_duplicate(
                     (select id from public.feedback_requests where title = 'Dark theme please'),
                     (select number from public.feedback_requests where title = 'Dark mode')) $$,
  'Ada''s request is merged into the shipped one');

reset role;
select is((select data ->> 'title' from public.notifications
            where user_id = '00000000-0000-0000-0000-0000000f0001' and kind = 'feedback_shipped'),
  'Dark theme please', 'Ada is told at once, with her own title');
select is((select status from public.feedback_requests where title = 'Dark theme please'),
  'shipped', 'and her request shows as shipped');

set local role authenticated;
set local request.jwt.claims = '{"sub": "ffffffff-0000-0000-0000-000000000004"}';
select lives_ok($$ select public.unmark_feedback_duplicate((select id from public.feedback_requests where title = 'Dark theme please')) $$,
  'Efe undoes the merge');

reset role;
select ok((select duplicate_of is null from public.feedback_requests where title = 'Dark theme please'),
  'the merge is gone');
select ok((select status = 'received' and shipped_at is null from public.feedback_requests where title = 'Dark theme please'),
  'her request is hers again, not shipped, so she is told when it really ships');
select is((select count(*)::integer from public.notifications
            where user_id = '00000000-0000-0000-0000-0000000f0001' and kind = 'feedback_shipped'),
  1, 'and nobody is told twice');

select * from finish();
rollback;
