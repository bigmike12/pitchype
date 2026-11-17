-- Proves the rules from the create_settlement migration: only the hired
-- creator starts work, and only on a funded hire; a business cancel returns the
-- price and keeps the fee; a creator cancel returns price + fee − Paystack's
-- charge; nobody cancels alone once work started; an admin settles with a
-- reason, and release, refund, split and fault outcomes write balanced groups
-- with the creator fee from the engagement's snapshot; a second settlement or
-- cancellation writes nothing.
-- Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(120);

-- Ada and Bola are businesses, Efe is an admin, creators 5e101..5e116 are hired.
insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-00000005e001', '5e5e5e5e-0000-0000-0000-00000005e001', 'ada.settle@example.com', 'business'),
  ('00000000-0000-0000-0000-00000005e002', '5e5e5e5e-0000-0000-0000-00000005e002', 'bola.settle@example.com', 'business'),
  ('00000000-0000-0000-0000-00000005e003', '5e5e5e5e-0000-0000-0000-00000005e003', 'efe.settle@example.com', 'admin');

insert into public.users (id, auth_user_id, email, role)
select ('00000000-0000-0000-0000-00000005e1' || lpad(n::text, 2, '0'))::uuid,
       ('5e5e5e5e-0000-0000-0000-00000005e1' || lpad(n::text, 2, '0'))::uuid,
       'c' || n || '.settle@example.com', 'influencer'
  from generate_series(1, 16) n;

insert into public.business_profiles (user_id, business_name, contact_name, state, city) values
  ('00000000-0000-0000-0000-00000005e001', 'Ada Settle Kitchen', 'Ada Obi', 'Lagos', 'Ikeja'),
  ('00000000-0000-0000-0000-00000005e002', 'Bola Settle Shop', 'Bola A', 'Oyo', 'Ibadan');

insert into public.campaigns (id, business_id, status, title, brief, price_kobo, places,
                              applications_close_on, deliver_by, published_at, submitted_at) values
  ('5e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000005e001', 'open', 'Settlement test A',
   'A brief that is long enough for the checks.', 5000000, 20, public.lagos_today() + 10, public.lagos_today() + 20, now(), now()),
  ('5e000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000005e002', 'open', 'Settlement test B',
   'A brief that is long enough for the checks.', 5000000, 20, public.lagos_today() + 10, public.lagos_today() + 20, now(), now());

-- Hire n is creator n's. Hire 10 is Bola's; the rest are Ada's. ₦50,000 each.
insert into public.applications (id, campaign_id, creator_id, status)
select ('5e000000-0000-0000-0000-0000000a00' || lpad(n::text, 2, '0'))::uuid,
       case when n = 10 then '5e000000-0000-0000-0000-000000000002' else '5e000000-0000-0000-0000-000000000001' end::uuid,
       ('00000000-0000-0000-0000-00000005e1' || lpad(n::text, 2, '0'))::uuid, 'approved'
  from generate_series(1, 16) n;

insert into public.engagements (id, application_id, campaign_id, business_id, creator_id, agreed_price_kobo, pay_by)
select ('5e000000-0000-0000-0000-0000000e00' || lpad(n::text, 2, '0'))::uuid,
       ('5e000000-0000-0000-0000-0000000a00' || lpad(n::text, 2, '0'))::uuid,
       case when n = 10 then '5e000000-0000-0000-0000-000000000002' else '5e000000-0000-0000-0000-000000000001' end::uuid,
       case when n = 10 then '00000000-0000-0000-0000-00000005e002' else '00000000-0000-0000-0000-00000005e001' end::uuid,
       ('00000000-0000-0000-0000-00000005e1' || lpad(n::text, 2, '0'))::uuid,
       5000000, now() + interval '48 hours'
  from generate_series(1, 16) n;

-- Bola has ₦26,250 in the wallet, so hire 10 is paid half from the wallet, half by card.
select public.post_ledger_group('correction', null, 'test credit', null, null, null, null, null,
  '[{"account": "paystack", "amount": 2625000},
    {"account": "business_wallet", "owner": "00000000-0000-0000-0000-00000005e002", "amount": -2625000}]');

-- Fund hires 1..13 by card the way the app does: start the payment as the
-- business, then record Paystack's confirmation. Hire 14 stays unpaid.
-- Paystack's charge: ₦954.06 on ₦52,500; ₦530.78 on hire 10's ₦26,250 card part.
do $$
declare
  n integer;
  started jsonb;
begin
  for n in 1..13 loop
    perform set_config('request.jwt.claims', json_build_object('sub',
      case when n = 10 then '5e5e5e5e-0000-0000-0000-00000005e002' else '5e5e5e5e-0000-0000-0000-00000005e001' end)::text, true);
    started := public.start_payment(('5e000000-0000-0000-0000-0000000e00' || lpad(n::text, 2, '0'))::uuid, true);
    perform public.record_card_payment(started ->> 'reference', (started ->> 'card_amount_kobo')::bigint,
      case when n = 10 then 53078 else 95406 end, 'evt-settle-' || n, '{}');
  end loop;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

