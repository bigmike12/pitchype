-- Follow-up to per_click_campaigns: businesses must be able to write the
-- payment model and per-click terms of their own drafts (row level security and
-- the edit locks still decide which rows and when), and save_campaign_draft()'s
-- new arguments get defaults so a fixed-price caller works without them.

grant insert (payment_model, cpc_kobo, destination_url, utm_tags, blocked_channels)
  on table public.campaigns to authenticated;
grant update (payment_model, cpc_kobo, destination_url, utm_tags, blocked_channels)
  on table public.campaigns to authenticated;

-- Same body as in per_click_campaigns; only the argument defaults are new.
drop function public.save_campaign_draft(uuid, text, text, text, text[], text[], boolean, bigint, integer, date, date, date, jsonb, jsonb, public.payment_model, bigint, text, boolean, text[]);

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
  payment_model public.payment_model default 'fixed',
  cpc_kobo bigint default null,
  destination_url text default null,
  utm_tags boolean default true,
  blocked_channels text[] default '{}'
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
