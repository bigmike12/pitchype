-- Creator profiles, the directory, verification and reports (Stage 3).
--
-- Invariants this migration protects:
--   1. The directory is read only through search_creators(),
--      get_listed_creator() and indexable_creators(). They return public
--      fields to everyone, and handles, bios and starting rates only when the
--      caller is a business or an admin. Visitors can't read the tables.
--   2. A profile is listed only while its creator has published it, no admin
--      has hidden it, and it has at least one platform (listed_creators).
--   3. A creator has at most three niches, all from public.niches.
--   4. Verification codes are made here, single-use, and tied to one user,
--      platform and handle. Only admins verify or reject. A handle is verified
--      on at most one account at a time, and changing or removing a handle
--      revokes its badge.
--   5. Creators can't set what the server or admins own: photo_version (set
--      by the server after it processes the image), hidden_at, slug and the
--      timestamps.

-- Niches ----------------------------------------------------------------------

create table public.niches (
  slug text primary key,
  name text not null unique,
  sort_order smallint not null,
  created_at timestamptz not null default now(),

  constraint niches_slug_check
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 40),
  constraint niches_name_check
    check (name = btrim(name) and char_length(name) between 2 and 40)
);

comment on table public.niches is
  'The fixed list creators pick niches from. Add one with an insert; no deploy needed.';

insert into public.niches (slug, name, sort_order) values
  ('food-and-drinks', 'Food and drinks', 10),
  ('fashion', 'Fashion', 20),
  ('beauty-and-skincare', 'Beauty and skincare', 30),
  ('tech-and-gadgets', 'Tech and gadgets', 40),
  ('lifestyle', 'Lifestyle', 50),
  ('travel', 'Travel', 60),
  ('fitness-and-wellness', 'Fitness and wellness', 70),
  ('comedy-and-skits', 'Comedy and skits', 80),
  ('music-and-entertainment', 'Music and entertainment', 90),
  ('education-and-career', 'Education and career', 100),
  ('finance-and-business', 'Finance and business', 110),
  ('parenting-and-family', 'Parenting and family', 120),
  ('faith-and-inspiration', 'Faith and inspiration', 130),
  ('gaming', 'Gaming', 140),
  ('home-and-decor', 'Home and décor', 150),
  ('automotive', 'Automotive', 160),
  ('sports', 'Sports', 170);

-- Types -----------------------------------------------------------------------
-- Mirrored in src/lib/creator-profile.ts; keep the lists in step.

create type public.social_platform as enum ('instagram', 'tiktok', 'youtube', 'x');

-- Smallest first: enum order is what makes ">= '10k_50k'" mean "10K or more".
create type public.follower_range as enum
  ('1k_5k', '5k_10k', '10k_50k', '50k_100k', '100k_plus');

create type public.verification_status as enum
  ('pending', 'verified', 'rejected', 'expired', 'revoked');

create type public.report_reason as enum
  ('inappropriate_photo', 'impersonation', 'spam_or_scam', 'other');

-- Creator profiles ------------------------------------------------------------

alter table public.influencer_profiles
  -- The public address, /creators/<slug>. Set on first publish, then fixed.
  add column slug text unique,
  add column bio text,
  add column niches text[] not null default '{}',
  -- Whole naira, stored as kobo (CLAUDE.md §6.1). Null means "negotiable".
  add column starting_rate_kobo bigint,
  -- Photos are stored as <user_id>/<photo_version>.webp; null means none.
  add column photo_version integer,
  add column published boolean not null default false,
  add column allow_indexing boolean not null default true,
  add column hidden_at timestamptz,
  add column hidden_reason text,

  add constraint influencer_profiles_slug_check
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 70),
  add constraint influencer_profiles_bio_check
    check (bio = btrim(bio) and char_length(bio) between 1 and 300),
  add constraint influencer_profiles_niches_check
    check (cardinality(niches) <= 3),
  add constraint influencer_profiles_published_niches_check
    check (not published or cardinality(niches) >= 1),
  add constraint influencer_profiles_starting_rate_check
    check (starting_rate_kobo between 100000 and 10000000000 and starting_rate_kobo % 100 = 0),
  add constraint influencer_profiles_photo_version_check
    check (photo_version > 0),
  add constraint influencer_profiles_hidden_check
    check ((hidden_at is null) = (hidden_reason is null)),
  add constraint influencer_profiles_hidden_reason_check
    check (hidden_reason = btrim(hidden_reason) and char_length(hidden_reason) between 2 and 200);

