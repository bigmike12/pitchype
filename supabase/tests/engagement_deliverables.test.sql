-- engagement_details carries the campaign's brief and deliverables in order, even after
-- the campaign has left `open` (the creator's job page lists them as the
-- submit checklist), and only to people on the hire.
-- Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-00000005d001', '5d5d5d5d-0000-0000-0000-00000005d001', 'biz.deliv@example.com', 'business'),
  ('00000000-0000-0000-0000-00000005d002', '5d5d5d5d-0000-0000-0000-00000005d002', 'cr.deliv@example.com', 'influencer'),
  ('00000000-0000-0000-0000-00000005d003', '5d5d5d5d-0000-0000-0000-00000005d003', 'other.deliv@example.com', 'influencer');
insert into public.business_profiles (user_id, business_name, contact_name, state, city) values
  ('00000000-0000-0000-0000-00000005d001', 'Deliv Biz', 'Dee', 'Lagos', 'Ikeja');

-- A campaign that is no longer open, so a creator could not read it directly.
insert into public.campaigns (id, business_id, status, title, brief, price_kobo, places,
                              applications_close_on, deliver_by, published_at, submitted_at) values
  ('5d000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000005d001', 'in_progress', 'Deliverables test',
   'A brief that is long enough for the checks.', 5000000, 1, public.lagos_today() + 10, public.lagos_today() + 20, now(), now());
insert into public.campaign_platforms (campaign_id, platform) values
  ('5d000000-0000-0000-0000-000000000001', 'instagram'),
  ('5d000000-0000-0000-0000-000000000001', 'tiktok');
insert into public.campaign_deliverables (campaign_id, position, platform, kind, quantity) values
  ('5d000000-0000-0000-0000-000000000001', 1, 'tiktok', 'video', 1),
  ('5d000000-0000-0000-0000-000000000001', 2, 'instagram', 'reel', 2);
insert into public.applications (id, campaign_id, creator_id, status) values
  ('5d000000-0000-0000-0000-0000000a0001', '5d000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-00000005d002', 'approved');
insert into public.engagements (id, application_id, campaign_id, business_id, creator_id, agreed_price_kobo, pay_by) values
  ('5d000000-0000-0000-0000-0000000e0001', '5d000000-0000-0000-0000-0000000a0001',
   '5d000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000005d001',
   '00000000-0000-0000-0000-00000005d002', 5000000, now() + interval '48 hours');

set local role authenticated;
set local request.jwt.claims = '{"sub": "5d5d5d5d-0000-0000-0000-00000005d002"}';
select is((select d #> '{campaign,deliverables}'
             from public.engagement_details('5d000000-0000-0000-0000-0000000e0001') d),
  '[{"kind": "video", "platform": "tiktok", "quantity": 1}, {"kind": "reel", "platform": "instagram", "quantity": 2}]'::jsonb,
  'the creator gets the deliverables in the campaign''s order');

set local request.jwt.claims = '{"sub": "5d5d5d5d-0000-0000-0000-00000005d001"}';
select is((select jsonb_array_length(d #> '{campaign,deliverables}')
             from public.engagement_details('5d000000-0000-0000-0000-0000000e0001') d),
  2, 'the business gets them too');

select is((select d #>> '{campaign,brief}'
             from public.engagement_details('5d000000-0000-0000-0000-0000000e0001') d),
  'A brief that is long enough for the checks.', 'and the brief, for the dispute page');

set local request.jwt.claims = '{"sub": "5d5d5d5d-0000-0000-0000-00000005d003"}';
select throws_ok($$select public.engagement_details('5d000000-0000-0000-0000-0000000e0001')$$,
  'P0001', 'no_such_engagement', 'someone else on neither side gets nothing');

select * from finish();
rollback;
