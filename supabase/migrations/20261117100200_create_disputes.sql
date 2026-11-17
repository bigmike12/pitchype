-- Disputes: either side asks an admin to decide a hire (Stage 7).
-- Design: docs/superpowers/specs/2026-11-17-stage-7-submissions-disputes-design.md §2, §3, §4, §5, §11;
-- CLAUDE.md §5, §6.2, §6.4 (rule 4), §6.5.
--
-- Invariants this migration protects:
--   1. Escrow still leaves a hire only through settle_engagement_internal() ->
--      settle_money(). Deciding a dispute closes it and settles the hire in one
--      transaction; a decided or withdrawn dispute can't be decided again, and
--      settling a settled hire stays a no-op. No new ledger writer.
--   2. Who opens, and from where: either person from denied; the business also
--      from in_progress once the non-delivery date has passed (the later of the
--      day after deliver_by at 00:00 Lagos and started_at + 7 days, §11.4).
--      Never from submitted: the business denies first, which stops the clock,
--      so withdrawing never needs to restore a review deadline (§11.1).
--   3. One open dispute per hire (a partial unique index). While it is open the
--      hire is disputed, so submit, deny, creator withdraw, the daily
--      auto-release and the Stage 6 admin escrow tool all refuse it (their own
--      status checks). Nothing settles by itself while a dispute is open.
--   4. A dispute ends only three ways: an admin decides (release, refund, split
--      or creator at fault); the person who opened it withdraws it, which puts
--      the hire back to the status it came from and moves no money; or the
--      business accepts denied work, which releases in full (outcome
--      accepted_by_business). With nothing submitted (a non-delivery dispute)
--      there is nothing to accept, so only the admin or a withdrawal ends it.
--   5. Statements are written by the two people of the hire or an admin, only
--      while the dispute is open, and never changed or deleted (a trigger, as
--      on the ledger). The opening reason is also the first statement, which
--      carries the opener's links and screenshots, so evidence always hangs
--      off a statement.
--   6. Lock order, as in Stage 6: the business's users row, then the
--      engagement, then the dispute (and the submission or proof files).
--   7. Suspension and strikes don't stop disputes (CLAUDE.md §6.5): none of
--      these functions checks standing.
--   8. Only the two people of the hire and admins read disputes, statements
--      and their screenshots. No direct writes for any role, the server
--      included.
--
-- Errors raised (P0001 are refusals the app shows, see src/lib/refusals.ts):
--   P0001 no_such_engagement       not the caller's hire, or no such hire
--   P0001 engagement_locked        wrong status (submitted, settled, nothing to accept)
--   P0001 dispute_open             the hire already has an open dispute
--   P0001 not_allowed              a creator on work in progress, someone other than the
--                                  opener withdrawing, a non-admin deciding
--   P0001 dispute_not_allowed_yet  the business on work in progress before the non-delivery date
--   P0001 dispute_reason_invalid   reason not 20-2,000 characters after trimming
--   P0001 statement_invalid        statement not 1-2,000 characters after trimming
--   P0001 proof_invalid            links or screenshots in the wrong shape (as submit_work)
--   P0001 not_your_file            a file not the caller's, or already attached
--   P0001 no_such_dispute          not a dispute the caller takes part in, or no such dispute
--   P0001 dispute_closed           the dispute was already withdrawn or decided
--   (and the settle refusals: settle_reason_required, release_invalid)

-- Disputes ---------------------------------------------------------------------------------------------------

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements (id) on delete restrict,
  opened_by uuid not null references public.users (id) on delete restrict,
  -- Where the hire goes back to if the opener withdraws.
  opened_from public.engagement_status not null check (opened_from in ('denied', 'in_progress')),
  reason text not null check (reason = btrim(reason) and char_length(reason) between 20 and 2000),
  opened_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'withdrawn', 'decided')),
  closed_at timestamptz,
  closed_by uuid references public.users (id) on delete restrict,
  -- An admin's decision, or the business accepting the denied work.
  outcome text check (outcome in ('release', 'refund', 'split', 'refund_creator_fault', 'accepted_by_business')),
  decision_reason text check (decision_reason = btrim(decision_reason) and char_length(decision_reason) between 1 and 500),

  constraint disputes_open_or_closed_check check ((status = 'open') = (closed_at is null and closed_by is null)),
  constraint disputes_decided_check check ((status = 'decided') = (outcome is not null)),
  -- Only an admin's decision carries a written reason.
  constraint disputes_reason_for_decision_check check (
    (outcome is not null and outcome <> 'accepted_by_business') = (decision_reason is not null)
  )
);

create unique index disputes_one_open on public.disputes (engagement_id) where status = 'open';
create index disputes_engagement_idx on public.disputes (engagement_id);

