-- Proves the rules from the money_notifications migration: funding tells the
-- creator, starting work tells the business, cancelling a paid hire tells the
-- other side (and is not the unpaid "hire_cancelled"), an admin settlement
-- tells both, and payouts tell the creator when they are paid, fail or are
-- rejected. Nobody is told about their own action, and a hire cancelled
-- before payment still reads as it did in Stage 5.
-- Run with: supabase test db
--
-- The notifications table can already hold rows from other runs (for example
-- scripts/money-race.mjs on a local database), so nothing here counts the whole
-- table: counts are limited to this file's own people or campaign.
begin;

create extension if not exists pgtap with schema extensions;

select plan(53);

-- Ada is a business, Efe an admin, creators ce101..ce108 are hired for
-- ₦50,000 each by Ada (hire n is creator n's).
insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000ce001', 'cecececc-0000-0000-0000-0000000ce001', 'ada.moneynotify@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000ce002', 'cecececc-0000-0000-0000-0000000ce002', 'efe.moneynotify@example.com', 'admin');

insert into public.users (id, auth_user_id, email, role)
select ('00000000-0000-0000-0000-0000000ce1' || lpad(n::text, 2, '0'))::uuid,
       ('cecececc-0000-0000-0000-0000000ce1' || lpad(n::text, 2, '0'))::uuid,
       'c' || n || '.moneynotify@example.com', 'influencer'
  from generate_series(1, 8) n;

insert into public.business_profiles (user_id, business_name, contact_name, state, city) values
  ('00000000-0000-0000-0000-0000000ce001', 'Ada Money Kitchen', 'Ada Obi', 'Lagos', 'Ikeja');

insert into public.influencer_profiles (user_id, display_name, state, city, niches, published)
select ('00000000-0000-0000-0000-0000000ce1' || lpad(n::text, 2, '0'))::uuid,
       'Creator ' || n || ' Money', 'Lagos', 'Yaba', '{fashion}', true
  from generate_series(1, 8) n;

insert into public.campaigns (id, business_id, status, title, brief, price_kobo, places,
                              applications_close_on, deliver_by, published_at, submitted_at) values
  ('ce000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000ce001', 'open', 'Money notify test',
   'A brief that is long enough for the checks.', 5000000, 20, public.lagos_today() + 10, public.lagos_today() + 20, now(), now());

insert into public.applications (id, campaign_id, creator_id, status)
select ('ce000000-0000-0000-0000-0000000a00' || lpad(n::text, 2, '0'))::uuid,
       'ce000000-0000-0000-0000-000000000001',
       ('00000000-0000-0000-0000-0000000ce1' || lpad(n::text, 2, '0'))::uuid, 'approved'
  from generate_series(1, 8) n;

insert into public.engagements (id, application_id, campaign_id, business_id, creator_id, agreed_price_kobo, pay_by)
select ('ce000000-0000-0000-0000-0000000e00' || lpad(n::text, 2, '0'))::uuid,
       ('ce000000-0000-0000-0000-0000000a00' || lpad(n::text, 2, '0'))::uuid,
       'ce000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000ce001',
       ('00000000-0000-0000-0000-0000000ce1' || lpad(n::text, 2, '0'))::uuid,
       5000000, now() + interval '48 hours'
  from generate_series(1, 8) n;

create function pg_temp.count_of(person uuid, what text) returns integer
language sql as $$
  select count(*)::integer from public.notifications n
   where n.user_id = person and n.kind::text = what
$$;

create function pg_temp.creator(n integer) returns uuid
language sql as $$ select ('00000000-0000-0000-0000-0000000ce1' || lpad(n::text, 2, '0'))::uuid $$;

create function pg_temp.hire(n integer) returns uuid
language sql as $$ select ('ce000000-0000-0000-0000-0000000e00' || lpad(n::text, 2, '0'))::uuid $$;

-- Funding (hires 1, 2, 3, 6, 7 and 8 are paid by card; 4 and 5 stay unpaid) ---------------------------
do $$
declare
  n integer;
  started jsonb;
begin
  for n in select unnest(array[1, 2, 3, 6, 7, 8]) loop
    perform set_config('request.jwt.claims', '{"sub": "cecececc-0000-0000-0000-0000000ce001"}', true);
    started := public.start_payment(pg_temp.hire(n), true);
    perform set_config('request.jwt.claims', '', true);
    perform public.record_card_payment(started ->> 'reference', (started ->> 'card_amount_kobo')::bigint,
      95406, 'evt-moneynotify-' || n, '{}');
  end loop;
end;
$$;

select is(pg_temp.count_of(pg_temp.creator(1), 'hire_funded'), 1, 'a paid hire notifies the creator');
select is((select data ->> 'name' from public.notifications
            where user_id = pg_temp.creator(1) and kind = 'hire_funded'), 'Ada Money Kitchen',
  'with the business''s name');
select ok((select data ->> 'campaign_title' = 'Money notify test'
                  and data ->> 'engagement_id' = pg_temp.hire(1)::text
                  and data ->> 'campaign_id' = 'ce000000-0000-0000-0000-000000000001'
             from public.notifications where user_id = pg_temp.creator(1) and kind = 'hire_funded'),
  'and the campaign and the hire');
select is(pg_temp.count_of('00000000-0000-0000-0000-0000000ce001', 'hire_funded'), 0,
  'the business, who paid, is not told');
select is(pg_temp.count_of(pg_temp.creator(4), 'hire_funded'), 0, 'an unpaid hire notifies nobody');
select is((select count(*)::integer from public.notifications
            where kind::text = 'hire_funded' and data ->> 'campaign_id' = 'ce000000-0000-0000-0000-000000000001'), 6,
  'one per paid hire');

-- Starting work ----------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "cecececc-0000-0000-0000-0000000ce101"}'; -- creator 1
select public.start_engagement(pg_temp.hire(1));
set local request.jwt.claims = '{"sub": "cecececc-0000-0000-0000-0000000ce107"}'; -- creator 7
select public.start_engagement(pg_temp.hire(7));
reset role;

