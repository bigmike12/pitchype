-- Opaque storage folders: creators' pictures move from <user id>/... to
-- <media key>/..., so public image addresses stop carrying our user ids.
-- Approved by the owner 2026-11-23; the files are copied by
-- scripts/move-photos-to-media-keys.mjs (run order in docs/TODO.md).
--
-- Invariants this migration protects:
--   1. Every creator profile has one random media_key, unique, set by the
--      database and never by the creator (no column grant), and never
--      reused: it names the folder their photo, cover and samples live in.
--   2. The public read functions no longer hand out user ids to visitors or
--      creators: get_listed_creator() returns user_id only to businesses and
--      admins (who message and block by it) and says is_self instead;
--      search_creators() returns media_key in place of user_id.
--   3. creator_media_keys() lets signed-in people who already hold creator
--      ids (the portal's lists) find their folder keys; nobody signed out.

alter table public.influencer_profiles
  add column media_key uuid not null default gen_random_uuid(),
  add constraint influencer_profiles_media_key_unique unique (media_key);

-- Recreated so the view's column list includes media_key. Same rows.
create or replace view public.listed_creators
with (security_invoker = true) as
  select p.*
    from public.influencer_profiles p
   where p.published
     and p.hidden_at is null
     and exists (select 1 from public.influencer_platforms pl where pl.user_id = p.user_id)
     and not public.is_suspended(p.user_id);

drop function public.get_listed_creator(text);

create function public.get_listed_creator(creator_slug text)
returns table (
  user_id uuid,
  is_self boolean,
  media_key uuid,
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
  viewer uuid := public.current_user_id();
begin
  return query
    select case when details then c.user_id end,
           coalesce(c.user_id = viewer, false),
           c.media_key,
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

drop function public.search_creators(text, public.social_platform, public.follower_range, text, bigint, integer, integer, text, text);

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
  media_key uuid,
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
    select c.media_key,
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

-- The storage folder keys of the given creators, for the portal's lists
-- (applicants, conversations) that already carry creator ids.
create function public.creator_media_keys(creators uuid[])
returns table (user_id uuid, media_key uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id, p.media_key
    from public.influencer_profiles p
   where p.user_id = any (creators)
     and public.current_user_id() is not null
$$;

revoke all on function public.get_listed_creator(text) from public;
revoke all on function public.search_creators(text, public.social_platform, public.follower_range, text, bigint, integer, integer, text, text) from public;
revoke all on function public.creator_media_keys(uuid[]) from public, anon;
grant execute on function public.get_listed_creator(text) to anon, authenticated;
grant execute on function public.search_creators(text, public.social_platform, public.follower_range, text, bigint, integer, integer, text, text) to anon, authenticated;
grant execute on function public.creator_media_keys(uuid[]) to authenticated;
