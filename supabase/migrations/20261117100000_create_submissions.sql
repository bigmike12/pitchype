-- Submissions: proof of work, the business's review, and the creator
-- withdrawing after starting (Stage 7).
-- Design: docs/superpowers/specs/2026-11-17-stage-7-submissions-disputes-design.md §2, §3, §5, §11;
-- CLAUDE.md §5, §6.2, §6.4 (rule 4), §6.9.
--
-- Invariants this migration protects:
--   1. Escrow still leaves a hire only through settle_money(), reached through
--      settle_engagement_internal() (accept, auto-release) or directly by the
--      creator withdrawing, as cancel_funded_engagement() does. No new ledger
--      writer. Settling a settled hire stays a no-op.
--   2. Only the hired creator submits, only from in_progress, or from denied
--      while rounds are left: at most 4 submissions (3 resubmissions) per hire,
--      unique per (hire, round), and at most one waiting for review.
--   3. Each submission has its own review deadline, exactly 7 days after it
--      was made, stored and never recomputed.
--   4. The deadline is enforced in the database: before the business's accept
--      or deny on a submitted hire, release_if_overdue() auto-releases it if the
--      deadline has passed. A late deny returns 'review_closed' (not raised, so
--      the release in the same transaction is kept); a late accept returns
--      'auto_released'. The business cannot deny after its deadline.
--   5. A denial carries 1-5 written reasons of 3-500 characters each.
--   6. Lock order, as in Stage 6: the business's users row, then the
--      engagement, then the submission (and the proof files being attached).
--      Accept, deny, auto-release, submit, withdraw and admin settle all take
--      the engagement lock, so two of them can't both win.
--   7. The Stage 6 admin tool settle_engagement() still settles only funded and
--      in_progress hires (spec §11.2): an admin can't override a business's
--      review without a dispute record.
--   8. Suspension and strikes don't stop work already agreed (CLAUDE.md §6.5):
--      none of these functions checks standing.
--   9. Proof files are written only by the server (private bucket, no storage
--      policies) and attached only by their owner, once.
--
-- Errors raised (P0001 are refusals the app shows, see src/lib/refusals.ts):
--   P0001 no_such_engagement  not the caller's hire, or no such hire
--   P0001 engagement_locked   wrong status for this action
--   P0001 no_rounds_left      the fourth submission was denied
--   P0001 proof_required      no link and no screenshot
--   P0001 proof_invalid       too many links or files, a link not http(s) or over
--                             500 characters, a file twice, a note over 1,000
--   P0001 not_your_file       a file id not owned by the caller or already attached
--   P0001 reasons_required    denial without 1-5 reasons of 3-500 characters

-- paid_out ---------------------------------------------------------------------------------------------------

comment on type public.engagement_status is
  'Engagement lifecycle (CLAUDE.md §5). paid_out is never used: payouts come from the wallet, not from one '
  'engagement, and dropping an enum value means rebuilding the type (Stage 7 spec §2).';

-- Submissions ------------------------------------------------------------------------------------------------

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements (id) on delete restrict,
  round smallint not null check (round between 1 and 4),
  -- auto_accepted is the submission-side word for auto-release (CLAUDE.md §5).
  status text not null default 'pending_review'
    check (status in ('pending_review', 'accepted', 'denied', 'auto_accepted')),
  note text check (note is null or (note = btrim(note) and char_length(note) between 1 and 1000)),
  links text[] not null default '{}' check (cardinality(links) <= 10),
  created_at timestamptz not null default now(),
  review_deadline_at timestamptz not null,
  decided_at timestamptz,
  decided_by uuid references public.users (id) on delete restrict,
  denial_reasons text[],
  -- Each review reminder is sent once (the daily job).
  reminded_3d_at timestamptz,
  reminded_1d_at timestamptz,

  constraint submissions_round_unique unique (engagement_id, round),
  constraint submissions_decided_check check ((status = 'pending_review') = (decided_at is null)),
  constraint submissions_denial_check check (
    (status = 'denied') = (denial_reasons is not null and cardinality(denial_reasons) between 1 and 5)
  )
);

create unique index submissions_one_pending on public.submissions (engagement_id) where status = 'pending_review';

-- Proof files ----------------------------------------------------------------------------------------------

-- Screenshots in the work-proof bucket. The server registers each processed
-- upload with no parent, owned by the uploader; submit_work() (and, from the
-- disputes migration, a dispute statement) then attaches it. Named
-- proof_files rather than the spec's submission_files because disputes use it too.
create table public.proof_files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users (id) on delete restrict,
  path text not null unique,
  content_type text not null check (content_type = 'image/webp'),
  bytes integer not null check (bytes between 1 and 5242880),
  submission_id uuid references public.submissions (id) on delete restrict,
  -- The foreign key arrives with dispute_statements.
  dispute_statement_id uuid,
  created_at timestamptz not null default now(),

  constraint proof_files_one_parent check (submission_id is null or dispute_statement_id is null)
);

create index proof_files_submission_idx on public.proof_files (submission_id) where submission_id is not null;
create index proof_files_owner_idx on public.proof_files (owner_id);

