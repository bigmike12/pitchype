-- Proves the tracked-link rules from the tracked_links migration: a link is
-- made when a per-click hire starts, every hit is stored, billability is
-- decided in one order (preview/bot, blocked channel, hire ended, window
-- closed, cap, repeat, rate limit), counters match the rows, clicks are
-- append-only, and only the two people on the hire (and admins) read them.
-- Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(40);

-- Ada (business), Chidi and Dayo (creators), Bola (another business).
insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000ce001', 'cececece-0000-0000-0000-0000000ce001', 'ada.clicks@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000ce002', 'cececece-0000-0000-0000-0000000ce002', 'bola.clicks@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000ce011', 'cececece-0000-0000-0000-0000000ce011', 'chidi.clicks@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000ce012', 'cececece-0000-0000-0000-0000000ce012', 'dayo.clicks@example.com', 'influencer');

insert into public.business_profiles (user_id, business_name, contact_name, state, city) values
  ('00000000-0000-0000-0000-0000000ce001', 'Ada Clicks Ltd', 'Ada Obi', 'Lagos', 'Ikeja'),
  ('00000000-0000-0000-0000-0000000ce002', 'Bola Clicks Ltd', 'Bola A', 'Oyo', 'Ibadan');

insert into public.influencer_profiles (user_id, display_name, state, city, niches, published) values
  ('00000000-0000-0000-0000-0000000ce011', 'Chidi Clicks', 'Lagos', 'Yaba', '{fashion}', true),
  ('00000000-0000-0000-0000-0000000ce012', 'Dayo Clicks', 'Lagos', 'Yaba', '{fashion}', true);

-- Campaign 1: ₦50 a click, ₦5,000 budget (100 clicks), WhatsApp blocked, live.
-- Campaign 2: its click window ended yesterday. Campaign 3: fixed price.
insert into public.campaigns (id, business_id, status, title, brief, payment_model, cpc_kobo, price_kobo,
                              destination_url, blocked_channels, places, applications_close_on, deliver_by,
                              published_at, submitted_at, approved_at) values
  ('ce000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000ce001', 'open', 'Clicks live',
   'A brief that is long enough for the checks.', 'per_click', 5000, 500000,
   'https://shop.example.com/xmas?ref=a', '{whatsapp}', 3, public.lagos_today() + 2, public.lagos_today() + 5,
   now(), now(), now()),
  ('ce000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000ce001', 'open', 'Clicks ended',
   'A brief that is long enough for the checks.', 'per_click', 5000, 500000,
   'https://shop.example.com/old', '{}', 3, public.lagos_today() - 1, public.lagos_today() - 1,
   now(), now(), now());
insert into public.campaigns (id, business_id, status, title, brief, price_kobo, places,
                              applications_close_on, deliver_by, published_at, submitted_at, approved_at) values
  ('ce000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000ce001', 'open', 'Fixed one',
   'A brief that is long enough for the checks.', 500000, 3, public.lagos_today() + 2, public.lagos_today() + 5,
   now(), now(), now());

insert into public.applications (id, campaign_id, creator_id, status) values
  ('ce000000-0000-0000-0000-0000000000a1', 'ce000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000ce011', 'approved'),
  ('ce000000-0000-0000-0000-0000000000a2', 'ce000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000ce011', 'approved'),
  ('ce000000-0000-0000-0000-0000000000a3', 'ce000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000ce011', 'approved'),
  ('ce000000-0000-0000-0000-0000000000a4', 'ce000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000ce012', 'approved');

-- Funded hires (the fee snapshot is what funding writes).
insert into public.engagements (id, application_id, campaign_id, business_id, creator_id, status, agreed_price_kobo,
                                pay_by, funded_at, business_fee_kobo, creator_fee_bps, creator_min_fee_kobo, fee_config_id)
select ('ce000000-0000-0000-0000-0000000000e' || n)::uuid,
       ('ce000000-0000-0000-0000-0000000000a' || n)::uuid,
       ('ce000000-0000-0000-0000-00000000000' || n)::uuid,
       '00000000-0000-0000-0000-0000000ce001', '00000000-0000-0000-0000-0000000ce011',
       'funded', 500000, now() + interval '48 hours', now(), 50000, 500, 50000,
       (select id from public.fee_config order by created_at limit 1)
  from generate_series(1, 3) n;
-- Dayo's per-click hire is paid but not started.
insert into public.engagements (id, application_id, campaign_id, business_id, creator_id, status, agreed_price_kobo,
                                pay_by, funded_at, business_fee_kobo, creator_fee_bps, creator_min_fee_kobo, fee_config_id)