-- Checks niches against the list and gives a profile its address the first
-- time it is published. Security definer so the slug check sees every
-- profile, not just the caller's own row.
create function public.influencer_profiles_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  candidate text;
begin
  if exists (
       select 1 from unnest(new.niches) as chosen (slug)
       where chosen.slug not in (select n.slug from public.niches n)
     )
     or cardinality(new.niches) <> (select count(distinct n) from unnest(new.niches) as n)
  then
    raise exception 'niches must be distinct entries from public.niches'
      using errcode = '23514';
  end if;

  if new.published and new.slug is null then
    -- "Adébáyọ̀ Eats!" -> "adebayo-eats": strip accents, then anything else.
    base := btrim(
      regexp_replace(
        regexp_replace(normalize(lower(new.display_name), NFD), '[̀-ͯ]', '', 'g'),
        '[^a-z0-9]+', '-', 'g'
      ),
      '-'
    );
    if char_length(base) < 2 then
      base := 'creator';
    end if;
    candidate := base;
    while exists (select 1 from public.influencer_profiles p where p.slug = candidate) loop
      candidate := base || '-' || substr(md5(gen_random_uuid()::text), 1, 4);
    end loop;
    new.slug := candidate;
  end if;

  return new;
end;
$$;

create trigger influencer_profiles_before_write
  before insert or update on public.influencer_profiles
  for each row execute function public.influencer_profiles_before_write();

-- Platforms -------------------------------------------------------------------

create table public.influencer_platforms (
  user_id uuid not null references public.influencer_profiles (user_id) on delete cascade,
  platform public.social_platform not null,
  -- As it appears in the profile's URL: lowercase, no "@". The app applies
  -- each platform's own rules (src/lib/creator-profile.ts).
  handle text not null,
  -- Self-reported. Once verified, the verified count is shown instead.
  follower_range public.follower_range not null,
  followers_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, platform),
  constraint influencer_platforms_handle_check
    check (handle ~ '^[a-z0-9._-]{1,30}$')
);

create index influencer_platforms_handle_idx
  on public.influencer_platforms (platform, handle);

create function public.influencer_platforms_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.follower_range is distinct from old.follower_range then
    new.followers_updated_at := now();
  end if;
  return new;
end;
$$;

create trigger influencer_platforms_before_update
  before update on public.influencer_platforms
  for each row execute function public.influencer_platforms_before_update();

-- Verification ----------------------------------------------------------------

create table public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.influencer_profiles (user_id) on delete cascade,
  platform public.social_platform not null,
  handle text not null,
  code text not null unique,
  -- pending: waiting for the creator (submitted_at null) or for an admin.
  -- expired: not submitted in time, replaced by a new code, or the handle
  --   changed. revoked: the badge moved to another verification.
  status public.verification_status not null default 'pending',
  -- When the creator said the code is in their bio. Expiry stops applying
  -- then: the request waits for an admin however long that takes.
  submitted_at timestamptz,
  follower_count_seen integer,
  reviewed_by uuid references public.users (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,

  constraint verification_requests_code_check
    check (code ~ '^pitchype-[0-9A-Z]{6}$'),
  constraint verification_requests_count_check
    check (follower_count_seen >= 0),
  constraint verification_requests_verified_check
    check (status <> 'verified' or (
      follower_count_seen is not null and reviewed_by is not null and reviewed_at is not null
    ))
);

-- One verified account per handle, and one open request per platform.
create unique index verification_requests_one_verified_handle
  on public.verification_requests (platform, handle) where status = 'verified';
create unique index verification_requests_one_pending
  on public.verification_requests (user_id, platform) where status = 'pending';

-- Changing or removing a handle ends its verification: the badge belonged to
-- the old handle. Security definer: creators can't write these rows directly.
create function public.influencer_platforms_release_verification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.verification_requests r
     set status = case r.status
                    when 'verified' then 'revoked'::public.verification_status
                    else 'expired'::public.verification_status
                  end
   where r.user_id = old.user_id
     and r.platform = old.platform
     and r.handle = old.handle
     and r.status in ('pending', 'verified');
  return null;
end;
$$;

create trigger influencer_platforms_release_on_handle_change
  after update of handle on public.influencer_platforms
  for each row when (old.handle is distinct from new.handle)
  execute function public.influencer_platforms_release_verification();

create trigger influencer_platforms_release_on_delete
  after delete on public.influencer_platforms
  for each row execute function public.influencer_platforms_release_verification();

