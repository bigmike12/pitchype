-- Proves the timeline and checkpoint schedule rules from the campaign_timeline
-- migration: the dates a new campaign needs before it can be listed, the fixed
-- checkpoint schedule generated when it leaves draft, the edit locks, and who
-- can read the schedule. Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(47);

-- Ada and Bola are businesses; Chidi is a creator; Efe is an admin.
insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000cb001', 'cbcbcbcb-0000-0000-0000-0000000cb001', 'ada.tl@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000cb002', 'cbcbcbcb-0000-0000-0000-0000000cb002', 'bola.tl@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000cb003', 'cbcbcbcb-0000-0000-0000-0000000cb003', 'chidi.tl@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000cb005', 'cbcbcbcb-0000-0000-0000-0000000cb005', 'efe.tl@example.com', 'admin');

-- Identity fixtures: the people made above count as verified, so the identity
-- gates are not what this file is about.
insert into public.identity_checks (user_id, kind, status, reference, legal_name_entered, legal_name_on_record,
                                    id_last3, id_fingerprint, counted, decided_at)
select u.id, case u.role when 'influencer' then 'creator_nin' else 'owner_bvn' end, 'verified',
       'pit_id_fx_' || replace(u.id::text, '-', ''), 'Fixture Person', 'FIXTURE PERSON', '000',
       'v1:fx-' || u.id::text, true, now()
  from public.users u
 where u.created_at = now() and u.role in ('influencer', 'business')
   and not exists (select 1 from public.identity_checks c where c.user_id = u.id);

insert into public.business_profiles (user_id, business_name, contact_name, state, city) values
  ('00000000-0000-0000-0000-0000000cb001', 'Ada Timeline Store', 'Ada Obi', 'Lagos', 'Ikeja'),
  ('00000000-0000-0000-0000-0000000cb002', 'Bola Timeline Store', 'Bola A', 'Oyo', 'Ibadan');

-- A campaign that went live before timelines existed: no end date, no checkpoints.
insert into public.campaigns (id, business_id, status, title, brief, price_kobo, places,
                              applications_close_on, deliver_by, published_at, submitted_at) values
  ('cb000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000cb001', 'open', 'Legacy live campaign',
   'A campaign that was live before timelines existed.', 5000000, 2,
   public.lagos_today() + 5, public.lagos_today() + 15, now(), now());

-- Saves a draft the way the builder does; only the timeline fields vary.
create function pg_temp.draft(
  title text, post_from date, deliver_by date, ends_on date,
  enabled boolean default false, interval_days integer default null,
  evidence text[] default null, final_req text[] default '{}',
  model public.payment_model default 'fixed', draft_id uuid default null
) returns uuid language sql as $$
  select public.save_campaign_draft(
    campaign_id => draft_id, title => title, brief => 'Show our new product to your followers.',
    guidelines => null, niches => '{}', states => '{}', verified_only => false,
    price_kobo => case when model = 'per_click' then 500000 else 5000000 end, places => 2,
    applications_close_on => public.lagos_today() + 5, post_from => post_from, deliver_by => deliver_by,
    platforms => '[{"platform": "instagram", "min_followers": null}]',
    deliverables => '[{"platform": "instagram", "kind": "post", "quantity": 1}]',
    payment_model => model,
    cpc_kobo => case when model = 'per_click' then 5000 end,
    destination_url => case when model = 'per_click' then 'https://shop.example.com/new' end,
    ends_on => ends_on, checkpoints_enabled => enabled, checkpoint_interval_days => interval_days,
    checkpoint_evidence => evidence, final_requirements => final_req
  )
$$;
grant execute on function pg_temp.draft(text, date, date, date, boolean, integer, text[], text[], public.payment_model, uuid) to authenticated;

select is(
  (select (ends_on is null and not checkpoints_enabled and final_requirements = '{}'
           and checkpoint_interval_days is null) from public.campaigns where title = 'Legacy live campaign'),
  true, 'a campaign that was live before timelines is untouched: no end date, no checkpoints, no final requirements');
