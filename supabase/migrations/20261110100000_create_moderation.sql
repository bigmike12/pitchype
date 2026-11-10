-- Account standing (Stage 5): person-to-person blocks, strikes, appeals.
-- Design: docs/superpowers/specs/2026-11-10-stage-5-applications-chat-design.md §3–§5.
--
-- Invariants this migration protects:
--   1. A block is between two people: it stops new contact and new work
--      between them (the functions of later migrations call
--      is_blocked_between) and changes nothing else.
--   2. Strikes, voids, lifted suspensions and declined appeals are an
--      append-only log (moderation_events): nobody edits or deletes it, so
--      every standing can be explained from it.
--   3. Standing changes only here: two active strikes pause new activity for
--      three days; three suspend pending an admin's review. Voiding a strike
--      steps back. Nothing in this file touches campaigns, engagements or
--      money (CLAUDE.md §6.5).
--   4. Every admin decision carries a written reason.
--   5. A strike is recorded once per dedupe key, so a retried send never
--      counts twice.

-- Standing on the account --------------------------------------------------------

alter table public.users
  add column messaging_restricted_until timestamptz,
  add column suspended_at timestamptz;

comment on column public.users.messaging_restricted_until is
  'Two active strikes: no new messages or new marketplace activity until then. Set only by record_strike().';
comment on column public.users.suspended_at is
  'Three active strikes: suspended pending admin review. Set by record_strike(), cleared by void_strike() or lift_suspension().';

-- Blocks ------------------------------------------------------------------------------

create table public.user_blocks (
  blocker_id uuid not null references public.users (id) on delete cascade,
  blocked_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

create index user_blocks_blocked_idx on public.user_blocks (blocked_id);

-- The log ---------------------------------------------------------------------------------

create type public.moderation_event_kind as enum (
  'strike',            -- automatic, from a flagged chat message
  'strike_voided',     -- an admin's decision
  'suspension_lifted', -- an admin's decision
  'appeal_declined'    -- an admin's decision
);

create table public.moderation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  kind public.moderation_event_kind not null,
  actor_id uuid references public.users (id) on delete set null,
  strike_id uuid references public.moderation_events (id) on delete cascade,
  -- Strikes: what was detected, and the text that was not delivered.
  flag text,
  detail text,
  -- Decisions: why.
  reason text,
  dedupe_key uuid,
  created_at timestamptz not null default now(),

  constraint moderation_events_strike_check check (
    kind <> 'strike'
    or (actor_id is null and flag is not null and detail is not null and char_length(detail) <= 2000)
  ),
  constraint moderation_events_decision_check check (
    kind = 'strike'
    or (reason is not null and reason = btrim(reason) and char_length(reason) between 2 and 200)
  ),
  constraint moderation_events_void_check check ((kind = 'strike_voided') = (strike_id is not null)),
  constraint moderation_events_dedupe_unique unique (user_id, dedupe_key)
);

create unique index moderation_events_one_void
  on public.moderation_events (strike_id) where kind = 'strike_voided';
create index moderation_events_user_idx on public.moderation_events (user_id, created_at desc);

-- Append-only. The only way out is deleting the person's data on request,
-- which an operator does with `set local pitchype.purge = 'on'`.
create function public.moderation_events_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and current_setting('pitchype.purge', true) = 'on' then
    return old;
  end if;
  raise exception 'moderation events are append-only' using errcode = '42501';
end;
$$;

create trigger moderation_events_append_only
  before update or delete on public.moderation_events
  for each row execute function public.moderation_events_append_only();

-- Appeals ------------------------------------------------------------------------------------

create table public.moderation_appeals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  message text not null,
  status text not null default 'open',
  answer text,
  created_at timestamptz not null default now(),
  resolved_by uuid references public.users (id) on delete set null,
  resolved_at timestamptz,

  constraint moderation_appeals_message_check
    check (message = btrim(message) and char_length(message) between 2 and 1000),
  constraint moderation_appeals_status_check check (status in ('open', 'answered')),
  constraint moderation_appeals_answer_check check (
    (status = 'answered') = (answer is not null and resolved_at is not null)
    and (answer is null or (answer = btrim(answer) and char_length(answer) between 2 and 1000))
  )
);

