-- Proves admin_platform_overview() (admin_platform_overview migration): only
-- an admin may call it, admins are not counted as people, drafts are not
-- counted as campaigns, "paid in" is cash that reached us (card payments, not
-- wallet or escrow moves), "paid out" is what reached creators (paid payouts
-- only, never one still processing or only requested, less the transfer cost
-- they bear), and "revenue" is the fees we kept (net of the unspent per-click
-- fee that went back to a business). The local database may hold other
-- people's data, so each figure is checked as the change the fixture made: the
-- overview before the fixture against the overview after it.
-- Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

-- Efe is an admin (and reads the overview). Ada and Bola are businesses, Chidi,
-- Dayo and Eme are creators, Gus is a second admin made after the first reading.
insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000ab002', 'abababab-0000-0000-0000-0000000ab002', 'efe.overview@example.com', 'admin');

select set_config('request.jwt.claims', '{"sub": "abababab-0000-0000-0000-0000000ab002"}', true);
create temp table overview_before on commit drop as select public.admin_platform_overview() as o;

insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000ab001', 'abababab-0000-0000-0000-0000000ab001', 'ada.overview@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000ab003', 'abababab-0000-0000-0000-0000000ab003', 'bola.overview@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000ab004', 'abababab-0000-0000-0000-0000000ab004', 'gus.overview@example.com', 'admin'),
  ('00000000-0000-0000-0000-0000000ab101', 'abababab-0000-0000-0000-0000000ab101', 'chidi.overview@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000ab102', 'abababab-0000-0000-0000-0000000ab102', 'dayo.overview@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000ab103', 'abababab-0000-0000-0000-0000000ab103', 'eme.overview@example.com', 'influencer');
insert into public.business_profiles (user_id, business_name, contact_name, state, city) values
  ('00000000-0000-0000-0000-0000000ab001', 'Ada Overview Kitchen', 'Ada Obi', 'Lagos', 'Ikeja'),
  ('00000000-0000-0000-0000-0000000ab003', 'Bola Overview Shop', 'Bola A', 'Oyo', 'Ibadan');

-- Identity fixtures: the people made above count as verified, so the identity
-- gates are not what this file is about.
insert into public.identity_checks (user_id, kind, status, reference, legal_name_entered, legal_name_on_record,
                                    id_last3, id_fingerprint, counted, decided_at)
select u.id, case u.role when 'influencer' then 'creator_nin' else 'owner_nin' end, 'verified',
       'pit_id_fx_' || replace(u.id::text, '-', ''), 'Fixture Person', 'FIXTURE PERSON', '000',
       'v1:fx-' || u.id::text, true, now()
  from public.users u
 where u.created_at = now() and u.role in ('influencer', 'business')
   and not exists (select 1 from public.identity_checks c where c.user_id = u.id);
insert into public.screenings (user_id, subject, trigger, status)
select u.id, 'person', 'admin', 'clear'
  from public.users u
 where u.created_at = now() and u.role = 'influencer'
   and not exists (select 1 from public.screenings s where s.user_id = u.id);

-- Campaigns: draft (not counted), open and per-click open (hired), in progress,
-- completed and closed. Five count; three are live.
insert into public.campaigns (id, business_id, status, title, brief, price_kobo, places,
                              applications_close_on, deliver_by, published_at, submitted_at) values
  ('ab000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000ab001', 'draft', 'Overview draft',
   'A brief that is long enough for the checks.', 5000000, 5, public.lagos_today() + 10, public.lagos_today() + 20, null, null),
  ('ab000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000ab001', 'open', 'Overview open',
   'A brief that is long enough for the checks.', 5000000, 5, public.lagos_today() + 10, public.lagos_today() + 20, now(), now()),
  ('ab000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000ab001', 'in_progress', 'Overview in progress',
   'A brief that is long enough for the checks.', 5000000, 5, public.lagos_today() + 10, public.lagos_today() + 20, now(), now()),
  ('ab000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000ab001', 'completed', 'Overview completed',
   'A brief that is long enough for the checks.', 5000000, 5, public.lagos_today() + 10, public.lagos_today() + 20, now(), now()),
  ('ab000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-0000000ab001', 'closed', 'Overview closed',
   'A brief that is long enough for the checks.', 5000000, 5, public.lagos_today() + 10, public.lagos_today() + 20, now(), now());