select is((select count(*)::int from public.campaign_checkpoints), 0, 'no schedule rows exist yet');

-- Ada ------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "cbcbcbcb-0000-0000-0000-0000000cb001"}';

select isnt(pg_temp.draft('No dates', null, public.lagos_today() + 30, null), null, 'a draft can be saved without a timeline');
select throws_ok(
  $$ select public.transition_campaign((select id from public.campaigns where title = 'No dates'), 'submit') $$,
  'P0001', 'timeline_required', 'but it cannot be submitted without a start and an end date');

select isnt(pg_temp.draft('No start', null, public.lagos_today() + 30, public.lagos_today() + 40), null, 'draft with an end date only');
select throws_ok(
  $$ select public.transition_campaign((select id from public.campaigns where title = 'No start'), 'submit') $$,
  'P0001', 'timeline_required', 'a start date is needed too');

select isnt(pg_temp.draft('No end', public.lagos_today() + 11, public.lagos_today() + 30, null), null, 'draft with a start date only');
select throws_ok(
  $$ select public.transition_campaign((select id from public.campaigns where title = 'No end'), 'submit') $$,
  'P0001', 'timeline_required', 'and an end date');

select isnt(pg_temp.draft('Past start', public.lagos_today() - 1, public.lagos_today() + 30, public.lagos_today() + 40), null,
  'draft with a start date in the past');
select throws_ok(
  $$ select public.transition_campaign((select id from public.campaigns where title = 'Past start'), 'submit') $$,
  'P0001', 'timeline_in_past', 'a start date in the past is refused at submit');

select throws_ok(
  $$ select pg_temp.draft('End too early', public.lagos_today() + 11, public.lagos_today() + 30, public.lagos_today() + 29) $$,
  '23514', null, 'the end date cannot be before final delivery');
select throws_ok(
  $$ select pg_temp.draft('Interval too short', public.lagos_today() + 11, public.lagos_today() + 30, public.lagos_today() + 40,
       true, 1, '{progress_update}') $$,
  '23514', null, 'a checkpoint interval is 2 to 30 days');
select throws_ok(
  $$ select pg_temp.draft('No interval', public.lagos_today() + 11, public.lagos_today() + 30, public.lagos_today() + 40,
       true, null, '{progress_update}') $$,
  '23514', null, 'checkpoints need an interval');
select throws_ok(
  $$ select pg_temp.draft('No evidence', public.lagos_today() + 11, public.lagos_today() + 30, public.lagos_today() + 40,
       true, 7, '{}') $$,
  '23514', null, 'checkpoints need at least one kind of evidence');
select throws_ok(
  $$ select pg_temp.draft('Odd evidence', public.lagos_today() + 11, public.lagos_today() + 30, public.lagos_today() + 40,
       true, 7, '{selfie}') $$,
  '23514', null, 'evidence kinds come from the list');
select throws_ok(
  $$ select pg_temp.draft('Odd requirement', public.lagos_today() + 11, public.lagos_today() + 30, public.lagos_today() + 40,
       false, null, null, '{selfie}') $$,
  '23514', null, 'final requirements come from the list');
select throws_ok(
  $$ select pg_temp.draft('Click requirements', public.lagos_today() + 11, public.lagos_today() + 30, public.lagos_today() + 40,
       false, null, null, '{final_report}', 'per_click') $$,
  '23514', null, 'a pay-per-click campaign has no final submission, so no final requirements');

-- No room for a checkpoint before final delivery.
select isnt(pg_temp.draft('Too short', public.lagos_today() + 11, public.lagos_today() + 14, public.lagos_today() + 20,
  true, 7, '{progress_update}'), null, 'draft whose dates leave no room for a checkpoint');
select throws_ok(
  $$ select public.transition_campaign((select id from public.campaigns where title = 'Too short'), 'submit') $$,
  'P0001', 'checkpoints_do_not_fit', 'is refused at submit');

