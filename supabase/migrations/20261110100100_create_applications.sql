-- Applications and engagements (Stage 5).
-- Design: docs/superpowers/specs/2026-11-10-stage-5-applications-chat-design.md §2, §6.
--
-- Invariants this migration protects:
--   1. Eligibility is checked on the server when a creator applies
--      (campaign_problems), in the same call as the insert.
--   2. One application per creator per campaign.
--   3. A campaign is never over-filled: approve_application() locks the
--      campaign row, lapses unpaid approvals, counts the places held and
--      inserts, in one transaction. Places can't be cut below those held.
--   4. The agreed price is frozen at approval, and only if it is the price
--      the business saw (expected_price_kobo).
--   5. An unpaid approval lapses after 48 hours; lapsing is idempotent.
--   6. Engagement statuses change only through these functions. Stage 5
--      only moves awaiting_payment to cancelled; no money moves here.
--   7. Standing and blocks (moderation migration) stop new applications and
--      approvals, and leave existing ones exactly as they are.

create type public.application_status as enum (
  'submitted',
  'shortlisted',
  'approved',  -- an engagement exists
  'rejected',  -- final
  'withdrawn'  -- final
);

-- The full engagement lifecycle (CLAUDE.md §5), so later stages add no values.
create type public.engagement_status as enum (
  'awaiting_payment',
  'funded',
  'in_progress',
  'submitted',
  'accepted',
  'denied',
  'paid_out',
  'disputed',
  'auto_released',
  'cancelled',
  'refunded'
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  creator_id uuid not null references public.users (id) on delete cascade,
  status public.application_status not null default 'submitted',
  -- Null: the creator accepts the campaign price. Whole naira, ₦5,000 up.
  proposed_price_kobo bigint,
  note text,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint applications_one_per_creator unique (campaign_id, creator_id),
  constraint applications_price_check check (
    proposed_price_kobo is null
    or (proposed_price_kobo between 500000 and 10000000000 and proposed_price_kobo % 100 = 0)
  ),
  constraint applications_note_check check (
    note is null or (note = btrim(note) and char_length(note) between 1 and 500)
  ),
  constraint applications_decision_note_check check (
    decision_note is null or (decision_note = btrim(decision_note) and char_length(decision_note) between 1 and 500)
  )
);

create index applications_creator_idx on public.applications (creator_id, created_at desc);

-- One creator doing one job for one business. Carries money from Stage 6,
-- so rows are never deleted with a person or campaign.
create table public.engagements (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.applications (id) on delete restrict,
  campaign_id uuid not null references public.campaigns (id) on delete restrict,
  business_id uuid not null references public.users (id) on delete restrict,
  creator_id uuid not null references public.users (id) on delete restrict,
  status public.engagement_status not null default 'awaiting_payment',
  agreed_price_kobo bigint not null,
  approved_at timestamptz not null default now(),
  pay_by timestamptz not null,
  cancelled_at timestamptz,
  cancel_reason text,
  updated_at timestamptz not null default now(),

  constraint engagements_price_check check (
    agreed_price_kobo between 500000 and 10000000000 and agreed_price_kobo % 100 = 0
  ),
  constraint engagements_cancel_check check (
    (status = 'cancelled') = (cancelled_at is not null and cancel_reason is not null)
  ),
  constraint engagements_cancel_reason_check check (
    cancel_reason is null or cancel_reason in ('payment_expired', 'cancelled_by_business')
  )
);

create index engagements_campaign_idx on public.engagements (campaign_id, status);
create index engagements_creator_idx on public.engagements (creator_id);
create index engagements_due_idx on public.engagements (pay_by) where status = 'awaiting_payment';

-- Internal helpers ---------------------------------------------------------------------------