-- ₦50 a click, ₦40,000 budget per creator (800 clicks).
insert into public.campaigns (id, business_id, status, title, brief, payment_model, cpc_kobo, price_kobo,
                              destination_url, places, applications_close_on, deliver_by,
                              published_at, submitted_at, approved_at)
values ('ab000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000ab001', 'open', 'Overview per click',
        'A brief that is long enough for the checks.', 'per_click', 5000, 4000000,
        'https://shop.example.com/overview', 5, public.lagos_today() + 10, public.lagos_today() + 20,
        now(), now(), now());

-- Hire 1: Chidi, fixed ₦50,000. Hire 2: Dayo, per click, ₦40,000 budget.
insert into public.applications (id, campaign_id, creator_id, status) values
  ('ab000000-0000-0000-0000-0000000a0001', 'ab000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000ab101', 'approved'),
  ('ab000000-0000-0000-0000-0000000a0002', 'ab000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000ab102', 'approved');
insert into public.engagements (id, application_id, campaign_id, business_id, creator_id, agreed_price_kobo, pay_by) values
  ('ab000000-0000-0000-0000-0000000e0001', 'ab000000-0000-0000-0000-0000000a0001', 'ab000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-0000000ab001', '00000000-0000-0000-0000-0000000ab101', 5000000, now() + interval '48 hours'),
  ('ab000000-0000-0000-0000-0000000e0002', 'ab000000-0000-0000-0000-0000000a0002', 'ab000000-0000-0000-0000-000000000005',
   '00000000-0000-0000-0000-0000000ab001', '00000000-0000-0000-0000-0000000ab102', 4000000, now() + interval '48 hours');

-- Ada pays both hires by card: ₦52,500 (Paystack charge ₦954.06) and ₦42,000
-- (charge ₦800). Dayo starts, so his link exists, and gets 100 billable clicks.
do $$
declare
  started jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub": "abababab-0000-0000-0000-0000000ab001"}', true);
  started := public.start_payment('ab000000-0000-0000-0000-0000000e0001', true);
  perform public.record_card_payment(started ->> 'reference', (started ->> 'card_amount_kobo')::bigint,
    95406, 'evt-overview-1', '{}');
  started := public.start_payment('ab000000-0000-0000-0000-0000000e0002', true);
  perform public.record_card_payment(started ->> 'reference', (started ->> 'card_amount_kobo')::bigint,
    80000, 'evt-overview-2', '{}');
  perform set_config('request.jwt.claims', '{"sub": "abababab-0000-0000-0000-0000000ab102"}', true);
  perform public.start_engagement('ab000000-0000-0000-0000-0000000e0002');
  perform set_config('request.jwt.claims', '', true);
end;
$$;
update public.tracked_links set billable_clicks = 100, total_hits = 100
 where engagement_id = 'ab000000-0000-0000-0000-0000000e0002';

