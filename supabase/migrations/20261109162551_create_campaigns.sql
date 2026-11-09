-- Campaigns (Stage 4). Decisions: docs/campaign-spec-decisions.md.
--
-- Invariants this migration protects:
--   1. A campaign is seen only by its business, admins, and (while open and
--      before its deadline) signed-in creators. Creators read it through
--      list_open_campaigns() and get_campaign(), which also say why they
--      don't qualify. Visitors only get a count.
--   2. Status changes happen in one place, transition_campaign(), which
--      checks who may make each move and from which status.
--   3. From submission on, price, payment model, requirements, deliverables
--      and the posting start are locked; the deadlines can only move later;
--      places stay at least 1. Enforced here, not only in the UI.
--   4. A business's first campaign waits for an admin. Once one has been
--      approved, the business's later campaigns go live at once.
--   5. Every version of the title, brief and notes from submission on is
--      kept in campaign_revisions.
--   6. Only fixed-price campaigns can be submitted until pay per click is
--      built (after Stage 6).

-- Types -------------------------------------------------------------------------
-- Mirrored in src/lib/campaign.ts; keep the lists in step.

create type public.campaign_status as enum (
  'draft',
  'pending_review', -- a first campaign, waiting for an admin
  'open',
  'paused',         -- hidden from creators until resumed
  'closed',         -- closed early, or taken down by an admin; final
  'in_progress',    -- from Stage 5 on
  'completed',
  'cancelled'
);

create type public.payment_model as enum ('fixed', 'per_click');

create type public.deliverable_kind as enum ('post', 'reel', 'story', 'video', 'short');

create type public.campaign_report_reason as enum (
  'scam_or_fraud', 'banned_content', 'off_platform_contact', 'misleading', 'other'
);

-- Which kinds of post each platform has (no stories on X, and so on).
create function public.deliverable_kind_allowed(
  on_platform public.social_platform,
  kind public.deliverable_kind
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case on_platform
    when 'instagram' then kind in ('post', 'reel', 'story')
    when 'tiktok' then kind = 'video'
    when 'youtube' then kind in ('video', 'short')
    when 'x' then kind = 'post'
    else false
  end
$$;

-- Campaigns ---------------------------------------------------------------------

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles (user_id) on delete cascade,
  status public.campaign_status not null default 'draft',

  title text not null,
  brief text not null,
  -- Tone, mentions, hashtags.
  guidelines text,

  -- Who can apply. Empty niches/states mean any niche / anywhere in Nigeria.
  -- Platforms and their minimum followers are in campaign_platforms.
  niches text[] not null default '{}',
  states public.nigerian_state[] not null default '{}',
  verified_only boolean not null default false,

  payment_model public.payment_model not null default 'fixed',
  -- Per creator, whole naira as kobo (CLAUDE.md §6 rule 1). Nothing is
  -- escrowed at publish: each accepted creator is funded separately.
  price_kobo bigint,
  places integer not null,

  -- Dates are calendar days in Lagos. Applications close at the end of
  -- applications_close_on; posts go up between post_from and deliver_by.
  applications_close_on date not null,
  post_from date,
  deliver_by date not null,

  submitted_at timestamptz,
  published_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references public.users (id),
  -- Why an admin sent it back to draft.
  review_note text,
  closed_at timestamptz,
  -- Set when an admin takes the campaign down; the business sees it.
  removed_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint campaigns_title_check
    check (title = btrim(title) and char_length(title) between 5 and 100),
  constraint campaigns_brief_check
    check (brief = btrim(brief) and char_length(brief) between 20 and 3000),
  constraint campaigns_guidelines_check
    check (guidelines = btrim(guidelines) and char_length(guidelines) between 1 and 2000),
  constraint campaigns_niches_check
    check (cardinality(niches) <= 5),
  constraint campaigns_states_check
    check (cardinality(states) <= 37),
  constraint campaigns_fixed_price_check
    check (payment_model <> 'fixed' or (
      price_kobo is not null and price_kobo between 500000 and 10000000000 and price_kobo % 100 = 0
    )),
  constraint campaigns_places_check
    check (places between 1 and 500),
  constraint campaigns_dates_check
    check (deliver_by >= applications_close_on and (post_from is null or post_from <= deliver_by)),
  constraint campaigns_review_note_check
    check (review_note = btrim(review_note) and char_length(review_note) between 2 and 500),
  constraint campaigns_removed_check
    check (removed_reason is null or (
      status = 'closed' and removed_reason = btrim(removed_reason)
      and char_length(removed_reason) between 2 and 200
    ))
);

