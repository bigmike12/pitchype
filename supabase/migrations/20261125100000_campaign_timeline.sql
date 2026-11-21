-- Campaign timelines and checkpoint schedules (design:
-- docs/superpowers/specs/2026-11-22-campaign-checkpoints-design.md §5.1-5.2).
--
-- Every campaign gets an end date (ends_on: the date until which posts stay up;
-- display and terms only, the final submission is still due by deliver_by).
-- A business can switch on checkpoints: fixed dates after the start, every N
-- days, generated once when the campaign leaves draft and never changed while
-- it is live. Final requirements say what the final submission must contain.
--
-- Changed functions, each copied from its latest definition with additions:
--   * campaigns_before_write (from 20261121100000): the new configuration locks
--     once submitted; ends_on moves later only.
--   * transition_campaign (from 20261123100100): submit needs a start and end
--     date (timeline_required), a start date not in the past (timeline_in_past,
--     also at admin approval) and, with checkpoints on, room for at least one
--     (checkpoints_do_not_fit); submit generates the schedule.
--   * campaign_card (from 20261119100000): shows creators the new terms.
--   * save_campaign_draft (from 20261119100050): takes the new fields.
--
-- Campaigns that were live before this migration keep nulls and behave as before.
-- Nothing here touches the ledger, escrow, wallets or any engagement.

alter table public.campaigns
  add column ends_on date,
  add column checkpoints_enabled boolean not null default false,
  add column checkpoint_interval_days integer,
  add column checkpoint_evidence text[],
  add column final_requirements text[] not null default '{}';

alter table public.campaigns
  add constraint campaigns_ends_on_check check (ends_on is null or ends_on >= deliver_by),
  add constraint campaigns_checkpoint_interval_check
    check (checkpoint_interval_days is null or checkpoint_interval_days between 2 and 30),
  add constraint campaigns_checkpoint_evidence_check
    check (checkpoint_evidence is null
           or checkpoint_evidence <@ array['progress_update', 'content_links', 'publication_screenshots', 'analytics']::text[]),
  add constraint campaigns_checkpoint_config_check
    check (not checkpoints_enabled
           or (checkpoint_interval_days is not null and coalesce(cardinality(checkpoint_evidence), 0) > 0)),
  add constraint campaigns_final_requirements_check
    check (final_requirements <@ array['content_links', 'publication_screenshots', 'analytics', 'final_report']::text[]),
  -- A per-click campaign has no final submission, so nothing to require of it.
  add constraint campaigns_final_requirements_fixed_check
    check (payment_model = 'fixed' or cardinality(final_requirements) = 0);

-- The fixed schedule of a checkpoint campaign: one row per date.
create table public.campaign_checkpoints (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  seq integer not null check (seq >= 1),
  due_on date not null,
  unique (campaign_id, seq)
);

alter table public.campaign_checkpoints enable row level security;
revoke all on table public.campaign_checkpoints from anon, authenticated;
grant select on table public.campaign_checkpoints to authenticated;

-- Readable with the campaign: its owner and admins. Creators get the dates
-- through campaign_card() and their own hire's checkpoints.
create policy "Checkpoint dates are visible with their campaign"
  on public.campaign_checkpoints for select to authenticated
  using (exists (select 1 from public.campaigns k where k.id = campaign_id));

grant insert (ends_on, checkpoints_enabled, checkpoint_interval_days, checkpoint_evidence, final_requirements)
  on table public.campaigns to authenticated;
grant update (ends_on, checkpoints_enabled, checkpoint_interval_days, checkpoint_evidence, final_requirements)
  on table public.campaigns to authenticated;