create unique index moderation_appeals_one_open
  on public.moderation_appeals (user_id) where status = 'open';

-- Internal helpers (called by other functions, never by people) ------------------------------

create function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_blocks ub
     where (ub.blocker_id = a and ub.blocked_id = b)
        or (ub.blocker_id = b and ub.blocked_id = a)
  )
$$;

create function public.is_suspended(person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select u.suspended_at is not null from public.users u where u.id = person), false)
$$;

create function public.active_strike_count(person uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.moderation_events s
   where s.user_id = person
     and s.kind = 'strike'
     and not exists (
       select 1 from public.moderation_events v
        where v.kind = 'strike_voided' and v.strike_id = s.id
     )
$$;

-- Why a person can't start something new right now, or null.
create function public.standing_problem(person uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when u.suspended_at is not null then 'account_suspended'
           when u.messaging_restricted_until > now() then 'activity_paused'
         end
    from public.users u
   where u.id = person
$$;

-- Every function that starts something new calls this first.
create function public.check_standing(person uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  problem text := public.standing_problem(person);
begin
  if problem is not null then
    raise exception '%', problem using errcode = 'P0001';
  end if;
end;
$$;

-- The database's copy of src/lib/contact-details.ts, so chat can't be
-- bypassed by calling the API directly. Keep the two in step; the pgTAP file
-- checks both against the same strings.
create function public.contact_detail_kind(body text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when body ~* '\y(?:wa\.me|chat\.whatsapp\.com|api\.whatsapp\.com)\y' then 'WhatsApp link'
    when body ~* '\y(?:t\.me|telegram\.me)/' then 'Telegram link'
    when body ~* '[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}\y' then 'email address'
    when body ~ '(?:\+\s?)?\y\d(?:[\s.-]?\d){9,13}\y' then 'phone number'
  end
$$;

-- Records a strike and escalates. Called by send_message() (chat migration).
create function public.record_strike(person uuid, flag text, detail text, dedupe uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  strikes integer;
  u public.users;
begin
  insert into public.moderation_events (user_id, kind, flag, detail, dedupe_key)
  values (person, 'strike', flag, left(detail, 2000), dedupe)
  on conflict (user_id, dedupe_key) do nothing;

  if found then
    strikes := public.active_strike_count(person);
    if strikes >= 3 then
      update public.users set suspended_at = coalesce(suspended_at, now()) where id = person;
    elsif strikes = 2 then
      update public.users set messaging_restricted_until = now() + interval '3 days' where id = person;
    end if;
  end if;

  select * into u from public.users where id = person;
  return jsonb_build_object(
    'strikes', public.active_strike_count(person),
    'restricted_until', u.messaging_restricted_until,
    'suspended', u.suspended_at is not null
  );
end;
$$;

-- After a void: lift whatever the remaining strikes no longer justify.
create function public.relax_standing(person uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  strikes integer := public.active_strike_count(person);
begin
  update public.users
     set suspended_at = case when strikes < 3 then null else suspended_at end,
         messaging_restricted_until = case when strikes < 2 then null else messaging_restricted_until end
   where id = person;
end;
$$;

create function public.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  admin_id uuid := public.current_user_id();
begin
  if admin_id is null or public.current_user_role() is distinct from 'admin' then
    raise exception 'admins_only' using errcode = '42501';
  end if;
  return admin_id;
end;
$$;

create function public.clean_reason(reason text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  cleaned text := btrim(reason);
begin
  if cleaned is null or char_length(cleaned) not between 2 and 200 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  return cleaned;
end;
$$;

-- Blocking --------------------------------------------------------------------------------------

create function public.block_user(other uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
begin
  if me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if other = me or not exists (select 1 from public.users u where u.id = other) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  insert into public.user_blocks (blocker_id, blocked_id) values (me, other)
  on conflict do nothing;
end;
$$;

create function public.unblock_user(other uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from public.user_blocks
   where blocker_id = public.current_user_id() and blocked_id = other;
end;
$$;

-- Appeals ------------------------------------------------------------------------------------------

create function public.submit_appeal(message text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  cleaned text := btrim(message);
  new_id uuid;
begin
  if me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if public.active_strike_count(me) = 0 and public.standing_problem(me) is null then
    raise exception 'nothing_to_appeal' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.moderation_appeals a where a.user_id = me and a.status = 'open') then
    raise exception 'appeal_open' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.moderation_appeals a
              where a.user_id = me and a.created_at > now() - interval '24 hours') then
    raise exception 'appeal_too_soon' using errcode = 'P0001';
  end if;
  if cleaned is null or char_length(cleaned) not between 2 and 1000 then
    raise exception 'message_length' using errcode = 'P0001';
  end if;

  insert into public.moderation_appeals (user_id, message) values (me, cleaned)
  returning id into new_id;
  return new_id;
end;
$$;

-- Admin decisions -------------------------------------------------------------------------------------

create function public.void_strike(strike uuid, reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  admin_id uuid := public.require_admin();
  why text := public.clean_reason(reason);
  person uuid;
begin
  select e.user_id into person
    from public.moderation_events e
   where e.id = strike and e.kind = 'strike';
  if person is null then
    raise exception 'no_such_strike' using errcode = 'P0001';
  end if;

  insert into public.moderation_events (user_id, kind, actor_id, strike_id, reason)
  values (person, 'strike_voided', admin_id, strike, why)
  on conflict do nothing;
  perform public.relax_standing(person);
end;
$$;

create function public.lift_suspension(person uuid, reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  admin_id uuid := public.require_admin();
  why text := public.clean_reason(reason);
begin
  update public.users set suspended_at = null
   where id = person and suspended_at is not null;
  if found then
    insert into public.moderation_events (user_id, kind, actor_id, reason)
    values (person, 'suspension_lifted', admin_id, why);
  end if;
end;
$$;

-- Answer an appeal. Voiding strikes or lifting a suspension are their own
-- calls; `decline` records the refusal in the log too.
create function public.answer_appeal(appeal uuid, answer text, decline boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  admin_id uuid := public.require_admin();
  cleaned text := btrim(answer);
  person uuid;
begin
  if cleaned is null or char_length(cleaned) not between 2 and 1000 then
    raise exception 'answer_required' using errcode = 'P0001';
  end if;

  update public.moderation_appeals a
     set status = 'answered', answer = cleaned, resolved_by = admin_id, resolved_at = now()
   where a.id = appeal and a.status = 'open'
  returning a.user_id into person;
  if person is null then
    raise exception 'appeal_not_open' using errcode = 'P0001';
  end if;

  if decline then
    insert into public.moderation_events (user_id, kind, actor_id, reason)
    values (person, 'appeal_declined', admin_id, btrim(left(cleaned, 200)));
  end if;
end;
$$;

-- Everything an admin needs to review standing. The applications migration
-- replaces this to add each suspended person's campaigns and engagements.
create function public.standing_review()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'suspended', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'user_id', u.id,
               'email', u.email,
               'role', u.role,
               'name', coalesce(b.business_name, i.display_name, u.email),
               'suspended_at', u.suspended_at,
               'strikes', (
                 select coalesce(jsonb_agg(jsonb_build_object(
                          'id', s.id, 'flag', s.flag, 'detail', s.detail, 'created_at', s.created_at,
                          'voided', exists (select 1 from public.moderation_events v
                                             where v.kind = 'strike_voided' and v.strike_id = s.id))
                          order by s.created_at), '[]'::jsonb)
                   from public.moderation_events s
                  where s.user_id = u.id and s.kind = 'strike'
               )
             ) order by u.suspended_at), '[]'::jsonb)
        from public.users u
        left join public.business_profiles b on b.user_id = u.id
        left join public.influencer_profiles i on i.user_id = u.id
       where u.suspended_at is not null
    ),
    'appeals', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', a.id, 'user_id', a.user_id, 'email', u.email,
               'name', coalesce(b.business_name, i.display_name, u.email),
               'message', a.message, 'created_at', a.created_at,
               'active_strikes', public.active_strike_count(a.user_id),
               'suspended', u.suspended_at is not null
             ) order by a.created_at), '[]'::jsonb)
        from public.moderation_appeals a
        join public.users u on u.id = a.user_id
        left join public.business_profiles b on b.user_id = u.id
        left join public.influencer_profiles i on i.user_id = u.id
       where a.status = 'open'
    ),
    'recent_strikes', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', s.id, 'user_id', s.user_id, 'email', u.email,
               'name', coalesce(b.business_name, i.display_name, u.email),
               'flag', s.flag, 'detail', s.detail, 'created_at', s.created_at,
               'voided', exists (select 1 from public.moderation_events v
                                  where v.kind = 'strike_voided' and v.strike_id = s.id)
             ) order by s.created_at desc), '[]'::jsonb)
        from public.moderation_events s
        join public.users u on u.id = s.user_id
        left join public.business_profiles b on b.user_id = u.id
        left join public.influencer_profiles i on i.user_id = u.id
       where s.kind = 'strike' and s.created_at > now() - interval '30 days'
    )
  );
