-- Overdue tracking, warnings and the early non-delivery dispute (design:
-- docs/superpowers/specs/2026-11-22-campaign-checkpoints-design.md §5.6).
--
-- run_checkpoint_notices() is the daily job's checkpoint step. For each hire
-- still running it, in this order and each once per checkpoint (guarded by the
-- checkpoint's own trail entry, so a second or late run adds nothing):
--   reminded           creator: a checkpoint due within the next 24 hours has no evidence
--   overdue            both: the due time has passed with no evidence (status overdue)
--   warned             creator: two days overdue; says when the business can open a dispute
--                      (fixed-price hires only)
--   dispute_available  business: more than 3 days overdue AND the warning went out at least
--                      24 hours ago (fixed-price hires still in progress only)
-- A job run days late sends overdue and the warning, never "dispute available" in
-- the same run: the creator is always warned first.
--
-- non_delivery_dispute_at() becomes the earlier of today's rule and, for a
-- fixed-price hire in progress on a checkpoint campaign, the earliest checkpoint
-- that is STILL overdue and was warned: the later of 3 days after it was due and
-- 24 hours after the warning. Late evidence ends the overdue state, so the date
-- goes back to today's rule; a dispute already opened stays open.
--
-- Invariants: nothing here writes ledger_entries or changes an engagement's
-- status, review deadline, escrow or wallets. Per-click hires get reminders and
-- overdue notices as information only (their dispute window is the 72-hour hold).
-- Lock order as everywhere: the business's users row, the engagement, then the rows.
-- Each hire runs in its own subtransaction so one failure doesn't block the rest.

create or replace function public.non_delivery_dispute_at(e public.engagements)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select least(
    greatest(timezone('Africa/Lagos', (k.deliver_by + 1)::timestamp), e.started_at + interval '7 days'),
    -- Null (so ignored by least) unless an overdue, warned checkpoint opens it sooner.
    (select min(greatest(h.due_at + interval '3 days', w.warned_at + interval '24 hours'))
       from public.hire_checkpoints h
       cross join lateral (
         select min(ev.created_at) as warned_at
           from public.checkpoint_events ev
          where ev.hire_checkpoint_id = h.id and ev.event = 'warned'
       ) w
      where h.engagement_id = e.id
        and h.status = 'overdue'
        and w.warned_at is not null
        and e.status = 'in_progress'
        and k.payment_model = 'fixed'
        and k.checkpoints_enabled)
  )
    from public.campaigns k
   where k.id = e.campaign_id
$$;

-- One hire's notices, under its locks. Returns the counts as jsonb.
create function public.run_checkpoint_notices_for(engagement uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  business uuid;
  e public.engagements;
  k public.campaigns;
  fixed boolean;
  r record;
  base jsonb;
  facts jsonb;
  due_day date;
  dispute_from timestamptz;
  counts jsonb := jsonb_build_object('reminded', 0, 'overdue', 0, 'warned', 0, 'dispute_available', 0);
begin
  select g.business_id into business from public.engagements g where g.id = engagement;
  perform 1 from public.users u where u.id = business for no key update;
  select * into e from public.engagements x where x.id = engagement for update;
  if e.id is null or e.settled_at is not null
     or e.status not in ('in_progress', 'submitted', 'denied', 'disputed') then
    return counts;
  end if;
  select * into k from public.campaigns c where c.id = e.campaign_id;
  fixed := k.payment_model = 'fixed';
  base := jsonb_build_object('campaign_id', k.id, 'campaign_title', k.title, 'engagement_id', e.id);

  -- Reminder: due within the next 24 hours, no evidence, once.
  for r in
    select h.*, cc.due_on from public.hire_checkpoints h
      left join public.campaign_checkpoints cc on cc.id = h.campaign_checkpoint_id
     where h.engagement_id = e.id and h.status = 'due'
       and h.due_at > now() and h.due_at <= now() + interval '24 hours'
       and not exists (select 1 from public.checkpoint_events ev
                        where ev.hire_checkpoint_id = h.id and ev.event = 'reminded')
     order by h.due_at
  loop
    insert into public.checkpoint_events (hire_checkpoint_id, engagement_id, event, detail)
    values (r.id, e.id, 'reminded', jsonb_build_object('due_at', r.due_at));
    perform public.notify(e.creator_id, 'checkpoint_reminder',
      base || jsonb_build_object('name', public.display_name_of(e.business_id),
        'kickoff', r.kind = 'kickoff', 'due_on', r.due_on, 'due_at', r.due_at));
    counts := jsonb_set(counts, '{reminded}', to_jsonb((counts ->> 'reminded')::int + 1));
  end loop;

  -- Overdue: the due time has passed with no evidence. Both people are told.
  for r in
    select h.*, cc.due_on from public.hire_checkpoints h
      left join public.campaign_checkpoints cc on cc.id = h.campaign_checkpoint_id
     where h.engagement_id = e.id and h.status = 'due' and h.due_at <= now()
     order by h.due_at
       for update of h
  loop
    update public.hire_checkpoints x set status = 'overdue' where x.id = r.id;
    insert into public.checkpoint_events (hire_checkpoint_id, engagement_id, event, detail)
    values (r.id, e.id, 'overdue', jsonb_build_object('due_at', r.due_at));
    facts := base || jsonb_build_object('kickoff', r.kind = 'kickoff', 'due_on', r.due_on, 'due_at', r.due_at);
    perform public.notify(e.creator_id, 'checkpoint_overdue',
      facts || jsonb_build_object('name', public.display_name_of(e.business_id)));
    perform public.notify(e.business_id, 'checkpoint_overdue',
      facts || jsonb_build_object('name', public.display_name_of(e.creator_id)));
    counts := jsonb_set(counts, '{overdue}', to_jsonb((counts ->> 'overdue')::int + 1));
  end loop;

  if not fixed then
    return counts;
  end if;

  -- Warning: two days overdue, once. Tells the creator when a dispute could open.
  for r in
    select h.*, cc.due_on from public.hire_checkpoints h
      left join public.campaign_checkpoints cc on cc.id = h.campaign_checkpoint_id
     where h.engagement_id = e.id and h.status = 'overdue'
       and h.due_at <= now() - interval '2 days'
       and not exists (select 1 from public.checkpoint_events ev
                        where ev.hire_checkpoint_id = h.id and ev.event = 'warned')
     order by h.due_at
  loop
    dispute_from := greatest(r.due_at + interval '3 days', now() + interval '24 hours');
    insert into public.checkpoint_events (hire_checkpoint_id, engagement_id, event, detail)
    values (r.id, e.id, 'warned', jsonb_build_object('dispute_from', dispute_from));
    perform public.notify(e.creator_id, 'checkpoint_warning',
      base || jsonb_build_object('name', public.display_name_of(e.business_id),
        'kickoff', r.kind = 'kickoff', 'due_on', r.due_on, 'due_at', r.due_at,
        'dispute_from', dispute_from));
    counts := jsonb_set(counts, '{warned}', to_jsonb((counts ->> 'warned')::int + 1));
  end loop;

  -- Dispute available: still overdue, more than 3 days late and warned at least
  -- 24 hours ago. Only while the work is in progress (the early dispute's own rule).
  if e.status = 'in_progress' then
    for r in
      select h.*, cc.due_on,
             (select min(ev.created_at) from public.checkpoint_events ev
               where ev.hire_checkpoint_id = h.id and ev.event = 'warned') as warned_at
        from public.hire_checkpoints h
        left join public.campaign_checkpoints cc on cc.id = h.campaign_checkpoint_id
       where h.engagement_id = e.id and h.status = 'overdue'
         and not exists (select 1 from public.checkpoint_events ev
                          where ev.hire_checkpoint_id = h.id and ev.event = 'dispute_available')
       order by h.due_at
    loop
      continue when r.warned_at is null
        or now() <= greatest(r.due_at + interval '3 days', r.warned_at + interval '24 hours');
      insert into public.checkpoint_events (hire_checkpoint_id, engagement_id, event, detail)
      values (r.id, e.id, 'dispute_available', jsonb_build_object('due_at', r.due_at));
      perform public.notify(e.business_id, 'checkpoint_dispute_available',
        base || jsonb_build_object('name', public.display_name_of(e.creator_id),
          'kickoff', r.kind = 'kickoff', 'due_on', r.due_on, 'due_at', r.due_at));
      counts := jsonb_set(counts, '{dispute_available}', to_jsonb((counts ->> 'dispute_available')::int + 1));
    end loop;
  end if;

  return counts;
end;
$$;

-- The daily job's step: every running hire with something that could be due.
create function public.run_checkpoint_notices()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  hire uuid;
  one jsonb;
  total jsonb := jsonb_build_object('reminded', 0, 'overdue', 0, 'warned', 0, 'dispute_available', 0, 'failed', 0);
  key text;
begin
  for hire in
    select distinct h.engagement_id
      from public.hire_checkpoints h
      join public.engagements g on g.id = h.engagement_id
     where h.status in ('due', 'overdue')
       and g.settled_at is null
       and g.status in ('in_progress', 'submitted', 'denied', 'disputed')
  loop
    begin
      one := public.run_checkpoint_notices_for(hire);
      foreach key in array array['reminded', 'overdue', 'warned', 'dispute_available'] loop
        total := jsonb_set(total, array[key], to_jsonb((total ->> key)::int + (one ->> key)::int));
      end loop;
    exception when others then
      total := jsonb_set(total, '{failed}', to_jsonb((total ->> 'failed')::int + 1));
    end;
  end loop;
  return total;
end;
$$;

revoke all on function public.run_checkpoint_notices_for(uuid) from public, anon, authenticated, service_role;
revoke all on function public.run_checkpoint_notices() from public, anon, authenticated;
grant execute on function public.run_checkpoint_notices() to service_role;
