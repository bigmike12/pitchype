-- Proves the rules from the create_campaigns migration. People are simulated
-- with the JWT claims Supabase Auth would send; counts are limited to this
-- test's people and campaigns. Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(55);

-- Setup, as the database owner ----------------------------------------------------
-- Ada and Bola are businesses; Chidi and Dayo are listed creators; Efe is an admin.

insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000ca001', 'bbbbbbbb-0000-0000-0000-000000000001', 'ada@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000ca002', 'bbbbbbbb-0000-0000-0000-000000000002', 'bola@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000ca003', 'bbbbbbbb-0000-0000-0000-000000000003', 'chidi@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000ca004', 'bbbbbbbb-0000-0000-0000-000000000004', 'dayo@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000ca005', 'bbbbbbbb-0000-0000-0000-000000000005', 'efe@example.com', 'admin');

insert into public.business_profiles (user_id, business_name, contact_name, state, city) values
  ('00000000-0000-0000-0000-0000000ca001', 'Brightside Juice Test', 'Ada Obi', 'Lagos', 'Ikeja'),
  ('00000000-0000-0000-0000-0000000ca002', 'Bola Bakes Test', 'Bola A', 'Oyo', 'Ibadan');

insert into public.influencer_profiles (user_id, display_name, state, city, niches, published) values
  ('00000000-0000-0000-0000-0000000ca003', 'Chidi Campaign Test', 'Lagos', 'Yaba', '{fashion}', true),
  ('00000000-0000-0000-0000-0000000ca004', 'Dayo Campaign Test', 'Oyo', 'Ibadan', '{food-and-drinks}', true);

insert into public.influencer_platforms (user_id, platform, handle, follower_range) values
  ('00000000-0000-0000-0000-0000000ca003', 'instagram', 'chidi.campaigntest', '10k_50k'),
  ('00000000-0000-0000-0000-0000000ca004', 'tiktok', 'dayo.campaigntest', '1k_5k');

-- Visitors -------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{}';

select throws_ok($$ select * from public.campaigns $$, '42501', null,
  'visitors cannot read campaigns');
select lives_ok($$ select public.open_campaign_count() $$,
  'visitors can see how many campaigns are open');
select throws_ok($$ select * from public.list_open_campaigns() $$, '42501', null,
  'visitors cannot list campaigns');

-- Ada, a business ----------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "bbbbbbbb-0000-0000-0000-000000000001"}';

select isnt(
  public.save_campaign_draft(
    campaign_id => null, title => 'Zobo launch reels', brief => 'Show our new zobo flavour to your followers.',
    guidelines => 'Tag @brightside', niches => '{fashion,lifestyle}', states => '{Lagos}',
    verified_only => false, price_kobo => 5000000, places => 3,
    applications_close_on => public.lagos_today() + 10, post_from => null,
    deliver_by => public.lagos_today() + 20,
    platforms => '[{"platform": "instagram", "min_followers": "10k_50k"}]',
    deliverables => '[{"platform": "instagram", "kind": "reel", "quantity": 2}, {"platform": "instagram", "kind": "story", "quantity": 1}]'
  ),
  null, 'Ada saves a draft with its deliverables');

select is(
  (select array_agg(kind::text || ':' || quantity order by position) from public.campaign_deliverables
    where campaign_id = (select id from public.campaigns where title = 'Zobo launch reels')),
  array['reel:2', 'story:1'], 'deliverables keep their order');

select throws_ok(
  $$ select public.save_campaign_draft(null, 'Tweet storm', 'A brief that is long enough to pass.', null,
       '{}', '{}', false, 5000000, 1, public.lagos_today() + 5, null, public.lagos_today() + 6,
       '[{"platform": "x", "min_followers": null}]', '[{"platform": "x", "kind": "story", "quantity": 1}]') $$,
  '23514', null, 'there are no stories on X');
select throws_ok(
  $$ select public.save_campaign_draft(null, 'Too cheap', 'A brief that is long enough to pass.', null,
       '{}', '{}', false, 400000, 1, public.lagos_today() + 5, null, public.lagos_today() + 6,
       '[{"platform": "x", "min_followers": null}]', '[{"platform": "x", "kind": "post", "quantity": 1}]') $$,
  '23514', null, 'the price is at least ₦5,000');
