-- Users, roles and onboarding profiles (Stage 2).
--
-- Invariants this migration protects:
--   1. Every person has one app-owned identity in public.users with our own
--      id. The auth provider's id lives in auth_user_id; business data
--      references users.id, never the provider (CLAUDE.md §2a).
--   2. One role per account, fixed when the account is created: business or
--      influencer. Nobody can make themselves an admin; admins are created by
--      hand with SQL (see README).
--   3. People read only their own user row and their own profile, and can
--      only create or edit the profile that matches their role. Nobody
--      deletes anything through the API.
--   4. Only two functions read Supabase Auth (auth.uid() / auth.jwt()):
--      current_user_id() and create_app_user(). Moving to another auth
--      provider means rewriting those two, not every policy.

create type public.user_role as enum ('business', 'influencer', 'admin');

-- Nigeria's 36 states and the FCT. Mirrored in src/app/(app)/profile-input.ts;
-- keep the two lists in step.
create domain public.nigerian_state as text check (
  value in (
    'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue',
    'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT',
    'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi',
    'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo',
    'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara'
  )
);

-- Users ---------------------------------------------------------------------

create table public.users (
  id uuid primary key default gen_random_uuid(),
  -- The auth provider's user id (today: Supabase Auth). Deliberately no
  -- foreign key into the provider's schema.
  auth_user_id uuid not null unique,
  email text not null,
  role public.user_role not null,
  created_at timestamptz not null default now(),

  constraint users_email_check check (
    email = lower(btrim(email)) and char_length(email) between 3 and 254
  )
);

comment on table public.users is
  'App-owned identities. One row per person; role fixed at creation.';

-- Profiles ------------------------------------------------------------------
-- Created during onboarding. Platforms, niches and audience numbers arrive
-- with creator profiles in Stage 3.

create table public.business_profiles (
  user_id uuid primary key references public.users (id) on delete cascade,
  business_name text not null,
  contact_name text not null,
  state public.nigerian_state not null,
  city text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint business_profiles_business_name_check
    check (business_name = btrim(business_name) and char_length(business_name) between 2 and 100),
  constraint business_profiles_contact_name_check
    check (contact_name = btrim(contact_name) and char_length(contact_name) between 2 and 100),
  constraint business_profiles_city_check
    check (city = btrim(city) and char_length(city) between 2 and 60)
);

create table public.influencer_profiles (
  user_id uuid primary key references public.users (id) on delete cascade,
  display_name text not null,
  state public.nigerian_state not null,
  city text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint influencer_profiles_display_name_check
    check (display_name = btrim(display_name) and char_length(display_name) between 2 and 60),
  constraint influencer_profiles_city_check
    check (city = btrim(city) and char_length(city) between 2 and 60)
);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger business_profiles_set_updated_at
  before update on public.business_profiles
  for each row execute function public.set_updated_at();

create trigger influencer_profiles_set_updated_at
  before update on public.influencer_profiles
  for each row execute function public.set_updated_at();

-- The auth boundary in SQL --------------------------------------------------

-- The signed-in person's app user id, or null. Every policy goes through
-- this. Security definer so policies on public.users don't recurse.
create function public.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.users where auth_user_id = auth.uid()
$$;

create function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.users where id = public.current_user_id()
$$;

-- Creates the signed-in person's app user on first sign-in and returns its
-- id. Identity and email come from the verified session, never from the
-- caller. Calling it again returns the existing id and never changes the role.
create function public.create_app_user(requested_role public.user_role)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  caller_email text := lower(btrim(auth.jwt() ->> 'email'));
  app_user_id uuid;
begin
  if caller is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if requested_role not in ('business', 'influencer') then
    raise exception 'role % cannot be chosen at sign-up', requested_role
      using errcode = '42501';
  end if;

  insert into public.users (auth_user_id, email, role)
  values (caller, caller_email, requested_role)
  on conflict (auth_user_id) do nothing;

  select id into app_user_id from public.users where auth_user_id = caller;
  return app_user_id;
end;
$$;

-- Functions are executable by PUBLIC by default; narrow that to signed-in users.
revoke all on function public.current_user_id() from public, anon;
revoke all on function public.current_user_role() from public, anon;
revoke all on function public.create_app_user(public.user_role) from public, anon;
grant execute on function public.current_user_id() to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.create_app_user(public.user_role) to authenticated;

-- Grants and row level security ---------------------------------------------

alter table public.users enable row level security;
alter table public.business_profiles enable row level security;
alter table public.influencer_profiles enable row level security;

-- Supabase grants everything to anon and authenticated on new tables. Start
-- from nothing and add back exactly what the app needs.
revoke all on table public.users from anon, authenticated;
revoke all on table public.business_profiles from anon, authenticated;
revoke all on table public.influencer_profiles from anon, authenticated;

-- Users rows are only written by create_app_user().
grant select on table public.users to authenticated;

grant select on table public.business_profiles to authenticated;
grant insert (user_id, business_name, contact_name, state, city)
  on table public.business_profiles to authenticated;
grant update (business_name, contact_name, state, city)
  on table public.business_profiles to authenticated;

grant select on table public.influencer_profiles to authenticated;
grant insert (user_id, display_name, state, city)
  on table public.influencer_profiles to authenticated;
grant update (display_name, state, city)
  on table public.influencer_profiles to authenticated;

create policy "People can see their own user row"
  on public.users for select to authenticated
  using (id = (select public.current_user_id()));

create policy "Businesses can see their own profile"
  on public.business_profiles for select to authenticated
  using (user_id = (select public.current_user_id()));

create policy "Businesses can create their own profile"
  on public.business_profiles for insert to authenticated
  with check (
    user_id = (select public.current_user_id())
    and (select public.current_user_role()) = 'business'
  );

create policy "Businesses can edit their own profile"
  on public.business_profiles for update to authenticated
  using (user_id = (select public.current_user_id()))
  with check (
    user_id = (select public.current_user_id())
    and (select public.current_user_role()) = 'business'
  );

create policy "Creators can see their own profile"
  on public.influencer_profiles for select to authenticated
  using (user_id = (select public.current_user_id()));

create policy "Creators can create their own profile"
  on public.influencer_profiles for insert to authenticated
  with check (
    user_id = (select public.current_user_id())
    and (select public.current_user_role()) = 'influencer'
  );

create policy "Creators can edit their own profile"
  on public.influencer_profiles for update to authenticated
  using (user_id = (select public.current_user_id()))
  with check (
    user_id = (select public.current_user_id())
    and (select public.current_user_role()) = 'influencer'
  );
