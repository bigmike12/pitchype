-- Proves the daily checkpoint notices and the early non-delivery dispute from
-- the checkpoint_notices migration: a reminder within 24 hours of the due time,
-- the overdue notice to both people, the creator's warning two days overdue,
-- "dispute available" only after the warning has stood for 24 hours and the
-- checkpoint is more than 3 days overdue; every notice once however often the
-- job runs; a job run days late warns but does not open the dispute in the same
-- run; per-click hires get reminders and overdue notices only; the business can
-- open the dispute at the early date and not just before it; late evidence puts
-- the date back to today's rule; and nothing here moves money or a hire.
-- Time is controlled with fixture timestamps (now() is fixed inside a test).
-- Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(52);

-- Ada is a business, Efe an admin; creators ce101..ce107 are hired by Ada.
insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000ce001', 'cececece-0000-0000-0000-0000000ce001', 'ada.cn@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000ce003', 'cececece-0000-0000-0000-0000000ce003', 'efe.cn@example.com', 'admin');
insert into public.users (id, auth_user_id, email, role)
select ('00000000-0000-0000-0000-0000000ce1' || lpad(n::text, 2, '0'))::uuid,
       ('cececece-0000-0000-0000-0000000ce1' || lpad(n::text, 2, '0'))::uuid,
       'c' || n || '.cn@example.com', 'influencer'
  from generate_series(1, 7) n;
insert into public.business_profiles (user_id, business_name, contact_name, state, city) values
  ('00000000-0000-0000-0000-0000000ce001', 'Ada Notice Kitchen', 'Ada Obi', 'Lagos', 'Ikeja');
insert into public.influencer_profiles (user_id, display_name, state, city, niches, published)
select ('00000000-0000-0000-0000-0000000ce1' || lpad(n::text, 2, '0'))::uuid,
       'Creator ' || n || ' Notice', 'Lagos', 'Yaba', '{fashion}', true
  from generate_series(1, 7) n;

-- F: fixed price with checkpoints. P: pay per click with checkpoints. N: no checkpoints.
insert into public.campaigns (id, business_id, status, title, brief, price_kobo, places,
                              applications_close_on, post_from, ends_on, deliver_by, published_at, submitted_at,
                              checkpoints_enabled, checkpoint_interval_days, checkpoint_evidence) values
  ('ce000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000ce001', 'open', 'Notices fixed',
   'A brief that is long enough for the checks.', 5000000, 20, public.lagos_today() + 10,
   public.lagos_today() - 5, public.lagos_today() + 40, public.lagos_today() + 30, now(), now(),
   true, 7, '{progress_update}'),
  ('ce000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000ce001', 'open', 'Notices plain',
   'A brief that is long enough for the checks.', 5000000, 20, public.lagos_today() + 10,
   null, null, public.lagos_today() + 30, now(), now(), false, null, null);
insert into public.campaigns (id, business_id, status, title, brief, payment_model, cpc_kobo, price_kobo,
                              destination_url, places, applications_close_on, post_from, ends_on, deliver_by,
                              published_at, submitted_at, checkpoints_enabled, checkpoint_interval_days, checkpoint_evidence) values
  ('ce000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000ce001', 'open', 'Notices clicks',
   'Send people to our new online shop.', 'per_click', 5000, 500000, 'https://shop.example.com/new', 20,
   public.lagos_today() + 10, public.lagos_today() - 5, public.lagos_today() + 40, public.lagos_today() + 30,
   now(), now(), true, 7, '{progress_update}');
insert into public.campaign_checkpoints (campaign_id, seq, due_on)
select c, s.seq, public.lagos_today() + s.days
  from (values ('ce000000-0000-0000-0000-000000000001'::uuid), ('ce000000-0000-0000-0000-000000000002'::uuid)) camp (c),
       (values (1, 5), (2, 12)) as s (seq, days);

