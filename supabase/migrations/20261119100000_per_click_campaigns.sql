-- Pay-per-click campaign terms (docs/superpowers/specs/2026-11-18-pay-per-click-design.md §5, §6).
--
-- Invariants protected here:
--   1. A per-click campaign has a cost per click of at least ₦50 in whole naira,
--      a budget per place (price_kobo) of at least ₦5,000 that is a whole number
--      of clicks, and an https destination. A fixed-price campaign has none of
--      the per-click terms.
--   2. Once submitted, the cost per click, destination, UTM setting and blocked
--      channels are locked, like the price and requirements already are.
--   3. Every per-click campaign waits for an admin, trusted business or not, so
--      an admin can check that the destination belongs to the business.
--   4. Creators can't propose a price on a per-click campaign: the cost per
--      click and the cap are the terms.
--   5. Creators see only the destination's host; the owner and admins see it all.
--
-- Nothing here moves money; per-click hires settle in Part 2.

alter table public.campaigns
  add column cpc_kobo bigint,
  add column destination_url text,
  add column utm_tags boolean not null default true,
  add column blocked_channels text[] not null default '{}';

-- Check constraints can't hold subqueries, so the "no repeats" test lives here.
create function public.all_distinct(items text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select count(*) = count(distinct x) from unnest(items) as x
$$;

alter table public.campaigns
  add constraint campaigns_per_click_check check (
    payment_model <> 'per_click' or (
      cpc_kobo is not null and cpc_kobo >= 5000 and cpc_kobo % 100 = 0
      and price_kobo is not null and price_kobo between 500000 and 10000000000
      and price_kobo % cpc_kobo = 0
      and destination_url is not null
      and destination_url ~ '^https://[^/?#]+'
      and char_length(destination_url) <= 2000
    )
  ),
  add constraint campaigns_fixed_terms_check check (
    payment_model <> 'fixed' or (cpc_kobo is null and destination_url is null and blocked_channels = '{}')
  ),
  add constraint campaigns_blocked_channels_check check (
    blocked_channels <@ array['whatsapp', 'telegram', 'facebook', 'instagram', 'tiktok', 'x', 'youtube', 'snapchat']
    and public.all_distinct(blocked_channels)
  );

-- The destination's host, which is all a creator is shown.
create function public.destination_host(url text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(substring(url from '^https://(?:[^@/?#]*@)?([^:/?#]+)'))
$$;

-- Edit locks: the latest version (create_applications) plus the per-click terms.
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
      if (new.niches, new.states, new.verified_only, new.payment_model, new.price_kobo, new.post_from,
          new.cpc_kobo, new.destination_url, new.utm_tags, new.blocked_channels)
         is distinct from
         (old.niches, old.states, old.verified_only, old.payment_model, old.price_kobo, old.post_from,
          old.cpc_kobo, old.destination_url, old.utm_tags, old.blocked_channels)
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

-- Saving a draft gains the payment model and the per-click terms.
drop function public.save_campaign_draft(uuid, text, text, text, text[], text[], boolean, bigint, integer, date, date, date, jsonb, jsonb);

create function public.save_campaign_draft(
  campaign_id uuid,
  title text,
  brief text,
  guidelines text,
  niches text[],
  states text[],
  verified_only boolean,
  price_kobo bigint,
  places integer,
  applications_close_on date,
  post_from date,
  deliver_by date,
  platforms jsonb,
  deliverables jsonb,
  payment_model public.payment_model,
  cpc_kobo bigint,
  destination_url text,
  utm_tags boolean,
  blocked_channels text[]
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
#variable_conflict use_variable
declare
  saved_id uuid := campaign_id;
begin
  if saved_id is null then
    insert into public.campaigns as c (
      business_id, title, brief, guidelines, niches, states, verified_only,
      price_kobo, places, applications_close_on, post_from, deliver_by,
      payment_model, cpc_kobo, destination_url, utm_tags, blocked_channels
    )
    values (
      public.current_user_id(), title, brief, guidelines, niches,
      states::public.nigerian_state[], verified_only, price_kobo, places,
      applications_close_on, post_from, deliver_by,
      payment_model, cpc_kobo, destination_url, utm_tags, blocked_channels
    )
    returning c.id into saved_id;
  else
    update public.campaigns c
       set title = save_campaign_draft.title,
           brief = save_campaign_draft.brief,
           guidelines = save_campaign_draft.guidelines,
           niches = save_campaign_draft.niches,
           states = save_campaign_draft.states::public.nigerian_state[],
           verified_only = save_campaign_draft.verified_only,
           price_kobo = save_campaign_draft.price_kobo,
           places = save_campaign_draft.places,
           applications_close_on = save_campaign_draft.applications_close_on,
           post_from = save_campaign_draft.post_from,
           deliver_by = save_campaign_draft.deliver_by,
           payment_model = save_campaign_draft.payment_model,
           cpc_kobo = save_campaign_draft.cpc_kobo,
           destination_url = save_campaign_draft.destination_url,
           utm_tags = save_campaign_draft.utm_tags,
           blocked_channels = save_campaign_draft.blocked_channels
     where c.id = saved_id and c.status = 'draft';
    if not found then
      raise exception 'no draft campaign with that id' using errcode = 'P0002';
    end if;
    delete from public.campaign_platforms cp where cp.campaign_id = saved_id;
  end if;

  insert into public.campaign_platforms (campaign_id, platform, min_followers)
  select saved_id, p.platform, p.min_followers
    from jsonb_to_recordset(platforms)
      as p (platform public.social_platform, min_followers public.follower_range);

  insert into public.campaign_deliverables (campaign_id, position, platform, kind, quantity)
  select saved_id, d.position, d.platform, d.kind, d.quantity
    from rows from (
           jsonb_to_recordset(deliverables)
             as (platform public.social_platform, kind public.deliverable_kind, quantity smallint)
         ) with ordinality as d (platform, kind, quantity, position);

  return saved_id;
end;
$$;

revoke all on function public.save_campaign_draft(uuid, text, text, text, text[], text[], boolean, bigint, integer, date, date, date, jsonb, jsonb, public.payment_model, bigint, text, boolean, text[]) from public, anon;
grant execute on function public.save_campaign_draft(uuid, text, text, text, text[], text[], boolean, bigint, integer, date, date, date, jsonb, jsonb, public.payment_model, bigint, text, boolean, text[]) to authenticated;

-- Status changes: per-click campaigns can be submitted, and always wait for an
-- admin. Otherwise unchanged from create_campaigns.
create or replace function public.transition_campaign(
  campaign_id uuid,
  action text,
  note text default null
)
returns public.campaign_status
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  caller uuid := public.current_user_id();
  caller_role public.user_role := public.current_user_role();
  c public.campaigns;
  clean_note text := nullif(btrim(note), '');
  new_status public.campaign_status;
begin
  select * into c from public.campaigns k where k.id = campaign_id for update;
  if c.id is null then
    raise exception 'no such campaign' using errcode = 'P0002';
  end if;

  if action in ('submit', 'withdraw', 'pause', 'resume', 'close') then
    if caller is null or c.business_id <> caller then
      raise exception 'only the business that owns this campaign can do that' using errcode = '42501';
    end if;
  elsif action in ('approve', 'reject', 'take_down') then
    if caller_role is distinct from 'admin' then
      raise exception 'only admins can do that' using errcode = '42501';
    end if;
  else
    raise exception 'unknown action %', action using errcode = '22023';
  end if;

  case action
    when 'submit' then
      if c.status <> 'draft' then
        raise exception 'only drafts can be submitted' using errcode = '55000';
      end if;
      if c.applications_close_on < public.lagos_today() then
        raise exception 'the application deadline has passed' using errcode = '22023';
      end if;
      if not exists (select 1 from public.campaign_deliverables d where d.campaign_id = c.id)
         or exists (
           select 1 from public.campaign_platforms p
            where p.campaign_id = c.id
              and not exists (
                select 1 from public.campaign_deliverables d
                 where d.campaign_id = c.id and d.platform = p.platform
              )
         )
      then
        raise exception 'every platform needs at least one deliverable' using errcode = '22023';
      end if;
      -- A business is trusted once an admin has approved one of its campaigns.
      -- Per-click campaigns always wait: an admin checks the destination is the
      -- business's own (a stand-in for domain verification).
      if c.payment_model = 'fixed' and exists (
        select 1 from public.campaigns k
         where k.business_id = c.business_id and k.approved_at is not null
      ) then
        new_status := 'open';
      else
        new_status := 'pending_review';
      end if;
      update public.campaigns k
         set status = new_status,
             submitted_at = now(),
             published_at = case when new_status = 'open' then coalesce(k.published_at, now()) else k.published_at end,
             review_note = null
       where k.id = c.id;

    when 'withdraw' then
      if c.status <> 'pending_review' then
        raise exception 'only campaigns waiting for review can be withdrawn' using errcode = '55000';
      end if;
      new_status := 'draft';
      update public.campaigns k set status = new_status where k.id = c.id;

    when 'approve' then
      if c.status <> 'pending_review' then
        raise exception 'this campaign is not waiting for review' using errcode = '55000';
      end if;
      if c.applications_close_on < public.lagos_today() then
        raise exception 'the application deadline has passed; send it back instead' using errcode = '22023';
      end if;
      new_status := 'open';
      update public.campaigns k
         set status = new_status, approved_at = now(), approved_by = caller,
             published_at = coalesce(k.published_at, now())
       where k.id = c.id;

    when 'reject' then
      if c.status <> 'pending_review' then
        raise exception 'this campaign is not waiting for review' using errcode = '55000';
      end if;
      if clean_note is null then
        raise exception 'say why it is being sent back' using errcode = '22023';
      end if;
      new_status := 'draft';
      update public.campaigns k set status = new_status, review_note = clean_note where k.id = c.id;

    when 'pause' then
      if c.status <> 'open' then
        raise exception 'only open campaigns can be paused' using errcode = '55000';
      end if;
      new_status := 'paused';
      update public.campaigns k set status = new_status where k.id = c.id;

    when 'resume' then
      if c.status <> 'paused' then
        raise exception 'only paused campaigns can be resumed' using errcode = '55000';
      end if;
      if c.applications_close_on < public.lagos_today() then
        raise exception 'the application deadline has passed; extend it first' using errcode = '22023';
      end if;
      new_status := 'open';
      update public.campaigns k set status = new_status where k.id = c.id;

    when 'close' then
      if c.status not in ('open', 'paused') then
        raise exception 'only open or paused campaigns can be closed' using errcode = '55000';
      end if;
      new_status := 'closed';
      update public.campaigns k set status = new_status, closed_at = now() where k.id = c.id;

    when 'take_down' then
      if c.status not in ('pending_review', 'open', 'paused') then
        raise exception 'this campaign is not live' using errcode = '55000';
      end if;
      if clean_note is null then
        raise exception 'give a reason the business will see' using errcode = '22023';
      end if;
      new_status := 'closed';
      update public.campaigns k
         set status = new_status, closed_at = now(), removed_reason = clean_note
       where k.id = c.id;
  end case;

  return new_status;
end;
$$;

-- No proposed price on a per-click campaign. A trigger covers both
-- apply_to_campaign() and edit_application(), which store a price equal to the
-- campaign's as null, so only a different price reaches here.
create function public.applications_per_click_price()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.proposed_price_kobo is not null and exists (
    select 1 from public.campaigns k where k.id = new.campaign_id and k.payment_model = 'per_click'
  ) then
    raise exception 'price_fixed_per_click' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger applications_per_click_price
  before insert or update of proposed_price_kobo on public.applications
  for each row execute function public.applications_per_click_price();

-- The campaign card gains the per-click terms; creators get only the host.
create or replace function public.campaign_card(k public.campaigns, viewer uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', k.id,
    'title', k.title,
    'status', k.status,
    'business_name', b.business_name,
    'business_city', b.city,
    'business_state', b.state,
    'niches', k.niches,
    'states', k.states,
    'verified_only', k.verified_only,
    'payment_model', k.payment_model,
    'price_kobo', k.price_kobo,
    'cpc_kobo', k.cpc_kobo,
    'destination_host', public.destination_host(k.destination_url),
    'utm_tags', k.utm_tags,
    'blocked_channels', to_jsonb(k.blocked_channels),
    'places', k.places,
    'places_taken', public.held_places(k.id),
    'applications_close_on', k.applications_close_on,
    'post_from', k.post_from,
    'deliver_by', k.deliver_by,
    'published_at', k.published_at,
    'platforms', (
      select coalesce(jsonb_agg(jsonb_build_object('platform', p.platform, 'min_followers', p.min_followers)
                                order by p.platform), '[]'::jsonb)
        from public.campaign_platforms p where p.campaign_id = k.id
    ),
    'deliverables', (
      select coalesce(jsonb_agg(jsonb_build_object('platform', d.platform, 'kind', d.kind, 'quantity', d.quantity)
                                order by d.position), '[]'::jsonb)
        from public.campaign_deliverables d where d.campaign_id = k.id
    ),
    'problems', case
      when public.current_user_role() = 'influencer' then public.campaign_problems(k.id, viewer)
      else '[]'::jsonb
    end
  )
  from public.business_profiles b
  where b.user_id = k.business_id
$$;

-- An admin also sees the full destination, to check it during review.
create or replace function public.get_campaign(campaign uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  viewer_role public.user_role := public.current_user_role();
  k public.campaigns;
begin
  select * into k from public.campaigns c where c.id = campaign;
  if k.id is null
     or not (
       viewer_role = 'admin'
       or (viewer_role = 'influencer' and k.status = 'open' and k.applications_close_on >= public.lagos_today())
     )
  then
    return null;
  end if;

  return public.campaign_card(k, public.current_user_id()) || jsonb_build_object(
    'brief', k.brief,
    'guidelines', k.guidelines,
    'removed_reason', k.removed_reason,
    -- Only edits made while live: creators never saw earlier versions.
    'revised_at', (
      select max(r.created_at) from public.campaign_revisions r
       where r.campaign_id = k.id and r.while_live
    )
  ) || case
    when viewer_role = 'admin' then jsonb_build_object('destination_url', k.destination_url)
    else '{}'::jsonb
  end;
end;
$$;
