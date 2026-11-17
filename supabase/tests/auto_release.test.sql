-- Proves the daily review-deadline job from the auto_release migration:
-- release_overdue_submissions() releases only submitted hires past their
-- review deadline (a deadline of exactly now counts, one second later does
-- not), once, and a hire that can't settle neither stops the others nor is
-- half-released; a business acting after the deadline gets the release instead;
-- send_review_reminders() tells the business once at 3 days and once at 1 day
-- left (only the 1-day one when both are due); delete_orphan_proof_files()
-- removes unattached files older than a day and nothing else; only the server
-- may run the three; register_proof_file() keeps each file under its owner's
-- folder.
-- Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(57);

-- Ada is a business, creators 7a101..7a108 are hired by Ada.
insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-00000007a001', '7a7a7a7a-0000-0000-0000-00000007a001', 'ada.release@example.com', 'business');

insert into public.users (id, auth_user_id, email, role)
select ('00000000-0000-0000-0000-00000007a1' || lpad(n::text, 2, '0'))::uuid,
       ('7a7a7a7a-0000-0000-0000-00000007a1' || lpad(n::text, 2, '0'))::uuid,
       'c' || n || '.release@example.com', 'influencer'
  from generate_series(1, 8) n;

insert into public.business_profiles (user_id, business_name, contact_name, state, city) values
  ('00000000-0000-0000-0000-00000007a001', 'Ada Release Kitchen', 'Ada Obi', 'Lagos', 'Ikeja');

insert into public.influencer_profiles (user_id, display_name, state, city, niches, published)
select ('00000000-0000-0000-0000-00000007a1' || lpad(n::text, 2, '0'))::uuid,
       'Creator ' || n || ' Release', 'Lagos', 'Yaba', '{fashion}', true
  from generate_series(1, 8) n;

insert into public.campaigns (id, business_id, status, title, brief, price_kobo, places,
                              applications_close_on, deliver_by, published_at, submitted_at) values
  ('7a000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000007a001', 'open', 'Auto-release test',
   'A brief that is long enough for the checks.', 5000000, 20, public.lagos_today() + 10, public.lagos_today() + 20, now(), now());

-- Hire n is creator n's, ₦50,000 each.
insert into public.applications (id, campaign_id, creator_id, status)
select ('7a000000-0000-0000-0000-0000000a00' || lpad(n::text, 2, '0'))::uuid,
       '7a000000-0000-0000-0000-000000000001',
       ('00000000-0000-0000-0000-00000007a1' || lpad(n::text, 2, '0'))::uuid, 'approved'
  from generate_series(1, 8) n;

insert into public.engagements (id, application_id, campaign_id, business_id, creator_id, agreed_price_kobo, pay_by)
select ('7a000000-0000-0000-0000-0000000e00' || lpad(n::text, 2, '0'))::uuid,
       ('7a000000-0000-0000-0000-0000000a00' || lpad(n::text, 2, '0'))::uuid,
       '7a000000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-00000007a001',
       ('00000000-0000-0000-0000-00000007a1' || lpad(n::text, 2, '0'))::uuid,
       5000000, now() + interval '48 hours'
  from generate_series(1, 8) n;

-- Fund every hire by card, every creator starts and submits, and Ada denies hire 3.
do $$
declare
  n integer;
  hire uuid;
  started jsonb;
begin
  for n in 1..8 loop
    hire := ('7a000000-0000-0000-0000-0000000e00' || lpad(n::text, 2, '0'))::uuid;
    perform set_config('request.jwt.claims', '{"sub": "7a7a7a7a-0000-0000-0000-00000007a001"}', true);
    started := public.start_payment(hire, true);
    perform public.record_card_payment(started ->> 'reference', (started ->> 'card_amount_kobo')::bigint,
      95406, 'evt-release-' || n, '{}');
    perform set_config('request.jwt.claims', json_build_object('sub',
      '7a7a7a7a-0000-0000-0000-00000007a1' || lpad(n::text, 2, '0'))::text, true);
    perform public.start_engagement(hire);
    perform public.submit_work(hire, null, array['https://x.com/p/' || n], null);
  end loop;
  perform set_config('request.jwt.claims', '{"sub": "7a7a7a7a-0000-0000-0000-00000007a001"}', true);
  perform public.deny_submission('7a000000-0000-0000-0000-0000000e0003', array['Wrong hashtag']);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- Other local data out of the way, so the counts below are this test's only.
