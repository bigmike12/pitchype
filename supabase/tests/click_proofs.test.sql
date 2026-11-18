-- Proves the proof-for-the-record rules (click_proofs migration): only the
-- creator of a running per-click hire records proof, with at least one link
-- or screenshot of their own; rows never change; the two people on the hire
-- and admins read them and their screenshots; and the daily orphan sweep
-- leaves attached screenshots alone. Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000cd001', 'cdcdcdcd-0000-0000-0000-0000000cd001', 'ada.proof@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000cd002', 'cdcdcdcd-0000-0000-0000-0000000cd002', 'bola.proof@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000cd011', 'cdcdcdcd-0000-0000-0000-0000000cd011', 'chidi.proof@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000cd012', 'cdcdcdcd-0000-0000-0000-0000000cd012', 'dayo.proof@example.com', 'influencer');
insert into public.business_profiles (user_id, business_name, contact_name, state, city) values
  ('00000000-0000-0000-0000-0000000cd001', 'Ada Proof', 'Ada Obi', 'Lagos', 'Ikeja');

-- Campaign 1 pays per click, campaign 2 a fixed price; Chidi is hired on both.
insert into public.campaigns (id, business_id, status, title, brief, payment_model, cpc_kobo, price_kobo,
                              destination_url, places, applications_close_on, deliver_by,
                              published_at, submitted_at, approved_at) values
  ('cd000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000cd001', 'open', 'Proof clicks',
   'A brief that is long enough for the checks.', 'per_click', 5000, 500000, 'https://shop.example.com/p',
   3, public.lagos_today() + 2, public.lagos_today() + 5, now(), now(), now());
insert into public.campaigns (id, business_id, status, title, brief, price_kobo, places,
                              applications_close_on, deliver_by, published_at, submitted_at, approved_at) values
  ('cd000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000cd001', 'open', 'Proof fixed',
   'A brief that is long enough for the checks.', 500000, 3, public.lagos_today() + 2, public.lagos_today() + 5,
   now(), now(), now());
insert into public.applications (id, campaign_id, creator_id, status)
select ('cd000000-0000-0000-0000-0000000000a' || n)::uuid, ('cd000000-0000-0000-0000-00000000000' || n)::uuid,
       '00000000-0000-0000-0000-0000000cd011', 'approved'
  from generate_series(1, 2) n;
insert into public.engagements (id, application_id, campaign_id, business_id, creator_id, status, agreed_price_kobo,
                                pay_by, funded_at, started_at, business_fee_kobo, creator_fee_bps,
                                creator_min_fee_kobo, fee_config_id)
select ('cd000000-0000-0000-0000-0000000000e' || n)::uuid, ('cd000000-0000-0000-0000-0000000000a' || n)::uuid,
       ('cd000000-0000-0000-0000-00000000000' || n)::uuid, '00000000-0000-0000-0000-0000000cd001',
       '00000000-0000-0000-0000-0000000cd011', 'in_progress', 500000, now() + interval '48 hours', now(), now(),
       50000, 500, 50000, (select id from public.fee_config order by created_at limit 1)
  from generate_series(1, 2) n;

-- Screenshots already uploaded: two of Chidi's (one a day old), one of Dayo's.
insert into public.proof_files (id, owner_id, path, content_type, bytes, created_at) values
  ('cd000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000cd011',
   '00000000-0000-0000-0000-0000000cd011/a.webp', 'image/webp', 100, now() - interval '2 days'),
  ('cd000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000cd012',
   '00000000-0000-0000-0000-0000000cd012/b.webp', 'image/webp', 100, now());

-- Chidi ------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cd011"}';
select isnt(public.record_click_proof('cd000000-0000-0000-0000-0000000000e1', 'Story at 7pm',
              array['https://instagram.com/stories/chidi/1'], array['cd000000-0000-0000-0000-0000000000f1']::uuid[]),
  null, 'the creator records where they posted, with a screenshot');
select throws_ok($$ select public.record_click_proof('cd000000-0000-0000-0000-0000000000e1', null, '{}', '{}') $$,
  'P0001', 'proof_required', 'proof needs a link or a screenshot');
select throws_ok($$ select public.record_click_proof('cd000000-0000-0000-0000-0000000000e2', null,
                      array['https://instagram.com/p/1'], '{}') $$,
  'P0001', 'engagement_locked', 'not on a fixed-price hire (that has its own review)');
select throws_ok($$ select public.record_click_proof('cd000000-0000-0000-0000-0000000000e1', null, '{}',
                      array['cd000000-0000-0000-0000-0000000000f2']::uuid[]) $$,
  'P0001', 'not_your_file', 'only the creator''s own screenshots');
select throws_ok($$ select public.record_click_proof('cd000000-0000-0000-0000-0000000000e1', null,
                      array['ftp://nope'], '{}') $$,
  'P0001', 'proof_invalid', 'links are web links');

-- Dayo, another creator.
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cd012"}';
select throws_ok($$ select public.record_click_proof('cd000000-0000-0000-0000-0000000000e1', null,
                      array['https://instagram.com/p/1'], '{}') $$,
  'P0001', 'no_such_engagement', 'another creator can''t add proof');
select is((select count(*)::int from public.click_proofs), 0, 'and can''t read it');

-- Ada, the business, and Bola, another business.
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cd001"}';
select is((select count(*)::int from public.click_proofs), 1, 'the business reads the proof');
select is((select count(*)::int from public.proof_files where click_proof_id is not null), 1,
  'and its screenshot');
set local request.jwt.claims = '{"sub": "cdcdcdcd-0000-0000-0000-0000000cd002"}';
select is((select count(*)::int from public.click_proofs), 0, 'another business reads nothing');
select throws_ok($$ insert into public.click_proofs (engagement_id, author_id, links)
                    values ('cd000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000cd002', '{}') $$,
  '42501', null, 'nobody writes proof directly');
reset role;

select throws_ok($$ update public.click_proofs set note = 'changed' $$, 'P0001', 'click_proofs_append_only',
  'proof never changes');
select is((select count(*)::int from public.delete_orphan_proof_files() p
            where p = '00000000-0000-0000-0000-0000000cd011/a.webp'), 0,
  'the orphan sweep keeps a screenshot attached to proof');

select * from finish();
rollback;
