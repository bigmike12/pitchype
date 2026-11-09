-- Proves the access rules from the create_creator_directory migration.
-- People are simulated with the JWT claims Supabase Auth would send. Every
-- count is limited to this test's people: the local database may hold others.
-- Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(61);

-- Setup, as the database owner ------------------------------------------------
-- Ada is a business, Bayo and Chidi are creators, Dayo is an admin.

insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-00000000a001', 'aaaaaaaa-0000-0000-0000-000000000001', 'ada@example.com', 'business'),
  ('00000000-0000-0000-0000-00000000b002', 'aaaaaaaa-0000-0000-0000-000000000002', 'bayo@example.com', 'influencer'),
  ('00000000-0000-0000-0000-00000000c003', 'aaaaaaaa-0000-0000-0000-000000000003', 'chidi@example.com', 'influencer'),
  ('00000000-0000-0000-0000-00000000d004', 'aaaaaaaa-0000-0000-0000-000000000004', 'dayo@example.com', 'admin');

insert into public.business_profiles (user_id, business_name, contact_name, state, city)
values ('00000000-0000-0000-0000-00000000a001', 'Brightside Juice', 'Ada Obi', 'Lagos', 'Ikeja');

insert into public.influencer_profiles (user_id, display_name, state, city) values
  ('00000000-0000-0000-0000-00000000b002', 'Bayo Cooks', 'Oyo', 'Ibadan'),
  ('00000000-0000-0000-0000-00000000c003', 'Chídí Styles', 'Lagos', 'Yaba');

-- This test's creators as the directory returns them to whoever is asking
-- (the claims set below decide what the functions reveal).
create temporary view test_creators as
  select * from public.search_creators(page_size => 50)
   where user_id in ('00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-00000000c003');
grant select on test_creators to anon, authenticated;

-- Visitors ---------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{}';

select is((select count(*)::int from public.niches), 17, 'visitors can read the 17 niches');
select throws_ok($$ select * from public.influencer_profiles $$, '42501', null,
  'visitors cannot read creator profiles directly');
select throws_ok($$ select * from public.influencer_platforms $$, '42501', null,
  'visitors cannot read platforms (or handles) directly');
select throws_ok($$ select * from public.verification_requests $$, '42501', null,
  'visitors cannot read verification requests');
select throws_ok($$ select * from public.profile_reports $$, '42501', null,
  'visitors cannot read reports');
select throws_ok($$ select * from public.request_handle_verification('instagram') $$, '42501', null,
  'visitors cannot ask for a verification code');

-- Bayo, a creator ----------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000002", "email": "bayo@example.com"}';

select lives_ok(
  $$ insert into public.influencer_platforms (user_id, platform, handle, follower_range)
     values ('00000000-0000-0000-0000-00000000b002', 'instagram', 'bayocooks', '10k_50k') $$,
  'Bayo can add his Instagram');
select throws_ok(
  $$ insert into public.influencer_platforms (user_id, platform, handle, follower_range)
     values ('00000000-0000-0000-0000-00000000c003', 'youtube', 'fake', '1k_5k') $$,
  '42501', null, 'Bayo cannot add a platform to Chidi''s profile');
select throws_ok(
  $$ insert into public.influencer_platforms (user_id, platform, handle, follower_range)
     values ('00000000-0000-0000-0000-00000000b002', 'tiktok', '@Bayo Cooks', '1k_5k') $$,
  '23514', null, 'handles are stored lowercase, without @ or spaces');

select throws_ok(
  $$ update public.influencer_profiles
        set niches = '{food-and-drinks,lifestyle,travel,fashion}' $$,
  '23514', null, 'at most three niches');
select throws_ok(
  $$ update public.influencer_profiles set niches = '{astrology}' $$,
  '23514', null, 'niches come from the list');
select throws_ok(
  $$ update public.influencer_profiles set niches = '{fashion,fashion}' $$,
  '23514', null, 'a niche counts once');
select throws_ok(
  $$ update public.influencer_profiles set published = true $$,
  '23514', null, 'a profile needs a niche before it can be published');
select throws_ok(
  $$ update public.influencer_profiles set starting_rate_kobo = 5000 $$,
  '23514', null, 'a starting rate is at least ₦1,000');

select lives_ok(
  $$ update public.influencer_profiles
        set niches = '{food-and-drinks,lifestyle}',
            bio = 'Budget Nigerian recipes, every week.',
            starting_rate_kobo = 5000000,
            published = true $$,
  'Bayo can fill in his profile and publish it');
select is(
  (select slug from public.influencer_profiles where user_id = '00000000-0000-0000-0000-00000000b002'),
  'bayo-cooks', 'publishing gives the profile its address');

select throws_ok($$ update public.influencer_profiles set photo_version = 7 $$, '42501', null,
  'only the server sets the photo');
select throws_ok($$ update public.influencer_profiles set hidden_at = null, hidden_reason = null $$,
  '42501', null, 'only admins hide or unhide');
select throws_ok($$ update public.influencer_profiles set slug = 'pitchype' $$, '42501', null,
  'creators cannot choose their address');

