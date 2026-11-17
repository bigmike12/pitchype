-- engagement_details carries creator_net_kobo: null until the hire is settled,
-- then what the settlement credited to the creator's wallet (read from the
-- ledger group, so it is the price less the creator fee actually taken).
-- Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-00000007e001', '7e7e7e7e-0000-0000-0000-00000007e001', 'biz.net@example.com', 'business'),
  ('00000000-0000-0000-0000-00000007e002', '7e7e7e7e-0000-0000-0000-00000007e002', 'cr.net@example.com', 'influencer'),
  ('00000000-0000-0000-0000-00000007e003', '7e7e7e7e-0000-0000-0000-00000007e003', 'admin.net@example.com', 'admin');
insert into public.business_profiles (user_id, business_name, contact_name, state, city) values
  ('00000000-0000-0000-0000-00000007e001', 'Net Biz', 'Nia', 'Lagos', 'Ikeja');
insert into public.campaigns (id, business_id, status, title, brief, price_kobo, places,
                              applications_close_on, deliver_by, published_at, submitted_at) values
  ('7e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000007e001', 'in_progress', 'Net test',
   'A brief that is long enough for the checks.', 5000000, 1, public.lagos_today() + 10, public.lagos_today() + 20, now(), now());
insert into public.applications (id, campaign_id, creator_id, status) values
  ('7e000000-0000-0000-0000-0000000a0001', '7e000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-00000007e002', 'approved');
insert into public.engagements (id, application_id, campaign_id, business_id, creator_id, agreed_price_kobo, pay_by) values
  ('7e000000-0000-0000-0000-0000000e0001', '7e000000-0000-0000-0000-0000000a0001',
   '7e000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000007e001',
   '00000000-0000-0000-0000-00000007e002', 5000000, now() + interval '48 hours');

do $$
declare started jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub": "7e7e7e7e-0000-0000-0000-00000007e001"}', true);
  started := public.start_payment('7e000000-0000-0000-0000-0000000e0001', true);
  perform public.record_card_payment(started ->> 'reference', (started ->> 'card_amount_kobo')::bigint,
    95406, 'evt-net-1', '{}');
  perform set_config('request.jwt.claims', '{"sub": "7e7e7e7e-0000-0000-0000-00000007e002"}', true);
  perform public.start_engagement('7e000000-0000-0000-0000-0000000e0001');
  perform set_config('request.jwt.claims', '', true);
end;
$$;

set local role authenticated;
set local request.jwt.claims = '{"sub": "7e7e7e7e-0000-0000-0000-00000007e002"}';
select is((select d ->> 'creator_net_kobo' from public.engagement_details('7e000000-0000-0000-0000-0000000e0001') d),
  null, 'null while the hire is not settled');

set local request.jwt.claims = '{"sub": "7e7e7e7e-0000-0000-0000-00000007e003"}';
select lives_ok($$select public.settle_engagement('7e000000-0000-0000-0000-0000000e0001', 'release', null, 'Settled for the test')$$,
  'an admin releases the hire');

set local request.jwt.claims = '{"sub": "7e7e7e7e-0000-0000-0000-00000007e002"}';
select is((select (d ->> 'creator_net_kobo')::bigint from public.engagement_details('7e000000-0000-0000-0000-0000000e0001') d),
  4750000::bigint, 'the creator''s net is the price less the 5% fee, from the ledger');

set local request.jwt.claims = '{"sub": "7e7e7e7e-0000-0000-0000-00000007e001"}';
select is((select (d ->> 'creator_net_kobo')::bigint from public.engagement_details('7e000000-0000-0000-0000-0000000e0001') d),
  4750000::bigint, 'the business reads the same figure');

select * from finish();
rollback;
