-- Proves the per-click settlement rules (click_settlement migration): a hire
-- settles once for its billable clicks, the business keeps its fee only on
-- what was spent (never less than ₦500 or the card charge, never more than the
-- fee), a cancel before the start uses the same rule, the daily job sends the
-- hold notice once and settles each hire after the 72-hour hold, and an open
-- dispute holds a hire back. Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(31);

-- Ada (business), creators c1..c8 (one hire each).
insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000cf001', 'cfcfcfcf-0000-0000-0000-0000000cf001', 'ada.clickpay@example.com', 'business');
insert into public.users (id, auth_user_id, email, role)
select ('00000000-0000-0000-0000-0000000cf01' || n)::uuid, ('cfcfcfcf-0000-0000-0000-0000000cf01' || n)::uuid,
       'c' || n || '.clickpay@example.com', 'influencer'
  from generate_series(1, 8) n;
insert into public.business_profiles (user_id, business_name, contact_name, state, city) values
  ('00000000-0000-0000-0000-0000000cf001', 'Ada Click Pay', 'Ada Obi', 'Lagos', 'Ikeja');
insert into public.influencer_profiles (user_id, display_name, state, city, niches, published)
select ('00000000-0000-0000-0000-0000000cf01' || n)::uuid, 'Clickpay ' || n, 'Lagos', 'Yaba', '{fashion}', true
  from generate_series(1, 8) n;

-- ₦50 a click, ₦25,000 per creator (500 clicks). A: clicks still counting.
-- B: the hold is over (deliver-by 4 days ago). C: in the hold (yesterday).
insert into public.campaigns (id, business_id, status, title, brief, payment_model, cpc_kobo, price_kobo,
                              destination_url, places, applications_close_on, deliver_by,
                              published_at, submitted_at, approved_at)
select ('cf000000-0000-0000-0000-00000000000' || x.n)::uuid, '00000000-0000-0000-0000-0000000cf001', 'open',
       'Click pay ' || x.n, 'A brief that is long enough for the checks.', 'per_click', 5000, 2500000,
       'https://shop.example.com/' || x.n, 8, public.lagos_today() + x.days, public.lagos_today() + x.days,
       now(), now(), now()
  from (values (1, 5), (2, -4), (3, -1)) as x (n, days);

-- Hires: 1, 2, 3, 5 on A; 4, 6, 7 on B; 8 on C.
insert into public.applications (id, campaign_id, creator_id, status)
select ('cf000000-0000-0000-0000-0000000000a' || n)::uuid,
       ('cf000000-0000-0000-0000-00000000000' || case when n in (4, 6, 7) then 2 when n = 8 then 3 else 1 end)::uuid,
       ('00000000-0000-0000-0000-0000000cf01' || n)::uuid, 'approved'
  from generate_series(1, 8) n;
insert into public.engagements (id, application_id, campaign_id, business_id, creator_id, agreed_price_kobo, pay_by)
select ('cf000000-0000-0000-0000-0000000000e' || n)::uuid, a.id, a.campaign_id,
       '00000000-0000-0000-0000-0000000cf001', a.creator_id, 2500000, now() + interval '48 hours'
  from generate_series(1, 8) n
  join public.applications a on a.id = ('cf000000-0000-0000-0000-0000000000a' || n)::uuid;

-- Hire 3 is paid from Ada's wallet; the rest by card (₦26,250, charge ₦530.78).
select public.post_ledger_group('correction', null, 'test credit', null, null, null, null, null,
  '[{"account": "paystack", "amount": 2625000},
    {"account": "business_wallet", "owner": "00000000-0000-0000-0000-0000000cf001", "amount": -2625000}]');