end;
$$;

-- Function grants ------------------------------------------------------------------------------------------

revoke all on function public.moderation_events_append_only() from public, anon, authenticated;
revoke all on function public.is_blocked_between(uuid, uuid) from public, anon, authenticated;
revoke all on function public.is_suspended(uuid) from public, anon, authenticated;
revoke all on function public.active_strike_count(uuid) from public, anon, authenticated;
revoke all on function public.standing_problem(uuid) from public, anon, authenticated;
revoke all on function public.check_standing(uuid) from public, anon, authenticated;
revoke all on function public.record_strike(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.relax_standing(uuid) from public, anon, authenticated;
revoke all on function public.require_admin() from public, anon, authenticated;
revoke all on function public.clean_reason(text) from public, anon, authenticated;
-- contact_detail_kind stays callable: it reveals nothing.

revoke all on function public.block_user(uuid) from public, anon;
revoke all on function public.unblock_user(uuid) from public, anon;
revoke all on function public.submit_appeal(text) from public, anon;
revoke all on function public.void_strike(uuid, text) from public, anon;
revoke all on function public.lift_suspension(uuid, text) from public, anon;
revoke all on function public.answer_appeal(uuid, text, boolean) from public, anon;
revoke all on function public.standing_review() from public, anon;

grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.submit_appeal(text) to authenticated;
grant execute on function public.void_strike(uuid, text) to authenticated;
grant execute on function public.lift_suspension(uuid, text) to authenticated;
grant execute on function public.answer_appeal(uuid, text, boolean) to authenticated;
grant execute on function public.standing_review() to authenticated;

-- Table grants and row level security ------------------------------------------------------------------------

alter table public.user_blocks enable row level security;
alter table public.moderation_events enable row level security;
alter table public.moderation_appeals enable row level security;

revoke all on table public.user_blocks from anon, authenticated;
revoke all on table public.moderation_events from anon, authenticated;
revoke all on table public.moderation_appeals from anon, authenticated;

grant select on table public.user_blocks to authenticated;
grant select on table public.moderation_events to authenticated;
grant select on table public.moderation_appeals to authenticated;

-- Only the blocker sees a block: the blocked person is never told.
create policy "People see who they have blocked"
  on public.user_blocks for select to authenticated
  using (blocker_id = (select public.current_user_id()));

create policy "People see their own standing log, admins see all"
  on public.moderation_events for select to authenticated
  using (
    user_id = (select public.current_user_id())
    or (select public.current_user_role()) = 'admin'
  );

create policy "People see their own appeals, admins see all"
  on public.moderation_appeals for select to authenticated
  using (
    user_id = (select public.current_user_id())
    or (select public.current_user_role()) = 'admin'
  );
