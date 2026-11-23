-- Proves the rules from the creator portfolio migrations (20261127100000 and
-- 20261127100100): what visitors, creators, businesses and admins see of a
-- creator's bio, samples, cover and track record; the 6-sample cap; handle
-- search for businesses only; sorting; and admin takedowns.
-- Counts are limited to this test's people: the local database may hold others.
-- Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(46);

-- Setup, as the database owner ------------------------------------------------
-- Ama is a business, Kemi and Tunde are listed creators, Uche is a creator
-- with a draft profile, Zara is an admin.

insert into public.users (id, auth_user_id, email, role, created_at) values
  ('00000000-0000-0000-0000-0000000f0a01', 'f0f0f0f0-0000-0000-0000-000000000a01', 'ama.pf@example.com', 'business', now()),
  ('00000000-0000-0000-0000-0000000f0b02', 'f0f0f0f0-0000-0000-0000-000000000b02', 'kemi.pf@example.com', 'influencer', '2026-01-15 10:00+00'),
  ('00000000-0000-0000-0000-0000000f0c03', 'f0f0f0f0-0000-0000-0000-000000000c03', 'tunde.pf@example.com', 'influencer', now()),
  ('00000000-0000-0000-0000-0000000f0d04', 'f0f0f0f0-0000-0000-0000-000000000d04', 'uche.pf@example.com', 'influencer', now()),
  ('00000000-0000-0000-0000-0000000f0e05', 'f0f0f0f0-0000-0000-0000-000000000e05', 'zara.pf@example.com', 'admin', now());

insert into public.business_profiles (user_id, business_name, contact_name, state, city)
values ('00000000-0000-0000-0000-0000000f0a01', 'Portfolio Biz', 'Ama Eze', 'Lagos', 'Ikeja');

-- Created in this order, so "newest" puts Tunde before Kemi.
insert into public.influencer_profiles (user_id, display_name, state, city, niches, bio, published, created_at) values
  ('00000000-0000-0000-0000-0000000f0b02', 'Kemi Portfolio', 'Lagos', 'Yaba', '{fashion}',
   'Thrift fashion and styling on a budget.', true, now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000f0c03', 'Tunde Portfolio', 'Oyo', 'Ibadan', '{gaming}',
   'Mobile gaming clips.', true, now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000000f0d04', 'Uche Portfolio', 'Enugu', 'Enugu', '{travel}',
   null, false, now());

insert into public.influencer_platforms (user_id, platform, handle, follower_range) values
  ('00000000-0000-0000-0000-0000000f0b02', 'instagram', 'kemithriftsxq', '5k_10k'),
  ('00000000-0000-0000-0000-0000000f0c03', 'tiktok', 'tundeplaysxq', '50k_100k'),
  ('00000000-0000-0000-0000-0000000f0d04', 'x', 'uchegoesxq', '1k_5k');

-- Kemi's Instagram is verified at 12,000: "verified first" ranks her first.
insert into public.verification_requests
  (user_id, platform, handle, code, status, submitted_at, follower_count_seen, reviewed_by, reviewed_at, expires_at)
values
  ('00000000-0000-0000-0000-0000000f0b02', 'instagram', 'kemithriftsxq', 'pitchype-PF0001', 'verified', now(),
   12000, '00000000-0000-0000-0000-0000000f0e05', now(), now() + interval '1 day');

-- Kemi's track record: two released hires count; a refund and a release of
-- nothing don't.
insert into public.campaigns (id, business_id, status, title, brief, price_kobo, places,
                              applications_close_on, deliver_by, published_at, submitted_at)
select ('f0000000-0000-0000-0000-00000000000' || n)::uuid, '00000000-0000-0000-0000-0000000f0a01', 'in_progress',
       'Portfolio test ' || n, 'A brief that is long enough for the checks.', 5000000, 1,
       public.lagos_today() + 10, public.lagos_today() + 20, now(), now()
  from generate_series(1, 4) n;
