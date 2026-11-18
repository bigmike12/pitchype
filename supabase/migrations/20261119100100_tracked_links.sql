-- Tracked links and click counting for pay-per-click hires
-- (docs/superpowers/specs/2026-11-18-pay-per-click-design.md §6). No money moves here.
--
-- Invariants protected here:
--   1. A per-click hire gets exactly one link, made in the same transaction as
--      its start (start_engagement), so a link exists only from the start.
--   2. Every hit is stored (append-only, like the ledger); billability is
--      decided only by record_click(), under a lock on the link row, in this
--      order: preview/bot, blocked channel, hire ended, window closed, cap,
--      repeat, rate limit. So two clicks at the cap can't both count.
--   3. A click is billable only while the hire is in_progress, before the end of
--      the campaign's deliver-by day (Lagos), under the cap (budget / cost per
--      click), and at most once per visitor per link per 24 hours.
--   4. The link's counters always equal its click rows.
--   5. Only the creator and the business on the hire, and admins, read a link
--      and its clicks. Nobody writes either table directly.
--   6. No raw IP is stored: visitor_hash is a keyed hash made by the app.

create table public.tracked_links (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  engagement_id uuid not null unique references public.engagements (id) on delete restrict,
  campaign_id uuid not null references public.campaigns (id) on delete restrict,
  business_id uuid not null references public.users (id) on delete restrict,
  creator_id uuid not null references public.users (id) on delete restrict,
  billable_clicks integer not null default 0,
  total_hits integer not null default 0,
  created_at timestamptz not null default now(),

  constraint tracked_links_code_check check (code ~ '^[0-9A-Za-z]{7}$'),
  constraint tracked_links_counts_check check (billable_clicks >= 0 and total_hits >= billable_clicks)
);

create index tracked_links_campaign_idx on public.tracked_links (campaign_id);
create index tracked_links_creator_idx on public.tracked_links (creator_id);

create table public.link_clicks (
  id bigint generated always as identity primary key,
  link_id uuid not null references public.tracked_links (id) on delete restrict,
  created_at timestamptz not null default now(),
  visitor_hash text not null,
  ua_hash text,
  referrer_host text,
  source text not null,
  is_billable boolean not null,
  filter_reason text,

  constraint link_clicks_source_check check (source in (
    'whatsapp', 'telegram', 'facebook', 'instagram', 'tiktok', 'x', 'youtube', 'snapchat',
    'other_site', 'unknown'
  )),
  constraint link_clicks_reason_check check (filter_reason is null or filter_reason in (
    'preview', 'bot', 'blocked_channel', 'hire_ended', 'window_closed', 'cap_reached',
    'repeat', 'rate_limited'
  )),
  constraint link_clicks_billable_check check (is_billable = (filter_reason is null)),
  constraint link_clicks_sizes_check check (
    char_length(visitor_hash) <= 128 and char_length(ua_hash) <= 128 and char_length(referrer_host) <= 255
  )
);

create index link_clicks_visitor_idx on public.link_clicks (link_id, visitor_hash, created_at);
create index link_clicks_link_idx on public.link_clicks (link_id, created_at);
create index link_clicks_rate_idx on public.link_clicks (visitor_hash, created_at);

create trigger link_clicks_append_only
  before update or delete on public.link_clicks
  for each row execute function public.reject_change('clicks_append_only');

create trigger link_clicks_no_truncate
  before truncate on public.link_clicks
  for each statement execute function public.reject_change('clicks_append_only');

-- Reads ------------------------------------------------------------------------------------------

alter table public.tracked_links enable row level security;
alter table public.link_clicks enable row level security;

revoke all on table public.tracked_links from anon, authenticated, service_role;
revoke all on table public.link_clicks from anon, authenticated, service_role;
grant select on table public.tracked_links to authenticated, service_role;
grant select on table public.link_clicks to authenticated, service_role;

create policy "Tracked links: the two people on the hire, admins"
  on public.tracked_links for select to authenticated
  using (
    (select public.current_user_id()) in (creator_id, business_id)
    or (select public.current_user_role()) = 'admin'
  );

create policy "Link clicks: the two people on the hire, admins"
  on public.link_clicks for select to authenticated
  using (
    exists (
      select 1 from public.tracked_links t
       where t.id = link_id
         and (select public.current_user_id()) in (t.creator_id, t.business_id)
    )
    or (select public.current_user_role()) = 'admin'
  );

