-- Evidence for a progress checkpoint can be sent only from the day before its
-- due day, Lagos time (owner's decision 2026-11-27): a checkpoint due on
-- 30 Nov opens at 00:00 on 29 Nov. Before that, submit_checkpoint() refuses
-- with checkpoint_not_open. The kickoff is open from "Start work", and a row
-- that is overdue or already done (adding more) is unaffected. Lagos has no
-- daylight saving, so "the start of the day before" is due_at minus 48 hours.
-- `create or replace` keeps the grants from 20261125100100.

create or replace function public.submit_checkpoint(
  hire_checkpoint uuid, note text, links text[], metrics jsonb,
  captured_on date, period_from date, period_to date, file_ids uuid[]
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  engagement uuid;
  business uuid;
  e public.engagements;
  k public.campaigns;
  h public.hire_checkpoints;
begin
  select c.engagement_id into engagement from public.hire_checkpoints c where c.id = hire_checkpoint;
  select g.business_id into business from public.engagements g where g.id = engagement;
  perform 1 from public.users u where u.id = business for no key update;
  select * into e from public.engagements x where x.id = engagement for update;
  if e.id is null or me is null or e.creator_id is distinct from me then
    raise exception 'checkpoint_not_yours' using errcode = 'P0001';
  end if;
  if e.status not in ('in_progress', 'submitted', 'denied', 'disputed') or e.settled_at is not null then
    raise exception 'hire_not_running' using errcode = 'P0001';
  end if;

  select * into h from public.hire_checkpoints c where c.id = hire_checkpoint for update;
  if h.kind <> 'progress' or h.status in ('skipped', 'closed') then
    raise exception 'checkpoint_closed' using errcode = 'P0001';
  end if;
  -- A checkpoint still to come opens the day before its due day (Lagos): it is
  -- due at the end of its day, so it opens 48 hours before. Rows already done
  -- (adding more) or overdue are open.
  if h.status = 'due' and now() < h.due_at - interval '48 hours' then
    raise exception 'checkpoint_not_open' using errcode = 'P0001';
  end if;
  select * into k from public.campaigns c where c.id = e.campaign_id;

  return public.write_checkpoint_evidence(h, e, k, me, note, links, metrics, captured_on,
                                          period_from, period_to, file_ids, null, null);
end;
$$;
