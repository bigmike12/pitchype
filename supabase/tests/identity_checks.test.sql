-- Proves the rules from the identity_checks migration: kinds pair with roles;
-- one open check per person and kind; the same provider event twice decides
-- and notifies once; a decided check never moves because of a later event; the
-- same ID on another account (or the same RC/BN number) is held for an admin,
-- not verified and not rejected; attempt caps count only answered checks and an
-- admin can reopen them; a director check needs a verified CAC check; admins
-- decide held checks with a reason and the person is told; people read only
-- their own checks and never the fingerprint; no client role reads the secret
-- or event tables or calls a service-role function; short-lived BVN secrets
-- are removed on failure and on expiry; screening_state follows the latest
-- screening and its review.
-- Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(155);

-- The service role cannot read the tables, so tests that act as it look
-- references and ids up through these (run as the test's own role).
create function pg_temp.ref_of(person uuid, check_kind text default null) returns text
language sql security definer as $f$
  select reference from public.identity_checks
   where user_id = person and (check_kind is null or kind = check_kind) order by created_at desc limit 1
$f$;
create function pg_temp.id_of(person uuid) returns uuid
language sql security definer as $f$
  select id from public.identity_checks where user_id = person order by created_at desc limit 1
$f$;
grant execute on function pg_temp.ref_of(uuid, text) to public;
grant execute on function pg_temp.id_of(uuid) to public;

-- Cora..Hal are creators, Bayo, Bisi and Bode businesses, Zed an admin.
insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000f1001', 'f1f1f1f1-0000-0000-0000-0000000f1001', 'cora.idc@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000f1002', 'f1f1f1f1-0000-0000-0000-0000000f1002', 'cyd.idc@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000f1003', 'f1f1f1f1-0000-0000-0000-0000000f1003', 'dee.idc@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000f1004', 'f1f1f1f1-0000-0000-0000-0000000f1004', 'eve.idc@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000f1005', 'f1f1f1f1-0000-0000-0000-0000000f1005', 'fay.idc@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000f1006', 'f1f1f1f1-0000-0000-0000-0000000f1006', 'gus.idc@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000f1007', 'f1f1f1f1-0000-0000-0000-0000000f1007', 'hal.idc@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000f2001', 'f1f1f1f1-0000-0000-0000-0000000f2001', 'bayo.idc@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000f2002', 'f1f1f1f1-0000-0000-0000-0000000f2002', 'bisi.idc@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000f2003', 'f1f1f1f1-0000-0000-0000-0000000f2003', 'bode.idc@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000f9001', 'f1f1f1f1-0000-0000-0000-0000000f9001', 'zed.idc@example.com', 'admin');

-- Kinds pair with roles ----------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f2001"}'; -- Bayo, a business
select throws_ok($$ select public.start_identity_check('creator_nin', 'Bayo Business') $$,
  'P0001', 'not_allowed', 'a business cannot start a creator check');
select throws_ok($$ select public.start_identity_check('nonsense', 'Bayo Business') $$,
  'P0001', 'invalid_kind', 'an unknown kind is refused');
select throws_ok($$ select public.start_identity_check('director_bvn', 'Bayo Business') $$,
  'P0001', 'identity_required', 'a director check needs a verified CAC check first');
set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f1001"}'; -- Cora, a creator
select throws_ok($$ select public.start_identity_check('owner_bvn', 'Cora Creator') $$,
  'P0001', 'not_allowed', 'a creator cannot start a business check');
select throws_ok($$ select public.start_identity_check('creator_nin', 'ab') $$,
  'P0001', 'invalid_legal_name', 'a legal name under 3 characters is refused');
select throws_ok($$ select public.start_identity_check('creator_nin', repeat('x', 201)) $$,
  'P0001', 'invalid_legal_name', 'and one over 200');

-- Starting and resuming --------------------------------------------------------------------------------------
select lives_ok($$ select public.start_identity_check('creator_nin', 'Cora Creator') $$,
  'a creator starts a creator check');
reset role;
select is((select status from public.identity_checks where user_id = '00000000-0000-0000-0000-0000000f1001'),
  'started', 'it is started');
select matches(pg_temp.ref_of('00000000-0000-0000-0000-0000000f1001'),
  '^pit_id_[0-9a-f]{32}$', 'with a pit_id_ reference');
set local role authenticated;
set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f1001"}';
select is((select (public.start_identity_check('creator_nin', 'Cora C Creator') ->> 'resumed')::boolean),
  true, 'starting again resumes the same session');
reset role;
select is((select count(*)::int from public.identity_checks where user_id = '00000000-0000-0000-0000-0000000f1001'),
  1, 'no second row');
select is((select legal_name_entered from public.identity_checks where user_id = '00000000-0000-0000-0000-0000000f1001'),
  'Cora C Creator', 'the resumed session takes the latest name entered');
select throws_ok($$ insert into public.identity_checks (user_id, kind, legal_name_entered, reference)
  values ('00000000-0000-0000-0000-0000000f1001', 'creator_nin', 'Cora Creator', 'pit_id_second') $$,
  '23505', null, 'the database allows one open check per person and kind');

-- A verified decision, once -----------------------------------------------------------------------------------
set local role service_role;
select is(public.finish_identity_check(
    pg_temp.ref_of('00000000-0000-0000-0000-0000000f1001'),
    jsonb_build_object('status', 'verified', 'legal_name_on_record', 'cora creator', 'id_last3', '789',
                       'id_fingerprint', 'v1:fp-cora', 'date_of_birth', '1992-10-10', 'counted', true),
    'dojah:cora:Completed'),
  'verified', 'a verified decision verifies');
select is(public.identity_verified('00000000-0000-0000-0000-0000000f1001'), true, 'identity_verified is true');
select is(public.finish_identity_check(
    pg_temp.ref_of('00000000-0000-0000-0000-0000000f1001'),
    jsonb_build_object('status', 'verified', 'legal_name_on_record', 'cora creator', 'id_last3', '789',
                       'id_fingerprint', 'v1:fp-cora', 'counted', true),
    'dojah:cora:Completed'),
  'duplicate', 'the same event key again is a duplicate');
select is(public.finish_identity_check(
    pg_temp.ref_of('00000000-0000-0000-0000-0000000f1001'),
    jsonb_build_object('status', 'pending'), 'dojah:cora:Pending'),
  'ignored', 'a late Pending after Completed does not undo it');
reset role;
select is((select count(*)::int from public.notifications
            where user_id = '00000000-0000-0000-0000-0000000f1001' and kind = 'identity_verified'),
  1, 'the person is told once');
select is((select status from public.identity_checks where user_id = '00000000-0000-0000-0000-0000000f1001'),
  'verified', 'the check stays verified');
select is((select legal_name_on_record from public.identity_checks where user_id = '00000000-0000-0000-0000-0000000f1001'),
  'CORA CREATOR', 'the name on record is stored upper-cased');
select is((select date_of_birth from public.identity_checks where user_id = '00000000-0000-0000-0000-0000000f1001'),
  '1992-10-10'::date, 'with the date of birth');
set local role authenticated;
set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f1001"}';
select throws_ok($$ select public.start_identity_check('creator_nin', 'Cora Creator') $$,
  'P0001', 'already_verified', 'a verified creator cannot start again');
reset role;

-- Bad decisions --------------------------------------------------------------------------------------------------
set local role service_role;
select is(public.finish_identity_check('pit_id_nobody', '{"status": "failed"}', 'dojah:nobody:Failed'),
  'unknown_reference', 'an unknown reference is reported, not applied');
select throws_ok($$ select public.finish_identity_check('pit_id_nobody', '{"status": "ongoing"}', 'k') $$,
  'P0001', 'invalid_decision', 'a status that is not a decision is refused');
reset role;

-- The same ID on another account ----------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f1002"}'; -- Cyd
select lives_ok($$ select public.start_identity_check('creator_nin', 'Cyd Creator') $$, 'Cyd starts a check');
reset role;
set local role service_role;
select throws_ok($$ select public.finish_identity_check(
    pg_temp.ref_of('00000000-0000-0000-0000-0000000f1002'),
    jsonb_build_object('status', 'verified', 'legal_name_on_record', 'CYD CREATOR', 'counted', true),
    'dojah:cyd:nofp') $$,
  'P0001', 'invalid_decision', 'a verified person check without a fingerprint is refused');
select is(public.finish_identity_check(
    pg_temp.ref_of('00000000-0000-0000-0000-0000000f1002'),
    jsonb_build_object('status', 'verified', 'legal_name_on_record', 'CYD CREATOR', 'id_last3', '789',
                       'id_fingerprint', 'v1:fp-cora', 'counted', true),
    'dojah:cyd:Completed'),
  'needs_review', 'a fingerprint already verified on another account is held for review');
select is(public.identity_verified('00000000-0000-0000-0000-0000000f1002'), false, 'the held person is not verified');
reset role;
select is((select failure_reason from public.identity_checks where user_id = '00000000-0000-0000-0000-0000000f1002'),
  'duplicate_identity', 'with the reason duplicate_identity');
select is((select count(*)::int from public.notifications
            where user_id = '00000000-0000-0000-0000-0000000f1002' and kind = 'identity_needs_review'),
  1, 'and is told it is being looked at');
set local role authenticated;
set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f1002"}';
select throws_ok($$ select public.start_identity_check('creator_nin', 'Cyd Creator') $$,
  'P0001', 'check_in_review', 'a check in review blocks a new one');
reset role;

-- A failed decision and its words ------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f1003"}'; -- Dee
select lives_ok($$ select public.start_identity_check('creator_nin', 'Dee Creator') $$, 'Dee starts a check');
reset role;
set local role service_role;
select is(public.finish_identity_check(
    pg_temp.ref_of('00000000-0000-0000-0000-0000000f1003'),
    jsonb_build_object('status', 'failed', 'reason', 'selfie_mismatch', 'counted', true,
                       'failure_detail', 'No match'),
    'dojah:dee:Failed'),
  'failed', 'a failed decision fails the check');
reset role;
select is((select data ->> 'reason' from public.notifications
            where user_id = '00000000-0000-0000-0000-0000000f1003' and kind = 'identity_failed'),
  'selfie_mismatch', 'the person is told why');
select is((select id_fingerprint from public.identity_checks where user_id = '00000000-0000-0000-0000-0000000f1003'),
  null, 'a failed check stores no fingerprint');
set local role authenticated;
set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f1003"}';
select lives_ok($$ select public.start_identity_check('creator_nin', 'Dee Creator') $$,
  'after a failure the person can start again');
reset role;

-- Attempt caps ---------------------------------------------------------------------------------------------------------
-- Eve: three answered attempts in a day, then refused.
do $$
declare
  n integer;
  ref text;
begin
  for n in 1..3 loop
    perform set_config('request.jwt.claims', '{"sub": "f1f1f1f1-0000-0000-0000-0000000f1004"}', true);
    set local role authenticated;
    ref := public.start_identity_check('creator_nin', 'Eve Creator') ->> 'reference';
    reset role;
    set local role service_role;
    perform public.finish_identity_check(ref, jsonb_build_object('status', 'failed', 'reason', 'other', 'counted', true),
      'dojah:eve:' || n);
    reset role;
  end loop;
end;
$$;
set local role authenticated;
set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f1004"}';
select throws_ok($$ select public.start_identity_check('creator_nin', 'Eve Creator') $$,
  'P0001', 'attempt_limit', 'three answered attempts in 24 hours reach the cap');
reset role;

-- Fay: three abandoned sessions that never reached the provider do not count.
do $$
declare
  n integer;
  ref text;
begin
  for n in 1..3 loop
    perform set_config('request.jwt.claims', '{"sub": "f1f1f1f1-0000-0000-0000-0000000f1005"}', true);
    set local role authenticated;
    ref := public.start_identity_check('creator_nin', 'Fay Creator') ->> 'reference';
    reset role;
    set local role service_role;
    perform public.finish_identity_check(ref, jsonb_build_object('status', 'abandoned'), 'dojah:fay:' || n);
    reset role;
  end loop;
end;
$$;
set local role authenticated;
set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f1005"}';
select lives_ok($$ select public.start_identity_check('creator_nin', 'Fay Creator') $$,
  'abandoned sessions do not count toward the cap');
reset role;

-- Gus: five answered attempts, all older than a day, reach the total cap.
insert into public.identity_checks (user_id, kind, status, reference, legal_name_entered, counted, created_at)
select '00000000-0000-0000-0000-0000000f1006', 'creator_nin', 'failed', 'pit_id_gus' || n, 'Gus Creator', true,
       now() - interval '3 days'
  from generate_series(1, 5) n;
set local role authenticated;
set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f1006"}';
select throws_ok($$ select public.start_identity_check('creator_nin', 'Gus Creator') $$,
  'P0001', 'attempt_limit', 'five answered attempts in total reach the cap even when old');
-- Only an admin can reopen it.
select throws_ok($$ select public.allow_identity_retry('00000000-0000-0000-0000-0000000f1006', 'please') $$,
  'P0001', 'not_allowed', 'a person cannot reopen their own cap');
set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f9001"}'; -- Zed
select throws_ok($$ select public.allow_identity_retry('00000000-0000-0000-0000-0000000f1006', '  ') $$,
  'P0001', 'identity_reason_required', 'an admin must give a reason');
select lives_ok($$ select public.allow_identity_retry('00000000-0000-0000-0000-0000000f1006', 'Phone camera was broken') $$,
  'an admin reopens the cap');
set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f1006"}';
select lives_ok($$ select public.start_identity_check('creator_nin', 'Gus Creator') $$,
  'and the person can start again');
reset role;
select is((select granted_by from public.identity_retry_grants where user_id = '00000000-0000-0000-0000-0000000f1006'),
  '00000000-0000-0000-0000-0000000f9001'::uuid, 'the grant records who allowed it');

-- Registered businesses: CAC, duplicate RC numbers, then a director ----------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f2001"}'; -- Bayo
select lives_ok($$ select public.start_identity_check('business_cac', 'Acme Foods Limited') $$, 'Bayo starts a CAC check');
reset role;
set local role service_role;
select throws_ok($$ select public.finish_identity_check(
    pg_temp.ref_of('00000000-0000-0000-0000-0000000f2001'),
    jsonb_build_object('status', 'verified', 'counted', true), 'cac:bayo:0') $$,
  'P0001', 'invalid_decision', 'a verified CAC check needs the company and its number');
select is(public.finish_identity_check(
    pg_temp.ref_of('00000000-0000-0000-0000-0000000f2001'),
    jsonb_build_object('status', 'verified', 'company_name_on_record', 'ACME FOODS LIMITED',
                       'company_type', 'COMPANY', 'registration_number', '1234567', 'counted', true,
                       'directors', jsonb_build_array('JOHN MUSA'),
                       'cac_cache', jsonb_build_object('company_name', 'ACME FOODS LIMITED')),
    'cac:bayo:1'),
  'verified', 'a found, active, matching company verifies');
select is(public.identity_verified('00000000-0000-0000-0000-0000000f2001'), true, 'the business is verified');
select is(public.director_verified('00000000-0000-0000-0000-0000000f2001'), false, 'but not yet its director');
reset role;
select is((select directors from public.identity_checks where user_id = '00000000-0000-0000-0000-0000000f2001'),
  '["JOHN MUSA"]'::jsonb, 'the directors from CAC are stored');
select isnt((select directors_fetched_at from public.identity_checks where user_id = '00000000-0000-0000-0000-0000000f2001'),
  null, 'with when they were fetched');

set local role authenticated;
set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f2002"}'; -- Bisi, same RC number
select lives_ok($$ select public.start_identity_check('business_cac', 'Acme Foods Ltd') $$, 'Bisi starts a CAC check');
reset role;
set local role service_role;
select is(public.finish_identity_check(
    pg_temp.ref_of('00000000-0000-0000-0000-0000000f2002'),
    jsonb_build_object('status', 'verified', 'company_name_on_record', 'ACME FOODS LIMITED',
                       'company_type', 'COMPANY', 'registration_number', '1234567', 'counted', true),
    'cac:bisi:1'),
  'needs_review', 'the same RC number on another business is held for review');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f2002"}';
select throws_ok($$ select public.start_identity_check('owner_bvn', 'Bisi Owner') $$,
  'P0001', 'check_in_review', 'an owner check is blocked while the CAC check is in review');
select throws_ok($$ select public.start_identity_check('director_bvn', 'Bisi Owner') $$,
  'P0001', 'identity_required', 'and a director check needs a verified CAC check');
set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f2001"}';
select throws_ok($$ select public.start_identity_check('owner_bvn', 'Bayo Owner') $$,
  'P0001', 'already_verified', 'a verified business cannot start an owner check');
select lives_ok($$ select public.start_identity_check('director_bvn', 'John Musa') $$,
  'a business with a verified CAC check starts a director check');
reset role;
set local role service_role;
select is(public.finish_identity_check(
    pg_temp.ref_of('00000000-0000-0000-0000-0000000f2001', 'director_bvn'),
    jsonb_build_object('status', 'verified', 'legal_name_on_record', 'JOHN MUSA', 'id_last3', '111',
                       'id_fingerprint', 'v1:fp-director', 'counted', true),
    'dojah:director:Completed'),
  'verified', 'the director check verifies');
select is(public.director_verified('00000000-0000-0000-0000-0000000f2001'), true, 'director_verified is true');
select is(public.identity_fingerprint_matches('00000000-0000-0000-0000-0000000f2001', 'director_bvn', 'v1:fp-director'),
  true, 'the director fingerprint matches');
select is(public.identity_fingerprint_matches('00000000-0000-0000-0000-0000000f2001', 'director_bvn', 'v1:other'),
  false, 'another fingerprint does not');
select is(public.identity_fingerprint_matches('00000000-0000-0000-0000-0000000f2002', 'director_bvn', 'v1:fp-director'),
  false, 'and nobody else matches it');
select is(public.recent_cac_cache('00000000-0000-0000-0000-0000000f2001', '1234567'), null,
  'only a failed check offers its CAC answer for a re-compare');
reset role;

-- A name correction can re-use the cached CAC answer (Bode: failed with a cache).
set local role authenticated;
set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f2003"}';
select lives_ok($$ select public.start_identity_check('business_cac', 'Acme Foodz') $$, 'Bode starts a CAC check');
reset role;
set local role service_role;
select is(public.finish_identity_check(
    pg_temp.ref_of('00000000-0000-0000-0000-0000000f2003'),
    jsonb_build_object('status', 'failed', 'reason', 'name_mismatch', 'counted', true,
                       'registration_number', '7654321',
                       'cac_cache', jsonb_build_object('company_name', 'ACME FOODS LIMITED')),
    'cac:bode:1'),
  'failed', 'a CAC name mismatch fails the check');
select is(public.recent_cac_cache('00000000-0000-0000-0000-0000000f2003', '7654321') ->> 'company_name',
  'ACME FOODS LIMITED', 'and keeps CAC''s answer for a corrected name');
select is(public.recent_cac_cache('00000000-0000-0000-0000-0000000f2003', '1111111'), null,
  'but only for the same RC number');
reset role;
update public.identity_checks set cac_cached_at = now() - interval '25 hours'
 where user_id = '00000000-0000-0000-0000-0000000f2003';
select is(public.recent_cac_cache('00000000-0000-0000-0000-0000000f2003', '7654321'), null,
  'and not after 24 hours');

-- Admin decisions on a held check ---------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f1001"}'; -- Cora, not an admin
select throws_ok($$ select public.review_identity_check(
    pg_temp.id_of('00000000-0000-0000-0000-0000000f1002'), 'verified', 'fine') $$,
  'P0001', 'not_allowed', 'a creator cannot review a check');
set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f9001"}'; -- Zed
select throws_ok($$ select public.review_identity_check(
    pg_temp.id_of('00000000-0000-0000-0000-0000000f1002'), 'verified', 'x') $$,
  'P0001', 'identity_reason_required', 'a review needs a reason of 3 or more characters');
select throws_ok($$ select public.review_identity_check(
    pg_temp.id_of('00000000-0000-0000-0000-0000000f1002'), 'maybe', 'because') $$,
  'P0001', 'invalid_review_outcome', 'the outcome is verified or failed');
select throws_ok($$ select public.review_identity_check(
    pg_temp.id_of('00000000-0000-0000-0000-0000000f1001'), 'failed', 'because') $$,
  'P0001', 'check_not_in_review', 'only a check in review can be reviewed');
select lives_ok($$ select public.review_identity_check(
    pg_temp.id_of('00000000-0000-0000-0000-0000000f1002'),
    'verified', 'Same person, new SIM and a second account by mistake') $$,
  'an admin approves a held check');
select lives_ok($$ select public.review_identity_check(
    (select id from public.identity_checks where user_id = '00000000-0000-0000-0000-0000000f2002' and kind = 'business_cac'),
    'failed', 'Not the company owner') $$,
  'and rejects another');
reset role;
select is((select status || ':' || reviewed_by::text from public.identity_checks where user_id = '00000000-0000-0000-0000-0000000f1002'),
  'verified:00000000-0000-0000-0000-0000000f9001', 'the review records who decided');
select is((select review_reason from public.identity_checks where user_id = '00000000-0000-0000-0000-0000000f1002'),
  'Same person, new SIM and a second account by mistake', 'and why');
select is((select count(*)::int from public.notifications
            where user_id = '00000000-0000-0000-0000-0000000f1002' and kind = 'identity_verified'),
  1, 'the person is told the outcome');
select is((select count(*)::int from public.notifications where user_id = '00000000-0000-0000-0000-0000000f9001'),
  0, 'the admin is not notified of their own action');
select is((select data ->> 'reason' from public.notifications
            where user_id = '00000000-0000-0000-0000-0000000f2002' and kind = 'identity_failed'),
  'duplicate_identity', 'a rejected held check tells the person it was a duplicate');

-- Who reads what -----------------------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f1001"}'; -- Cora
select is((select count(*)::int from public.my_identity_checks()), 1, 'a person sees their own check');
select is((select legal_name_on_record from public.my_identity_checks()), 'CORA CREATOR', 'with the name on record');
select throws_ok($$ select id_fingerprint from public.my_identity_checks() $$,
  '42703', null, 'but never the fingerprint');
select throws_ok($$ select date_of_birth from public.my_identity_checks() $$,
  '42703', null, 'nor the date of birth');
select is((select count(*)::int from public.identity_checks), 0, 'the table shows a person none of its rows');
select is((select count(*)::int from public.screenings), 0, 'nor any screening');
select throws_ok($$ select count(*) from public.identity_secrets $$, '42501', null, 'the secrets table is closed to people');
select throws_ok($$ select count(*) from public.identity_events $$, '42501', null, 'and the events table');
select throws_ok($$ select public.identity_verified('00000000-0000-0000-0000-0000000f1001') $$,
  '42501', null, 'a person cannot ask the service-role identity_verified');
select throws_ok($$ select public.finish_identity_check('x', '{"status": "failed"}', 'k') $$,
  '42501', null, 'nor record a provider decision');
select throws_ok($$ select public.store_identity_secret('00000000-0000-0000-0000-000000000000', 'v1:x', null) $$,
  '42501', null, 'nor store a secret');
select throws_ok($$ select public.record_screening('00000000-0000-0000-0000-0000000f1001', 'person', 'first_payout', 'clear', 0, null) $$,
  '42501', null, 'nor record a screening');
select throws_ok($$ select public.purge_identity_secrets() $$, '42501', null, 'nor purge secrets');
reset role;
set local role anon;
select throws_ok($$ select count(*) from public.identity_checks $$, '42501', null, 'a signed-out visitor reads nothing');
reset role;
set local role service_role;
select throws_ok($$ select count(*) from public.identity_checks $$, '42501', null, 'the service role writes and reads only through the functions');
select throws_ok($$ select count(*) from public.identity_secrets $$, '42501', null, 'and cannot read the secrets table either');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f9001"}'; -- Zed
select cmp_ok((select count(*)::int from public.identity_checks), '>', 5, 'an admin reads every check');
select cmp_ok((select count(*)::int from public.screenings), '>=', 0, 'and the screenings');
reset role;

-- Short-lived secrets ---------------------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f1007"}'; -- Hal
select lives_ok($$ select public.start_identity_check('creator_nin', 'Hal Creator') $$, 'Hal starts a check');
reset role;
set local role service_role;
select throws_ok($$ select public.store_identity_secret('00000000-0000-0000-0000-000000000000', 'v1:x', null) $$,
  'P0001', 'no_such_check', 'a secret needs a check');
select lives_ok($$ select public.store_identity_secret(
    pg_temp.id_of('00000000-0000-0000-0000-0000000f1007'),
    'v1:aaa:bbb:ccc', 'v1:ddd:eee:fff') $$, 'a secret is stored');
select is(public.take_identity_secret(pg_temp.id_of('00000000-0000-0000-0000-0000000f1007')) ->> 'bvn_encrypted',
  'v1:aaa:bbb:ccc', 'and read back while valid');
select throws_ok($$ select public.store_identity_secret(
    pg_temp.id_of('00000000-0000-0000-0000-0000000f1007'), 'plain-bvn', null) $$,
  '23514', null, 'a secret that is not encrypted is refused');
select is(public.finish_identity_check(
    pg_temp.ref_of('00000000-0000-0000-0000-0000000f1007'),
    jsonb_build_object('status', 'failed', 'reason', 'other', 'counted', true), 'dojah:hal:Failed'),
  'failed', 'Hal''s check fails');
select is(public.take_identity_secret(pg_temp.id_of('00000000-0000-0000-0000-0000000f1007')),
  null, 'and its secret is gone');
reset role;
-- Expiry: two stored secrets, one expired.
insert into public.identity_checks (id, user_id, kind, status, reference, legal_name_entered, created_at) values
  ('f1000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-0000000f1006', 'owner_bvn', 'failed', 'pit_id_sec1', 'Gus Owner', now()),
  ('f1000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-0000000f1006', 'owner_bvn', 'failed', 'pit_id_sec2', 'Gus Owner', now());
insert into public.identity_secrets (check_id, bvn_encrypted, expires_at) values
  ('f1000000-0000-0000-0000-00000000a001', 'v1:old', now() - interval '1 minute'),
  ('f1000000-0000-0000-0000-00000000a002', 'v1:new', now() + interval '1 hour');
set local role service_role;
select is(public.take_identity_secret('f1000000-0000-0000-0000-00000000a001'), null, 'an expired secret is not handed out');
select is(public.purge_identity_secrets(), 1, 'purge removes only the expired secret');
select isnt(public.take_identity_secret('f1000000-0000-0000-0000-00000000a002'), null, 'and leaves the valid one');
select lives_ok($$ select public.delete_identity_secret('f1000000-0000-0000-0000-00000000a002') $$, 'a secret is deleted on request');
select is(public.take_identity_secret('f1000000-0000-0000-0000-00000000a002'), null, 'and then it is gone');
reset role;

-- Housekeeping: abandoning and polling -----------------------------------------------------------------------------------
insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000f1008', 'f1f1f1f1-0000-0000-0000-0000000f1008', 'ida.idc@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000f1009', 'f1f1f1f1-0000-0000-0000-0000000f1009', 'jo.idc@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000f1010', 'f1f1f1f1-0000-0000-0000-0000000f1010', 'kay.idc@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000f1011', 'f1f1f1f1-0000-0000-0000-0000000f1011', 'lee.idc@example.com', 'influencer');
insert into public.identity_checks (user_id, kind, status, reference, legal_name_entered, created_at) values
  ('00000000-0000-0000-0000-0000000f1008', 'creator_nin', 'started', 'pit_id_stale', 'Ida Creator', now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000f1009', 'creator_nin', 'started', 'pit_id_hour', 'Jo Creator', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-0000000f1010', 'creator_nin', 'pending', 'pit_id_pending', 'Kay Creator', now() - interval '3 hours'),
  ('00000000-0000-0000-0000-0000000f1011', 'creator_nin', 'started', 'pit_id_fresh', 'Lee Creator', now() - interval '5 minutes');
set local role service_role;
select is(array(select public.identity_checks_to_poll(10) order by 1),
  array['pit_id_hour', 'pit_id_pending', 'pit_id_stale']::text[],
  'the backstop polls open sessions 30 minutes to 7 days old, not a fresh one');
select is(array(select public.identity_checks_to_poll(1)), array['pit_id_stale']::text[], 'and honours its limit, oldest first');
select is(public.abandon_stale_identity_checks(), 1, 'a session open for over a day is abandoned');
reset role;
select is((select status || ':' || failure_reason from public.identity_checks where reference = 'pit_id_stale'),
  'abandoned:abandoned', 'with the reason abandoned');
select is((select status from public.identity_checks where reference = 'pit_id_hour'), 'started', 'a recent session stays open');

-- Screenings -------------------------------------------------------------------------------------------------------------------
set local role service_role;
select is(public.screening_state('00000000-0000-0000-0000-0000000f1001'), 'none', 'no screening yet');
select lives_ok($$ select public.record_screening('00000000-0000-0000-0000-0000000f1001', 'person', 'first_payout', 'clear', 0, 'ref-1') $$,
  'a clear screening is recorded');
select is(public.screening_state('00000000-0000-0000-0000-0000000f1001'), 'clear', 'and reads as clear');
select lives_ok($$ select public.record_screening('00000000-0000-0000-0000-0000000f1001', 'person', 'admin', 'possible_match', 2, 'ref-2') $$,
  'a later possible match is recorded');
select is(public.screening_state('00000000-0000-0000-0000-0000000f1001'), 'possible_match', 'the latest one decides');
select lives_ok($$ select public.record_screening('00000000-0000-0000-0000-0000000f1004', 'person', 'first_payout', 'error', 0, null) $$,
  'an error is recorded');
select is(public.screening_state('00000000-0000-0000-0000-0000000f1004'), 'error', 'and reads as error');
select throws_ok($$ select public.record_screening('00000000-0000-0000-0000-0000000f1004', 'person', 'first_payout', 'maybe', 0, null) $$,
  '23514', null, 'an unknown status is refused');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f1001"}'; -- Cora
select throws_ok($$ select public.review_screening(
    (select id from public.screenings where user_id = '00000000-0000-0000-0000-0000000f1001' and status = 'possible_match'),
    'cleared', 'fine') $$,
  'P0001', 'not_allowed', 'a person cannot clear their own screening');
set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f9001"}'; -- Zed
select throws_ok($$ select public.review_screening(
    (select id from public.screenings where user_id = '00000000-0000-0000-0000-0000000f1001' and status = 'possible_match'),
    'cleared', ' ') $$,
  'P0001', 'identity_reason_required', 'clearing needs a reason');
select throws_ok($$ select public.review_screening(
    (select id from public.screenings where user_id = '00000000-0000-0000-0000-0000000f1001' and status = 'clear'),
    'cleared', 'fine fine') $$,
  'P0001', 'screening_not_pending', 'a clear screening has nothing to review');
select throws_ok($$ select public.review_screening(
    (select id from public.screenings where user_id = '00000000-0000-0000-0000-0000000f1004'),
    'cleared', 'fine fine') $$,
  'P0001', 'screening_not_pending', 'an error is answered by screening again, not by clearing');
select throws_ok($$ select public.review_screening('00000000-0000-0000-0000-000000000000', 'cleared', 'fine fine') $$,
  'P0001', 'no_such_screening', 'an unknown screening is refused');
select lives_ok($$ select public.review_screening(
    (select id from public.screenings where user_id = '00000000-0000-0000-0000-0000000f1001' and status = 'possible_match'),
    'cleared', 'Different person with the same name') $$,
  'an admin clears a possible match');
select throws_ok($$ select public.review_screening(
    (select id from public.screenings where user_id = '00000000-0000-0000-0000-0000000f1001' and status = 'possible_match'),
    'confirmed', 'second thoughts') $$,
  'P0001', 'screening_not_pending', 'a decided screening cannot be decided again');
reset role;
select is(public.screening_state('00000000-0000-0000-0000-0000000f1001'), 'clear', 'a cleared match reads as clear');
select is((select reviewed_by from public.screenings where user_id = '00000000-0000-0000-0000-0000000f1001' and status = 'possible_match'),
  '00000000-0000-0000-0000-0000000f9001'::uuid, 'and records who cleared it');
select lives_ok($$ select public.record_screening('00000000-0000-0000-0000-0000000f1002', 'person', 'first_payout', 'possible_match', 1, null) $$,
  'another possible match');
set local role authenticated;
set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f9001"}';
select lives_ok($$ select public.review_screening(
    (select id from public.screenings where user_id = '00000000-0000-0000-0000-0000000f1002' and status = 'possible_match'),
    'confirmed', 'Listed on a sanctions list') $$,
  'an admin confirms it');
reset role;
select is(public.screening_state('00000000-0000-0000-0000-0000000f1002'), 'confirmed', 'a confirmed match reads as confirmed');

-- What the server reads to act on a check ---------------------------------------------------------------------------------------
set local role service_role;
select is(public.identity_check_by_reference(pg_temp.ref_of('00000000-0000-0000-0000-0000000f2001', 'business_cac')) ->> 'kind',
  'business_cac', 'a check is found by its reference');
select is(public.identity_check_by_reference('pit_id_unknown'), null, 'an unknown reference finds nothing');
select is(public.business_cac_facts('00000000-0000-0000-0000-0000000f2001') ->> 'registration_number',
  '1234567', 'a verified CAC record gives its RC number');
select is(public.business_cac_facts('00000000-0000-0000-0000-0000000f2001') -> 'directors',
  '["JOHN MUSA"]'::jsonb, 'and its directors');
select is(public.business_cac_facts('00000000-0000-0000-0000-0000000f2002'), null,
  'a business whose CAC check was rejected has none');
select lives_ok($$ select public.refresh_cac_directors('00000000-0000-0000-0000-0000000f2001', '["ADA OBI"]'::jsonb) $$,
  'directors are refreshed');
select is(public.business_cac_facts('00000000-0000-0000-0000-0000000f2001') -> 'directors',
  '["ADA OBI"]'::jsonb, 'and the new list is kept');
select lives_ok($$ select public.refresh_cac_directors('00000000-0000-0000-0000-0000000f2001', '"not a list"'::jsonb) $$,
  'a refresh that is not a list');
select is(public.business_cac_facts('00000000-0000-0000-0000-0000000f2001') -> 'directors',
  '["ADA OBI"]'::jsonb, 'changes nothing');
select is(public.screening_facts('00000000-0000-0000-0000-0000000f2001') ->> 'name',
  'ACME FOODS LIMITED', 'a registered business is screened by its CAC name');
select is(public.screening_facts('00000000-0000-0000-0000-0000000f1001') ->> 'subject',
  'person', 'a creator is screened as a person');
select is(public.screening_facts('00000000-0000-0000-0000-0000000f1001') ->> 'date_of_birth',
  '1992-10-10', 'with the date of birth');
select is(public.screening_facts('00000000-0000-0000-0000-0000000f1007'), null,
  'someone with no verified check has nothing to screen');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f1001"}';
select throws_ok($$ select public.screening_facts('00000000-0000-0000-0000-0000000f1001') $$,
  '42501', null, 'people cannot read screening facts');
reset role;

-- The attempt cap in one place, for the page ---------------------------------------------------------------------------------
set local role service_role;
select is((public.identity_attempt_state('00000000-0000-0000-0000-0000000f1004', 'creator_nin') ->> 'capped')::boolean,
  true, 'Eve, with three answered attempts today, is capped');
select cmp_ok((public.identity_attempt_state('00000000-0000-0000-0000-0000000f1004', 'creator_nin') ->> 'next_allowed_at')::timestamptz,
  '>', now(), 'until a later time');
select is((public.identity_attempt_state('00000000-0000-0000-0000-0000000f1006', 'creator_nin') ->> 'capped')::boolean,
  false, 'Gus, whose cap an admin reopened, is not');
select is((public.identity_attempt_state('00000000-0000-0000-0000-0000000f1005', 'creator_nin') ->> 'capped')::boolean,
  false, 'Fay, with only abandoned sessions, is not');
select is(public.identity_attempt_state('00000000-0000-0000-0000-0000000f1004', 'owner_bvn') ->> 'capped',
  'false', 'and the count is per kind');
reset role;
insert into public.identity_checks (user_id, kind, status, reference, legal_name_entered, counted, created_at)
select '00000000-0000-0000-0000-0000000f1008', 'creator_nin', 'failed', 'pit_id_total' || n, 'Ida Creator', true,
       now() - interval '3 days'
  from generate_series(1, 5) n;
set local role service_role;
select is(public.identity_attempt_state('00000000-0000-0000-0000-0000000f1008', 'creator_nin'),
  '{"capped": true, "next_allowed_at": null}'::jsonb, 'five old answered attempts cap for good until an admin reopens it');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub": "f1f1f1f1-0000-0000-0000-0000000f1004"}';
select throws_ok($$ select public.identity_attempt_state('00000000-0000-0000-0000-0000000f1004', 'creator_nin') $$,
  '42501', null, 'people cannot call it');
reset role;

select * from finish();
rollback;
