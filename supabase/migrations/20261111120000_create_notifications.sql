-- Notifications: the one source of truth for "something happened that you
-- should know about" (CLAUDE.md §8). In-app only for now; email arrives in
-- Stage 8 as a delivery channel off this table, not a parallel system.
--
-- Rows are written only by triggers on the tables where things happen, so
-- no code path can change an application, hire, campaign or message without
-- the right person hearing about it. The words live in the app
-- (src/lib/notifications.ts); a row stores the kind and the facts.
--
-- Rules (proven by supabase/tests/notifications.test.sql):
--   * People read only their own notifications and can only mark them read.
--   * Messages make one entry per conversation (group_key), bumped and made
--     unread by each new message and cleared when the thread is read.
--   * Nobody is notified about their own action: each trigger notifies the
--     other side only.

create type public.notification_kind as enum (
  -- To a business
  'application_received',
  'application_updated',
  'application_withdrawn',
  'campaign_approved',
  'campaign_sent_back',
  'campaign_taken_down',
  -- To a creator
  'application_shortlisted',
  'application_hired',
  'application_passed',
  'hire_cancelled',
  'verification_approved',
  'verification_rejected',
  'profile_hidden',
  'profile_restored',
  -- To either
  'hire_lapsed',
  'new_message',
  'appeal_answered'
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  kind public.notification_kind not null,
  -- Facts for the words and the link: names, titles, ids, notes. Snapshot at
  -- the time, like an email would be.
  data jsonb not null default '{}',
  -- Entries that should stay one row (a conversation, edits to one
  -- application) share a key; NULL means every event is its own row.
  group_key text,
  -- When it last happened (a grouped entry moves up when bumped).
  occurred_at timestamptz not null default now(),
  read_at timestamptz,

  constraint notifications_group_unique unique (user_id, group_key)
);

create index notifications_user_idx on public.notifications (user_id, occurred_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

revoke all on table public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated;

create policy "Notifications: only the person"
  on public.notifications for select to authenticated
  using (user_id = (select public.current_user_id()));

-- Writing ------------------------------------------------------------------------------------------

create function public.notify(
  person uuid,
  what public.notification_kind,
  facts jsonb,
  key text default null
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, kind, data, group_key)
  values (person, what, facts, key)
  on conflict (user_id, group_key) do update
    set data = excluded.data, occurred_at = now(), read_at = null;
$$;

create function public.display_name_of(person uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select b.business_name from public.business_profiles b where b.user_id = person),
    (select i.display_name from public.influencer_profiles i where i.user_id = person)
  )
$$;

-- Applications: new, edited, withdrawn (to the business); shortlisted, hired,
-- passed (to the creator).
create function public.applications_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
  facts jsonb;
begin
  select k.business_id,
         jsonb_build_object('campaign_id', k.id, 'campaign_title', k.title, 'application_id', new.id)
    into owner, facts
    from public.campaigns k where k.id = new.campaign_id;

  if tg_op = 'INSERT' then
    perform public.notify(owner, 'application_received',
      facts || jsonb_build_object('name', public.display_name_of(new.creator_id)));
  elsif new.status is distinct from old.status then
    case new.status
      when 'withdrawn' then
        perform public.notify(owner, 'application_withdrawn',
          facts || jsonb_build_object('name', public.display_name_of(new.creator_id)));
      when 'shortlisted' then
        perform public.notify(new.creator_id, 'application_shortlisted',
          facts || jsonb_build_object('name', public.display_name_of(owner)));
      when 'approved' then
        perform public.notify(new.creator_id, 'application_hired',
          facts || jsonb_build_object('name', public.display_name_of(owner)));
      when 'rejected' then
        perform public.notify(new.creator_id, 'application_passed',
          facts || jsonb_build_object('name', public.display_name_of(owner), 'note', new.decision_note));
      else
        null;
    end case;
  elsif (new.proposed_price_kobo, new.note) is distinct from (old.proposed_price_kobo, old.note) then
    perform public.notify(owner, 'application_updated',
      facts || jsonb_build_object('name', public.display_name_of(new.creator_id)),
      'application-updated:' || new.id);
  end if;
  return null;
end;
$$;

create trigger applications_notify
  after insert or update on public.applications
  for each row execute function public.applications_notify();

-- Hires that end before payment: cancelled by the business (to the creator)
-- or lapsed after 48 hours (to both).
create function public.engagements_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  facts jsonb;
begin
  if new.status <> 'cancelled' or old.status = 'cancelled' then
    return null;
  end if;
  select jsonb_build_object('campaign_id', k.id, 'campaign_title', k.title, 'engagement_id', new.id)
    into facts
    from public.campaigns k where k.id = new.campaign_id;

  if new.cancel_reason = 'payment_expired' then
    perform public.notify(new.business_id, 'hire_lapsed',
      facts || jsonb_build_object('name', public.display_name_of(new.creator_id)));
    perform public.notify(new.creator_id, 'hire_lapsed',
      facts || jsonb_build_object('name', public.display_name_of(new.business_id)));
  elsif new.cancel_reason = 'cancelled_by_business' then
    perform public.notify(new.creator_id, 'hire_cancelled',
      facts || jsonb_build_object('name', public.display_name_of(new.business_id)));
  end if;
  return null;
