-- Proves the rules from the create_moderation migration: person-to-person
-- blocks, strikes and their escalation, the append-only log, admin decisions
-- and appeals, and that the database's contact-detail check agrees with
-- src/lib/contact-details.ts. Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(58);

-- Ada is a business; Chidi and Dayo are creators; Efe is an admin.
insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000d0001', 'cccccccc-0000-0000-0000-000000000001', 'ada.mod@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000d0002', 'cccccccc-0000-0000-0000-000000000002', 'chidi.mod@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000d0003', 'cccccccc-0000-0000-0000-000000000003', 'dayo.mod@example.com', 'influencer'),
  ('00000000-0000-0000-0000-0000000d0004', 'cccccccc-0000-0000-0000-000000000004', 'efe.mod@example.com', 'admin');

-- Blocks, as Chidi ---------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-000000000002"}';

select lives_ok($$ select public.block_user('00000000-0000-0000-0000-0000000d0001') $$,
  'Chidi blocks Ada');
select lives_ok($$ select public.block_user('00000000-0000-0000-0000-0000000d0001') $$,
  'blocking twice is fine');
select is((select count(*)::integer from public.user_blocks), 1, 'Chidi sees his block');
select throws_ok($$ select public.block_user('00000000-0000-0000-0000-0000000d0002') $$,
  'P0001', 'not_allowed', 'nobody blocks themselves');

set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-000000000001"}';
select is((select count(*)::integer from public.user_blocks), 0,
  'Ada cannot see that she was blocked');

reset role;
select ok(public.is_blocked_between('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000d0002'),
  'a block counts from one side');
select ok(public.is_blocked_between('00000000-0000-0000-0000-0000000d0002', '00000000-0000-0000-0000-0000000d0001'),
  'and from the other');

set local role authenticated;
set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-000000000002"}';
select lives_ok($$ select public.unblock_user('00000000-0000-0000-0000-0000000d0001') $$,
  'Chidi unblocks Ada');
reset role;
select ok(not public.is_blocked_between('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000d0002'),
  'the block is gone');

-- Strikes and escalation (as the database owner, as send_message would) ---------
select is(public.record_strike('00000000-0000-0000-0000-0000000d0003', 'phone number', '0803 123 4567', 'dddddddd-0000-0000-0000-000000000001') ->> 'strikes',
  '1', 'a first strike');
select is(public.record_strike('00000000-0000-0000-0000-0000000d0003', 'phone number', '0803 123 4567', 'dddddddd-0000-0000-0000-000000000001') ->> 'strikes',
  '1', 'the same send retried is still one strike');
select is(public.standing_problem('00000000-0000-0000-0000-0000000d0003'), null,
  'one strike is a warning: normal access');

select is(public.record_strike('00000000-0000-0000-0000-0000000d0003', 'email address', 'dayo@mail.com', 'dddddddd-0000-0000-0000-000000000002') ->> 'strikes',
  '2', 'a second strike');
select is(public.standing_problem('00000000-0000-0000-0000-0000000d0003'), 'activity_paused',
  'two strikes pause new activity');
select ok((select messaging_restricted_until between now() + interval '71 hours' and now() + interval '73 hours'
             from public.users where id = '00000000-0000-0000-0000-0000000d0003'),
  'for three days');
select throws_ok($$ select public.check_standing('00000000-0000-0000-0000-0000000d0003') $$,
  'P0001', 'activity_paused', 'check_standing refuses a paused account');

update public.users set messaging_restricted_until = now() - interval '1 minute'
 where id = '00000000-0000-0000-0000-0000000d0003';
select is(public.standing_problem('00000000-0000-0000-0000-0000000d0003'), null,
  'the pause ends by itself');

select is(public.record_strike('00000000-0000-0000-0000-0000000d0003', 'WhatsApp link', 'wa.me/234803', 'dddddddd-0000-0000-0000-000000000003') ->> 'suspended',
  'true', 'a third strike suspends');
select is(public.standing_problem('00000000-0000-0000-0000-0000000d0003'), 'account_suspended',
  'pending review');

select throws_ok($$ update public.moderation_events set flag = 'edited' $$, '42501', null,
  'the log cannot be edited, even by the owner');
select throws_ok($$ delete from public.moderation_events $$, '42501', null,
  'or deleted');

-- Who can read the log ------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-000000000003"}';
select is((select count(*)::integer from public.moderation_events), 3, 'Dayo sees his own strikes');

set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-000000000002"}';
select is((select count(*)::integer from public.moderation_events), 0, 'Chidi sees none of them');
select throws_ok($$ select public.void_strike(gen_random_uuid(), 'A good reason') $$, '42501', null,
  'only admins void strikes');
select throws_ok($$ select public.standing_review() $$, '42501', null,
  'only admins see the review');