insert into public.applications (id, campaign_id, creator_id, status)
select ('f0000000-0000-0000-0000-0000000a000' || n)::uuid, ('f0000000-0000-0000-0000-00000000000' || n)::uuid,
       '00000000-0000-0000-0000-0000000f0b02', 'approved'
  from generate_series(1, 4) n;
insert into public.engagements (id, application_id, campaign_id, business_id, creator_id, agreed_price_kobo, pay_by)
select ('f0000000-0000-0000-0000-0000000e000' || n)::uuid, ('f0000000-0000-0000-0000-0000000a000' || n)::uuid,
       ('f0000000-0000-0000-0000-00000000000' || n)::uuid, '00000000-0000-0000-0000-0000000f0a01',
       '00000000-0000-0000-0000-0000000f0b02', 5000000, now() + interval '48 hours'
  from generate_series(1, 4) n;
alter table public.engagements disable trigger user;
update public.engagements set status = 'accepted', released_kobo = 5000000, refunded_kobo = 0, settled_at = now(), settle_outcome = 'release'
 where id = 'f0000000-0000-0000-0000-0000000e0001';
update public.engagements set status = 'auto_released', released_kobo = 2500000, refunded_kobo = 2500000, settled_at = now(), settle_outcome = 'split'
 where id = 'f0000000-0000-0000-0000-0000000e0002';
update public.engagements set status = 'refunded', released_kobo = 0, refunded_kobo = 5000000, settled_at = now(), settle_outcome = 'refund'
 where id = 'f0000000-0000-0000-0000-0000000e0003';
update public.engagements set status = 'accepted', released_kobo = 0, refunded_kobo = 5000000, settled_at = now(), settle_outcome = 'split'
 where id = 'f0000000-0000-0000-0000-0000000e0004';
alter table public.engagements enable trigger user;

-- This test's creators as the directory returns them to whoever is asking.
create temporary view test_creators as
  select * from public.search_creators(page_size => 50)
   where user_id in ('00000000-0000-0000-0000-0000000f0b02', '00000000-0000-0000-0000-0000000f0c03');
grant select on test_creators to anon, authenticated;

-- Kemi, a creator ----------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "f0f0f0f0-0000-0000-0000-000000000b02"}';

select lives_ok(
  $$ insert into public.portfolio_samples (user_id, position, caption, platform, post_url)
     values ('00000000-0000-0000-0000-0000000f0b02', 0, 'Thrift haul for Lagos Fashion Week', 'instagram',
             'https://www.instagram.com/p/AbC123/') $$,
  'Kemi adds a sample with a caption and a post link');
select lives_ok(
  $$ insert into public.portfolio_samples (user_id, position)
     select '00000000-0000-0000-0000-0000000f0b02', n from generate_series(1, 5) n $$,
  'and five more without captions');
select throws_ok(
  $$ insert into public.portfolio_samples (user_id, position)
     values ('00000000-0000-0000-0000-0000000f0b02', 5) $$,
  '23505', null, 'one sample per position');
select throws_ok(
  $$ insert into public.portfolio_samples (user_id, position)
     values ('00000000-0000-0000-0000-0000000f0b02', 6) $$,
  '23514', null, 'positions run 0 to 5, so a seventh sample is refused');
select lives_ok(
  $$ update public.portfolio_samples
        set position = case position when 0 then 1 else 0 end
      where position in (0, 1) $$,
  'two samples swap places in one statement');
select is((select caption from public.portfolio_samples where position = 1),
  'Thrift haul for Lagos Fashion Week', 'the swap moved the sample');
update public.portfolio_samples set position = case position when 0 then 1 else 0 end where position in (0, 1);
select is((select count(*)::int from public.portfolio_samples), 6, 'Kemi has six samples');
select throws_ok(
  $$ update public.portfolio_samples set image_version = 9 where position = 0 $$,
  '42501', null, 'only the server sets a sample''s image');
select throws_ok(
  $$ update public.portfolio_samples set hidden_at = now(), hidden_reason = 'x' where position = 0 $$,
  '42501', null, 'only admins hide a sample');
