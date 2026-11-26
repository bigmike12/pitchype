-- Proves the payment_stranded notification from the
-- stranded_payment_and_hardening migration: a card payment that arrives after
-- its hire lapsed (and so lands in the business wallet) tells the business
-- exactly once, while a card payment that funds its hire, and a hire paid from
-- the wallet, tell nobody. A card payment that collects more than asked funds
-- its hire and announces only the extra, marked `extra`.
-- Run with: supabase test db
--
-- The ledger and notifications tables can already hold rows from other runs
-- (for example scripts/money-race.mjs on a local database), so every count
-- here is limited to this file's own people and hires.
begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

-- Ada is a business; creators d2011..d2013 are each hired for ₦50,000.
insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000d2001', 'd2d2d2d2-0000-0000-0000-0000000d2001', 'ada.stranded@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000d2011', 'd2d2d2d2-0000-0000-0000-0000000d2011', 'c1.stranded@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000d2012', 'd2d2d2d2-0000-0000-0000-0000000d2012', 'c2.stranded@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000d2013', 'd2d2d2d2-0000-0000-0000-0000000d2013', 'c3.stranded@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000d2014', 'd2d2d2d2-0000-0000-0000-0000000d2014', 'c4.stranded@example.com', 'influencer');

insert into public.business_profiles (user_id, business_name, contact_name, state, city) values
  ('00000000-0000-0000-0000-0000000d2001', 'Ada Stranded Kitchen', 'Ada Obi', 'Lagos', 'Ikeja');

insert into public.campaigns (id, business_id, status, title, brief, price_kobo, places,
                              applications_close_on, deliver_by, published_at, submitted_at) values
  ('d2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000d2001', 'open', 'Stranded notify test',
   'A brief that is long enough for the checks.', 5000000, 5, public.lagos_today() + 10, public.lagos_today() + 20, now(), now());

insert into public.applications (id, campaign_id, creator_id, status) values
  ('d2000000-0000-0000-0000-0000000000a1', 'd2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000d2011', 'approved'),
  ('d2000000-0000-0000-0000-0000000000a2', 'd2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000d2012', 'approved'),
  ('d2000000-0000-0000-0000-0000000000a3', 'd2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000d2013', 'approved'),
  ('d2000000-0000-0000-0000-0000000000a4', 'd2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000d2014', 'approved');

-- e1 lapses and its payment is stranded; e2 is paid by card; e3 is paid from
-- the wallet; e4 is paid by card with Paystack's charge added on top.
insert into public.engagements (id, application_id, campaign_id, business_id, creator_id, agreed_price_kobo, pay_by)
select ('d2000000-0000-0000-0000-0000000000' || x.tag)::uuid,
       ('d2000000-0000-0000-0000-0000000000' || x.app)::uuid,
       'd2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000d2001', x.creator::uuid,
       5000000, now() + interval '48 hours'
  from (values
    ('e1', 'a1', '00000000-0000-0000-0000-0000000d2011'),
    ('e2', 'a2', '00000000-0000-0000-0000-0000000d2012'),
    ('e3', 'a3', '00000000-0000-0000-0000-0000000d2013'),
    ('e4', 'a4', '00000000-0000-0000-0000-0000000d2014')
  ) x (tag, app, creator);

create function pg_temp.stranded_count(person uuid) returns integer
language sql as $$
  select count(*)::integer from public.notifications n
   where n.user_id = person and n.kind::text = 'payment_stranded'
$$;

create function pg_temp.stranded_for(hire uuid) returns integer
language sql as $$
  select count(*)::integer from public.notifications n
   where n.kind::text = 'payment_stranded' and n.data ->> 'engagement_id' = hire::text
$$;

-- The card references, read as the owner and handed to the service role.
create temp table refs (hire uuid primary key, reference text);
grant select on refs to service_role;

-- A card payment that funds its hire -----------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "d2d2d2d2-0000-0000-0000-0000000d2001"}'; -- Ada
select public.start_payment('d2000000-0000-0000-0000-0000000000e2', true);
select public.start_payment('d2000000-0000-0000-0000-0000000000e1', true);
reset role;
insert into refs select engagement_id, reference from public.payments
 where engagement_id in ('d2000000-0000-0000-0000-0000000000e1', 'd2000000-0000-0000-0000-0000000000e2');

set local role service_role;
select is(public.record_card_payment((select reference from refs where hire = 'd2000000-0000-0000-0000-0000000000e2'),
                                     5250000, 95406, 'evt-d2-e2', '{}'),
  'funded', 'a card payment funds e2');