update public.submissions set review_deadline_at = now() + interval '30 days'
 where engagement_id::text not like '7a000000-%' and status = 'pending_review';

-- Deadlines, as the test owner: hire 1 overdue, hire 2 due in 2.5 days, hire 3
-- denied with a past deadline, hire 8 due in 20 hours; the rest keep 7 days.
update public.submissions set review_deadline_at = now() - interval '1 hour'
 where engagement_id = '7a000000-0000-0000-0000-0000000e0001';
update public.submissions set review_deadline_at = now() + interval '2 days 12 hours'
 where engagement_id = '7a000000-0000-0000-0000-0000000e0002';
update public.submissions set review_deadline_at = now() - interval '1 day'
 where engagement_id = '7a000000-0000-0000-0000-0000000e0003';
update public.submissions set review_deadline_at = now() + interval '20 hours'
 where engagement_id = '7a000000-0000-0000-0000-0000000e0008';

select is((select array_agg(status::text order by id) from public.engagements
            where id::text like '7a000000-0000-0000-0000-0000000e00%'),
  array['submitted', 'submitted', 'denied', 'submitted', 'submitted', 'submitted', 'submitted', 'submitted'],
  'hire 3 is denied, the rest are submitted');

-- Who may run the job ------------------------------------------------------------------------------------
select ok(not has_function_privilege('authenticated', 'public.release_overdue_submissions()', 'execute')
          and not has_function_privilege('authenticated', 'public.send_review_reminders()', 'execute')
          and not has_function_privilege('authenticated', 'public.delete_orphan_proof_files()', 'execute'),
  'a signed-in person cannot run any of the three');
select ok(not has_function_privilege('anon', 'public.release_overdue_submissions()', 'execute')
          and not has_function_privilege('anon', 'public.send_review_reminders()', 'execute')
          and not has_function_privilege('anon', 'public.delete_orphan_proof_files()', 'execute'),
  'nor can anon');
select ok(has_function_privilege('service_role', 'public.release_overdue_submissions()', 'execute')
          and has_function_privilege('service_role', 'public.send_review_reminders()', 'execute')
          and has_function_privilege('service_role', 'public.delete_orphan_proof_files()', 'execute'),
  'the server can');
set local role authenticated;
set local request.jwt.claims = '{"sub": "7a7a7a7a-0000-0000-0000-00000007a001"}'; -- Ada
select throws_ok($$ select public.release_overdue_submissions() $$, '42501', null,
  'Ada cannot release overdue work herself');
select throws_ok($$ select public.send_review_reminders() $$, '42501', null, 'or send reminders');
select throws_ok($$ select public.delete_orphan_proof_files() $$, '42501', null, 'or delete files');
reset role;

-- Releasing overdue work ------------------------------------------------------------------------------------
set local role service_role;
select is((select array[released, failed] from public.release_overdue_submissions()), array[1, 0],
  'one hire is released: not the one still in time, not the denied one');
reset role;

select is((select array[status::text, settle_outcome] from public.engagements
            where id = '7a000000-0000-0000-0000-0000000e0001'),
  array['auto_released', 'release'], 'hire 1 is auto-released in full');
select ok((select status = 'auto_accepted' and decided_at = now() and decided_by is null
             from public.submissions where engagement_id = '7a000000-0000-0000-0000-0000000e0001'),
  'its submission is auto-accepted by nobody');
select is(public.wallet_balance('00000000-0000-0000-0000-00000007a101', 'creator_wallet'), 4750000::bigint,
  'creator 1 gets ₦47,500 for ₦50,000, net of our fee');
select ok((select bool_and(actor_user_id is null and reason = 'auto_released') from public.ledger_entries
            where engagement_id = '7a000000-0000-0000-0000-0000000e0001' and event_type = 'hire_settled'),
  'the release is recorded as the system''s');
select is((select array_agg(status::text order by id) from public.engagements
            where id in ('7a000000-0000-0000-0000-0000000e0002', '7a000000-0000-0000-0000-0000000e0003')),
  array['submitted', 'denied'], 'the hire still in time and the denied hire are untouched');