-- The 7-day example: start +11, final delivery +30 gives checkpoints on +7 and +14 days after the start.
select isnt(pg_temp.draft('Weekly check-ins', public.lagos_today() + 11, public.lagos_today() + 30, public.lagos_today() + 40,
  true, 7, '{progress_update,content_links}'), null, 'a weekly checkpoint campaign saves as a draft');
select is(
  public.transition_campaign((select id from public.campaigns where title = 'Weekly check-ins'), 'submit'),
  'pending_review'::public.campaign_status, 'and is submitted (a first campaign waits for an admin)');
select is(
  (select array_agg(due_on - (select post_from from public.campaigns where title = 'Weekly check-ins') order by seq)
     from public.campaign_checkpoints
    where campaign_id = (select id from public.campaigns where title = 'Weekly check-ins')),
  array[7, 14], 'the schedule is every 7 days after the start, before final delivery');

-- Checkpoints off: no rows.
select isnt(pg_temp.draft('Plain dates', public.lagos_today() + 11, public.lagos_today() + 30, public.lagos_today() + 40), null,
  'a campaign with only a timeline saves');
select is(
  public.transition_campaign((select id from public.campaigns where title = 'Plain dates'), 'submit'),
  'pending_review'::public.campaign_status, 'and is submitted');
select is(
  (select count(*)::int from public.campaign_checkpoints
    where campaign_id = (select id from public.campaigns where title = 'Plain dates')),
  0, 'checkpoints off means no schedule rows');

-- Locks once submitted.
select throws_ok(
  $$ update public.campaigns set checkpoint_interval_days = 14 where title = 'Weekly check-ins' $$,
  '42501', null, 'the checkpoint interval is locked once submitted');
select throws_ok(
  $$ update public.campaigns set checkpoints_enabled = false where title = 'Weekly check-ins' $$,
  '42501', null, 'so is the switch');
select throws_ok(
  $$ update public.campaigns set final_requirements = '{final_report}' where title = 'Weekly check-ins' $$,
  '42501', null, 'and the final requirements');

-- Sent back, edited and resubmitted: the schedule is generated again.
set local request.jwt.claims = '{"sub": "cbcbcbcb-0000-0000-0000-0000000cb005"}';
select is(
  public.transition_campaign((select id from public.campaigns where title = 'Weekly check-ins'), 'reject', 'Say more about the product'),
  'draft'::public.campaign_status, 'an admin sends a campaign back');
set local request.jwt.claims = '{"sub": "cbcbcbcb-0000-0000-0000-0000000cb001"}';
select isnt(pg_temp.draft('Weekly check-ins', public.lagos_today() + 11, public.lagos_today() + 30, public.lagos_today() + 40,
  true, 14, '{analytics}', '{final_report}',
  draft_id => (select id from public.campaigns where title = 'Weekly check-ins')), null, 'Ada changes the interval to 14 days');
select is(
  public.transition_campaign((select id from public.campaigns where title = 'Weekly check-ins'), 'submit'),
  'pending_review'::public.campaign_status, 'and resubmits');
select is(
  (select array_agg(due_on - (select post_from from public.campaigns where title = 'Weekly check-ins') order by seq)
     from public.campaign_checkpoints
    where campaign_id = (select id from public.campaigns where title = 'Weekly check-ins')),
  array[14], 'the schedule is regenerated, not added to');

-- An approval makes Ada trusted; later campaigns go live at once, with their schedule.
set local request.jwt.claims = '{"sub": "cbcbcbcb-0000-0000-0000-0000000cb005"}';
select is(
  public.transition_campaign((select id from public.campaigns where title = 'Plain dates'), 'approve'),
  'open'::public.campaign_status, 'an admin approves a campaign whose start date is still ahead');
set local request.jwt.claims = '{"sub": "cbcbcbcb-0000-0000-0000-0000000cb001"}';
select isnt(pg_temp.draft('Open weekly', public.lagos_today() + 11, public.lagos_today() + 30, public.lagos_today() + 40,
  true, 7, '{progress_update}'), null, 'Ada saves another weekly campaign');