select is((select count(*)::integer from public.engagements
            where id::text like '5e000000-0000-0000-0000-0000000e00%' and status = 'funded'), 13,
  'hires 1 to 13 are funded');

-- Hire 15 is paid by payment A; an older payment B that A superseded succeeds
-- late (charge ₦900) and is stranded into Ada's wallet. Hire 16 stays unpaid
-- until Ada pays it from her wallet later.
do $$
declare
  b jsonb;
  a jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub": "5e5e5e5e-0000-0000-0000-00000005e001"}', true);
  b := public.start_payment('5e000000-0000-0000-0000-0000000e0015', true);
  a := public.start_payment('5e000000-0000-0000-0000-0000000e0015', true);
  perform set_config('request.jwt.claims', '', true);
  if public.record_card_payment(a ->> 'reference', 5250000, 95406, 'evt-settle-15a', '{}') <> 'funded'
     or public.record_card_payment(b ->> 'reference', 5250000, 90000, 'evt-settle-15b', '{}') <> 'stranded' then
    raise exception 'hire 15 fixture did not fund and strand as expected';
  end if;
end;
$$;
select is((select array_agg(paystack_fee_kobo order by paystack_fee_kobo) from public.payments
            where engagement_id = '5e000000-0000-0000-0000-0000000e0015' and status = 'succeeded'),
  array[90000, 95406]::bigint[], 'hire 15 has two succeeded payments: the funding one and a stranded one');
select is(public.wallet_balance('00000000-0000-0000-0000-00000005e001', 'business_wallet'), 5250000::bigint,
  'the stranded payment sits in Ada''s wallet');
select is((select array[card_amount_kobo, wallet_part_kobo] from public.payments
            where engagement_id = '5e000000-0000-0000-0000-0000000e0010'),
  array[2625000, 2625000]::bigint[], 'hire 10 is paid half from the wallet, half by card');

-- Hire 11 gets a 2.5% snapshot with no minimum, so a release can land on half a kobo.
update public.engagements set creator_fee_bps = 250, creator_min_fee_kobo = 0
 where id = '5e000000-0000-0000-0000-0000000e0011';

-- Starting work -----------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "5e5e5e5e-0000-0000-0000-00000005e102"}'; -- creator 2
select throws_ok($$ select public.start_engagement('5e000000-0000-0000-0000-0000000e0001') $$,
  'P0001', 'no_such_engagement', 'another creator cannot start work on hire 1');
set local request.jwt.claims = '{"sub": "5e5e5e5e-0000-0000-0000-00000005e001"}'; -- Ada
select throws_ok($$ select public.start_engagement('5e000000-0000-0000-0000-0000000e0001') $$,
  'P0001', 'no_such_engagement', 'the business cannot start work');
set local request.jwt.claims = '{"sub": "5e5e5e5e-0000-0000-0000-00000005e003"}'; -- Efe
select throws_ok($$ select public.start_engagement('5e000000-0000-0000-0000-0000000e0001') $$,
  'P0001', 'no_such_engagement', 'an admin cannot start work for the creator');
set local request.jwt.claims = '{"sub": "5e5e5e5e-0000-0000-0000-00000005e114"}'; -- creator 14
select throws_ok($$ select public.start_engagement('5e000000-0000-0000-0000-0000000e0014') $$,
  'P0001', 'engagement_locked', 'work cannot start on an unpaid hire');
set local request.jwt.claims = '{"sub": "5e5e5e5e-0000-0000-0000-00000005e101"}'; -- creator 1
select lives_ok($$ select public.start_engagement('5e000000-0000-0000-0000-0000000e0001') $$,
  'creator 1 starts work on hire 1');
select throws_ok($$ select public.start_engagement('5e000000-0000-0000-0000-0000000e0001') $$,
  'P0001', 'engagement_locked', 'starting twice is refused');
set local request.jwt.claims = '{"sub": "5e5e5e5e-0000-0000-0000-00000005e107"}'; -- creator 7
select lives_ok($$ select public.start_engagement('5e000000-0000-0000-0000-0000000e0007') $$,
  'creator 7 starts work on hire 7');
reset role;
set local role anon;
select throws_ok($$ select public.start_engagement('5e000000-0000-0000-0000-0000000e0001') $$,
  '42501', null, 'anon cannot start work');
reset role;

select ok((select status = 'in_progress' and started_at is not null from public.engagements
            where id = '5e000000-0000-0000-0000-0000000e0001'),
  'hire 1 is in progress with started_at set');
select is((select count(*)::integer from public.ledger_entries
            where engagement_id = '5e000000-0000-0000-0000-0000000e0001' and event_type = 'hire_settled'), 0,
  'starting work moves no money');