-- Hire 1 releases in full: ₦2,500 business fee and ₦2,500 creator fee kept, ₦47,500 to Chidi.
-- Hire 2 pays for 100 clicks (₦5,000): the creator fee is the ₦500 minimum, and of the
-- ₦2,000 business fee we keep ₦800 (Paystack's charge) and ₦1,200 goes back to Ada.
select public.settle_engagement_internal('ab000000-0000-0000-0000-0000000e0001', 'release', null, 'test', null);
select public.settle_click_hire('ab000000-0000-0000-0000-0000000e0002', null, 'test');

-- Payouts: Chidi's ₦20,000 is paid; his ₦22,000 is approved and sent, still
-- processing; Dayo's ₦2,000 is only requested.
select public.save_bank_account_for('00000000-0000-0000-0000-0000000ab101', '058', 'GTBank', '1234',
  'CHIDI OKAFOR', 'RCP_chidi_overview');
select public.save_bank_account_for('00000000-0000-0000-0000-0000000ab102', '058', 'GTBank', '5678',
  'DAYO ADE', 'RCP_dayo_overview');
set local role authenticated;
set local request.jwt.claims = '{"sub": "abababab-0000-0000-0000-0000000ab101"}'; -- Chidi
select public.request_payout(2000000);
select public.request_payout(2200000);
set local request.jwt.claims = '{"sub": "abababab-0000-0000-0000-0000000ab102"}'; -- Dayo
select public.request_payout(200000);
set local request.jwt.claims = '{"sub": "abababab-0000-0000-0000-0000000ab002"}'; -- Efe
select public.approve_payout((select id from public.payouts where amount_kobo = 2000000 and user_id = '00000000-0000-0000-0000-0000000ab101'));
select public.approve_payout((select id from public.payouts where amount_kobo = 2200000 and user_id = '00000000-0000-0000-0000-0000000ab101'));
reset role;
set local role service_role;
select public.finish_payout((select reference from public.payouts where amount_kobo = 2000000 and user_id = '00000000-0000-0000-0000-0000000ab101'),
  'paid', 'paystack.transfer.paid:overview-1', '{}');
reset role;

-- What the fixture built ------------------------------------------------------------------------------------
select is((select array_agg(status order by amount_kobo) from public.payouts
            where user_id in ('00000000-0000-0000-0000-0000000ab101', '00000000-0000-0000-0000-0000000ab102')),
  array['requested', 'paid', 'processing'], 'the payouts are requested, paid and still processing');
select is((select released_kobo from public.engagements where id = 'ab000000-0000-0000-0000-0000000e0002'), 500000::bigint,
  'the per-click hire released ₦5,000 for its 100 clicks');
select is(public.wallet_balance('00000000-0000-0000-0000-0000000ab001', 'business_wallet'), (3500000 + 120000)::bigint,
  'Ada got the unspent ₦35,000 back plus ₦1,200 of the fee');

-- The overview ------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "abababab-0000-0000-0000-0000000ab002"}', true);
create temp table overview_after on commit drop as select public.admin_platform_overview() as o;

create function pg_temp.change(figure text) returns bigint language sql as $$
  select ((a.o ->> figure)::numeric - (b.o ->> figure)::numeric)::bigint
    from overview_after a, overview_before b
$$;

select is(pg_temp.change('businesses'), 2::bigint, 'two businesses were added');
select is(pg_temp.change('creators'), 3::bigint, 'three creators were added, and neither admin is counted');
select is(pg_temp.change('campaigns_total'), 5::bigint, 'five campaigns count, the draft does not');
select is(pg_temp.change('campaigns_live'), 3::bigint, 'three of them are live (open or in progress)');
select is(pg_temp.change('paid_in_kobo'), (5250000 + 4200000)::bigint,
  'paid in is the two card payments, not wallet or escrow moves');
select is(pg_temp.change('paid_out_kobo'),
  (select (amount_kobo - transfer_fee_kobo)::bigint from public.payouts
    where amount_kobo = 2000000 and user_id = '00000000-0000-0000-0000-0000000ab101'),
  'paid out is the paid payout less its transfer cost: the one still processing and the one only requested are left out');
select is(pg_temp.change('revenue_kobo'), (250000 + 250000 + 200000 + 50000 - 120000)::bigint,
  'revenue is the fees kept, with the unspent per-click fee taken back out');
select is((select (o ->> 'as_of')::timestamptz from overview_after), now(), 'the overview says when it was read');

-- Who may call it ----------------------------------------------------------------------------------------------
select ok(has_function_privilege('authenticated', 'public.admin_platform_overview()', 'execute')
          and not has_function_privilege('anon', 'public.admin_platform_overview()', 'execute')
          and not has_function_privilege('service_role', 'public.admin_platform_overview()', 'execute'),
  'only signed-in people may call it, and then only admins get an answer');
set local role authenticated;
set local request.jwt.claims = '{"sub": "abababab-0000-0000-0000-0000000ab001"}'; -- Ada, a business
select throws_ok($$ select public.admin_platform_overview() $$, 'P0001', 'not_an_admin',
  'a business cannot read the overview');
set local request.jwt.claims = '{"sub": "abababab-0000-0000-0000-0000000ab101"}'; -- Chidi, a creator
select throws_ok($$ select public.admin_platform_overview() $$, 'P0001', 'not_an_admin',
  'nor can a creator');
reset role;

select * from finish();
rollback;