-- Generates (or regenerates) a draft's schedule: every checkpoint_interval_days
-- after the start, strictly before final delivery. Only transition_campaign()
-- calls it, on submit; a campaign sent back to draft has no hires yet.
create function public.generate_campaign_checkpoints(campaign uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  k public.campaigns;
begin
  select * into k from public.campaigns c where c.id = campaign;
  if k.id is null then
    return;
  end if;
  if exists (select 1 from public.engagements e where e.campaign_id = k.id) then
    raise exception 'a campaign with hires keeps its schedule' using errcode = '55000';
  end if;

  delete from public.campaign_checkpoints cc where cc.campaign_id = k.id;
  if not k.checkpoints_enabled or k.post_from is null then
    return;
  end if;

  insert into public.campaign_checkpoints (campaign_id, seq, due_on)
  select k.id, n, k.post_from + n * k.checkpoint_interval_days
    from generate_series(1, greatest((k.deliver_by - k.post_from - 1) / k.checkpoint_interval_days, 0)) as n;
end;
$$;
revoke all on function public.generate_campaign_checkpoints(uuid) from public, anon, authenticated;

create or replace function public.campaigns_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
       select 1 from unnest(new.niches) as chosen (slug)
       where chosen.slug not in (select n.slug from public.niches n)
     )
     or cardinality(new.niches) <> (select count(distinct n) from unnest(new.niches) as n)
     or cardinality(new.states) <> (select count(distinct s) from unnest(new.states) as s)
  then
    raise exception 'niches and states must be distinct entries from their lists'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();

    if new.places < old.places and new.places < public.held_places(new.id) then
      raise exception 'places_below_held' using errcode = 'P0001';
    end if;

    if old.status <> 'draft' then
      if (new.niches, new.states, new.verified_only, new.payment_model, new.price_kobo, new.post_from,
          new.cpc_kobo, new.destination_url, new.utm_tags, new.blocked_channels,
          new.checkpoints_enabled, new.checkpoint_interval_days, new.checkpoint_evidence, new.final_requirements)
         is distinct from
         (old.niches, old.states, old.verified_only, old.payment_model, old.price_kobo, old.post_from,
          old.cpc_kobo, old.destination_url, old.utm_tags, old.blocked_channels,
          old.checkpoints_enabled, old.checkpoint_interval_days, old.checkpoint_evidence, old.final_requirements)
      then
        raise exception 'price, requirements and posting dates are locked once a campaign is submitted'
          using errcode = '42501';
      end if;
      -- Pay per click: once clicks have stopped (the 72-hour wait has begun),
      -- the end date is final, so the settle date both sides were told holds.
      if old.payment_model = 'per_click' and new.deliver_by is distinct from old.deliver_by
         and now() >= public.click_window_end(old.deliver_by) then
        raise exception 'the click window has ended' using errcode = '42501';
      end if;
      if new.applications_close_on < old.applications_close_on or new.deliver_by < old.deliver_by then
        raise exception 'deadlines can only move later once a campaign is submitted'
          using errcode = '42501';
      end if;
      -- The end date moves later like the other dates, and may be set on a
      -- campaign that went live without one.
      if new.ends_on is distinct from old.ends_on
         and (new.ends_on is null or new.ends_on < old.ends_on) then
        raise exception 'deadlines can only move later once a campaign is submitted'
          using errcode = '42501';
      end if;
      -- Wording, deadlines and places change only while open or paused.
      if old.status not in ('open', 'paused')
         and (new.title, new.brief, new.guidelines, new.applications_close_on, new.deliver_by, new.places, new.ends_on)
             is distinct from
             (old.title, old.brief, old.guidelines, old.applications_close_on, old.deliver_by, old.places, old.ends_on)
      then
        raise exception 'a campaign can only be edited while it is a draft, open or paused'
          using errcode = '42501';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.transition_campaign(
  campaign_id uuid,
  action text,
  note text default null
)
returns public.campaign_status
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  caller uuid := public.current_user_id();
  caller_role public.user_role := public.current_user_role();
  c public.campaigns;
  clean_note text := nullif(btrim(note), '');
  new_status public.campaign_status;
