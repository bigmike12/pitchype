-- record_click() now takes a share lock on the hire before it locks the link.
--
-- Why: a click and a change to the hire (withdrawal, settlement) touched
-- different rows, so neither waited for the other and a click could read the
-- hire as running while it was ending. With the share lock, a status change
-- (which locks the hire for update) waits for clicks already counting, and a
-- click waits for a change in flight and then reads the new status. Part 2's
-- settlement reads the click count after locking the hire, so once it holds
-- that lock no further click can count.
--
-- Lock order: hire, then link. Settlement must take them in the same order.
-- Otherwise unchanged from 20261119100100_tracked_links.sql.

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
  link public.tracked_links;
  k public.campaigns;
  hire_status public.engagement_status;
  reason text;
begin
  select t.engagement_id into hire from public.tracked_links t where t.code = code;
  if hire is null then
    return null;
  end if;
  select g.status into hire_status from public.engagements g where g.id = hire for share;
  select * into link from public.tracked_links t where t.code = code for update;
  select * into k from public.campaigns c where c.id = link.campaign_id;

  reason := case
    when client_class = 'preview' then 'preview'
    when client_class <> 'human' then 'bot'
    when source = any (k.blocked_channels) then 'blocked_channel'
    when hire_status <> 'in_progress' then 'hire_ended'
    when not public.click_window_open(k.deliver_by, now()) then 'window_closed'
    when link.billable_clicks >= k.price_kobo / k.cpc_kobo then 'cap_reached'
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

  return jsonb_build_object(
    'destination', k.destination_url,
    'utmTags', k.utm_tags,
    'campaignId', k.id,
    'billable', reason is null,
    'reason', reason
  );
end;
$$;