reset role;
select is(pg_temp.stranded_for('d2000000-0000-0000-0000-0000000000e2'), 0,
  'a payment that funds its hire is not announced as stranded');

-- A card payment after the lapse -----------------------------------------------------------------
update public.engagements set pay_by = now() - interval '1 hour' where id = 'd2000000-0000-0000-0000-0000000000e1';
update public.payments set created_at = now() - interval '40 minutes'
 where engagement_id = 'd2000000-0000-0000-0000-0000000000e1';
set local role service_role;
select public.expire_unpaid_engagements('d2000000-0000-0000-0000-000000000001');
reset role;
select is((select status::text || ':' || cancel_reason from public.engagements
            where id = 'd2000000-0000-0000-0000-0000000000e1'),
  'cancelled:payment_expired', 'e1 lapsed before its payment arrived');

set local role service_role;
select is(public.record_card_payment((select reference from refs where hire = 'd2000000-0000-0000-0000-0000000000e1'),
                                     5250000, 95406, 'evt-d2-e1', '{}'),
  'stranded', 'the late payment is stranded into Ada''s wallet');
reset role;
select is(pg_temp.stranded_count('00000000-0000-0000-0000-0000000d2001'), 1, 'Ada is told once');
select is((select data ->> 'amount_kobo' from public.notifications
            where user_id = '00000000-0000-0000-0000-0000000d2001' and kind::text = 'payment_stranded'),
  '5250000', 'with the amount that reached her wallet');
select ok((select data ->> 'engagement_id' = 'd2000000-0000-0000-0000-0000000000e1'
                  and data ->> 'campaign_id' = 'd2000000-0000-0000-0000-000000000001'
                  and data ->> 'campaign_title' = 'Stranded notify test'
             from public.notifications
            where user_id = '00000000-0000-0000-0000-0000000d2001' and kind::text = 'payment_stranded'),
  'and the hire and the campaign');
select is(pg_temp.stranded_for('d2000000-0000-0000-0000-0000000000e1'), 1, 'nobody else is told');

set local role service_role;
select is(public.record_card_payment((select reference from refs where hire = 'd2000000-0000-0000-0000-0000000000e1'),
                                     5250000, 95406, 'evt-d2-e1', '{}'),
  'duplicate', 'the same event again is a duplicate');
reset role;
select is(pg_temp.stranded_count('00000000-0000-0000-0000-0000000d2001'), 1, 'and tells Ada nothing new');

-- Paying from the wallet the stranded payment filled ------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "d2d2d2d2-0000-0000-0000-0000000d2001"}'; -- Ada
select lives_ok($$ select public.pay_from_wallet('d2000000-0000-0000-0000-0000000000e3', true) $$,
  'Ada pays e3 from her wallet');
reset role;
select is((select status::text from public.engagements where id = 'd2000000-0000-0000-0000-0000000000e3'), 'funded',
  'e3 is funded');
select is(pg_temp.stranded_count('00000000-0000-0000-0000-0000000d2001'), 1,
  'wallet funding is not announced as stranded');

-- Paystack collects more than the card part: the hire is paid, the extra is announced as extra --------
set local role authenticated;
set local request.jwt.claims = '{"sub": "d2d2d2d2-0000-0000-0000-0000000d2001"}'; -- Ada
select public.start_payment('d2000000-0000-0000-0000-0000000000e4', true);
reset role;
insert into refs select engagement_id, reference from public.payments
 where engagement_id = 'd2000000-0000-0000-0000-0000000000e4';
set local role service_role;
select is(public.record_card_payment((select reference from refs where hire = 'd2000000-0000-0000-0000-0000000000e4'),
                                     5350000, 100000, 'evt-d2-e4', '{}'),
  'funded', 'an overpaid card payment funds e4');
reset role;
select is(pg_temp.stranded_for('d2000000-0000-0000-0000-0000000000e4'), 1, 'Ada is told about the extra once');
select ok((select data ->> 'amount_kobo' = '100000' and (data ->> 'extra')::boolean
             from public.notifications
            where kind::text = 'payment_stranded' and data ->> 'engagement_id' = 'd2000000-0000-0000-0000-0000000000e4'),
  'as an extra of ₦1,000, not as a stranded payment');

select ok(not has_function_privilege('authenticated', 'public.ledger_entries_notify()', 'execute'),
  'the trigger function is not callable by people');

select * from finish();
rollback;
