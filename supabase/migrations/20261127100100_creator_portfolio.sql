-- Creator portfolios: a cover image, up to six work samples, a public bio and
-- track record, sorting and handle search in the directory.
-- Design: docs/superpowers/specs/2026-11-23-creator-portfolio-design.md
--
-- Invariants this migration protects:
--   1. The directory is still read only through security-definer functions.
--      Everyone now sees the bio, the cover, the samples (image and caption)
--      and the track record. Handles, profile links, a sample's post link and
--      the starting rate stay for businesses and admins
--      (viewer_sees_creator_details()).
--   2. A search by anyone else never matches a handle, so searching can't
--      reveal one.
--   3. A creator has at most six samples: positions run 0 to 5 and are unique
--      per creator, so the cap holds under concurrent inserts too (the unique
--      index makes the second one wait and then fail).
--   4. Only the server sets cover_version and a sample's image_version (the
--      files it processed); only admins hide a sample or remove a cover, each
--      with a reason recorded in moderation_events.
--   5. Captions refuse contact details, and a post link is https on the
--      chosen platform's site, here as well as in the app.
--   6. Completed jobs count only hires that released money to the creator.

-- Cover -------------------------------------------------------------------------

-- Stored as <user_id>/cover-<version>.webp; null means none. Creators have no
-- update grant on it (column grants, 20261109133549).
alter table public.influencer_profiles
  add column cover_version integer,
  add constraint influencer_profiles_cover_version_check check (cover_version > 0);

-- Recreated so the view's column list includes cover_version (p.* is
-- expanded when a view is made). Same rows as before.
create or replace view public.listed_creators
with (security_invoker = true) as
  select p.*
    from public.influencer_profiles p
   where p.published
     and p.hidden_at is null
     and exists (select 1 from public.influencer_platforms pl where pl.user_id = p.user_id)
     and not public.is_suspended(p.user_id);

-- Samples ------------------------------------------------------------------------

create table public.portfolio_samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  position smallint not null,
  -- Stored as <user_id>/sample-<id>-<version>.webp. Null until the server has
  -- stored the image; such a row is never shown.
  image_version integer,
  caption text,
  -- Where the work ran.
  platform public.social_platform,
  post_url text,
  hidden_at timestamptz,
  hidden_reason text,
  hidden_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Deferrable so two samples can swap places in one statement.
  constraint portfolio_samples_position_unique unique (user_id, position) deferrable initially immediate,
  constraint portfolio_samples_position_check check (position between 0 and 5),
  constraint portfolio_samples_image_version_check check (image_version > 0),
  constraint portfolio_samples_caption_check
    check (caption = btrim(caption) and char_length(caption) between 1 and 140),
  constraint portfolio_samples_post_url_check
    check (post_url ~ '^https://[^\s]+$' and char_length(post_url) <= 500),
  constraint portfolio_samples_post_platform_check
    check (post_url is null or platform is not null),
  constraint portfolio_samples_hidden_check
    check ((hidden_at is null) = (hidden_reason is null) and (hidden_at is null) = (hidden_by is null)),
  constraint portfolio_samples_hidden_reason_check
    check (hidden_reason = btrim(hidden_reason) and char_length(hidden_reason) between 2 and 200)
);

comment on table public.portfolio_samples is
  'A creator''s work samples (at most six). Read publicly only through creator_portfolio().';

-- The hosts a post link may use, per platform. Mirrored in
-- src/lib/creator-profile.ts (POST_HOSTS).
create function public.post_url_fits_platform(url text, on_platform public.social_platform)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select exists (
    select 1
      from unnest(case on_platform
             when 'instagram' then array['instagram.com']
             when 'tiktok' then array['tiktok.com']
             when 'youtube' then array['youtube.com', 'youtu.be']
             when 'x' then array['x.com', 'twitter.com']
           end) as allowed (host),
           lower(substring(url from '^https://([^/?#:]+)')) as found (host)
     where found.host = allowed.host or found.host like '%.' || allowed.host
  )
$$;

-- Security definer: the helpers it calls have no grants.
create function public.portfolio_samples_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.caption is not null and public.contact_detail_kind(new.caption) is not null then
    raise exception 'contact_details' using errcode = 'P0001';
  end if;
  if new.post_url is not null and new.platform is not null
     and not public.post_url_fits_platform(new.post_url, new.platform) then
    raise exception 'post_url_invalid' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger portfolio_samples_before_write
  before insert or update on public.portfolio_samples
  for each row execute function public.portfolio_samples_before_write();

-- Swaps two of the caller's samples in one statement (the position index is
-- deferrable). Runs with the caller's rights, so row level security decides
-- whose samples can move.
create function public.swap_portfolio_samples(first_sample uuid, second_sample uuid)
returns void
language sql
volatile
set search_path = ''
as $$
  update public.portfolio_samples s
     set position = case s.id
                      when first_sample then (select o.position from public.portfolio_samples o where o.id = second_sample)
                      else (select o.position from public.portfolio_samples o where o.id = first_sample)
                    end
   where s.id in (first_sample, second_sample)
     and first_sample <> second_sample
     and (select count(*) from public.portfolio_samples o where o.id in (first_sample, second_sample)) = 2