select is((select status from public.submissions where engagement_id = '7a000000-0000-0000-0000-0000000e0003'),
  'denied', 'the denied submission stays denied');

create temporary table ledger_before on commit drop as
select count(*)::integer as n from public.ledger_entries;
set local role service_role;
select is((select array[released, failed] from public.release_overdue_submissions()), array[0, 0], 'running it again releases nothing');
reset role;
select is((select count(*)::integer from public.ledger_entries), (select n from ledger_before),
  'and writes no ledger rows');
select is((select count(*)::integer from public.ledger_entries
            where engagement_id = '7a000000-0000-0000-0000-0000000e0001' and event_type = 'hire_settled'), 3,
  'hire 1 has one settlement group of three rows');

-- Reminders ----------------------------------------------------------------------------------------------------
set local role service_role;
select is(public.send_review_reminders(), 2, 'two reminders are sent: hires 2 and 8');
reset role;

select is((select data ->> 'days_left' from public.notifications
            where kind = 'review_reminder' and data ->> 'engagement_id' = '7a000000-0000-0000-0000-0000000e0002'),
  '3', 'deadline in 2.5 days: one reminder saying 3 days left');
select is((select data ->> 'days_left' from public.notifications
            where kind = 'review_reminder' and data ->> 'engagement_id' = '7a000000-0000-0000-0000-0000000e0008'),
  '1', 'deadline in 20 hours: one reminder saying 1 day left, not two');
select is((select count(*)::integer from public.notifications
            where kind = 'review_reminder' and data ->> 'engagement_id' like '7a000000-%'), 2,
  'one reminder per hire');
select is((select count(*)::integer from public.notifications
            where kind = 'review_reminder' and user_id <> '00000000-0000-0000-0000-00000007a001'
              and data ->> 'engagement_id' like '7a000000-%'), 0,
  'only the business is reminded');
select is((select data from public.notifications
            where kind = 'review_reminder' and data ->> 'engagement_id' = '7a000000-0000-0000-0000-0000000e0008'),
  jsonb_build_object('campaign_id', '7a000000-0000-0000-0000-000000000001',
                     'campaign_title', 'Auto-release test',
                     'engagement_id', '7a000000-0000-0000-0000-0000000e0008',
                     'name', 'Creator 8 Release',
                     'review_deadline_at', now() + interval '20 hours',
                     'days_left', 1),
  'the reminder carries the campaign, the hire, the creator and the deadline');
select ok((select reminded_3d_at = now() and reminded_1d_at is null from public.submissions
            where engagement_id = '7a000000-0000-0000-0000-0000000e0002'),
  'hire 2 is marked as reminded at 3 days only');
select ok((select reminded_3d_at = now() and reminded_1d_at = now() from public.submissions
            where engagement_id = '7a000000-0000-0000-0000-0000000e0008'),
  'hire 8 is marked as reminded at both, so the 3-day one never follows');

set local role service_role;
select is(public.send_review_reminders(), 0, 'running it again sends nothing');
reset role;
select is((select count(*)::integer from public.notifications
            where kind = 'review_reminder' and data ->> 'engagement_id' like '7a000000-%'), 2,
  'still two reminders');

-- A day later for hire 2: the 1-day reminder follows the 3-day one.
update public.submissions set review_deadline_at = now() + interval '20 hours'
 where engagement_id = '7a000000-0000-0000-0000-0000000e0002';
set local role service_role;
select is(public.send_review_reminders(), 1, 'hire 2 inside its last day: one more reminder');
reset role;
select is((select array_agg(data ->> 'days_left' order by data ->> 'days_left' desc) from public.notifications
            where kind = 'review_reminder' and data ->> 'engagement_id' = '7a000000-0000-0000-0000-0000000e0002'),
  array['3', '1'], 'hire 2 has its 3-day and its 1-day reminder');

-- The business acting after the deadline (hires 6 and 7) ----------------------------------------------------
update public.submissions set review_deadline_at = now() - interval '1 minute'
 where engagement_id in ('7a000000-0000-0000-0000-0000000e0006', '7a000000-0000-0000-0000-0000000e0007');
