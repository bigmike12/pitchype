-- Proves the final-submission rules from the final_submission_rules migration:
-- a hire on a checkpoint campaign cannot send its final work while a checkpoint
-- (or the kickoff) whose time has passed has no evidence, but can once every
-- one has evidence, late or not, and a future checkpoint never blocks;
-- a campaign's final requirements are enforced, also on resubmission; and once
-- the work is accepted everything is exactly as before (7 days to review, hire
-- submitted, no money moved). A campaign with neither behaves as before.
-- Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(46);

-- Ada is a business, Efe an admin; creators cd101..cd106 are hired by Ada.
insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000cd001', 'cdcdcdcd-0000-0000-0000-0000000cd001', 'ada.fs@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000cd003', 'cdcdcdcd-0000-0000-0000-0000000cd003', 'efe.fs@example.com', 'admin');
insert into public.users (id, auth_user_id, email, role)
select ('00000000-0000-0000-0000-0000000cd1' || lpad(n::text, 2, '0'))::uuid,
       ('cdcdcdcd-0000-0000-0000-0000000cd1' || lpad(n::text, 2, '0'))::uuid,
       'c' || n || '.fs@example.com', 'influencer'
  from generate_series(1, 6) n;
insert into public.business_profiles (user_id, business_name, contact_name, state, city) values
  ('00000000-0000-0000-0000-0000000cd001', 'Ada Final Kitchen', 'Ada Obi', 'Lagos', 'Ikeja');
insert into public.influencer_profiles (user_id, display_name, state, city, niches, published)
select ('00000000-0000-0000-0000-0000000cd1' || lpad(n::text, 2, '0'))::uuid,
       'Creator ' || n || ' Final', 'Lagos', 'Yaba', '{fashion}', true
  from generate_series(1, 6) n;

