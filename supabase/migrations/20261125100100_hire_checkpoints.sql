-- Checkpoints for each hire: a kickoff confirmation and one row per checkpoint
-- date of the campaign, created when the creator starts work (design:
-- docs/superpowers/specs/2026-11-22-campaign-checkpoints-design.md §5.3, §5.4, §5.7).
--
-- Invariants protected here (proven by supabase/tests/hire_checkpoints.test.sql):
--   1. Checkpoint state is a record, never a payment condition. Nothing in this
--      file writes ledger_entries or changes an engagement's status, review
--      deadline, escrow or wallet. The only touch point with existing code is
--      start_engagement(), which makes the rows after it has done its own work.
--   2. Only the hire's creator adds evidence, only while the hire is running
--      (in progress, submitted, denied or disputed), never after it has settled.
--   3. Evidence is always accepted when it meets the campaign's rules: after the
--      due time it is recorded as done late, never refused for lateness.
--   4. Evidence and the trail are append-only; checkpoint rows change status only
--      through these functions (due -> done | done_late, overdue -> done_late;
--      the daily job and the final submission move the rest, in later migrations).
--   5. Only the two people on the hire and admins read any of it; screenshots
--      follow (proof_files gains a fourth parent, at most one set).
--   Lock order: the business's users row, the engagement, then the checkpoint row.
--
-- Errors (errcode P0001): kickoff_confirmations_required, checkpoint_evidence_missing,
-- checkpoint_not_yours, checkpoint_closed, hire_not_running, plus the existing
-- no_such_engagement, proof_invalid, contact_details and not_your_file.

-- Helpers --------------------------------------------------------------------------------------------------------------