select throws_ok(
  $$ select public.save_campaign_draft(null, 'Orphan line', 'A brief that is long enough to pass.', null,
       '{}', '{}', false, 5000000, 1, public.lagos_today() + 5, null, public.lagos_today() + 6,
       '[{"platform": "x", "min_followers": null}]', '[{"platform": "tiktok", "kind": "video", "quantity": 1}]') $$,
  '23503', null, 'a deliverable must be on one of the campaign''s platforms');

select is(
  public.transition_campaign((select id from public.campaigns where title = 'Zobo launch reels'), 'submit'),
  'pending_review'::public.campaign_status, 'a first campaign waits for an admin');

select throws_ok(
  $$ update public.campaigns set price_kobo = 9000000 where title = 'Zobo launch reels' $$,
  '42501', null, 'the price is locked once submitted');
select throws_ok(
  $$ update public.campaigns set brief = 'A different brief, long enough.' where title = 'Zobo launch reels' $$,
  '42501', null, 'nothing changes while it waits for review');
select throws_ok(
  $$ insert into public.campaign_deliverables (campaign_id, position, platform, kind, quantity)
     select id, 3, 'instagram', 'post', 9 from public.campaigns where title = 'Zobo launch reels' $$,
  '42501', null, 'deliverables are locked once submitted');
select throws_ok(
  $$ update public.campaigns set status = 'open' where title = 'Zobo launch reels' $$,
  '42501', null, 'status only changes through transition_campaign');
select throws_ok(
  $$ select public.transition_campaign((select id from public.campaigns where title = 'Zobo launch reels'), 'approve') $$,
  '42501', null, 'a business cannot approve its own campaign');

-- Bola, another business ----------------------------------------------------------------
set local request.jwt.claims = '{"sub": "bbbbbbbb-0000-0000-0000-000000000002"}';

select is((select count(*)::int from public.campaigns where business_id = '00000000-0000-0000-0000-0000000ca001'), 0,
  'businesses cannot see each other''s campaigns');

-- Chidi, a creator -------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "bbbbbbbb-0000-0000-0000-000000000003"}';

select throws_ok(
  $$ select public.save_campaign_draft(null, 'Creator campaign', 'A brief that is long enough to pass.', null,
       '{}', '{}', false, 5000000, 1, public.lagos_today() + 5, null, public.lagos_today() + 6,
       '[{"platform": "x", "min_followers": null}]', '[{"platform": "x", "kind": "post", "quantity": 1}]') $$,
  '42501', null, 'creators cannot create campaigns');
select is(
  (select count(*)::int from public.list_open_campaigns(page_size => 50)
    where campaign ->> 'business_name' = 'Brightside Juice Test'),
  0, 'creators do not see campaigns waiting for review');

-- Efe, an admin -----------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "bbbbbbbb-0000-0000-0000-000000000005"}';

select throws_ok(
  $$ select public.transition_campaign((select id from public.campaigns where title = 'Zobo launch reels'), 'reject') $$,
  '22023', null, 'sending a campaign back needs a reason');
select is(
  public.transition_campaign((select id from public.campaigns where title = 'Zobo launch reels'), 'reject', 'Say what flavour it is'),
  'draft'::public.campaign_status, 'an admin can send it back to draft');

set local request.jwt.claims = '{"sub": "bbbbbbbb-0000-0000-0000-000000000001"}';
select is(
  (select review_note from public.campaigns where title = 'Zobo launch reels'),
  'Say what flavour it is', 'Ada sees why');
select lives_ok(
  $$ update public.campaigns set brief = 'Show our new hibiscus zobo flavour to your followers.'
      where title = 'Zobo launch reels' $$,
  'a returned draft can be edited');
select is(
  public.transition_campaign((select id from public.campaigns where title = 'Zobo launch reels'), 'submit'),
  'pending_review'::public.campaign_status, 'and resubmitted');

set local request.jwt.claims = '{"sub": "bbbbbbbb-0000-0000-0000-000000000005"}';
select is(
  public.transition_campaign((select id from public.campaigns where title = 'Zobo launch reels'), 'approve'),
  'open'::public.campaign_status, 'an admin approves it');
select is(
  public.get_campaign((select id from public.campaigns where title = 'Zobo launch reels')) ->> 'revised_at',
  null, 'changes made before it went live don''t count as edits');

-- Ada is now trusted ----------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "bbbbbbbb-0000-0000-0000-000000000001"}';