select is(pg_temp.count_of('00000000-0000-0000-0000-0000000ce001', 'work_started'), 2,
  'starting work notifies the business, once per hire');
select is((select data ->> 'name' from public.notifications
            where user_id = '00000000-0000-0000-0000-0000000ce001' and kind = 'work_started'
              and data ->> 'engagement_id' = pg_temp.hire(1)::text), 'Creator 1 Money',
  'with the creator''s name');
select is(pg_temp.count_of(pg_temp.creator(1), 'work_started'), 0, 'the creator who started is not told');

-- Cancelling a paid hire ---------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "cecececc-0000-0000-0000-0000000ce001"}'; -- Ada cancels hire 2
select public.cancel_funded_engagement(pg_temp.hire(2), true);
set local request.jwt.claims = '{"sub": "cecececc-0000-0000-0000-0000000ce103"}'; -- creator 3 withdraws from hire 3
select public.cancel_funded_engagement(pg_temp.hire(3), false);
reset role;

select is(pg_temp.count_of(pg_temp.creator(2), 'funded_hire_cancelled'), 1,
  'the business cancelling a paid hire notifies the creator');
select is(pg_temp.count_of(pg_temp.creator(2), 'hire_cancelled'), 0,
  'and it is not the unpaid "hire_cancelled"');
select is((select data ->> 'name' from public.notifications
            where user_id = pg_temp.creator(2) and kind = 'funded_hire_cancelled'), 'Ada Money Kitchen',
  'naming the business');
select is(pg_temp.count_of('00000000-0000-0000-0000-0000000ce001', 'funded_hire_cancelled'), 1,
  'the creator withdrawing from a paid hire notifies the business');
select is((select data ->> 'name' from public.notifications
            where user_id = '00000000-0000-0000-0000-0000000ce001' and kind = 'funded_hire_cancelled'),
  'Creator 3 Money', 'naming the creator');
select is(pg_temp.count_of(pg_temp.creator(3), 'funded_hire_cancelled')
        + pg_temp.count_of(pg_temp.creator(3), 'hire_cancelled'), 0, 'the creator who withdrew is not told');
select is(pg_temp.count_of('00000000-0000-0000-0000-0000000ce001', 'hire_cancelled'), 0,
  'the business is never sent "hire_cancelled"');
select is(pg_temp.count_of('00000000-0000-0000-0000-0000000ce001', 'engagement_settled')
        + pg_temp.count_of(pg_temp.creator(2), 'engagement_settled')
        + pg_temp.count_of(pg_temp.creator(3), 'engagement_settled'), 0,
  'a cancellation is not also announced as a settlement');

-- Cancelling or lapsing before payment is as in Stage 5 ---------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "cecececc-0000-0000-0000-0000000ce001"}'; -- Ada cancels unpaid hire 4
select public.cancel_engagement(pg_temp.hire(4));
reset role;
select is(pg_temp.count_of(pg_temp.creator(4), 'hire_cancelled'), 1,
  'cancelling an unpaid hire still sends "hire_cancelled" to the creator');
select is(pg_temp.count_of(pg_temp.creator(4), 'funded_hire_cancelled'), 0, 'and not the paid kind');

update public.engagements set pay_by = now() - interval '1 minute' where id = pg_temp.hire(5);
select public.expire_unpaid_engagements();
select is(pg_temp.count_of(pg_temp.creator(5), 'hire_lapsed'), 1, 'a lapsed hire still notifies the creator');
select is(pg_temp.count_of('00000000-0000-0000-0000-0000000ce001', 'hire_lapsed'), 1, 'and the business');
select is(pg_temp.count_of(pg_temp.creator(5), 'funded_hire_cancelled')
        + pg_temp.count_of(pg_temp.creator(5), 'engagement_settled'), 0,
  'and is not mistaken for a paid cancellation or a settlement');