-- Nobody cancels alone once work started -----------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "5e5e5e5e-0000-0000-0000-00000005e001"}'; -- Ada
select throws_ok($$ select public.cancel_funded_engagement('5e000000-0000-0000-0000-0000000e0007', true) $$,
  'P0001', 'engagement_locked', 'the business cannot cancel once work started');
set local request.jwt.claims = '{"sub": "5e5e5e5e-0000-0000-0000-00000005e107"}'; -- creator 7
select throws_ok($$ select public.cancel_funded_engagement('5e000000-0000-0000-0000-0000000e0007', true) $$,
  'P0001', 'engagement_locked', 'the creator cannot cancel once work started');
set local request.jwt.claims = '{"sub": "5e5e5e5e-0000-0000-0000-00000005e114"}'; -- creator 14
select throws_ok($$ select public.cancel_funded_engagement('5e000000-0000-0000-0000-0000000e0014', true) $$,
  'P0001', 'engagement_locked', 'an unpaid hire is not cancelled here');

-- The business cancels a funded hire (hire 5) ------------------------------------------------------
set local request.jwt.claims = '{"sub": "5e5e5e5e-0000-0000-0000-00000005e002"}'; -- Bola
select throws_ok($$ select public.cancel_funded_engagement('5e000000-0000-0000-0000-0000000e0005', true) $$,
  'P0001', 'no_such_engagement', 'another business cannot cancel Ada''s hire');
set local request.jwt.claims = '{"sub": "5e5e5e5e-0000-0000-0000-00000005e106"}'; -- creator 6
select throws_ok($$ select public.cancel_funded_engagement('5e000000-0000-0000-0000-0000000e0005', true) $$,
  'P0001', 'no_such_engagement', 'another creator cannot cancel hire 5');
set local request.jwt.claims = '{"sub": "5e5e5e5e-0000-0000-0000-00000005e001"}'; -- Ada
select throws_ok($$ select public.cancel_funded_engagement('5e000000-0000-0000-0000-0000000e0005', false) $$,
  '22023', 'fee_notice_required', 'the business must have seen the non-refundable fee');
select throws_ok($$ select public.cancel_funded_engagement('5e000000-0000-0000-0000-0000000e0005', null) $$,
  '22023', 'fee_notice_required', 'a null fee notice counts as not seen');
select lives_ok($$ select public.cancel_funded_engagement('5e000000-0000-0000-0000-0000000e0005', true) $$,
  'Ada cancels hire 5 before work started');
select throws_ok($$ select public.cancel_funded_engagement('5e000000-0000-0000-0000-0000000e0005', true) $$,
  'P0001', 'engagement_locked', 'cancelling twice is refused');
reset role;

select is((select array[status::text, cancel_reason, settle_outcome] from public.engagements
            where id = '5e000000-0000-0000-0000-0000000e0005'),
  array['cancelled', 'cancelled_by_business', 'refund'], 'hire 5 is cancelled by the business');
select ok((select cancelled_at is not null and settled_at is not null and cancel_fee_notice_seen_at is not null
             and released_kobo = 0 and refunded_kobo = 5000000
             from public.engagements where id = '5e000000-0000-0000-0000-0000000e0005'),
  'with the times, the fee notice and the amounts recorded');
select is((select array_agg(account || ':' || amount_kobo order by account) from public.ledger_entries
            where engagement_id = '5e000000-0000-0000-0000-0000000e0005' and event_type = 'hire_settled'),
  '{business_wallet:-5000000,escrow:5000000}'::text[],
  'the price goes back to the business wallet; the fee stays');
select is((select sum(amount_kobo) from public.ledger_entries
            where engagement_id = '5e000000-0000-0000-0000-0000000e0005' and account = 'platform_revenue'),
  -250000::numeric, 'the platform keeps the ₦2,500 business fee');
select is((select count(*)::integer from public.ledger_entries
            where engagement_id = '5e000000-0000-0000-0000-0000000e0005'), 7,
  'the failed second cancel wrote nothing (5 funding rows + 2 cancel rows)');

-- The creator withdraws from a funded hire (hire 6) ------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "5e5e5e5e-0000-0000-0000-00000005e106"}'; -- creator 6
select lives_ok($$ select public.cancel_funded_engagement('5e000000-0000-0000-0000-0000000e0006', false) $$,
  'creator 6 withdraws from hire 6 (no fee notice needed)');
select throws_ok($$ select public.cancel_funded_engagement('5e000000-0000-0000-0000-0000000e0006', false) $$,
  'P0001', 'engagement_locked', 'withdrawing twice is refused');
reset role;

select is((select array[status::text, cancel_reason, settle_outcome] from public.engagements
            where id = '5e000000-0000-0000-0000-0000000e0006'),
  array['cancelled', 'cancelled_by_creator', 'refund_creator_fault'], 'hire 6 is cancelled by the creator');
