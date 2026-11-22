-- Creators propose their own cost per click (pay per click, phase 2).
-- Design: docs/superpowers/specs/2026-11-22-per-click-creator-rates-design.md.
-- This reverses the Stage 4 rule that creators can't counter a per-click rate;
-- the business still sets the rate and the budget, and still chooses who to hire.
--
-- Invariants protected here:
--   1. A proposed rate exists only on a per-click campaign, is whole naira of
--      at least ₦50, and fits the campaign's budget in whole clicks (the same
--      rule the campaign's own rate follows), so a hire's cap is always a whole
--      number of clicks and the budget stays the most anyone can spend.
--   2. A hire's rate is frozen when the business approves: the creator's
--      proposal if they made one, else the campaign's rate. It lives on the
--      engagement (cpc_kobo) and never changes afterwards.
--   3. Everything that counts, caps or pays clicks reads the hire's rate, not
--      the campaign's: record_click, the click summaries, the daily settle,
--      an admin's release. Two hires on one campaign can have different rates.
--   4. The business approves a per-click hire at a rate it saw: if the creator
--      changed their rate since, approve_application_at_rate() refuses
--      (rate_changed), the way approve_application() refuses a changed price.
--      Money functions keep the lock order users, engagement, link; the new
--      approve function takes the campaign, then the application, like
--      approve_application() does.
--
-- apply_to_campaign() and approve_application() are not redefined here: other
-- work adds identity checks to both, and redefining them would drop those. A
-- creator sets the rate with set_application_rate() right after applying (or
-- later, while the application is undecided); a business hires a per-click
-- creator through approve_application_at_rate(), which calls
-- approve_application() unchanged. The trigger on engagements stores the rate.
--
-- Nothing here moves money by itself; settlement reads the stored rate.

-- Columns ----------------------------------------------------------------------------------

alter table public.applications
  add column proposed_cpc_kobo bigint,
  add constraint applications_cpc_check check (
    proposed_cpc_kobo is null
    or (proposed_cpc_kobo >= 5000 and proposed_cpc_kobo % 100 = 0)
  );

alter table public.engagements
  add column cpc_kobo bigint;

-- Every existing per-click hire was agreed at its campaign's rate.
update public.engagements e
   set cpc_kobo = k.cpc_kobo
  from public.campaigns k
 where k.id = e.campaign_id and k.payment_model = 'per_click';

alter table public.engagements
  add constraint engagements_cpc_check check (
    cpc_kobo is null
    or (cpc_kobo >= 5000 and cpc_kobo % 100 = 0 and agreed_price_kobo % cpc_kobo = 0)
  );

-- The hire's two people read it under RLS, like the other columns of the row.
grant select (cpc_kobo) on public.engagements to authenticated;

-- A proposed rate must belong to a per-click campaign and fit its budget -----------------

create function public.applications_proposed_rate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  k public.campaigns;
begin
  if new.proposed_cpc_kobo is null then
    return new;
  end if;
  select * into k from public.campaigns c where c.id = new.campaign_id;
  if k.payment_model is distinct from 'per_click' then
    raise exception 'rate_per_click_only' using errcode = 'P0001';
  end if;
  if k.price_kobo % new.proposed_cpc_kobo <> 0 then
    raise exception 'rate_invalid' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger applications_proposed_rate
  before insert or update of proposed_cpc_kobo on public.applications
  for each row execute function public.applications_proposed_rate();

-- A hire's rate is frozen when it is created ---------------------------------------------

create function public.engagements_set_rate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  k public.campaigns;
  proposed bigint;
begin
  select * into k from public.campaigns c where c.id = new.campaign_id;
  if k.payment_model = 'per_click' then
    select a.proposed_cpc_kobo into proposed from public.applications a where a.id = new.application_id;
    new.cpc_kobo := coalesce(proposed, k.cpc_kobo);
  else
    new.cpc_kobo := null;
  end if;
  return new;
end;
$$;

create trigger engagements_set_rate
  before insert on public.engagements
  for each row execute function public.engagements_set_rate();

-- The creator sets (or clears) their rate --------------------------------------------------
-- Null, or the campaign's own rate, means "accept the business's rate" and is
-- stored as null, so only a real counter-offer reads as one.