select throws_ok(
  $$ update public.influencer_profiles set cover_version = 3 $$,
  '42501', null, 'only the server sets the cover');
select throws_ok(
  $$ update public.portfolio_samples set caption = 'DM me on 08031234567' where position = 1 $$,
  'P0001', 'contact_details', 'captions refuse contact details');
select throws_ok(
  $$ update public.portfolio_samples set post_url = 'https://www.tiktok.com/@kemi/video/1', platform = 'instagram'
      where position = 1 $$,
  'P0001', 'post_url_invalid', 'a post link must be on the chosen platform');
select throws_ok(
  $$ update public.portfolio_samples set post_url = 'http://www.instagram.com/p/x/', platform = 'instagram'
      where position = 1 $$,
  'P0001', 'post_url_invalid', 'post links are https');
select lives_ok(
  $$ update public.portfolio_samples set caption = 'Styling shoot', platform = 'youtube',
            post_url = 'https://youtu.be/abc123' where position = 1 $$,
  'Kemi edits a caption and links a YouTube video');

-- Server-only columns, as the database owner (what lib/db does with the secret key).
reset role;
update public.portfolio_samples set image_version = 1
 where user_id = '00000000-0000-0000-0000-0000000f0b02';
update public.influencer_profiles set cover_version = 2
 where user_id = '00000000-0000-0000-0000-0000000f0b02';
insert into public.portfolio_samples (user_id, position, image_version, caption)
values ('00000000-0000-0000-0000-0000000f0d04', 0, 1, 'Uche''s draft-page sample');

-- Tunde, another creator --------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "f0f0f0f0-0000-0000-0000-000000000c03"}';

select is((select count(*)::int from public.portfolio_samples), 0, 'Tunde cannot read Kemi''s samples');
select throws_ok(
  $$ insert into public.portfolio_samples (user_id, position)
     values ('00000000-0000-0000-0000-0000000f0b02', 0) $$,
  '42501', null, 'Tunde cannot add to Kemi''s portfolio');
select is((select count(*)::int from public.creator_portfolio('kemi-portfolio') where post_url is not null), 0,
  'a creator sees no post links on another creator''s portfolio');
select is((select bio from public.get_listed_creator('kemi-portfolio')),
  'Thrift fashion and styling on a budget.', 'a creator sees the bio');

-- Visitors ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{}';

select throws_ok($$ select * from public.portfolio_samples $$, '42501', null,
  'visitors cannot read samples directly');
select is((select count(*)::int from public.creator_portfolio('kemi-portfolio')), 6,
  'visitors see Kemi''s six samples');
select is((select array_agg(position order by position) from public.creator_portfolio('kemi-portfolio')),
  array[0, 1, 2, 3, 4, 5]::smallint[], 'in order');
select is((select count(*)::int from public.creator_portfolio('kemi-portfolio') where post_url is not null), 0,
  'visitors see no post links');
select is((select caption from public.creator_portfolio('kemi-portfolio') where position = 0),
  'Thrift haul for Lagos Fashion Week', 'visitors see captions');
select is((select count(*)::int from public.creator_portfolio('uche-portfolio')), 0,
  'a draft profile''s samples are not public');
select is(
  (select row(bio, cover_version, completed_jobs, member_since, starting_rate_kobo, details_visible)::text
     from public.get_listed_creator('kemi-portfolio')),
  row('Thrift fashion and styling on a budget.', 2, 2, '2026-01-15 10:00+00'::timestamptz, null::bigint, false)::text,
  'visitors see the bio, cover and track record, but no rate');
select is((select completed_jobs from public.get_listed_creator('tunde-portfolio')), 0,
  'no released hires, no completed jobs');
select ok((select bool_and(p ->> 'handle' is null) from test_creators, jsonb_array_elements(platforms) p),
  'visitors still see no handles');
