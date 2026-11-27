-- Proves the per-hire checkpoint rules from the hire_checkpoints migration:
-- what start_engagement() creates (a kickoff and the campaign's checkpoints,
-- applied or skipped by the creator's start date), the kickoff and evidence
-- functions (who, when, what each kind of evidence needs, on time or late),
-- who reads what, and that none of it touches the ledger or an engagement.
-- Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(81);

-- Ada and Bola are businesses, Efe is an admin, creators cc101..cc106 are hired by Ada.
insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000cc001', 'cccccccc-0000-0000-0000-0000000cc001', 'ada.cp@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000cc002', 'cccccccc-0000-0000-0000-0000000cc002', 'bola.cp@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000cc003', 'cccccccc-0000-0000-0000-0000000cc003', 'efe.cp@example.com', 'admin');
insert into public.users (id, auth_user_id, email, role)
select ('00000000-0000-0000-0000-0000000cc1' || lpad(n::text, 2, '0'))::uuid,
       ('cccccccc-0000-0000-0000-0000000cc1' || lpad(n::text, 2, '0'))::uuid,
       'c' || n || '.cp@example.com', 'influencer'
  from generate_series(1, 6) n;

insert into public.business_profiles (user_id, business_name, contact_name, state, city) values
  ('00000000-0000-0000-0000-0000000cc001', 'Ada Checkpoint Kitchen', 'Ada Obi', 'Lagos', 'Ikeja'),
  ('00000000-0000-0000-0000-0000000cc002', 'Bola Checkpoint Shop', 'Bola A', 'Oyo', 'Ibadan');
insert into public.influencer_profiles (user_id, display_name, state, city, niches, published)
select ('00000000-0000-0000-0000-0000000cc1' || lpad(n::text, 2, '0'))::uuid,
       'Creator ' || n || ' Checkpoint', 'Lagos', 'Yaba', '{fashion}', true
  from generate_series(1, 6) n;

-- Campaign A asks for a written update and links; B for analytics; C has no checkpoints.
insert into public.campaigns (id, business_id, status, title, brief, price_kobo, places,
                              applications_close_on, post_from, ends_on, deliver_by, published_at, submitted_at,
                              checkpoints_enabled, checkpoint_interval_days, checkpoint_evidence) values
  ('cc000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000cc001', 'open', 'Checkpoints A',
   'A brief that is long enough for the checks.', 5000000, 20, public.lagos_today() + 10,
   public.lagos_today() - 5, public.lagos_today() + 40, public.lagos_today() + 30, now(), now(),
   true, 7, '{progress_update,content_links}'),
  ('cc000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000cc001', 'open', 'Checkpoints B',
   'A brief that is long enough for the checks.', 5000000, 20, public.lagos_today() + 10,
   public.lagos_today() - 5, public.lagos_today() + 40, public.lagos_today() + 30, now(), now(),
   true, 7, '{analytics,publication_screenshots}'),
  ('cc000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000cc001', 'open', 'No checkpoints',
   'A brief that is long enough for the checks.', 5000000, 20, public.lagos_today() + 10,
   null, null, public.lagos_today() + 30, now(), now(), false, null, null);

-- The schedule, relative to today (the day the creators start): one date already
-- past, one today, one two days ahead, one three days ahead, one ten days ahead.
insert into public.campaign_checkpoints (campaign_id, seq, due_on)
select 'cc000000-0000-0000-0000-000000000001', s.seq, public.lagos_today() + s.days
  from (values (1, -1), (2, 0), (3, 2), (4, 3), (5, 10)) as s (seq, days);
insert into public.campaign_checkpoints (campaign_id, seq, due_on) values
  ('cc000000-0000-0000-0000-000000000002', 1, public.lagos_today() + 5);

-- Hire 1, 4 and 5: A; hire 2: B; hire 3: C; hire 6: A.
create temporary table hires (n integer primary key, campaign uuid, creator uuid, engagement uuid) on commit drop;
insert into hires
select n,
       case n when 2 then 'cc000000-0000-0000-0000-000000000002'::uuid
              when 3 then 'cc000000-0000-0000-0000-000000000003'::uuid
              else 'cc000000-0000-0000-0000-000000000001'::uuid end,
       ('00000000-0000-0000-0000-0000000cc1' || lpad(n::text, 2, '0'))::uuid,
       ('cc000000-0000-0000-0000-0000000e00' || lpad(n::text, 2, '0'))::uuid
  from generate_series(1, 6) n;
grant select on hires to authenticated;

insert into public.applications (id, campaign_id, creator_id, status)
select ('cc000000-0000-0000-0000-0000000a00' || lpad(h.n::text, 2, '0'))::uuid, h.campaign, h.creator, 'approved' from hires h;
insert into public.engagements (id, application_id, campaign_id, business_id, creator_id, agreed_price_kobo, pay_by)
select h.engagement, ('cc000000-0000-0000-0000-0000000a00' || lpad(h.n::text, 2, '0'))::uuid, h.campaign,
       '00000000-0000-0000-0000-0000000cc001', h.creator, 5000000, now() + interval '48 hours'
  from hires h;

-- Fund every hire by card, then every creator starts work.
do $$
declare
  h record;
  started jsonb;
begin
  for h in select * from hires order by n loop
    perform set_config('request.jwt.claims', '{"sub": "cccccccc-0000-0000-0000-0000000cc001"}', true);
    started := public.start_payment(h.engagement, true);
    perform public.record_card_payment(started ->> 'reference', (started ->> 'card_amount_kobo')::bigint,
      95406, 'evt-cp-' || h.n, '{}');
    perform set_config('request.jwt.claims', json_build_object('sub',
      'cccccccc-0000-0000-0000-0000000cc1' || lpad(h.n::text, 2, '0'))::text, true);
    perform public.start_engagement(h.engagement);
  end loop;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- What start_engagement made -----------------------------------------------------------------------------
select is(
  (select array_agg(coalesce(c.skip_reason, c.status) order by c.kind <> 'kickoff', c.due_at)
     from public.hire_checkpoints c where c.engagement_id = (select engagement from hires where n = 1)),
  array['due', 'started_after', 'too_soon', 'too_soon', 'due', 'due'],
  'a creator who starts on the day: the kickoff, then past and near checkpoints skipped, later ones due');
select is(
  (select c.due_at - e.started_at from public.hire_checkpoints c
     join public.engagements e on e.id = c.engagement_id
    where c.engagement_id = (select engagement from hires where n = 1) and c.kind = 'kickoff'),
  interval '48 hours', 'the kickoff is due 48 hours after Start work');
select is(
  (select c.due_at from public.hire_checkpoints c
     join public.campaign_checkpoints k on k.id = c.campaign_checkpoint_id
    where c.engagement_id = (select engagement from hires where n = 1) and k.seq = 4),
  timezone('Africa/Lagos', (public.lagos_today() + 3 + 1)::timestamp),
  'a checkpoint is due at the end of its day, Lagos time');
select is(
  (select array_agg(event order by event) from (
     select ev.event from public.checkpoint_events ev
      where ev.engagement_id = (select engagement from hires where n = 1)) x),
  array['applied', 'applied', 'applied', 'skipped', 'skipped', 'skipped'],
  'the trail records what applied and what was skipped');
select is(
  (select count(*)::int from public.hire_checkpoints where engagement_id = (select engagement from hires where n = 3)),
  0, 'a campaign without checkpoints gives its hires none');

-- The Lagos rule, on its own ----------------------------------------------------------------------------------
select is(public.checkpoint_applicability('2026-12-08', '2026-12-05 08:00+01'), 'applies', 'three days after the start applies');
select is(public.checkpoint_applicability('2026-12-08', '2026-12-06 08:00+01'), 'too_soon', 'two days after is too soon');
select is(public.checkpoint_applicability('2026-12-08', '2026-12-08 08:00+01'), 'too_soon', 'the start day itself is too soon');
select is(public.checkpoint_applicability('2026-12-08', '2026-12-09 08:00+01'), 'started_after', 'after it has passed: started_after');
select is(public.checkpoint_applicability('2026-12-08', '2026-12-04 22:30+00'), 'applies', '23:30 in Lagos on 4 Dec starts on the 4th');
select is(public.checkpoint_applicability('2026-12-08', '2026-12-05 23:30+00'), 'too_soon', '00:30 in Lagos on 6 Dec starts on the 6th, not the UTC day');

-- The checkpoint rows of hires 1 and 2, by their schedule number.
create temporary table c1 on commit drop as
  select max(c.id::text) filter (where k.seq = 1)::uuid as past,
         max(c.id::text) filter (where k.seq = 2)::uuid as today,
         max(c.id::text) filter (where k.seq = 4)::uuid as next,
         max(c.id::text) filter (where k.seq = 5)::uuid as later
    from public.hire_checkpoints c join public.campaign_checkpoints k on k.id = c.campaign_checkpoint_id
   where c.engagement_id = (select engagement from hires where n = 1);
grant select on c1 to authenticated;
create temporary table c2 on commit drop as
  select c.id from public.hire_checkpoints c where c.engagement_id = (select engagement from hires where n = 2) and c.kind = 'progress';
grant select on c2 to authenticated;

-- Snapshots to prove nothing moves money or changes a hire --------------------------------------------------------
create temporary table before_ledger on commit drop as
  select count(*) as n, coalesce(sum(amount_kobo), 0) as total from public.ledger_entries;
create temporary table before_hires on commit drop as
  select e.id, to_jsonb(e) as row from public.engagements e where e.id in (select engagement from hires);

-- Screenshots registered by the server: creator 2 owns two, creator 1 one.
create temporary table files on commit drop as
select public.register_proof_file(c2.creator, c2.creator::text || '/two-a.webp', 'image/webp', 100000) as two_a,
       public.register_proof_file(c2.creator, c2.creator::text || '/two-b.webp', 'image/webp', 100000) as two_b,
       public.register_proof_file(c1.creator, c1.creator::text || '/one-a.webp', 'image/webp', 100000) as one_a,
       public.register_proof_file(c1.creator, c1.creator::text || '/one-b.webp', 'image/webp', 100000) as one_b
  from (select creator from hires where n = 1) c1, (select creator from hires where n = 2) c2;
grant select on files to authenticated;

-- The kickoff ------------------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-0000000cc104"}'; -- creator 4
select throws_ok($$ select public.submit_kickoff((select engagement from hires where n = 1), true, true, null, null) $$,
  'P0001', 'no_such_engagement', 'another creator cannot send a kickoff');
set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-0000000cc001"}'; -- Ada
select throws_ok($$ select public.submit_kickoff((select engagement from hires where n = 1), true, true, null, null) $$,
  'P0001', 'no_such_engagement', 'the business cannot either');
set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-0000000cc101"}'; -- creator 1
select throws_ok($$ select public.submit_kickoff((select engagement from hires where n = 1), true, false, null, null) $$,
  'P0001', 'kickoff_confirmations_required', 'both confirmations are needed');
select throws_ok($$ select public.submit_kickoff((select engagement from hires where n = 1), false, true, null, null) $$,
  'P0001', 'kickoff_confirmations_required', 'both of them');
select throws_ok($$ select public.submit_kickoff((select engagement from hires where n = 1), true, true, repeat('x', 501), null) $$,
  'P0001', 'proof_invalid', 'the note is up to 500 characters');
select throws_ok($$ select public.submit_kickoff((select engagement from hires where n = 1), true, true, 'Call me on 0803 123 4567', null) $$,
  'P0001', 'contact_details', 'contact details are refused');
select isnt(public.submit_kickoff((select engagement from hires where n = 1), true, true, 'Product received and shoot booked.',
  array[(select one_a from files)]), null, 'the creator confirms the kickoff, with a screenshot');
select is(
  (select c.status from public.hire_checkpoints c
    where c.engagement_id = (select engagement from hires where n = 1) and c.kind = 'kickoff'),
  'done', 'the kickoff is done');
set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-0000000cc103"}'; -- creator 3
select throws_ok($$ select public.submit_kickoff((select engagement from hires where n = 3), true, true, null, null) $$,
  'P0001', 'checkpoint_closed', 'a hire on a campaign without checkpoints has no kickoff');

-- Progress evidence ------------------------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-0000000cc101"}'; -- creator 1

-- A checkpoint opens the day before its due day, Lagos time (20261201100000).
select throws_ok($$ select public.submit_checkpoint((select later from c1), 'Filmed two of the three reels so far.', array['https://x.com/p/1'], null, null, null, null, null) $$,
  'P0001', 'checkpoint_not_open', 'a checkpoint ten days ahead takes no evidence yet');
select throws_ok($$ select public.submit_checkpoint((select next from c1), 'Filmed two of the three reels so far.', array['https://x.com/p/1'], null, null, null, null, null) $$,
  'P0001', 'checkpoint_not_open', 'nor one three days ahead');
reset role;
update public.hire_checkpoints set due_at = timezone('Africa/Lagos', (public.lagos_today() + 3)::timestamp)
 where id = (select next from c1);
set local role authenticated;
set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-0000000cc101"}'; -- creator 1
select throws_ok($$ select public.submit_checkpoint((select next from c1), 'Filmed two of the three reels so far.', array['https://x.com/p/1'], null, null, null, null, null) $$,
  'P0001', 'checkpoint_not_open', 'one due the day after tomorrow opens tomorrow, not today');
-- From here `next` is due at the end of tomorrow, so it opened at the start of
-- today; campaign B's checkpoint likewise.
reset role;
update public.hire_checkpoints set due_at = timezone('Africa/Lagos', (public.lagos_today() + 2)::timestamp)
 where id = (select next from c1) or id = (select id from c2);
set local role authenticated;
set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-0000000cc101"}'; -- creator 1

select throws_ok($$ select public.submit_checkpoint((select past from c1), 'Already past, so skipped for me.', array['https://x.com/p/1'], null, null, null, null, null) $$,
  'P0001', 'checkpoint_closed', 'a skipped checkpoint takes no evidence');
select throws_ok($$ select public.submit_checkpoint((select next from c1), null, null, null, null, null, null, null) $$,
  'P0001', 'checkpoint_evidence_missing', 'nothing sent is missing everything');
select throws_ok($$ select public.submit_checkpoint((select next from c1), 'Filmed two of the three reels so far.', null, null, null, null, null, null) $$,
  'P0001', 'checkpoint_evidence_missing', 'a note without links is missing the links');
select throws_ok($$ select public.submit_checkpoint((select next from c1), null, array['https://x.com/p/1'], null, null, null, null, null) $$,
  'P0001', 'checkpoint_evidence_missing', 'links without a note are missing the note');
select throws_ok($$ select public.submit_checkpoint((select next from c1), 'Too short', array['https://x.com/p/1'], null, null, null, null, null) $$,
  'P0001', 'checkpoint_evidence_missing', 'a note under 20 characters does not count');
select throws_ok($$ select public.submit_checkpoint((select next from c1), 'Filmed two of the three reels so far.', array['http://x.com/p/1'], null, null, null, null, null) $$,
  'P0001', 'proof_invalid', 'links must be https');
select throws_ok($$ select public.submit_checkpoint((select next from c1), 'Filmed two of the three reels so far.',
    array(select 'https://x.com/p/' || n from generate_series(1, 11) n), null, null, null, null, null) $$,
  'P0001', 'proof_invalid', 'up to ten links');
select throws_ok($$ select public.submit_checkpoint((select next from c1), 'WhatsApp me on 0803 123 4567 to see it.', array['https://x.com/p/1'], null, null, null, null, null) $$,
  'P0001', 'contact_details', 'contact details in the note are refused');

set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-0000000cc104"}'; -- creator 4
select throws_ok($$ select public.submit_checkpoint((select next from c1), 'Filmed two of the three reels so far.', array['https://x.com/p/1'], null, null, null, null, null) $$,
  'P0001', 'checkpoint_not_yours', 'another creator cannot send evidence for this checkpoint');
set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-0000000cc001"}'; -- Ada
select throws_ok($$ select public.submit_checkpoint((select next from c1), 'Filmed two of the three reels so far.', array['https://x.com/p/1'], null, null, null, null, null) $$,
  'P0001', 'checkpoint_not_yours', 'nor can the business');

set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-0000000cc101"}'; -- creator 1
select isnt(public.submit_checkpoint((select next from c1), 'Filmed two of the three reels so far.', array['https://x.com/p/1'],
  null, null, null, null, array[(select one_b from files)]), null, 'complete evidence is accepted');
select is((select status from public.hire_checkpoints where id = (select next from c1)), 'done',
  'sent the day before it is due, the checkpoint is done');
select isnt((select evidence_at from public.hire_checkpoints where id = (select next from c1)), null, 'with the time recorded');
select isnt(public.submit_checkpoint((select next from c1), 'And here is the third reel, finished today.', array['https://x.com/p/2'],
  null, null, null, null, null), null, 'more evidence can be added later');
select is((select status from public.hire_checkpoints where id = (select next from c1)), 'done', 'and the status stays done');
select is((select count(*)::int from public.checkpoint_evidence where hire_checkpoint_id = (select next from c1)), 2,
  'both entries are kept');

-- Late evidence ------------------------------------------------------------------------------------------------------
reset role;
update public.hire_checkpoints set due_at = now() - interval '1 day'
 where id = (select later from c1);
update public.hire_checkpoints set status = 'overdue'
 where engagement_id = (select engagement from hires where n = 4) and kind = 'kickoff';
update public.hire_checkpoints set due_at = now() - interval '1 day'
 where engagement_id = (select engagement from hires where n = 4) and kind = 'kickoff';
set local role authenticated;
set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-0000000cc101"}'; -- creator 1
select isnt(public.submit_checkpoint((select later from c1), 'Filmed everything, editing in progress.', array['https://x.com/p/3'],
  null, null, null, null, null), null, 'evidence after the due time is still accepted');
select is((select status from public.hire_checkpoints where id = (select later from c1)), 'done_late',
  'and recorded as late, even before the daily job has marked it overdue');
set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-0000000cc104"}'; -- creator 4
select isnt(public.submit_kickoff((select engagement from hires where n = 4), true, true, null, null), null,
  'a kickoff marked overdue can still be confirmed');
select is((select status from public.hire_checkpoints
            where engagement_id = (select engagement from hires where n = 4) and kind = 'kickoff'),
  'done_late', 'as done late');

-- Analytics and screenshots (campaign B) -----------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-0000000cc102"}'; -- creator 2
select throws_ok($$ select public.submit_checkpoint((select id from c2), null, null, null, null, null, null, array[(select two_a from files)]) $$,
  'P0001', 'checkpoint_evidence_missing', 'analytics need numbers and a capture day, not just a screenshot');
select throws_ok($$ select public.submit_checkpoint((select id from c2), null, null,
    '[{"platform": "instagram", "views": -4}]', public.lagos_today(), null, null, array[(select two_a from files)]) $$,
  'P0001', 'proof_invalid', 'figures cannot be negative');
select throws_ok($$ select public.submit_checkpoint((select id from c2), null, null,
    '[{"platform": "instagram", "followers": 4}]', public.lagos_today(), null, null, array[(select two_a from files)]) $$,
  'P0001', 'proof_invalid', 'figures are from the list');
select throws_ok($$ select public.submit_checkpoint((select id from c2), null, null,
    '[{"platform": "instagram", "views": 40}]', public.lagos_today() + 1, null, null, array[(select two_a from files)]) $$,
  'P0001', 'proof_invalid', 'the capture day cannot be in the future');
select throws_ok($$ select public.submit_checkpoint((select id from c2), null, null,
    '[{"platform": "instagram", "views": 40}]', public.lagos_today(), null, null, array[(select one_a from files)]) $$,
  'P0001', 'not_your_file', 'a screenshot must be the creator''s own');
select isnt(public.submit_checkpoint((select id from c2), null, null,
    '[{"platform": "instagram", "views": 1200, "likes": 40, "link_clicks": 9}]', public.lagos_today(), public.lagos_today() - 7, public.lagos_today(),
    array[(select two_a from files), (select two_b from files)]), null, 'screenshots, figures and a capture day are accepted');
select is((select metrics -> 0 ->> 'views' from public.checkpoint_evidence where hire_checkpoint_id = (select id from c2)),
  '1200', 'the figures are stored as reported');

-- Nothing moved ----------------------------------------------------------------------------------------------------------
reset role;
select is((select count(*) from public.ledger_entries), (select n from before_ledger),
  'no checkpoint function wrote a ledger row');
select is((select coalesce(sum(amount_kobo), 0) from public.ledger_entries), (select total from before_ledger),
  'and the ledger total is the same');
select is(
  (select count(*)::int from public.engagements e join before_hires b on b.id = e.id where to_jsonb(e) is distinct from b.row),
  0, 'no hire changed: status, review deadline and escrow are as they were');

-- Notifications to the business -----------------------------------------------------------------------------------------
select is((select count(*)::int from public.notifications
            where user_id = '00000000-0000-0000-0000-0000000cc001' and kind = 'kickoff_done'), 1,
  'the business was told about the on-time kickoff');
select is((select count(*)::int from public.notifications
            where user_id = '00000000-0000-0000-0000-0000000cc001' and kind = 'checkpoint_done'), 2,
  'and about the two on-time checkpoints (once each, not for the added evidence)');
select is((select count(*)::int from public.notifications
            where user_id = '00000000-0000-0000-0000-0000000cc001' and kind = 'checkpoint_late'), 2,
  'and about the late kickoff and the late checkpoint');
select is((select count(*)::int from public.notifications
            where user_id in (select creator from hires) and kind in ('kickoff_done', 'checkpoint_done', 'checkpoint_late')), 0,
  'nobody is told about their own action');

-- The trail -------------------------------------------------------------------------------------------------------------------
select is(
  (select array_agg(event order by created_at, event) filter (where event not in ('applied', 'skipped'))
     from public.checkpoint_events where engagement_id = (select engagement from hires where n = 1)),
  array['evidence_late', 'evidence_submitted', 'evidence_submitted', 'kickoff_submitted'],
  'every submission is in the trail');
select throws_ok($$ update public.checkpoint_events set detail = '{}' $$, 'P0001', 'checkpoint_events_append_only', 'the trail cannot be edited');
select throws_ok($$ delete from public.checkpoint_events $$, 'P0001', 'checkpoint_events_append_only', 'or deleted');
select throws_ok($$ update public.checkpoint_evidence set note = 'changed' $$, 'P0001', 'checkpoint_evidence_append_only', 'evidence cannot be edited');
select throws_ok($$ delete from public.checkpoint_evidence $$, 'P0001', 'checkpoint_evidence_append_only', 'or deleted');

-- Screenshots -------------------------------------------------------------------------------------------------------------------
select is((select count(*)::int from public.proof_files f join public.checkpoint_evidence v on v.id = f.checkpoint_evidence_id
            where v.engagement_id in (select engagement from hires)), 4,
  'the screenshots are attached to their evidence');
update public.proof_files set created_at = now() - interval '3 days' where checkpoint_evidence_id is not null;
select public.delete_orphan_proof_files();
select is((select count(*)::int from public.proof_files f join public.checkpoint_evidence v on v.id = f.checkpoint_evidence_id
            where v.engagement_id in (select engagement from hires)), 4,
  'the daily sweep keeps attached screenshots');
select ok(exists (select 1 from pg_constraint
                   where conname = 'proof_files_one_parent' and pg_get_constraintdef(oid) like '%checkpoint_evidence_id%'),
  'a screenshot belongs to one thing only, checkpoint evidence included');

-- Who reads what --------------------------------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-0000000cc101"}'; -- creator 1
select ok((select count(*) from public.hire_checkpoints) > 0 and (select count(*) from public.checkpoint_evidence) > 0
          and (select count(*) from public.checkpoint_events) > 0, 'the creator reads their hire''s checkpoints, evidence and trail');
select is((select count(distinct engagement_id)::int from public.hire_checkpoints), 1, 'and only their own hire');
select is((select count(*)::int from public.proof_files where checkpoint_evidence_id is not null), 2, 'and their own screenshots');
set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-0000000cc001"}'; -- Ada
select is((select count(distinct engagement_id)::int from public.hire_checkpoints), 5, 'the business reads the checkpoints of all its hires');
select is((select count(*)::int from public.proof_files where checkpoint_evidence_id is not null), 4, 'and the screenshots');
set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-0000000cc002"}'; -- Bola
select is((select count(*)::int from public.hire_checkpoints) + (select count(*)::int from public.checkpoint_evidence)
          + (select count(*)::int from public.checkpoint_events), 0, 'another business reads nothing');
set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-0000000cc003"}'; -- Efe
select ok((select count(distinct engagement_id) from public.hire_checkpoints) >= 3, 'an admin reads them all');
select throws_ok($$ insert into public.hire_checkpoints (engagement_id, kind, due_at, status)
                      values ((select engagement from hires where n = 1), 'kickoff', now(), 'due') $$, '42501', null,
  'nobody writes checkpoints directly');
select throws_ok($$ update public.hire_checkpoints set status = 'done' $$, '42501', null, 'or updates them');
select throws_ok($$ insert into public.checkpoint_events (engagement_id, event) values ((select engagement from hires where n = 1), 'applied') $$,
  '42501', null, 'or writes the trail');
set local role anon;
set local request.jwt.claims = '{}';
select throws_ok($$ select * from public.hire_checkpoints $$, '42501', null, 'visitors read nothing');

-- A hire that has ended takes no more evidence ----------------------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-0000000cc105"}'; -- creator 5
set local role authenticated;
select lives_ok($$ select public.withdraw_from_engagement((select engagement from hires where n = 5)) $$, 'creator 5 withdraws');
select throws_ok($$ select public.submit_kickoff((select engagement from hires where n = 5), true, true, null, null) $$,
  'P0001', 'hire_not_running', 'a settled hire takes no kickoff');
select throws_ok($$ select public.submit_checkpoint(
    (select c.id from public.hire_checkpoints c where c.engagement_id = (select engagement from hires where n = 5) and c.kind = 'progress' and c.status = 'due' limit 1),
    'Filmed two of the three reels so far.', array['https://x.com/p/1'], null, null, null, null, null) $$,
  'P0001', 'hire_not_running', 'nor evidence');

-- What the hire page reads about the campaign ---------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-0000000cc101"}'; -- creator 1
select is((select d #>> '{campaign,checkpoint_evidence}' from public.engagement_details((select engagement from hires where n = 1)) d),
  '["progress_update", "content_links"]', 'the hire page gets the evidence each checkpoint needs');
select is((select d #>> '{campaign,checkpoints_enabled}' from public.engagement_details((select engagement from hires where n = 1)) d),
  'true', 'and that checkpoints are on');

select * from finish();
rollback;