values ('ce000000-0000-0000-0000-0000000000e4', 'ce000000-0000-0000-0000-0000000000a4',
        'ce000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000ce001',
        '00000000-0000-0000-0000-0000000ce012', 'funded', 500000, now() + interval '48 hours', now(),
        50000, 500, 50000, (select id from public.fee_config order by created_at limit 1));

-- Chidi starts all three ---------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "cececece-0000-0000-0000-0000000ce011"}';
select lives_ok($$ select public.start_engagement('ce000000-0000-0000-0000-0000000000e1') $$, 'Chidi starts the per-click hire');
select lives_ok($$ select public.start_engagement('ce000000-0000-0000-0000-0000000000e2') $$, 'Chidi starts the ended campaign''s hire');
select lives_ok($$ select public.start_engagement('ce000000-0000-0000-0000-0000000000e3') $$, 'Chidi starts the fixed-price hire');
reset role;

select is((select count(*)::int from public.tracked_links where engagement_id = 'ce000000-0000-0000-0000-0000000000e1'), 1,
  'starting a per-click hire makes one tracked link');
select ok((select code ~ '^[0-9A-Za-z]{7}$' from public.tracked_links where engagement_id = 'ce000000-0000-0000-0000-0000000000e1'),
  'the code is seven letters or digits');
select is((select count(*)::int from public.tracked_links where engagement_id = 'ce000000-0000-0000-0000-0000000000e3'), 0,
  'a fixed-price hire has no link');

select set_config('test.code', (select code from public.tracked_links where engagement_id = 'ce000000-0000-0000-0000-0000000000e1'), true);
select set_config('test.old', (select code from public.tracked_links where engagement_id = 'ce000000-0000-0000-0000-0000000000e2'), true);

-- Recording clicks, as the redirect does (service role) ----------------------------------------
set local role service_role;

select is(public.record_click('zzzzzzz', 'v0', 'u0', null, 'unknown', 'human'), null, 'an unknown code records nothing');
select is((public.record_click(current_setting('test.code'), 'v1', 'u1', null, 'unknown', 'human'))->>'billable', 'true',
  'a first visit is billable');
select is((public.record_click(current_setting('test.code'), 'v1', 'u1', null, 'unknown', 'human'))->>'reason', 'repeat',
  'the same visitor within 24 hours is a repeat');
select is((public.record_click(current_setting('test.code'), 'v2', 'u2', null, 'whatsapp', 'preview'))->>'reason', 'preview',
  'a WhatsApp preview fetch is a preview');
select is((public.record_click(current_setting('test.code'), 'v3', 'u3', null, 'unknown', 'bot'))->>'reason', 'bot',
  'a bot is a bot');
select is((public.record_click(current_setting('test.code'), 'v4', 'u4', 'web.whatsapp.com', 'whatsapp', 'human'))->>'reason',
  'blocked_channel', 'a click from a blocked channel is not billable');
select is((public.record_click(current_setting('test.code'), 'v5', 'u5', 'l.instagram.com', 'instagram', 'human'))->>'billable',
  'true', 'a click from an allowed channel is billable');
select is((public.record_click(current_setting('test.old'), 'v6', 'u6', null, 'unknown', 'human'))->>'reason',
  'window_closed', 'a click after the deliver-by day is not billable');

select is(
  public.record_click(current_setting('test.code'), 'v7', 'u7', null, 'unknown', 'human')
    - 'billable' - 'reason',
  jsonb_build_object('destination', 'https://shop.example.com/xmas?ref=a', 'utmTags', true,
                     'campaignId', 'ce000000-0000-0000-0000-000000000001'),
  'the answer carries the stored destination');
reset role;

select is(
  (select billable_clicks || '/' || total_hits from public.tracked_links where code = current_setting('test.code')),
  (select count(*) filter (where is_billable) || '/' || count(*) from public.link_clicks l
     join public.tracked_links t on t.id = l.link_id where t.code = current_setting('test.code')),
  'the counters match the click rows');
select is(
  (select source from public.link_clicks l join public.tracked_links t on t.id = l.link_id
    where t.code = current_setting('test.code') and l.visitor_hash = 'v2'),
  'whatsapp', 'a preview keeps the channel that fetched it');

-- A repeat window of 24 hours: an older billable click doesn't make a repeat.
insert into public.link_clicks (link_id, created_at, visitor_hash, source, is_billable, filter_reason)
select id, now() - interval '24 hours 1 second', 'v8', 'unknown', true, null
  from public.tracked_links where code = current_setting('test.code');
set local role service_role;
select is((public.record_click(current_setting('test.code'), 'v8', 'u8', null, 'unknown', 'human'))->>'billable', 'true',
  'the same visitor after 24 hours counts again');
reset role;