-- Settlement -----------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "cecececc-0000-0000-0000-0000000ce002"}'; -- Efe
select public.settle_engagement(pg_temp.hire(1), 'release', null, 'Work delivered');
select public.settle_engagement(pg_temp.hire(1), 'release', null, 'Work delivered again');
select public.settle_engagement(pg_temp.hire(6), 'split', 2000000, 'Partly delivered');
select public.settle_engagement(pg_temp.hire(7), 'refund_creator_fault', null, 'Creator ghosted');
select public.settle_engagement(pg_temp.hire(8), 'refund', null, 'Changed plans');
reset role;

select is(pg_temp.count_of(pg_temp.creator(1), 'engagement_settled'), 1, 'settling notifies the creator, once');
select is(pg_temp.count_of('00000000-0000-0000-0000-0000000ce001', 'engagement_settled'), 4,
  'and the business, once per settled hire');
select is((select data - 'name' - 'campaign_id' - 'campaign_title' - 'engagement_id' from public.notifications
            where user_id = pg_temp.creator(1) and kind = 'engagement_settled'),
  '{"outcome": "release", "released_kobo": 5000000, "refunded_kobo": 0, "creator_net_kobo": 4750000, "creator_fee_kobo": 250000}'::jsonb,
  'a release says the outcome, what left escrow, the fee, and what the creator''s wallet got');
select is((select array[data ->> 'creator_net_kobo', data ->> 'creator_fee_kobo']
             from public.notifications where user_id = pg_temp.creator(6) and kind = 'engagement_settled'),
  array['1900000', '100000'], 'a split tells the creator the net of the released part only');
select is((select array[data ->> 'creator_net_kobo', data ->> 'creator_fee_kobo']
             from public.notifications where user_id = pg_temp.creator(7) and kind = 'engagement_settled'),
  array['0', '0'], 'a fault refund has no net and no fee for the creator');
select is((select count(*)::integer from public.notifications
            where user_id = '00000000-0000-0000-0000-0000000ce001' and kind = 'engagement_settled'
              and data ? 'creator_net_kobo'), 0, 'and the business is not given the creator''s net');
select is((select data ->> 'name' from public.notifications
            where user_id = pg_temp.creator(1) and kind = 'engagement_settled'), 'Ada Money Kitchen',
  'the creator is told the business''s name');
select is((select data ->> 'name' from public.notifications
            where user_id = '00000000-0000-0000-0000-0000000ce001' and kind = 'engagement_settled'
              and data ->> 'engagement_id' = pg_temp.hire(1)::text), 'Creator 1 Money',
  'the business is told the creator''s name');
select is((select data ->> 'campaign_title' from public.notifications
            where user_id = pg_temp.creator(1) and kind = 'engagement_settled'), 'Money notify test',
  'and the campaign');
select is((select data ->> 'engagement_id' from public.notifications
            where user_id = pg_temp.creator(1) and kind = 'engagement_settled'), pg_temp.hire(1)::text,
  'and the hire');
select is((select array[data ->> 'outcome', data ->> 'released_kobo', data ->> 'refunded_kobo']
             from public.notifications where user_id = pg_temp.creator(6) and kind = 'engagement_settled'),
  array['split', '2000000', '3000000'], 'a split says how much went each way');
select is((select array[data ->> 'outcome', data ->> 'released_kobo', data ->> 'refunded_kobo']
             from public.notifications where user_id = pg_temp.creator(7) and kind = 'engagement_settled'),
  array['refund_creator_fault', '0', '5154594'], 'a fault refund includes the returned fee');
select is((select array[data ->> 'outcome', data ->> 'released_kobo', data ->> 'refunded_kobo']
             from public.notifications where user_id = pg_temp.creator(8) and kind = 'engagement_settled'),
  array['refund', '0', '5000000'], 'a refund releases nothing');
select is(pg_temp.count_of('00000000-0000-0000-0000-0000000ce002', 'engagement_settled'), 0,
  'the admin who settled has no bell and is not notified');
select is((select count(*)::integer from public.notifications where user_id = pg_temp.creator(2)
            and kind = 'engagement_settled'), 0, 'a hire that was only cancelled is not announced as settled');

-- Payouts ---------------------------------------------------------------------------------------------------
-- Creators 1 (₦47,500), 6 (₦19,000) and 7 (nothing, refunded) ask; the
-- fixtures are small on purpose. Creator 8's hire was refunded, so he has no wallet.
insert into public.bank_accounts (user_id, bank_code, bank_name, last4, account_name, recipient_code) values
  ('00000000-0000-0000-0000-0000000ce101', '058', 'GTBank', '1234', 'CREATOR ONE', 'RCP_ce1'),
  ('00000000-0000-0000-0000-0000000ce106', '044', 'Access Bank', '5678', 'CREATOR SIX', 'RCP_ce6');