create function public.set_application_rate(application uuid, rate_kobo bigint)
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
  k public.campaigns;
begin
  if me is null or public.current_user_role() is distinct from 'influencer' then
    raise exception 'creators propose rates' using errcode = '42501';
  end if;
  perform public.check_standing(me);

  select * into a from public.applications x where x.id = application and x.creator_id = me for update;
  if a.id is null then
    raise exception 'no_such_application' using errcode = 'P0001';
  end if;
  if a.status not in ('submitted', 'shortlisted') then
    raise exception 'application_locked' using errcode = 'P0001';
  end if;
  select * into k from public.campaigns c where c.id = a.campaign_id;
  if k.payment_model is distinct from 'per_click' then
    raise exception 'rate_per_click_only' using errcode = 'P0001';
  end if;
  if rate_kobo is not null and (rate_kobo < 5000 or rate_kobo % 100 <> 0) then
    raise exception 'rate_invalid' using errcode = 'P0001';
  end if;

  update public.applications x
     set proposed_cpc_kobo = case when rate_kobo = k.cpc_kobo then null else rate_kobo end,
         updated_at = now()
   where x.id = a.id;
end;
$$;

-- The business hires a per-click creator at a rate it saw ---------------------------------

create function public.approve_application_at_rate(
  application uuid, expected_price_kobo bigint, expected_cpc_kobo bigint)
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
begin
  if me is null or public.current_user_role() is distinct from 'business' then
    raise exception 'businesses approve applications' using errcode = '42501';
  end if;

  select * into a from public.applications x where x.id = application;
  if a.id is null then
    raise exception 'no_such_application' using errcode = 'P0001';
  end if;
  -- The same lock order as approve_application(): the campaign, then the
  -- application, read again under the lock because its rate may just have changed.
  select * into k from public.campaigns c where c.id = a.campaign_id for update;
  if k.business_id is distinct from me then
    raise exception 'no_such_application' using errcode = 'P0001';
  end if;
  if k.payment_model is distinct from 'per_click' then
    raise exception 'rate_per_click_only' using errcode = 'P0001';
  end if;
  select * into a from public.applications x where x.id = application for update;

  if coalesce(a.proposed_cpc_kobo, k.cpc_kobo) is distinct from expected_cpc_kobo then
    raise exception 'rate_changed' using errcode = 'P0001';
  end if;
  return public.approve_application(application, expected_price_kobo);
end;
$$;

revoke all on function public.applications_proposed_rate() from public, anon, authenticated;
revoke all on function public.engagements_set_rate() from public, anon, authenticated;
revoke all on function public.set_application_rate(uuid, bigint) from public, anon;
grant execute on function public.set_application_rate(uuid, bigint) to authenticated;
revoke all on function public.approve_application_at_rate(uuid, bigint, bigint) from public, anon;
grant execute on function public.approve_application_at_rate(uuid, bigint, bigint) to authenticated;

-- What a creator and a business read: applications carry the rate ---------------------------

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
             'proposed_cpc_kobo', a.proposed_cpc_kobo,
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
             'proposed_cpc_kobo', a.proposed_cpc_kobo,
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
               'payment_model', k.payment_model,
               'cpc_kobo', k.cpc_kobo,
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

-- Every read of a hire goes through engagement_json() (20261114100100); it now
-- also carries the hire's rate (null on a fixed-price hire).
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
    'cpc_kobo', e.cpc_kobo,
    'approved_at', e.approved_at, 'pay_by', e.pay_by,
    'cancelled_at', case when public.engagement_lapsed(e) then e.pay_by else e.cancelled_at end,
    'cancel_reason', case when public.engagement_lapsed(e) then 'payment_expired' else e.cancel_reason end,
    'funded_at', e.funded_at, 'started_at', e.started_at, 'settled_at', e.settled_at,
    'settle_outcome', e.settle_outcome, 'released_kobo', e.released_kobo,
    'refunded_kobo', e.refunded_kobo, 'business_fee_kobo', e.business_fee_kobo,
    'creator_fee_bps', e.creator_fee_bps, 'creator_min_fee_kobo', e.creator_min_fee_kobo
  ) end