do $$
declare
  n int;
  started jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub": "cfcfcfcf-0000-0000-0000-0000000cf001"}', true);
  perform public.pay_from_wallet('cf000000-0000-0000-0000-0000000000e3', true);
  for n in 1..8 loop
    continue when n = 3;
    started := public.start_payment(('cf000000-0000-0000-0000-0000000000e' || n)::uuid, true);
    perform public.record_card_payment(started ->> 'reference', (started ->> 'card_amount_kobo')::bigint,
      53078, 'evt-clickpay-' || n, '{}');
  end loop;
  -- Every creator but 4 and 5 starts.
  for n in 1..8 loop
    continue when n in (4, 5);
    perform set_config('request.jwt.claims', json_build_object('sub', 'cfcfcfcf-0000-0000-0000-0000000cf01' || n)::text, true);
    perform public.start_engagement(('cf000000-0000-0000-0000-0000000000e' || n)::uuid);
  end loop;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- Clicks (counters only): hire 1 has 200, hire 3 500, hire 7 10.
update public.tracked_links set billable_clicks = 200, total_hits = 200 where engagement_id = 'cf000000-0000-0000-0000-0000000000e1';
update public.tracked_links set billable_clicks = 500, total_hits = 500 where engagement_id = 'cf000000-0000-0000-0000-0000000000e3';
update public.tracked_links set billable_clicks = 10, total_hits = 10 where engagement_id = 'cf000000-0000-0000-0000-0000000000e7';
-- Hire 6 is in a dispute.
update public.engagements set status = 'disputed' where id = 'cf000000-0000-0000-0000-0000000000e6';

-- What one hire's settlement group moved into an account (positive = credited to it).
create function pg_temp.moved(hire text, acct text) returns bigint language sql as $$
  select coalesce(-sum(l.amount_kobo), 0)::bigint from public.ledger_entries l
   where l.engagement_id = hire::uuid and l.account = acct and l.event_type = 'hire_settled'
$$;

-- Grants -----------------------------------------------------------------------------------------
select ok(not has_function_privilege('authenticated', 'public.settle_click_hire(uuid, uuid, text)', 'execute'),
  'signed-in people cannot settle a click hire');
select ok(not has_function_privilege('service_role', 'public.settle_click_hire(uuid, uuid, text)', 'execute'),
  'the server cannot call the internal settle directly');
select ok(not has_function_privilege('authenticated', 'public.settle_due_click_hires()', 'execute'),
  'signed-in people cannot run the daily settle');
select ok(has_function_privilege('service_role', 'public.settle_due_click_hires()', 'execute'),
  'the daily job can run it');

-- The window and the hold ----------------------------------------------------------------------
select is(public.click_window_end(date '2026-12-24'), timestamptz '2026-12-25 00:00:00+01',
  'clicks stop at midnight Lagos after the deliver-by day');
select is(public.click_settles_at(date '2026-12-24'), timestamptz '2026-12-28 00:00:00+01',
  'and settle 72 hours later');

-- Hire 1: 200 clicks by card ----------------------------------------------------------------
select lives_ok($$ select public.settle_click_hire('cf000000-0000-0000-0000-0000000000e1', null, 'test') $$,
  'hire 1 settles');
select is((select status::text || ' ' || released_kobo from public.engagements where id = 'cf000000-0000-0000-0000-0000000000e1'),
  'accepted 1000000', 'hire 1 released ₦10,000 for 200 clicks');
select is(pg_temp.moved('cf000000-0000-0000-0000-0000000000e1', 'creator_wallet'), 950000::bigint,
  'the creator gets ₦9,500 after the ₦500 minimum fee');
select is(pg_temp.moved('cf000000-0000-0000-0000-0000000000e1', 'business_wallet'), (1500000 + 125000 - 53078)::bigint,
  'the business gets the unspent budget and the fee above the card charge');
select is(pg_temp.moved('cf000000-0000-0000-0000-0000000000e1', 'platform_revenue'), (50000 - (125000 - 53078))::bigint,
  'revenue: the creator fee in, the fee above the charge back out');
select is((select coalesce(sum(amount_kobo), 0)::bigint from public.ledger_entries
            where engagement_id = 'cf000000-0000-0000-0000-0000000000e1' and account = 'escrow'), 0::bigint,
  'hire 1 escrow is empty');