select matches(
  (select code from public.request_handle_verification('instagram')),
  '^pitchype-[0-9A-Z]{6}$', 'Bayo gets a code like pitchype-7K3F9Q');
select lives_ok($$ select public.request_handle_verification('instagram') $$,
  'asking again issues a new code');
select is(
  (select array[count(*) filter (where status = 'pending'), count(*) filter (where status = 'expired')]::int[]
     from public.verification_requests),
  array[1, 1], 'and expires the old one');
select throws_ok($$ select public.request_handle_verification('youtube') $$, 'P0002', null,
  'only saved platforms can be verified');

select throws_ok($$ select public.submit_handle_verification(gen_random_uuid()) $$, 'P0002', null,
  'Bayo cannot submit a request that is not his');
select lives_ok(
  $$ select public.submit_handle_verification(
       (select id from public.verification_requests where status = 'pending')) $$,
  'Bayo says the code is in his bio');
select throws_ok(
  $$ select public.review_handle_verification(
       (select id from public.verification_requests where status = 'pending'), true, 99999) $$,
  '42501', null, 'creators cannot verify themselves');
select throws_ok(
  $$ insert into public.verification_requests (user_id, platform, handle, code, expires_at)
     values ('00000000-0000-0000-0000-00000000b002', 'instagram', 'bayocooks', 'pitchype-AAAAAA', now()) $$,
  '42501', null, 'requests are only made by the database');

-- Chidi, a creator who claims Bayo's handle too ------------------------------------
set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000003", "email": "chidi@example.com"}';

insert into public.influencer_platforms (user_id, platform, handle, follower_range) values
  ('00000000-0000-0000-0000-00000000c003', 'tiktok', 'chidistyles', '100k_plus'),
  ('00000000-0000-0000-0000-00000000c003', 'instagram', 'bayocooks', '1k_5k');
update public.influencer_profiles set niches = '{fashion}', published = true;

select is(
  (select slug from public.influencer_profiles where user_id = '00000000-0000-0000-0000-00000000c003'),
  'chidi-styles', 'addresses drop accents');

-- The directory, signed out ---------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{}';

select is((select count(*)::int from test_creators), 2, 'visitors see both published creators');
select ok(
  (select bool_and(p ->> 'handle' is null) from test_creators, jsonb_array_elements(platforms) p),
  'visitors see no handles');
select ok((select bool_and(starting_rate_kobo is null) from test_creators), 'visitors see no rates');
select throws_ok($$ select * from public.search_creators(max_rate_kobo => 6000000) $$, '42501', null,
  'visitors cannot filter by rate');

select is(
  (select array_agg(slug) from public.search_creators(niche_slug => 'food-and-drinks')
    where user_id in ('00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-00000000c003')),
  array['bayo-cooks'], 'filter by niche');
select is(
  (select array_agg(slug) from public.search_creators(on_platform => 'tiktok')
    where user_id in ('00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-00000000c003')),
  array['chidi-styles'], 'filter by platform');
select is(
  (select array_agg(slug) from public.search_creators(min_followers => '50k_100k')
    where user_id in ('00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-00000000c003')),
  array['chidi-styles'], 'filter by followers on any platform');
select is(
  (select count(*)::int from public.search_creators(on_platform => 'instagram', min_followers => '50k_100k')
    where user_id in ('00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-00000000c003')),
  0, 'platform and followers filter the same platform');
select is(
  (select array_agg(slug) from public.search_creators(in_state => 'Oyo')
    where user_id in ('00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-00000000c003')),
  array['bayo-cooks'], 'filter by state');

select is(
  (select row(display_name, bio, starting_rate_kobo, details_visible)::text
     from public.get_listed_creator('bayo-cooks')),
  row('Bayo Cooks', null::text, null::bigint, false)::text,
  'a visitor''s view of a profile has no bio or rate');

select lives_ok($$ select public.report_creator('bayo-cooks', 'impersonation', ' Not the real Bayo ') $$,
  'visitors can report a profile');
select throws_ok($$ select public.report_creator('nobody-here', 'spam_or_scam') $$, 'P0002', null,
  'only listed profiles can be reported');

-- Ada, a business ----------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "email": "ada@example.com"}';

select is(
  (select starting_rate_kobo from test_creators where slug = 'bayo-cooks'),
  5000000::bigint, 'businesses see starting rates');
select is(
  (select p ->> 'handle' from test_creators, jsonb_array_elements(platforms) p
    where slug = 'bayo-cooks' and p ->> 'platform' = 'instagram'),
  'bayocooks', 'businesses see handles');
select is(
  (select bio from public.get_listed_creator('bayo-cooks')),
  'Budget Nigerian recipes, every week.', 'businesses see bios');
select is(
  (select array_agg(slug) from public.search_creators(max_rate_kobo => 6000000)
    where user_id in ('00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-00000000c003')),
  array['bayo-cooks'], 'businesses filter by rate (negotiable rates are left out)');