select is((select array_agg(account || ':' || amount_kobo order by account) from public.ledger_entries
            where engagement_id = '5e000000-0000-0000-0000-0000000e0006' and event_type = 'hire_settled'),
  '{business_wallet:-5154594,escrow:5000000,platform_revenue:154594}'::text[],
  'the business gets ₦50,000 + ₦2,500 − ₦954.06 Paystack charge');
select is((select sum(amount_kobo) from public.ledger_entries
            where engagement_id = '5e000000-0000-0000-0000-0000000e0006' and account = 'platform_revenue'),
  -(select sum(amount_kobo) from public.ledger_entries
     where engagement_id = '5e000000-0000-0000-0000-0000000e0006' and account = 'paystack_fees'),
  'the platform breaks even: revenue left equals Paystack''s charge');
select is(public.wallet_balance('00000000-0000-0000-0000-00000005e106', 'creator_wallet'), 0::bigint,
  'creator 6 gets nothing');

-- Settlement refusals -------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "5e5e5e5e-0000-0000-0000-00000005e001"}'; -- Ada
select throws_ok($$ select public.settle_engagement('5e000000-0000-0000-0000-0000000e0002', 'refund', null, 'mine') $$,
  'P0001', 'not_allowed', 'a business cannot settle');
set local request.jwt.claims = '{"sub": "5e5e5e5e-0000-0000-0000-00000005e102"}'; -- creator 2
select throws_ok($$ select public.settle_engagement('5e000000-0000-0000-0000-0000000e0002', 'release', null, 'mine') $$,
  'P0001', 'not_allowed', 'a creator cannot settle');
set local request.jwt.claims = '{"sub": "5e5e5e5e-0000-0000-0000-00000005e003"}'; -- Efe
select throws_ok($$ select public.settle_engagement('5e000000-0000-0000-0000-0000000e0002', 'refund', null, '   ') $$,
  'P0001', 'settle_reason_required', 'a blank reason is refused');
select throws_ok($$ select public.settle_engagement('5e000000-0000-0000-0000-0000000e0002', 'refund', null, null) $$,
  'P0001', 'settle_reason_required', 'a missing reason is refused');
select throws_ok($$ select public.settle_engagement('5e000000-0000-0000-0000-0000000e0002', 'refund', null, repeat('x', 501)) $$,
  'P0001', 'settle_reason_required', 'a reason over 500 characters is refused');
select throws_ok($$ select public.settle_engagement('5e000000-0000-0000-0000-0000000e0003', 'split', -1, 'test') $$,
  'P0001', 'release_invalid', 'a negative release is refused');
select throws_ok($$ select public.settle_engagement('5e000000-0000-0000-0000-0000000e0003', 'split', 5000100, 'test') $$,
  'P0001', 'release_invalid', 'a release over the price is refused');
select throws_ok($$ select public.settle_engagement('5e000000-0000-0000-0000-0000000e0003', 'split', 100050, 'test') $$,
  'P0001', 'release_invalid', 'a release that is not whole naira is refused');
select throws_ok($$ select public.settle_engagement('5e000000-0000-0000-0000-0000000e0003', 'split', null, 'test') $$,
  'P0001', 'release_invalid', 'a split needs an amount');
select throws_ok($$ select public.settle_engagement('5e000000-0000-0000-0000-0000000e0003', 'release', 100000, 'test') $$,
  'P0001', 'release_invalid', 'a full release with a different amount is refused');
select throws_ok($$ select public.settle_engagement('5e000000-0000-0000-0000-0000000e0003', 'bogus', null, 'test') $$,
  '22023', 'invalid_outcome', 'an unknown outcome is refused');
select throws_ok($$ select public.settle_engagement('5e000000-0000-0000-0000-0000000e0014', 'refund', null, 'test') $$,
  'P0001', 'engagement_locked', 'an unpaid hire cannot be settled');
select throws_ok($$ select public.settle_engagement(gen_random_uuid(), 'refund', null, 'test') $$,
  'P0001', 'no_such_engagement', 'an unknown hire is refused');
reset role;
set local role anon;
select throws_ok($$ select public.settle_engagement('5e000000-0000-0000-0000-0000000e0002', 'refund', null, 'x') $$,
  '42501', null, 'anon cannot settle');
reset role;
select ok(not has_function_privilege('authenticated', 'public.settle_engagement_internal(uuid, text, bigint, text, uuid, public.engagement_status)', 'execute')
          and not has_function_privilege('service_role', 'public.settle_engagement_internal(uuid, text, bigint, text, uuid, public.engagement_status)', 'execute')
          and not has_function_privilege('anon', 'public.settle_engagement_internal(uuid, text, bigint, text, uuid, public.engagement_status)', 'execute'),
  'settle_engagement_internal is internal: no role may call it');