-- Hire 1 (A), 3 (C), 4 (D), 5 (G), 6 (H), 7 (E) are fixed price with checkpoints, except 7 which has none; hire 2 (B) is per click.
create temporary table hires (n integer primary key, campaign uuid, creator uuid, engagement uuid) on commit drop;
insert into hires
select n,
       case n when 2 then 'ce000000-0000-0000-0000-000000000002'::uuid
              when 7 then 'ce000000-0000-0000-0000-000000000003'::uuid
              else 'ce000000-0000-0000-0000-000000000001'::uuid end,
       ('00000000-0000-0000-0000-0000000ce1' || lpad(n::text, 2, '0'))::uuid,
       ('ce000000-0000-0000-0000-0000000e00' || lpad(n::text, 2, '0'))::uuid
  from generate_series(1, 7) n;
grant select on hires to authenticated;
insert into public.applications (id, campaign_id, creator_id, status)
select ('ce000000-0000-0000-0000-0000000a00' || lpad(h.n::text, 2, '0'))::uuid, h.campaign, h.creator, 'approved' from hires h;
insert into public.engagements (id, application_id, campaign_id, business_id, creator_id, agreed_price_kobo, pay_by)
select h.engagement, ('ce000000-0000-0000-0000-0000000a00' || lpad(h.n::text, 2, '0'))::uuid, h.campaign,
       '00000000-0000-0000-0000-0000000ce001', h.creator, case when h.n = 2 then 500000 else 5000000 end,
       now() + interval '48 hours'
  from hires h;

do $$
declare
  h record;
  started jsonb;
begin
  for h in select * from hires order by n loop
    perform set_config('request.jwt.claims', '{"sub": "cececece-0000-0000-0000-0000000ce001"}', true);
    started := public.start_payment(h.engagement, true);
    perform public.record_card_payment(started ->> 'reference', (started ->> 'card_amount_kobo')::bigint,
      95406, 'evt-cn-' || h.n, '{}');
    perform set_config('request.jwt.claims', json_build_object('sub',
      'cececece-0000-0000-0000-0000000ce1' || lpad(h.n::text, 2, '0'))::text, true);
    perform public.start_engagement(h.engagement);
  end loop;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- Row ids by hire number and place: the kickoff, or the first / second checkpoint.
create temporary table rows on commit drop as
select h.n, c.kind, coalesce(k.seq, 0) as seq, c.id
  from hires h join public.hire_checkpoints c on c.engagement_id = h.engagement
  left join public.campaign_checkpoints k on k.id = c.campaign_checkpoint_id;
grant select on rows to authenticated;
create function pg_temp.row_id(hire integer, row_seq integer) returns uuid language sql as
  $$ select id from rows where n = hire and seq = row_seq $$;
create function pg_temp.notes(person uuid, what text) returns integer language sql as
  $$ select count(*)::int from public.notifications where user_id = person and kind::text = what $$;
create function pg_temp.events(row_id uuid, what text) returns integer language sql as
  $$ select count(*)::int from public.checkpoint_events where hire_checkpoint_id = row_id and event = what $$;

-- The job looks at every running hire, so in a database that has been used
-- (the race script leaves hires behind) other hires' checkpoints would add to
-- its counts. Set them aside for this transaction.
update public.hire_checkpoints set status = 'closed'
 where status in ('due', 'overdue') and engagement_id not in (select engagement from hires);

create temporary table before_ledger on commit drop as
  select count(*) as n, coalesce(sum(amount_kobo), 0) as total from public.ledger_entries;
create temporary table before_hires on commit drop as
  select e.id, to_jsonb(e) as row from public.engagements e where e.id in (select engagement from hires);

-- Nothing is due yet --------------------------------------------------------------------------------------------------------
select is(public.run_checkpoint_notices(), '{"reminded":0,"overdue":0,"warned":0,"dispute_available":0,"failed":0}'::jsonb,
  'right after starting, the job has nothing to send');