select is(
  (select count(*)::int from public.influencer_profiles where user_id <> '00000000-0000-0000-0000-00000000a001'),
  0, 'the profile tables stay closed to businesses');
select throws_ok(
  $$ select public.set_creator_hidden('00000000-0000-0000-0000-00000000b002', 'Spam') $$,
  '42501', null, 'businesses cannot hide profiles');

-- Dayo, an admin --------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000004", "email": "dayo@example.com"}';

select lives_ok(
  $$ select public.review_handle_verification(
       (select id from public.verification_requests
         where user_id = '00000000-0000-0000-0000-00000000b002' and status = 'pending'),
       true, 12400) $$,
  'Dayo verifies Bayo''s Instagram');
select is(
  (select row(p ->> 'verified', p ->> 'verified_follower_count', p ->> 'follower_range')::text
     from test_creators, jsonb_array_elements(platforms) p
    where slug = 'bayo-cooks' and p ->> 'platform' = 'instagram'),
  row('true', '12400', '10k_50k')::text,
  'the directory shows the verified count and its range');

-- Chidi asks to verify the same handle: it goes to review, not an automatic no.
set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000003", "email": "chidi@example.com"}';
do $$
begin
  perform public.request_handle_verification('instagram');
  perform public.submit_handle_verification(
    (select id from public.verification_requests where status = 'pending'));
end
$$;

set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000004", "email": "dayo@example.com"}';
select lives_ok(
  $$ select public.review_handle_verification(
       (select id from public.verification_requests
         where user_id = '00000000-0000-0000-0000-00000000c003' and status = 'pending'),
       true, 13000) $$,
  'an admin can move a verified handle to the account that proves it now');
select is(
  (select array_agg(status::text order by user_id) from public.verification_requests
    where platform = 'instagram' and handle = 'bayocooks' and status in ('verified', 'revoked')),
  array['revoked', 'verified'], 'and the first account''s badge is revoked');

reset role;
select throws_ok(
  $$ insert into public.verification_requests
       (user_id, platform, handle, code, status, follower_count_seen, reviewed_by, reviewed_at, expires_at)
     values ('00000000-0000-0000-0000-00000000b002', 'instagram', 'bayocooks', 'pitchype-AAAAAA',
             'verified', 1, '00000000-0000-0000-0000-00000000d004', now(), now()) $$,
  '23505', null, 'a handle is verified on one account at most');

-- Changing a verified handle drops the badge.
set local role authenticated;
set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000003", "email": "chidi@example.com"}';
update public.influencer_platforms set handle = 'chidi.styles' where platform = 'instagram';
select is(
  (select status::text from public.verification_requests
    where user_id = '00000000-0000-0000-0000-00000000c003' and platform = 'instagram' and handle = 'bayocooks'
      and status <> 'expired'),
  'revoked', 'changing a verified handle revokes its badge');

-- An unsubmitted code expires.
do $$ begin perform public.request_handle_verification('tiktok'); end $$;
reset role;
update public.verification_requests set expires_at = now() - interval '1 minute'
 where user_id = '00000000-0000-0000-0000-00000000c003' and platform = 'tiktok' and status = 'pending';
set local role authenticated;
select throws_ok(
  $$ select public.submit_handle_verification((select id from public.verification_requests
                                                where platform = 'tiktok' and status = 'pending')) $$,
  'P0002', null, 'a code cannot be submitted after it expires');

-- Moderation ---------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000004", "email": "dayo@example.com"}';

select is(
  (select row(reason, details)::text from public.profile_reports
    where user_id = '00000000-0000-0000-0000-00000000b002'),
  row('impersonation'::public.report_reason, 'Not the real Bayo')::text,
  'admins read reports (details trimmed)');
select lives_ok(
  $$ select public.set_creator_hidden('00000000-0000-0000-0000-00000000b002', 'Reported as impersonation') $$,
  'admins can hide a profile');
select is((select count(*)::int from test_creators where slug = 'bayo-cooks'), 0,
  'a hidden profile leaves the directory');
select is((select count(*)::int from public.get_listed_creator('bayo-cooks')), 0,
  'and its page');
select lives_ok(
  $$ select public.resolve_profile_report(
       (select id from public.profile_reports where user_id = '00000000-0000-0000-0000-00000000b002')) $$,
  'admins can resolve a report');
select lives_ok($$ select public.set_creator_hidden('00000000-0000-0000-0000-00000000b002', null) $$,
  'admins can show it again');

-- Leaving the directory ------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000002", "email": "bayo@example.com"}';
delete from public.influencer_platforms where platform = 'instagram';
select is((select count(*)::int from test_creators where slug = 'bayo-cooks'), 0,
  'a profile with no platforms is not listed');

set local request.jwt.claims = '{"sub": "aaaaaaaa-0000-0000-0000-000000000003", "email": "chidi@example.com"}';
update public.influencer_profiles set allow_indexing = false;
select is((select count(*)::int from public.indexable_creators() where slug = 'chidi-styles'), 0,
  'creators can keep their page out of search engines');

select * from finish();
rollback;