select is((select count(*)::integer from public.ledger_entries
            where engagement_id in ('5e000000-0000-0000-0000-0000000e0002', '5e000000-0000-0000-0000-0000000e0003')
              and event_type = 'hire_settled'), 0,
  'refused settlements wrote nothing');

-- Admin settles ----------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "5e5e5e5e-0000-0000-0000-00000005e003"}'; -- Efe
select lives_ok($$ select public.settle_engagement('5e000000-0000-0000-0000-0000000e0001', 'release', null, '  Work delivered  ') $$,
  'Efe releases hire 1 in full (work in progress)');
select lives_ok($$ select public.settle_engagement('5e000000-0000-0000-0000-0000000e0001', 'release', null, 'again') $$,
  'releasing again raises nothing');
select lives_ok($$ select public.settle_engagement('5e000000-0000-0000-0000-0000000e0001', 'refund', null, 'changed my mind') $$,
  'a different outcome on a settled hire raises nothing either');
select lives_ok($$ select public.settle_engagement('5e000000-0000-0000-0000-0000000e0002', 'refund', null, 'Creator unavailable') $$,
  'Efe refunds hire 2 in full');
select lives_ok($$ select public.settle_engagement('5e000000-0000-0000-0000-0000000e0003', 'split', 2000000, 'Partly delivered') $$,
  'Efe splits hire 3: ₦20,000 to the creator');
select lives_ok($$ select public.settle_engagement('5e000000-0000-0000-0000-0000000e0004', 'refund_creator_fault', null, 'Creator ghosted') $$,
  'Efe refunds hire 4 with the fee (creator at fault)');
select lives_ok($$ select public.settle_engagement('5e000000-0000-0000-0000-0000000e0008', 'split', 5000000, 'All of it') $$,
  'Efe splits hire 8 with the whole price');
select lives_ok($$ select public.settle_engagement('5e000000-0000-0000-0000-0000000e0009', 'split', 0, 'None of it') $$,
  'Efe splits hire 9 with nothing released');
select lives_ok($$ select public.settle_engagement('5e000000-0000-0000-0000-0000000e0010', 'refund_creator_fault', null, 'Creator ghosted') $$,
  'Efe refunds Bola''s hire 10 with the fee');
select lives_ok($$ select public.settle_engagement('5e000000-0000-0000-0000-0000000e0011', 'split', 100100, 'Rounding') $$,
  'Efe splits hire 11: ₦1,001 to the creator');
select lives_ok($$ select public.settle_engagement('5e000000-0000-0000-0000-0000000e0012', 'split', 30000, 'A token') $$,
  'Efe splits hire 12: ₦300 to the creator');
select lives_ok($$ select public.settle_engagement('5e000000-0000-0000-0000-0000000e0005', 'release', null, 'after cancel') $$,
  'settling a cancelled hire raises nothing');
reset role;

-- Release (hire 1)
select is((select array[status::text, settle_outcome] from public.engagements
            where id = '5e000000-0000-0000-0000-0000000e0001'), array['accepted', 'release'],
  'hire 1 is accepted');
select ok((select settled_at is not null and released_kobo = 5000000 and refunded_kobo = 0
             from public.engagements where id = '5e000000-0000-0000-0000-0000000e0001'),
  'with the settled amounts recorded');
select is(public.wallet_balance('00000000-0000-0000-0000-00000005e101', 'creator_wallet'), 4750000::bigint,
  'creator 1 gets ₦47,500');
select is((select sum(amount_kobo) from public.ledger_entries
            where engagement_id = '5e000000-0000-0000-0000-0000000e0001' and account = 'platform_revenue'),
  -500000::numeric, 'revenue is the business fee plus the creator fee');
select is((select sum(amount_kobo) from public.ledger_entries
            where engagement_id = '5e000000-0000-0000-0000-0000000e0001' and account = 'escrow'),
  0::numeric, 'escrow for hire 1 nets to zero');
select is((select count(distinct group_id)::integer from public.ledger_entries
            where engagement_id = '5e000000-0000-0000-0000-0000000e0001' and event_type = 'hire_settled'), 1,
  'settling three times wrote one group');
select is((select count(*)::integer from public.ledger_entries
            where engagement_id = '5e000000-0000-0000-0000-0000000e0001'), 8,
  'and only its rows (5 funding + 3 settlement)');
select ok((select bool_and(reason = 'Work delivered'
                           and actor_user_id = '00000000-0000-0000-0000-00000005e003'
                           and fee_config_id = (select fee_config_id from public.engagements
                                                 where id = '5e000000-0000-0000-0000-0000000e0001'))
             from public.ledger_entries
            where engagement_id = '5e000000-0000-0000-0000-0000000e0001' and event_type = 'hire_settled'),
  'the group records the trimmed reason, the admin and the snapshot config');

-- Refund (hire 2)
select is((select array[status::text, settle_outcome] from public.engagements
            where id = '5e000000-0000-0000-0000-0000000e0002'), array['refunded', 'refund'],
  'hire 2 is refunded');
