-- Proves the per-click settlement rules (click_settlement migration): a hire
-- settles once for its billable clicks, the business keeps its fee only on
-- what was spent (never less than ₦500 or the card charge, never more than the
-- fee), a cancel before the start uses the same rule, the daily job sends the
-- hold notice once and settles each hire after the 72-hour hold, and an open
-- dispute holds a hire back. Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(48);

-- Ada (business), creators c1..c8 (one hire each).
insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000cf001', 'cfcfcfcf-0000-0000-0000-0000000cf001', 'ada.clickpay@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000cf002', 'cfcfcfcf-0000-0000-0000-0000000cf002', 'efe.clickpay@example.com', 'admin');
insert into public.users (id, auth_user_id, email, role)
select ('00000000-0000-0000-0000-0000000cf1' || lpad(n::text, 2, '0'))::uuid,
       ('cfcfcfcf-0000-0000-0000-0000000cf1' || lpad(n::text, 2, '0'))::uuid,
       'c' || n || '.clickpay@example.com', 'influencer'
  from generate_series(1, 12) n;
insert into public.business_profiles (user_id, business_name, contact_name, state, city) values
  ('00000000-0000-0000-0000-0000000cf001', 'Ada Click Pay', 'Ada Obi', 'Lagos', 'Ikeja');
insert into public.influencer_profiles (user_id, display_name, state, city, niches, published)
select ('00000000-0000-0000-0000-0000000cf1' || lpad(n::text, 2, '0'))::uuid, 'Clickpay ' || n, 'Lagos', 'Yaba', '{fashion}', true
  from generate_series(1, 12) n;

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

