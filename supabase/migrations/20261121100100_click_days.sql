-- Clicks per day and by source, for the dashboards (pay per click, Part 3).
--   link_summary(): adds days [{day, billable, hits}], by Lagos calendar day,
--     only the days that had hits (the app fills the gaps).
--   campaign_click_summary(): adds totals.sources, days (over all the
--     campaign's links) and, per hire, proofCount (its click_proofs).
-- Read-only; access checks are unchanged. Otherwise as in
-- 20261119100400_per_click_guards.sql and 20261119100100_tracked_links.sql.

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
    'cpcKobo', k.cpc_kobo,
    'capKobo', k.price_kobo,
    'earnedKobo', least(link.billable_clicks::bigint * k.cpc_kobo, k.price_kobo),
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
$$;

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
        'billable', coalesce(sum(t.billable_clicks), 0),
        'totalHits', coalesce(sum(t.total_hits), 0),
        'spentKobo', coalesce(sum(least(t.billable_clicks::bigint * k.cpc_kobo, k.price_kobo)), 0),
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
        public.link_summary(t, k) || jsonb_build_object(
          'engagementId', t.engagement_id,
          'creatorName', (select p.display_name from public.influencer_profiles p where p.user_id = t.creator_id),
          'proofCount', (select count(*) from public.click_proofs c where c.engagement_id = t.engagement_id)
        ) order by t.created_at), '[]'::jsonb)
    )
    from public.tracked_links t
   where t.campaign_id = k.id
  );
end;
$$;
