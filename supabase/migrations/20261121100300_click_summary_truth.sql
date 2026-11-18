-- Fixes from the Part 3 review: the click summaries tell the truth about money.
--   campaign_click_summary(): one row per PAID hire (started or not), each with
--     its own settlement (settledAt, releasedKobo, refundedKobo, status) and
--     spentKobo (released once settled, the clicks' worth while running);
--     totals gain budgetLeftKobo (what unsettled, unwithdrawn paid hires can
--     still earn), so a settled or refunded place no longer reads as budget.
--   engagement_click_summary(): adds settledAt and releasedKobo, so a settled
--     hire shows what was actually released (an admin's split, say).
--   campaign_click_results(): only once the campaign is over (clicks have
--     stopped, or it was closed), not merely when its paid hires settled.
-- Access checks are unchanged. Otherwise as in 20261121100100,
-- 20261120100100 and 20261121100200.

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
        'spentKobo', coalesce(sum(case when e.settled_at is not null then coalesce(e.released_kobo, 0) else least(coalesce(t.billable_clicks, 0)::bigint * k.cpc_kobo, e.agreed_price_kobo) end), 0),
        -- What paid hires can still earn: not settled, not withdrawn.
        'budgetLeftKobo', coalesce(sum(case when e.settled_at is null and e.clicks_stopped_at is null
          then e.agreed_price_kobo - least(coalesce(t.billable_clicks, 0)::bigint * k.cpc_kobo, e.agreed_price_kobo)
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
            'code', null, 'billable', 0, 'totalHits', 0, 'cpcKobo', k.cpc_kobo, 'capKobo', e.agreed_price_kobo,
            'earnedKobo', 0, 'blockedChannels', to_jsonb(k.blocked_channels), 'filtered', '{}'::jsonb,
            'sources', '{}'::jsonb, 'days', '[]'::jsonb, 'blockedShares', '[]'::jsonb)
          else public.link_summary(t, k) end)
        || jsonb_build_object(
          'engagementId', e.id,
          'creatorName', (select p.display_name from public.influencer_profiles p where p.user_id = e.creator_id),
          'proofCount', (select count(*) from public.click_proofs c where c.engagement_id = e.id),
          'spentKobo', case when e.settled_at is not null then coalesce(e.released_kobo, 0) else least(coalesce(t.billable_clicks, 0)::bigint * k.cpc_kobo, e.agreed_price_kobo) end,
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
    return jsonb_build_object('code', null, 'cpcKobo', k.cpc_kobo, 'capKobo', e.agreed_price_kobo,
                              'blockedChannels', to_jsonb(k.blocked_channels)) || timing;
  end if;
  return public.link_summary(link, k) || timing;
end;
$$;

create or replace function public.campaign_click_results(campaign uuid)
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
  -- Only once the campaign is over: clicks have stopped (or it was closed).
  if (now() < public.click_window_end(k.deliver_by) and k.status not in ('closed', 'cancelled', 'completed'))
     or not exists (select 1 from public.engagements e where e.campaign_id = k.id and e.funded_at is not null)
     or exists (select 1 from public.engagements e
                 where e.campaign_id = k.id and e.funded_at is not null and e.settled_at is null) then
    return null;
  end if;

  return (
    select jsonb_build_object(
      'totals', jsonb_build_object(
        'billable', coalesce(sum(h.billable), 0),
        'spentKobo', coalesce(sum(h.released), 0),
        'backKobo', coalesce(sum(h.back), 0),
        'feeKeptKobo', coalesce(sum(h.fee_kept), 0)
      ),
      'hires', coalesce(jsonb_agg(jsonb_build_object(
        'engagementId', h.id,
        'creatorName', h.creator_name,
        'billable', h.billable,
        'releasedKobo', h.released,
        'backKobo', h.back,
        'feeKeptKobo', h.fee_kept,
        'status', h.status
      ) order by h.creator_name), '[]'::jsonb)
    )
    from (
      select e.id, e.status,
             coalesce(t.billable_clicks, 0) as billable,
             coalesce(e.released_kobo, 0) as released,
             coalesce(e.refunded_kobo, 0) as back,
             e.business_fee_kobo - (coalesce(e.refunded_kobo, 0) - (e.agreed_price_kobo - coalesce(e.released_kobo, 0)))
               as fee_kept,
             (select p.display_name from public.influencer_profiles p where p.user_id = e.creator_id) as creator_name
        from public.engagements e
        left join public.tracked_links t on t.engagement_id = e.id
       where e.campaign_id = k.id and e.funded_at is not null
    ) h
  );
end;
$$;
