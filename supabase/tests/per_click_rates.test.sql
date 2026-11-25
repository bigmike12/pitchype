-- Proves the creator-proposed cost per click rules (per_click_creator_rates
-- migration): a proposal is only for a per-click campaign, whole naira of at
-- least ₦50 and fitting the budget in whole clicks; the business hires at a
-- rate it saw (rate_changed otherwise); the hire's rate is frozen on the
-- engagement; and the cap, the summaries, the daily settle and an admin's
-- release all use the hire's rate, so two hires on one campaign can differ.
-- Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(58);

-- Ada and Bo (businesses), Efe (admin), creators c1..c6.
insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000a7001', 'a7a7a7a7-0000-0000-0000-0000000a7001', 'ada.rates@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000a7002', 'a7a7a7a7-0000-0000-0000-0000000a7002', 'bo.rates@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000a7003', 'a7a7a7a7-0000-0000-0000-0000000a7003', 'efe.rates@example.com', 'admin');
insert into public.users (id, auth_user_id, email, role)
select ('00000000-0000-0000-0000-0000000a71' || lpad(n::text, 2, '0'))::uuid,
       ('a7a7a7a7-0000-0000-0000-0000000a71' || lpad(n::text, 2, '0'))::uuid,
       'c' || n || '.rates@example.com', 'influencer'
  from generate_series(1, 6) n;
insert into public.business_profiles (user_id, business_name, contact_name, state, city) values
  ('00000000-0000-0000-0000-0000000a7001', 'Ada Rates Store', 'Ada Obi', 'Lagos', 'Ikeja'),
  ('00000000-0000-0000-0000-0000000a7002', 'Bo Rates Store', 'Bo Eze', 'Lagos', 'Yaba');
insert into public.influencer_profiles (user_id, display_name, state, city, niches, published)
select ('00000000-0000-0000-0000-0000000a71' || lpad(n::text, 2, '0'))::uuid, 'Rates ' || n, 'Lagos', 'Yaba', '{fashion}', true
  from generate_series(1, 6) n;

-- Identity fixtures: the people made above count as verified, so the identity
-- gates (identity_gates migration) are not what this file is about.
insert into public.identity_checks (user_id, kind, status, reference, legal_name_entered, legal_name_on_record,
                                    id_last3, id_fingerprint, counted, decided_at)
select u.id, case u.role when 'influencer' then 'creator_nin' else 'owner_bvn' end, 'verified',
       'pit_id_fx_' || replace(u.id::text, '-', ''), 'Fixture Person', 'FIXTURE PERSON', '000',
       'v1:fx-' || u.id::text, true, now()
  from public.users u
 where u.created_at = now() and u.role in ('influencer', 'business')
   and not exists (select 1 from public.identity_checks c where c.user_id = u.id);

-- P: ₦50 a click, ₦10,000 per creator (200 clicks at the campaign's rate).
-- F: a fixed-price campaign.
insert into public.campaigns (id, business_id, status, title, brief, payment_model, cpc_kobo, price_kobo,
                              destination_url, places, applications_close_on, deliver_by,
                              published_at, submitted_at, approved_at) values
  ('a7000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000a7001', 'open', 'Rates P',
   'A brief that is long enough for the checks.', 'per_click', 5000, 1000000,
   'https://shop.example.com/p', 6, public.lagos_today() + 10, public.lagos_today() + 20, now(), now(), now());
insert into public.campaigns (id, business_id, status, title, brief, price_kobo, places,
                              applications_close_on, deliver_by, published_at, submitted_at, approved_at) values
  ('a7000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000a7001', 'open', 'Rates F',
   'A brief that is long enough for the checks.', 500000, 3, public.lagos_today() + 10, public.lagos_today() + 20,
   now(), now(), now());

-- Applications a1..a5 are on P (creators 1..5), a6 is on F (creator 6).
insert into public.applications (id, campaign_id, creator_id, status)
select ('a7000000-0000-0000-0000-0000000000a' || n)::uuid,
       case when n = 6 then 'a7000000-0000-0000-0000-0000000000c2' else 'a7000000-0000-0000-0000-0000000000c1' end::uuid,
       ('00000000-0000-0000-0000-0000000a71' || lpad(n::text, 2, '0'))::uuid, 'submitted'
  from generate_series(1, 6) n;

-- Grants -----------------------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.set_application_rate(uuid, bigint)', 'execute'),
  'signed-out people cannot set a rate');