select is((select bio from test_creators where slug = 'kemi-portfolio'),
  'Thrift fashion and styling on a budget.', 'cards carry the bio');
select is((select cover_version from test_creators where slug = 'kemi-portfolio'), 2, 'and the cover');
select is((select count(*)::int from public.search_creators(search => 'kemithriftsxq')), 0,
  'a visitor''s search never matches a handle');
select is((select count(*)::int from public.search_creators(search => '@tundeplaysxq')), 0,
  'even with an @');
select throws_ok($$ select * from public.search_creators(max_rate_kobo => 6000000) $$, '42501', null,
  'visitors still cannot filter by rate');

-- Sorting.
select is(
  (select array_agg(slug order by ord) from (
     select slug, row_number() over () ord from public.search_creators(page_size => 50, sort => 'newest')
      where user_id in ('00000000-0000-0000-0000-0000000f0b02', '00000000-0000-0000-0000-0000000f0c03')) s),
  array['tunde-portfolio', 'kemi-portfolio'], 'newest first by default');
select is(
  (select array_agg(slug order by ord) from (
     select slug, row_number() over () ord from public.search_creators(page_size => 50, sort => 'followers')
      where user_id in ('00000000-0000-0000-0000-0000000f0b02', '00000000-0000-0000-0000-0000000f0c03')) s),
  array['tunde-portfolio', 'kemi-portfolio'], 'most followers: 50K–100K before a verified 12,000');
select is(
  (select array_agg(slug order by ord) from (
     select slug, row_number() over () ord from public.search_creators(page_size => 50, sort => 'verified')
      where user_id in ('00000000-0000-0000-0000-0000000f0b02', '00000000-0000-0000-0000-0000000f0c03')) s),
  array['kemi-portfolio', 'tunde-portfolio'], 'verified first');
select throws_ok($$ select * from public.search_creators(sort => 'cheapest') $$, '22023', null,
  'an unknown sort is refused');

-- Ama, a business ----------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "f0f0f0f0-0000-0000-0000-000000000a01"}';

select is((select array_agg(slug) from public.search_creators(search => '@KemiThriftsXQ')),
  array['kemi-portfolio'], 'a business finds a creator by @handle');
select is((select post_url from public.creator_portfolio('kemi-portfolio') where position = 0),
  'https://www.instagram.com/p/AbC123/', 'a business sees post links');
select is((select count(*)::int from public.portfolio_samples), 0, 'businesses cannot read the table');
select throws_ok(
  $$ select public.hide_portfolio_sample(
       (select id from public.creator_portfolio('kemi-portfolio') where position = 2), 'Not their work') $$,
  '42501', null, 'businesses cannot take samples down');

-- Zara, an admin ----------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "f0f0f0f0-0000-0000-0000-000000000e05"}';

select lives_ok(
  $$ select public.hide_portfolio_sample(
       (select id from public.portfolio_samples
         where user_id = '00000000-0000-0000-0000-0000000f0b02' and position = 2), 'Not their work') $$,
  'an admin takes a sample down');
select is((select count(*)::int from public.creator_portfolio('kemi-portfolio')), 5,
  'a hidden sample leaves the portfolio');
select is((select public.clear_cover('00000000-0000-0000-0000-0000000f0b02', 'Shows a phone number')), 2,
  'an admin removes the cover and gets the old version back');
select is((select cover_version from public.get_listed_creator('kemi-portfolio')), null::integer,
  'the cover is gone');
select is(
  (select array_agg(kind::text order by kind::text) from public.moderation_events
    where user_id = '00000000-0000-0000-0000-0000000f0b02'),
  array['cover_removed', 'portfolio_sample_hidden'], 'both takedowns are recorded');

-- Kemi again: she sees the takedown on her own row and can delete it.
set local request.jwt.claims = '{"sub": "f0f0f0f0-0000-0000-0000-000000000b02"}';
select is((select hidden_reason from public.portfolio_samples where position = 2), 'Not their work',
  'the creator sees why a sample was taken down');

select * from finish();
rollback;
