-- Identity verification (design: docs/superpowers/specs/2026-11-22-identity-verification-design.md).
-- Creators (NIN + selfie), unregistered businesses (owner BVN + selfie),
-- registered businesses (CAC) and a registered business's director (BVN +
-- selfie, at the first bank transfer). This migration is the records and the
-- functions that change them; the gates that use them are the next migration.
--
-- Invariants (proven by supabase/tests/identity_checks.test.sql and scenarios
-- 30 to 32 of scripts/money-race.mjs):
--   * Only the functions below write these tables. No client role, and not
--     the service role, writes a table directly; the service role calls the
--     functions it is granted.
--   * A full NIN or BVN is never stored. identity_checks keeps the last 3
--     digits and a keyed fingerprint (made by the app). The one exception is
--     identity_secrets: a BVN encrypted by the app, held at most 24 hours,
--     deleted when its check fails or is abandoned, when the account is
--     opened, and by purge_identity_secrets().
--   * A provider event decides once: finish_identity_check() stores the event
--     key first, so the same event twice (or a webhook racing the daily
--     backstop) writes and notifies once. A check never leaves verified,
--     failed, abandoned or needs_review because of a later event.
--   * The same NIN/BVN (creators and owners) or RC/BN number on another
--     account is never auto-verified and never auto-rejected: it goes to
--     needs_review for an admin. Two checks racing on one ID are serialised
--     by an advisory lock on the fingerprint or number.
--   * One open (started or pending) check per person and kind, even for two
--     starts at once.
--   * Cost control: at most 3 counted attempts per person and kind in 24 hours
--     and 5 since an admin last allowed more. A check is "counted" once the
--     provider answered it (the app sets it) or a CAC lookup was paid for.
--   * People read their own checks only through my_identity_checks(), which
--     leaves out the fingerprint, date of birth and director list.
--   * Admin decisions need a written reason and record who and when.
--   * screening_state() reads the latest screening and its review.
--
-- Errors raised (errcode P0001 unless noted): not_allowed, identity_required,
-- already_verified, check_in_review, attempt_limit, invalid_kind,
-- invalid_legal_name, invalid_decision, identity_reason_required, invalid_review_outcome,
-- no_such_check, check_not_in_review, no_such_screening, screening_not_pending.

alter type public.notification_kind add value 'identity_verified';
alter type public.notification_kind add value 'identity_failed';
alter type public.notification_kind add value 'identity_needs_review';

-- Tables -----------------------------------------------------------------------------------------------

create table public.identity_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  kind text not null
    check (kind in ('creator_nin', 'owner_bvn', 'business_cac', 'director_bvn')),
  status text not null default 'started'
    check (status in ('started', 'pending', 'verified', 'failed', 'needs_review', 'abandoned')),
  reference text not null unique,
  provider text not null default 'dojah' check (provider = 'dojah'),
  provider_session_id text,
  legal_name_entered text not null,
  legal_name_on_record text,
  id_last3 text check (id_last3 ~ '^[0-9]{3}$'),
  id_fingerprint text,
  date_of_birth date,
  company_name_on_record text,
  company_type text,
  registration_number text,
  -- Upper-cased "FIRST LAST" names from an advanced CAC lookup, only when fetched.
  directors jsonb,
  directors_fetched_at timestamptz,
  -- What CAC answered, kept 24 hours so a corrected name is compared without a second paid call.
  cac_cache jsonb,
  cac_cached_at timestamptz,
  failure_reason text
    check (failure_reason in ('name_mismatch', 'selfie_mismatch', 'id_not_found', 'liveness_failed',
                              'provider_unavailable', 'duplicate_identity', 'company_not_found',
                              'company_inactive', 'not_a_director', 'abandoned', 'other')),
  failure_detail text,
  -- True once the provider answered (Completed, Failed or Pending) or a CAC lookup was made.
  counted boolean not null default false,
  reviewed_by uuid references public.users (id),
  reviewed_at timestamptz,
  review_reason text,
  -- clock_timestamp(), not now(): "latest" must mean latest even inside one transaction.
  created_at timestamptz not null default clock_timestamp(),
  decided_at timestamptz,

  constraint identity_checks_legal_name_length
    check (char_length(legal_name_entered) between 3 and 200)
);