-- Private, written only by the server with the secret key (no storage.objects
-- policies, like profile-photos), read through short-lived signed URLs.
-- Supabase-specific; see docs/PROVIDERS.md.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('work-proof', 'work-proof', false, 5242880, array['image/webp']);

-- Settlement, widened ---------------------------------------------------------------------------------------

-- Stage 6's internal settle, now also from submitted, denied and disputed, and
-- told which status a release sets (auto-release sets auto_released).
-- The 5-argument calls keep working through the default.
drop function public.settle_engagement_internal(uuid, text, bigint, text, uuid);

create function public.settle_engagement_internal(
  engagement uuid,
  outcome text,
  release_kobo bigint,
  reason text,
  actor uuid,
  release_status public.engagement_status default 'accepted'
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  clean_reason text := btrim(reason);
  business uuid;
  e public.engagements;
  released bigint;
  final_outcome text := outcome;
begin
  if outcome is null or outcome not in ('release', 'refund', 'split', 'refund_creator_fault') then
    raise exception 'invalid_outcome' using errcode = '22023';
  end if;
  if clean_reason is null or clean_reason = '' or char_length(clean_reason) > 500 then
    raise exception 'settle_reason_required' using errcode = 'P0001';
  end if;

  select g.business_id into business from public.engagements g where g.id = engagement;
  perform 1 from public.users u where u.id = business for no key update;
  select * into e from public.engagements x where x.id = engagement for update;
  if e.id is null then
    raise exception 'no_such_engagement' using errcode = 'P0001';
  end if;

  -- Release amounts are checked before the no-op, so a bad call is always refused.
  released := case outcome when 'release' then e.agreed_price_kobo
                           when 'split' then release_kobo
                           else 0 end;
  if released is null or released < 0 or released > e.agreed_price_kobo or released % 100 <> 0
     or (outcome <> 'split' and release_kobo is not null and release_kobo <> released) then
    raise exception 'release_invalid' using errcode = 'P0001';
  end if;

  if e.settled_at is not null then
    return;
  end if;
  if e.status not in ('funded', 'in_progress', 'submitted', 'denied', 'disputed') then
    raise exception 'engagement_locked' using errcode = 'P0001';
  end if;

  if outcome = 'split' and released = e.agreed_price_kobo then
    final_outcome := 'release';
  elsif outcome = 'split' and released = 0 then
    final_outcome := 'refund';
  end if;

  perform public.settle_money(e.id, final_outcome, released, final_outcome = 'refund_creator_fault',
    case when released > 0 then release_status else 'refunded' end,
    null, actor, clean_reason);
end;
$$;

-- The admin tool keeps Stage 6's statuses (spec §11.2). It checks them under
-- the same locks the internal settle takes, so a submit can't slip in between.
create or replace function public.settle_engagement(engagement uuid, outcome text, release_kobo bigint, reason text)
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
begin
  if me is null or public.current_user_role() is distinct from 'admin' then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  select g.business_id into business from public.engagements g where g.id = engagement;
  perform 1 from public.users u where u.id = business for no key update;
  select * into e from public.engagements x where x.id = engagement for update;
  -- An unknown hire, or a settled one, is left to the internal settle: it
  -- refuses the first and quietly ignores the second, as in Stage 6.
  if e.id is not null and e.settled_at is null and e.status not in ('funded', 'in_progress') then
    raise exception 'engagement_locked' using errcode = 'P0001';
  end if;

  perform public.settle_engagement_internal(engagement, outcome, release_kobo, reason, me);
end;
$$;

-- Internal: the review deadline ------------------------------------------------------------------------------

-- Auto-releases a submitted hire whose review deadline has passed. The caller
-- holds the business's users row and the engagement locks and passes the
-- locked row. Returns whether it released.
create function public.release_if_overdue(e public.engagements)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  overdue uuid;
begin
  if e.status is distinct from 'submitted' then
    return false;
  end if;

  update public.submissions s
     set status = 'auto_accepted', decided_at = now(), decided_by = null
   where s.engagement_id = e.id
     and s.status = 'pending_review'
     and s.review_deadline_at <= now()
  returning s.id into overdue;
  if overdue is null then
    return false;
  end if;

  perform public.settle_engagement_internal(e.id, 'release', null, 'auto_released', null, 'auto_released');
  return true;
end;
$$;

-- For the creator --------------------------------------------------------------------------------------------

-- Submits proof: in_progress → submitted, or denied → submitted while rounds
-- are left. A disputed hire is refused by the status check. Screenshots are
-- registered first by the server (register_proof_file) and attached here.
create function public.submit_work(engagement uuid, note text, links text[], file_ids uuid[])
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
  clean_note text := nullif(btrim(note), '');
  clean_links text[];
  files uuid[] := coalesce(file_ids, '{}');
  next_round integer;
  owned integer;
  submission uuid;
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
     or char_length(clean_note) > 1000 then
    raise exception 'proof_invalid' using errcode = 'P0001';
  end if;
  if cardinality(clean_links) = 0 and cardinality(files) = 0 then
    raise exception 'proof_required' using errcode = 'P0001';
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

  insert into public.submissions (engagement_id, round, note, links, review_deadline_at)
  values (e.id, next_round, clean_note, clean_links, now() + interval '7 days')
  returning id into submission;

  update public.proof_files f set submission_id = submission where f.id = any(files);

  update public.engagements x set status = 'submitted', updated_at = now() where x.id = e.id;
  return submission;
end;
$$;

-- The creator walks away after starting (CLAUDE.md §6.2, "influencer
-- withdraws"): the business gets the price plus its fee minus Paystack's
-- charge. Status refunded with no cancel reason, so it is announced as a
-- settlement rather than a cancellation.
create function public.withdraw_from_engagement(engagement uuid)
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

  perform public.settle_money(e.id, 'refund_creator_fault', 0, true, 'refunded', null, me, 'creator_withdrew');
end;
$$;

-- For the business ---------------------------------------------------------------------------------------------

-- Accepts the waiting submission and releases escrow in full. Past the
-- deadline it has already been released: answered 'auto_released'.
create function public.accept_submission(engagement uuid)
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

-- Denies the waiting submission with reasons; the clock stops. Past the
-- deadline the hire is auto-released instead and the answer is 'review_closed'
-- (returned, not raised, so the release is kept).
create function public.deny_submission(engagement uuid, reasons text[])
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
  clean_reasons text[];
  denied uuid;
begin
  select g.business_id into business from public.engagements g where g.id = engagement;
  perform 1 from public.users u where u.id = business for no key update;
  select * into e from public.engagements x where x.id = engagement for update;
  if e.id is null or me is null or e.business_id is distinct from me then
    raise exception 'no_such_engagement' using errcode = 'P0001';
  end if;

  if public.release_if_overdue(e) then
    return 'review_closed';
  end if;
  if e.status <> 'submitted' or e.settled_at is not null then
    raise exception 'engagement_locked' using errcode = 'P0001';
  end if;

  if reasons is null or cardinality(reasons) not between 1 and 5
     or exists (select 1 from unnest(reasons) r
                 where r is null or char_length(btrim(r)) not between 3 and 500) then
    raise exception 'reasons_required' using errcode = 'P0001';
  end if;
  clean_reasons := array(select btrim(r) from unnest(reasons) with ordinality u(r, i) order by i);

  update public.submissions s
     set status = 'denied', decided_at = now(), decided_by = me, denial_reasons = clean_reasons
   where s.engagement_id = e.id and s.status = 'pending_review'
  returning s.id into denied;
  if denied is null then
    raise exception 'engagement_locked' using errcode = 'P0001';
  end if;

  update public.engagements x set status = 'denied', updated_at = now() where x.id = e.id;
  return 'denied';
end;
$$;

-- For the server ---------------------------------------------------------------------------------------------

-- Records a processed screenshot already uploaded to work-proof, unattached.
create function public.register_proof_file(owner uuid, path text, content_type text, bytes integer)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.proof_files (owner_id, path, content_type, bytes)
  values (owner, path, content_type, bytes)
  returning id
$$;

-- Function grants ---------------------------------------------------------------------------------

-- Restated from Stage 6: the internal settle is for no role; the admin tool is
-- for signed-in people and checks the admin role inside.
revoke all on function public.settle_engagement_internal(uuid, text, bigint, text, uuid, public.engagement_status)
  from public, anon, authenticated, service_role;
revoke all on function public.settle_engagement(uuid, text, bigint, text) from public, anon;
grant execute on function public.settle_engagement(uuid, text, bigint, text) to authenticated;

revoke all on function public.release_if_overdue(public.engagements)
  from public, anon, authenticated, service_role;
revoke all on function public.submit_work(uuid, text, text[], uuid[]) from public, anon;
revoke all on function public.withdraw_from_engagement(uuid) from public, anon;
revoke all on function public.accept_submission(uuid) from public, anon;
revoke all on function public.deny_submission(uuid, text[]) from public, anon;
revoke all on function public.register_proof_file(uuid, text, text, integer) from public, anon, authenticated;

grant execute on function public.submit_work(uuid, text, text[], uuid[]) to authenticated;
grant execute on function public.withdraw_from_engagement(uuid) to authenticated;
grant execute on function public.accept_submission(uuid) to authenticated;
grant execute on function public.deny_submission(uuid, text[]) to authenticated;
grant execute on function public.register_proof_file(uuid, text, text, integer) to service_role;

-- Table grants and row level security ---------------------------------------------------------------

alter table public.submissions enable row level security;
alter table public.proof_files enable row level security;

revoke all on table public.submissions from anon, authenticated;
revoke all on table public.proof_files from anon, authenticated;
grant select on table public.submissions to authenticated;
grant select on table public.proof_files to authenticated;

create policy "Submissions: both sides of the hire, admins"
  on public.submissions for select to authenticated
  using (
    exists (
      select 1 from public.engagements g
       where g.id = engagement_id
         and (select public.current_user_id()) in (g.creator_id, g.business_id)
    )
    or (select public.current_user_role()) = 'admin'
  );

-- The owner sees their own uploads before they are attached.
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
    or (select public.current_user_role()) = 'admin'
  );