-- Statements ---------------------------------------------------------------------------------------------------

create table public.dispute_statements (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes (id) on delete restrict,
  author_id uuid not null references public.users (id) on delete restrict,
  body text not null check (body = btrim(body) and char_length(body) between 1 and 2000),
  links text[] not null default '{}' check (cardinality(links) <= 10),
  created_at timestamptz not null default now()
);

create index dispute_statements_dispute_idx on public.dispute_statements (dispute_id, created_at);

-- Append-only, like the ledger: "always" so the triggers fire even with
-- session_replication_role = replica.
create trigger dispute_statements_append_only
  before update or delete on public.dispute_statements
  for each row execute function public.reject_change('dispute_statements_append_only');
create trigger dispute_statements_no_truncate
  before truncate on public.dispute_statements
  for each statement execute function public.reject_change('dispute_statements_append_only');
alter table public.dispute_statements enable always trigger dispute_statements_append_only;
alter table public.dispute_statements enable always trigger dispute_statements_no_truncate;

alter table public.proof_files
  add constraint proof_files_dispute_statement_id_fkey
  foreign key (dispute_statement_id) references public.dispute_statements (id) on delete restrict;
create index proof_files_dispute_statement_idx on public.proof_files (dispute_statement_id)
  where dispute_statement_id is not null;

-- A submission accepted during a dispute keeps the reasons it was denied for --------------------------------

-- The create_submissions check tied denial reasons to the denied status only.
-- When the business accepts denied work during a dispute the submission
-- becomes accepted and its reasons stay as history.
alter table public.submissions drop constraint submissions_denial_check;
alter table public.submissions add constraint submissions_denial_check check (
  (denial_reasons is null or cardinality(denial_reasons) between 1 and 5)
  and (status <> 'denied' or denial_reasons is not null)
  and (status in ('denied', 'accepted') or denial_reasons is null)
);

-- Internal helpers -------------------------------------------------------------------------------------------

-- When the business may open a non-delivery dispute on work in progress: the
-- later of the day after the campaign's deliver-by date at 00:00 Lagos and a
-- week after the creator started (spec §11.4). Allowed once now() is past it.
-- One place for the rule, so the hire page can show the same time.
create function public.non_delivery_dispute_at(e public.engagements)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select greatest(timezone('Africa/Lagos', (k.deliver_by + 1)::timestamp), e.started_at + interval '7 days')
    from public.campaigns k
   where k.id = e.campaign_id
$$;

-- Writes one statement and attaches its screenshots. The caller holds the
-- locks and has checked who may write and that the dispute is open. Links and
-- files follow the submission rules (submit_work).
create function public.write_dispute_statement(dispute uuid, author uuid, body text, links text[], file_ids uuid[])
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  clean_body text := btrim(body);
  clean_links text[];
  files uuid[] := coalesce(file_ids, '{}');
  owned integer;
  written uuid;
begin
  if clean_body is null or char_length(clean_body) not between 1 and 2000 then
    raise exception 'statement_invalid' using errcode = 'P0001';
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
                 where char_length(l) > 500 or l !~* '^https?://\S+$') then
    raise exception 'proof_invalid' using errcode = 'P0001';
  end if;

  select count(*) into owned from (
    select 1 from public.proof_files f
     where f.id = any(files) and f.owner_id = author
       and f.submission_id is null and f.dispute_statement_id is null
       for update
  ) x;
  if owned <> cardinality(files) then
    raise exception 'not_your_file' using errcode = 'P0001';
  end if;

  insert into public.dispute_statements (dispute_id, author_id, body, links)
  values (dispute, author, clean_body, clean_links)
  returning id into written;

  update public.proof_files f set dispute_statement_id = written where f.id = any(files);
  return written;
end;
$$;

-- For the two people of the hire -------------------------------------------------------------------------------

-- Opens a dispute: denied → disputed (either person), or in_progress →
-- disputed (the business, past the non-delivery date). The reason is stored on
-- the dispute and written as the first statement with the links and files.
create function public.open_dispute(engagement uuid, reason text, links text[], file_ids uuid[])
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
  clean_reason text := btrim(reason);
  dispute uuid;
