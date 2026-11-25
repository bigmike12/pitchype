-- Identity checks without BVN (2026-11-28). The BVN was needed for the Cray
-- bank-transfer account, which is gone. Now an unregistered business's owner
-- and a registered business's director verify with their NIN and a live
-- selfie, the same as a creator.
--
--   - Kinds: owner_bvn -> owner_nin, director_bvn -> director_nin. Rows of the
--     old kinds are renamed. Identity was never live, so these are test rows;
--     their fingerprints are BVN fingerprints and stay as they are.
--   - identity_secrets (the encrypted BVN and phone held for Cray) is dropped,
--     with its functions. Nothing else holds a BVN now.
--   - The functions that named the old kinds or the secret table are replaced
--     here. Grants on the replaced functions are kept by create or replace.
--
-- Errors (P0001) are as before: invalid_kind, not_allowed, identity_required,
-- already_verified, check_in_review, attempt_limit.

alter table public.identity_checks drop constraint if exists identity_checks_kind_check;
update public.identity_checks set kind = 'owner_nin' where kind = 'owner_bvn';
update public.identity_checks set kind = 'director_nin' where kind = 'director_bvn';
alter table public.identity_checks add constraint identity_checks_kind_check
  check (kind in ('creator_nin', 'owner_nin', 'business_cac', 'director_nin'));

-- Admins always count as verified. A creator needs a verified creator_nin; a
-- business needs a verified owner_nin or business_cac.
create or replace function public.identity_verified(person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.users u
     where u.id = person
       and (
         u.role = 'admin'
         or exists (
           select 1
             from public.identity_checks c
            where c.user_id = u.id
              and c.status = 'verified'
              and ((u.role = 'influencer' and c.kind = 'creator_nin')
                or (u.role = 'business' and c.kind in ('owner_nin', 'business_cac')))
         )
       )
  );
$$;

create or replace function public.director_verified(person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.identity_checks c
     where c.user_id = person and c.kind = 'director_nin' and c.status = 'verified'
  );
$$;