-- P: weekly checkpoints, no final requirements. Q: final links and a report.
-- R: final analytics and screenshots. S: neither (today's rules).
insert into public.campaigns (id, business_id, status, title, brief, price_kobo, places,
                              applications_close_on, post_from, ends_on, deliver_by, published_at, submitted_at,
                              checkpoints_enabled, checkpoint_interval_days, checkpoint_evidence, final_requirements) values
  ('cd000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000cd001', 'open', 'Final P',
   'A brief that is long enough for the checks.', 5000000, 20, public.lagos_today() + 10,
   public.lagos_today() - 5, public.lagos_today() + 40, public.lagos_today() + 30, now(), now(),
   true, 7, '{progress_update}', '{}'),
  ('cd000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000cd001', 'open', 'Final Q',
   'A brief that is long enough for the checks.', 5000000, 20, public.lagos_today() + 10,
   null, null, public.lagos_today() + 30, now(), now(), false, null, null, '{content_links,final_report}'),
  ('cd000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000cd001', 'open', 'Final R',
   'A brief that is long enough for the checks.', 5000000, 20, public.lagos_today() + 10,
   public.lagos_today() - 5, public.lagos_today() + 40, public.lagos_today() + 30, now(), now(),
   false, null, null, '{analytics,publication_screenshots}'),
  ('cd000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000cd001', 'open', 'Final S',
   'A brief that is long enough for the checks.', 5000000, 20, public.lagos_today() + 10,
   null, null, public.lagos_today() + 30, now(), now(), false, null, null, '{}');
insert into public.campaign_checkpoints (campaign_id, seq, due_on) values
  ('cd000000-0000-0000-0000-000000000001', 1, public.lagos_today() + 5),
  ('cd000000-0000-0000-0000-000000000001', 2, public.lagos_today() + 12);

-- Hire n is creator n's: 1 and 2 on P, 3 and 6 on Q, 4 on R, 5 on S.
create temporary table hires (n integer primary key, campaign uuid, creator uuid, engagement uuid) on commit drop;
insert into hires
select n,
       case when n in (1, 2) then 'cd000000-0000-0000-0000-000000000001'::uuid
            when n in (3, 6) then 'cd000000-0000-0000-0000-000000000002'::uuid
            when n = 4 then 'cd000000-0000-0000-0000-000000000003'::uuid
            else 'cd000000-0000-0000-0000-000000000004'::uuid end,
       ('00000000-0000-0000-0000-0000000cd1' || lpad(n::text, 2, '0'))::uuid,
       ('cd000000-0000-0000-0000-0000000e00' || lpad(n::text, 2, '0'))::uuid
  from generate_series(1, 6) n;
grant select on hires to authenticated;
insert into public.applications (id, campaign_id, creator_id, status)
select ('cd000000-0000-0000-0000-0000000a00' || lpad(h.n::text, 2, '0'))::uuid, h.campaign, h.creator, 'approved' from hires h;
insert into public.engagements (id, application_id, campaign_id, business_id, creator_id, agreed_price_kobo, pay_by)
select h.engagement, ('cd000000-0000-0000-0000-0000000a00' || lpad(h.n::text, 2, '0'))::uuid, h.campaign,
       '00000000-0000-0000-0000-0000000cd001', h.creator, 5000000, now() + interval '48 hours'
  from hires h;

do $$
declare
  h record;
  started jsonb;
begin
  for h in select * from hires order by n loop
    perform set_config('request.jwt.claims', '{"sub": "cdcdcdcd-0000-0000-0000-0000000cd001"}', true);
    started := public.start_payment(h.engagement, true);
    perform public.record_card_payment(started ->> 'reference', (started ->> 'card_amount_kobo')::bigint,
      95406, 'evt-fs-' || h.n, '{}');
    perform set_config('request.jwt.claims', json_build_object('sub',
      'cdcdcdcd-0000-0000-0000-0000000cd1' || lpad(h.n::text, 2, '0'))::text, true);
    perform public.start_engagement(h.engagement);
  end loop;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- Screenshots registered by the server.
create temporary table files on commit drop as
select public.register_proof_file(h4.creator, h4.creator::text || '/a.webp', 'image/webp', 100000) as c4_a,
       public.register_proof_file(h4.creator, h4.creator::text || '/b.webp', 'image/webp', 100000) as c4_b,
       public.register_proof_file(h4.creator, h4.creator::text || '/c.webp', 'image/webp', 100000) as c4_c
  from (select creator from hires where n = 4) h4;
grant select on files to authenticated;

create temporary table before_ledger on commit drop as
  select count(*) as n, coalesce(sum(amount_kobo), 0) as total from public.ledger_entries;

-- Hire 1: the kickoff is overdue. Hire 2: the kickoff is done, the first checkpoint is overdue.
update public.hire_checkpoints set status = 'overdue', due_at = now() - interval '1 day'
 where engagement_id = (select engagement from hires where n = 1) and kind = 'kickoff';
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cd102"}';
set local role authenticated;
select isnt(public.submit_kickoff((select engagement from hires where n = 2), true, true, null, null), null, 'creator 2 confirms the kickoff');
reset role;
update public.hire_checkpoints set status = 'overdue', due_at = now() - interval '1 day'
 where engagement_id = (select engagement from hires where n = 2) and kind = 'progress'
   and due_at = (select min(due_at) from public.hire_checkpoints c
                  where c.engagement_id = (select engagement from hires where n = 2) and c.kind = 'progress');

-- Checkpoint rules ----------------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cd101"}'; -- creator 1
select throws_ok($$ select public.submit_work((select engagement from hires where n = 1), null, array['https://x.com/p/1'], null) $$,
  'P0001', 'checkpoints_outstanding', 'a missed kickoff blocks the final submission');
select is((select count(*)::int from public.submissions where engagement_id = (select engagement from hires where n = 1)), 0,
  'and nothing was written');
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cd102"}'; -- creator 2
select throws_ok($$ select public.submit_work((select engagement from hires where n = 2), null, array['https://x.com/p/1'], null) $$,
  'P0001', 'checkpoints_outstanding', 'so does a missed progress checkpoint');
select throws_ok($$ select public.submit_work((select engagement from hires where n = 2), null, array['https://x.com/p/1'], null,
    null, null, null) $$, 'P0001', 'checkpoints_outstanding', 'in the longer form too');

-- Catching up unblocks it. Hire 1 confirms its kickoff late; its other checkpoint is still in the future.
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cd101"}';
select isnt(public.submit_kickoff((select engagement from hires where n = 1), true, true, null, null), null, 'creator 1 confirms the kickoff late');
select is((select status from public.hire_checkpoints where engagement_id = (select engagement from hires where n = 1) and kind = 'kickoff'),
  'done_late', 'recorded as late');
select isnt(public.submit_work((select engagement from hires where n = 1), 'All three posts are live.', array['https://x.com/p/1'], null),
  null, 'with the kickoff in, a checkpoint still to come does not block the final submission');
reset role;
select is((select status::text from public.engagements where id = (select engagement from hires where n = 1)), 'submitted',
  'the hire is submitted');
select is((select review_deadline_at from public.submissions where engagement_id = (select engagement from hires where n = 1)),
  now() + interval '7 days', 'the business has exactly 7 days to review, as always');
select is((select array_agg(status order by due_at) from public.hire_checkpoints
            where engagement_id = (select engagement from hires where n = 1) and kind = 'progress'),
  array['closed', 'closed'], 'the checkpoints still to come are closed, the final work covers them');
select is((select count(*)::int from public.checkpoint_events
            where engagement_id = (select engagement from hires where n = 1) and event = 'closed'),
  2, 'each closing is in the trail');
select is((select count(*)::int from public.ledger_entries where engagement_id = (select engagement from hires where n = 1)
            and event_type = 'hire_settled'), 0, 'submitting moved no money');

-- Hire 2 sends the missed checkpoint late, then can submit.
set local role authenticated;
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cd102"}';
select isnt(public.submit_checkpoint(
  (select c.id from public.hire_checkpoints c where c.engagement_id = (select engagement from hires where n = 2)
      and c.kind = 'progress' and c.status = 'overdue'),
  'Filmed two of the three reels so far.', null, null, null, null, null, null), null, 'creator 2 sends the missed checkpoint late');
select isnt(public.submit_work((select engagement from hires where n = 2), null, array['https://x.com/p/1'], null), null,
  'and then submits the final work');
reset role;
select is((select status::text from public.engagements where id = (select engagement from hires where n = 2)), 'submitted',
  'hire 2 is submitted');
select is((select status from public.hire_checkpoints where engagement_id = (select engagement from hires where n = 2)
              and due_at > now() and kind = 'progress'), 'closed', 'its later checkpoint is closed');

-- A denial and a resubmission: checkpoints don't come back ----------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cd001"}'; -- Ada
select is(public.deny_submission((select engagement from hires where n = 2), array['Show the product label clearly']), 'denied',
  'Ada denies the work');
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cd102"}';
select isnt(public.submit_work((select engagement from hires where n = 2), null, array['https://x.com/p/2'], null), null,
  'the resubmission needs no checkpoints: the closed ones are final');
reset role;

-- Final requirements: Q needs https links and a report -----------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cd103"}'; -- creator 3
select throws_ok($$ select public.submit_work((select engagement from hires where n = 3), null, array['https://x.com/p/1'], null) $$,
  'P0001', 'final_requirements_missing', 'the four-argument call has no report, so it is refused');
select throws_ok($$ select public.submit_work((select engagement from hires where n = 3), null, array['https://x.com/p/1'], null,
    null, null, 'Too short to be a report.') $$,
  'P0001', 'final_requirements_missing', 'a report under 100 characters does not count');
select throws_ok($$ select public.submit_work((select engagement from hires where n = 3), null, array['http://x.com/p/1'], null,
    null, null, repeat('r', 120)) $$,
  'P0001', 'final_requirements_missing', 'links must be https when links are required');
select throws_ok($$ select public.submit_work((select engagement from hires where n = 3), null, null, null,
    null, null, repeat('r', 120)) $$,
  'P0001', 'final_requirements_missing', 'a report without links is missing the links');
select throws_ok($$ select public.submit_work((select engagement from hires where n = 3), null, array['https://x.com/p/1'], null,
    null, null, repeat('r', 1001)) $$,
  'P0001', 'proof_invalid', 'a report over 1,000 characters is refused');
select throws_ok($$ select public.submit_work((select engagement from hires where n = 3), null, array['https://x.com/p/1'], null,
    null, null, repeat('r', 100) || ' call 0803 123 4567') $$,
  'P0001', 'contact_details', 'contact details are refused in the report');
select isnt(public.submit_work((select engagement from hires where n = 3), null, array['https://x.com/p/1'], null,
    null, null, repeat('r', 120)), null, 'links and a report are accepted');
select is((select report from public.submissions where engagement_id = (select engagement from hires where n = 3)),
  repeat('r', 120), 'the report is stored');
-- Denied, then resubmitted without a report: refused again.
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cd001"}';
select is(public.deny_submission((select engagement from hires where n = 3), array['Add more detail']), 'denied', 'Ada denies it');
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cd103"}';
select throws_ok($$ select public.submit_work((select engagement from hires where n = 3), null, array['https://x.com/p/2'], null) $$,
  'P0001', 'final_requirements_missing', 'the requirements apply to a resubmission too');
select isnt(public.submit_work((select engagement from hires where n = 3), null, array['https://x.com/p/2'], null,
    null, null, repeat('s', 150)), null, 'and it is accepted once they are met');

-- R needs analytics and screenshots ---------------------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cd104"}'; -- creator 4
select throws_ok($$ select public.submit_work((select engagement from hires where n = 4), null, array['https://x.com/p/1'], null) $$,
  'P0001', 'final_requirements_missing', 'links alone are not enough when analytics and screenshots are required');
select throws_ok($$ select public.submit_work((select engagement from hires where n = 4), null, null, array[(select c4_a from files)],
    '[{"platform": "instagram", "views": 900}]', null, null) $$,
  'P0001', 'final_requirements_missing', 'analytics need the capture day');
select throws_ok($$ select public.submit_work((select engagement from hires where n = 4), null, null, array[(select c4_a from files)],
    null, public.lagos_today(), null) $$,
  'P0001', 'final_requirements_missing', 'and the figures');
select throws_ok($$ select public.submit_work((select engagement from hires where n = 4), null, null, array[(select c4_a from files)],
    '[{"platform": "instagram", "views": 900}]', public.lagos_today() + 1, null) $$,
  'P0001', 'proof_invalid', 'the capture day cannot be in the future');
select throws_ok($$ select public.submit_work((select engagement from hires where n = 4), null, null, array[(select c4_a from files)],
    '[{"platform": "instagram", "views": 900}]', public.lagos_today() - 6, null) $$,
  'P0001', 'proof_invalid', 'or before the campaign started');
select throws_ok($$ select public.submit_work((select engagement from hires where n = 4), null, null, array[(select c4_a from files)],
    '[{"platform": "instagram", "views": -1}]', public.lagos_today(), null) $$,
  'P0001', 'proof_invalid', 'figures cannot be negative');
select isnt(public.submit_work((select engagement from hires where n = 4), 'Numbers from this morning.', null,
    array[(select c4_a from files), (select c4_b from files)],
    '[{"platform": "instagram", "views": 900, "reach": 700}]', public.lagos_today(), null), null,
  'screenshots, figures and a capture day are accepted');
select is((select metrics -> 0 ->> 'reach' from public.submissions where engagement_id = (select engagement from hires where n = 4)),
  '700', 'the figures are stored with the submission');
select is((select captured_on from public.submissions where engagement_id = (select engagement from hires where n = 4)),
  public.lagos_today(), 'and the capture day');

-- S: neither checkpoints nor requirements: exactly today's rules ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cd105"}'; -- creator 5
select throws_ok($$ select public.submit_work((select engagement from hires where n = 5), 'Done', null, null) $$,
  'P0001', 'proof_required', 'a note alone is not proof');
select lives_ok($$ select public.submit_work((select engagement from hires where n = 5), '  Posted on Monday  ',
                     array[' https://instagram.com/p/abc ', 'http://tiktok.com/@c5/video/1'], null) $$,
  'the four-argument call works as before, http links included');
reset role;
select is((select array[round::text, status, note] from public.submissions where engagement_id = (select engagement from hires where n = 5)),
  array['1', 'pending_review', 'Posted on Monday'], 'round 1 waits for review, with the trimmed note');
select is((select review_deadline_at from public.submissions where engagement_id = (select engagement from hires where n = 5)),
  now() + interval '7 days', 'with exactly 7 days to review');
select is((select array[metrics::text, captured_on::text, report] from public.submissions
            where engagement_id = (select engagement from hires where n = 5)),
  array[null, null, null]::text[], 'and none of the new fields set');

-- Nothing moved ---------------------------------------------------------------------------------------------------------------------------
select is((select count(*) from public.ledger_entries), (select n from before_ledger),
  'no final submission or checkpoint wrote a ledger row');
select is((select count(*)::int from public.engagements where id in (select engagement from hires where n <= 5) and status::text <> 'submitted'), 0,
  'every hire that submitted is submitted (none settled)');

select * from finish();
rollback;
