-- Final-submission eligibility (design:
-- docs/superpowers/specs/2026-11-22-campaign-checkpoints-design.md §5.5).
--
-- submit_work() gains a longer form with the fields a campaign's final
-- requirements ask for (figures, the day they were captured, a written report).
-- The four-argument call stays and calls it with nulls, so campaigns without
-- requirements behave exactly as before.
--
-- Added before today's logic, for the hire's creator:
--   * checkpoints_outstanding: while the kickoff or a checkpoint whose due time
--     has passed has no evidence (status due or overdue). A checkpoint still to
--     come never blocks, so someone who finishes early need not wait.
--   * final_requirements_missing: unless the submission meets the campaign's
--     final_requirements (links, screenshots, analytics, report). Also on a
--     resubmission after a denial. With requirements set, they replace the
--     "a link or a screenshot" rule; with none, that rule stands.
-- Added after it: checkpoints still to come are closed (the final work covers
-- them), each with a trail entry.
--
-- Invariants: everything after the gate is today's flow (7 days from this
-- submission, hire becomes submitted, review, reminders, auto-release, disputes).
-- Checkpoint state never feeds settle_money() or release_overdue_submissions(),
-- and nothing here writes the ledger.
-- Lock order as before: the business's users row, the engagement, the files.

alter table public.submissions
  add column metrics jsonb check (metrics is null or public.valid_metrics(metrics)),
  add column captured_on date,
  add column report text check (report is null or (report = btrim(report) and char_length(report) between 1 and 1000));

create function public.submit_work(
  engagement uuid, note text, links text[], file_ids uuid[],
  metrics jsonb, captured_on date, report text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  me uuid := public.current_user_id();
  business uuid;
  e public.engagements;
  k public.campaigns;
  clean_note text := nullif(btrim(note), '');
  clean_report text := nullif(btrim(report), '');
  clean_links text[];
  files uuid[] := coalesce(file_ids, '{}');
  required text[];
  next_round integer;
  owned integer;
  submission uuid;
  outstanding uuid[];
begin
  select g.business_id into business from public.engagements g where g.id = engagement;
  perform 1 from public.users u where u.id = business for no key update;
  select * into e from public.engagements x where x.id = engagement for update;
  if e.id is null or me is null or e.creator_id is distinct from me then
    raise exception 'no_such_engagement' using errcode = 'P0001';
  end if;
  if e.status not in ('in_progress', 'denied') or e.settled_at is not null then
    raise exception 'engagement_locked' using errcode = 'P0001';
  end if;
  select * into k from public.campaigns c where c.id = e.campaign_id;
  required := k.final_requirements;

  select coalesce(max(s.round), 0) + 1 into next_round
    from public.submissions s where s.engagement_id = e.id;
  if next_round > 4 then
    raise exception 'no_rounds_left' using errcode = 'P0001';
  end if;

  if exists (select 1 from unnest(coalesce(links, '{}')) l where l is null) then
    raise exception 'proof_invalid' using errcode = 'P0001';
  end if;
  clean_links := array(select btrim(l) from unnest(coalesce(links, '{}')) with ordinality u(l, i) order by i);
  if cardinality(clean_links) > 10
     or cardinality(files) > 5
     or (select count(distinct f) from unnest(files) f) <> cardinality(files)
     or exists (select 1 from unnest(files) f where f is null)
     or exists (select 1 from unnest(clean_links) l
                 where char_length(l) > 500 or l !~* '^https?://\S+$')
     or char_length(clean_note) > 1000
     or char_length(clean_report) > 1000
     or (metrics is not null and not public.valid_metrics(metrics))
     or (captured_on is not null and (captured_on > public.lagos_today()
                                      or (k.post_from is not null and captured_on < k.post_from))) then
    raise exception 'proof_invalid' using errcode = 'P0001';
  end if;
  if clean_report is not null and public.contact_detail_kind(clean_report) is not null then
    raise exception 'contact_details' using errcode = 'P0001';
  end if;

  -- The kickoff and checkpoints whose time has passed need evidence first (late is fine).
  select array_agg(c.id order by c.due_at) into outstanding
    from public.hire_checkpoints c
   where c.engagement_id = e.id and c.status in ('due', 'overdue') and c.due_at <= now();
  if outstanding is not null then
    raise exception 'checkpoints_outstanding' using errcode = 'P0001', detail = outstanding::text;
  end if;

  if cardinality(required) = 0 then
    if cardinality(clean_links) = 0 and cardinality(files) = 0 then
      raise exception 'proof_required' using errcode = 'P0001';
    end if;
  elsif ('content_links' = any (required)
         and (cardinality(clean_links) = 0 or exists (select 1 from unnest(clean_links) l where l !~* '^https://\S+$')))
     or ('publication_screenshots' = any (required) and cardinality(files) = 0)
     or ('analytics' = any (required) and (cardinality(files) = 0 or metrics is null or captured_on is null))
     or ('final_report' = any (required) and char_length(coalesce(clean_report, '')) < 100) then
    raise exception 'final_requirements_missing' using errcode = 'P0001';
  end if;

  select count(*) into owned from (
    select 1 from public.proof_files f
     where f.id = any(files) and f.owner_id = me
       and f.submission_id is null and f.dispute_statement_id is null
       for update
  ) x;
  if owned <> cardinality(files) then
    raise exception 'not_your_file' using errcode = 'P0001';
  end if;

  insert into public.submissions (engagement_id, round, note, links, review_deadline_at, metrics, captured_on, report)
  values (e.id, next_round, clean_note, clean_links, now() + interval '7 days', metrics, captured_on, clean_report)
  returning id into submission;

  update public.proof_files f set submission_id = submission where f.id = any(files);

  update public.engagements x set status = 'submitted', updated_at = now() where x.id = e.id;

  -- The final work covers checkpoints still to come: close them, so they are
  -- neither notified nor required again.
  with closed as (
    update public.hire_checkpoints c set status = 'closed'
     where c.engagement_id = e.id and c.status = 'due' and c.due_at > now()
    returning c.id
  )
  insert into public.checkpoint_events (hire_checkpoint_id, engagement_id, event, actor, detail)
  select closed.id, e.id, 'closed', me, jsonb_build_object('reason', 'final_submitted')
    from closed;

  return submission;
end;
$$;

-- The four-argument call, as before for campaigns without checkpoints or requirements.
create or replace function public.submit_work(engagement uuid, note text, links text[], file_ids uuid[])
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$
  select public.submit_work(engagement, note, links, file_ids, null, null, null)
$$;

revoke all on function public.submit_work(uuid, text, text[], uuid[], jsonb, date, text) from public, anon;
grant execute on function public.submit_work(uuid, text, text[], uuid[], jsonb, date, text) to authenticated;