set local role authenticated;
set local request.jwt.claims = '{"sub": "7a7a7a7a-0000-0000-0000-00000007a001"}'; -- Ada
select is((select public.deny_submission('7a000000-0000-0000-0000-0000000e0006', array['Too late now'])), 'review_closed',
  'a late denial is answered review_closed');
select is((select public.accept_submission('7a000000-0000-0000-0000-0000000e0007')), 'auto_released',
  'a late accept is answered auto_released');
reset role;
select is((select array_agg(status::text order by id) from public.engagements
            where id in ('7a000000-0000-0000-0000-0000000e0006', '7a000000-0000-0000-0000-0000000e0007')),
  array['auto_released', 'auto_released'], 'both hires are auto-released');
select ok((select status = 'auto_accepted' and denial_reasons is null from public.submissions
            where engagement_id = '7a000000-0000-0000-0000-0000000e0006'),
  'the late denial left no reasons');
set local role service_role;
select is((select array[released, failed] from public.release_overdue_submissions()), array[0, 0], 'the job finds nothing left to release');
reset role;

-- The deadline boundary (hires 4 and 5) ------------------------------------------------------------------------
update public.submissions set review_deadline_at = now()
 where engagement_id = '7a000000-0000-0000-0000-0000000e0004';
update public.submissions set review_deadline_at = now() + interval '1 second'
 where engagement_id = '7a000000-0000-0000-0000-0000000e0005';
set local role service_role;
select is((select array[released, failed] from public.release_overdue_submissions()), array[1, 0], 'one hire is released at the boundary');
reset role;
select is((select status::text from public.engagements where id = '7a000000-0000-0000-0000-0000000e0004'),
  'auto_released', 'a deadline of exactly now is past');
select is((select status::text from public.engagements where id = '7a000000-0000-0000-0000-0000000e0005'),
  'submitted', 'a deadline one second from now is not');

-- One broken hire doesn't stop the others (hires 2 and 5) -----------------------------------------------------
-- A correction takes ₦1 out of hire 2's escrow, so settle_money() refuses it
-- with escrow_mismatch; hire 5 is overdue too.
select public.post_ledger_group('correction', null, 'test: break hire 2''s escrow',
  '7a000000-0000-0000-0000-0000000e0002', null, null, null, null,
  '[{"account": "escrow", "amount": 100}, {"account": "platform_revenue", "amount": -100}]');
update public.submissions set review_deadline_at = now() - interval '1 minute'
 where engagement_id in ('7a000000-0000-0000-0000-0000000e0002', '7a000000-0000-0000-0000-0000000e0005');
set local role service_role;
select is((select array[released, failed] from public.release_overdue_submissions()), array[1, 1],
  'one hire released, one failed, in the same run');
reset role;
select is((select status::text from public.engagements where id = '7a000000-0000-0000-0000-0000000e0005'),
  'auto_released', 'hire 5 is released despite hire 2');
select is((select array[g.status::text, s.status] from public.engagements g
             join public.submissions s on s.engagement_id = g.id and s.round = 1
            where g.id = '7a000000-0000-0000-0000-0000000e0002'),
  array['submitted', 'pending_review'], 'hire 2''s own work is rolled back: still submitted and waiting');
select is((select count(*)::integer from public.ledger_entries
            where engagement_id = '7a000000-0000-0000-0000-0000000e0002' and event_type = 'hire_settled'), 0,
  'and nothing was settled for it');

-- Reversed, the next run releases it.
select public.post_ledger_group('correction', null, 'test: restore hire 2''s escrow',
  '7a000000-0000-0000-0000-0000000e0002', null, null, null, null,
  '[{"account": "escrow", "amount": -100}, {"account": "platform_revenue", "amount": 100}]');
set local role service_role;
select is((select array[released, failed] from public.release_overdue_submissions()), array[1, 0],
  'the next run retries hire 2 and releases it');
reset role;
select is((select status::text from public.engagements where id = '7a000000-0000-0000-0000-0000000e0002'),
  'auto_released', 'hire 2 is auto-released');