select ok(not has_function_privilege('anon', 'public.approve_application_at_rate(uuid, bigint, bigint)', 'execute'),
  'signed-out people cannot approve at a rate');

-- The constraints and the trigger, as the database owner. (₦40 and ₦62.50 both
-- divide the ₦10,000 budget, so they reach the check constraint; the trigger
-- refuses a rate that doesn't divide it first.) -----------------------------------------
select throws_ok($$ update public.applications set proposed_cpc_kobo = 4000 where id = 'a7000000-0000-0000-0000-0000000000a2' $$,
  '23514', null, 'a proposed rate is at least ₦50');
select throws_ok($$ update public.applications set proposed_cpc_kobo = 6250 where id = 'a7000000-0000-0000-0000-0000000000a2' $$,
  '23514', null, 'a proposed rate is whole naira');
select throws_ok($$ update public.applications set proposed_cpc_kobo = 7000 where id = 'a7000000-0000-0000-0000-0000000000a2' $$,
  'P0001', 'rate_invalid', 'a proposed rate must fit the budget in whole clicks');
select throws_ok($$ update public.applications set proposed_cpc_kobo = 10000 where id = 'a7000000-0000-0000-0000-0000000000a6' $$,
  'P0001', 'rate_per_click_only', 'a fixed-price application can''t carry a rate');
select lives_ok($$ update public.applications set proposed_cpc_kobo = 10000 where id = 'a7000000-0000-0000-0000-0000000000a2' $$,
  'a rate that fits is stored');
update public.applications set proposed_cpc_kobo = null where id = 'a7000000-0000-0000-0000-0000000000a2';

-- A creator sets a rate ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "a7a7a7a7-0000-0000-0000-0000000a7101"}';

select lives_ok($$ select public.set_application_rate('a7000000-0000-0000-0000-0000000000a1', 10000) $$,
  'a creator proposes ₦100 a click');
select is((select proposed_cpc_kobo from public.applications where id = 'a7000000-0000-0000-0000-0000000000a1'),
  10000::bigint, 'and it is stored');
select lives_ok($$ select public.set_application_rate('a7000000-0000-0000-0000-0000000000a1', 5000) $$,
  'proposing the campaign''s own rate is allowed');
select is((select proposed_cpc_kobo from public.applications where id = 'a7000000-0000-0000-0000-0000000000a1'),
  null::bigint, 'and it is stored as no proposal');
select lives_ok($$ select public.set_application_rate('a7000000-0000-0000-0000-0000000000a1', 10000) $$,
  'she proposes ₦100 again');
select lives_ok($$ select public.set_application_rate('a7000000-0000-0000-0000-0000000000a1', null) $$,
  'clearing the rate is allowed');
select is((select proposed_cpc_kobo from public.applications where id = 'a7000000-0000-0000-0000-0000000000a1'),
  null::bigint, 'and clears it');
select throws_ok($$ select public.set_application_rate('a7000000-0000-0000-0000-0000000000a1', 4900) $$,
  'P0001', 'rate_invalid', 'below ₦50 is refused');
select throws_ok($$ select public.set_application_rate('a7000000-0000-0000-0000-0000000000a1', 10050) $$,
  'P0001', 'rate_invalid', 'part of a naira is refused');
select throws_ok($$ select public.set_application_rate('a7000000-0000-0000-0000-0000000000a1', 7000) $$,
  'P0001', 'rate_invalid', 'a rate that does not fit the budget in whole clicks is refused');
select throws_ok($$ select public.set_application_rate('a7000000-0000-0000-0000-0000000000a2', 10000) $$,
  'P0001', 'no_such_application', 'a creator can''t set another creator''s rate');