select is((select array_agg(account || ':' || amount_kobo order by account) from public.ledger_entries
            where engagement_id = '5e000000-0000-0000-0000-0000000e0002' and event_type = 'hire_settled'),
  '{business_wallet:-5000000,escrow:5000000}'::text[], 'the business wallet gets ₦50,000');
select is((select sum(amount_kobo) from public.ledger_entries
            where engagement_id = '5e000000-0000-0000-0000-0000000e0002' and account = 'platform_revenue'),
  -250000::numeric, 'the platform keeps the business fee only');

-- Split (hire 3)
select is((select array[status::text, settle_outcome] from public.engagements
            where id = '5e000000-0000-0000-0000-0000000e0003'), array['accepted', 'split'],
  'hire 3 is accepted as a split');
select is((select array_agg(account || ':' || amount_kobo order by account) from public.ledger_entries
            where engagement_id = '5e000000-0000-0000-0000-0000000e0003' and event_type = 'hire_settled'),
  '{business_wallet:-3000000,creator_wallet:-1900000,escrow:5000000,platform_revenue:-100000}'::text[],
  'creator fee 5% of ₦20,000, creator ₦19,000, business ₦30,000');
select ok((select released_kobo = 2000000 and refunded_kobo = 3000000
             from public.engagements where id = '5e000000-0000-0000-0000-0000000e0003'),
  'released and refunded amounts are recorded');

-- Creator at fault (hire 4)
select is((select array[status::text, settle_outcome] from public.engagements
            where id = '5e000000-0000-0000-0000-0000000e0004'), array['refunded', 'refund_creator_fault'],
  'hire 4 is refunded for the creator''s fault');
select is((select -sum(amount_kobo) from public.ledger_entries
            where engagement_id = '5e000000-0000-0000-0000-0000000e0004' and account = 'business_wallet'),
  (5000000 + 250000 - 95406)::numeric, 'the business gets price + fee − the Paystack charge');
select is((select sum(amount_kobo) from public.ledger_entries
            where engagement_id = '5e000000-0000-0000-0000-0000000e0004' and account = 'platform_revenue'),
  -95406::numeric, 'revenue left equals the charge');
select ok((select refunded_kobo = 5154594 and released_kobo = 0
             from public.engagements where id = '5e000000-0000-0000-0000-0000000e0004'),
  'the refunded amount includes the returned fee');

-- Split of the whole price (hire 8) and of nothing (hire 9)
select is((select array[status::text, settle_outcome] from public.engagements
            where id = '5e000000-0000-0000-0000-0000000e0008'), array['accepted', 'release'],
  'a split of the whole price is a release');
select is(public.wallet_balance('00000000-0000-0000-0000-00000005e108', 'creator_wallet'), 4750000::bigint,
  'creator 8 gets ₦47,500, as for a release');
select is((select array[status::text, settle_outcome] from public.engagements
            where id = '5e000000-0000-0000-0000-0000000e0009'), array['refunded', 'refund'],
  'a split of nothing is a refund');
select is((select array_agg(account || ':' || amount_kobo order by account) from public.ledger_entries
            where engagement_id = '5e000000-0000-0000-0000-0000000e0009' and event_type = 'hire_settled'),
  '{business_wallet:-5000000,escrow:5000000}'::text[], 'and moves money exactly as a refund');

-- Wallet and card (hire 10)
select is((select array_agg(account || ':' || amount_kobo order by account) from public.ledger_entries
            where engagement_id = '5e000000-0000-0000-0000-0000000e0010' and event_type = 'hire_settled'),
  '{business_wallet:-5196922,escrow:5000000,platform_revenue:196922}'::text[],
  'only the card part''s ₦530.78 charge is kept; the wallet part carried none');
select is(public.wallet_balance('00000000-0000-0000-0000-00000005e002', 'business_wallet'), 5196922::bigint,
  'Bola''s wallet holds the refund');

-- Half a kobo (hire 11, 2.5% snapshot, no minimum): 2.5% of ₦1,001 is 2,502.5 kobo, rounded up.
select is((select array_agg(account || ':' || amount_kobo order by account) from public.ledger_entries
            where engagement_id = '5e000000-0000-0000-0000-0000000e0011' and event_type = 'hire_settled'),
  '{business_wallet:-4899900,creator_wallet:-97597,escrow:5000000,platform_revenue:-2503}'::text[],
  'the creator fee rounds half up, as creatorFee() does');

-- The fee never exceeds what is released (hire 12): ₦300 released, the ₦500 minimum capped at ₦300.
select is((select array_agg(account || ':' || amount_kobo order by account) from public.ledger_entries
            where engagement_id = '5e000000-0000-0000-0000-0000000e0012' and event_type = 'hire_settled'),
  '{business_wallet:-4970000,escrow:5000000,platform_revenue:-30000}'::text[],
  'the whole ₦300 is fee, and no empty creator line is written');