select public.save_campaign_draft(
  null, 'Verified foodies only', 'Taste our juice and tell your audience.', null,
  '{}', '{}', true, 7500000, 2, public.lagos_today() + 10, public.lagos_today() + 11, public.lagos_today() + 30,
  '[{"platform": "instagram", "min_followers": null}]', '[{"platform": "instagram", "kind": "post", "quantity": 1}]'
);
select is(
  public.transition_campaign((select id from public.campaigns where title = 'Verified foodies only'), 'submit'),
  'open'::public.campaign_status, 'after one approval, campaigns go live at once');

select throws_ok(
  $$ select public.save_campaign_draft(null, 'Too late', 'A brief that is long enough to pass.', null,
       '{}', '{}', false, 5000000, 1, public.lagos_today() - 1, null, public.lagos_today() + 6,
       '[{"platform": "x", "min_followers": null}]', '[{"platform": "x", "kind": "post", "quantity": 1}]');
     select public.transition_campaign((select id from public.campaigns where title = 'Too late'), 'submit') $$,
  '22023', null, 'a campaign whose deadline has passed cannot be submitted');

select ok(
  public.count_qualifying_creators((select id from public.campaigns where title = 'Zobo launch reels')) >= 1,
  'Ada sees how many creators qualify');

-- Live edits.
select lives_ok(
  $$ update public.campaigns
        set brief = 'Show our hibiscus zobo, chilled, to your followers.',
            applications_close_on = applications_close_on + 5,
            deliver_by = deliver_by + 5,
            places = 4
      where title = 'Zobo launch reels' $$,
  'wording, later deadlines and places can change while open');
select throws_ok(
  $$ update public.campaigns set applications_close_on = applications_close_on - 1 where title = 'Zobo launch reels' $$,
  '42501', null, 'deadlines cannot move earlier');
select throws_ok(
  $$ update public.campaigns set places = 0 where title = 'Zobo launch reels' $$,
  '23514', null, 'places stay at least 1');
select throws_ok(
  $$ update public.campaigns set niches = '{}' where title = 'Zobo launch reels' $$,
  '42501', null, 'requirements are locked once live');
select is(
  (select count(*)::int from public.campaign_revisions
    where campaign_id = (select id from public.campaigns where title = 'Zobo launch reels')),
  3, 'every submitted and edited version of the wording is kept');

-- Creators see open campaigns and why they qualify or not ----------------------------------------
set local request.jwt.claims = '{"sub": "bbbbbbbb-0000-0000-0000-000000000003"}';

select is(
  (select campaign -> 'problems' from public.list_open_campaigns(page_size => 50)
    where campaign ->> 'title' = 'Zobo launch reels'),
  '[]'::jsonb, 'Chidi qualifies: Instagram 10K+, fashion, Lagos');
select is(
  (select campaign -> 'problems' -> 0 ->> 'code' from public.list_open_campaigns(page_size => 50)
    where campaign ->> 'title' = 'Verified foodies only'),
  'not_verified', 'verified-only campaigns say so');
select is(
  (select count(*)::int from public.list_open_campaigns(qualified_only => true, page_size => 50)
    where campaign ->> 'business_name' = 'Brightside Juice Test'),
  1, 'creators can list only the campaigns they qualify for');
select ok(
  (public.get_campaign((select (campaign ->> 'id')::uuid from public.list_open_campaigns(page_size => 50)
                          where campaign ->> 'title' = 'Zobo launch reels')) ->> 'revised_at') is not null,
  'creators see that the brief was edited');
select lives_ok(
  $$ select public.report_campaign(
       (select (campaign ->> 'id')::uuid from public.list_open_campaigns(page_size => 50)
         where campaign ->> 'title' = 'Zobo launch reels'),
       'off_platform_contact', ' Asked me to WhatsApp them ') $$,
  'creators can report a campaign');

set local request.jwt.claims = '{"sub": "bbbbbbbb-0000-0000-0000-000000000004"}';
select is(
  (select array_agg(problem ->> 'code' order by problem ->> 'code')
     from public.list_open_campaigns(page_size => 50),
          jsonb_array_elements(campaign -> 'problems') problem
    where campaign ->> 'title' = 'Zobo launch reels'),
  array['missing_platform', 'niche', 'state'], 'Dayo sees every reason he doesn''t qualify');
select is(
  (select count(*)::int from public.campaigns), 0,
  'creators cannot read the campaigns table directly');

-- Pausing, closing and deleting ----------------------------------------------------------------
set local request.jwt.claims = '{"sub": "bbbbbbbb-0000-0000-0000-000000000001"}';