begin
  select * into c from public.campaigns k where k.id = campaign_id for update;
  if c.id is null then
    raise exception 'no such campaign' using errcode = 'P0002';
  end if;

  if action in ('submit', 'withdraw', 'pause', 'resume', 'close') then
    if caller is null or c.business_id <> caller then
      raise exception 'only the business that owns this campaign can do that' using errcode = '42501';
    end if;
  elsif action in ('approve', 'reject', 'take_down') then
    if caller_role is distinct from 'admin' then
      raise exception 'only admins can do that' using errcode = '42501';
    end if;
  else
    raise exception 'unknown action %', action using errcode = '22023';
  end if;

  case action
    when 'submit' then
      if c.status <> 'draft' then
        raise exception 'only drafts can be submitted' using errcode = '55000';
      end if;
      -- Sending a campaign for listing needs a verified owner. Resuming a
      -- paused campaign and admin actions are not gated: a live campaign stays live.
      if not public.identity_verified(c.business_id) then
        raise exception 'identity_required' using errcode = 'P0001';
      end if;
      if c.applications_close_on < public.lagos_today() then
        raise exception 'the application deadline has passed' using errcode = '22023';
      end if;
      if not exists (select 1 from public.campaign_deliverables d where d.campaign_id = c.id)
         or exists (
           select 1 from public.campaign_platforms p
            where p.campaign_id = c.id
              and not exists (
                select 1 from public.campaign_deliverables d
                 where d.campaign_id = c.id and d.platform = p.platform
              )
         )
      then
        raise exception 'every platform needs at least one deliverable' using errcode = '22023';
      end if;
      -- A new campaign says when it starts and ends, and checkpoints (if on)
      -- need room before final delivery. The schedule is generated here and
      -- stays fixed while the campaign is live.
      if c.post_from is null or c.ends_on is null then
        raise exception 'timeline_required' using errcode = 'P0001';
      end if;
      if c.post_from < public.lagos_today() then
        raise exception 'timeline_in_past' using errcode = 'P0001';
      end if;
      perform public.generate_campaign_checkpoints(c.id);
      if c.checkpoints_enabled and not exists (
        select 1 from public.campaign_checkpoints cc where cc.campaign_id = c.id
      ) then
        raise exception 'checkpoints_do_not_fit' using errcode = 'P0001';
      end if;
      -- A business is trusted once an admin has approved one of its campaigns.
      -- Per-click campaigns always wait: an admin checks the destination is the
      -- business's own (a stand-in for domain verification).
      if c.payment_model = 'fixed' and exists (
        select 1 from public.campaigns k
         where k.business_id = c.business_id and k.approved_at is not null
      ) then
        new_status := 'open';
      else
        new_status := 'pending_review';
      end if;
      update public.campaigns k
         set status = new_status,
             submitted_at = now(),
             published_at = case when new_status = 'open' then coalesce(k.published_at, now()) else k.published_at end,
             review_note = null
       where k.id = c.id;

    when 'withdraw' then
      if c.status <> 'pending_review' then
        raise exception 'only campaigns waiting for review can be withdrawn' using errcode = '55000';
      end if;
      new_status := 'draft';
      update public.campaigns k set status = new_status where k.id = c.id;

    when 'approve' then
      if c.status <> 'pending_review' then
        raise exception 'this campaign is not waiting for review' using errcode = '55000';
      end if;
      if c.applications_close_on < public.lagos_today() then
        raise exception 'the application deadline has passed; send it back instead' using errcode = '22023';
      end if;
      -- A start date that has passed while waiting for review: the business
      -- picks new dates. A campaign submitted before timelines existed has none.
      if c.post_from is not null and c.post_from < public.lagos_today() then
        raise exception 'timeline_in_past' using errcode = 'P0001';
      end if;
      new_status := 'open';
      update public.campaigns k
         set status = new_status, approved_at = now(), approved_by = caller,
             published_at = coalesce(k.published_at, now())
       where k.id = c.id;

    when 'reject' then
      if c.status <> 'pending_review' then
        raise exception 'this campaign is not waiting for review' using errcode = '55000';
      end if;
      if clean_note is null then
        raise exception 'say why it is being sent back' using errcode = '22023';
      end if;
      new_status := 'draft';
      update public.campaigns k set status = new_status, review_note = clean_note where k.id = c.id;

    when 'pause' then
      if c.status <> 'open' then
        raise exception 'only open campaigns can be paused' using errcode = '55000';
      end if;
      new_status := 'paused';
      update public.campaigns k set status = new_status where k.id = c.id;

    when 'resume' then
      if c.status <> 'paused' then
        raise exception 'only paused campaigns can be resumed' using errcode = '55000';
      end if;
      if c.applications_close_on < public.lagos_today() then
        raise exception 'the application deadline has passed; extend it first' using errcode = '22023';
      end if;
      new_status := 'open';
      update public.campaigns k set status = new_status where k.id = c.id;

    when 'close' then
      if c.status not in ('open', 'paused') then
        raise exception 'only open or paused campaigns can be closed' using errcode = '55000';
      end if;
      new_status := 'closed';
      update public.campaigns k set status = new_status, closed_at = now() where k.id = c.id;

    when 'take_down' then
      if c.status not in ('pending_review', 'open', 'paused') then
        raise exception 'this campaign is not live' using errcode = '55000';
      end if;
      if clean_note is null then
        raise exception 'give a reason the business will see' using errcode = '22023';
      end if;
      new_status := 'closed';
      update public.campaigns k
         set status = new_status, closed_at = now(), removed_reason = clean_note
       where k.id = c.id;
  end case;

  return new_status;
