-- Email queue on the notifications table (Stage 8). Email is a delivery
-- channel off the one table (CLAUDE.md §8), not a second system: a row that
-- is due for email is simply a notification with a due time.
--
-- Invariants (proven by supabase/tests/email_queue.test.sql and scenario 22
-- of scripts/money-race.mjs):
--   * The queue only ever holds rows made by notify(), the one writer of
--     notification rows. Nothing else sets email_due_at.
--   * Rows that exist when this migration runs keep a null email_due_at, so
--     nobody is emailed about old events.
--   * claim_due_emails() is the only way a row leaves the queue for sending.
--     It locks with skip locked and, in the same statement, counts the
--     attempt and pushes the row 5 minutes out, so two callers never get the
--     same row and a failed send is retried later without anyone resetting it.
--   * At most 5 attempts per row. A row emailed less than an hour ago is not
--     queued again by a bump, so a busy thread costs one email an hour.
--   * Chat email is due 15 minutes after the message, and a bump of a
--     thread that is still waiting keeps its due time, so constant messages
--     cannot push the email back forever.
--   * Preferences are read at send time (claim returns them), so switching a
--     group off also stops emails already waiting. No row means all on.
--   * Only the service role claims and finishes; a person only saves and
--     reads their own preferences.

alter table public.notifications
  add column email_due_at timestamptz,
  add column emailed_at timestamptz,
  add column email_attempts integer not null default 0;

-- The per-minute check looks only at rows still waiting.
create index notifications_email_due_idx on public.notifications (email_due_at)
  where emailed_at is null and email_due_at is not null;

-- Preferences --------------------------------------------------------------------------------------------

create table public.notification_preferences (
  user_id uuid primary key references public.users (id) on delete cascade,
  email_applications boolean not null default true,
  email_campaigns boolean not null default true,
  email_messages boolean not null default true
);

alter table public.notification_preferences enable row level security;

revoke all on table public.notification_preferences from anon, authenticated;
grant select on table public.notification_preferences to authenticated;

create policy "Notification preferences: only the person"
  on public.notification_preferences for select to authenticated
  using (user_id = (select public.current_user_id()));

create function public.save_email_preferences(applications boolean, campaigns boolean, messages boolean)
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
  insert into public.notification_preferences (user_id, email_applications, email_campaigns, email_messages)
  values (me, applications, campaigns, messages)
  on conflict (user_id) do update
    set email_applications = excluded.email_applications,
        email_campaigns = excluded.email_campaigns,
        email_messages = excluded.email_messages;
end;
$$;

-- Writing: notify() now also says when the email is due ---------------------------------------------------------------

create or replace function public.notify(
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
  insert into public.notifications as n (user_id, kind, data, group_key, email_due_at)
  values (person, what, facts, key,
          case when what = 'new_message' then now() + interval '15 minutes' else now() end)
  on conflict (user_id, group_key) do update
    set data = excluded.data,
        occurred_at = now(),
        read_at = null,
        -- Not emailed yet: keep a due time already set (so a busy thread does
        -- not push its own email back), or take the new one if there is none.
        -- Emailed an hour or more ago: due again. Emailed less than an hour
        -- ago: leave it, which is the one-email-per-thread-per-hour cap.
        email_due_at = case
          when n.emailed_at is null then coalesce(n.email_due_at, excluded.email_due_at)
          when n.emailed_at <= now() - interval '1 hour' then excluded.email_due_at
          else n.email_due_at
        end,
        email_attempts = case
          when n.emailed_at <= now() - interval '1 hour' then 0
          else n.email_attempts
        end,
        emailed_at = case
          when n.emailed_at <= now() - interval '1 hour' then null
          else n.emailed_at
        end;
$$;

-- Sending ----------------------------------------------------------------------------------------------------------

-- Hands out up to max rows that are due, unsent and under 5 attempts, oldest
-- due first, with the recipient's address, role and preferences. `attempts`
-- is the count including this claim, so 5 means the last try.
create function public.claim_due_emails(max integer)
returns table (
  id uuid,
  kind text,
  data jsonb,
  occurred_at timestamptz,
  read_at timestamptz,
  attempts integer,
  email text,
  role text,
  email_applications boolean,
  email_campaigns boolean,
  email_messages boolean
)
language sql
volatile
security definer
set search_path = ''
as $$
  with due as (
    select n.id
      from public.notifications n
     where n.emailed_at is null
       and n.email_due_at <= now()
       and n.email_attempts < 5
     order by n.email_due_at
     limit max
       for update skip locked
  ), claimed as (
    update public.notifications n
       set email_attempts = n.email_attempts + 1,
           email_due_at = now() + interval '5 minutes'
      from due
     where n.id = due.id
    returning n.id, n.user_id, n.kind, n.data, n.occurred_at, n.read_at, n.email_attempts
  )
  select c.id, c.kind::text, c.data, c.occurred_at, c.read_at, c.email_attempts,
         u.email, u.role::text,
         coalesce(p.email_applications, true),
         coalesce(p.email_campaigns, true),
         coalesce(p.email_messages, true)
    from claimed c
    join public.users u on u.id = c.user_id
    left join public.notification_preferences p on p.user_id = c.user_id
   order by c.occurred_at;
$$;

-- Records the result of one send. Sent: the row is done and starts the
-- one-hour cap. Not sent for a good reason (a switched-off group, a thread
-- already read): nothing is pending any more, and it does not count as an
-- email. A failed send is not reported here; the row simply comes due again.
create function public.finish_email(notification uuid, was_sent boolean)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.notifications n
     set emailed_at = case when was_sent then now() else n.emailed_at end,
         email_due_at = case when was_sent then n.email_due_at else null end
   where n.id = notification;
$$;

-- Grants -------------------------------------------------------------------------------------------------------------

revoke all on function public.claim_due_emails(integer) from public, anon, authenticated;
grant execute on function public.claim_due_emails(integer) to service_role;
revoke all on function public.finish_email(uuid, boolean) from public, anon, authenticated;
grant execute on function public.finish_email(uuid, boolean) to service_role;
revoke all on function public.save_email_preferences(boolean, boolean, boolean) from public, anon, service_role;
grant execute on function public.save_email_preferences(boolean, boolean, boolean) to authenticated;