-- 6 characters from 32 (no 0/O or 1/I), from the random bytes of a v4 UUID.
create function public.new_verification_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  random_bytes bytea := uuid_send(gen_random_uuid());
  code text := 'pitchype-';
begin
  for i in 0..5 loop
    code := code || substr(alphabet, 1 + get_byte(random_bytes, i) % 32, 1);
  end loop;
  return code;
end;
$$;

-- Issues a fresh code for one of the caller's platforms, replacing any open
-- request for it. The handle comes from their saved platform, never the caller.
create function public.request_handle_verification(target_platform public.social_platform)
returns table (id uuid, code text, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  caller uuid := public.current_user_id();
  saved_handle text;
  new_code text;
begin
  if caller is null or public.current_user_role() is distinct from 'influencer' then
    raise exception 'only creators can verify a platform' using errcode = '42501';
  end if;

  select pl.handle into saved_handle
    from public.influencer_platforms pl
   where pl.user_id = caller and pl.platform = target_platform;
  if saved_handle is null then
    raise exception 'add this platform before verifying it' using errcode = 'P0002';
  end if;

  update public.verification_requests r
     set status = 'expired'
   where r.user_id = caller and r.platform = target_platform and r.status = 'pending';

  loop
    new_code := public.new_verification_code();
    exit when not exists (select 1 from public.verification_requests r where r.code = new_code);
  end loop;

  return query
    insert into public.verification_requests as r (user_id, platform, handle, code, expires_at)
    values (caller, target_platform, saved_handle, new_code, now() + interval '48 hours')
    returning r.id, r.code, r.expires_at;
end;
$$;

-- The creator says the code is in their bio; the request goes to admins.
create function public.submit_handle_verification(request_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.verification_requests r
     set submitted_at = now()
   where r.id = request_id
     and r.user_id = public.current_user_id()
     and r.status = 'pending'
     and r.submitted_at is null
     and r.expires_at > now();
  if not found then
    raise exception 'no open verification request' using errcode = 'P0002';
  end if;
end;
$$;

-- An admin checked the bio. Verifying moves the handle's badge to this
-- request, revoking any other (including an older one on the same account).
create function public.review_handle_verification(
  request_id uuid,
  approve boolean,
  follower_count integer default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  admin_id uuid := public.current_user_id();
  req public.verification_requests;
begin
  if admin_id is null or public.current_user_role() is distinct from 'admin' then
    raise exception 'only admins review verifications' using errcode = '42501';
  end if;

  select * into req
    from public.verification_requests r
   where r.id = request_id
     for update;
  if req.id is null or req.status <> 'pending' or req.submitted_at is null then
    raise exception 'this request is not waiting for review' using errcode = 'P0002';
  end if;

  if not approve then
    update public.verification_requests r
       set status = 'rejected', reviewed_by = admin_id, reviewed_at = now()
     where r.id = request_id;
    return;
  end if;

  if follower_count is null or follower_count < 0 then
    raise exception 'record the follower count you saw' using errcode = '22023';
  end if;

  update public.verification_requests r
     set status = 'revoked'
   where r.platform = req.platform
     and r.handle = req.handle
     and r.status = 'verified';

  update public.verification_requests r
     set status = 'verified',
         follower_count_seen = follower_count,
         reviewed_by = admin_id,
         reviewed_at = now()
   where r.id = request_id;
end;
$$;

-- Reports and moderation ------------------------------------------------------

create table public.profile_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.influencer_profiles (user_id) on delete cascade,
  reason public.report_reason not null,
  details text,
  -- Null when a signed-out visitor reported.
  reporter_user_id uuid references public.users (id) on delete set null,
  resolved_by uuid references public.users (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),

  constraint profile_reports_details_check
    check (details = btrim(details) and char_length(details) between 1 and 500),
  constraint profile_reports_resolved_check
    check ((resolved_at is null) = (resolved_by is null))
);

create index profile_reports_open_idx
  on public.profile_reports (created_at) where resolved_at is null;

-- The directory's read path ---------------------------------------------------
-- Internal views, used by the functions below and not exposed to the API.

create view public.listed_creators
with (security_invoker = true) as
  select p.*
    from public.influencer_profiles p
   where p.published
     and p.hidden_at is null
     and exists (select 1 from public.influencer_platforms pl where pl.user_id = p.user_id);

create function public.follower_range_for(follower_count integer)
returns public.follower_range
language sql
immutable
set search_path = ''
as $$
  select case
    when follower_count >= 100000 then '100k_plus'
    when follower_count >= 50000 then '50k_100k'
    when follower_count >= 10000 then '10k_50k'
    when follower_count >= 5000 then '5k_10k'
    when follower_count >= 1000 then '1k_5k'
  end::public.follower_range
$$;

-- Each platform with what is currently true about it. A verified platform's
-- range comes from the count an admin saw, not from what the creator typed.
create view public.creator_platform_status
with (security_invoker = true) as
  select pl.user_id,
         pl.platform,
         pl.handle,
         pl.follower_range as self_reported_range,
         pl.followers_updated_at,
         v.id is not null as verified,
         v.follower_count_seen as verified_follower_count,
         v.reviewed_at as verified_at,
         case
           when v.id is not null then public.follower_range_for(v.follower_count_seen)
           else pl.follower_range
         end as effective_range
    from public.influencer_platforms pl
    left join public.verification_requests v
      on v.user_id = pl.user_id
     and v.platform = pl.platform
     and v.handle = pl.handle
     and v.status = 'verified';

-- Handles, bios and rates are for businesses (and admins).
create function public.viewer_sees_creator_details()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() in ('business', 'admin'), false)
$$;

create function public.creator_platforms_json(creator uuid, with_handles boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'platform', s.platform,
        'handle', case when with_handles then s.handle end,
        'follower_range', s.effective_range,
        'followers_updated_at', s.followers_updated_at,
        'verified', s.verified,
        'verified_follower_count', s.verified_follower_count,
        'verified_at', s.verified_at
      )
      order by s.platform
    ),
    '[]'::jsonb
  )
  from public.creator_platform_status s
  where s.user_id = creator
