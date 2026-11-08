-- Waitlist for the Stage 1 landing page.
--
-- Invariants this migration protects:
--   1. Visitors (the `anon` role) can add themselves and nothing else: no
--      SELECT, UPDATE or DELETE, and they can only write email, role and source.
--   2. Signed-in users (`authenticated`) get no access; there is no auth yet,
--      and the list is not theirs to read.
--   3. One row per email address, ignoring case.
--
-- The anon key ships to every browser, so anyone can call the REST API
-- directly and skip the server action's honeypot and rate limit. The checks
-- below are what still hold in that case. The service role (server-only,
-- bypasses RLS) is how we read the list later.

create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text not null,
  created_at timestamptz not null default now(),
  source text,

  constraint waitlist_role_check check (role in ('business', 'creator')),
  -- Same shape the server action accepts; the server stores it trimmed and
  -- lowercased, so anything else came from somewhere else.
  constraint waitlist_email_check check (
    char_length(email) <= 254
    and email = lower(btrim(email))
    and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ),
  constraint waitlist_source_check check (source is null or char_length(source) <= 64)
);

comment on table public.waitlist is
  'Pre-launch signups from the landing page. Insert-only for anon; read via service role.';

create unique index waitlist_email_lower_key on public.waitlist (lower(email));

alter table public.waitlist enable row level security;

-- Supabase grants every privilege on new public tables to anon and
-- authenticated by default. Take them all away, then give anon back only
-- what joining needs. id and created_at keep their defaults.
revoke all on table public.waitlist from anon, authenticated;
grant insert (email, role, source) on table public.waitlist to anon;

-- RLS still needs a policy to allow the insert. There's nothing about the
-- row to check beyond the constraints above, hence `true`.
create policy "Visitors can join the waitlist"
  on public.waitlist
  for insert
  to anon
  with check (true);