begin
  select g.business_id into business from public.engagements g where g.id = engagement;
  perform 1 from public.users u where u.id = business for no key update;
  select * into e from public.engagements x where x.id = engagement for update;
  if e.id is null or me is null or me not in (e.creator_id, e.business_id) then
    raise exception 'no_such_engagement' using errcode = 'P0001';
  end if;
  if e.status = 'disputed' then
    raise exception 'dispute_open' using errcode = 'P0001';
  end if;
  if e.status not in ('denied', 'in_progress') or e.settled_at is not null then
    raise exception 'engagement_locked' using errcode = 'P0001';
  end if;
  if e.status = 'in_progress' then
    if me = e.creator_id then
      raise exception 'not_allowed' using errcode = 'P0001';
    end if;
    if now() <= public.non_delivery_dispute_at(e) then
      raise exception 'dispute_not_allowed_yet' using errcode = 'P0001';
    end if;
  end if;

  if clean_reason is null or char_length(clean_reason) not between 20 and 2000 then
    raise exception 'dispute_reason_invalid' using errcode = 'P0001';
  end if;

  insert into public.disputes (engagement_id, opened_by, opened_from, reason)
  values (e.id, me, e.status, clean_reason)
  returning id into dispute;

  perform public.write_dispute_statement(dispute, me, clean_reason, links, file_ids);

  update public.engagements x set status = 'disputed', updated_at = now() where x.id = e.id;
  return dispute;
end;
$$;

-- Adds a statement while the dispute is open: either person, or an admin.
create function public.add_dispute_statement(dispute uuid, body text, links text[], file_ids uuid[])
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  hire uuid;
  business uuid;
  e public.engagements;
  d public.disputes;
begin
  select x.engagement_id, g.business_id into hire, business
    from public.disputes x join public.engagements g on g.id = x.engagement_id
   where x.id = dispute;
  perform 1 from public.users u where u.id = business for no key update;
  select * into e from public.engagements x where x.id = hire for update;
  select * into d from public.disputes x where x.id = dispute for update;
  if d.id is null or me is null
     or (me not in (e.creator_id, e.business_id) and public.current_user_role() is distinct from 'admin') then
    raise exception 'no_such_dispute' using errcode = 'P0001';
  end if;
  if d.status <> 'open' then
    raise exception 'dispute_closed' using errcode = 'P0001';
  end if;

  return public.write_dispute_statement(d.id, me, body, links, file_ids);
end;
$$;

