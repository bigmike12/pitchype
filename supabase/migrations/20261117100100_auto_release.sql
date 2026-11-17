-- The daily review-deadline job (Stage 7): auto-release overdue submissions,
-- remind businesses before the deadline, and clear unattached proof uploads.
-- Called by /api/cron/review-deadlines through src/lib/review-deadlines.ts.
-- Design: docs/superpowers/specs/2026-11-17-stage-7-submissions-disputes-design.md §5, §7;
-- CLAUDE.md §6 rule 9.
--
-- Invariants this migration protects:
--   1. Auto-release goes through release_if_overdue(), the same path accept
--      and deny take past the deadline, and so through
--      settle_engagement_internal() -> settle_money(). No new ledger writer.
--   2. Only a submitted hire whose waiting submission's stored deadline is at
--      or before now is released. A denied or disputed hire is not (the clock
--      stopped). Safe to run twice or late: release_if_overdue() re-checks
--      under the locks, and settling a settled hire writes nothing.
--   3. Lock order, as everywhere: the business's users row, then the
--      engagement, then the submission.
--   4. Each reminder is sent once: the reminded_* column is set by the same
--      update that picks the row, so two runs can't both send it. When both
--      are due only the 1-day reminder is sent, and both columns are set.
--   5. Only unattached proof files older than a day are deleted; submit_work()
--      locks a file before attaching it, so a file can't be attached and
--      deleted at once.
--   6. A proof file's path is under its owner's folder in the bucket.
--   7. Only the server runs these; no direct table writes for any role.
--
-- Errors raised (P0001 are refusals the app shows, see src/lib/refusals.ts):
--   P0001 proof_invalid  register_proof_file() with a path outside the owner's folder

-- Releasing overdue work ----------------------------------------------------------------------------------

-- Returns how many hires it released. One transaction: if a release fails the
-- whole run fails and the cron answers 500; the next run retries everything.
create function public.release_overdue_submissions()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  due record;
  e public.engagements;
  released integer := 0;
begin
  for due in
    select g.id, g.business_id
      from public.engagements g
      join public.submissions s on s.engagement_id = g.id and s.status = 'pending_review'
     where g.status = 'submitted'
       and s.review_deadline_at <= now()
     order by g.business_id, g.id
  loop
    perform 1 from public.users u where u.id = due.business_id for no key update;
    select * into e from public.engagements x where x.id = due.id for update;
    if public.release_if_overdue(e) then
      released := released + 1;
    end if;
  end loop;
  return released;
end;
$$;

-- Reminders -----------------------------------------------------------------------------------------------

-- Returns how many reminders it sent. days_left is whole days rounded up, so
-- 20 hours left reads "1 day"; the screens show the deadline itself too.
create function public.send_review_reminders()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
  sent integer := 0;
begin
  for r in
    update public.submissions s
       set reminded_3d_at = coalesce(s.reminded_3d_at, now()),
           reminded_1d_at = case when s.review_deadline_at - now() <= interval '1 day'
                                 then now() else s.reminded_1d_at end
      from public.engagements g
      join public.campaigns k on k.id = g.campaign_id
     where g.id = s.engagement_id
       and g.status = 'submitted'
       and s.status = 'pending_review'
       and s.review_deadline_at > now()
       and ((s.review_deadline_at - now() <= interval '1 day' and s.reminded_1d_at is null)
            or (s.review_deadline_at - now() <= interval '3 days' and s.reminded_3d_at is null))
    returning g.id as engagement_id, g.business_id, g.creator_id, k.id as campaign_id, k.title,
              s.review_deadline_at
  loop
    perform public.notify(r.business_id, 'review_reminder', jsonb_build_object(
      'campaign_id', r.campaign_id,
      'campaign_title', r.title,
      'engagement_id', r.engagement_id,
      'name', public.display_name_of(r.creator_id),
      'review_deadline_at', r.review_deadline_at,
      'days_left', ceil(extract(epoch from r.review_deadline_at - now()) / 86400)::integer));
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;

-- Orphan proof files --------------------------------------------------------------------------------------

-- Uploads that were never attached (the person gave up, or the submit was
-- refused). Deletes the rows and returns their paths for the server to delete
-- from the work-proof bucket.
create function public.delete_orphan_proof_files()
returns setof text
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.proof_files f
   where f.submission_id is null
     and f.dispute_statement_id is null
     and f.created_at < now() - interval '1 day'
  returning f.path
$$;

-- Proof files stay in their owner's folder ---------------------------------------------------------------

-- As in the create_submissions migration, plus the path check: the server
-- uploads to "<owner id>/...", so a row can't point at someone else's object.
create or replace function public.register_proof_file(owner uuid, path text, content_type text, bytes integer)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  file uuid;
begin
  if path is null or owner is null or not starts_with(path, owner::text || '/') then
    raise exception 'proof_invalid' using errcode = 'P0001';
  end if;

  insert into public.proof_files (owner_id, path, content_type, bytes)
  values (owner, path, content_type, bytes)
  returning id into file;
  return file;
end;
$$;

-- Function grants -----------------------------------------------------------------------------------------

revoke all on function public.release_overdue_submissions() from public, anon, authenticated;
revoke all on function public.send_review_reminders() from public, anon, authenticated;
revoke all on function public.delete_orphan_proof_files() from public, anon, authenticated;
grant execute on function public.release_overdue_submissions() to service_role;
grant execute on function public.send_review_reminders() to service_role;
grant execute on function public.delete_orphan_proof_files() to service_role;

-- Restated: create or replace keeps them, but this is the function's latest home.
revoke all on function public.register_proof_file(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.register_proof_file(uuid, text, text, integer) to service_role;
