-- Two guards from the Part 1 review.
--
-- 1. A per-click hire is paid by its clicks, so it never goes through the
--    Stage 7 submit → accept/auto-release path: accepting (or the auto-release
--    after 7 days) would release the whole budget whatever the clicks. A
--    trigger refuses the submission row, which covers submit_work() and any
--    later caller. Proof for the record comes in Part 2, separately.
-- 2. The link summary carries the campaign's blocked channels, so the job page
--    shows them beside the creator's link (creators can't read campaigns, and
--    the campaign page closes to them when applications close).

create function public.submissions_not_per_click()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.engagements e
      join public.campaigns k on k.id = e.campaign_id
     where e.id = new.engagement_id and k.payment_model = 'per_click'
  ) then
    raise exception 'per_click_no_review' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger submissions_not_per_click
  before insert on public.submissions
  for each row execute function public.submissions_not_per_click();

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
    'blockedShares', (
      select coalesce(jsonb_agg(distinct l.source), '[]'::jsonb)
        from public.link_clicks l
       where l.link_id = link.id and l.filter_reason = 'preview'
         and l.source = any (k.blocked_channels)
    )
  )
$$;

-- Before the start, the job page also shows the blocked channels.
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
  select * into link from public.tracked_links t where t.engagement_id = e.id;
  if link.id is null then
    return jsonb_build_object('code', null, 'cpcKobo', k.cpc_kobo, 'capKobo', k.price_kobo,
                              'blockedChannels', to_jsonb(k.blocked_channels));
  end if;
  return public.link_summary(link, k);
end;
$$;