-- Proof files: the owner's folder ----------------------------------------------------------------------------
set local role service_role;
select throws_ok($$ select public.register_proof_file('00000000-0000-0000-0000-00000007a101', 'c1/x.webp', 'image/webp', 1) $$,
  'P0001', 'proof_invalid', 'a path outside the owner''s folder is refused');
select throws_ok($$ select public.register_proof_file('00000000-0000-0000-0000-00000007a101',
                      '00000000-0000-0000-0000-00000007a102/x.webp', 'image/webp', 1) $$,
  'P0001', 'proof_invalid', 'a path in another person''s folder is refused');
select throws_ok($$ select public.register_proof_file('00000000-0000-0000-0000-00000007a101',
                      '00000000-0000-0000-0000-00000007a101x.webp', 'image/webp', 1) $$,
  'P0001', 'proof_invalid', 'the owner''s id without the folder slash is refused');
select throws_ok($$ select public.register_proof_file('00000000-0000-0000-0000-00000007a101', null, 'image/webp', 1) $$,
  'P0001', 'proof_invalid', 'a missing path is refused');

-- Orphan files: one old, one new, one old but attached --------------------------------------------------------
create temporary table files on commit drop as
select public.register_proof_file('00000000-0000-0000-0000-00000007a101',
         '00000000-0000-0000-0000-00000007a101/old.webp', 'image/webp', 1000) as old,
       public.register_proof_file('00000000-0000-0000-0000-00000007a101',
         '00000000-0000-0000-0000-00000007a101/new.webp', 'image/webp', 1000) as new,
       public.register_proof_file('00000000-0000-0000-0000-00000007a103',
         '00000000-0000-0000-0000-00000007a103/kept.webp', 'image/webp', 1000) as attached;
reset role;
grant select on files to authenticated;
select is((select count(*)::integer from public.proof_files where id in
            ((select old from files), (select new from files), (select attached from files))), 3,
  'a file in the owner''s folder is registered');

-- Creator 3 resubmits on the denied hire with their file.
set local role authenticated;
set local request.jwt.claims = '{"sub": "7a7a7a7a-0000-0000-0000-00000007a103"}'; -- creator 3
select lives_ok($$ select public.submit_work('7a000000-0000-0000-0000-0000000e0003', null, null,
                     array[(select attached from files)]) $$,
  'creator 3 attaches their file to a resubmission');
reset role;

update public.proof_files set created_at = now() - interval '25 hours'
 where id in ((select old from files), (select attached from files));
update public.proof_files set created_at = now() - interval '23 hours' where id = (select new from files);

set local role service_role;
select is((select array_agg(p) from public.delete_orphan_proof_files() p where p like '00000000-0000-0000-0000-00000007a1%'),
  array['00000000-0000-0000-0000-00000007a101/old.webp'],
  'only the unattached file older than a day is deleted, and its path returned');
reset role;
select ok(not exists (select 1 from public.proof_files where id = (select old from files)), 'its row is gone');
select ok(exists (select 1 from public.proof_files where id = (select new from files)),
  'an unattached file under a day old is kept');
select ok(exists (select 1 from public.proof_files where id = (select attached from files)),
  'an attached file is kept however old');
set local role service_role;
select is((select count(*)::integer from public.delete_orphan_proof_files() p
            where p like '00000000-0000-0000-0000-00000007a1%'), 0,
  'running it again deletes nothing');
reset role;

-- Totals ---------------------------------------------------------------------------------------------------------
select is((select count(*)::integer from (
  select group_id from public.ledger_entries group by group_id having sum(amount_kobo) <> 0) g), 0,
  'every group sums to zero');
select is((select count(*)::integer from (
  select engagement_id from public.ledger_entries
   where engagement_id::text like '7a000000-%' and event_type = 'hire_settled'
   group by engagement_id having count(distinct group_id) > 1) d), 0,
  'no hire has two settlement groups');
select is(public.wallet_balance('00000000-0000-0000-0000-00000007a104', 'creator_wallet')
          + public.wallet_balance('00000000-0000-0000-0000-00000007a106', 'creator_wallet')
          + public.wallet_balance('00000000-0000-0000-0000-00000007a107', 'creator_wallet'), 14250000::bigint,
  'creators 4, 6 and 7 get ₦47,500 each');

select * from finish();
rollback;
