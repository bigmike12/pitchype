-- Per-click hires: withdrawal stops the clicks, a notice at the cap, and
-- disputes during the hold (pay per click, Part 2; spec §5 steps 6–8, §7).
--
-- Invariants protected here:
--   1. A per-click creator who withdraws after starting stops their link from
--      counting (clicks_stopped_at) and is paid for the clicks already sent when
--      the hire settles at the hold. No money moves on the withdrawal, so a
--      creator can't farm clicks and withdraw to skip the fraud hold.
--      Fixed-price withdrawal is unchanged (creator at fault, settled now).
--   2. record_click(): a stopped hire's clicks are hire_ended; the cap is the
--      hire's own agreed budget over the cost per click; the click that reaches
--      the cap tells the creator, once (a grouped notification).
--   3. Either person may dispute a per-click hire during the hold: once the
--      click window has ended and before it settles. Never while clicks are
--      counting. Fixed-price dispute rules are unchanged.
--   Lock orders are as before: users, engagement, link (record_click takes the
--   engagement FOR SHARE, then the link).

-- Withdrawal ----------------------------------------------------------------------------------------------
-- As in 20261117100000_create_submissions.sql, plus the per-click branch.

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

  if exists (select 1 from public.campaigns k where k.id = e.campaign_id and k.payment_model = 'per_click') then
    if e.clicks_stopped_at is not null then
      raise exception 'engagement_locked' using errcode = 'P0001';
    end if;
    update public.engagements x set clicks_stopped_at = now(), updated_at = now() where x.id = e.id;
    return;
  end if;

  perform public.settle_money(e.id, 'refund_creator_fault', 0, true, 'refunded', null, me, 'creator_withdrew');
end;
$$;

-- Recording a hit --------------------------------------------------------------------------------------------
-- As in 20261119100200_record_click_locks_hire.sql, plus clicks_stopped_at, the
-- cap from the hire, and the cap notice.

create or replace function public.record_click(
  code text,
  visitor_hash text,
  ua_hash text,
  referrer_host text,
  source text,
  client_class text
)
returns jsonb
language plpgsql
volatile
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
  cap := e.agreed_price_kobo / k.cpc_kobo;

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

-- Disputes ------------------------------------------------------------------------------------------------------
-- As in 20261117100200_create_disputes.sql, plus the per-click branch.

create or replace function public.open_dispute(engagement uuid, reason text, links text[], file_ids uuid[])
returns uuid
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
  clean_reason text := btrim(reason);
  dispute uuid;
begin
  select g.business_id into business from public.engagements g where g.id = engagement;
  perform 1 from public.users u where u.id = business for no key update;
  select * into e from public.engagements x where x.id = engagement for update;
  if e.id is null or me is null or me not in (e.creator_id, e.business_id) then
    raise exception 'no_such_engagement' using errcode = 'P0001';
  end if;
  if e.status = 'disputed' then
    raise exception 'dispute_open' using errcode = 'P0001';
  end if;
  if e.status not in ('denied', 'in_progress') or e.settled_at is not null then
    raise exception 'engagement_locked' using errcode = 'P0001';
  end if;
  select * into k from public.campaigns c where c.id = e.campaign_id;
  if e.status = 'in_progress' then
    if k.payment_model = 'per_click' then
      -- Either person, during the hold: after the click window, before settling.
      if now() < public.click_window_end(k.deliver_by) then
        raise exception 'dispute_not_allowed_yet' using errcode = 'P0001';
      end if;
    else
      if me = e.creator_id then
        raise exception 'not_allowed' using errcode = 'P0001';
      end if;
      if now() <= public.non_delivery_dispute_at(e) then
        raise exception 'dispute_not_allowed_yet' using errcode = 'P0001';
      end if;
    end if;
  end if;

  if clean_reason is null or char_length(clean_reason) not between 20 and 2000 then
    raise exception 'dispute_reason_invalid' using errcode = 'P0001';
  end if;

  insert into public.disputes (engagement_id, opened_by, opened_from, reason)
  values (e.id, me, e.status, clean_reason)
  returning id into dispute;

  perform public.write_dispute_statement(dispute, me, clean_reason, links, file_ids);

  update public.engagements x set status = 'disputed', updated_at = now() where x.id = e.id;
  return dispute;
end;
$$;