$$;

-- Clicks, caps and settlement read the hire's rate -----------------------------------------
-- Each body below is the latest one with the campaign's rate (k.cpc_kobo)
-- replaced by the hire's (e.cpc_kobo) and, where it read the campaign's budget,
-- the hire's agreed price. Nothing else changes.

-- (20261121100100_click_days.sql) The link's own numbers.
create or replace function public.link_summary(link public.tracked_links, k public.campaigns)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'code', link.code,
    'billable', link.billable_clicks,
    'totalHits', link.total_hits,
    'cpcKobo', e.cpc_kobo,
    'capKobo', e.agreed_price_kobo,
    'earnedKobo', least(link.billable_clicks::bigint * e.cpc_kobo, e.agreed_price_kobo),
    'blockedChannels', to_jsonb(k.blocked_channels),
    'filtered', (
      select coalesce(jsonb_object_agg(r.filter_reason, r.n), '{}'::jsonb)
        from (select l.filter_reason, count(*) as n from public.link_clicks l
               where l.link_id = link.id and not l.is_billable group by l.filter_reason) r
    ),
    'sources', (
      select coalesce(jsonb_object_agg(s.source, s.n), '{}'::jsonb)
        from (select l.source, count(*) as n from public.link_clicks l
               where l.link_id = link.id group by l.source) s
    ),
    'days', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'billable', d.billable, 'hits', d.hits)
                                order by d.day), '[]'::jsonb)
        from (select (l.created_at at time zone 'Africa/Lagos')::date as day,
                     count(*) filter (where l.is_billable) as billable, count(*) as hits
                from public.link_clicks l where l.link_id = link.id group by 1) d
    ),
    'blockedShares', (
      select coalesce(jsonb_agg(distinct l.source), '[]'::jsonb)
        from public.link_clicks l
       where l.link_id = link.id and l.filter_reason = 'preview'
         and l.source = any (k.blocked_channels)
    )
  )
  from public.engagements e
  where e.id = link.engagement_id
$$;