-- Reminder: hire 1's kickoff falls due in 12 hours ---------------------------------------------------------------------------
update public.hire_checkpoints set due_at = now() + interval '12 hours' where id = pg_temp.row_id(1, 0);
select is(public.run_checkpoint_notices() ->> 'reminded', '1', 'a kickoff due within a day is reminded');
select is(pg_temp.notes('00000000-0000-0000-0000-0000000ce101', 'checkpoint_reminder'), 1, 'to the creator');
select is(pg_temp.notes('00000000-0000-0000-0000-0000000ce001', 'checkpoint_reminder'), 0, 'not to the business');
select is(public.run_checkpoint_notices() ->> 'reminded', '0', 'a second run sends nothing more');
select is(pg_temp.events(pg_temp.row_id(1, 0), 'reminded'), 1, 'and the trail has one reminder');

-- Overdue: it passes its due time -----------------------------------------------------------------------------------------------
update public.hire_checkpoints set due_at = now() - interval '1 hour' where id = pg_temp.row_id(1, 0);
select is(public.run_checkpoint_notices() ->> 'overdue', '1', 'a kickoff past its due time is marked overdue');
select is((select status from public.hire_checkpoints where id = pg_temp.row_id(1, 0)), 'overdue', 'with the status set');
select is(pg_temp.notes('00000000-0000-0000-0000-0000000ce101', 'checkpoint_overdue'), 1, 'the creator is told');
select is(pg_temp.notes('00000000-0000-0000-0000-0000000ce001', 'checkpoint_overdue'), 1, 'and so is the business');
select is(public.run_checkpoint_notices() ->> 'overdue', '0', 'a second run sends nothing more');
select is(pg_temp.notes('00000000-0000-0000-0000-0000000ce001', 'checkpoint_overdue'), 1, 'no duplicate notice');
select is(pg_temp.events(pg_temp.row_id(1, 0), 'overdue'), 1, 'and one overdue entry in the trail');
select is(pg_temp.notes('00000000-0000-0000-0000-0000000ce101', 'checkpoint_warning'), 0, 'no warning yet, only an hour late');

-- Warning: two days overdue ---------------------------------------------------------------------------------------------------------
update public.hire_checkpoints set due_at = now() - interval '2 days 1 hour' where id = pg_temp.row_id(1, 0);
select is(public.run_checkpoint_notices() ->> 'warned', '1', 'two days overdue the creator is warned');
select is(pg_temp.notes('00000000-0000-0000-0000-0000000ce101', 'checkpoint_warning'), 1, 'once');
select is((select (data ->> 'dispute_from')::timestamptz from public.notifications
            where user_id = '00000000-0000-0000-0000-0000000ce101' and kind = 'checkpoint_warning'),
  now() + interval '24 hours', 'the warning says when a dispute could open: 24 hours on, not before');
select is(pg_temp.notes('00000000-0000-0000-0000-0000000ce001', 'checkpoint_dispute_available'), 0,
  'the business is not told it can dispute in the same run');
select is(public.non_delivery_dispute_at((select e from public.engagements e where e.id = (select engagement from hires where n = 1))),
  now() + interval '24 hours', 'the early dispute date is 24 hours after the warning');
select is(public.run_checkpoint_notices() ->> 'warned', '0', 'a second run warns nobody again');

-- The business cannot open a dispute just before that date ------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "cececece-0000-0000-0000-0000000ce001"}';
select throws_ok($$ select public.open_dispute((select engagement from hires where n = 1),
    'The kickoff never came and nothing has been shared since.', null, null) $$,
  'P0001', 'dispute_not_allowed_yet', 'a dispute is refused before the early date');
reset role;

-- Hire 4: warned two days ago, three-plus days overdue: the dispute is open to the business ------------------------------------------------
update public.hire_checkpoints set status = 'overdue', due_at = now() - interval '4 days' where id = pg_temp.row_id(4, 1);
insert into public.checkpoint_events (hire_checkpoint_id, engagement_id, event, detail, created_at)
values (pg_temp.row_id(4, 1), (select engagement from hires where n = 4), 'warned', '{}', now() - interval '2 days');
select is(public.run_checkpoint_notices() ->> 'dispute_available', '1', 'the business is told it can dispute once the warning has stood 24 hours');
select is(pg_temp.notes('00000000-0000-0000-0000-0000000ce001', 'checkpoint_dispute_available'), 1, 'once');
select is(public.run_checkpoint_notices() ->> 'dispute_available', '0', 'a second run tells it nothing more');
select is(public.non_delivery_dispute_at((select e from public.engagements e where e.id = (select engagement from hires where n = 4))),
  now() - interval '1 day', 'the early date is already past');