create index campaigns_business_idx on public.campaigns (business_id, created_at desc);
create index campaigns_open_idx on public.campaigns (applications_close_on) where status = 'open';

-- One required platform per row, with its minimum follower range (null: any).
create table public.campaign_platforms (
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  platform public.social_platform not null,
  min_followers public.follower_range,
  primary key (campaign_id, platform)
);

create table public.campaign_deliverables (
  campaign_id uuid not null,
  position smallint not null,
  platform public.social_platform not null,
  kind public.deliverable_kind not null,
  quantity smallint not null,
  primary key (campaign_id, position),
  foreign key (campaign_id, platform)
    references public.campaign_platforms (campaign_id, platform) on delete cascade,
  constraint campaign_deliverables_position_check check (position between 1 and 20),
  constraint campaign_deliverables_quantity_check check (quantity between 1 and 20),
  constraint campaign_deliverables_kind_check check (public.deliverable_kind_allowed(platform, kind))
);

create table public.campaign_revisions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  title text not null,
  brief text not null,
  guidelines text,
  -- An edit to a campaign creators could already see (not a resubmission
  -- after review). Only these show creators an "Edited" note.
  while_live boolean not null default false,
  created_at timestamptz not null default now()
);

create index campaign_revisions_campaign_idx on public.campaign_revisions (campaign_id, created_at);

create table public.campaign_reports (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  reason public.campaign_report_reason not null,
  details text,
  reporter_user_id uuid references public.users (id) on delete set null,
  resolved_by uuid references public.users (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),

  constraint campaign_reports_details_check
    check (details = btrim(details) and char_length(details) between 1 and 500),
  constraint campaign_reports_resolved_check
    check ((resolved_at is null) = (resolved_by is null))
);

create index campaign_reports_open_idx
  on public.campaign_reports (created_at) where resolved_at is null;

-- Triggers ------------------------------------------------------------------------

create function public.campaigns_before_write()
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

    if old.status <> 'draft' then
      if (new.niches, new.states, new.verified_only, new.payment_model, new.price_kobo, new.post_from)
         is distinct from
         (old.niches, old.states, old.verified_only, old.payment_model, old.price_kobo, old.post_from)
      then
        raise exception 'price, requirements and posting dates are locked once a campaign is submitted'
          using errcode = '42501';
      end if;
      if new.applications_close_on < old.applications_close_on or new.deliver_by < old.deliver_by then
        raise exception 'deadlines can only move later once a campaign is submitted'
          using errcode = '42501';
      end if;
      -- Wording, deadlines and places change only while open or paused.
      if old.status not in ('open', 'paused')
         and (new.title, new.brief, new.guidelines, new.applications_close_on, new.deliver_by, new.places)
             is distinct from
             (old.title, old.brief, old.guidelines, old.applications_close_on, old.deliver_by, old.places)
      then
        raise exception 'a campaign can only be edited while it is a draft, open or paused'
          using errcode = '42501';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger campaigns_before_write
  before insert or update on public.campaigns
  for each row execute function public.campaigns_before_write();

-- Keeps every version of the wording from submission on. Security definer:
-- nobody writes revisions directly.
create function public.campaigns_record_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'draft' and (
       old.status = 'draft'
       or (new.title, new.brief, new.guidelines) is distinct from (old.title, old.brief, old.guidelines)
     )
  then
    insert into public.campaign_revisions (campaign_id, title, brief, guidelines, while_live)
    values (new.id, new.title, new.brief, new.guidelines, old.status in ('open', 'paused'));
  end if;
  return null;
end;
$$;

create trigger campaigns_record_revision
  after update on public.campaigns
  for each row execute function public.campaigns_record_revision();

-- Saving a draft --------------------------------------------------------------------