set local role authenticated;
set local request.jwt.claims = '{"sub": "cecececc-0000-0000-0000-0000000ce101"}'; -- creator 1
select public.request_payout(4750000);
set local request.jwt.claims = '{"sub": "cecececc-0000-0000-0000-0000000ce106"}'; -- creator 6
select public.request_payout(1900000);
reset role;

select is((select count(*)::integer from public.notifications
            where kind::text like 'payout\_%' and user_id in (select id from public.users where email like '%.moneynotify@example.com')), 0,
  'asking for a payout notifies nobody');

set local role authenticated;
set local request.jwt.claims = '{"sub": "cecececc-0000-0000-0000-0000000ce002"}'; -- Efe
select public.approve_payout((select id from public.payouts where user_id = pg_temp.creator(1)));
reset role;
select is((select count(*)::integer from public.notifications
            where kind::text like 'payout\_%' and user_id in (select id from public.users where email like '%.moneynotify@example.com')), 0,
  'approving it (processing) notifies nobody yet');

select is(public.finish_payout('pit_po_' || replace((select id::text from public.payouts
                                                      where user_id = pg_temp.creator(1)), '-', ''),
                               'paid', 'evt-ce-paid-1', '{}'), 'paid', 'Paystack confirms the transfer');
select is(pg_temp.count_of(pg_temp.creator(1), 'payout_paid'), 1, 'a paid payout notifies the creator');
select is((select data ->> 'amount_kobo' from public.notifications
            where user_id = pg_temp.creator(1) and kind = 'payout_paid'), '4750000', 'with the amount');
select is((select data ->> 'payout_id' from public.notifications
            where user_id = pg_temp.creator(1) and kind = 'payout_paid'),
  (select id::text from public.payouts where user_id = pg_temp.creator(1)), 'and the payout');
select is(public.finish_payout('pit_po_' || replace((select id::text from public.payouts
                                                      where user_id = pg_temp.creator(1)), '-', ''),
                               'paid', 'evt-ce-paid-2', '{}'), 'duplicate', 'a repeated confirmation is a duplicate');
select is(pg_temp.count_of(pg_temp.creator(1), 'payout_paid'), 1, 'and does not notify twice');

set local role authenticated;
set local request.jwt.claims = '{"sub": "cecececc-0000-0000-0000-0000000ce002"}'; -- Efe
select public.reject_payout((select id from public.payouts where user_id = pg_temp.creator(6)),
  'The account name does not match.');
reset role;
select is(pg_temp.count_of(pg_temp.creator(6), 'payout_rejected'), 1, 'a rejected payout notifies the creator');
select is((select data ->> 'decision_reason' from public.notifications
            where user_id = pg_temp.creator(6) and kind = 'payout_rejected'),
  'The account name does not match.', 'with the admin''s reason');
select is((select data ->> 'amount_kobo' from public.notifications
            where user_id = pg_temp.creator(6) and kind = 'payout_rejected'), '1900000', 'and the amount');

-- A failed transfer: creator 6 asks again, is approved, and Paystack reports a failure.
set local role authenticated;
set local request.jwt.claims = '{"sub": "cecececc-0000-0000-0000-0000000ce106"}';
select public.request_payout(1900000);
set local request.jwt.claims = '{"sub": "cecececc-0000-0000-0000-0000000ce002"}';
select public.approve_payout((select id from public.payouts where user_id = pg_temp.creator(6) and status = 'requested'));
reset role;
select is(pg_temp.count_of(pg_temp.creator(6), 'payout_rejected') + pg_temp.count_of(pg_temp.creator(6), 'payout_failed'), 1,
  'the second request and its approval notify nobody');
select is(public.finish_payout('pit_po_' || replace((select id::text from public.payouts
                                                      where user_id = pg_temp.creator(6) and status = 'processing'), '-', ''),
                               'failed', 'evt-ce-failed-1', '{}'), 'failed', 'Paystack reports the transfer failed');
select is(pg_temp.count_of(pg_temp.creator(6), 'payout_failed'), 1, 'a failed payout notifies the creator');
select is((select data ->> 'amount_kobo' from public.notifications
            where user_id = pg_temp.creator(6) and kind = 'payout_failed'), '1900000', 'with the amount');
select is((select count(*)::integer from public.notifications
            where kind::text like 'payout\_%' and user_id in ('00000000-0000-0000-0000-0000000ce001',
                                                              '00000000-0000-0000-0000-0000000ce002')), 0,
  'the business and the admin are never sent payout notifications');

select * from finish();
rollback;