$$;

-- Track record ------------------------------------------------------------------

create function public.creator_completed_jobs(creator uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.engagements e
   where e.creator_id = creator
     and e.status in ('accepted', 'auto_released')
     and e.released_kobo > 0
$$;

-- Read path ------------------------------------------------------------------------

drop function public.get_listed_creator(text);

create function public.get_listed_creator(creator_slug text)
returns table (
  user_id uuid,
  slug text,
  display_name text,
  photo_version integer,
  cover_version integer,
  state text,
  city text,
  niches text[],
  bio text,
  starting_rate_kobo bigint,
  allow_indexing boolean,
  platforms jsonb,
  updated_at timestamptz,
  details_visible boolean,
  completed_jobs integer,
  member_since timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  details boolean := public.viewer_sees_creator_details();
begin
  return query
    select c.user_id,
           c.slug,
           c.display_name,
           c.photo_version,
           c.cover_version,
           c.state::text,
           c.city,
           c.niches,
           c.bio,
           case when details then c.starting_rate_kobo end,
           c.allow_indexing,
           public.creator_platforms_json(c.user_id, details),
           c.updated_at,
           details,
           public.creator_completed_jobs(c.user_id),
           u.created_at
      from public.listed_creators c
      join public.users u on u.id = c.user_id
     where c.slug = creator_slug;
end;
$$;

-- The visible samples of a listed creator, in order. The post link only for
-- viewers who may see handles: a post's URL names the account.
create function public.creator_portfolio(creator_slug text)
returns table (
  id uuid,
  "position" smallint,
  image_version integer,
  caption text,
  platform public.social_platform,
  post_url text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  details boolean := public.viewer_sees_creator_details();
begin
  return query
    select s.id,
           s.position,
           s.image_version,
           s.caption,
           s.platform,
           case when details then s.post_url end
      from public.listed_creators c
      join public.portfolio_samples s on s.user_id = c.user_id
     where c.slug = creator_slug
       and s.hidden_at is null
       and s.image_version is not null
     order by s.position;
end;
$$;

drop function public.search_creators(text, public.social_platform, public.follower_range, text, bigint, integer, integer, text);

create function public.search_creators(
  niche_slug text default null,
  on_platform public.social_platform default null,
  min_followers public.follower_range default null,
  in_state text default null,
  max_rate_kobo bigint default null,
  page_size integer default 24,
  page_offset integer default 0,
  search text default null,
  sort text default 'newest'
)
returns table (
  user_id uuid,
  slug text,
  display_name text,
  photo_version integer,
  cover_version integer,
  state text,
  city text,
  niches text[],
  bio text,
  platforms jsonb,
  starting_rate_kobo bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  details boolean := public.viewer_sees_creator_details();
  pattern text := public.search_pattern(search);
  -- "@bayo.cooks" finds the handle bayo.cooks; only used for businesses and admins.
  handle_pattern text := public.search_pattern(ltrim(btrim(coalesce(search, '')), '@'));
begin
  -- Filtering by rate would reveal rates to people who can't see them.
  if max_rate_kobo is not null and not details then
    raise exception 'only businesses can filter by rate' using errcode = '42501';
  end if;
  if sort is null or sort not in ('newest', 'followers', 'verified') then
    raise exception 'unknown sort' using errcode = '22023';
  end if;

  return query
    select c.user_id,
           c.slug,
           c.display_name,
           c.photo_version,
           c.cover_version,
           c.state::text,
           c.city,
           c.niches,
           c.bio,
           public.creator_platforms_json(c.user_id, details),
           case when details then c.starting_rate_kobo end,
           count(*) over ()
      from public.listed_creators c
      -- The creator's biggest platform: the highest range, and at the same
      -- range a verified count before a self-reported one.
      left join lateral (
        select s.effective_range as top_range, s.verified as top_verified
          from public.creator_platform_status s
         where s.user_id = c.user_id
         order by s.effective_range desc nulls last, s.verified desc
         limit 1
      ) best on true
     where (niche_slug is null or niche_slug = any (c.niches))
       and (in_state is null or c.state = in_state)
       and (max_rate_kobo is null or c.starting_rate_kobo <= max_rate_kobo)
       and (
         (on_platform is null and min_followers is null)
         or exists (
           select 1
             from public.creator_platform_status s
            where s.user_id = c.user_id
              and (on_platform is null or s.platform = on_platform)
              and (min_followers is null or s.effective_range >= min_followers)
         )
       )
       and (
         pattern is null
         or c.display_name ilike pattern
         or c.city ilike pattern
         or c.state::text ilike pattern
         or exists (
           select 1 from public.niches n
            where n.slug = any (c.niches) and n.name ilike pattern
         )
         or (
           details
           and handle_pattern is not null
           and exists (
             select 1 from public.influencer_platforms pl
              where pl.user_id = c.user_id and pl.handle ilike handle_pattern
           )
         )
       )
     order by
       case when sort = 'followers' then best.top_range end desc nulls last,
       case when sort = 'followers' then best.top_verified end desc nulls last,
       case when sort = 'verified' then exists (
         select 1 from public.creator_platform_status s
          where s.user_id = c.user_id and s.verified
       ) end desc nulls last,
       c.created_at desc,
       c.user_id
     limit least(greatest(page_size, 1), 50)
    offset greatest(page_offset, 0);
end;
$$;

-- For the sitemap: a sample change counts as the page changing.
create or replace function public.indexable_creators()
returns table (slug text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.slug,
         greatest(c.updated_at, (select max(s.updated_at) from public.portfolio_samples s where s.user_id = c.user_id))
    from public.listed_creators c
   where c.allow_indexing
   order by c.created_at desc
   limit 50000
$$;

-- Admin takedowns ------------------------------------------------------------------

create function public.hide_portfolio_sample(sample uuid, reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  admin_id uuid := public.current_user_id();
  clean_reason text := btrim(reason);
  owner uuid;
begin
  if admin_id is null or public.current_user_role() is distinct from 'admin' then
    raise exception 'only admins take samples down' using errcode = '42501';
  end if;
  if clean_reason is null or char_length(clean_reason) not between 2 and 200 then
    raise exception 'give a reason of 2 to 200 characters' using errcode = '22023';
  end if;

  update public.portfolio_samples s
     set hidden_at = now(), hidden_reason = clean_reason, hidden_by = admin_id
   where s.id = sample and s.hidden_at is null
  returning s.user_id into owner;
  if owner is null then
    raise exception 'no such sample, or it is already down' using errcode = 'P0002';
  end if;

  insert into public.moderation_events (user_id, kind, actor_id, reason)
  values (owner, 'portfolio_sample_hidden', admin_id, clean_reason);
end;
$$;

-- Removes a creator's cover and returns the version that was removed (null if
-- there was none), so the server can delete the file.
create function public.clear_cover(creator uuid, reason text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  admin_id uuid := public.current_user_id();
  clean_reason text := btrim(reason);
  previous integer;
begin
  if admin_id is null or public.current_user_role() is distinct from 'admin' then
    raise exception 'only admins remove covers' using errcode = '42501';
  end if;
  if clean_reason is null or char_length(clean_reason) not between 2 and 200 then
    raise exception 'give a reason of 2 to 200 characters' using errcode = '22023';
  end if;

  select p.cover_version into previous
    from public.influencer_profiles p
   where p.user_id = creator
     for update;
  if previous is null then
    return null;
  end if;

  update public.influencer_profiles p set cover_version = null where p.user_id = creator;
  insert into public.moderation_events (user_id, kind, actor_id, reason)
  values (creator, 'cover_removed', admin_id, clean_reason);
  return previous;
end;
$$;

-- Grants and row level security ------------------------------------------------------

revoke all on function public.post_url_fits_platform(text, public.social_platform) from public, anon, authenticated;
revoke all on function public.portfolio_samples_before_write() from public, anon, authenticated;
revoke all on function public.creator_completed_jobs(uuid) from public, anon, authenticated;

revoke all on function public.swap_portfolio_samples(uuid, uuid) from public, anon;
grant execute on function public.swap_portfolio_samples(uuid, uuid) to authenticated;

revoke all on function public.get_listed_creator(text) from public;
revoke all on function public.creator_portfolio(text) from public;
revoke all on function public.search_creators(text, public.social_platform, public.follower_range, text, bigint, integer, integer, text, text) from public;
grant execute on function public.get_listed_creator(text) to anon, authenticated;
grant execute on function public.creator_portfolio(text) to anon, authenticated;
grant execute on function public.search_creators(text, public.social_platform, public.follower_range, text, bigint, integer, integer, text, text) to anon, authenticated;

revoke all on function public.hide_portfolio_sample(uuid, text) from public, anon;
revoke all on function public.clear_cover(uuid, text) from public, anon;
grant execute on function public.hide_portfolio_sample(uuid, text) to authenticated;
grant execute on function public.clear_cover(uuid, text) to authenticated;

alter table public.portfolio_samples enable row level security;
revoke all on table public.portfolio_samples from anon, authenticated;

-- image_version and hidden_* are not in these lists: the server and admins
-- set them (through the secret key and the functions above).
grant select, delete on table public.portfolio_samples to authenticated;
grant insert (user_id, position, caption, platform, post_url)
  on table public.portfolio_samples to authenticated;
grant update (position, caption, platform, post_url)
  on table public.portfolio_samples to authenticated;

create policy "Creators see their own samples, admins see all"
  on public.portfolio_samples for select to authenticated
  using (
    user_id = (select public.current_user_id())
    or (select public.current_user_role()) = 'admin'
  );

create policy "Creators add their own samples"
  on public.portfolio_samples for insert to authenticated
  with check (
    user_id = (select public.current_user_id())
    and (select public.current_user_role()) = 'influencer'
  );

create policy "Creators edit their own samples"
  on public.portfolio_samples for update to authenticated
  using (user_id = (select public.current_user_id()))
  with check (user_id = (select public.current_user_id()));

create policy "Creators remove their own samples"
  on public.portfolio_samples for delete to authenticated
  using (user_id = (select public.current_user_id()));
