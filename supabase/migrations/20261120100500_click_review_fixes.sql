-- Fixes from the Part 2 review (pay per click).
--
-- 1. A per-click hire is paid for its clicks, so "release" (an admin deciding
--    a dispute, or the escrow tool) releases what the counted clicks are worth,
--    not the whole budget. Refund, split and creator-at-fault are unchanged.
-- 2. The business hears when a per-click creator withdraws (clicks_stopped):
--    no money moves until the hold, so no settlement notice would tell them.
-- 3. The "clicks are in" notice goes only to hires that started; one that
--    never started has nothing to report and can't be disputed.
-- 4. A started hire settles only 72 hours after both people were told, so a
--    run that is late (or the first run after deploying) never notifies and
--    settles in one go, which would leave no time to dispute.
-- Each function is otherwise as in its previous version
-- (20261117100000, 20261120100100, 20261120100200).

create or replace function public.settle_engagement_internal(
  engagement uuid,
  outcome text,
  release_kobo bigint,
  reason text,
  actor uuid,
  release_status public.engagement_status default 'accepted'
)
returns void
language plpgsql
volatile
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
    select least(coalesce(t.billable_clicks, 0)::bigint * k.cpc_kobo, e.agreed_price_kobo) into released
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

create or replace function public.settle_due_click_hires()
returns jsonb
language plpgsql
volatile
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
    select e.id, e.business_id, e.creator_id, k.title, k.deliver_by, k.cpc_kobo, e.agreed_price_kobo,
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

create or replace function public.withdraw_from_engagement(engagement uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  business uuid;
  e public.engagements;
  k public.campaigns;
begin
  select g.business_id into business from public.engagements g where g.id = engagement;
  perform 1 from public.users u where u.id = business for no key update;
  select * into e from public.engagements x where x.id = engagement for update;
  if e.id is null or me is null or e.creator_id is distinct from me then
    raise exception 'no_such_engagement' using errcode = 'P0001';
  end if;
  if e.status not in ('in_progress', 'denied') or e.settled_at is not null then
    raise exception 'engagement_locked' using errcode = 'P0001';
  end if;

  select * into k from public.campaigns c where c.id = e.campaign_id;
  if k.payment_model = 'per_click' then
    if e.clicks_stopped_at is not null then
      raise exception 'engagement_locked' using errcode = 'P0001';
    end if;
    update public.engagements x set clicks_stopped_at = now(), updated_at = now() where x.id = e.id;
    perform public.notify(e.business_id, 'clicks_stopped', jsonb_build_object(
        'engagement_id', e.id,
        'campaign_title', k.title,
        'name', (select p.display_name from public.influencer_profiles p where p.user_id = e.creator_id),
        'settles_at', public.click_settles_at(k.deliver_by)));
    return;
  end if;

  perform public.settle_money(e.id, 'refund_creator_fault', 0, true, 'refunded', null, me, 'creator_withdrew');
end;
$$;
