-- A hire that ended without being paid for puts its creator back in front of
-- the business, who can hire them again or pass (CLAUDE.md §5).
--
-- Follows 20261114100000_lapse_and_reapply.sql. There the lapse became visible
-- everywhere and the creator gained "apply again". On the business side an
-- application whose hire lapsed was still "approved", so it sat under Hired and
-- looked like a filled place, with no way to hire the creator again.
--
-- One rule, in one place: engagement_lapsed (an unpaid hire past its deadline
-- with no payment in the last 30 minutes holding it) and hire_ended_unpaid
-- (an approved application whose hires all ended without being paid for).
-- engagement_json, the counts, approve_application and decide_application all
-- use them, so the screens can't disagree again.

create function public.engagement_lapsed(e public.engagements)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    e.status = 'awaiting_payment' and e.pay_by < now() and not public.payment_in_flight(e.id),
    false)
$$;

create function public.hire_ended_unpaid(application uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    a.status = 'approved'
    and exists (select 1 from public.engagements e where e.application_id = a.id)
    and not exists (
      select 1 from public.engagements e
       where e.application_id = a.id
         and (e.funded_at is not null
              or not (e.status = 'cancelled' or public.engagement_lapsed(e)))
    ),
    false)
  from public.applications a
  where a.id = application
$$;

revoke all on function public.engagement_lapsed(public.engagements) from public, anon, authenticated, service_role;
revoke all on function public.hire_ended_unpaid(uuid) from public, anon, authenticated, service_role;

-- engagement_json uses the shared rule (same output as before).
create or replace function public.engagement_json(e public.engagements)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when e.id is null then null else jsonb_build_object(
    'id', e.id,
    'status', case when public.engagement_lapsed(e) then 'cancelled' else e.status::text end,
    'agreed_price_kobo', e.agreed_price_kobo,
    'approved_at', e.approved_at, 'pay_by', e.pay_by,
    'cancelled_at', case when public.engagement_lapsed(e) then e.pay_by else e.cancelled_at end,
    'cancel_reason', case when public.engagement_lapsed(e) then 'payment_expired' else e.cancel_reason end,
    'funded_at', e.funded_at, 'started_at', e.started_at, 'settled_at', e.settled_at,
    'settle_outcome', e.settle_outcome, 'released_kobo', e.released_kobo,
    'refunded_kobo', e.refunded_kobo, 'business_fee_kobo', e.business_fee_kobo,
    'creator_fee_bps', e.creator_fee_bps, 'creator_min_fee_kobo', e.creator_min_fee_kobo
  ) end
$$;

create or replace function public.approve_application(application uuid, expected_price_kobo bigint)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  a public.applications;
  k public.campaigns;
  agreed bigint;
  engagement_id uuid;
  rehire boolean;
begin
  if me is null or public.current_user_role() is distinct from 'business' then
    raise exception 'businesses approve applications' using errcode = '42501';
  end if;

  select * into a from public.applications x where x.id = application;
  if a.id is null then
    raise exception 'no_such_application' using errcode = 'P0001';
  end if;
  select * into k from public.campaigns c where c.id = a.campaign_id for update;
  if k.business_id is distinct from me then
    raise exception 'no_such_application' using errcode = 'P0001';
  end if;
  -- Read the application again under the lock: its price may just have changed.
  select * into a from public.applications x where x.id = application for update;

  perform public.check_standing(me);
  if public.is_suspended(a.creator_id) then
    raise exception 'creator_unavailable' using errcode = 'P0001';
  end if;
  if public.is_blocked_between(me, a.creator_id) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  perform public.expire_unpaid_engagements(k.id);
  if k.status not in ('open', 'paused') then
    raise exception 'campaign_closed' using errcode = 'P0001';
  end if;
  -- Waiting for a decision, or approved before but never paid for (the hire
  -- lapsed, or was cancelled before payment): the business can hire again.
  rehire := a.status = 'approved' and public.hire_ended_unpaid(a.id);
  if a.status not in ('submitted', 'shortlisted') and not rehire then
    raise exception 'application_locked' using errcode = 'P0001';
  end if;
  agreed := coalesce(a.proposed_price_kobo, k.price_kobo);
  if agreed is distinct from expected_price_kobo then
    raise exception 'price_changed' using errcode = 'P0001';
  end if;
  if public.held_places(k.id) >= k.places then
    raise exception 'campaign_full' using errcode = 'P0001';
  end if;

  insert into public.engagements (application_id, campaign_id, business_id, creator_id, agreed_price_kobo, pay_by)
  values (a.id, k.id, me, a.creator_id, agreed, now() + interval '48 hours')
  returning id into engagement_id;
  update public.applications x set status = 'approved', updated_at = now() where x.id = a.id;
  if rehire then
    -- The status was already 'approved', so the application trigger stays quiet:
    -- tell the creator they are hired again.
    perform public.notify(a.creator_id, 'application_hired',
      jsonb_build_object('campaign_id', k.id, 'campaign_title', k.title, 'application_id', a.id,
                         'name', public.display_name_of(me)));
  end if;
  return engagement_id;
end;
$$;

create or replace function public.decide_application(application uuid, decision text, note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  a public.applications;
  owner_id uuid;
  cleaned text;
begin
  select * into a from public.applications x where x.id = application for update;
  select k.business_id into owner_id from public.campaigns k where k.id = a.campaign_id;
  if a.id is null or owner_id is distinct from me then
    raise exception 'no_such_application' using errcode = 'P0001';
  end if;
  if decision not in ('shortlisted', 'rejected') then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if a.status not in ('submitted', 'shortlisted')
     and not (decision = 'rejected' and a.status = 'approved' and public.hire_ended_unpaid(a.id)) then
    raise exception 'application_locked' using errcode = 'P0001';
  end if;
  cleaned := public.clean_note(note);

  update public.applications x
     set status = decision::public.application_status,
         decision_note = case when decision = 'rejected' then cleaned else x.decision_note end,
         updated_at = now()
   where x.id = a.id;
end;
$$;

create or replace function public.campaign_application_counts()
returns table (campaign_id uuid, total integer, waiting integer)
language sql
stable
security definer
set search_path = ''
as $$
  select k.id,
         count(a.id)::integer,
         (count(a.id) filter (where a.status in ('submitted', 'shortlisted') or public.hire_ended_unpaid(a.id)))::integer
    from public.campaigns k
    left join public.applications a on a.campaign_id = k.id
   where k.business_id = public.current_user_id()
   group by k.id
$$;
