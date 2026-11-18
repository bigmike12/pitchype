-- Proof for the record on per-click hires (pay per click, Part 2; spec §7):
-- the creator shows where they posted their link. No review, no deadline, no
-- money: objections go to a dispute during the hold.
--
-- Invariants protected here:
--   1. Only the creator of a per-click hire that is in progress and unsettled
--      records proof, through record_click_proof(); nobody writes directly.
--   2. Each proof has at least one link or screenshot. Links and screenshots
--      follow the submission rules (up to 10 web links of ≤ 500 characters,
--      up to 5 of the creator's own unattached screenshots).
--   3. Proof rows never change or go away (append-only, as statements).
--   4. Only the two people on the hire and admins read proof and its
--      screenshots (proof_files gains a third parent, at most one set).
--   5. The daily orphan sweep keeps screenshots attached to proof.
--   Lock order: users, engagement, then the proof files.

create table public.click_proofs (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements (id) on delete restrict,
  author_id uuid not null references public.users (id) on delete restrict,
  note text check (note is null or (note = btrim(note) and char_length(note) between 1 and 1000)),
  links text[] not null default '{}' check (cardinality(links) <= 10),
  created_at timestamptz not null default now()
);

create index click_proofs_engagement_idx on public.click_proofs (engagement_id, created_at);

create trigger click_proofs_append_only
  before update or delete on public.click_proofs
  for each row execute function public.reject_change('click_proofs_append_only');
create trigger click_proofs_no_truncate
  before truncate on public.click_proofs
  for each statement execute function public.reject_change('click_proofs_append_only');

alter table public.click_proofs enable row level security;
revoke all on table public.click_proofs from anon, authenticated, service_role;
grant select on table public.click_proofs to authenticated, service_role;

create policy "Click proofs: the two people on the hire, admins"
  on public.click_proofs for select to authenticated
  using (
    exists (
      select 1 from public.engagements g
       where g.id = engagement_id
         and (select public.current_user_id()) in (g.creator_id, g.business_id)
    )
    or (select public.current_user_role()) = 'admin'
  );

-- Screenshots: a third parent -----------------------------------------------------------------------------

alter table public.proof_files
  add column click_proof_id uuid references public.click_proofs (id) on delete restrict;
create index proof_files_click_proof_idx on public.proof_files (click_proof_id) where click_proof_id is not null;

alter table public.proof_files drop constraint proof_files_one_parent;
alter table public.proof_files add constraint proof_files_one_parent check (
  (submission_id is not null)::int + (dispute_statement_id is not null)::int + (click_proof_id is not null)::int <= 1
);

-- As in 20261117100200_create_disputes.sql, plus click proofs.
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
    or (select public.current_user_role()) = 'admin'
  );

-- As in 20261117100100_auto_release.sql, plus click proofs.
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
     and f.created_at < now() - interval '1 day'
  returning f.path
$$;

-- Recording proof ---------------------------------------------------------------------------------------

create function public.record_click_proof(engagement uuid, note text, links text[], file_ids uuid[])
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
  owned integer;
  written uuid;
begin
  select g.business_id into business from public.engagements g where g.id = engagement;
  perform 1 from public.users u where u.id = business for no key update;
  select * into e from public.engagements x where x.id = engagement for update;
  if e.id is null or me is null or e.creator_id is distinct from me then
    raise exception 'no_such_engagement' using errcode = 'P0001';
  end if;
  if e.status <> 'in_progress' or e.settled_at is not null
     or not exists (select 1 from public.campaigns k where k.id = e.campaign_id and k.payment_model = 'per_click') then
    raise exception 'engagement_locked' using errcode = 'P0001';
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
       and f.submission_id is null and f.dispute_statement_id is null and f.click_proof_id is null
       for update
  ) x;
  if owned <> cardinality(files) then
    raise exception 'not_your_file' using errcode = 'P0001';
  end if;

  insert into public.click_proofs (engagement_id, author_id, note, links)
  values (e.id, me, clean_note, clean_links)
  returning id into written;

  update public.proof_files f set click_proof_id = written where f.id = any(files);
  return written;
end;
$$;

revoke all on function public.record_click_proof(uuid, text, text[], uuid[]) from public, anon;
grant execute on function public.record_click_proof(uuid, text, text[], uuid[]) to authenticated;