-- Places taken: every engagement that isn't cancelled or refunded.
create function public.held_places(campaign uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.engagements e
   where e.campaign_id = campaign
     and e.status not in ('cancelled', 'refunded')
$$;

-- Lapses unpaid approvals past their deadline. Safe to run twice or late.
-- The scheduled job calls it with no campaign; approve_application() calls it
-- for its own campaign first.
create function public.expire_unpaid_engagements(campaign uuid default null)
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with expired as (
    update public.engagements e
       set status = 'cancelled', cancelled_at = now(), cancel_reason = 'payment_expired', updated_at = now()
     where e.status = 'awaiting_payment'
       and e.pay_by < now()
       and (campaign is null or e.campaign_id = campaign)
    returning 1
  )
  select count(*)::integer from expired
$$;

create function public.valid_proposed_price(price bigint)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select price is null or (price between 500000 and 10000000000 and price % 100 = 0)
$$;

create function public.clean_note(note text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  cleaned text := nullif(btrim(note), '');
begin
  if cleaned is not null and char_length(cleaned) > 500 then
    raise exception 'note_too_long' using errcode = 'P0001';
  end if;
  return cleaned;
end;
$$;

-- Creators -----------------------------------------------------------------------------------------

create function public.apply_to_campaign(campaign uuid, proposed_price_kobo bigint, note text)
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
  if exists (select 1 from public.applications a where a.campaign_id = k.id and a.creator_id = me) then
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

-- A creator changes their price or note before a decision: how a negotiated
-- price is agreed. Approval then freezes it.
create function public.edit_application(application uuid, proposed_price_kobo bigint, note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  me uuid := public.current_user_id();
  a public.applications;
  campaign_price bigint;
  cleaned text;
begin
  select * into a from public.applications x where x.id = application and x.creator_id = me for update;
  if a.id is null then
    raise exception 'no_such_application' using errcode = 'P0001';
  end if;
  if a.status not in ('submitted', 'shortlisted') then
    raise exception 'application_locked' using errcode = 'P0001';
  end if;
  if not public.valid_proposed_price(proposed_price_kobo) then
    raise exception 'price_invalid' using errcode = 'P0001';
  end if;
  cleaned := public.clean_note(note);
  select k.price_kobo into campaign_price from public.campaigns k where k.id = a.campaign_id;

  update public.applications x
     set proposed_price_kobo = case when proposed_price_kobo = campaign_price then null else proposed_price_kobo end,
         note = cleaned,
         updated_at = now()
   where x.id = a.id;
end;
$$;

create function public.withdraw_application(application uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  a public.applications;
begin
  select * into a from public.applications x where x.id = application and x.creator_id = me for update;
  if a.id is null then
    raise exception 'no_such_application' using errcode = 'P0001';
  end if;
  if a.status not in ('submitted', 'shortlisted') then
    raise exception 'application_locked' using errcode = 'P0001';
  end if;
  update public.applications x set status = 'withdrawn', updated_at = now() where x.id = a.id;
end;
$$;

-- Businesses ------------------------------------------------------------------------------------------

-- Shortlist or reject (with an optional note the creator sees). Neither
-- starts anything new, so standing doesn't stop them.
create function public.decide_application(application uuid, decision text, note text)
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
  if a.status not in ('submitted', 'shortlisted') then
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

-- Approves an application and creates the engagement, waiting 48 hours for
-- payment. Locks the campaign so two approvals can't take the last place.
create function public.approve_application(application uuid, expected_price_kobo bigint)
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
  if a.status not in ('submitted', 'shortlisted') then
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
  return engagement_id;
end;
$$;

-- Ends an approval before payment: nothing was paid, so no fee. Allowed
-- whatever the business's standing (it ends something, starts nothing).
create function public.cancel_engagement(engagement uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  e public.engagements;
begin
  select * into e from public.engagements x where x.id = engagement for update;
  if e.id is null or e.business_id is distinct from me then
    raise exception 'no_such_engagement' using errcode = 'P0001';
  end if;
  if e.status <> 'awaiting_payment' then
    raise exception 'engagement_locked' using errcode = 'P0001';
  end if;
  update public.engagements x
     set status = 'cancelled', cancelled_at = now(), cancel_reason = 'cancelled_by_business', updated_at = now()
   where x.id = e.id;
end;
$$;

-- Reading -------------------------------------------------------------------------------------------------

create function public.engagement_json(e public.engagements)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when e.id is null then null else jsonb_build_object(
    'id', e.id, 'status', e.status, 'agreed_price_kobo', e.agreed_price_kobo,
    'approved_at', e.approved_at, 'pay_by', e.pay_by,
    'cancelled_at', e.cancelled_at, 'cancel_reason', e.cancel_reason
  ) end
$$;

-- A campaign's applicants, with what the business needs to choose.
create function public.campaign_applications(campaign uuid)
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
             'engagement', public.engagement_json(e),
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
      left join public.engagements e on e.application_id = a.id
     where a.campaign_id = campaign
  );
end;
$$;

-- A creator's applications, newest first.
create function public.my_applications()
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
             'engagement', public.engagement_json(e),
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
      left join public.engagements e on e.application_id = a.id
     where a.creator_id = me
  );
end;
$$;

-- Application counts for the caller's campaigns (total, and still to decide).
create function public.campaign_application_counts()
returns table (campaign_id uuid, total integer, waiting integer)
language sql
stable
security definer
set search_path = ''
as $$
  select k.id,
         count(a.id)::integer,
         (count(a.id) filter (where a.status in ('submitted', 'shortlisted')))::integer
    from public.campaigns k
    left join public.applications a on a.campaign_id = k.id
   where k.business_id = public.current_user_id()
   group by k.id
$$;

-- Changes to Stage 4 ----------------------------------------------------------------------------------------

-- Places can't drop below the creators already approved (the Stage 4
-- follow-up). Otherwise as before.
create or replace function public.campaigns_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
       select 1 from unnest(new.niches) as chosen (slug)
       where chosen.slug not in (select n.slug from public.niches n)
     )
     or cardinality(new.niches) <> (select count(distinct n) from unnest(new.niches) as n)
     or cardinality(new.states) <> (select count(distinct s) from unnest(new.states) as s)
  then
    raise exception 'niches and states must be distinct entries from their lists'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();

    if new.places < old.places and new.places < public.held_places(new.id) then
      raise exception 'places_below_held' using errcode = 'P0001';
    end if;

    if old.status <> 'draft' then
      if (new.niches, new.states, new.verified_only, new.payment_model, new.price_kobo, new.post_from)
         is distinct from
         (old.niches, old.states, old.verified_only, old.payment_model, old.price_kobo, old.post_from)
      then
        raise exception 'price, requirements and posting dates are locked once a campaign is submitted'
          using errcode = '42501';
      end if;
      if new.applications_close_on < old.applications_close_on or new.deliver_by < old.deliver_by then
        raise exception 'deadlines can only move later once a campaign is submitted'
          using errcode = '42501';
      end if;
      -- Wording, deadlines and places change only while open or paused.
      if old.status not in ('open', 'paused')
         and (new.title, new.brief, new.guidelines, new.applications_close_on, new.deliver_by, new.places)
             is distinct from
             (old.title, old.brief, old.guidelines, old.applications_close_on, old.deliver_by, old.places)
      then
        raise exception 'a campaign can only be edited while it is a draft, open or paused'
          using errcode = '42501';
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- A suspended creator leaves the directory; their profile is unchanged.
create or replace view public.listed_creators
with (security_invoker = true) as
  select p.*
    from public.influencer_profiles p
   where p.published
     and p.hidden_at is null
     and exists (select 1 from public.influencer_platforms pl where pl.user_id = p.user_id)
     and not public.is_suspended(p.user_id);

-- Full campaigns and those of suspended businesses are no longer listed;
-- their status is unchanged.
create or replace function public.list_open_campaigns(
  niche_slug text default null,
  on_platform public.social_platform default null,
  qualified_only boolean default false,
  page_size integer default 24,
  page_offset integer default 0
)
returns table (campaign jsonb, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  viewer uuid := public.current_user_id();
begin
  if public.current_user_role() is distinct from 'influencer'
     and public.current_user_role() is distinct from 'admin' then
    raise exception 'campaigns are for signed-in creators' using errcode = '42501';
  end if;

  return query
    select cards.card, count(*) over ()
      from (
        select public.campaign_card(k, viewer) as card, k.published_at, k.id
          from public.campaigns k
         where k.status = 'open'
           and k.applications_close_on >= public.lagos_today()
           and public.held_places(k.id) < k.places
           and not public.is_suspended(k.business_id)
           and (niche_slug is null or cardinality(k.niches) = 0 or niche_slug = any (k.niches))
           and (on_platform is null or exists (
                 select 1 from public.campaign_platforms p
                  where p.campaign_id = k.id and p.platform = on_platform))
      ) cards
     where not qualified_only or cards.card -> 'problems' = '[]'::jsonb
     order by cards.published_at desc, cards.id
     limit least(greatest(page_size, 1), 50)
    offset greatest(page_offset, 0);
end;
$$;

create or replace function public.open_campaign_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.campaigns k
   where k.status = 'open'
     and k.applications_close_on >= public.lagos_today()
     and public.held_places(k.id) < k.places
     and not public.is_suspended(k.business_id)
$$;

-- The standing review, now with each suspended person's campaigns and
-- engagements (read-only: a suspension changes none of them).
create or replace function public.standing_review()
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
               ),
               'campaigns', (
                 select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'title', k.title, 'status', k.status)
                                           order by k.created_at desc), '[]'::jsonb)
                   from public.campaigns k
                  where k.business_id = u.id and k.status not in ('draft', 'closed', 'cancelled', 'completed')
               ),
               'engagements', (
                 select coalesce(jsonb_agg(jsonb_build_object(
                          'id', e.id, 'status', e.status, 'agreed_price_kobo', e.agreed_price_kobo,
                          'campaign_title', k.title)
                          order by e.approved_at desc), '[]'::jsonb)
                   from public.engagements e
                   join public.campaigns k on k.id = e.campaign_id
                  where (e.business_id = u.id or e.creator_id = u.id)
                    and e.status not in ('cancelled', 'refunded', 'paid_out')
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

-- Function grants ---------------------------------------------------------------------------------------------

-- held_places reveals only how many places are taken, and the campaigns
-- trigger (which runs as the caller) needs it.
revoke all on function public.held_places(uuid) from public, anon;
grant execute on function public.held_places(uuid) to authenticated;
revoke all on function public.valid_proposed_price(bigint) from public, anon, authenticated;
revoke all on function public.clean_note(text) from public, anon, authenticated;
revoke all on function public.engagement_json(public.engagements) from public, anon, authenticated;

-- The hourly job runs as the service role (src/app/api/cron/expire-engagements).
revoke all on function public.expire_unpaid_engagements(uuid) from public, anon, authenticated;
grant execute on function public.expire_unpaid_engagements(uuid) to service_role;

revoke all on function public.apply_to_campaign(uuid, bigint, text) from public, anon;
revoke all on function public.edit_application(uuid, bigint, text) from public, anon;
revoke all on function public.withdraw_application(uuid) from public, anon;
revoke all on function public.decide_application(uuid, text, text) from public, anon;
revoke all on function public.approve_application(uuid, bigint) from public, anon;
revoke all on function public.cancel_engagement(uuid) from public, anon;
revoke all on function public.campaign_applications(uuid) from public, anon;
revoke all on function public.my_applications() from public, anon;
revoke all on function public.campaign_application_counts() from public, anon;

grant execute on function public.apply_to_campaign(uuid, bigint, text) to authenticated;
grant execute on function public.edit_application(uuid, bigint, text) to authenticated;
grant execute on function public.withdraw_application(uuid) to authenticated;
grant execute on function public.decide_application(uuid, text, text) to authenticated;
grant execute on function public.approve_application(uuid, bigint) to authenticated;
grant execute on function public.cancel_engagement(uuid) to authenticated;
grant execute on function public.campaign_applications(uuid) to authenticated;
grant execute on function public.my_applications() to authenticated;
grant execute on function public.campaign_application_counts() to authenticated;

-- Table grants and row level security ----------------------------------------------------------------------------

alter table public.applications enable row level security;
alter table public.engagements enable row level security;

revoke all on table public.applications from anon, authenticated;
revoke all on table public.engagements from anon, authenticated;
grant select on table public.applications to authenticated;
grant select on table public.engagements to authenticated;

create policy "Applications: the creator, the campaign owner, admins"
  on public.applications for select to authenticated
  using (
    creator_id = (select public.current_user_id())
    or exists (
      select 1 from public.campaigns k
       where k.id = campaign_id and k.business_id = (select public.current_user_id())
    )
    or (select public.current_user_role()) = 'admin'
  );

create policy "Engagements: both sides, admins"
  on public.engagements for select to authenticated
  using (
    creator_id = (select public.current_user_id())
    or business_id = (select public.current_user_id())
    or (select public.current_user_role()) = 'admin'
  );