end;
$$;

create trigger engagements_notify
  after update of status on public.engagements
  for each row execute function public.engagements_notify();

-- Messages: one entry per conversation for the other person, counting the
-- messages since they last read it.
create function public.messages_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conv record;
  recipient uuid;
  key text := 'conversation:' || new.conversation_id;
  unread_before integer;
begin
  select c.business_id, c.creator_id into conv
    from public.conversations c where c.id = new.conversation_id;
  recipient := case when new.sender_id = conv.business_id then conv.creator_id else conv.business_id end;

  select case when n.read_at is null then coalesce((n.data ->> 'count')::integer, 0) else 0 end
    into unread_before
    from public.notifications n
   where n.user_id = recipient and n.group_key = key;

  perform public.notify(recipient, 'new_message',
    jsonb_build_object(
      'conversation_id', new.conversation_id,
      'name', public.display_name_of(new.sender_id),
      'preview', left(new.body, 140),
      'count', coalesce(unread_before, 0) + 1
    ),
    key);
  return null;
end;
$$;

create trigger messages_notify
  after insert on public.messages
  for each row execute function public.messages_notify();

-- Reading a thread clears its entry.
create function public.conversation_reads_clear()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notifications
     set read_at = now()
   where user_id = new.user_id
     and group_key = 'conversation:' || new.conversation_id
     and read_at is null;
  return null;
end;
$$;

create trigger conversation_reads_clear
  after insert or update on public.conversation_reads
  for each row execute function public.conversation_reads_clear();

-- Admin decisions on a campaign (to the business).
create function public.campaigns_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  facts jsonb := jsonb_build_object('campaign_id', new.id, 'campaign_title', new.title);
begin
  if old.status = 'pending_review' and new.status = 'open' then
    perform public.notify(new.business_id, 'campaign_approved', facts);
  elsif old.status = 'pending_review' and new.status = 'draft' then
    perform public.notify(new.business_id, 'campaign_sent_back',
      facts || jsonb_build_object('note', new.review_note));
  elsif new.removed_reason is not null and old.removed_reason is null then
    perform public.notify(new.business_id, 'campaign_taken_down',
      facts || jsonb_build_object('note', new.removed_reason));
  end if;
  return null;
end;
$$;

create trigger campaigns_notify
  after update of status on public.campaigns
  for each row execute function public.campaigns_notify();

-- Handle verification results (to the creator).
create function public.verification_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  facts jsonb := jsonb_build_object('platform', new.platform, 'handle', new.handle);
begin
  if old.status = 'pending' and new.status = 'verified' then
    perform public.notify(new.user_id, 'verification_approved', facts);
  elsif old.status = 'pending' and new.status = 'rejected' then
    perform public.notify(new.user_id, 'verification_rejected', facts);
  end if;
  return null;
end;
$$;

create trigger verification_notify
  after update of status on public.verification_requests
  for each row execute function public.verification_notify();

-- An admin hiding or restoring a creator's profile (to the creator).
create function public.creator_visibility_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.hidden_at is null and new.hidden_at is not null then
    perform public.notify(new.user_id, 'profile_hidden', jsonb_build_object('note', new.hidden_reason));
  elsif old.hidden_at is not null and new.hidden_at is null then
    perform public.notify(new.user_id, 'profile_restored', '{}');
  end if;
  return null;
end;
$$;

create trigger creator_visibility_notify
  after update of hidden_at on public.influencer_profiles
  for each row execute function public.creator_visibility_notify();

-- An answered appeal (to the person who appealed).
create function public.appeals_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'open' and new.status = 'answered' then
    perform public.notify(new.user_id, 'appeal_answered', jsonb_build_object('appeal_id', new.id));
  end if;
  return null;
end;
$$;

create trigger appeals_notify
  after update of status on public.moderation_appeals
  for each row execute function public.appeals_notify();

-- Reading ------------------------------------------------------------------------------------------

-- Marks the caller's own notifications read: the given ids, or all of them
-- when ids is null. Returns how many changed.
create function public.mark_notifications_read(ids uuid[] default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  changed integer;
begin
  if me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  update public.notifications n
     set read_at = now()
   where n.user_id = me
     and n.read_at is null
     and (ids is null or n.id = any (ids));
  get diagnostics changed = row_count;
  return changed;
end;
$$;

-- Grants -------------------------------------------------------------------------------------------

revoke all on function public.notify(uuid, public.notification_kind, jsonb, text) from public, anon, authenticated;
revoke all on function public.display_name_of(uuid) from public, anon, authenticated;
revoke all on function public.applications_notify() from public, anon, authenticated;
revoke all on function public.engagements_notify() from public, anon, authenticated;
revoke all on function public.messages_notify() from public, anon, authenticated;
revoke all on function public.conversation_reads_clear() from public, anon, authenticated;
revoke all on function public.campaigns_notify() from public, anon, authenticated;
revoke all on function public.verification_notify() from public, anon, authenticated;
revoke all on function public.creator_visibility_notify() from public, anon, authenticated;
revoke all on function public.appeals_notify() from public, anon, authenticated;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- Live updates for the bell. Guarded so the migration also runs on plain
-- Postgres without Supabase Realtime.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
