-- Text search on the two lists people browse: creators (for businesses and
-- visitors) and open campaigns (for creators).
--
-- Rules this keeps:
--   1. Both lists are still read only through their functions, with the same
--      grants and the same visibility rules as before; this adds one optional
--      argument and changes nothing when it is null or blank.
--   2. Creator search matches only what every viewer may already see on a
--      card (name, city, state, niche names). It never matches the bio, handles or
--      rate, so a search cannot reveal what the viewer is not shown.
--   3. Campaign search matches the title, the brief and the business name,
--      all of which a creator who can list the campaign can already read.
--   4. The words are matched literally: %, _ and \ typed by a person are not
--      wildcards.

-- '%words%' for ILIKE with the person's wildcards escaped, or null for
-- nothing to search. At most 60 characters are used.
create function public.search_pattern(words text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when btrim(coalesce(words, '')) = '' then null
    else '%' || replace(replace(replace(left(btrim(words), 60),
           '\', '\\'), '%', '\%'), '_', '\_') || '%'
  end
$$;
revoke all on function public.search_pattern(text) from public;
grant execute on function public.search_pattern(text) to anon, authenticated;

-- Creators ---------------------------------------------------------------------
drop function public.search_creators(text, public.social_platform, public.follower_range, text, bigint, integer, integer);

create function public.search_creators(
  niche_slug text default null,
  on_platform public.social_platform default null,
  min_followers public.follower_range default null,
  in_state text default null,
  max_rate_kobo bigint default null,
  page_size integer default 24,
  page_offset integer default 0,
  search text default null
)
returns table (
  user_id uuid,
  slug text,
  display_name text,
  photo_version integer,
  state text,
  city text,
  niches text[],
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
begin
  -- Filtering by rate would reveal rates to people who can't see them.
  if max_rate_kobo is not null and not details then
    raise exception 'only businesses can filter by rate' using errcode = '42501';
  end if;

  return query
    select c.user_id,
           c.slug,
           c.display_name,
           c.photo_version,
           c.state::text,
           c.city,
           c.niches,
           public.creator_platforms_json(c.user_id, details),
           case when details then c.starting_rate_kobo end,
           count(*) over ()
      from public.listed_creators c
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
       )
     order by c.created_at desc, c.user_id
     limit least(greatest(page_size, 1), 50)
    offset greatest(page_offset, 0);
end;
$$;
revoke all on function public.search_creators(text, public.social_platform, public.follower_range, text, bigint, integer, integer, text) from public;
grant execute on function public.search_creators(text, public.social_platform, public.follower_range, text, bigint, integer, integer, text) to anon, authenticated;

-- Open campaigns ---------------------------------------------------------------
drop function public.list_open_campaigns(text, public.social_platform, boolean, integer, integer);

create function public.list_open_campaigns(
  niche_slug text default null,
  on_platform public.social_platform default null,
  qualified_only boolean default false,
  page_size integer default 24,
  page_offset integer default 0,
  search text default null
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
  pattern text := public.search_pattern(search);
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
           and public.held_places(k.id) < k.places
           and not public.is_suspended(k.business_id)
           and (niche_slug is null or cardinality(k.niches) = 0 or niche_slug = any (k.niches))
           and (on_platform is null or exists (
                 select 1 from public.campaign_platforms p
                  where p.campaign_id = k.id and p.platform = on_platform))
           and (pattern is null
                or k.title ilike pattern
                or k.brief ilike pattern
                or exists (
                  select 1 from public.business_profiles b
                   where b.user_id = k.business_id and b.business_name ilike pattern))
      ) cards
     where not qualified_only or cards.card -> 'problems' = '[]'::jsonb
     order by cards.published_at desc, cards.id
     limit least(greatest(page_size, 1), 50)
    offset greatest(page_offset, 0);
end;
$$;
revoke all on function public.list_open_campaigns(text, public.social_platform, boolean, integer, integer, text) from public, anon;
grant execute on function public.list_open_campaigns(text, public.social_platform, boolean, integer, integer, text) to authenticated;