-- Hires: 1, 2, 3, 5, 9, 10 on A; 4, 6, 7 on B; 8, 11, 12 on C.
insert into public.applications (id, campaign_id, creator_id, status)
select ('cf000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       ('cf000000-0000-0000-0000-00000000000' || case when n in (4, 6, 7) then 2 when n in (8, 11, 12) then 3 else 1 end)::uuid,
       ('00000000-0000-0000-0000-0000000cf1' || lpad(n::text, 2, '0'))::uuid, 'approved'
  from generate_series(1, 12) n;
insert into public.engagements (id, application_id, campaign_id, business_id, creator_id, agreed_price_kobo, pay_by)
select ('cf000000-0000-0000-0000-000000000e' || lpad(n::text, 2, '0'))::uuid, a.id, a.campaign_id,
       '00000000-0000-0000-0000-0000000cf001', a.creator_id, 2500000, now() + interval '48 hours'
  from generate_series(1, 12) n
  join public.applications a on a.id = ('cf000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid;

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
  perform public.pay_from_wallet('cf000000-0000-0000-0000-000000000e03', true);
  for n in 1..12 loop
    continue when n = 3;
    started := public.start_payment(('cf000000-0000-0000-0000-000000000e' || lpad(n::text, 2, '0'))::uuid, true);
    perform public.record_card_payment(started ->> 'reference', (started ->> 'card_amount_kobo')::bigint,
      53078, 'evt-clickpay-' || n, '{}');
  end loop;
  -- Every creator but 4 and 5 starts.
  for n in 1..12 loop
    continue when n in (4, 5);
    perform set_config('request.jwt.claims', json_build_object('sub', 'cfcfcfcf-0000-0000-0000-0000000cf1' || lpad(n::text, 2, '0'))::text, true);
    perform public.start_engagement(('cf000000-0000-0000-0000-000000000e' || lpad(n::text, 2, '0'))::uuid);
  end loop;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- Clicks (counters only): hire 1 has 200, hire 3 500, hire 7 10.
update public.tracked_links set billable_clicks = 200, total_hits = 200 where engagement_id = 'cf000000-0000-0000-0000-000000000e01';
update public.tracked_links set billable_clicks = 500, total_hits = 500 where engagement_id = 'cf000000-0000-0000-0000-000000000e03';
update public.tracked_links set billable_clicks = 10, total_hits = 10 where engagement_id = 'cf000000-0000-0000-0000-000000000e07';
-- Hire 6 is in a dispute.
update public.engagements set status = 'disputed' where id = 'cf000000-0000-0000-0000-000000000e06';

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
select lives_ok($$ select public.settle_click_hire('cf000000-0000-0000-0000-000000000e01', null, 'test') $$,
  'hire 1 settles');
select is((select status::text || ' ' || released_kobo from public.engagements where id = 'cf000000-0000-0000-0000-000000000e01'),
  'accepted 1000000', 'hire 1 released ₦10,000 for 200 clicks');
select is(pg_temp.moved('cf000000-0000-0000-0000-000000000e01', 'creator_wallet'), 950000::bigint,
  'the creator gets ₦9,500 after the ₦500 minimum fee');
select is(pg_temp.moved('cf000000-0000-0000-0000-000000000e01', 'business_wallet'), (1500000 + 125000 - 53078)::bigint,
  'the business gets the unspent budget and the fee above the card charge');
select is(pg_temp.moved('cf000000-0000-0000-0000-000000000e01', 'platform_revenue'), (50000 - (125000 - 53078))::bigint,
  'revenue: the creator fee in, the fee above the charge back out');
select is((select coalesce(sum(amount_kobo), 0)::bigint from public.ledger_entries
            where engagement_id = 'cf000000-0000-0000-0000-000000000e01' and account = 'escrow'), 0::bigint,
  'hire 1 escrow is empty');
select is((select count(*)::int from public.ledger_entries
            where engagement_id = 'cf000000-0000-0000-0000-000000000e01' and event_type = 'hire_settled'), 5,
  'one settlement group');
select lives_ok($$ select public.settle_click_hire('cf000000-0000-0000-0000-000000000e01', null, 'test') $$,
  'settling again is allowed');
select is((select count(*)::int from public.ledger_entries
            where engagement_id = 'cf000000-0000-0000-0000-000000000e01' and event_type = 'hire_settled'), 5,
  'and writes nothing');

-- Hire 2: no clicks ----------------------------------------------------------------------------
select lives_ok($$ select public.settle_click_hire('cf000000-0000-0000-0000-000000000e02', null, 'test') $$,
  'hire 2 settles');
select is((select status::text from public.engagements where id = 'cf000000-0000-0000-0000-000000000e02'), 'refunded',
  'no clicks: refunded');
select is(pg_temp.moved('cf000000-0000-0000-0000-000000000e02', 'business_wallet'), (2500000 + 125000 - 53078)::bigint,
  'the business keeps only the card charge as the fee');

-- Hire 3: wallet-funded, fully spent -------------------------------------------------------------
select lives_ok($$ select public.settle_click_hire('cf000000-0000-0000-0000-000000000e03', null, 'test') $$,
  'hire 3 settles');
select is((select status::text || ' ' || released_kobo from public.engagements where id = 'cf000000-0000-0000-0000-000000000e03'),
  'accepted 2500000', 'all 500 clicks: the whole budget');
select is(pg_temp.moved('cf000000-0000-0000-0000-000000000e03', 'business_wallet'), 0::bigint,
  'nothing back: the full fee is kept on a fully spent budget');

-- Hire 5: the business cancels before the start --------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "cfcfcfcf-0000-0000-0000-0000000cf001"}';
select lives_ok($$ select public.cancel_funded_engagement('cf000000-0000-0000-0000-000000000e05', true) $$,
  'the business cancels a paid, not-started per-click hire');
reset role;
select is(pg_temp.moved('cf000000-0000-0000-0000-000000000e05', 'business_wallet'), (2500000 + 125000 - 53078)::bigint,
  'and gets back all but the card charge');

-- The daily job -------------------------------------------------------------------------------
set local role service_role;
select is((public.settle_due_click_hires())->>'settled', '2',
  'the job settles the two hires past the hold (4 never started, 7 with 10 clicks)');
reset role;
select is((select status::text from public.engagements where id = 'cf000000-0000-0000-0000-000000000e06'), 'disputed',
  'a hire in a dispute is left alone');
select is((select status::text || ' ' || released_kobo from public.engagements where id = 'cf000000-0000-0000-0000-000000000e04'),
  'refunded 0', 'a hire that never started is refunded at the hold');
select is((select status::text || ' ' || released_kobo from public.engagements where id = 'cf000000-0000-0000-0000-000000000e07'),
  'accepted 50000', 'hire 7 is paid for its 10 clicks');
select is((select count(*)::int from public.notifications
            where kind = 'click_hold_started'
              and data ->> 'engagement_id' = 'cf000000-0000-0000-0000-000000000e08'), 2,
  'both people hear the hold started on hire 8');
select ok((select click_hold_notified_at is not null and settled_at is null
             from public.engagements where id = 'cf000000-0000-0000-0000-000000000e08'),
  'hire 8 is in the hold, not settled');

set local role service_role;
select is((public.settle_due_click_hires())->>'notified', '0', 'a second run notifies no one again');
reset role;

-- Withdrawing after the start stops the clicks; it's paid at the hold -----------------------------------
update public.tracked_links set billable_clicks = 7, total_hits = 7 where engagement_id = 'cf000000-0000-0000-0000-000000000e09';
select set_config('test.code9', (select code from public.tracked_links where engagement_id = 'cf000000-0000-0000-0000-000000000e09'), true);
select set_config('test.code10', (select code from public.tracked_links where engagement_id = 'cf000000-0000-0000-0000-000000000e10'), true);
set local role authenticated;
set local request.jwt.claims = '{"sub": "cfcfcfcf-0000-0000-0000-0000000cf109"}';
select lives_ok($$ select public.withdraw_from_engagement('cf000000-0000-0000-0000-000000000e09') $$,
  'creator 9 withdraws a started per-click hire');
reset role;
select ok((select clicks_stopped_at is not null and status = 'in_progress' and settled_at is null
             from public.engagements where id = 'cf000000-0000-0000-0000-000000000e09'),
  'the clicks stop; nothing settles yet');
select is((select count(*)::int from public.ledger_entries
            where engagement_id = 'cf000000-0000-0000-0000-000000000e09' and event_type = 'hire_settled'), 0,
  'no money moves on the withdrawal');
set local role authenticated;
set local request.jwt.claims = '{"sub": "cfcfcfcf-0000-0000-0000-0000000cf109"}';
select throws_ok($$ select public.withdraw_from_engagement('cf000000-0000-0000-0000-000000000e09') $$,
  'P0001', 'engagement_locked', 'withdrawing twice is refused');
set local role service_role;
select is((public.record_click(current_setting('test.code9'), 'w1', null, null, 'unknown', 'human'))->>'reason',
  'hire_ended', 'a click after the withdrawal does not count');
reset role;
select is(public.settle_click_hire('cf000000-0000-0000-0000-000000000e09', null, 'test'), true,
  'the withdrawn hire settles at the hold');
select is((select released_kobo from public.engagements where id = 'cf000000-0000-0000-0000-000000000e09'), 35000::bigint,
  'for the 7 clicks before the withdrawal');

-- The cap notice -------------------------------------------------------------------------------------
update public.tracked_links set billable_clicks = 499, total_hits = 499 where engagement_id = 'cf000000-0000-0000-0000-000000000e10';
set local role service_role;
select is((public.record_click(current_setting('test.code10'), 'cap1', null, null, 'unknown', 'human'))->>'billable',
  'true', 'the 500th click counts');
reset role;
select is((select count(*)::int from public.notifications
            where kind = 'click_cap_reached' and user_id = '00000000-0000-0000-0000-0000000cf110'), 1,
  'creator 10 hears the link reached its cap');
set local role service_role;
select is((public.record_click(current_setting('test.code10'), 'cap2', null, null, 'unknown', 'human'))->>'reason',
  'cap_reached', 'the next click is over the cap');
reset role;
select is((select count(*)::int from public.notifications
            where kind = 'click_cap_reached' and user_id = '00000000-0000-0000-0000-0000000cf110'), 1,
  'and is told only once');

-- Disputes during the hold ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "cfcfcfcf-0000-0000-0000-0000000cf110"}';
select throws_ok($$ select public.open_dispute('cf000000-0000-0000-0000-000000000e10',
    'These clicks were counted wrongly, please check.', '{}', '{}') $$,
  'P0001', 'dispute_not_allowed_yet', 'no dispute while clicks are still counting');