select is((select count(*)::int from public.ledger_entries
            where engagement_id = 'cf000000-0000-0000-0000-0000000000e1' and event_type = 'hire_settled'), 5,
  'one settlement group');
select lives_ok($$ select public.settle_click_hire('cf000000-0000-0000-0000-0000000000e1', null, 'test') $$,
  'settling again is allowed');
select is((select count(*)::int from public.ledger_entries
            where engagement_id = 'cf000000-0000-0000-0000-0000000000e1' and event_type = 'hire_settled'), 5,
  'and writes nothing');

-- Hire 2: no clicks ----------------------------------------------------------------------------
select lives_ok($$ select public.settle_click_hire('cf000000-0000-0000-0000-0000000000e2', null, 'test') $$,
  'hire 2 settles');
select is((select status::text from public.engagements where id = 'cf000000-0000-0000-0000-0000000000e2'), 'refunded',
  'no clicks: refunded');
select is(pg_temp.moved('cf000000-0000-0000-0000-0000000000e2', 'business_wallet'), (2500000 + 125000 - 53078)::bigint,
  'the business keeps only the card charge as the fee');

-- Hire 3: wallet-funded, fully spent -------------------------------------------------------------
select lives_ok($$ select public.settle_click_hire('cf000000-0000-0000-0000-0000000000e3', null, 'test') $$,
  'hire 3 settles');
select is((select status::text || ' ' || released_kobo from public.engagements where id = 'cf000000-0000-0000-0000-0000000000e3'),
  'accepted 2500000', 'all 500 clicks: the whole budget');
select is(pg_temp.moved('cf000000-0000-0000-0000-0000000000e3', 'business_wallet'), 0::bigint,
  'nothing back: the full fee is kept on a fully spent budget');

-- Hire 5: the business cancels before the start --------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "cfcfcfcf-0000-0000-0000-0000000cf001"}';
select lives_ok($$ select public.cancel_funded_engagement('cf000000-0000-0000-0000-0000000000e5', true) $$,
  'the business cancels a paid, not-started per-click hire');
reset role;
select is(pg_temp.moved('cf000000-0000-0000-0000-0000000000e5', 'business_wallet'), (2500000 + 125000 - 53078)::bigint,
  'and gets back all but the card charge');

-- The daily job -------------------------------------------------------------------------------
set local role service_role;
select is((public.settle_due_click_hires())->>'settled', '2',
  'the job settles the two hires past the hold (4 never started, 7 with 10 clicks)');
reset role;
select is((select status::text from public.engagements where id = 'cf000000-0000-0000-0000-0000000000e6'), 'disputed',
  'a hire in a dispute is left alone');
select is((select status::text || ' ' || released_kobo from public.engagements where id = 'cf000000-0000-0000-0000-0000000000e4'),
  'refunded 0', 'a hire that never started is refunded at the hold');
select is((select status::text || ' ' || released_kobo from public.engagements where id = 'cf000000-0000-0000-0000-0000000000e7'),
  'accepted 50000', 'hire 7 is paid for its 10 clicks');
select is((select count(*)::int from public.notifications
            where kind = 'click_hold_started'
              and data ->> 'engagement_id' = 'cf000000-0000-0000-0000-0000000000e8'), 2,
  'both people hear the hold started on hire 8');
select ok((select click_hold_notified_at is not null and settled_at is null
             from public.engagements where id = 'cf000000-0000-0000-0000-0000000000e8'),
  'hire 8 is in the hold, not settled');

set local role service_role;
select is((public.settle_due_click_hires())->>'notified', '0', 'a second run notifies no one again');
reset role;

-- The deliver-by date moves later after the notice: no settling, no second notice.
update public.campaigns set deliver_by = deliver_by + 5 where id = 'cf000000-0000-0000-0000-000000000003';
set local role service_role;
select is(public.settle_due_click_hires() - 'failed', '{"notified": 0, "settled": 0}'::jsonb,
  'a moved deliver-by date: nothing settles and nobody is told twice');
reset role;

select * from finish();
rollback;