select is(
  public.transition_campaign((select id from public.campaigns where title = 'Open weekly'), 'submit'),
  'open'::public.campaign_status, 'it goes live at once');
select is(
  (select count(*)::int from public.campaign_checkpoints
    where campaign_id = (select id from public.campaigns where title = 'Open weekly')),
  2, 'with its schedule generated');

-- The end date may only move later once live.
select lives_ok(
  $$ update public.campaigns set ends_on = public.lagos_today() + 50 where title = 'Open weekly' $$,
  'the end date can move later');
select throws_ok(
  $$ update public.campaigns set ends_on = public.lagos_today() + 35 where title = 'Open weekly' $$,
  '42501', null, 'but not earlier');
select is(
  (select count(*)::int from public.campaign_checkpoints
    where campaign_id = (select id from public.campaigns where title = 'Open weekly')),
  2, 'and the schedule stays as it was');

-- Admin approval: a start date that has passed is refused; a campaign without
-- dates (submitted before timelines existed) is not.
reset role;
insert into public.campaigns (id, business_id, status, title, brief, price_kobo, places,
                              applications_close_on, post_from, ends_on, deliver_by, submitted_at) values
  ('cb000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000cb002', 'pending_review', 'Stale start',
   'Waited too long for review.', 5000000, 2, public.lagos_today() + 5, public.lagos_today() - 1,
   public.lagos_today() + 40, public.lagos_today() + 30, now()),
  ('cb000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000cb002', 'pending_review', 'Legacy pending',
   'Submitted before timelines existed.', 5000000, 2, public.lagos_today() + 5, null, null,
   public.lagos_today() + 30, now());
set local role authenticated;
set local request.jwt.claims = '{"sub": "cbcbcbcb-0000-0000-0000-0000000cb005"}';
select throws_ok(
  $$ select public.transition_campaign('cb000000-0000-0000-0000-000000000002', 'approve') $$,
  'P0001', 'timeline_in_past', 'an admin cannot approve a campaign whose start date has passed');
select is(
  public.transition_campaign('cb000000-0000-0000-0000-000000000003', 'approve'),
  'open'::public.campaign_status, 'a campaign submitted before timelines existed still approves');

-- Who can read the schedule ---------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "cbcbcbcb-0000-0000-0000-0000000cb001"}';
select is((select count(*)::int from public.campaign_checkpoints
            where campaign_id = (select id from public.campaigns where title = 'Open weekly')),
  2, 'the owner reads the schedule');
select throws_ok(
  $$ insert into public.campaign_checkpoints (campaign_id, seq, due_on)
     values ((select id from public.campaigns where title = 'Open weekly'), 9, public.lagos_today() + 28) $$,
  '42501', null, 'but nobody writes it directly');
set local request.jwt.claims = '{"sub": "cbcbcbcb-0000-0000-0000-0000000cb002"}';
select is((select count(*)::int from public.campaign_checkpoints
            where campaign_id = (select id from public.campaigns where title = 'Open weekly')),
  0, 'another business does not see it');
set local request.jwt.claims = '{"sub": "cbcbcbcb-0000-0000-0000-0000000cb005"}';
select is((select count(*)::int from public.campaign_checkpoints
            where campaign_id = (select id from public.campaigns where title = 'Open weekly')),
  2, 'an admin does');
set local role anon;
set local request.jwt.claims = '{}';
select throws_ok($$ select * from public.campaign_checkpoints $$, '42501', null, 'visitors cannot read it');

-- Creators see the schedule and requirements through the campaign card.
reset role;
select is(
  (select public.campaign_card(k, null) -> 'checkpoint_dates'
     from public.campaigns k where k.title = 'Open weekly')::text,
  (select to_jsonb(array_agg(due_on order by seq))::text from public.campaign_checkpoints
    where campaign_id = (select id from public.campaigns where title = 'Open weekly')),
  'the campaign card carries the checkpoint dates');

select * from finish();
rollback;
