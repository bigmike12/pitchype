-- The end-of-campaign summary for a per-click campaign (pay per click, Part 3).
--
-- campaign_click_results(campaign): for the owner or an admin, once every paid
-- hire on the campaign has settled (or been cancelled after paying), what each
-- hire's clicks came to: released (spent), refunded (back to the business,
-- which already includes any fee returned) and the business fee kept
-- (fee − (refunded − (price − released))). Null while any paid hire is still
-- running, so nobody reads a half-finished summary, and for anyone else.
-- Unpaid hires (lapsed before paying) never held money and are left out.
-- Read-only.

create function public.campaign_click_results(campaign uuid)
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
  if not exists (select 1 from public.engagements e where e.campaign_id = k.id and e.funded_at is not null)
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

revoke all on function public.campaign_click_results(uuid) from public, anon;
grant execute on function public.campaign_click_results(uuid) to authenticated;
