-- Proves the access rules from the create_users_and_profiles migration.
-- Signed-in people are simulated by setting the JWT claims Supabase Auth
-- would put on the request. Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(26);

-- Visitors (anon) -----------------------------------------------------------
set local role anon;

select throws_ok(
  $$ select * from public.users $$,
  '42501', null, 'visitors cannot read users'
);
select throws_ok(
  $$ select * from public.business_profiles $$,
  '42501', null, 'visitors cannot read business profiles'
);
select throws_ok(
  $$ select public.create_app_user('business') $$,
  '42501', null, 'visitors cannot create app users'
);

-- Ada: a business --------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "email": "Ada@Example.com"}';

select is(public.current_user_id(), null, 'no app user before the first sign-in');

select throws_ok(
  $$ select public.create_app_user('admin') $$,
  '42501', null, 'nobody can sign themselves up as an admin'
);

select isnt(public.create_app_user('business'), null, 'Ada becomes a business');

select is(
  public.create_app_user('influencer'),
  public.current_user_id(),
  'calling again returns the same account'
);

select is(public.current_user_role(), 'business'::public.user_role, 'and the role does not change');

select is(
  (select email from public.users),
  'ada@example.com',
  'email comes from the session, lowercased'
);

select throws_ok(
  $$ update public.users set role = 'admin' $$,
  '42501', null, 'people cannot change their user row (or role)'
);

select lives_ok(
  $$ insert into public.business_profiles (user_id, business_name, contact_name, state, city)
     values (public.current_user_id(), 'Brightside Juice', 'Ada Obi', 'Lagos', 'Ikeja') $$,
  'Ada can create her business profile'
);

select throws_ok(
  $$ insert into public.influencer_profiles (user_id, display_name, state, city)
     values (public.current_user_id(), 'Ada', 'Lagos', 'Ikeja') $$,
  '42501', null, 'a business cannot create a creator profile'
);

select throws_ok(
  $$ update public.business_profiles set state = 'Atlantis' $$,
  '23514', null, 'state must be a Nigerian state or the FCT'
);

select throws_ok(
  $$ update public.business_profiles set business_name = ' Padded ' $$,
  '23514', null, 'names must arrive trimmed'
);

select throws_ok(
  $$ update public.business_profiles set created_at = now() - interval '1 year' $$,
  '42501', null, 'created_at cannot be changed'
);

select throws_ok(
  $$ delete from public.business_profiles $$,
  '42501', null, 'profiles cannot be deleted through the API'
);

select lives_ok(
  $$ update public.business_profiles set city = 'Lekki' $$,
  'Ada can edit her profile'
);

-- Bayo: a creator ----------------------------------------------------------------
set local request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "email": "bayo@example.com"}';

select isnt(public.create_app_user('influencer'), null, 'Bayo becomes a creator');

select is((select count(*)::int from public.users), 1, 'Bayo sees only his own user row');
select is((select count(*)::int from public.business_profiles), 0, 'Bayo cannot see Ada''s profile');

update public.business_profiles set city = 'Hijacked';

select throws_ok(
  $$ insert into public.business_profiles (user_id, business_name, contact_name, state, city)
     select id, 'Fake Co', 'Bayo', 'Oyo', 'Ibadan' from public.users $$,
  '42501', null, 'a creator cannot create a business profile'
);

select lives_ok(
  $$ insert into public.influencer_profiles (user_id, display_name, state, city)
     values (public.current_user_id(), 'Bayo Cooks', 'Oyo', 'Ibadan') $$,
  'Bayo can create his creator profile'
);

select throws_ok(
  $$ update public.influencer_profiles set user_id = gen_random_uuid() $$,
  '42501', null, 'a profile cannot be moved to another user'
);

-- Back to Ada ------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "email": "ada@example.com"}';

select is(
  (select city from public.business_profiles),
  'Lekki',
  'Bayo''s update did not touch Ada''s profile'
);
select is((select count(*)::int from public.influencer_profiles), 0, 'Ada cannot see Bayo''s profile');

-- As the database owner ----------------------------------------------------------
reset role;

select is(
  -- Only this test's people: the local database may hold real admins.
  (select count(*)::int from public.users
   where role = 'admin'
     and auth_user_id in ('11111111-1111-1111-1111-111111111111',
                          '22222222-2222-2222-2222-222222222222')),
  0,
  'no admins were created'
);

select * from finish();
rollback;
