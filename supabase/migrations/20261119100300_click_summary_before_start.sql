-- engagement_click_summary() also answers for a per-click hire that has no
-- link yet (paid, not started), with the terms and a null code, so the job page
-- can say the link appears at the start. Creators can't read campaigns
-- directly, so this is how the page learns the hire is per click.
-- Null, as before, for a fixed-price hire or a caller who isn't on the hire.

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
    return jsonb_build_object('code', null, 'cpcKobo', k.cpc_kobo, 'capKobo', k.price_kobo);
  end if;
  return public.link_summary(link, k);
end;
$$;
