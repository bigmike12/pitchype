-- Chat (Stage 5).
-- Design: docs/superpowers/specs/2026-11-10-stage-5-applications-chat-design.md §3, §4, §6.
--
-- Invariants this migration protects:
--   1. Only the business and the creator in a thread can read it or write
--      in it; only a business starts one, with a creator who is listed in
--      the directory or has applied to one of its campaigns.
--   2. A message with contact details (contact_detail_kind, the database's
--      copy of src/lib/contact-details.ts) is never stored or delivered: it
--      becomes a strike instead (record_strike), even when the API is
--      called directly.
--   3. Standing and blocks stop new messages and new threads; history stays
--      readable.
--   4. A retried send is stored once (dedupe key per sender).

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.users (id) on delete cascade,
  creator_id uuid not null references public.users (id) on delete cascade,
  -- The application the business started it from, if any.
  application_id uuid references public.applications (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,

  constraint conversations_one_per_pair unique (business_id, creator_id)
);

create index conversations_creator_idx on public.conversations (creator_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.users (id) on delete cascade,
  body text not null,
  dedupe_key uuid not null,
  created_at timestamptz not null default now(),

  constraint messages_body_check check (body = btrim(body) and char_length(body) between 1 and 2000),
  constraint messages_dedupe_unique unique (sender_id, dedupe_key)
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);

create table public.conversation_reads (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- Functions -------------------------------------------------------------------------------------

create function public.is_participant(conversation uuid, person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
     where c.id = conversation and person in (c.business_id, c.creator_id)
  )
$$;

-- A business opens (or reopens) its thread with a creator.
create function public.start_conversation(creator uuid, application uuid default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  existing uuid;
  new_id uuid;
begin
  if me is null or public.current_user_role() is distinct from 'business' then
    raise exception 'businesses start conversations' using errcode = '42501';
  end if;
  perform public.check_standing(me);
  if public.is_blocked_between(me, creator) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.listed_creators c where c.user_id = creator)
     and not exists (
       select 1 from public.applications a
         join public.campaigns k on k.id = a.campaign_id
        where a.creator_id = creator and k.business_id = me
     )
  then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if application is not null and not exists (
       select 1 from public.applications a
         join public.campaigns k on k.id = a.campaign_id
        where a.id = application and a.creator_id = creator and k.business_id = me
     )
  then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  select c.id into existing from public.conversations c
   where c.business_id = me and c.creator_id = creator;
  if existing is not null then
    return existing;
  end if;

  insert into public.conversations (business_id, creator_id, application_id)
  values (me, creator, application)
  returning id into new_id;
  return new_id;
end;
$$;

-- Sends a message, or, if it holds contact details, records a strike instead.
create function public.send_message(conversation uuid, body text, dedupe uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  c public.conversations;
  cleaned text := btrim(body);
  flag text;
begin
  select * into c from public.conversations x where x.id = conversation;
  if me is null or c.id is null or me not in (c.business_id, c.creator_id) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  perform public.check_standing(me);
  if public.is_blocked_between(c.business_id, c.creator_id) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if cleaned is null or char_length(cleaned) not between 1 and 2000 then
    raise exception 'message_length' using errcode = 'P0001';
  end if;

  flag := public.contact_detail_kind(cleaned);
  if flag is not null then
    return jsonb_build_object('delivered', false, 'flag', flag)
           || public.record_strike(me, flag, cleaned, dedupe);
  end if;

  insert into public.messages (conversation_id, sender_id, body, dedupe_key)
  values (c.id, me, cleaned, dedupe)
  on conflict (sender_id, dedupe_key) do nothing;
  if found then
    update public.conversations x set last_message_at = now() where x.id = c.id;
  end if;
  return jsonb_build_object('delivered', true);
end;
$$;

create function public.mark_conversation_read(conversation uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
begin
  if not public.is_participant(conversation, me) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  insert into public.conversation_reads (conversation_id, user_id, last_read_at)
  values (conversation, me, now())
  on conflict (conversation_id, user_id) do update set last_read_at = excluded.last_read_at;
end;
$$;

-- Messages from the other person since the reader last opened the thread.
create function public.unread_in(conversation uuid, person uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.messages m
   where m.conversation_id = conversation
     and m.sender_id <> person
     and m.created_at > coalesce(
       (select r.last_read_at from public.conversation_reads r
         where r.conversation_id = conversation and r.user_id = person),
       '-infinity'::timestamptz)
$$;

create function public.unread_message_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(public.unread_in(c.id, public.current_user_id())), 0)::integer
    from public.conversations c
   where public.current_user_id() in (c.business_id, c.creator_id)
$$;

-- The caller's threads, most recent first, with the other person.
create function public.my_conversations()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select public.current_user_id() as id)
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id,
           'application_id', c.application_id,
           'created_at', c.created_at,
           'last_message_at', c.last_message_at,
           'unread', public.unread_in(c.id, me.id),
           'last_message', (
             select jsonb_build_object('body', left(m.body, 140), 'mine', m.sender_id = me.id, 'created_at', m.created_at)
               from public.messages m where m.conversation_id = c.id
              order by m.created_at desc limit 1
           ),
           'other', case when me.id = c.business_id
             then jsonb_build_object('id', c.creator_id, 'role', 'influencer', 'name', i.display_name,
                                     'slug', i.slug, 'photo_version', i.photo_version)
             else jsonb_build_object('id', c.business_id, 'role', 'business', 'name', b.business_name)
           end,
           'blocked_by_me', exists (
             select 1 from public.user_blocks ub
              where ub.blocker_id = me.id
                and ub.blocked_id = case when me.id = c.business_id then c.creator_id else c.business_id end
           ),
           'blocked', public.is_blocked_between(c.business_id, c.creator_id)
         ) order by coalesce(c.last_message_at, c.created_at) desc), '[]'::jsonb)
    from public.conversations c
    cross join me
    left join public.business_profiles b on b.user_id = c.business_id
    left join public.influencer_profiles i on i.user_id = c.creator_id
   where me.id in (c.business_id, c.creator_id)