select is((select array[status::text, settle_outcome] from public.engagements
            where id = '5e000000-0000-0000-0000-0000000e0012'), array['accepted', 'split'],
  'hire 12 still counts as accepted');

-- The settled cancel (hire 5) was left alone
select is((select status::text from public.engagements where id = '5e000000-0000-0000-0000-0000000e0005'),
  'cancelled', 'a cancelled hire stays cancelled');
select is((select count(*)::integer from public.ledger_entries
            where engagement_id = '5e000000-0000-0000-0000-0000000e0005'), 7,
  'and no rows were added');

-- The fee snapshot outlives a fee_config change (hire 13) -------------------------------------------
insert into public.fee_config (business_fee_bps, creator_fee_bps, min_fee_kobo, min_payout_kobo,
                               transfer_fee_tiers, transfer_stamp_duty_kobo, transfer_stamp_duty_from_kobo,
                               paystack_rate, created_at)
select 1000, 1000, 100000, min_payout_kobo, transfer_fee_tiers,
       transfer_stamp_duty_kobo, transfer_stamp_duty_from_kobo, paystack_rate, now() + interval '1 day'
  from public.current_fee_config();
select is((public.current_fee_config()).creator_fee_bps, 1000, 'fee_config now says 10%');
set local role authenticated;
set local request.jwt.claims = '{"sub": "5e5e5e5e-0000-0000-0000-00000005e003"}'; -- Efe
select lives_ok($$ select public.settle_engagement('5e000000-0000-0000-0000-0000000e0013', 'release', null, 'Done') $$,
  'Efe releases hire 13');
reset role;
select is(public.wallet_balance('00000000-0000-0000-0000-00000005e113', 'creator_wallet'), 4750000::bigint,
  'the creator fee is still the 5% snapshot, not 10%');
select isnt((select distinct fee_config_id from public.ledger_entries
              where engagement_id = '5e000000-0000-0000-0000-0000000e0013' and event_type = 'hire_settled'),
  (public.current_fee_config()).id, 'and the group records the snapshot config, not the current one');

-- Settled columns and engagement_json --------------------------------------------------------------------
select throws_ok($$ update public.engagements set settle_outcome = 'bogus', settled_at = now(),
                     released_kobo = 0, refunded_kobo = 0
                    where id = '5e000000-0000-0000-0000-0000000e0014' $$,
  '23514', null, 'settle_outcome only takes the four outcomes');
select throws_ok($$ update public.engagements set settle_outcome = 'refund'
                    where id = '5e000000-0000-0000-0000-0000000e0014' $$,
  '23514', null, 'an outcome needs settled_at and the amounts');
select throws_ok($$ update public.engagements set settled_at = now()
                    where id = '5e000000-0000-0000-0000-0000000e0014' $$,
  '23514', null, 'settled_at needs an outcome');
select is((select public.engagement_json(e) - array['id', 'approved_at', 'pay_by', 'funded_at', 'started_at',
                                                    'settled_at', 'cancelled_at']
             from public.engagements e where e.id = '5e000000-0000-0000-0000-0000000e0003'),
  jsonb_build_object('status', 'accepted', 'agreed_price_kobo', 5000000, 'cancel_reason', null,
                     'settle_outcome', 'split', 'released_kobo', 2000000, 'refunded_kobo', 3000000,
                     'business_fee_kobo', 250000, 'creator_fee_bps', 500, 'creator_min_fee_kobo', 50000),
  'engagement_json shows the settlement and the fee snapshot');
select ok((select public.engagement_json(e) ?& array['id', 'approved_at', 'pay_by', 'cancelled_at', 'funded_at',
                                                     'started_at', 'settled_at']
             from public.engagements e where e.id = '5e000000-0000-0000-0000-0000000e0003'),
  'and keeps the Stage 5 keys and the times');
select ok(not has_function_privilege('authenticated', 'public.engagement_json(public.engagements)', 'execute')
          and not has_function_privilege('anon', 'public.engagement_json(public.engagements)', 'execute'),
  'engagement_json stays internal, as in Stage 5');
select ok(has_function_privilege('authenticated', 'public.start_engagement(uuid)', 'execute')
          and has_function_privilege('authenticated', 'public.cancel_funded_engagement(uuid, boolean)', 'execute')
          and has_function_privilege('authenticated', 'public.settle_engagement(uuid, text, bigint, text)', 'execute')
          and not has_function_privilege('anon', 'public.cancel_funded_engagement(uuid, boolean)', 'execute'),
  'the three entry points are for signed-in people only');

-- The fault refund subtracts only the charge of the payment that funded the hire --------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "5e5e5e5e-0000-0000-0000-00000005e115"}'; -- creator 15
select lives_ok($$ select public.cancel_funded_engagement('5e000000-0000-0000-0000-0000000e0015', false) $$,
  'creator 15 withdraws from hire 15');