set local request.jwt.claims = '{"sub": "a7a7a7a7-0000-0000-0000-0000000a7106"}';
select throws_ok($$ select public.set_application_rate('a7000000-0000-0000-0000-0000000000a6', 10000) $$,
  'P0001', 'rate_per_click_only', 'a fixed-price application can''t take a rate');

set local request.jwt.claims = '{"sub": "a7a7a7a7-0000-0000-0000-0000000a7001"}';
select throws_ok($$ select public.set_application_rate('a7000000-0000-0000-0000-0000000000a1', 10000) $$,
  '42501', null, 'a business can''t set a creator''s rate');

-- Creators 1, 3 and 4 propose ₦100; creators 2 and 5 accept the campaign's rate.
set local request.jwt.claims = '{"sub": "a7a7a7a7-0000-0000-0000-0000000a7101"}';
select public.set_application_rate('a7000000-0000-0000-0000-0000000000a1', 10000);
set local request.jwt.claims = '{"sub": "a7a7a7a7-0000-0000-0000-0000000a7103"}';
select public.set_application_rate('a7000000-0000-0000-0000-0000000000a3', 10000);
set local request.jwt.claims = '{"sub": "a7a7a7a7-0000-0000-0000-0000000a7104"}';
select public.set_application_rate('a7000000-0000-0000-0000-0000000000a4', 10000);

-- The business hires at a rate it saw --------------------------------------------------------------
set local request.jwt.claims = '{"sub": "a7a7a7a7-0000-0000-0000-0000000a7001"}';

select throws_ok($$ select public.approve_application_at_rate('a7000000-0000-0000-0000-0000000000a1', 1000000, 5000) $$,
  'P0001', 'rate_changed', 'a business that saw ₦50 can''t approve a creator who asks ₦100');
select lives_ok($$ select set_config('test.e1',
  public.approve_application_at_rate('a7000000-0000-0000-0000-0000000000a1', 1000000, 10000)::text, true) $$,
  'it hires at the rate it saw');
select is((select cpc_kobo from public.engagements where id = current_setting('test.e1')::uuid),
  10000::bigint, 'the hire is at the creator''s rate');

select throws_ok($$ select public.approve_application_at_rate('a7000000-0000-0000-0000-0000000000a2', 1000000, 10000) $$,
  'P0001', 'rate_changed', 'a creator with no proposal is at the campaign''s rate, not another');
select lives_ok($$ select set_config('test.e2',
  public.approve_application_at_rate('a7000000-0000-0000-0000-0000000000a2', 1000000, 5000)::text, true) $$,
  'it hires a creator at the campaign''s rate');
select is((select cpc_kobo from public.engagements where id = current_setting('test.e2')::uuid),
  5000::bigint, 'the hire is at the campaign''s rate');

select throws_ok($$ select public.approve_application_at_rate('a7000000-0000-0000-0000-0000000000a6', 500000, 5000) $$,
  'P0001', 'rate_per_click_only', 'a fixed-price application has no rate to approve');
select throws_ok($$ select public.approve_application_at_rate('a7000000-0000-0000-0000-0000000000a1', 1000000, 10000) $$,
  'P0001', 'application_locked', 'an approved application can''t be approved again');

select lives_ok($$ select set_config('test.e3',
  public.approve_application_at_rate('a7000000-0000-0000-0000-0000000000a3', 1000000, 10000)::text, true) $$,
  'it hires the third creator at ₦100');
select lives_ok($$ select set_config('test.e4',
  public.approve_application_at_rate('a7000000-0000-0000-0000-0000000000a4', 1000000, 10000)::text, true) $$,
  'and the fourth');

-- Creator 5 is hired through the plain function: the rate is still stored. A
-- fixed-price hire has none.
select lives_ok($$ select set_config('test.e5',
  public.approve_application('a7000000-0000-0000-0000-0000000000a5', 1000000)::text, true) $$,
  'approving without the new function still hires');
select is((select cpc_kobo from public.engagements where id = current_setting('test.e5')::uuid),
  5000::bigint, 'and stores the campaign''s rate');