$$;

-- Function grants ------------------------------------------------------------------------------------

revoke all on function public.is_participant(uuid, uuid) from public, anon, authenticated;
revoke all on function public.unread_in(uuid, uuid) from public, anon, authenticated;

revoke all on function public.start_conversation(uuid, uuid) from public, anon;
revoke all on function public.send_message(uuid, text, uuid) from public, anon;
revoke all on function public.mark_conversation_read(uuid) from public, anon;
revoke all on function public.unread_message_count() from public, anon;
revoke all on function public.my_conversations() from public, anon;

grant execute on function public.start_conversation(uuid, uuid) to authenticated;
grant execute on function public.send_message(uuid, text, uuid) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.unread_message_count() to authenticated;
grant execute on function public.my_conversations() to authenticated;

-- Table grants and row level security ------------------------------------------------------------------

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.conversation_reads enable row level security;

revoke all on table public.conversations from anon, authenticated;
revoke all on table public.messages from anon, authenticated;
revoke all on table public.conversation_reads from anon, authenticated;

grant select on table public.conversations to authenticated;
grant select on table public.messages to authenticated;
grant select on table public.conversation_reads to authenticated;

create policy "Conversations: the two people, admins"
  on public.conversations for select to authenticated
  using (
    (select public.current_user_id()) in (business_id, creator_id)
    or (select public.current_user_role()) = 'admin'
  );

-- Admins don't read messages here: strikes keep what they need to review.
create policy "Messages: the two people in the thread"
  on public.messages for select to authenticated
  using (exists (
    select 1 from public.conversations c
     where c.id = conversation_id
       and (select public.current_user_id()) in (c.business_id, c.creator_id)
  ));

create policy "Reads: your own"
  on public.conversation_reads for select to authenticated
  using (user_id = (select public.current_user_id()));

-- Realtime: the browser subscribes to new messages under the person's own
-- session, so the policies above decide what arrives. Guarded so the
-- migration also runs on plain Postgres without Supabase Realtime.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;