create index identity_checks_user_idx on public.identity_checks (user_id, created_at desc);
create index identity_checks_fingerprint_idx on public.identity_checks (id_fingerprint)
  where id_fingerprint is not null;
create index identity_checks_registration_idx on public.identity_checks (upper(registration_number))
  where registration_number is not null;
create index identity_checks_open_idx on public.identity_checks (status, created_at)
  where status in ('started', 'pending');
-- Two starts at once cannot both open a check of one kind for one person.
create unique index identity_checks_one_open_idx on public.identity_checks (user_id, kind)
  where status in ('started', 'pending');

-- Event keys already applied, so a repeated provider event writes nothing.
create table public.identity_events (
  event_key text primary key,
  received_at timestamptz not null default now()
);

-- The only place a full BVN may sit, encrypted, for at most 24 hours.
create table public.identity_secrets (
  check_id uuid primary key references public.identity_checks (id) on delete cascade,
  bvn_encrypted text not null check (bvn_encrypted like 'v1:%'),
  phone_encrypted text check (phone_encrypted is null or phone_encrypted like 'v1:%'),
  expires_at timestamptz not null
);

-- An admin letting a person try again after the attempt cap.
create table public.identity_retry_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  granted_by uuid not null references public.users (id),
  reason text not null check (char_length(reason) between 3 and 500),
  created_at timestamptz not null default now()
);

create index identity_retry_grants_user_idx on public.identity_retry_grants (user_id, created_at desc);

-- One row per sanctions/PEP screening. Admin-only; the person never sees it.
create table public.screenings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  subject text not null check (subject in ('person', 'business')),
  trigger text not null check (trigger in ('first_payout', 'first_hire', 'admin')),
  status text not null check (status in ('clear', 'possible_match', 'error')),
  match_count integer not null default 0 check (match_count >= 0),
  provider_reference text,
  reviewed_by uuid references public.users (id),
  reviewed_at timestamptz,
  review_outcome text check (review_outcome in ('cleared', 'confirmed')),
  review_reason text,
  created_at timestamptz not null default clock_timestamp()
);

create index screenings_user_idx on public.screenings (user_id, created_at desc);
create index screenings_attention_idx on public.screenings (created_at desc)
  where status <> 'clear' and review_outcome is null;

-- Row level security: default deny; admins read checks and screenings ------------------------------------

alter table public.identity_checks enable row level security;
alter table public.identity_events enable row level security;
alter table public.identity_secrets enable row level security;
alter table public.identity_retry_grants enable row level security;
alter table public.screenings enable row level security;

revoke all on table public.identity_checks from anon, authenticated, service_role;
revoke all on table public.identity_events from anon, authenticated, service_role;
revoke all on table public.identity_secrets from anon, authenticated, service_role;
revoke all on table public.identity_retry_grants from anon, authenticated, service_role;
revoke all on table public.screenings from anon, authenticated, service_role;

grant select on table public.identity_checks to authenticated;
grant select on table public.identity_retry_grants to authenticated;
grant select on table public.screenings to authenticated;

create policy "Identity checks: admins read"
  on public.identity_checks for select to authenticated
  using ((select public.current_user_role()) = 'admin');

create policy "Identity retry grants: admins read"
  on public.identity_retry_grants for select to authenticated
  using ((select public.current_user_role()) = 'admin');

create policy "Screenings: admins read"
  on public.screenings for select to authenticated
  using ((select public.current_user_role()) = 'admin');

-- Reading ---------------------------------------------------------------------------------------------------

-- Admins always count as verified. A creator needs a verified creator_nin; a
-- business needs a verified owner_bvn or business_cac.
create function public.identity_verified(person uuid)
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
                or (u.role = 'business' and c.kind in ('owner_bvn', 'business_cac')))
         )
       )
  );
$$;

create function public.director_verified(person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.identity_checks c
     where c.user_id = person and c.kind = 'director_bvn' and c.status = 'verified'
  );
$$;

