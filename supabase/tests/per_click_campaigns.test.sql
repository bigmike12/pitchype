-- Proves the per-click campaign rules from the per_click_campaigns migration:
-- the terms' constraints, the edit locks once live, admin review for every
-- per-click campaign, no proposed price from creators, and what the campaign
-- JSON shows to whom. Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(28);

-- Ada is a trusted business (an admin approved one of her campaigns before);
-- Chidi is a listed creator; Efe is an admin.
insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000dc001', 'dcdcdcdc-0000-0000-0000-0000000dc001', 'ada.ppc@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000dc003', 'dcdcdcdc-0000-0000-0000-0000000dc003', 'chidi.ppc@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000dc005', 'dcdcdcdc-0000-0000-0000-0000000dc005', 'efe.ppc@example.com', 'admin');

-- Identity fixtures: the people made above count as verified, so the identity
-- gates (identity_gates migration) are not what this file is about.
insert into public.identity_checks (user_id, kind, status, reference, legal_name_entered, legal_name_on_record,
                                    id_last3, id_fingerprint, counted, decided_at)
select u.id, case u.role when 'influencer' then 'creator_nin' else 'owner_nin' end, 'verified',
       'pit_id_fx_' || replace(u.id::text, '-', ''), 'Fixture Person', 'FIXTURE PERSON', '000',
       'v1:fx-' || u.id::text, true, now()
  from public.users u
 where u.created_at = now() and u.role in ('influencer', 'business')
   and not exists (select 1 from public.identity_checks c where c.user_id = u.id);

insert into public.business_profiles (user_id, business_name, contact_name, state, city) values
  ('00000000-0000-0000-0000-0000000dc001', 'Ada Clicks Store', 'Ada Obi', 'Lagos', 'Ikeja');

insert into public.influencer_profiles (user_id, display_name, state, city, niches, published) values
  ('00000000-0000-0000-0000-0000000dc003', 'Chidi Clicks Test', 'Lagos', 'Yaba', '{fashion}', true);

insert into public.influencer_platforms (user_id, platform, handle, follower_range) values
  ('00000000-0000-0000-0000-0000000dc003', 'instagram', 'chidi.ppctest', '10k_50k');

-- An earlier approved campaign makes Ada trusted.
insert into public.campaigns (id, business_id, status, title, brief, price_kobo, places,
                              applications_close_on, deliver_by, approved_at, published_at, submitted_at) values
  ('dc000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000dc001', 'closed', 'Old approved one',
   'A brief that is long enough for the checks.', 500000, 1, public.lagos_today() + 1, public.lagos_today() + 2,
   now(), now(), now());

-- The terms' constraints, as the database owner --------------------------------------

create function pg_temp.ppc(cpc bigint, price bigint, url text, blocked text[] default '{}')
returns void language sql as $$
  insert into public.campaigns (business_id, title, brief, payment_model, cpc_kobo, price_kobo, places,
                                destination_url, blocked_channels, applications_close_on, deliver_by)
  values ('00000000-0000-0000-0000-0000000dc001', 'Constraint probe', 'A brief that is long enough for the checks.',
          'per_click', cpc, price, 2, url, blocked, public.lagos_today() + 5, public.lagos_today() + 10)
$$;

select throws_ok($$ select pg_temp.ppc(4900, 2500000, 'https://www.konga.com/xmas') $$, '23514', null,
  'the cost per click is at least ₦50');
select throws_ok($$ select pg_temp.ppc(5050, 2500000, 'https://www.konga.com/xmas') $$, '23514', null,
  'the cost per click is whole naira');
select throws_ok($$ select pg_temp.ppc(5000, 499900, 'https://www.konga.com/xmas') $$, '23514', null,
  'the budget per place is at least ₦5,000');
select throws_ok($$ select pg_temp.ppc(7000, 520000, 'https://www.konga.com/xmas') $$, '23514', null,
  'the budget per place is a whole number of clicks');
select throws_ok($$ select pg_temp.ppc(5000, 2500000, 'http://konga.com') $$, '23514', null,
  'the destination is https');
select throws_ok($$ select pg_temp.ppc(5000, 2500000, null) $$, '23514', null,
  'a per-click campaign needs a destination');
select throws_ok($$ select pg_temp.ppc(5000, 2500000, 'https://www.konga.com/xmas', '{signal}') $$, '23514', null,
  'blocked channels come from the fixed list');
select throws_ok($$ select pg_temp.ppc(5000, 2500000, 'https://www.konga.com/xmas', '{whatsapp,whatsapp}') $$, '23514', null,
  'blocked channels are distinct');
select lives_ok($$ select pg_temp.ppc(5000, 2500000, 'https://www.konga.com/xmas', '{whatsapp,telegram}') $$,
  'a valid per-click campaign saves');

select throws_ok($$
  insert into public.campaigns (business_id, title, brief, price_kobo, places, cpc_kobo,
                                applications_close_on, deliver_by)
  values ('00000000-0000-0000-0000-0000000dc001', 'Fixed probe', 'A brief that is long enough for the checks.',
          500000, 1, 5000, public.lagos_today() + 5, public.lagos_today() + 10) $$, '23514', null,
  'a fixed-price campaign has no cost per click');
select throws_ok($$
  insert into public.campaigns (business_id, title, brief, price_kobo, places, destination_url,
                                applications_close_on, deliver_by)
  values ('00000000-0000-0000-0000-0000000dc001', 'Fixed probe', 'A brief that is long enough for the checks.',
          500000, 1, 'https://konga.com', public.lagos_today() + 5, public.lagos_today() + 10) $$, '23514', null,
  'a fixed-price campaign has no destination link');

-- Ada saves and submits drafts --------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "dcdcdcdc-0000-0000-0000-0000000dc001"}';