select lives_ok($$ select set_config('test.e6',
  public.approve_application('a7000000-0000-0000-0000-0000000000a6', 500000)::text, true) $$,
  'a fixed-price hire is approved as before');
select is((select cpc_kobo from public.engagements where id = current_setting('test.e6')::uuid),
  null::bigint, 'and has no rate');

set local request.jwt.claims = '{"sub": "a7a7a7a7-0000-0000-0000-0000000a7002"}';
select throws_ok($$ select public.approve_application_at_rate('a7000000-0000-0000-0000-0000000000a1', 1000000, 10000) $$,
  'P0001', 'no_such_application', 'another business can''t approve it');

-- The rate is frozen ------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "a7a7a7a7-0000-0000-0000-0000000a7101"}';
select throws_ok($$ select public.set_application_rate('a7000000-0000-0000-0000-0000000000a1', 5000) $$,
  'P0001', 'application_locked', 'a hired creator can''t change the rate');
select is((select cpc_kobo from public.engagements where id = current_setting('test.e1')::uuid),
  10000::bigint, 'a party reads the hire''s rate');
set local request.jwt.claims = '{"sub": "a7a7a7a7-0000-0000-0000-0000000a7102"}';
select is((select count(*) from public.engagements where id = current_setting('test.e1')::uuid),
  0::bigint, 'another creator can''t read it');

reset role;
update public.applications set proposed_cpc_kobo = 20000 where id = 'a7000000-0000-0000-0000-0000000000a1';
select is((select cpc_kobo from public.engagements where id = current_setting('test.e1')::uuid),
  10000::bigint, 'changing the application later doesn''t change the hire');
select throws_ok($$ update public.engagements set cpc_kobo = 7000 where id = current_setting('test.e1')::uuid $$,
  '23514', null, 'a hire''s rate must fit its budget in whole clicks');

-- What the business and the creator read ------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "a7a7a7a7-0000-0000-0000-0000000a7001"}';
select is((select x ->> 'proposed_cpc_kobo'
             from jsonb_array_elements(public.campaign_applications('a7000000-0000-0000-0000-0000000000c1')) x
            where x ->> 'id' = 'a7000000-0000-0000-0000-0000000000a3'),
  '10000', 'the business sees the rate a creator asks');
select is((select x -> 'engagement' ->> 'cpc_kobo'
             from jsonb_array_elements(public.campaign_applications('a7000000-0000-0000-0000-0000000000c1')) x
            where x ->> 'id' = 'a7000000-0000-0000-0000-0000000000a2'),
  '5000', 'and the rate each hire was agreed at');
set local request.jwt.claims = '{"sub": "a7a7a7a7-0000-0000-0000-0000000a7103"}';
select is((select x ->> 'proposed_cpc_kobo' || '/' || (x -> 'campaign' ->> 'cpc_kobo')
             from jsonb_array_elements(public.my_applications()) x
            where x ->> 'id' = 'a7000000-0000-0000-0000-0000000000a3'),
  '10000/5000', 'a creator sees their rate and the campaign''s');
reset role;

-- Fund and start the five per-click hires ----------------------------------------------------------
do $$
declare
  n int;
  e uuid;
  started jsonb;
begin
  for n in 1..5 loop
    e := current_setting('test.e' || n)::uuid;
    perform set_config('request.jwt.claims', '{"sub": "a7a7a7a7-0000-0000-0000-0000000a7001"}', true);
    started := public.start_payment(e, true);
    perform public.record_card_payment(started ->> 'reference', (started ->> 'card_amount_kobo')::bigint,
      25750, 'evt-rates-' || n, '{}');
    perform set_config('request.jwt.claims',
      json_build_object('sub', 'a7a7a7a7-0000-0000-0000-0000000a71' || lpad(n::text, 2, '0'))::text, true);
    perform public.start_engagement(e);
  end loop;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- What each person is shown -------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "a7a7a7a7-0000-0000-0000-0000000a7101"}';