-- True when the person has a verified check of this kind with this fingerprint
-- (a business re-typing the BVN it verified with).
create function public.identity_fingerprint_matches(person uuid, check_kind text, fingerprint text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select fingerprint is not null and fingerprint <> '' and exists (
    select 1 from public.identity_checks c
     where c.user_id = person and c.kind = check_kind and c.status = 'verified'
       and c.id_fingerprint = fingerprint
  );
$$;

-- The caller's own checks, without the fingerprint, date of birth or director list.
create function public.my_identity_checks()
returns table (
  kind text,
  status text,
  failure_reason text,
  legal_name_on_record text,
  id_last3 text,
  company_name_on_record text,
  registration_number text,
  created_at timestamptz,
  decided_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.kind, c.status, c.failure_reason, c.legal_name_on_record, c.id_last3,
         c.company_name_on_record, c.registration_number, c.created_at, c.decided_at
    from public.identity_checks c
   where c.user_id = public.current_user_id()
   order by c.created_at desc;
$$;

-- What CAC last said about this RC/BN number for a failed check of this
-- person, if it is under 24 hours old: lets a corrected name be compared
-- without paying for another lookup. Service role only.
create function public.recent_cac_cache(person uuid, rc_number text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select c.cac_cache
    from public.identity_checks c
   where c.user_id = person and c.kind = 'business_cac' and c.status = 'failed'
     and c.cac_cache is not null and c.cac_cached_at > now() - interval '24 hours'
     and upper(c.registration_number) = upper(btrim(rc_number))
   order by c.created_at desc
   limit 1;
$$;

-- Starting a check --------------------------------------------------------------------------------------------

create function public.start_identity_check(kind text, legal_name text)
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
  last_grant timestamptz;
  since timestamptz;
  existing public.identity_checks;
  new_check public.identity_checks;
begin
  if me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if wanted not in ('creator_nin', 'owner_bvn', 'business_cac', 'director_bvn') then
    raise exception 'invalid_kind' using errcode = 'P0001';
  end if;
  if char_length(name_entered) < 3 or char_length(name_entered) > 200 then
    raise exception 'invalid_legal_name' using errcode = 'P0001';
  end if;

  -- One start at a time per person.
  perform 1 from public.users u where u.id = me for no key update;
  select u.role into my_role from public.users u where u.id = me;

  if (wanted = 'creator_nin' and my_role <> 'influencer')
     or (wanted in ('owner_bvn', 'business_cac', 'director_bvn') and my_role <> 'business') then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if wanted = 'director_bvn' and not exists (
       select 1 from public.identity_checks c
        where c.user_id = me and c.kind = 'business_cac' and c.status = 'verified') then
    raise exception 'identity_required' using errcode = 'P0001';
  end if;

  if (wanted = 'director_bvn' and public.director_verified(me))
     or (wanted <> 'director_bvn' and public.identity_verified(me)) then
    raise exception 'already_verified' using errcode = 'P0001';
  end if;

  -- A check the person is waiting on (or an admin is reviewing) blocks a new one.
  -- An unregistered owner and a registered business are the same question, so they share the gate.
  if exists (
       select 1 from public.identity_checks c
        where c.user_id = me and c.status in ('needs_review', 'pending')
          and (c.kind = wanted
               or (wanted in ('owner_bvn', 'business_cac') and c.kind in ('owner_bvn', 'business_cac')))) then
    raise exception 'check_in_review' using errcode = 'P0001';
  end if;

  -- A session that never started with the provider for a day is over.
  update public.identity_checks c
     set status = 'abandoned', failure_reason = 'abandoned', decided_at = now()
   where c.user_id = me and c.status = 'started' and c.created_at < now() - interval '24 hours';

  select max(g.created_at) into last_grant from public.identity_retry_grants g where g.user_id = me;
  since := coalesce(last_grant, '-infinity'::timestamptz);
  if (select count(*) from public.identity_checks c
       where c.user_id = me and c.kind = wanted and c.counted
         and c.created_at > greatest(now() - interval '24 hours', since)) >= 3
     or (select count(*) from public.identity_checks c
          where c.user_id = me and c.kind = wanted and c.counted and c.created_at > since) >= 5 then
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

-- Recording a provider's answer ---------------------------------------------------------------------------------------

-- Applies one decision (status pending, verified, failed or abandoned) made by
-- the app from a Dojah event or a CAC lookup. The decision's fields:
--   status, reason, legal_name_on_record, id_last3, id_fingerprint, date_of_birth,
--   company_name_on_record, company_type, registration_number, directors (array),
--   cac_cache (object), failure_detail, counted (boolean).
-- Returns the check's status afterwards, or 'duplicate' (this event key was
-- seen), 'ignored' (the check had already been decided) or 'unknown_reference'.
create function public.finish_identity_check(check_reference text, decision jsonb, event_key text)
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
    if c.kind in ('creator_nin', 'owner_bvn') or c.kind = 'business_cac' then
      perform pg_advisory_xact_lock(hashtextextended(coalesce(fp, upper(reg)), 0));
      if exists (
           select 1 from public.identity_checks o
            where o.user_id <> c.user_id
              and o.status in ('verified', 'needs_review')
              and ((c.kind in ('creator_nin', 'owner_bvn') and o.kind in ('creator_nin', 'owner_bvn')
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

  if new_status in ('failed', 'abandoned') then
    delete from public.identity_secrets s where s.check_id = c.id;
  end if;

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

-- Admin decisions ---------------------------------------------------------------------------------------------------

-- Decides a check held for review (a duplicate ID or RC/BN number). The
-- person is told the outcome; the admin who acted is not.
create function public.review_identity_check(check_id uuid, outcome text, reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  c public.identity_checks;
  why text := btrim(coalesce(reason, ''));
begin
  if me is null or public.current_user_role() is distinct from 'admin' then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if outcome not in ('verified', 'failed') then
    raise exception 'invalid_review_outcome' using errcode = 'P0001';
  end if;
  if char_length(why) < 3 or char_length(why) > 500 then
    raise exception 'identity_reason_required' using errcode = 'P0001';
  end if;
  select * into c from public.identity_checks x where x.id = check_id for update;
  if not found then
    raise exception 'no_such_check' using errcode = 'P0001';
  end if;
  if c.status <> 'needs_review' then
    raise exception 'check_not_in_review' using errcode = 'P0001';
  end if;

  update public.identity_checks x
     set status = outcome,
         failure_reason = case when outcome = 'verified' then null else x.failure_reason end,
         reviewed_by = me, reviewed_at = now(), review_reason = why, decided_at = now()
   where x.id = c.id;

  if outcome = 'verified' then
    perform public.notify(c.user_id, 'identity_verified', jsonb_build_object('kind', c.kind));
  else
    perform public.notify(c.user_id, 'identity_failed',
      jsonb_build_object('kind', c.kind, 'reason', coalesce(c.failure_reason, 'other')));
  end if;
end;
$$;

-- Lets a person who hit the attempt cap try again (the count starts after the grant).
create function public.allow_identity_retry(person uuid, reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  why text := btrim(coalesce(reason, ''));
begin
  if me is null or public.current_user_role() is distinct from 'admin' then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if char_length(why) < 3 or char_length(why) > 500 then
    raise exception 'identity_reason_required' using errcode = 'P0001';
  end if;
  perform 1 from public.users u where u.id = person;
  if not found then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  insert into public.identity_retry_grants (user_id, granted_by, reason) values (person, me, why);
end;
$$;

-- Screening ---------------------------------------------------------------------------------------------------------------

create function public.record_screening(
  person uuid,
  subject text,
  trigger text,
  status text,
  match_count integer,
  provider_reference text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  insert into public.screenings (user_id, subject, trigger, status, match_count, provider_reference)
  values (person, subject, trigger, status, coalesce(match_count, 0), provider_reference)
  returning id into new_id;
  return new_id;
end;
$$;

-- none, clear, possible_match, error or confirmed, from the latest screening and its review.
create function public.screening_state(person uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case
              when s.review_outcome = 'cleared' then 'clear'
              when s.review_outcome = 'confirmed' then 'confirmed'
              else s.status
            end
       from public.screenings s
      where s.user_id = person
      order by s.created_at desc, s.id desc
      limit 1),
    'none');
$$;

create function public.review_screening(screening uuid, outcome text, reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  s public.screenings;
  why text := btrim(coalesce(reason, ''));
begin
  if me is null or public.current_user_role() is distinct from 'admin' then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if outcome not in ('cleared', 'confirmed') then
    raise exception 'invalid_review_outcome' using errcode = 'P0001';
  end if;
  if char_length(why) < 3 or char_length(why) > 500 then
    raise exception 'identity_reason_required' using errcode = 'P0001';
  end if;
  select * into s from public.screenings x where x.id = screening for update;
  if not found then
    raise exception 'no_such_screening' using errcode = 'P0001';
  end if;
  if s.status <> 'possible_match' or s.review_outcome is not null then
    raise exception 'screening_not_pending' using errcode = 'P0001';
  end if;
  update public.screenings x
     set review_outcome = outcome, reviewed_by = me, reviewed_at = now(), review_reason = why
   where x.id = s.id;
end;
$$;

-- Short-lived secrets and housekeeping (service role) ---------------------------------------------------------------------------

create function public.store_identity_secret(check_uuid uuid, bvn_encrypted text, phone_encrypted text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform 1 from public.identity_checks c where c.id = check_uuid;
  if not found then
    raise exception 'no_such_check' using errcode = 'P0001';
  end if;
  insert into public.identity_secrets (check_id, bvn_encrypted, phone_encrypted, expires_at)
  values (check_uuid, bvn_encrypted, phone_encrypted, now() + interval '24 hours')
  on conflict (check_id) do update
    set bvn_encrypted = excluded.bvn_encrypted,
        phone_encrypted = excluded.phone_encrypted,
        expires_at = excluded.expires_at;
end;
$$;

-- The stored secret while it is still valid, or null.
create function public.take_identity_secret(check_uuid uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('bvn_encrypted', s.bvn_encrypted, 'phone_encrypted', s.phone_encrypted)
    from public.identity_secrets s
   where s.check_id = check_uuid and s.expires_at > now();
$$;

create function public.delete_identity_secret(check_uuid uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.identity_secrets s where s.check_id = check_uuid;
$$;

create function public.purge_identity_secrets()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.identity_secrets s where s.expires_at <= now();
  get diagnostics removed = row_count;
  return removed;
end;
$$;

-- Sessions that never reached the provider within a day are over.
create function public.abandon_stale_identity_checks()
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
  delete from public.identity_secrets s
   where exists (select 1 from public.identity_checks c where c.id = s.check_id and c.status = 'abandoned');
  return changed;
end;
$$;

-- References of widget sessions the backstop should ask the provider about:
-- open, 30 minutes to 7 days old. A CAC check is synchronous and never polled.
create function public.identity_checks_to_poll(max integer)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select c.reference
    from public.identity_checks c
   where c.status in ('started', 'pending') and c.kind <> 'business_cac'
     and c.created_at <= now() - interval '30 minutes'
     and c.created_at >= now() - interval '7 days'
   order by c.created_at
   limit greatest(max, 0);
$$;

-- What the server needs to act on a check (service role) ---------------------------------------------------------------------

-- The check a provider event refers to, or null.
create function public.identity_check_by_reference(check_reference text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('id', c.id, 'user_id', c.user_id, 'kind', c.kind, 'status', c.status,
                            'legal_name_entered', c.legal_name_entered, 'created_at', c.created_at)
    from public.identity_checks c
   where c.reference = check_reference;
$$;

-- The person's verified CAC record: company, RC/BN number, directors and when
-- they were fetched (the director match and the business Cray account need these).
create function public.business_cac_facts(person uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('check_id', c.id, 'company_name', c.company_name_on_record,
                            'company_type', c.company_type, 'registration_number', c.registration_number,
                            'directors', coalesce(c.directors, '[]'::jsonb),
                            'directors_fetched_at', c.directors_fetched_at)
    from public.identity_checks c
   where c.user_id = person and c.kind = 'business_cac' and c.status = 'verified'
   order by c.created_at desc
   limit 1;
$$;

-- Replaces the director list on the person's verified CAC record after a fresh lookup.
create function public.refresh_cac_directors(person uuid, new_directors jsonb)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.identity_checks c
     set directors = new_directors, directors_fetched_at = now()
   where c.id = (select x.id from public.identity_checks x
                  where x.user_id = person and x.kind = 'business_cac' and x.status = 'verified'
                  order by x.created_at desc limit 1)
     and jsonb_typeof(new_directors) = 'array';
$$;

-- Who to screen: a registered business by its CAC name, anyone else by the
-- verified legal name and date of birth. Null when the person has no verified check.
create function public.screening_facts(person uuid)
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
   where c.user_id = person and c.status = 'verified' and c.kind <> 'director_bvn'
   order by (c.kind = 'business_cac') desc, c.created_at desc
   limit 1;
$$;

-- Grants ------------------------------------------------------------------------------------------------------------------------

revoke all on function public.identity_verified(uuid) from public, anon, authenticated;
revoke all on function public.director_verified(uuid) from public, anon, authenticated;
revoke all on function public.identity_fingerprint_matches(uuid, text, text) from public, anon, authenticated;
revoke all on function public.my_identity_checks() from public, anon;
revoke all on function public.recent_cac_cache(uuid, text) from public, anon, authenticated;
revoke all on function public.start_identity_check(text, text) from public, anon;
revoke all on function public.finish_identity_check(text, jsonb, text) from public, anon, authenticated;
revoke all on function public.review_identity_check(uuid, text, text) from public, anon;
revoke all on function public.allow_identity_retry(uuid, text) from public, anon;
revoke all on function public.record_screening(uuid, text, text, text, integer, text) from public, anon, authenticated;
revoke all on function public.screening_state(uuid) from public, anon, authenticated;
revoke all on function public.review_screening(uuid, text, text) from public, anon;
revoke all on function public.store_identity_secret(uuid, text, text) from public, anon, authenticated;
revoke all on function public.take_identity_secret(uuid) from public, anon, authenticated;
revoke all on function public.delete_identity_secret(uuid) from public, anon, authenticated;
revoke all on function public.purge_identity_secrets() from public, anon, authenticated;
revoke all on function public.abandon_stale_identity_checks() from public, anon, authenticated;
revoke all on function public.identity_checks_to_poll(integer) from public, anon, authenticated;

grant execute on function public.identity_verified(uuid) to service_role;
grant execute on function public.director_verified(uuid) to service_role;
grant execute on function public.identity_fingerprint_matches(uuid, text, text) to service_role;
grant execute on function public.my_identity_checks() to authenticated;
grant execute on function public.recent_cac_cache(uuid, text) to service_role;
grant execute on function public.start_identity_check(text, text) to authenticated;
grant execute on function public.finish_identity_check(text, jsonb, text) to service_role;
grant execute on function public.review_identity_check(uuid, text, text) to authenticated;
grant execute on function public.allow_identity_retry(uuid, text) to authenticated;
grant execute on function public.record_screening(uuid, text, text, text, integer, text) to service_role;
grant execute on function public.screening_state(uuid) to service_role;
grant execute on function public.review_screening(uuid, text, text) to authenticated;
grant execute on function public.store_identity_secret(uuid, text, text) to service_role;
grant execute on function public.take_identity_secret(uuid) to service_role;
grant execute on function public.delete_identity_secret(uuid) to service_role;
grant execute on function public.purge_identity_secrets() to service_role;
grant execute on function public.abandon_stale_identity_checks() to service_role;
grant execute on function public.identity_checks_to_poll(integer) to service_role;

revoke all on function public.identity_check_by_reference(text) from public, anon, authenticated;
revoke all on function public.business_cac_facts(uuid) from public, anon, authenticated;
revoke all on function public.refresh_cac_directors(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.screening_facts(uuid) from public, anon, authenticated;

grant execute on function public.identity_check_by_reference(text) to service_role;
grant execute on function public.business_cac_facts(uuid) to service_role;
grant execute on function public.refresh_cac_directors(uuid, jsonb) to service_role;
grant execute on function public.screening_facts(uuid) to service_role;