end;
$$;

revoke all on function public.transition_campaign(uuid, text, text) from public, anon;

create or replace function public.campaign_card(k public.campaigns, viewer uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', k.id,
    'title', k.title,
    'status', k.status,
    'business_name', b.business_name,
    'business_city', b.city,
    'business_state', b.state,
    'niches', k.niches,
    'states', k.states,
    'verified_only', k.verified_only,
    'payment_model', k.payment_model,
    'price_kobo', k.price_kobo,
    'cpc_kobo', k.cpc_kobo,
    'destination_host', public.destination_host(k.destination_url),
    'utm_tags', k.utm_tags,
    'blocked_channels', to_jsonb(k.blocked_channels),
    'places', k.places,
    'places_taken', public.held_places(k.id),
    'applications_close_on', k.applications_close_on,
    'post_from', k.post_from,
    'deliver_by', k.deliver_by,
    'ends_on', k.ends_on,
    'checkpoints_enabled', k.checkpoints_enabled,
    'checkpoint_interval_days', k.checkpoint_interval_days,
    'checkpoint_evidence', coalesce(to_jsonb(k.checkpoint_evidence), '[]'::jsonb),
    'checkpoint_dates', (
      select coalesce(jsonb_agg(cc.due_on order by cc.seq), '[]'::jsonb)
        from public.campaign_checkpoints cc where cc.campaign_id = k.id
    ),
    'final_requirements', to_jsonb(k.final_requirements),
    'published_at', k.published_at,
    'platforms', (
      select coalesce(jsonb_agg(jsonb_build_object('platform', p.platform, 'min_followers', p.min_followers)
                                order by p.platform), '[]'::jsonb)
        from public.campaign_platforms p where p.campaign_id = k.id
    ),
    'deliverables', (
      select coalesce(jsonb_agg(jsonb_build_object('platform', d.platform, 'kind', d.kind, 'quantity', d.quantity)
                                order by d.position), '[]'::jsonb)
        from public.campaign_deliverables d where d.campaign_id = k.id
    ),
    'problems', case
      when public.current_user_role() = 'influencer' then public.campaign_problems(k.id, viewer)
      else '[]'::jsonb
    end
  )
  from public.business_profiles b
  where b.user_id = k.business_id
$$;

-- save_campaign_draft gains the new fields; the old signature goes so a call
-- with named arguments stays unambiguous.
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
  blocked_channels text[] default '{}',
  ends_on date default null,
  checkpoints_enabled boolean default false,
  checkpoint_interval_days integer default null,
  checkpoint_evidence text[] default null,
  final_requirements text[] default '{}'
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
      payment_model, cpc_kobo, destination_url, utm_tags, blocked_channels,
      ends_on, checkpoints_enabled, checkpoint_interval_days, checkpoint_evidence, final_requirements
    )
    values (
      public.current_user_id(), title, brief, guidelines, niches,
      states::public.nigerian_state[], verified_only, price_kobo, places,
      applications_close_on, post_from, deliver_by,
      payment_model, cpc_kobo, destination_url, utm_tags, blocked_channels,
      ends_on, checkpoints_enabled, checkpoint_interval_days, checkpoint_evidence, final_requirements
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
           blocked_channels = save_campaign_draft.blocked_channels,
           ends_on = save_campaign_draft.ends_on,
           checkpoints_enabled = save_campaign_draft.checkpoints_enabled,
           checkpoint_interval_days = save_campaign_draft.checkpoint_interval_days,
           checkpoint_evidence = save_campaign_draft.checkpoint_evidence,
           final_requirements = save_campaign_draft.final_requirements
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

revoke all on function public.save_campaign_draft(uuid, text, text, text, text[], text[], boolean, bigint, integer, date, date, date, jsonb, jsonb, public.payment_model, bigint, text, boolean, text[], date, boolean, integer, text[], text[]) from public, anon;
grant execute on function public.save_campaign_draft(uuid, text, text, text, text[], text[], boolean, bigint, integer, date, date, date, jsonb, jsonb, public.payment_model, bigint, text, boolean, text[], date, boolean, integer, text[], text[]) to authenticated;