$$;

create function public.search_creators(
  niche_slug text default null,
  on_platform public.social_platform default null,
  min_followers public.follower_range default null,
  in_state text default null,
  max_rate_kobo bigint default null,
  page_size integer default 24,
  page_offset integer default 0
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
     order by c.created_at desc, c.user_id
     limit least(greatest(page_size, 1), 50)
    offset greatest(page_offset, 0);
end;
$$;

create function public.get_listed_creator(creator_slug text)
returns table (
  user_id uuid,
  slug text,
  display_name text,
  photo_version integer,
  state text,
  city text,
  niches text[],
  bio text,
  starting_rate_kobo bigint,
  allow_indexing boolean,
  platforms jsonb,
  updated_at timestamptz,
  details_visible boolean
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
           c.state::text,
           c.city,
           c.niches,
           case when details then c.bio end,
           case when details then c.starting_rate_kobo end,
           c.allow_indexing,
           public.creator_platforms_json(c.user_id, details),
           c.updated_at,
           details
      from public.listed_creators c
     where c.slug = creator_slug;
end;
$$;

-- For the sitemap: listed creators who haven't opted out of search engines.
create function public.indexable_creators()
returns table (slug text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.slug, c.updated_at
    from public.listed_creators c
   where c.allow_indexing
   order by c.created_at desc
   limit 50000
$$;

-- Anyone can report a listed profile, signed in or not.
create function public.report_creator(
  creator_slug text,
  reason_code public.report_reason,
  note text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  reported uuid;
begin
  select c.user_id into reported from public.listed_creators c where c.slug = creator_slug;
  if reported is null then
    raise exception 'no listed creator with that address' using errcode = 'P0002';
  end if;

  insert into public.profile_reports (user_id, reason, details, reporter_user_id)
  values (reported, reason_code, nullif(btrim(note), ''), public.current_user_id());
end;
$$;

create function public.resolve_profile_report(report_id uuid)
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
  update public.profile_reports r
     set resolved_by = admin_id, resolved_at = now()
   where r.id = report_id and r.resolved_at is null;
end;
$$;

-- Hides a profile from the directory (with a reason) or shows it again
-- (null or blank reason).
create function public.set_creator_hidden(creator uuid, reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  clean_reason text := nullif(btrim(reason), '');
begin
  if public.current_user_role() is distinct from 'admin' then
    raise exception 'only admins hide profiles' using errcode = '42501';
  end if;
  update public.influencer_profiles p
     set hidden_at = case when clean_reason is null then null else now() end,
         hidden_reason = clean_reason
   where p.user_id = creator;
  if not found then
    raise exception 'no such creator' using errcode = 'P0002';
  end if;
end;
$$;

-- Function grants -------------------------------------------------------------
-- Functions are executable by PUBLIC by default. Internal helpers get no
-- grants; the rest are opened to exactly who may call them.

revoke all on function public.influencer_profiles_before_write() from public, anon, authenticated;
revoke all on function public.influencer_platforms_before_update() from public, anon, authenticated;
revoke all on function public.influencer_platforms_release_verification() from public, anon, authenticated;
revoke all on function public.new_verification_code() from public, anon, authenticated;
revoke all on function public.follower_range_for(integer) from public, anon, authenticated;
revoke all on function public.viewer_sees_creator_details() from public, anon, authenticated;
revoke all on function public.creator_platforms_json(uuid, boolean) from public, anon, authenticated;

revoke all on function public.search_creators(text, public.social_platform, public.follower_range, text, bigint, integer, integer) from public;
revoke all on function public.get_listed_creator(text) from public;
revoke all on function public.indexable_creators() from public;
revoke all on function public.report_creator(text, public.report_reason, text) from public;
grant execute on function public.search_creators(text, public.social_platform, public.follower_range, text, bigint, integer, integer) to anon, authenticated;
grant execute on function public.get_listed_creator(text) to anon, authenticated;
grant execute on function public.indexable_creators() to anon, authenticated;
grant execute on function public.report_creator(text, public.report_reason, text) to anon, authenticated;

revoke all on function public.request_handle_verification(public.social_platform) from public, anon;
revoke all on function public.submit_handle_verification(uuid) from public, anon;
revoke all on function public.review_handle_verification(uuid, boolean, integer) from public, anon;
revoke all on function public.resolve_profile_report(uuid) from public, anon;
revoke all on function public.set_creator_hidden(uuid, text) from public, anon;
grant execute on function public.request_handle_verification(public.social_platform) to authenticated;
grant execute on function public.submit_handle_verification(uuid) to authenticated;
grant execute on function public.review_handle_verification(uuid, boolean, integer) to authenticated;
grant execute on function public.resolve_profile_report(uuid) to authenticated;
grant execute on function public.set_creator_hidden(uuid, text) to authenticated;

-- Table grants and row level security -----------------------------------------

alter table public.niches enable row level security;
alter table public.influencer_platforms enable row level security;
alter table public.verification_requests enable row level security;
alter table public.profile_reports enable row level security;

revoke all on table public.niches from anon, authenticated;
revoke all on table public.influencer_platforms from anon, authenticated;
revoke all on table public.verification_requests from anon, authenticated;
revoke all on table public.profile_reports from anon, authenticated;
revoke all on table public.listed_creators from public, anon, authenticated;
revoke all on table public.creator_platform_status from public, anon, authenticated;

grant select on table public.niches to anon, authenticated;
create policy "Anyone can read the niche list"
  on public.niches for select to anon, authenticated
  using (true);

-- Creators edit their own profile (the Stage 2 policies); these columns join
-- the ones they could already set. Not photo_version, slug or hidden_*.
grant update (bio, niches, starting_rate_kobo, published, allow_indexing)
  on table public.influencer_profiles to authenticated;

create policy "Admins can see every creator profile"
  on public.influencer_profiles for select to authenticated
  using ((select public.current_user_role()) = 'admin');

grant select, delete on table public.influencer_platforms to authenticated;
grant insert (user_id, platform, handle, follower_range)
  on table public.influencer_platforms to authenticated;
grant update (handle, follower_range)
  on table public.influencer_platforms to authenticated;

create policy "Creators see their own platforms, admins see all"
  on public.influencer_platforms for select to authenticated
  using (
    user_id = (select public.current_user_id())
    or (select public.current_user_role()) = 'admin'
  );

create policy "Creators add their own platforms"
  on public.influencer_platforms for insert to authenticated
  with check (
    user_id = (select public.current_user_id())
    and (select public.current_user_role()) = 'influencer'
  );

create policy "Creators edit their own platforms"
  on public.influencer_platforms for update to authenticated
  using (user_id = (select public.current_user_id()))
  with check (user_id = (select public.current_user_id()));

create policy "Creators remove their own platforms"
  on public.influencer_platforms for delete to authenticated
  using (user_id = (select public.current_user_id()));

-- Requests are only written by the functions above.
grant select on table public.verification_requests to authenticated;
create policy "Creators see their own verification requests, admins see all"
  on public.verification_requests for select to authenticated
  using (
    user_id = (select public.current_user_id())
    or (select public.current_user_role()) = 'admin'
  );

-- Reports are only written by report_creator() and resolve_profile_report().
grant select on table public.profile_reports to authenticated;
create policy "Admins see reports"
  on public.profile_reports for select to authenticated
  using ((select public.current_user_role()) = 'admin');