-- The opener withdraws an undecided dispute: the hire goes back to the status
-- it came from (denied or in_progress). No money moves.
create function public.withdraw_dispute(dispute uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  hire uuid;
  business uuid;
  e public.engagements;
  d public.disputes;
begin
  select x.engagement_id, g.business_id into hire, business
    from public.disputes x join public.engagements g on g.id = x.engagement_id
   where x.id = dispute;
  perform 1 from public.users u where u.id = business for no key update;
  select * into e from public.engagements x where x.id = hire for update;
  select * into d from public.disputes x where x.id = dispute for update;
  if d.id is null or me is null
     or (me not in (e.creator_id, e.business_id) and public.current_user_role() is distinct from 'admin') then
    raise exception 'no_such_dispute' using errcode = 'P0001';
  end if;
  if d.status <> 'open' then
    raise exception 'dispute_closed' using errcode = 'P0001';
  end if;
  if d.opened_by <> me then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if e.status <> 'disputed' or e.settled_at is not null then
    raise exception 'engagement_locked' using errcode = 'P0001';
  end if;

  update public.disputes x
     set status = 'withdrawn', closed_at = now(), closed_by = me
   where x.id = d.id;
  update public.engagements x set status = d.opened_from, updated_at = now() where x.id = e.id;
end;
$$;

-- For admins ----------------------------------------------------------------------------------------------------

-- Decides an open dispute and settles the hire in the same transaction. The
-- outcome and amount are checked by settle_engagement_internal(); the
-- dispute records the outcome the hire was settled with (a split of the
-- whole price is a release, as in Stage 6).
create function public.decide_dispute(dispute uuid, outcome text, release_kobo bigint, reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  hire uuid;
  business uuid;
  e public.engagements;
  d public.disputes;
  clean_reason text := btrim(reason);
  settled_as text;
begin
  if me is null or public.current_user_role() is distinct from 'admin' then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  select x.engagement_id, g.business_id into hire, business
    from public.disputes x join public.engagements g on g.id = x.engagement_id
   where x.id = dispute;
  perform 1 from public.users u where u.id = business for no key update;
  select * into e from public.engagements x where x.id = hire for update;
  select * into d from public.disputes x where x.id = dispute for update;
  if d.id is null then
    raise exception 'no_such_dispute' using errcode = 'P0001';
  end if;
  if d.status <> 'open' then
    raise exception 'dispute_closed' using errcode = 'P0001';
  end if;
  if e.status <> 'disputed' or e.settled_at is not null then
    raise exception 'engagement_locked' using errcode = 'P0001';
  end if;

  perform public.settle_engagement_internal(e.id, outcome, release_kobo, reason, me, 'accepted');

  select x.settle_outcome into settled_as from public.engagements x where x.id = e.id;
  update public.disputes x
     set status = 'decided', closed_at = now(), closed_by = me,
         outcome = settled_as, decision_reason = clean_reason
   where x.id = d.id;
end;
$$;

-- For the business: accept, also during a dispute ---------------------------------------------------------------

-- As in the create_submissions migration for a submitted hire. On a disputed
-- hire whose latest submission was denied, the business may still accept it:
-- the submission becomes accepted, the dispute is decided as
-- accepted_by_business and escrow is released in full, all under the same
-- locks. A non-delivery dispute has nothing to accept (engagement_locked).
create or replace function public.accept_submission(engagement uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  business uuid;
  e public.engagements;
  d public.disputes;
  latest public.submissions;
  accepted uuid;
begin
  select g.business_id into business from public.engagements g where g.id = engagement;
  perform 1 from public.users u where u.id = business for no key update;
  select * into e from public.engagements x where x.id = engagement for update;
  if e.id is null or me is null or e.business_id is distinct from me then
    raise exception 'no_such_engagement' using errcode = 'P0001';
  end if;

  if public.release_if_overdue(e) then
    return 'auto_released';
  end if;

  if e.status = 'disputed' and e.settled_at is null then
    select * into d from public.disputes x where x.engagement_id = e.id and x.status = 'open' for update;
    select * into latest from public.submissions s
     where s.engagement_id = e.id order by s.round desc limit 1 for update;
    if d.id is null or latest.id is null or latest.status <> 'denied' then
      raise exception 'engagement_locked' using errcode = 'P0001';
    end if;

    update public.submissions s
       set status = 'accepted', decided_at = now(), decided_by = me
     where s.id = latest.id;
    update public.disputes x
       set status = 'decided', outcome = 'accepted_by_business', closed_at = now(), closed_by = me
     where x.id = d.id;
    perform public.settle_engagement_internal(e.id, 'release', null, 'accepted', me);
    return 'accepted';
  end if;

  if e.status <> 'submitted' or e.settled_at is not null then
    raise exception 'engagement_locked' using errcode = 'P0001';
  end if;

  update public.submissions s
     set status = 'accepted', decided_at = now(), decided_by = me
   where s.engagement_id = e.id and s.status = 'pending_review'
  returning s.id into accepted;
  if accepted is null then
    raise exception 'engagement_locked' using errcode = 'P0001';
  end if;

  perform public.settle_engagement_internal(e.id, 'release', null, 'accepted', me);
  return 'accepted';
end;
$$;

-- Function grants ---------------------------------------------------------------------------------

revoke all on function public.non_delivery_dispute_at(public.engagements)
  from public, anon, authenticated, service_role;
revoke all on function public.write_dispute_statement(uuid, uuid, text, text[], uuid[])
  from public, anon, authenticated, service_role;
revoke all on function public.open_dispute(uuid, text, text[], uuid[]) from public, anon;
revoke all on function public.add_dispute_statement(uuid, text, text[], uuid[]) from public, anon;
revoke all on function public.withdraw_dispute(uuid) from public, anon;
revoke all on function public.decide_dispute(uuid, text, bigint, text) from public, anon;
revoke all on function public.accept_submission(uuid) from public, anon;

grant execute on function public.open_dispute(uuid, text, text[], uuid[]) to authenticated;
grant execute on function public.add_dispute_statement(uuid, text, text[], uuid[]) to authenticated;
grant execute on function public.withdraw_dispute(uuid) to authenticated;
grant execute on function public.decide_dispute(uuid, text, bigint, text) to authenticated;
grant execute on function public.accept_submission(uuid) to authenticated;

-- Table grants and row level security ---------------------------------------------------------------

alter table public.disputes enable row level security;
alter table public.dispute_statements enable row level security;

-- No direct writes for any role, the server included: every change goes
-- through the security definer functions above.
revoke all on table public.disputes from anon, authenticated, service_role;
revoke all on table public.dispute_statements from anon, authenticated, service_role;
grant select on table public.disputes to authenticated, service_role;
grant select on table public.dispute_statements to authenticated, service_role;

create policy "Disputes: both sides of the hire, admins"
  on public.disputes for select to authenticated
  using (
    exists (
      select 1 from public.engagements g
       where g.id = engagement_id
         and (select public.current_user_id()) in (g.creator_id, g.business_id)
    )
    or (select public.current_user_role()) = 'admin'
  );

create policy "Dispute statements: both sides of the hire, admins"
  on public.dispute_statements for select to authenticated
  using (
    exists (
      select 1 from public.disputes d
        join public.engagements g on g.id = d.engagement_id
       where d.id = dispute_id
         and (select public.current_user_id()) in (g.creator_id, g.business_id)
    )
    or (select public.current_user_role()) = 'admin'
  );

-- Screenshots on statements are read by both sides too.
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
    or (select public.current_user_role()) = 'admin'
  );