-- Creates or replaces a draft in one transaction, platforms and deliverables
-- included. Security invoker: row level security decides whose campaign and
-- whether it is still a draft.
--   platforms:    [{"platform": "instagram", "min_followers": "10k_50k" | null}, ...]
--   deliverables: [{"platform": "instagram", "kind": "reel", "quantity": 2}, ...]
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
  deliverables jsonb
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
      price_kobo, places, applications_close_on, post_from, deliver_by
    )
    values (
      public.current_user_id(), title, brief, guidelines, niches,
      states::public.nigerian_state[], verified_only, price_kobo, places,
      applications_close_on, post_from, deliver_by
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
           deliver_by = save_campaign_draft.deliver_by
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

-- Status changes ----------------------------------------------------------------------

-- Today's date in Lagos, which is what the campaign dates mean.
create function public.lagos_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Africa/Lagos')::date
$$;

-- The one place campaign statuses change. Actions:
--   business (owner): submit, withdraw, pause, resume, close
--   admin:            approve, reject (note required), take_down (note required)
-- Returns the new status.
create function public.transition_campaign(
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
      if c.payment_model <> 'fixed' then
        raise exception 'only fixed-price campaigns can be published for now' using errcode = '0A000';
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
      -- A business is trusted once an admin has approved one of its campaigns.
      if exists (
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

-- Who qualifies -----------------------------------------------------------------------

-- Why a creator doesn't qualify for a campaign, as a list of problems (empty:
-- they qualify). Each is {"code": ..., "platform": ..., "min_followers": ...}.
-- Codes: no_profile, missing_platform, followers, not_verified, niche, state.
create function public.campaign_problems(campaign uuid, creator uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with k as (select * from public.campaigns where id = campaign),
       me as (select * from public.influencer_profiles where user_id = creator)
  select coalesce(jsonb_agg(problem), '[]'::jsonb)
  from (
    select jsonb_build_object('code', 'no_profile') as problem
     where not exists (select 1 from me)
    union all
    select jsonb_build_object(
             'code',
             case
               when s.user_id is null then 'missing_platform'
               when cp.min_followers is not null
                    and (s.effective_range is null or s.effective_range < cp.min_followers) then 'followers'
               else 'not_verified'
             end,
             'platform', cp.platform,
             'min_followers', cp.min_followers
           )
      from public.campaign_platforms cp
      cross join k
      left join public.creator_platform_status s
        on s.user_id = creator and s.platform = cp.platform
     where cp.campaign_id = campaign
       and exists (select 1 from me)
       and (
         s.user_id is null
         or (cp.min_followers is not null and (s.effective_range is null or s.effective_range < cp.min_followers))
         or (k.verified_only and not s.verified)
       )
    union all
    select jsonb_build_object('code', 'niche')
      from k, me
     where cardinality(k.niches) > 0 and not (k.niches && me.niches)
    union all
    select jsonb_build_object('code', 'state')
      from k, me
     where cardinality(k.states) > 0 and not (me.state = any (k.states))
  ) problems
$$;

-- How many listed creators qualify now: shown to the business before it
-- publishes. The owner or an admin only.
create function public.count_qualifying_creators(campaign uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.campaigns k
     where k.id = campaign
       and (k.business_id = public.current_user_id() or public.current_user_role() = 'admin')
  ) then
    raise exception 'no such campaign' using errcode = 'P0002';
  end if;
  return (
    select count(*)::integer
      from public.listed_creators c
     where public.campaign_problems(campaign, c.user_id) = '[]'::jsonb
  );
end;
$$;

-- Reading campaigns as a creator ----------------------------------------------------------

-- A campaign as creators (and admins) see it, with what they need to know
-- to decide: requirements, deliverables, dates, and why they don't qualify.
create function public.campaign_card(k public.campaigns, viewer uuid)
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
    'places', k.places,
    'applications_close_on', k.applications_close_on,
    'post_from', k.post_from,
    'deliver_by', k.deliver_by,
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

-- Open campaigns, newest first. Signed-in creators and admins only.
create function public.list_open_campaigns(
  niche_slug text default null,
  on_platform public.social_platform default null,
  qualified_only boolean default false,
  page_size integer default 24,
  page_offset integer default 0
)
returns table (campaign jsonb, total_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  viewer uuid := public.current_user_id();
begin
  if public.current_user_role() is distinct from 'influencer'
     and public.current_user_role() is distinct from 'admin' then
    raise exception 'campaigns are for signed-in creators' using errcode = '42501';
  end if;

  return query
    select cards.card, count(*) over ()
      from (
        select public.campaign_card(k, viewer) as card, k.published_at, k.id
          from public.campaigns k
         where k.status = 'open'
           and k.applications_close_on >= public.lagos_today()
           and (niche_slug is null or cardinality(k.niches) = 0 or niche_slug = any (k.niches))
           and (on_platform is null or exists (
                 select 1 from public.campaign_platforms p
                  where p.campaign_id = k.id and p.platform = on_platform))
      ) cards
     where not qualified_only or cards.card -> 'problems' = '[]'::jsonb
     order by cards.published_at desc, cards.id
     limit least(greatest(page_size, 1), 50)
    offset greatest(page_offset, 0);
end;
$$;

-- One campaign with its brief: creators while it's open, admins always.
create function public.get_campaign(campaign uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  viewer_role public.user_role := public.current_user_role();
  k public.campaigns;
begin
  select * into k from public.campaigns c where c.id = campaign;
  if k.id is null
     or not (
       viewer_role = 'admin'
       or (viewer_role = 'influencer' and k.status = 'open' and k.applications_close_on >= public.lagos_today())
     )
  then
    return null;
  end if;

  return public.campaign_card(k, public.current_user_id()) || jsonb_build_object(
    'brief', k.brief,
    'guidelines', k.guidelines,
    'removed_reason', k.removed_reason,
    -- Only edits made while live: creators never saw earlier versions.
    'revised_at', (
      select max(r.created_at) from public.campaign_revisions r
       where r.campaign_id = k.id and r.while_live
    )
  );
end;
$$;

-- For the landing page: proof that opportunities exist, nothing more.
create function public.open_campaign_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.campaigns k
   where k.status = 'open' and k.applications_close_on >= public.lagos_today()
$$;

-- Reports ---------------------------------------------------------------------------------

-- Creators can report a campaign they can see.
create function public.report_campaign(
  campaign uuid,
  reason_code public.campaign_report_reason,
  note text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() is distinct from 'influencer'
     or public.get_campaign(campaign) is null then
    raise exception 'no open campaign with that id' using errcode = 'P0002';
  end if;
  insert into public.campaign_reports (campaign_id, reason, details, reporter_user_id)
  values (campaign, reason_code, nullif(btrim(note), ''), public.current_user_id());
end;
$$;

create function public.resolve_campaign_report(report_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  admin_id uuid := public.current_user_id();
begin
  if admin_id is null or public.current_user_role() is distinct from 'admin' then
    raise exception 'only admins resolve reports' using errcode = '42501';
  end if;
  update public.campaign_reports r
     set resolved_by = admin_id, resolved_at = now()
   where r.id = report_id and r.resolved_at is null;
end;
$$;

-- Function grants ---------------------------------------------------------------------------

revoke all on function public.campaigns_before_write() from public, anon, authenticated;
revoke all on function public.campaigns_record_revision() from public, anon, authenticated;
revoke all on function public.campaign_problems(uuid, uuid) from public, anon, authenticated;
revoke all on function public.campaign_card(public.campaigns, uuid) from public, anon, authenticated;
-- deliverable_kind_allowed and lagos_today stay callable: check constraints
-- and functions run them as the caller, and they reveal nothing.

revoke all on function public.save_campaign_draft(uuid, text, text, text, text[], text[], boolean, bigint, integer, date, date, date, jsonb, jsonb) from public, anon;
revoke all on function public.transition_campaign(uuid, text, text) from public, anon;
revoke all on function public.count_qualifying_creators(uuid) from public, anon;
revoke all on function public.list_open_campaigns(text, public.social_platform, boolean, integer, integer) from public, anon;
revoke all on function public.get_campaign(uuid) from public, anon;
revoke all on function public.report_campaign(uuid, public.campaign_report_reason, text) from public, anon;
revoke all on function public.resolve_campaign_report(uuid) from public, anon;
revoke all on function public.open_campaign_count() from public;

grant execute on function public.save_campaign_draft(uuid, text, text, text, text[], text[], boolean, bigint, integer, date, date, date, jsonb, jsonb) to authenticated;
grant execute on function public.transition_campaign(uuid, text, text) to authenticated;
grant execute on function public.count_qualifying_creators(uuid) to authenticated;
grant execute on function public.list_open_campaigns(text, public.social_platform, boolean, integer, integer) to authenticated;
grant execute on function public.get_campaign(uuid) to authenticated;
grant execute on function public.report_campaign(uuid, public.campaign_report_reason, text) to authenticated;
grant execute on function public.resolve_campaign_report(uuid) to authenticated;
grant execute on function public.open_campaign_count() to anon, authenticated;

-- Table grants and row level security ----------------------------------------------------------

alter table public.campaigns enable row level security;
alter table public.campaign_platforms enable row level security;
alter table public.campaign_deliverables enable row level security;
alter table public.campaign_revisions enable row level security;
alter table public.campaign_reports enable row level security;

revoke all on table public.campaigns from anon, authenticated;
revoke all on table public.campaign_platforms from anon, authenticated;
revoke all on table public.campaign_deliverables from anon, authenticated;
revoke all on table public.campaign_revisions from anon, authenticated;
revoke all on table public.campaign_reports from anon, authenticated;

-- Businesses write their own campaigns' content; status, review and
-- timestamps change only through transition_campaign().
grant select, delete on table public.campaigns to authenticated;
grant insert (business_id, title, brief, guidelines, niches, states, verified_only,
              price_kobo, places, applications_close_on, post_from, deliver_by)
  on table public.campaigns to authenticated;
grant update (title, brief, guidelines, niches, states, verified_only,
              price_kobo, places, applications_close_on, post_from, deliver_by)
  on table public.campaigns to authenticated;

create policy "Businesses see their own campaigns, admins see all"
  on public.campaigns for select to authenticated
  using (
    business_id = (select public.current_user_id())
    or (select public.current_user_role()) = 'admin'
  );

create policy "Businesses create their own campaigns"
  on public.campaigns for insert to authenticated
  with check (
    business_id = (select public.current_user_id())
    and (select public.current_user_role()) = 'business'
  );

create policy "Businesses edit their own campaigns"
  on public.campaigns for update to authenticated
  using (business_id = (select public.current_user_id()))
  with check (business_id = (select public.current_user_id()));

create policy "Businesses delete drafts that never went live"
  on public.campaigns for delete to authenticated
  using (
    business_id = (select public.current_user_id())
    and status = 'draft'
    and published_at is null
  );

-- Platforms and deliverables: readable with their campaign, writable only
-- while it is the caller's draft.
grant select, insert, delete on table public.campaign_platforms to authenticated;
grant select, insert, delete on table public.campaign_deliverables to authenticated;

create policy "Platforms are visible with their campaign"
  on public.campaign_platforms for select to authenticated
  using (exists (select 1 from public.campaigns k where k.id = campaign_id));

create policy "Businesses set platforms on their drafts"
  on public.campaign_platforms for insert to authenticated
  with check (exists (
    select 1 from public.campaigns k
     where k.id = campaign_id and k.status = 'draft'
       and k.business_id = (select public.current_user_id())
  ));

create policy "Businesses remove platforms from their drafts"
  on public.campaign_platforms for delete to authenticated
  using (exists (
    select 1 from public.campaigns k
     where k.id = campaign_id and k.status = 'draft'
       and k.business_id = (select public.current_user_id())
  ));

create policy "Deliverables are visible with their campaign"
  on public.campaign_deliverables for select to authenticated
  using (exists (select 1 from public.campaigns k where k.id = campaign_id));

create policy "Businesses set deliverables on their drafts"
  on public.campaign_deliverables for insert to authenticated
  with check (exists (
    select 1 from public.campaigns k
     where k.id = campaign_id and k.status = 'draft'
       and k.business_id = (select public.current_user_id())
  ));

create policy "Businesses remove deliverables from their drafts"
  on public.campaign_deliverables for delete to authenticated
  using (exists (
    select 1 from public.campaigns k
     where k.id = campaign_id and k.status = 'draft'
       and k.business_id = (select public.current_user_id())
  ));

grant select on table public.campaign_revisions to authenticated;
create policy "Revisions are visible with their campaign"
  on public.campaign_revisions for select to authenticated
  using (exists (select 1 from public.campaigns k where k.id = campaign_id));

grant select on table public.campaign_reports to authenticated;
create policy "Admins see campaign reports"
  on public.campaign_reports for select to authenticated
  using ((select public.current_user_role()) = 'admin');

-- Admins review campaigns, so they need the business behind each one.
create policy "Admins can see every business profile"
  on public.business_profiles for select to authenticated
  using ((select public.current_user_role()) = 'admin');