reset role;
select is((select array_agg(account || ':' || amount_kobo order by account) from public.ledger_entries
            where engagement_id = '5e000000-0000-0000-0000-0000000e0015' and event_type = 'hire_settled'),
  '{business_wallet:-5154594,escrow:5000000,platform_revenue:154594}'::text[],
  'only payment A''s ₦954.06 is subtracted, not the stranded payment''s ₦900');
select is((select refunded_kobo from public.engagements where id = '5e000000-0000-0000-0000-0000000e0015'),
  5154594::bigint, 'hire 15 records the refund');
select is((select sum(amount_kobo) from public.ledger_entries
            where engagement_id = '5e000000-0000-0000-0000-0000000e0015' and account = 'platform_revenue'),
  -95406::numeric, 'revenue left on hire 15 is payment A''s charge only');

set local role authenticated;
set local request.jwt.claims = '{"sub": "5e5e5e5e-0000-0000-0000-00000005e001"}'; -- Ada
select lives_ok($$ select public.pay_from_wallet('5e000000-0000-0000-0000-0000000e0016', true) $$,
  'Ada pays hire 16 wholly from her wallet');
set local request.jwt.claims = '{"sub": "5e5e5e5e-0000-0000-0000-00000005e003"}'; -- Efe
select lives_ok($$ select public.settle_engagement('5e000000-0000-0000-0000-0000000e0016', 'refund_creator_fault', null, 'Creator ghosted') $$,
  'Efe refunds hire 16 with the fee');
reset role;
select is((select array_agg(account || ':' || amount_kobo order by account) from public.ledger_entries
            where engagement_id = '5e000000-0000-0000-0000-0000000e0016' and event_type = 'hire_settled'),
  '{business_wallet:-5500000,escrow:5000000,platform_revenue:500000}'::text[],
  'wallet-only funding carries no charge: the business gets ₦55,000 back (paid under the 10% config)');
select is((select coalesce(sum(amount_kobo), 0) from public.ledger_entries
            where engagement_id = '5e000000-0000-0000-0000-0000000e0016' and account = 'platform_revenue'),
  0::numeric, 'and the platform keeps nothing');

-- Totals ---------------------------------------------------------------------------------------------------
select is((select count(*)::integer from (
  select group_id from public.ledger_entries group by group_id having sum(amount_kobo) <> 0) g), 0,
  'every group sums to zero');
select is((select sum(value::bigint) from jsonb_each_text(public.ledger_totals())), 0::numeric,
  'ledger totals sum to zero after every flow');
select is((select count(*)::integer from (
  select owner_user_id, account from public.ledger_entries
   where account in ('business_wallet', 'creator_wallet')
   group by owner_user_id, account having sum(amount_kobo) > 0) w), 0,
  'no wallet is overdrawn');
select is((select count(*)::integer from (
  select engagement_id from public.ledger_entries where account = 'escrow'
   group by engagement_id having sum(amount_kobo) > 0) x), 0,
  'no escrow is overdrawn');
select is((select count(*)::integer from public.engagements e
            where e.id::text like '5e000000-0000-0000-0000-0000000e00%' and e.settled_at is not null
              and (select coalesce(sum(l.amount_kobo), 0) from public.ledger_entries l
                    where l.engagement_id = e.id and l.account = 'escrow') <> 0), 0,
  'every settled hire''s escrow is empty');
select is((select sum(amount_kobo) from public.ledger_entries
            where engagement_id = '5e000000-0000-0000-0000-0000000e0007' and account = 'escrow'),
  -5000000::numeric, 'hire 7, still in progress, keeps its escrow');
select is(public.wallet_balance('00000000-0000-0000-0000-00000005e001', 'business_wallet'), 48583682::bigint,
  'Ada''s wallet: refunds of 50,000 + 30,000 + 51,545.94 × 3 + 50,000 × 2 + 48,999 + 49,700 + 55,000 naira, plus the stranded 52,500, less 55,000 spent');
select is((select count(*)::integer from public.ledger_entries
            where engagement_id::text like '5e000000-0000-0000-0000-0000000e00%' and event_type = 'hire_settled'
              and engagement_id in (select id from public.engagements where settled_at is null)), 0,
  'no unsettled hire has settlement rows');
select is((select count(distinct engagement_id)::integer from public.ledger_entries
            where engagement_id::text like '5e000000-0000-0000-0000-0000000e00%' and event_type = 'hire_settled'), 14,
  'fourteen hires were settled or cancelled, each once');
select is((select count(*)::integer from (
  select engagement_id from public.ledger_entries
   where engagement_id::text like '5e000000-0000-0000-0000-0000000e00%' and event_type = 'hire_settled'
   group by engagement_id having count(distinct group_id) > 1) d), 0,
  'no hire has two settlement groups');

select * from finish();
rollback;