select is((public.engagement_click_summary(current_setting('test.e1')::uuid))->>'cpcKobo', '10000',
  'a creator at ₦100 sees ₦100 a click');
select is((public.engagement_click_summary(current_setting('test.e1')::uuid))->>'capKobo', '1000000',
  'and the budget as the cap');
set local request.jwt.claims = '{"sub": "a7a7a7a7-0000-0000-0000-0000000a7102"}';
select is((public.engagement_click_summary(current_setting('test.e2')::uuid))->>'cpcKobo', '5000',
  'a creator at the campaign''s rate sees ₦50 a click');
reset role;

-- The cap is the hire's: 100 clicks at ₦100 (200 at ₦50) ------------------------------------------------
do $$
declare
  code text;
  r jsonb;
  i int;
begin
  select t.code into code from public.tracked_links t where t.engagement_id = current_setting('test.e1')::uuid;
  for i in 1..101 loop
    r := public.record_click(code, 'rates-v' || i, null, null, 'unknown', 'human');
  end loop;
  perform set_config('test.last_reason', coalesce(r ->> 'reason', 'none'), true);
end;
$$;
select is((select billable_clicks from public.tracked_links where engagement_id = current_setting('test.e1')::uuid),
  100, 'a ₦100 hire stops counting at 100 clicks');
select is(current_setting('test.last_reason'), 'cap_reached', 'the 101st click is over the cap');

-- Counters for the rest: e2 30 clicks at ₦50, e3 30 at ₦100, e4 20 at ₦100.
update public.tracked_links set billable_clicks = 30, total_hits = 30 where engagement_id = current_setting('test.e2')::uuid;
update public.tracked_links set billable_clicks = 30, total_hits = 30 where engagement_id = current_setting('test.e3')::uuid;
update public.tracked_links set billable_clicks = 20, total_hits = 20 where engagement_id = current_setting('test.e4')::uuid;

set local role authenticated;
set local request.jwt.claims = '{"sub": "a7a7a7a7-0000-0000-0000-0000000a7001"}';
select is((public.campaign_click_summary('a7000000-0000-0000-0000-0000000000c1'))->'totals'->>'spentKobo', '1650000',
  'the campaign''s spend adds each hire at its own rate (₦10,000 + ₦1,500 + ₦3,000 + ₦2,000)');
select is((select (h ->> 'earnedKobo')::bigint
             from jsonb_array_elements((public.campaign_click_summary('a7000000-0000-0000-0000-0000000000c1'))->'hires') h
            where h ->> 'engagementId' = current_setting('test.e3')),
  300000::bigint, 'one hire''s earnings are its clicks at its rate');
reset role;

-- Settlement pays the hire's rate ------------------------------------------------------------------------
select lives_ok($$ select public.settle_click_hire(current_setting('test.e1')::uuid, null, 'test') $$,
  'the capped ₦100 hire settles');
select is((select released_kobo from public.engagements where id = current_setting('test.e1')::uuid),
  1000000::bigint, 'and releases the whole budget (100 clicks at ₦100)');
select lives_ok($$ select public.settle_click_hire(current_setting('test.e2')::uuid, null, 'test') $$,
  'the ₦50 hire settles');
select is((select released_kobo from public.engagements where id = current_setting('test.e2')::uuid),
  150000::bigint, 'and releases 30 clicks at ₦50');
select lives_ok($$ select public.settle_click_hire(current_setting('test.e3')::uuid, null, 'test') $$,
  'the other ₦100 hire settles');
select is((select released_kobo from public.engagements where id = current_setting('test.e3')::uuid),
  300000::bigint, 'and releases 30 clicks at ₦100, not at the campaign''s ₦50');
select lives_ok($$ select public.settle_engagement_internal(current_setting('test.e4')::uuid, 'release', null, 'admin release', null) $$,
  'an admin releases the last ₦100 hire');
select is((select released_kobo from public.engagements where id = current_setting('test.e4')::uuid),
  200000::bigint, 'and it pays 20 clicks at ₦100');

select * from finish();
rollback;