-- Metrics a creator reports: an array of 1 to 6 objects, each with a platform
-- name and at least one figure from the list, each figure a whole number of
-- zero or more (mirrored by parseMetrics() in src/lib/checkpoints.ts).
create function public.valid_metrics_entry(entry jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(entry) = 'object'
     and jsonb_typeof(entry -> 'platform') = 'string'
     and char_length(entry ->> 'platform') between 1 and 30
     and (select count(*) from jsonb_object_keys(entry)) >= 2
     and not exists (
       select 1 from jsonb_each(entry) kv
        where kv.key <> 'platform'
          and not (
            kv.key = any (array['views', 'reach', 'impressions', 'likes', 'comments', 'shares', 'saves', 'link_clicks'])
            and case when jsonb_typeof(kv.value) = 'number'
                     then (kv.value::text)::numeric = trunc((kv.value::text)::numeric)
                          and (kv.value::text)::numeric between 0 and 9007199254740991
                     else false end
          )
     )
$$;

create function public.valid_metrics(m jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(m) = 'array'
     and jsonb_array_length(m) between 1 and 6
     and not exists (
       select 1 from jsonb_array_elements(m) entry where not public.valid_metrics_entry(entry)
     )
$$;

-- Whether a checkpoint date applies to a creator who started at `started`:
-- only if it is at least 3 days after their Lagos start date (mirrored by
-- checkpointApplies() in src/lib/checkpoints.ts).
create function public.checkpoint_applicability(due_on date, started timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when due_on < (started at time zone 'Africa/Lagos')::date then 'started_after'
    when due_on >= (started at time zone 'Africa/Lagos')::date + 3 then 'applies'
    else 'too_soon'
  end
$$;

-- Tables ---------------------------------------------------------------------------------------------------

create table public.hire_checkpoints (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements (id) on delete restrict,
  -- Null for the kickoff.
  campaign_checkpoint_id uuid references public.campaign_checkpoints (id) on delete restrict,
  kind text not null check (kind in ('kickoff', 'progress')),
  due_at timestamptz not null,
  status text not null check (status in ('skipped', 'due', 'overdue', 'done', 'done_late', 'closed')),
  -- A checkpoint that doesn't apply to this creator, and why.
  skip_reason text check (skip_reason in ('started_after', 'too_soon')),
  -- When the first evidence arrived.
  evidence_at timestamptz,
  created_at timestamptz not null default now(),

  constraint hire_checkpoints_kickoff_link_check check ((kind = 'kickoff') = (campaign_checkpoint_id is null)),
  constraint hire_checkpoints_skipped_reason_check check ((status = 'skipped') = (skip_reason is not null)),
  constraint hire_checkpoints_done_time_check check ((status in ('done', 'done_late')) = (evidence_at is not null)),
  constraint hire_checkpoints_unique unique (engagement_id, campaign_checkpoint_id)
);
create unique index hire_checkpoints_one_kickoff on public.hire_checkpoints (engagement_id) where kind = 'kickoff';
-- The daily job's lookups: rows still waiting on evidence.
create index hire_checkpoints_open_idx on public.hire_checkpoints (due_at) where status in ('due', 'overdue');

create table public.checkpoint_evidence (
  id uuid primary key default gen_random_uuid(),
  hire_checkpoint_id uuid not null references public.hire_checkpoints (id) on delete restrict,
  engagement_id uuid not null references public.engagements (id) on delete restrict,
  author_id uuid not null references public.users (id) on delete restrict,
  note text check (note is null or (note = btrim(note) and char_length(note) between 1 and 1000)),
  links text[] not null default '{}' check (cardinality(links) <= 10),
  -- Self-reported figures, per platform (valid_metrics()); never a payment condition.
  metrics jsonb check (metrics is null or public.valid_metrics(metrics)),
  captured_on date,
  period_from date,
  period_to date,
  -- The kickoff's two confirmations.
  confirmed_brief boolean,
  confirmed_started boolean,
  -- True when it arrived after the due time.
  late boolean not null default false,
  created_at timestamptz not null default now()
);
create index checkpoint_evidence_checkpoint_idx on public.checkpoint_evidence (hire_checkpoint_id, created_at);
create index checkpoint_evidence_engagement_idx on public.checkpoint_evidence (engagement_id);

create table public.checkpoint_events (
  id uuid primary key default gen_random_uuid(),
  hire_checkpoint_id uuid references public.hire_checkpoints (id) on delete restrict,
  engagement_id uuid not null references public.engagements (id) on delete restrict,
  event text not null check (event in (
    'applied', 'skipped', 'kickoff_submitted', 'evidence_submitted', 'evidence_late',
    'reminded', 'overdue', 'warned', 'dispute_available', 'closed')),
  -- Null for the system.
  actor uuid references public.users (id) on delete restrict,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index checkpoint_events_engagement_idx on public.checkpoint_events (engagement_id, created_at);
create index checkpoint_events_checkpoint_idx on public.checkpoint_events (hire_checkpoint_id, event);

-- Append-only, like the ledger: "always" so the triggers fire even with
-- session_replication_role = replica.
create trigger checkpoint_events_append_only
  before update or delete on public.checkpoint_events
  for each row execute function public.reject_change('checkpoint_events_append_only');
create trigger checkpoint_events_no_truncate
  before truncate on public.checkpoint_events
  for each statement execute function public.reject_change('checkpoint_events_append_only');
alter table public.checkpoint_events enable always trigger checkpoint_events_append_only;
alter table public.checkpoint_events enable always trigger checkpoint_events_no_truncate;

create trigger checkpoint_evidence_append_only
  before update or delete on public.checkpoint_evidence
  for each row execute function public.reject_change('checkpoint_evidence_append_only');
create trigger checkpoint_evidence_no_truncate
  before truncate on public.checkpoint_evidence
  for each statement execute function public.reject_change('checkpoint_evidence_append_only');
alter table public.checkpoint_evidence enable always trigger checkpoint_evidence_append_only;
alter table public.checkpoint_evidence enable always trigger checkpoint_evidence_no_truncate;

-- Screenshots: a fourth parent -------------------------------------------------------------------------------

alter table public.proof_files
  add column checkpoint_evidence_id uuid references public.checkpoint_evidence (id) on delete restrict;
create index proof_files_checkpoint_evidence_idx on public.proof_files (checkpoint_evidence_id)
  where checkpoint_evidence_id is not null;

alter table public.proof_files drop constraint proof_files_one_parent;
alter table public.proof_files add constraint proof_files_one_parent check (
  (submission_id is not null)::int + (dispute_statement_id is not null)::int
  + (click_proof_id is not null)::int + (checkpoint_evidence_id is not null)::int <= 1
);

-- As in 20261120100300_click_proofs.sql, plus checkpoint evidence.
drop policy "Proof files: the owner, both sides of the hire, admins" on public.proof_files;
create policy "Proof files: the owner, both sides of the hire, admins"
  on public.proof_files for select to authenticated
  using (
    owner_id = (select public.current_user_id())
    or exists (
      select 1 from public.submissions s
        join public.engagements g on g.id = s.engagement_id
       where s.id = submission_id
         and (select public.current_user_id()) in (g.creator_id, g.business_id)
    )
    or exists (
      select 1 from public.dispute_statements t
        join public.disputes d on d.id = t.dispute_id
        join public.engagements g on g.id = d.engagement_id
       where t.id = dispute_statement_id
         and (select public.current_user_id()) in (g.creator_id, g.business_id)
    )
    or exists (
      select 1 from public.click_proofs p
        join public.engagements g on g.id = p.engagement_id
       where p.id = click_proof_id
         and (select public.current_user_id()) in (g.creator_id, g.business_id)
    )
    or exists (
      select 1 from public.checkpoint_evidence v
        join public.engagements g on g.id = v.engagement_id
       where v.id = checkpoint_evidence_id
         and (select public.current_user_id()) in (g.creator_id, g.business_id)
    )
    or (select public.current_user_role()) = 'admin'
  );

-- Reading --------------------------------------------------------------------------------------------------------

alter table public.hire_checkpoints enable row level security;
alter table public.checkpoint_evidence enable row level security;
alter table public.checkpoint_events enable row level security;

-- No direct writes for any role, the server included: every change goes
-- through the security definer functions below.
revoke all on table public.hire_checkpoints from anon, authenticated, service_role;
revoke all on table public.checkpoint_evidence from anon, authenticated, service_role;
revoke all on table public.checkpoint_events from anon, authenticated, service_role;
grant select on table public.hire_checkpoints to authenticated, service_role;
grant select on table public.checkpoint_evidence to authenticated, service_role;
grant select on table public.checkpoint_events to authenticated, service_role;

create policy "Hire checkpoints: the two people on the hire, admins"
  on public.hire_checkpoints for select to authenticated
  using (
    exists (
      select 1 from public.engagements g
       where g.id = engagement_id
         and (select public.current_user_id()) in (g.creator_id, g.business_id)
    )
    or (select public.current_user_role()) = 'admin'
  );
create policy "Checkpoint evidence: the two people on the hire, admins"
  on public.checkpoint_evidence for select to authenticated
  using (
    exists (
      select 1 from public.engagements g
       where g.id = engagement_id
         and (select public.current_user_id()) in (g.creator_id, g.business_id)
    )
    or (select public.current_user_role()) = 'admin'
  );
create policy "Checkpoint events: the two people on the hire, admins"
  on public.checkpoint_events for select to authenticated
  using (
    exists (
      select 1 from public.engagements g
       where g.id = engagement_id
         and (select public.current_user_id()) in (g.creator_id, g.business_id)
    )
    or (select public.current_user_role()) = 'admin'
  );

-- Creating a hire's rows -------------------------------------------------------------------------------------------------

-- Called by start_engagement() for a campaign with checkpoints: the kickoff
-- (due 48 hours after the start) and one row per campaign checkpoint, due at
-- the end of its day in Lagos, or skipped with the reason. Each is in the trail.
create function public.create_hire_checkpoints(engagement uuid, campaign uuid, started timestamptz)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  kickoff uuid;
  made uuid;
  c record;
  verdict text;
  due timestamptz;
begin
  insert into public.hire_checkpoints (engagement_id, kind, due_at, status)
  values (engagement, 'kickoff', started + interval '48 hours', 'due')
  returning id into kickoff;
  insert into public.checkpoint_events (hire_checkpoint_id, engagement_id, event, detail)
  values (kickoff, engagement, 'applied',
          jsonb_build_object('kind', 'kickoff', 'due_at', started + interval '48 hours'));

  for c in select cc.id, cc.seq, cc.due_on from public.campaign_checkpoints cc
            where cc.campaign_id = campaign order by cc.seq
  loop
    verdict := public.checkpoint_applicability(c.due_on, started);
    due := timezone('Africa/Lagos', (c.due_on + 1)::timestamp);
    insert into public.hire_checkpoints (engagement_id, campaign_checkpoint_id, kind, due_at, status, skip_reason)
    values (engagement, c.id, 'progress', due,
            case when verdict = 'applies' then 'due' else 'skipped' end,
            case when verdict = 'applies' then null else verdict end)
    returning id into made;
    insert into public.checkpoint_events (hire_checkpoint_id, engagement_id, event, detail)
    values (made, engagement,
            case when verdict = 'applies' then 'applied' else 'skipped' end,
            jsonb_build_object('kind', 'progress', 'seq', c.seq, 'due_on', c.due_on)
              || case when verdict = 'applies' then '{}'::jsonb else jsonb_build_object('reason', verdict) end);
  end loop;
end;
$$;


-- Writing evidence ----------------------------------------------------------------------------------------------------------------

-- The one place evidence is written, for the kickoff and for progress
-- checkpoints. The caller has taken the locks and checked who may write and
-- that the hire is running. Validates the shape of everything (links, files,
-- figures, dates, contact details), then, for a progress checkpoint, the
-- campaign's evidence rules. Lateness never refuses: after the due time the
-- row becomes done_late. Writes no money and touches no engagement.
create function public.write_checkpoint_evidence(
  h public.hire_checkpoints, e public.engagements, k public.campaigns, me uuid,
  note text, links text[], metrics jsonb, captured_on date, period_from date, period_to date,
  file_ids uuid[], confirmed_brief boolean, confirmed_started boolean
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  kickoff boolean := h.kind = 'kickoff';
  clean_note text := nullif(btrim(note), '');
  clean_links text[];
  files uuid[] := coalesce(file_ids, '{}');
  required text[] := coalesce(k.checkpoint_evidence, '{}');
  owned integer;
  new_status text;
  was_open boolean := h.status in ('due', 'overdue');
  late boolean;
  written uuid;
  due_day date;
begin
  if char_length(clean_note) > (case when kickoff then 500 else 1000 end) then
    raise exception 'proof_invalid' using errcode = 'P0001';
  end if;
  if clean_note is not null and public.contact_detail_kind(clean_note) is not null then
    raise exception 'contact_details' using errcode = 'P0001';
  end if;

  if exists (select 1 from unnest(coalesce(links, '{}')) l where l is null) then
    raise exception 'proof_invalid' using errcode = 'P0001';
  end if;
  clean_links := array(select btrim(l) from unnest(coalesce(links, '{}')) with ordinality u(l, i) order by i);
  if cardinality(clean_links) > 10
     or cardinality(files) > (case when kickoff then 3 else 5 end)
     or (select count(distinct f) from unnest(files) f) <> cardinality(files)
     or exists (select 1 from unnest(files) f where f is null)
     or exists (select 1 from unnest(clean_links) l
                 where char_length(l) > 500 or l !~* '^https://\S+$') then
    raise exception 'proof_invalid' using errcode = 'P0001';
  end if;
  if (metrics is not null and not public.valid_metrics(metrics))
     or (captured_on is not null and (captured_on > public.lagos_today()
                                      or (k.post_from is not null and captured_on < k.post_from)))
     or (period_from is null) <> (period_to is null)
     or period_from > period_to
     or period_to > public.lagos_today()
     or (kickoff and (metrics is not null or captured_on is not null or period_from is not null
                      or cardinality(clean_links) > 0)) then
    raise exception 'proof_invalid' using errcode = 'P0001';
  end if;

  if not kickoff then
    if ('progress_update' = any (required) and char_length(coalesce(clean_note, '')) < 20)
       or ('content_links' = any (required) and cardinality(clean_links) = 0)
       or ('publication_screenshots' = any (required) and cardinality(files) = 0)
       or ('analytics' = any (required)
           and (cardinality(files) = 0 or metrics is null or captured_on is null)) then
      raise exception 'checkpoint_evidence_missing' using errcode = 'P0001';
    end if;
  end if;

  select count(*) into owned from (
    select 1 from public.proof_files f
     where f.id = any(files) and f.owner_id = me
       and f.submission_id is null and f.dispute_statement_id is null
       and f.click_proof_id is null and f.checkpoint_evidence_id is null
       for update
  ) x;
  if owned <> cardinality(files) then
    raise exception 'not_your_file' using errcode = 'P0001';
  end if;

  -- Waiting rows finish now, late if the time has passed, whether or not the
  -- daily job has marked them overdue yet. A row already done keeps its status
  -- and just gains another entry.
  new_status := case when not was_open then h.status
                     when now() > h.due_at then 'done_late'
                     else 'done' end;
  late := new_status = 'done_late';

  insert into public.checkpoint_evidence (
    hire_checkpoint_id, engagement_id, author_id, note, links, metrics, captured_on,
    period_from, period_to, confirmed_brief, confirmed_started, late)
  values (h.id, e.id, me, clean_note, clean_links, metrics, captured_on,
          period_from, period_to, confirmed_brief, confirmed_started, late)
  returning id into written;

  update public.proof_files f set checkpoint_evidence_id = written where f.id = any(files);

  update public.hire_checkpoints x
     set status = new_status, evidence_at = coalesce(x.evidence_at, now())
   where x.id = h.id;

  insert into public.checkpoint_events (hire_checkpoint_id, engagement_id, event, actor, detail)
  values (h.id, e.id,
          case when kickoff then 'kickoff_submitted'
               when late then 'evidence_late'
               else 'evidence_submitted' end,
          me, jsonb_build_object('evidence', written, 'late', late));

  -- The business hears once, when the row finishes. The creator never hears
  -- about their own action.
  if was_open then
    select cc.due_on into due_day
      from public.campaign_checkpoints cc where cc.id = h.campaign_checkpoint_id;
    perform public.notify(
      e.business_id,
      case when late then 'checkpoint_late'
           when kickoff then 'kickoff_done'
           else 'checkpoint_done' end::public.notification_kind,
      jsonb_build_object(
        'campaign_id', k.id, 'campaign_title', k.title, 'engagement_id', e.id,
        'name', public.display_name_of(e.creator_id),
        'kickoff', kickoff, 'due_on', due_day));
  end if;
  return written;
end;
$$;

-- The creator confirms the kickoff: read the brief, and has started (or
-- scheduled) the work. An optional note and up to 3 screenshots.
create function public.submit_kickoff(engagement uuid, confirmed_brief boolean, confirmed_started boolean, note text, file_ids uuid[])
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  business uuid;
  e public.engagements;
  k public.campaigns;
  h public.hire_checkpoints;
begin
  select g.business_id into business from public.engagements g where g.id = engagement;
  perform 1 from public.users u where u.id = business for no key update;
  select * into e from public.engagements x where x.id = engagement for update;
  if e.id is null or me is null or e.creator_id is distinct from me then
    raise exception 'no_such_engagement' using errcode = 'P0001';
  end if;
  if e.status not in ('in_progress', 'submitted', 'denied', 'disputed') or e.settled_at is not null then
    raise exception 'hire_not_running' using errcode = 'P0001';
  end if;
  if confirmed_brief is not true or confirmed_started is not true then
    raise exception 'kickoff_confirmations_required' using errcode = 'P0001';
  end if;

  select * into h from public.hire_checkpoints c
   where c.engagement_id = e.id and c.kind = 'kickoff' for update;
  if h.id is null or h.status in ('skipped', 'closed') then
    raise exception 'checkpoint_closed' using errcode = 'P0001';
  end if;
  select * into k from public.campaigns c where c.id = e.campaign_id;

  return public.write_checkpoint_evidence(h, e, k, me, note, null, null, null, null, null,
                                          file_ids, true, true);
end;
$$;

-- The creator sends evidence for one progress checkpoint of their hire. What
-- it needs is the campaign's checkpoint_evidence; later entries are added
-- beside earlier ones.
create function public.submit_checkpoint(
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
  select * into k from public.campaigns c where c.id = e.campaign_id;

  return public.write_checkpoint_evidence(h, e, k, me, note, links, metrics, captured_on,
                                          period_from, period_to, file_ids, null, null);
end;
$$;

-- Grants --------------------------------------------------------------------------------------------------------------------------------

revoke all on function public.valid_metrics_entry(jsonb) from public, anon, authenticated;
revoke all on function public.valid_metrics(jsonb) from public, anon, authenticated;
revoke all on function public.checkpoint_applicability(date, timestamptz) from public, anon, authenticated;
revoke all on function public.create_hire_checkpoints(uuid, uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.write_checkpoint_evidence(
  public.hire_checkpoints, public.engagements, public.campaigns, uuid, text, text[], jsonb, date, date, date, uuid[], boolean, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.submit_kickoff(uuid, boolean, boolean, text, uuid[]) from public, anon;
revoke all on function public.submit_checkpoint(uuid, text, text[], jsonb, date, date, date, uuid[]) from public, anon;
grant execute on function public.submit_kickoff(uuid, boolean, boolean, text, uuid[]) to authenticated;
grant execute on function public.submit_checkpoint(uuid, text, text[], jsonb, date, date, date, uuid[]) to authenticated;

-- Existing functions, each copied from its latest definition with additions ---------------------------------------------------------------

-- start_engagement (from 20261119100100): also creates the hire's checkpoints.
create or replace function public.start_engagement(engagement uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  business uuid;
  e public.engagements;
  tries int := 0;
  started timestamptz := now();
begin
  select g.business_id into business from public.engagements g where g.id = engagement;
  perform 1 from public.users u where u.id = business for no key update;
  select * into e from public.engagements x where x.id = engagement for update;
  if e.id is null or me is null or e.creator_id is distinct from me then
    raise exception 'no_such_engagement' using errcode = 'P0001';
  end if;
  if e.status <> 'funded' then
    raise exception 'engagement_locked' using errcode = 'P0001';
  end if;

  update public.engagements x
     set status = 'in_progress', started_at = started, updated_at = now()
   where x.id = e.id;

  if exists (select 1 from public.campaigns k where k.id = e.campaign_id and k.payment_model = 'per_click') then
    loop
      begin
        insert into public.tracked_links (code, engagement_id, campaign_id, business_id, creator_id)
        values (public.new_link_code(), e.id, e.campaign_id, e.business_id, e.creator_id);
        exit;
      exception when unique_violation then
        tries := tries + 1;
        if tries >= 5 then
          raise;
        end if;
      end;
    end loop;
  end if;

  -- A campaign with checkpoints gets this hire's kickoff and checkpoints,
  -- counted from the moment they started. Records only: no money, no status.
  if exists (select 1 from public.campaigns k where k.id = e.campaign_id and k.checkpoints_enabled) then
    perform public.create_hire_checkpoints(e.id, e.campaign_id, started);
  end if;
end;
$$;

-- delete_orphan_proof_files (from 20261120100300): checkpoint screenshots are not orphans.
create or replace function public.delete_orphan_proof_files()
returns setof text
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.proof_files f
   where f.submission_id is null
     and f.dispute_statement_id is null
     and f.click_proof_id is null
     and f.checkpoint_evidence_id is null
     and f.created_at < now() - interval '1 day'
  returning f.path
$$;
