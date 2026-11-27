-- Notification emails greet people by name (design:
-- docs/superpowers/specs/2026-11-27-richer-notification-emails-design.md).
-- claim_due_emails() gains a `name` column: a business's contact name (the
-- person, not the company) or a creator's display name; null when the person
-- has no profile yet (an admin, or someone who never finished onboarding).
-- The body is otherwise the one from 20261124100000_message_email_defaults.
-- The return type changes, so the function is dropped and made again, and its
-- grants are given again: the service role only.

drop function public.claim_due_emails(integer);

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
  email_messages boolean,
  name text
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
         coalesce(p.email_messages, false),
         case u.role
           when 'business' then bp.contact_name
           when 'influencer' then ip.display_name
         end
    from claimed c
    join public.users u on u.id = c.user_id
    left join public.notification_preferences p on p.user_id = c.user_id
    left join public.business_profiles bp on bp.user_id = c.user_id
    left join public.influencer_profiles ip on ip.user_id = c.user_id
   order by c.occurred_at;
$$;

revoke all on function public.claim_due_emails(integer) from public, anon, authenticated;
grant execute on function public.claim_due_emails(integer) to service_role;