select lives_ok($$
  select public.save_campaign_draft(
    campaign_id => null, title => 'Konga Xmas clicks', brief => 'Share our Christmas sale page with your followers.',
    guidelines => null, niches => '{}', states => '{}', verified_only => false,
    price_kobo => 2500000, places => 3,
    applications_close_on => public.lagos_today() + 10, post_from => null,
    deliver_by => public.lagos_today() + 20,
    platforms => '[{"platform": "instagram", "min_followers": null}]',
    deliverables => '[{"platform": "instagram", "kind": "story", "quantity": 1}]',
    payment_model => 'per_click', cpc_kobo => 5000,
    destination_url => 'https://www.konga.com/xmas?ref=a', utm_tags => true,
    blocked_channels => '{whatsapp}')
$$, 'Ada saves a per-click draft');

select lives_ok($$
  select public.save_campaign_draft(
    campaign_id => null, title => 'Konga fixed reels', brief => 'Make a reel about our Christmas sale page.',
    guidelines => null, niches => '{}', states => '{}', verified_only => false,
    price_kobo => 2500000, places => 3,
    applications_close_on => public.lagos_today() + 10, post_from => null,
    deliver_by => public.lagos_today() + 20,
    platforms => '[{"platform": "instagram", "min_followers": null}]',
    deliverables => '[{"platform": "instagram", "kind": "reel", "quantity": 1}]',
    payment_model => 'fixed', cpc_kobo => null, destination_url => null, utm_tags => true,
    blocked_channels => '{}')
$$, 'Ada saves a fixed-price draft');

-- Fixture: a new campaign needs a start and an end date (campaign_timeline migration).
update public.campaigns set post_from = public.lagos_today() + 12, ends_on = deliver_by + 10
 where title in ('Konga Xmas clicks', 'Konga fixed reels');
select is(
  public.transition_campaign((select id from public.campaigns where title = 'Konga Xmas clicks'), 'submit'),
  'pending_review'::public.campaign_status,
  'a per-click campaign waits for review even from a trusted business');
select is(
  public.transition_campaign((select id from public.campaigns where title = 'Konga fixed reels'), 'submit'),
  'open'::public.campaign_status,
  'a trusted business''s fixed-price campaign opens at once');

-- Efe approves it -----------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "dcdcdcdc-0000-0000-0000-0000000dc005"}';
select is(
  public.transition_campaign((select id from public.campaigns where title = 'Konga Xmas clicks'), 'approve'),
  'open'::public.campaign_status, 'an admin approves the per-click campaign');
select is(
  (public.get_campaign((select id from public.campaigns where title = 'Konga Xmas clicks')))->>'destination_url',
  'https://www.konga.com/xmas?ref=a', 'an admin sees the full destination');

-- Locks once live, as the database owner -------------------------------------------------
reset role;

select throws_ok($$ update public.campaigns set cpc_kobo = 10000 where title = 'Konga Xmas clicks' $$,
  '42501', null, 'the cost per click is locked once live');
select throws_ok($$ update public.campaigns set destination_url = 'https://evil.example/x' where title = 'Konga Xmas clicks' $$,
  '42501', null, 'the destination is locked once live');
select throws_ok($$ update public.campaigns set utm_tags = false where title = 'Konga Xmas clicks' $$,
  '42501', null, 'the UTM setting is locked once live');
select throws_ok($$ update public.campaigns set blocked_channels = '{}' where title = 'Konga Xmas clicks' $$,
  '42501', null, 'blocked channels are locked once live');
select lives_ok($$ update public.campaigns set deliver_by = deliver_by + 3 where title = 'Konga Xmas clicks' $$,
  'the click window can still move later');

select set_config('test.ppc', (select id::text from public.campaigns where title = 'Konga Xmas clicks'), true);

-- Chidi, a creator ----------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "dcdcdcdc-0000-0000-0000-0000000dc003"}';

select is(
  (public.get_campaign(current_setting('test.ppc')::uuid))->>'destination_host',
  'www.konga.com', 'a creator sees the destination host');
select ok(
  not ((public.get_campaign(current_setting('test.ppc')::uuid)) ? 'destination_url'),
  'a creator does not get the full destination');
select throws_ok($$
  select public.apply_to_campaign(current_setting('test.ppc')::uuid, 600000, null) $$,
  'P0001', 'price_fixed_per_click', 'a creator cannot propose a price on a per-click campaign');
select lives_ok($$
  select public.apply_to_campaign(current_setting('test.ppc')::uuid, null, null) $$,
  'a creator applies at the fixed terms');

-- Once clicks have stopped, the end date can't move ---------------------------------------------
reset role;
insert into public.campaigns (business_id, status, title, brief, payment_model, cpc_kobo, price_kobo,
                              destination_url, places, applications_close_on, deliver_by)
values ('00000000-0000-0000-0000-0000000dc001', 'open', 'Clicks stopped', 'A brief that is long enough for the checks.',
        'per_click', 5000, 500000, 'https://shop.example.com/x', 2, public.lagos_today() - 1, public.lagos_today() - 1),
       ('00000000-0000-0000-0000-0000000dc001', 'open', 'Fixed ended', 'A brief that is long enough for the checks.',
        'fixed', null, 500000, null, 2, public.lagos_today() - 1, public.lagos_today() - 1);
select throws_ok($$ update public.campaigns set deliver_by = deliver_by + 3 where title = 'Clicks stopped' $$,
  '42501', 'the click window has ended', 'a per-click campaign can''t be extended once clicks have stopped');
select lives_ok($$ update public.campaigns set deliver_by = deliver_by + 3 where title = 'Fixed ended' $$,
  'a fixed-price campaign can still move its date later');

select * from finish();
rollback;