-- Rate limit: 20 hits from one visitor in the last minute, then the 21st.
insert into public.link_clicks (link_id, visitor_hash, source, is_billable, filter_reason)
select t.id, 'v9', 'unknown', false, 'bot'
  from public.tracked_links t, generate_series(1, 20)
 where t.code = current_setting('test.code');
set local role service_role;
select is((public.record_click(current_setting('test.code'), 'v9', 'u9', null, 'unknown', 'human'))->>'reason', 'rate_limited',
  'more than 20 hits a minute from one visitor are not billable');
reset role;

-- The cap: 100 clicks at ₦50 on a ₦5,000 budget.
update public.tracked_links set billable_clicks = 99, total_hits = total_hits + 99 where code = current_setting('test.code');
set local role service_role;
select is((public.record_click(current_setting('test.code'), 'c100', 'u', null, 'unknown', 'human'))->>'billable', 'true',
  'the 100th click is billable');
select is((public.record_click(current_setting('test.code'), 'c101', 'u', null, 'unknown', 'human'))->>'reason', 'cap_reached',
  'the 101st click is over the cap');
reset role;

-- The click window, by Lagos time.
select ok(public.click_window_open(date '2026-12-24', timestamptz '2026-12-24 23:59:59+01'),
  'the window is open at 23:59:59 Lagos on the deliver-by day');
select ok(not public.click_window_open(date '2026-12-24', timestamptz '2026-12-25 00:00:00+01'),
  'the window is closed at midnight Lagos after it');

-- Append-only and grants ----------------------------------------------------------------------
select throws_ok($$ update public.link_clicks set is_billable = true $$, 'P0001', 'clicks_append_only',
  'clicks cannot be updated, even by the owner');
select throws_ok($$ delete from public.link_clicks $$, 'P0001', 'clicks_append_only',
  'clicks cannot be deleted, even by the owner');
select throws_ok($$ truncate public.link_clicks $$, 'P0001', 'clicks_append_only',
  'clicks cannot be truncated');
select ok(not has_function_privilege('authenticated', 'public.record_click(text, text, text, text, text, text)', 'execute'),
  'signed-in people cannot record clicks');
select ok(not has_function_privilege('anon', 'public.record_click(text, text, text, text, text, text)', 'execute'),
  'visitors cannot record clicks');
select ok(not has_table_privilege('service_role', 'public.link_clicks', 'insert'),
  'nobody inserts clicks directly');
select ok(not has_table_privilege('authenticated', 'public.tracked_links', 'insert'),
  'nobody makes links directly');

-- Who reads what -------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "cececece-0000-0000-0000-0000000ce011"}';
select is((select count(*)::int from public.tracked_links), 2, 'Chidi sees his two links');
select ok((select count(*) from public.link_clicks) > 0, 'Chidi sees the clicks on his links');
select is(
  (public.engagement_click_summary('ce000000-0000-0000-0000-0000000000e1'))->'blockedShares',
  '["whatsapp"]'::jsonb, 'Chidi is warned about a share on a blocked channel');
select is(
  (public.engagement_click_summary('ce000000-0000-0000-0000-0000000000e1'))->>'earnedKobo',
  '500000', 'earnings stop at the cap');

set local request.jwt.claims = '{"sub": "cececece-0000-0000-0000-0000000ce012"}';
select is((select count(*)::int from public.link_clicks), 0, 'another creator sees no clicks');
select is(
  public.engagement_click_summary('ce000000-0000-0000-0000-0000000000e4'),
  jsonb_build_object('code', null, 'cpcKobo', 5000, 'capKobo', 500000),
  'before the start, a per-click hire shows its terms and no link');
select is(public.engagement_click_summary('ce000000-0000-0000-0000-0000000000e1'), null,
  'another creator sees nothing of Chidi''s hire');

set local request.jwt.claims = '{"sub": "cececece-0000-0000-0000-0000000ce001"}';
select is(
  (public.campaign_click_summary('ce000000-0000-0000-0000-000000000001'))->'totals'->>'spentKobo',
  '500000', 'the business sees what it has spent');

set local request.jwt.claims = '{"sub": "cececece-0000-0000-0000-0000000ce002"}';
select is(public.engagement_click_summary('ce000000-0000-0000-0000-0000000000e1'), null,
  'another business sees nothing');
reset role;

-- A hire that ended stops counting -------------------------------------------------------------
update public.engagements set status = 'cancelled', cancelled_at = now(), cancel_reason = 'cancelled_by_creator'
 where id = 'ce000000-0000-0000-0000-0000000000e1';
set local role service_role;
select is((public.record_click(current_setting('test.code'), 'v10', 'u10', null, 'unknown', 'human'))->>'reason', 'hire_ended',
  'clicks after the hire ended are not billable');
reset role;

select * from finish();
rollback;
