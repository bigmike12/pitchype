-- A hire that isn't paid in time lapses everywhere the moment its deadline
-- passes, and its creator can apply again (CLAUDE.md §5).
--
-- Before this, the lapse was only applied by the daily job. Until it ran the
-- hire still read "awaiting payment": the creator saw "You're hired", the
-- business was still offered a Pay button, and the lapsed hire kept the place.
-- And once it lapsed, the application stayed "approved" for ever, so the
-- creator could neither apply again ("already_applied") nor be hired again
-- (one engagement per application).
--
--  1. engagement_json shows an unpaid hire past its deadline as cancelled
--     (payment_expired) straight away, unless a payment started in the last 30
--     minutes is still holding it. Every read goes through it. The stored row
--     is still cancelled by expire_unpaid_engagements, which now also runs when
--     a creator applies, so a lapsed hire never holds a place.
--  2. An application may have many hires over time but only one that isn't
--     cancelled. my_applications and campaign_applications show the newest.
--  3. apply_to_campaign lets the creator of an approved application whose hire
--     never got paid for apply again on the same application. A paid hire, a
--     live hire, a passed-over or a withdrawn application are still refused.
--  4. The business is told about the new application.

-- 1. The lapse, as every read sees it -------------------------------------------------
create or replace function public.engagement_json(e public.engagements)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when e.id is null then null else jsonb_build_object(
    'id', e.id,
    'status', case when l.lapsed then 'cancelled' else e.status::text end,
    'agreed_price_kobo', e.agreed_price_kobo,
    'approved_at', e.approved_at, 'pay_by', e.pay_by,
    'cancelled_at', case when l.lapsed then e.pay_by else e.cancelled_at end,
    'cancel_reason', case when l.lapsed then 'payment_expired' else e.cancel_reason end,
    'funded_at', e.funded_at, 'started_at', e.started_at, 'settled_at', e.settled_at,
    'settle_outcome', e.settle_outcome, 'released_kobo', e.released_kobo,
    'refunded_kobo', e.refunded_kobo, 'business_fee_kobo', e.business_fee_kobo,
    'creator_fee_bps', e.creator_fee_bps, 'creator_min_fee_kobo', e.creator_min_fee_kobo
  ) end
  from (select coalesce(
          e.status = 'awaiting_payment' and e.pay_by < now() and not public.payment_in_flight(e.id),
          false) as lapsed) l
$$;

-- 2. One live hire per application, many over time (lists show the live one, else the latest) -------------------------------------
alter table public.engagements drop constraint engagements_application_id_key;
create unique index engagements_one_live_per_application
  on public.engagements (application_id) where status <> 'cancelled';
create index engagements_application_idx
  on public.engagements (application_id, approved_at desc);