-- Helpers -------------------------------------------------------------------------------------------

-- Clicks count until the end of the deliver-by day, Lagos time.
create function public.click_window_open(deliver_by date, at timestamptz)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select at < ((deliver_by + 1)::timestamp at time zone 'Africa/Lagos')
$$;

-- Seven characters of base62 from random bytes.
create function public.new_link_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  raw bytea := uuid_send(gen_random_uuid());
  code text := '';
  -- Skip bytes 6 and 8: they carry the UUID's version and variant bits.
  positions constant int[] := array[0, 1, 2, 3, 4, 5, 10];
  p int;
begin
  foreach p in array positions loop
    code := code || substr(alphabet, (get_byte(raw, p) % 62) + 1, 1);
  end loop;
  return code;
end;
$$;

-- Starting a hire (from create_settlement), plus the link for a per-click hire.
create or replace function public.start_engagement(engagement uuid)
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
  tries int := 0;
begin
  select g.business_id into business from public.engagements g where g.id = engagement;
  perform 1 from public.users u where u.id = business for no key update;
  select * into e from public.engagements x where x.id = engagement for update;
  if e.id is null or me is null or e.creator_id is distinct from me then
    raise exception 'no_such_engagement' using errcode = 'P0001';
  end if;
  if e.status <> 'funded' then
    raise exception 'engagement_locked' using errcode = 'P0001';
  end if;

  update public.engagements x
     set status = 'in_progress', started_at = now(), updated_at = now()
   where x.id = e.id;

  if exists (select 1 from public.campaigns k where k.id = e.campaign_id and k.payment_model = 'per_click') then
    loop
      begin
        insert into public.tracked_links (code, engagement_id, campaign_id, business_id, creator_id)
        values (public.new_link_code(), e.id, e.campaign_id, e.business_id, e.creator_id);
        exit;
      exception when unique_violation then
        tries := tries + 1;
        if tries >= 5 then
          raise;
        end if;
      end;
    end loop;
  end if;
end;
$$;

-- Recording a hit ----------------------------------------------------------------------------------

-- Called by the /r/[code] redirect for every hit. Returns where to send the
-- visitor and whether the hit counted, or null for an unknown code.
create function public.record_click(
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
  link public.tracked_links;
  k public.campaigns;
  hire_status public.engagement_status;
  reason text;
begin
  select * into link from public.tracked_links t where t.code = code for update;
  if link.id is null then
    return null;
  end if;
  select * into k from public.campaigns c where c.id = link.campaign_id;
  select g.status into hire_status from public.engagements g where g.id = link.engagement_id;

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

revoke all on function public.record_click(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_click(text, text, text, text, text, text) to service_role;
revoke all on function public.new_link_code() from public, anon, authenticated, service_role;

-- Summaries for the hire and campaign pages ---------------------------------------------------------
-- Security definer because creators can't read campaigns directly; each
-- checks the caller is on the hire (or owns the campaign) or is an admin.

create function public.link_summary(link public.tracked_links, k public.campaigns)
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

create function public.engagement_click_summary(engagement uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  link public.tracked_links;
  k public.campaigns;
begin
  select * into link from public.tracked_links t where t.engagement_id = engagement;
  if link.id is null
     or not (me in (link.creator_id, link.business_id) or public.current_user_role() = 'admin') then
    return null;
  end if;
  select * into k from public.campaigns c where c.id = link.campaign_id;
  return public.link_summary(link, k);
end;
$$;

create function public.campaign_click_summary(campaign uuid)
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
        'spentKobo', coalesce(sum(least(t.billable_clicks::bigint * k.cpc_kobo, k.price_kobo)), 0)
      ),
      'hires', coalesce(jsonb_agg(
        public.link_summary(t, k) || jsonb_build_object(
          'engagementId', t.engagement_id,
          'creatorName', (select p.display_name from public.influencer_profiles p where p.user_id = t.creator_id)
        ) order by t.created_at), '[]'::jsonb)
    )
    from public.tracked_links t
   where t.campaign_id = k.id
  );
end;
$$;

revoke all on function public.link_summary(public.tracked_links, public.campaigns) from public, anon, authenticated, service_role;
revoke all on function public.engagement_click_summary(uuid) from public, anon;
revoke all on function public.campaign_click_summary(uuid) from public, anon;
grant execute on function public.engagement_click_summary(uuid) to authenticated;
grant execute on function public.campaign_click_summary(uuid) to authenticated;