set local request.jwt.claims = '{"sub": "cfcfcfcf-0000-0000-0000-0000000cf111"}';
select lives_ok($$ select public.open_dispute('cf000000-0000-0000-0000-000000000e11',
    'Most of my clicks were not counted, please check.', '{}', '{}') $$,
  'the creator opens a dispute during the hold');
select lives_ok($$ select public.withdraw_dispute(
    (select id from public.disputes where engagement_id = 'cf000000-0000-0000-0000-000000000e11')) $$,
  'and withdraws it, which puts the hire back in progress');
set local request.jwt.claims = '{"sub": "cfcfcfcf-0000-0000-0000-0000000cf001"}';
select lives_ok($$ select public.open_dispute('cf000000-0000-0000-0000-000000000e12',
    'These clicks look like a click farm, all within one hour.', '{}', '{}') $$,
  'the business opens a dispute during the hold');
set local request.jwt.claims = '{"sub": "cfcfcfcf-0000-0000-0000-0000000cf002"}';
select lives_ok($$ select public.decide_dispute(
    (select id from public.disputes where engagement_id = 'cf000000-0000-0000-0000-000000000e12'),
    'split', 400000, 'Half the clicks were from one device.') $$,
  'an admin splits it');
reset role;
select is(pg_temp.moved('cf000000-0000-0000-0000-000000000e12', 'business_wallet'), (2100000 + 125000 - 53078)::bigint,
  'the business keeps its fee only as the per-click rule says');

-- The deliver-by date moves later after the notice: no settling, no second notice.
update public.campaigns set deliver_by = deliver_by + 5 where id = 'cf000000-0000-0000-0000-000000000003';
set local role service_role;
select is(public.settle_due_click_hires() - 'failed', '{"notified": 0, "settled": 0}'::jsonb,
  'a moved deliver-by date: nothing settles and nobody is told twice');
reset role;

select * from finish();
rollback;