-- 3. Applying again, and the lists that show the newest hire ----------------------------
create or replace function public.apply_to_campaign(campaign uuid, proposed_price_kobo bigint, note text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  me uuid := public.current_user_id();
  k public.campaigns;
  cleaned text;
  new_id uuid;
  existing public.applications;
begin
  if me is null or public.current_user_role() is distinct from 'influencer' then
    raise exception 'creators apply to campaigns' using errcode = '42501';
  end if;
  perform public.check_standing(me);
  if not exists (select 1 from public.listed_creators c where c.user_id = me) then
    raise exception 'profile_not_listed' using errcode = 'P0001';
  end if;

  select * into k from public.campaigns c where c.id = campaign;
  if k.id is null or k.status <> 'open' or k.applications_close_on < public.lagos_today() then
    raise exception 'campaign_closed' using errcode = 'P0001';
  end if;
  -- Lapse unpaid hires past their deadline first, so their places count as free
  -- (the daily job is not the only thing that applies a lapse).
  perform public.expire_unpaid_engagements(k.id);
  if public.held_places(k.id) >= k.places then
    raise exception 'campaign_full' using errcode = 'P0001';
  end if;
  if public.is_blocked_between(me, k.business_id) or public.is_suspended(k.business_id) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if not public.valid_proposed_price(proposed_price_kobo) then
    raise exception 'price_invalid' using errcode = 'P0001';
  end if;
  cleaned := public.clean_note(note);
  if public.campaign_problems(k.id, me) <> '[]'::jsonb then
    raise exception 'not_eligible' using errcode = 'P0001';
  end if;
  select * into existing from public.applications a
   where a.campaign_id = k.id and a.creator_id = me for update;
  if existing.id is not null then
    -- A hire that was never paid for (it lapsed, or the business cancelled
    -- before payment) leaves the creator free to apply again. The same
    -- application goes back to "waiting for a decision" with the new price and
    -- note; the old hire stays as history. Anything else is still refused: a
    -- live or paid hire, a passed-over application, a withdrawn one.
    if existing.status = 'approved'
       and not exists (
         select 1 from public.engagements e
          where e.application_id = existing.id
            and (e.status <> 'cancelled' or e.funded_at is not null)
       ) then
      update public.applications a
         set status = 'submitted',
             proposed_price_kobo = case when proposed_price_kobo = k.price_kobo then null else proposed_price_kobo end,
             note = cleaned,
             decision_note = null,
             created_at = now(),
             updated_at = now()
       where a.id = existing.id;
      return existing.id;
    end if;
    raise exception 'already_applied' using errcode = 'P0001';
  end if;

  insert into public.applications (campaign_id, creator_id, proposed_price_kobo, note)
  values (
    k.id, me,
    case when proposed_price_kobo = k.price_kobo then null else proposed_price_kobo end,
    cleaned
  )
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.campaign_applications(campaign uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  owner_id uuid;
begin
  select k.business_id into owner_id from public.campaigns k where k.id = campaign;
  if owner_id is null or (owner_id is distinct from me and public.current_user_role() is distinct from 'admin') then
    raise exception 'no_such_campaign' using errcode = 'P0001';
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', a.id,
             'status', a.status,
             'proposed_price_kobo', a.proposed_price_kobo,
             'note', a.note,
             'decision_note', a.decision_note,
             'created_at', a.created_at,
             'updated_at', a.updated_at,
             'engagement', public.engagement_json((select x from public.engagements x where x.application_id = a.id order by (x.status <> 'cancelled') desc, x.approved_at desc limit 1)),
             'creator', jsonb_build_object(
               'id', p.user_id,
               'display_name', p.display_name,
               'slug', p.slug,
               'photo_version', p.photo_version,
               'city', p.city,
               'state', p.state,
               'niches', p.niches,
               'bio', p.bio,
               'starting_rate_kobo', p.starting_rate_kobo,
               'listed', exists (select 1 from public.listed_creators c where c.user_id = p.user_id),
               'suspended', public.is_suspended(p.user_id),
               'blocked', public.is_blocked_between(owner_id, p.user_id),
               'platforms', public.creator_platforms_json(p.user_id, true)
             )
           ) order by a.created_at), '[]'::jsonb)
      from public.applications a
      join public.influencer_profiles p on p.user_id = a.creator_id
     where a.campaign_id = campaign
  );
end;
$$;

create or replace function public.my_applications()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
begin
  if me is null or public.current_user_role() is distinct from 'influencer' then
    raise exception 'creators only' using errcode = '42501';
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', a.id,
             'status', a.status,
             'proposed_price_kobo', a.proposed_price_kobo,
             'note', a.note,
             'decision_note', a.decision_note,
             'created_at', a.created_at,
             'updated_at', a.updated_at,
             'engagement', public.engagement_json((select x from public.engagements x where x.application_id = a.id order by (x.status <> 'cancelled') desc, x.approved_at desc limit 1)),
             -- Only edits made while live, after this application was made.
             'brief_edited_at', (
               select max(r.created_at) from public.campaign_revisions r
                where r.campaign_id = k.id and r.while_live and r.created_at > a.created_at
             ),
             'campaign', jsonb_build_object(
               'id', k.id,
               'title', k.title,
               'status', k.status,
               'price_kobo', k.price_kobo,
               'applications_close_on', k.applications_close_on,
               'business_id', k.business_id,
               'business_name', b.business_name
             )
           ) order by a.created_at desc), '[]'::jsonb)
      from public.applications a
      join public.campaigns k on k.id = a.campaign_id
      join public.business_profiles b on b.user_id = k.business_id
     where a.creator_id = me
  );
end;
$$;

-- 4. Tell the business when a creator applies again --------------------------------
create or replace function public.applications_notify()
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
      when 'submitted' then
        -- A creator applying again after an unpaid hire ended (apply_to_campaign).
        perform public.notify(owner, 'application_received',
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