set local role authenticated;
set local request.jwt.claims = '{"sub": "cececece-0000-0000-0000-0000000ce001"}';
select isnt(public.open_dispute((select engagement from hires where n = 4),
    'The first checkpoint never came and the creator has gone quiet since.', null, null), null,
  'the business opens the dispute early');
reset role;
select is((select status::text from public.engagements where id = (select engagement from hires where n = 4)), 'disputed',
  'and the hire is disputed, as for any dispute');

-- A job run days late: hire 3's checkpoint was due 5 days ago ---------------------------------------------------------------------------------
update public.hire_checkpoints set due_at = now() - interval '5 days' where id = pg_temp.row_id(3, 1);
select is(public.run_checkpoint_notices() - 'failed',
  '{"reminded":0,"overdue":1,"warned":1,"dispute_available":0}'::jsonb,
  'a late run marks it overdue and warns, but does not open the dispute in the same run');
select is(pg_temp.events(pg_temp.row_id(3, 1), 'dispute_available'), 0, 'no dispute-available entry yet');
select is(public.run_checkpoint_notices() ->> 'dispute_available', '0', 'nor on a run straight after: the warning must stand 24 hours');
select is(public.non_delivery_dispute_at((select e from public.engagements e where e.id = (select engagement from hires where n = 3))),
  now() + interval '24 hours', 'the date is 24 hours after the warning, though the checkpoint is days late');

-- Late evidence puts the date back (hire 5) ----------------------------------------------------------------------------------------------------------
update public.hire_checkpoints set status = 'overdue', due_at = now() - interval '4 days' where id = pg_temp.row_id(5, 1);
insert into public.checkpoint_events (hire_checkpoint_id, engagement_id, event, detail, created_at)
values (pg_temp.row_id(5, 1), (select engagement from hires where n = 5), 'warned', '{}', now() - interval '2 days');
select is(public.non_delivery_dispute_at((select e from public.engagements e where e.id = (select engagement from hires where n = 5))),
  now() - interval '1 day', 'hire 5 can be disputed early');
set local role authenticated;
set local request.jwt.claims = '{"sub": "cececece-0000-0000-0000-0000000ce105"}';
select isnt(public.submit_checkpoint(pg_temp.row_id(5, 1), 'Filmed two of the three reels so far.', null, null, null, null, null, null),
  null, 'the creator sends the missed checkpoint late');
reset role;
select is((select status from public.hire_checkpoints where id = pg_temp.row_id(5, 1)), 'done_late', 'recorded as late');
select is(public.non_delivery_dispute_at((select e from public.engagements e where e.id = (select engagement from hires where n = 5))),
  (select greatest(timezone('Africa/Lagos', (k.deliver_by + 1)::timestamp), e.started_at + interval '7 days')
     from public.engagements e join public.campaigns k on k.id = e.campaign_id
    where e.id = (select engagement from hires where n = 5)),
  'the date is back to the usual rule');
set local role authenticated;
set local request.jwt.claims = '{"sub": "cececece-0000-0000-0000-0000000ce001"}';
select throws_ok($$ select public.open_dispute((select engagement from hires where n = 5),
    'Nothing has been delivered, and the checkpoints were ignored.', null, null) $$,
  'P0001', 'dispute_not_allowed_yet', 'and the business can no longer open one early');
reset role;