-- Admin decisions, as Efe ------------------------------------------------------------
set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-000000000004"}';
select lives_ok($$ select public.standing_review() $$, 'Efe sees the review');
select throws_ok($$
  select public.void_strike(
    (select id from public.moderation_events where dedupe_key = 'dddddddd-0000-0000-0000-000000000003'), ' ')
$$, 'P0001', 'reason_required', 'a void needs a reason');
select lives_ok($$
  select public.void_strike(
    (select id from public.moderation_events where dedupe_key = 'dddddddd-0000-0000-0000-000000000003'),
    'False positive: it was an order number')
$$, 'Efe voids the third strike');
select lives_ok($$
  select public.void_strike(
    (select id from public.moderation_events where dedupe_key = 'dddddddd-0000-0000-0000-000000000003'),
    'False positive: it was an order number')
$$, 'voiding twice changes nothing');

reset role;
select is(public.active_strike_count('00000000-0000-0000-0000-0000000d0003'), 2, 'two strikes remain');
select is((select suspended_at from public.users where id = '00000000-0000-0000-0000-0000000d0003'), null,
  'and the suspension that no longer fits is lifted');
select is((select count(*)::integer from public.moderation_events
            where user_id = '00000000-0000-0000-0000-0000000d0003' and kind = 'strike_voided'), 1,
  'one void recorded');

select is(public.record_strike('00000000-0000-0000-0000-0000000d0003', 'phone number', '08099999999', 'dddddddd-0000-0000-0000-000000000004') ->> 'suspended',
  'true', 'back to three: suspended again');

set local role authenticated;
set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-000000000004"}';
select throws_ok($$ select public.lift_suspension('00000000-0000-0000-0000-0000000d0003', '') $$,
  'P0001', 'reason_required', 'a lift needs a reason');
select lives_ok($$ select public.lift_suspension('00000000-0000-0000-0000-0000000d0003', 'Reviewed and warned') $$,
  'Efe lifts the suspension');
reset role;
select is(public.standing_problem('00000000-0000-0000-0000-0000000d0003'), null, 'Dayo is active again');
select is(public.active_strike_count('00000000-0000-0000-0000-0000000d0003'), 3, 'the strikes still stand');

-- Appeals --------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-000000000003"}';
select lives_ok($$ select public.submit_appeal('Please look again: the last one was an order number.') $$,
  'Dayo appeals');
select throws_ok($$ select public.submit_appeal('And again, please.') $$, 'P0001', 'appeal_open',
  'one open appeal at a time');

set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-000000000002"}';
select throws_ok($$ select public.submit_appeal('I have nothing to appeal.') $$, 'P0001', 'nothing_to_appeal',
  'Chidi has nothing to appeal');
select is((select count(*)::integer from public.moderation_appeals), 0, 'nor can he see Dayo''s appeal');

set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-000000000004"}';
select lives_ok($$
  select public.answer_appeal((select id from public.moderation_appeals where status = 'open' limit 1),
                              'We checked: the strikes stand.', true)
$$, 'Efe declines the appeal with an answer');

set local request.jwt.claims = '{"sub": "cccccccc-0000-0000-0000-000000000003"}';
select is((select answer from public.moderation_appeals), 'We checked: the strikes stand.',
  'Dayo reads the answer');
select throws_ok($$ select public.submit_appeal('One more time, please.') $$, 'P0001', 'appeal_too_soon',
  'at most one appeal a day');
reset role;
select is((select count(*)::integer from public.moderation_events
            where user_id = '00000000-0000-0000-0000-0000000d0003' and kind = 'appeal_declined'), 1,
  'the decline is in the log');

-- The database's copy of the contact-detail patterns --------------------------------
-- Same strings as src/lib/contact-details.test.ts.
select is(public.contact_detail_kind('Can you do it for ₦50,000?'), null, 'a price is fine');
select is(public.contact_detail_kind('Deliver by 12/12/2026 please'), null, 'a date is fine');
select is(public.contact_detail_kind('Call me at 5pm on the app'), null, 'a time is fine');
select is(public.contact_detail_kind('Tag @brightside.ng in the reel'), null, 'a handle is fine');
select is(public.contact_detail_kind('2 reels and 3 stories'), null, 'counts are fine');
select is(public.contact_detail_kind('Our 2024 sales grew 300 percent'), null, 'a year is fine');
select is(public.contact_detail_kind('0803 123 4567 is my number'), 'phone number', 'a spaced phone number');
select is(public.contact_detail_kind('+2348031234567'), 'phone number', 'an international phone number');
select is(public.contact_detail_kind('0803-123-4567'), 'phone number', 'a dashed phone number');
select is(public.contact_detail_kind('Chat on https://wa.me/2348031234567'), 'WhatsApp link', 'a WhatsApp link');
select is(public.contact_detail_kind('join chat.whatsapp.com/AbCdEf'), 'WhatsApp link', 'a WhatsApp group link');
select is(public.contact_detail_kind('t.me/brightside'), 'Telegram link', 'a Telegram link');
select is(public.contact_detail_kind('Email ada@brightside.ng'), 'email address', 'an email address');

select * from finish();
rollback;