create or replace function public.start_identity_check(kind text, legal_name text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  wanted text := kind;
  my_role public.user_role;
  name_entered text := btrim(coalesce(legal_name, ''));
  existing public.identity_checks;
  new_check public.identity_checks;
begin
  if me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if wanted not in ('creator_nin', 'owner_nin', 'business_cac', 'director_nin') then
    raise exception 'invalid_kind' using errcode = 'P0001';
  end if;
  if char_length(name_entered) < 3 or char_length(name_entered) > 200 then
    raise exception 'invalid_legal_name' using errcode = 'P0001';
  end if;

  -- One start at a time per person.
  perform 1 from public.users u where u.id = me for no key update;
  select u.role into my_role from public.users u where u.id = me;

  if (wanted = 'creator_nin' and my_role <> 'influencer')
     or (wanted in ('owner_nin', 'business_cac', 'director_nin') and my_role <> 'business') then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if wanted = 'director_nin' and not exists (
       select 1 from public.identity_checks c
        where c.user_id = me and c.kind = 'business_cac' and c.status = 'verified') then
    raise exception 'identity_required' using errcode = 'P0001';
  end if;

  if (wanted = 'director_nin' and public.director_verified(me))
     or (wanted <> 'director_nin' and public.identity_verified(me)) then
    raise exception 'already_verified' using errcode = 'P0001';
  end if;

  -- A check the person is waiting on (or an admin is reviewing) blocks a new one.
  -- An unregistered owner and a registered business are the same question, so they share the gate.
  if exists (
       select 1 from public.identity_checks c
        where c.user_id = me and c.status in ('needs_review', 'pending')
          and (c.kind = wanted
               or (wanted in ('owner_nin', 'business_cac') and c.kind in ('owner_nin', 'business_cac')))) then
    raise exception 'check_in_review' using errcode = 'P0001';
  end if;

  -- A session that never started with the provider for a day is over.
  update public.identity_checks c
     set status = 'abandoned', failure_reason = 'abandoned', decided_at = now()
   where c.user_id = me and c.status = 'started' and c.created_at < now() - interval '24 hours';

  if (public.identity_attempt_state(me, wanted) ->> 'capped')::boolean then
    raise exception 'attempt_limit' using errcode = 'P0001';
  end if;

  -- Resume a session still waiting for the person (same reference, no new row).
  select * into existing from public.identity_checks c
   where c.user_id = me and c.kind = wanted and c.status = 'started';
  if found then
    update public.identity_checks c set legal_name_entered = name_entered where c.id = existing.id;
    return jsonb_build_object('reference', existing.reference, 'check_id', existing.id, 'resumed', true);
  end if;

  insert into public.identity_checks (user_id, kind, legal_name_entered, reference)
  values (me, wanted, name_entered, 'pit_id_' || replace(gen_random_uuid()::text, '-', ''))
  returning * into new_check;
  return jsonb_build_object('reference', new_check.reference, 'check_id', new_check.id, 'resumed', false);
end;
$$;

-- Applies one decision (status pending, verified, failed or abandoned) made by
-- the app from a Dojah event or a CAC lookup. The decision's fields:
--   status, reason, legal_name_on_record, id_last3, id_fingerprint, date_of_birth,
--   company_name_on_record, company_type, registration_number, directors (array),
--   cac_cache (object), failure_detail, counted (boolean).
-- Returns the check's status afterwards, or 'duplicate' (this event key was
-- seen), 'ignored' (the check had already been decided) or 'unknown_reference'.
create or replace function public.finish_identity_check(check_reference text, decision jsonb, event_key text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.identity_checks;
  new_status text := decision ->> 'status';
  new_reason text := nullif(decision ->> 'reason', '');
  fp text := nullif(decision ->> 'id_fingerprint', '');
  reg text := nullif(btrim(decision ->> 'registration_number'), '');
  now_counted boolean := coalesce((decision ->> 'counted')::boolean, false);
  inserted integer;
begin
  if new_status is null or new_status not in ('pending', 'verified', 'failed', 'abandoned') then
    raise exception 'invalid_decision' using errcode = 'P0001';
  end if;

  select * into c from public.identity_checks x where x.reference = check_reference for update;
  if not found then
    return 'unknown_reference';
  end if;

  insert into public.identity_events (event_key) values (event_key) on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then
    return 'duplicate';
  end if;

  if c.status not in ('started', 'pending') then
    return 'ignored';
  end if;

  if new_status = 'pending' then
    update public.identity_checks x
       set status = 'pending', counted = x.counted or now_counted
     where x.id = c.id;
    return 'pending';
  end if;

  if new_status = 'verified' then
    if c.kind = 'business_cac' then
      if reg is null or nullif(decision ->> 'company_name_on_record', '') is null then
        raise exception 'invalid_decision' using errcode = 'P0001';
      end if;
    elsif fp is null
       or nullif(decision ->> 'legal_name_on_record', '') is null
       or coalesce(decision ->> 'id_last3', '') !~ '^[0-9]{3}$' then
      raise exception 'invalid_decision' using errcode = 'P0001';
    end if;

    -- The same ID on another account goes to an admin. Two accounts racing on
    -- one ID take the same lock, so the second sees the first.
    if c.kind in ('creator_nin', 'owner_nin') or c.kind = 'business_cac' then
      perform pg_advisory_xact_lock(hashtextextended(coalesce(fp, upper(reg)), 0));
      if exists (
           select 1 from public.identity_checks o
            where o.user_id <> c.user_id
              and o.status in ('verified', 'needs_review')
              and ((c.kind in ('creator_nin', 'owner_nin') and o.kind in ('creator_nin', 'owner_nin')
                    and o.id_fingerprint = fp)
                or (c.kind = 'business_cac' and o.kind = 'business_cac'
                    and upper(o.registration_number) = upper(reg)))) then
        new_status := 'needs_review';
        new_reason := 'duplicate_identity';
      end if;
    end if;
  end if;

  update public.identity_checks x
     set status = new_status,
         failure_reason = case when new_status = 'verified' then null
                               else coalesce(new_reason, case when new_status = 'abandoned' then 'abandoned' else 'other' end) end,
         failure_detail = left(nullif(decision ->> 'failure_detail', ''), 200),
         legal_name_on_record = upper(nullif(btrim(decision ->> 'legal_name_on_record'), '')),
         id_last3 = nullif(decision ->> 'id_last3', ''),
         id_fingerprint = fp,
         date_of_birth = nullif(decision ->> 'date_of_birth', '')::date,
         company_name_on_record = nullif(btrim(decision ->> 'company_name_on_record'), ''),
         company_type = nullif(btrim(decision ->> 'company_type'), ''),
         registration_number = reg,
         directors = case when jsonb_typeof(decision -> 'directors') = 'array' then decision -> 'directors' else x.directors end,
         directors_fetched_at = case when jsonb_typeof(decision -> 'directors') = 'array' then now() else x.directors_fetched_at end,
         cac_cache = case when jsonb_typeof(decision -> 'cac_cache') = 'object' then decision -> 'cac_cache' else x.cac_cache end,
         cac_cached_at = case when jsonb_typeof(decision -> 'cac_cache') = 'object' then now() else x.cac_cached_at end,
         counted = x.counted or now_counted,
         decided_at = now()
   where x.id = c.id;

  if new_status = 'verified' then
    perform public.notify(c.user_id, 'identity_verified', jsonb_build_object('kind', c.kind));
  elsif new_status = 'failed' then
    perform public.notify(c.user_id, 'identity_failed',
      jsonb_build_object('kind', c.kind, 'reason', coalesce(new_reason, 'other')));
  elsif new_status = 'needs_review' then
    perform public.notify(c.user_id, 'identity_needs_review', jsonb_build_object('kind', c.kind));
  end if;
  return new_status;
end;
$$;

-- Sessions that never reached the provider within a day are over.
create or replace function public.abandon_stale_identity_checks()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  update public.identity_checks c
     set status = 'abandoned', failure_reason = 'abandoned', decided_at = now()
   where c.status = 'started' and c.created_at < now() - interval '24 hours';
  get diagnostics changed = row_count;
  return changed;
end;
$$;

create or replace function public.screening_facts(person uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'subject', case when c.kind = 'business_cac' then 'business' else 'person' end,
           'name', case when c.kind = 'business_cac' then c.company_name_on_record else c.legal_name_on_record end,
           'date_of_birth', c.date_of_birth)
    from public.identity_checks c
   where c.user_id = person and c.status = 'verified' and c.kind <> 'director_nin'
   order by (c.kind = 'business_cac') desc, c.created_at desc
   limit 1;
$$;

-- The short-lived BVN store goes with the BVN.
drop function if exists public.store_identity_secret(uuid, text, text);
drop function if exists public.take_identity_secret(uuid);
drop function if exists public.delete_identity_secret(uuid);
drop function if exists public.purge_identity_secrets();
drop table if exists public.identity_secrets;