-- The old rule, byte for byte, where checkpoints play no part -------------------------------------------------------------------------------
select is(public.non_delivery_dispute_at((select e from public.engagements e where e.id = (select engagement from hires where n = 7))),
  (select greatest(timezone('Africa/Lagos', (k.deliver_by + 1)::timestamp), e.started_at + interval '7 days')
     from public.engagements e join public.campaigns k on k.id = e.campaign_id
    where e.id = (select engagement from hires where n = 7)),
  'a campaign without checkpoints keeps the old formula');
select is(public.non_delivery_dispute_at((select e from public.engagements e where e.id = (select engagement from hires where n = 6))),
  (select greatest(timezone('Africa/Lagos', (k.deliver_by + 1)::timestamp), e.started_at + interval '7 days')
     from public.engagements e join public.campaigns k on k.id = e.campaign_id
    where e.id = (select engagement from hires where n = 6)),
  'so does a checkpoint hire with nothing overdue');

-- Pay per click: information only --------------------------------------------------------------------------------------------------------------------
update public.hire_checkpoints set due_at = now() + interval '12 hours' where id = pg_temp.row_id(2, 0);
update public.hire_checkpoints set due_at = now() - interval '5 days' where id = pg_temp.row_id(2, 1);
select is(public.run_checkpoint_notices() ->> 'reminded', '1', 'a per-click creator gets the reminder');
select is(pg_temp.notes('00000000-0000-0000-0000-0000000ce102', 'checkpoint_overdue'), 1, 'and the overdue notice');
select is(pg_temp.events(pg_temp.row_id(2, 1), 'overdue'), 1, 'it is marked overdue');
select is(public.run_checkpoint_notices() ->> 'warned', '0', 'but a per-click creator is never warned of a dispute');
select is(pg_temp.events(pg_temp.row_id(2, 1), 'warned') + pg_temp.events(pg_temp.row_id(2, 1), 'dispute_available'), 0,
  'and the business is never told of one');
select is(public.non_delivery_dispute_at((select e from public.engagements e where e.id = (select engagement from hires where n = 2))),
  (select greatest(timezone('Africa/Lagos', (k.deliver_by + 1)::timestamp), e.started_at + interval '7 days')
     from public.engagements e join public.campaigns k on k.id = e.campaign_id
    where e.id = (select engagement from hires where n = 2)),
  'its dispute date is unchanged');

-- An ended hire stops (hire 6) -------------------------------------------------------------------------------------------------------------------------
update public.hire_checkpoints set due_at = now() - interval '5 days' where id = pg_temp.row_id(6, 1);
update public.hire_checkpoints set status = 'overdue', due_at = now() - interval '5 days' where id = pg_temp.row_id(6, 2);
-- Nothing has moved money or a hire so far.
select is((select count(*) from public.ledger_entries), (select n from before_ledger), 'the notices wrote no ledger row');
select is((select count(*)::int from public.engagements e join before_hires b on b.id = e.id
            where e.id in (select engagement from hires where n not in (4)) and to_jsonb(e) is distinct from b.row), 0,
  'and changed no hire (hire 4 was disputed by its business, as any dispute would)');
set local role authenticated;
set local request.jwt.claims = '{"sub": "cececece-0000-0000-0000-0000000ce106"}';
select lives_ok($$ select public.withdraw_from_engagement((select engagement from hires where n = 6)) $$, 'creator 6 withdraws');
reset role;
select is(public.run_checkpoint_notices() ->> 'overdue', '0', 'the job leaves the ended hire alone');
select is((select status from public.hire_checkpoints where id = pg_temp.row_id(6, 1)), 'due', 'its checkpoint stays as it was');
select is(pg_temp.notes('00000000-0000-0000-0000-0000000ce106', 'checkpoint_warning'), 0, 'and nobody is warned about it');

-- Who may run it ----------------------------------------------------------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "cececece-0000-0000-0000-0000000ce001"}';
select throws_ok($$ select public.run_checkpoint_notices() $$, '42501', null, 'a signed-in person cannot run the job');
reset role;
set local role service_role;
select lives_ok($$ select public.run_checkpoint_notices() $$, 'the service role can');
reset role;

select * from finish();
rollback;
