-- Chat email waits 6 hours and is off by default for new people (changes the
-- numbers and defaults of the email_queue migration, 20261118100000).
--
-- Invariants (proven by supabase/tests/message_email_defaults.test.sql and
-- email_queue.test.sql):
--   * A chat message is due for email 6 hours after it is written; a thread
--     read before then sends nothing (src/lib/send-emails.ts skips it).
--   * A thread gets at most one email in 6 hours (the cap matches the delay).
--   * A person with no saved preferences row gets no chat email; the other
--     two groups stay on for them.
--   * Everyone who exists when this runs and has no row keeps today's
--     behaviour: they get a row with all three on first, so the new default
--     only applies to accounts made after this migration.

insert into public.notification_preferences (user_id, email_applications, email_campaigns, email_messages)
select u.id, true, true, true
  from public.users u
 where not exists (select 1 from public.notification_preferences p where p.user_id = u.id);

alter table public.notification_preferences alter column email_messages set default false;

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
          case when what = 'new_message' then now() + interval '6 hours' else now() end)
  on conflict (user_id, group_key) do update
    set data = excluded.data,
        occurred_at = now(),
        read_at = null,
        -- Not emailed yet: keep a due time already set (so a busy thread does
        -- not push its own email back), or take the new one if there is none.
        -- Not emailed and all 5 attempts used (say Resend was down): a new
        -- event starts afresh with a new due time and 5 more tries, so an
        -- outage cannot silence a thread for good.
        -- Emailed 6 hours or more ago: due again. Emailed less than 6 hours
        -- ago: leave it, which is the one-email-per-thread-per-6-hours cap.
        email_due_at = case
          when n.emailed_at is null and n.email_attempts >= 5 then excluded.email_due_at
          when n.emailed_at is null then coalesce(n.email_due_at, excluded.email_due_at)
          when n.emailed_at <= now() - interval '6 hours' then excluded.email_due_at
          else n.email_due_at
        end,
        email_attempts = case
          when n.emailed_at is null and n.email_attempts >= 5 then 0
          when n.emailed_at <= now() - interval '6 hours' then 0
          else n.email_attempts
        end,
        emailed_at = case
          when n.emailed_at <= now() - interval '6 hours' then null
          else n.emailed_at
        end;
$$;

-- Same as before except the chat fallback for a person with no row is off.
create or replace function public.claim_due_emails(max integer)
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
         coalesce(p.email_messages, false)
    from claimed c
    join public.users u on u.id = c.user_id
    left join public.notification_preferences p on p.user_id = c.user_id
   order by c.occurred_at;
$$;