-- (20261121100300_click_summary_truth.sql)
create or replace function public.engagement_click_summary(engagement uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  e public.engagements;
  link public.tracked_links;
  k public.campaigns;
  timing jsonb;
begin
  select * into e from public.engagements g where g.id = engagement;
  if e.id is null
     or not (me in (e.creator_id, e.business_id) or public.current_user_role() = 'admin') then
    return null;
  end if;
  select * into k from public.campaigns c where c.id = e.campaign_id;
  if k.payment_model <> 'per_click' then
    return null;
  end if;
  timing := jsonb_build_object(
    'clicksEndAt', public.click_window_end(k.deliver_by),
    'settlesAt', public.click_settles_at(k.deliver_by),
    'clicksStoppedAt', e.clicks_stopped_at,
    'creatorFeeBps', e.creator_fee_bps,
    'creatorMinFeeKobo', e.creator_min_fee_kobo,
    'settledAt', e.settled_at,
    'releasedKobo', e.released_kobo);
  select * into link from public.tracked_links t where t.engagement_id = e.id;
  if link.id is null then
    return jsonb_build_object('code', null, 'cpcKobo', e.cpc_kobo, 'capKobo', e.agreed_price_kobo,
                              'blockedChannels', to_jsonb(k.blocked_channels)) || timing;
  end if;
  return public.link_summary(link, k) || timing;
end;
$$;

-- (20261121100300_click_summary_truth.sql)
create or replace function public.campaign_click_summary(campaign uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  k public.campaigns;
begin
  select * into k from public.campaigns c where c.id = campaign;
  if k.id is null or k.payment_model <> 'per_click'
     or not (public.current_user_id() = k.business_id or public.current_user_role() = 'admin') then
    return null;
  end if;
  return (
    select jsonb_build_object(
      'totals', jsonb_build_object(
        'billable', coalesce(sum(coalesce(t.billable_clicks, 0)), 0),
        'totalHits', coalesce(sum(coalesce(t.total_hits, 0)), 0),
        -- Released for a settled hire; what its clicks are worth while it runs.
        'spentKobo', coalesce(sum(case when e.settled_at is not null then coalesce(e.released_kobo, 0) else least(coalesce(t.billable_clicks, 0)::bigint * e.cpc_kobo, e.agreed_price_kobo) end), 0),
        -- What paid hires can still earn: not settled, not withdrawn.
        'budgetLeftKobo', coalesce(sum(case when e.settled_at is null and e.clicks_stopped_at is null
          then e.agreed_price_kobo - least(coalesce(t.billable_clicks, 0)::bigint * e.cpc_kobo, e.agreed_price_kobo)
          else 0 end), 0),
        'sources', (
          select coalesce(jsonb_object_agg(s.source, s.n), '{}'::jsonb)
            from (select l.source, count(*) as n from public.link_clicks l
                    join public.tracked_links x on x.id = l.link_id
                   where x.campaign_id = k.id group by l.source) s
        )
      ),
      'days', (
        select coalesce(jsonb_agg(jsonb_build_object('day', d.day, 'billable', d.billable, 'hits', d.hits)
                                  order by d.day), '[]'::jsonb)
          from (select (l.created_at at time zone 'Africa/Lagos')::date as day,
                       count(*) filter (where l.is_billable) as billable, count(*) as hits
                  from public.link_clicks l
                  join public.tracked_links x on x.id = l.link_id
                 where x.campaign_id = k.id group by 1) d
      ),
      'hires', coalesce(jsonb_agg(
        (case when t.id is null then jsonb_build_object(
            'code', null, 'billable', 0, 'totalHits', 0, 'cpcKobo', e.cpc_kobo, 'capKobo', e.agreed_price_kobo,
            'earnedKobo', 0, 'blockedChannels', to_jsonb(k.blocked_channels), 'filtered', '{}'::jsonb,
            'sources', '{}'::jsonb, 'days', '[]'::jsonb, 'blockedShares', '[]'::jsonb)
          else public.link_summary(t, k) end)
        || jsonb_build_object(
          'engagementId', e.id,
          'creatorName', (select p.display_name from public.influencer_profiles p where p.user_id = e.creator_id),
          'proofCount', (select count(*) from public.click_proofs c where c.engagement_id = e.id),
          'spentKobo', case when e.settled_at is not null then coalesce(e.released_kobo, 0) else least(coalesce(t.billable_clicks, 0)::bigint * e.cpc_kobo, e.agreed_price_kobo) end,
          'settledAt', e.settled_at,
          'releasedKobo', e.released_kobo,
          'refundedKobo', e.refunded_kobo,
          'stopped', e.clicks_stopped_at is not null,
          'status', e.status)
        order by e.funded_at, e.id), '[]'::jsonb)
    )
    from public.engagements e
    left join public.tracked_links t on t.engagement_id = e.id
   where e.campaign_id = k.id and e.funded_at is not null
  );
end;
$$;

-- (20261120100200_click_hire_actions.sql) The cap and the counting.
create or replace function public.record_click(
  code text, visitor_hash text, ua_hash text, referrer_host text, source text, client_class text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  hire uuid;
  e public.engagements;
  link public.tracked_links;
  k public.campaigns;
  cap bigint;
  reason text;
begin
  select t.engagement_id into hire from public.tracked_links t where t.code = code;
  if hire is null then
    return null;
  end if;
  select * into e from public.engagements g where g.id = hire for share;
  select * into link from public.tracked_links t where t.code = code for update;
  select * into k from public.campaigns c where c.id = link.campaign_id;
  cap := e.agreed_price_kobo / e.cpc_kobo;

  reason := case
    when client_class = 'preview' then 'preview'
    when client_class <> 'human' then 'bot'
    when source = any (k.blocked_channels) then 'blocked_channel'
    when e.status <> 'in_progress' or e.clicks_stopped_at is not null then 'hire_ended'
    when not public.click_window_open(k.deliver_by, now()) then 'window_closed'
    when link.billable_clicks >= cap then 'cap_reached'
    when exists (
      select 1 from public.link_clicks l
       where l.link_id = link.id and l.visitor_hash = visitor_hash and l.is_billable
         and l.created_at > now() - interval '24 hours'
    ) then 'repeat'
    when (
      select count(*) from public.link_clicks l
       where l.visitor_hash = visitor_hash and l.created_at > now() - interval '60 seconds'
    ) >= 20 then 'rate_limited'
  end;

  insert into public.link_clicks (link_id, visitor_hash, ua_hash, referrer_host, source, is_billable, filter_reason)
  values (link.id, visitor_hash, ua_hash, left(referrer_host, 255),
          case when source in ('whatsapp', 'telegram', 'facebook', 'instagram', 'tiktok', 'x', 'youtube',
                               'snapchat', 'other_site') then source else 'unknown' end,
          reason is null, reason);

  update public.tracked_links t
     set total_hits = t.total_hits + 1,
         billable_clicks = t.billable_clicks + (case when reason is null then 1 else 0 end)
   where t.id = link.id;

  if reason is null and link.billable_clicks + 1 = cap then
    perform public.notify(e.creator_id, 'click_cap_reached', jsonb_build_object(
        'engagement_id', e.id,
        'campaign_title', k.title,
        'cap', cap,
        'earned_kobo', e.agreed_price_kobo),
      'click_cap:' || e.id);
  end if;

  return jsonb_build_object(
    'destination', k.destination_url,
    'utmTags', k.utm_tags,
    'campaignId', k.id,
    'billable', reason is null,
    'reason', reason
  );
end;
$$;

-- (20261120100100_click_settlement.sql) What a settled hire releases.
create or replace function public.settle_click_hire(engagement uuid, actor uuid, reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  business uuid;
  e public.engagements;
  k public.campaigns;
  link public.tracked_links;
  released bigint;
begin
  select g.business_id into business from public.engagements g where g.id = engagement;
  perform 1 from public.users u where u.id = business for no key update;
  select * into e from public.engagements x where x.id = engagement for update;
  if e.id is null then
    raise exception 'no_such_engagement' using errcode = 'P0001';
  end if;
  select * into link from public.tracked_links t where t.engagement_id = e.id for update;
  if e.settled_at is not null or e.status not in ('funded', 'in_progress') then
    return false;
  end if;
  select * into k from public.campaigns c where c.id = e.campaign_id;
  if k.payment_model <> 'per_click' then
    raise exception 'not_per_click' using errcode = 'P0001';
  end if;

  released := least(coalesce(link.billable_clicks, 0)::bigint * e.cpc_kobo, e.agreed_price_kobo);
  perform public.settle_money(
    e.id,
    case when released = e.agreed_price_kobo then 'release' when released = 0 then 'refund' else 'split' end,
    released, false,
    case when released > 0 then 'accepted' else 'refunded' end::public.engagement_status,
    null, actor, reason);
  return true;
end;
$$;

-- (20261120100500_click_review_fixes.sql) The hold notice's earnings.
create or replace function public.settle_due_click_hires()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  claimed uuid;
  notified integer := 0;
  settled integer := 0;
  failed integer := 0;
begin
  -- 1. Tell both people, once, that the click window ended and when it settles.
  for r in
    select e.id, e.business_id, e.creator_id, k.title, k.deliver_by, e.cpc_kobo, e.agreed_price_kobo,
           coalesce(t.billable_clicks, 0) as billable
      from public.engagements e
      join public.campaigns k on k.id = e.campaign_id
      left join public.tracked_links t on t.engagement_id = e.id
     where k.payment_model = 'per_click'
       and e.status = 'in_progress' and e.settled_at is null
       and e.click_hold_notified_at is null
       and now() >= public.click_window_end(k.deliver_by)
     order by e.id
  loop
    -- Same lock order as the money functions; the claim makes a second run skip it.
    perform 1 from public.users u where u.id = r.business_id for no key update;
    update public.engagements x set click_hold_notified_at = now()
     where x.id = r.id and x.click_hold_notified_at is null
    returning x.id into claimed;
    continue when claimed is null;
    perform public.notify(p, 'click_hold_started', jsonb_build_object(
        'engagement_id', r.id,
        'campaign_title', r.title,
        'settles_at', public.click_settles_at(r.deliver_by),
        'billable', r.billable,
        'earned_kobo', least(r.billable::bigint * r.cpc_kobo, r.agreed_price_kobo)),
      'click_hold:' || r.id)
      from unnest(array[r.creator_id, r.business_id]) as p;
    notified := notified + 2;
  end loop;

  -- 2. Settle each hire whose hold is over, one subtransaction each.
  for r in
    select e.id
      from public.engagements e
      join public.campaigns k on k.id = e.campaign_id
     where k.payment_model = 'per_click'
       and e.status in ('funded', 'in_progress') and e.settled_at is null
       and now() >= public.click_settles_at(k.deliver_by)
       -- A started hire settles only 72 hours after both people were told,
       -- so a late or missed run still leaves a full window to dispute.
       and (e.status = 'funded' or e.click_hold_notified_at <= now() - interval '72 hours')
     order by e.id
  loop
    begin
      if public.settle_click_hire(r.id, null, 'click_hold_ended') then
        settled := settled + 1;
      end if;
    exception when others then
      failed := failed + 1;
      raise warning 'settle_click_hire % failed: %', r.id, sqlstate;
    end;
  end loop;

  return jsonb_build_object('notified', notified, 'settled', settled, 'failed', failed);
end;
$$;

-- (20261120100500_click_review_fixes.sql) An admin's or a dispute's "release"
-- on a per-click hire pays what the counted clicks are worth at the hire's rate.
create or replace function public.settle_engagement_internal(
  engagement uuid, outcome text, release_kobo bigint, reason text, actor uuid,
  release_status public.engagement_status default 'accepted')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_reason text := btrim(reason);
  business uuid;
  e public.engagements;
  released bigint;
  final_outcome text := outcome;
begin
  if outcome is null or outcome not in ('release', 'refund', 'split', 'refund_creator_fault') then
    raise exception 'invalid_outcome' using errcode = '22023';
  end if;
  if clean_reason is null or clean_reason = '' or char_length(clean_reason) > 500 then
    raise exception 'settle_reason_required' using errcode = 'P0001';
  end if;

  select g.business_id into business from public.engagements g where g.id = engagement;
  perform 1 from public.users u where u.id = business for no key update;
  select * into e from public.engagements x where x.id = engagement for update;
  if e.id is null then
    raise exception 'no_such_engagement' using errcode = 'P0001';
  end if;

  -- Release amounts are checked before the no-op, so a bad call is always refused.
  released := case outcome when 'release' then e.agreed_price_kobo
                           when 'split' then release_kobo
                           else 0 end;
  if released is null or released < 0 or released > e.agreed_price_kobo or released % 100 <> 0
     or (outcome <> 'split' and release_kobo is not null and release_kobo <> released) then
    raise exception 'release_invalid' using errcode = 'P0001';
  end if;

  if e.settled_at is not null then
    return;
  end if;
  if e.status not in ('funded', 'in_progress', 'submitted', 'denied', 'disputed') then
    raise exception 'engagement_locked' using errcode = 'P0001';
  end if;

  -- A per-click hire is paid for its clicks: "release" releases what the
  -- counted clicks are worth, read under the link lock (users, engagement,
  -- then link, as everywhere), never the whole budget.
  if outcome = 'release' and exists (
    select 1 from public.campaigns k where k.id = e.campaign_id and k.payment_model = 'per_click'
  ) then
    select least(coalesce(t.billable_clicks, 0)::bigint * e.cpc_kobo, e.agreed_price_kobo) into released
      from public.campaigns k
      left join public.tracked_links t on t.engagement_id = e.id
     where k.id = e.campaign_id;
    perform 1 from public.tracked_links t where t.engagement_id = e.id for update;
    final_outcome := case when released = e.agreed_price_kobo then 'release'
                          when released = 0 then 'refund' else 'split' end;
  end if;

  if outcome = 'split' and released = e.agreed_price_kobo then
    final_outcome := 'release';
  elsif outcome = 'split' and released = 0 then
    final_outcome := 'refund';
  end if;

  perform public.settle_money(e.id, final_outcome, released, final_outcome = 'refund_creator_fault',
    case when released > 0 then release_status else 'refunded' end,
    null, actor, clean_reason);
end;
$$;