select is(
  public.transition_campaign((select id from public.campaigns where title = 'Verified foodies only'), 'pause'),
  'paused'::public.campaign_status, 'Ada pauses a campaign');

set local request.jwt.claims = '{"sub": "bbbbbbbb-0000-0000-0000-000000000003"}';
select is(
  (select count(*)::int from public.list_open_campaigns(page_size => 50)
    where campaign ->> 'title' = 'Verified foodies only'),
  0, 'paused campaigns are hidden from creators');

set local request.jwt.claims = '{"sub": "bbbbbbbb-0000-0000-0000-000000000001"}';
select is(
  public.transition_campaign((select id from public.campaigns where title = 'Verified foodies only'), 'close'),
  'closed'::public.campaign_status, 'Ada closes it early');
select throws_ok(
  $$ select public.transition_campaign((select id from public.campaigns where title = 'Verified foodies only'), 'resume') $$,
  '55000', null, 'closed is final');

delete from public.campaigns where title = 'Verified foodies only';
select is((select count(*)::int from public.campaigns where title = 'Verified foodies only'), 1,
  'a campaign that went live cannot be deleted');
delete from public.campaigns where title = 'Too late';
select is((select count(*)::int from public.campaigns where title = 'Too late'), 0,
  'a draft can be deleted');

-- Moderation -------------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "bbbbbbbb-0000-0000-0000-000000000005"}';

select is(
  (select details from public.campaign_reports
    where campaign_id = (select id from public.campaigns where title = 'Zobo launch reels')),
  'Asked me to WhatsApp them', 'admins read campaign reports');
select is(
  (select business_name from public.business_profiles where user_id = '00000000-0000-0000-0000-0000000ca001'),
  'Brightside Juice Test', 'admins can see the business behind a campaign');
select throws_ok(
  $$ select public.transition_campaign((select id from public.campaigns where title = 'Zobo launch reels'), 'take_down') $$,
  '22023', null, 'a takedown needs a reason');
select is(
  public.transition_campaign((select id from public.campaigns where title = 'Zobo launch reels'), 'take_down', 'Off-platform contact'),
  'closed'::public.campaign_status, 'an admin takes a campaign down');
select lives_ok(
  $$ select public.resolve_campaign_report(
       (select id from public.campaign_reports
         where campaign_id = (select id from public.campaigns where title = 'Zobo launch reels'))) $$,
  'and resolves the report');

set local request.jwt.claims = '{"sub": "bbbbbbbb-0000-0000-0000-000000000003"}';
select is(
  (select count(*)::int from public.list_open_campaigns(page_size => 50)
    where campaign ->> 'business_name' = 'Brightside Juice Test'),
  0, 'taken-down campaigns disappear for creators');

set local request.jwt.claims = '{"sub": "bbbbbbbb-0000-0000-0000-000000000001"}';
select is(
  (select removed_reason from public.campaigns where title = 'Zobo launch reels'),
  'Off-platform contact', 'the business sees why it was taken down');

-- Pay per click is decided but not built ---------------------------------------------------------
reset role;
insert into public.campaigns (business_id, title, brief, payment_model, places, applications_close_on, deliver_by)
values ('00000000-0000-0000-0000-0000000ca001', 'Click campaign', 'Send people to our new online shop.',
        'per_click', 5, public.lagos_today() + 5, public.lagos_today() + 9);
insert into public.campaign_platforms (campaign_id, platform)
select id, 'x' from public.campaigns where title = 'Click campaign';
insert into public.campaign_deliverables (campaign_id, position, platform, kind, quantity)
select id, 1, 'x', 'post', 1 from public.campaigns where title = 'Click campaign';

set local role authenticated;
set local request.jwt.claims = '{"sub": "bbbbbbbb-0000-0000-0000-000000000001"}';
select throws_ok(
  $$ select public.transition_campaign((select id from public.campaigns where title = 'Click campaign'), 'submit') $$,
  '0A000', null, 'pay-per-click campaigns cannot be published yet');
select throws_ok(
  $$ update public.campaigns set payment_model = 'fixed' where title = 'Click campaign' $$,
  '42501', null, 'businesses cannot set the payment model directly');

-- Counting needs ownership --------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "bbbbbbbb-0000-0000-0000-000000000002"}';
select throws_ok(
  $$ select public.count_qualifying_creators((select id from public.campaigns where title = 'Click campaign')) $$,
  'P0002', null, 'other businesses cannot count for Ada''s campaign');

select * from finish();
rollback;
