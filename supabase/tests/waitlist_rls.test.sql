-- Proves the waitlist access rules from the create_waitlist migration.
-- Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

-- Visitors (anon) --------------------------------------------------------
set local role anon;

select lives_ok(
  $$ insert into public.waitlist (email, role, source) values ('ada@example.com', 'creator', 'landing') $$,
  'anon can join the waitlist'
);

select throws_ok(
  $$ insert into public.waitlist (email, role) values ('ada@example.com', 'business') $$,
  '23505', null,
  'the same email cannot join twice'
);

select throws_ok(
  $$ insert into public.waitlist (email, role) values ('Ada@Example.com', 'business') $$,
  '23514', null,
  'emails must arrive lowercased (so case variants cannot slip past the unique index)'
);

select throws_ok(
  $$ insert into public.waitlist (email, role) values ('bola@example.com', 'admin') $$,
  '23514', null,
  'role must be business or creator'
);

select throws_ok(
  $$ insert into public.waitlist (email, role) values ('not-an-email', 'business') $$,
  '23514', null,
  'email must look like an email address'
);

select throws_ok(
  $$ insert into public.waitlist (email, role) values (repeat('a', 250) || '@x.co', 'business') $$,
  '23514', null,
  'email longer than 254 characters is rejected'
);

select throws_ok(
  $$ insert into public.waitlist (email, role, source) values ('chidi@example.com', 'business', repeat('s', 65)) $$,
  '23514', null,
  'source longer than 64 characters is rejected'
);

select throws_ok(
  $$ insert into public.waitlist (email, role, created_at) values ('dayo@example.com', 'business', '2020-01-01') $$,
  '42501', null,
  'anon cannot set created_at'
);

select throws_ok(
  $$ insert into public.waitlist (id, email, role) values (gen_random_uuid(), 'efe@example.com', 'business') $$,
  '42501', null,
  'anon cannot set id'
);

select throws_ok(
  $$ select * from public.waitlist $$,
  '42501', null,
  'anon cannot read the waitlist'
);

select throws_ok(
  $$ update public.waitlist set role = 'business' $$,
  '42501', null,
  'anon cannot update the waitlist'
);

select throws_ok(
  $$ delete from public.waitlist $$,
  '42501', null,
  'anon cannot delete from the waitlist'
);

-- Signed-in users ---------------------------------------------------------
reset role;
set local role authenticated;

select throws_ok(
  $$ insert into public.waitlist (email, role) values ('funmi@example.com', 'creator') $$,
  '42501', null,
  'authenticated users cannot insert'
);

select throws_ok(
  $$ select * from public.waitlist $$,
  '42501', null,
  'authenticated users cannot read the waitlist'
);

-- What actually got stored -----------------------------------------------
reset role;

select is(
  -- Only this test's addresses: the local database may hold other rows.
  (select count(*)::int from public.waitlist
   where email in ('ada@example.com', 'bola@example.com', 'chidi@example.com',
                   'dayo@example.com', 'efe@example.com', 'funmi@example.com')),
  1,
  'only the one valid signup was stored'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.waitlist'::regclass),
  'row level security is enabled'
);

select * from finish();
rollback;
