-- Proves the rules from the create_submissions migration: only the hired
-- creator submits, only from in_progress or denied, with proof, at most four
-- rounds; only the business accepts or denies, and a denial needs reasons;
-- accept releases escrow once with the creator fee; past the review deadline
-- accept and deny both auto-release instead; the creator can withdraw from
-- in_progress or denied as creator at fault; the Stage 6 admin tool stays on
-- funded and in_progress; nobody writes the tables directly, and people read
-- only the submissions and files of their own hires.
-- Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(105);

-- Ada and Bola are businesses, Efe is an admin, creators 5b101..5b108 are hired by Ada.
insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-00000005b001', '5b5b5b5b-0000-0000-0000-00000005b001', 'ada.submit@example.com', 'business'),
  ('00000000-0000-0000-0000-00000005b002', '5b5b5b5b-0000-0000-0000-00000005b002', 'bola.submit@example.com', 'business'),
  ('00000000-0000-0000-0000-00000005b003', '5b5b5b5b-0000-0000-0000-00000005b003', 'efe.submit@example.com', 'admin');

insert into public.users (id, auth_user_id, email, role)
select ('00000000-0000-0000-0000-00000005b1' || lpad(n::text, 2, '0'))::uuid,
       ('5b5b5b5b-0000-0000-0000-00000005b1' || lpad(n::text, 2, '0'))::uuid,
       'c' || n || '.submit@example.com', 'influencer'
  from generate_series(1, 8) n;

insert into public.business_profiles (user_id, business_name, contact_name, state, city) values
  ('00000000-0000-0000-0000-00000005b001', 'Ada Submit Kitchen', 'Ada Obi', 'Lagos', 'Ikeja'),
  ('00000000-0000-0000-0000-00000005b002', 'Bola Submit Shop', 'Bola A', 'Oyo', 'Ibadan');

insert into public.campaigns (id, business_id, status, title, brief, price_kobo, places,
                              applications_close_on, deliver_by, published_at, submitted_at) values
  ('5b000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000005b001', 'open', 'Submissions test',
   'A brief that is long enough for the checks.', 5000000, 20, public.lagos_today() + 10, public.lagos_today() + 20, now(), now());

-- Hire n is creator n's, ₦50,000 each.
insert into public.applications (id, campaign_id, creator_id, status)
select ('5b000000-0000-0000-0000-0000000a00' || lpad(n::text, 2, '0'))::uuid,
       '5b000000-0000-0000-0000-000000000001',
       ('00000000-0000-0000-0000-00000005b1' || lpad(n::text, 2, '0'))::uuid, 'approved'
  from generate_series(1, 7) n;

insert into public.engagements (id, application_id, campaign_id, business_id, creator_id, agreed_price_kobo, pay_by)
select ('5b000000-0000-0000-0000-0000000e00' || lpad(n::text, 2, '0'))::uuid,
       ('5b000000-0000-0000-0000-0000000a00' || lpad(n::text, 2, '0'))::uuid,
       '5b000000-0000-0000-0000-000000000001',
       '00000000-0000-0000-0000-00000005b001',
       ('00000000-0000-0000-0000-00000005b1' || lpad(n::text, 2, '0'))::uuid,
       5000000, now() + interval '48 hours'
  from generate_series(1, 7) n;

-- Fund every hire by card (Paystack's charge ₦954.06 on ₦52,500), then every
-- creator but creator 2 starts work.
do $$
declare
  n integer;
  started jsonb;
begin
  for n in 1..7 loop
    perform set_config('request.jwt.claims', '{"sub": "5b5b5b5b-0000-0000-0000-00000005b001"}', true);
    started := public.start_payment(('5b000000-0000-0000-0000-0000000e00' || lpad(n::text, 2, '0'))::uuid, true);
    perform public.record_card_payment(started ->> 'reference', (started ->> 'card_amount_kobo')::bigint,
      95406, 'evt-submit-' || n, '{}');
    if n <> 2 then
      perform set_config('request.jwt.claims', json_build_object('sub',
        '5b5b5b5b-0000-0000-0000-00000005b1' || lpad(n::text, 2, '0'))::text, true);
      perform public.start_engagement(('5b000000-0000-0000-0000-0000000e00' || lpad(n::text, 2, '0'))::uuid);
    end if;
  end loop;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

select is((select array_agg(status::text order by id) from public.engagements
            where id::text like '5b000000-0000-0000-0000-0000000e00%'),
  array['in_progress', 'funded', 'in_progress', 'in_progress', 'in_progress', 'in_progress', 'in_progress'],
  'hire 2 is funded, the rest are in progress');

-- Screenshots are registered by the server before submitting. Creator 7 owns
-- the first two, creator 8 the third.
create temporary table files on commit drop as
select public.register_proof_file('00000000-0000-0000-0000-00000005b107', '00000000-0000-0000-0000-00000005b107/one.webp', 'image/webp', 120000) as one,
       public.register_proof_file('00000000-0000-0000-0000-00000005b107', '00000000-0000-0000-0000-00000005b107/two.webp', 'image/webp', 90000) as two,
       public.register_proof_file('00000000-0000-0000-0000-00000005b108', '00000000-0000-0000-0000-00000005b108/one.webp', 'image/webp', 80000) as other;
grant select on files to authenticated;
select ok((select bool_and(submission_id is null and dispute_statement_id is null) from public.proof_files
            where id in ((select one from files), (select two from files), (select other from files))),
  'registered files start unattached');

-- Submitting ---------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "5b5b5b5b-0000-0000-0000-00000005b102"}'; -- creator 2
select throws_ok($$ select public.submit_work('5b000000-0000-0000-0000-0000000e0001', null, array['https://x.com/p/1'], null) $$,
  'P0001', 'no_such_engagement', 'another creator cannot submit on hire 1');
select throws_ok($$ select public.submit_work('5b000000-0000-0000-0000-0000000e0002', null, array['https://x.com/p/1'], null) $$,
  'P0001', 'engagement_locked', 'work cannot be submitted before it started');
set local request.jwt.claims = '{"sub": "5b5b5b5b-0000-0000-0000-00000005b001"}'; -- Ada
select throws_ok($$ select public.submit_work('5b000000-0000-0000-0000-0000000e0001', null, array['https://x.com/p/1'], null) $$,
  'P0001', 'no_such_engagement', 'the business cannot submit');
set local request.jwt.claims = '{"sub": "5b5b5b5b-0000-0000-0000-00000005b101"}'; -- creator 1
select throws_ok($$ select public.submit_work('5b000000-0000-0000-0000-0000000e0001', 'Done', null, null) $$,
  'P0001', 'proof_required', 'a note alone is not proof');
select throws_ok($$ select public.submit_work('5b000000-0000-0000-0000-0000000e0001', null, '{}', '{}') $$,
  'P0001', 'proof_required', 'empty links and files are not proof');
select throws_ok($$ select public.submit_work('5b000000-0000-0000-0000-0000000e0001', null,
                      array(select 'https://x.com/p/' || n from generate_series(1, 11) n), null) $$,
  'P0001', 'proof_invalid', 'eleven links are refused');
select throws_ok($$ select public.submit_work('5b000000-0000-0000-0000-0000000e0001', null, array['ftp://x.com/p/1'], null) $$,
  'P0001', 'proof_invalid', 'a link must be http or https');
select throws_ok($$ select public.submit_work('5b000000-0000-0000-0000-0000000e0001', null,
                      array['https://x.com/' || repeat('a', 500)], null) $$,
  'P0001', 'proof_invalid', 'a link over 500 characters is refused');
select throws_ok($$ select public.submit_work('5b000000-0000-0000-0000-0000000e0001', repeat('n', 1001),
                      array['https://x.com/p/1'], null) $$,
  'P0001', 'proof_invalid', 'a note over 1,000 characters is refused');
select is((select count(*)::integer from public.submissions
            where engagement_id = '5b000000-0000-0000-0000-0000000e0001'), 0,
  'refused submissions wrote nothing');
select lives_ok($$ select public.submit_work('5b000000-0000-0000-0000-0000000e0001', '  Posted on Monday  ',
                     array[' https://instagram.com/p/abc ', 'http://tiktok.com/@c1/video/1'], null) $$,
  'creator 1 submits round 1');
select throws_ok($$ select public.submit_work('5b000000-0000-0000-0000-0000000e0001', null, array['https://x.com/p/1'], null) $$,
  'P0001', 'engagement_locked', 'a second submission while one waits for review is refused');
reset role;

select is((select status::text from public.engagements where id = '5b000000-0000-0000-0000-0000000e0001'),
  'submitted', 'hire 1 is submitted');
select is((select array[round::text, status, note] from public.submissions
            where engagement_id = '5b000000-0000-0000-0000-0000000e0001'),
  array['1', 'pending_review', 'Posted on Monday'], 'round 1 waits for review, with the trimmed note');
select is((select links from public.submissions where engagement_id = '5b000000-0000-0000-0000-0000000e0001'),
  array['https://instagram.com/p/abc', 'http://tiktok.com/@c1/video/1'], 'the links are stored trimmed, in order');
select is((select review_deadline_at from public.submissions where engagement_id = '5b000000-0000-0000-0000-0000000e0001'),
  now() + interval '7 days', 'the business has exactly 7 days to review');
select is((select count(*)::integer from public.ledger_entries
            where engagement_id = '5b000000-0000-0000-0000-0000000e0001' and event_type = 'hire_settled'), 0,
  'submitting moves no money');

-- Nothing settles a submitted hire except review -------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "5b5b5b5b-0000-0000-0000-00000005b003"}'; -- Efe
select throws_ok($$ select public.settle_engagement('5b000000-0000-0000-0000-0000000e0001', 'release', null, 'Looks fine') $$,
  'P0001', 'engagement_locked', 'the Stage 6 admin tool cannot settle a submitted hire');
set local request.jwt.claims = '{"sub": "5b5b5b5b-0000-0000-0000-00000005b101"}'; -- creator 1
select throws_ok($$ select public.withdraw_from_engagement('5b000000-0000-0000-0000-0000000e0001') $$,
  'P0001', 'engagement_locked', 'the creator cannot withdraw while the work is under review');

-- Who reviews ----------------------------------------------------------------------------------------------
select throws_ok($$ select public.accept_submission('5b000000-0000-0000-0000-0000000e0001') $$,
  'P0001', 'no_such_engagement', 'the creator cannot accept their own work');
set local request.jwt.claims = '{"sub": "5b5b5b5b-0000-0000-0000-00000005b002"}'; -- Bola
select throws_ok($$ select public.accept_submission('5b000000-0000-0000-0000-0000000e0001') $$,
  'P0001', 'no_such_engagement', 'another business cannot accept Ada''s hire');
select throws_ok($$ select public.deny_submission('5b000000-0000-0000-0000-0000000e0001', array['Wrong hashtag']) $$,
  'P0001', 'no_such_engagement', 'another business cannot deny Ada''s hire');
set local request.jwt.claims = '{"sub": "5b5b5b5b-0000-0000-0000-00000005b003"}'; -- Efe
select throws_ok($$ select public.accept_submission('5b000000-0000-0000-0000-0000000e0001') $$,
  'P0001', 'no_such_engagement', 'an admin cannot accept for the business');

-- Denying ------------------------------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "5b5b5b5b-0000-0000-0000-00000005b001"}'; -- Ada
select throws_ok($$ select public.deny_submission('5b000000-0000-0000-0000-0000000e0001', '{}') $$,
  'P0001', 'reasons_required', 'a denial needs a reason');
select throws_ok($$ select public.deny_submission('5b000000-0000-0000-0000-0000000e0001', null) $$,
  'P0001', 'reasons_required', 'a missing reasons list is refused');
select throws_ok($$ select public.deny_submission('5b000000-0000-0000-0000-0000000e0001', array['ok']) $$,
  'P0001', 'reasons_required', 'a two-character reason is refused');
select throws_ok($$ select public.deny_submission('5b000000-0000-0000-0000-0000000e0001', array['   ok   ']) $$,
  'P0001', 'reasons_required', 'reasons are measured after trimming');
select throws_ok($$ select public.deny_submission('5b000000-0000-0000-0000-0000000e0001', array[repeat('r', 501)]) $$,
  'P0001', 'reasons_required', 'a reason over 500 characters is refused');
select throws_ok($$ select public.deny_submission('5b000000-0000-0000-0000-0000000e0001',
                      array['One', 'Two', 'Three', 'Four', 'Five', 'Six']) $$,
  'P0001', 'reasons_required', 'six reasons are refused');
select is((select public.deny_submission('5b000000-0000-0000-0000-0000000e0001', array['  Wrong hashtag  '])),
  'denied', 'Ada denies round 1');
select throws_ok($$ select public.deny_submission('5b000000-0000-0000-0000-0000000e0001', array['Again']) $$,
  'P0001', 'engagement_locked', 'denying twice is refused');
select throws_ok($$ select public.accept_submission('5b000000-0000-0000-0000-0000000e0001') $$,
  'P0001', 'engagement_locked', 'a denied round cannot be accepted');
reset role;

select is((select status::text from public.engagements where id = '5b000000-0000-0000-0000-0000000e0001'),
  'denied', 'hire 1 is denied');
select ok((select status = 'denied' and denial_reasons = array['Wrong hashtag'] and decided_at = now()
                  and decided_by = '00000000-0000-0000-0000-00000005b001'
             from public.submissions where engagement_id = '5b000000-0000-0000-0000-0000000e0001' and round = 1),
  'round 1 is denied with the trimmed reason, by Ada');

-- Resubmitting, up to round 4 ---------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "5b5b5b5b-0000-0000-0000-00000005b101"}'; -- creator 1
select lives_ok($$ select public.submit_work('5b000000-0000-0000-0000-0000000e0001', null, array['https://x.com/p/2'], null) $$,
  'creator 1 resubmits');
reset role;
select is((select round::integer from public.submissions
            where engagement_id = '5b000000-0000-0000-0000-0000000e0001' and status = 'pending_review'), 2,
  'the resubmission is round 2');
select is((select count(*)::integer from public.submissions where engagement_id = '5b000000-0000-0000-0000-0000000e0001'), 2,
  'round 1 is kept');

do $$
declare
  n integer;
begin
  for n in 2..4 loop
    if n > 2 then
      perform set_config('request.jwt.claims', '{"sub": "5b5b5b5b-0000-0000-0000-00000005b101"}', true);
      perform public.submit_work('5b000000-0000-0000-0000-0000000e0001', null, array['https://x.com/p/' || n], null);
    end if;
    perform set_config('request.jwt.claims', '{"sub": "5b5b5b5b-0000-0000-0000-00000005b001"}', true);
    perform public.deny_submission('5b000000-0000-0000-0000-0000000e0001', array['Still wrong', 'Round ' || n]);
  end loop;
  perform set_config('request.jwt.claims', '', true);
end;
$$;
select is((select array_agg(round::text || ':' || status order by round) from public.submissions
            where engagement_id = '5b000000-0000-0000-0000-0000000e0001'),
  array['1:denied', '2:denied', '3:denied', '4:denied'], 'four rounds, all denied');

set local role authenticated;
set local request.jwt.claims = '{"sub": "5b5b5b5b-0000-0000-0000-00000005b101"}'; -- creator 1
select throws_ok($$ select public.submit_work('5b000000-0000-0000-0000-0000000e0001', null, array['https://x.com/p/5'], null) $$,
  'P0001', 'no_rounds_left', 'a fifth submission is refused');

-- Withdrawing from a denied hire
select lives_ok($$ select public.withdraw_from_engagement('5b000000-0000-0000-0000-0000000e0001') $$,
  'creator 1 withdraws after the last denial');
reset role;
select is((select array[status::text, settle_outcome, coalesce(cancel_reason, 'none')] from public.engagements
            where id = '5b000000-0000-0000-0000-0000000e0001'),
  array['refunded', 'refund_creator_fault', 'none'], 'hire 1 is refunded with the creator at fault, not cancelled');

-- Accepting (hire 3) ---------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "5b5b5b5b-0000-0000-0000-00000005b103"}'; -- creator 3
select lives_ok($$ select public.submit_work('5b000000-0000-0000-0000-0000000e0003', null, array['https://x.com/p/3'], null) $$,
  'creator 3 submits');
set local request.jwt.claims = '{"sub": "5b5b5b5b-0000-0000-0000-00000005b001"}'; -- Ada
select is((select public.accept_submission('5b000000-0000-0000-0000-0000000e0003')), 'accepted',
  'Ada accepts hire 3');
reset role;
select is((select array[status::text, settle_outcome] from public.engagements
            where id = '5b000000-0000-0000-0000-0000000e0003'), array['accepted', 'release'],
  'hire 3 is accepted as a full release');
select is(public.wallet_balance('00000000-0000-0000-0000-00000005b103', 'creator_wallet'), 4750000::bigint,
  'creator 3 gets ₦47,500 for ₦50,000');
select ok((select status = 'accepted' and decided_at = now() and decided_by = '00000000-0000-0000-0000-00000005b001'
                  and denial_reasons is null
             from public.submissions where engagement_id = '5b000000-0000-0000-0000-0000000e0003'),
  'the submission is accepted by Ada');
select ok((select bool_and(actor_user_id = '00000000-0000-0000-0000-00000005b001' and reason = 'accepted')
             from public.ledger_entries
            where engagement_id = '5b000000-0000-0000-0000-0000000e0003' and event_type = 'hire_settled'),
  'the settlement records Ada as the actor');
set local role authenticated;
set local request.jwt.claims = '{"sub": "5b5b5b5b-0000-0000-0000-00000005b001"}'; -- Ada
select throws_ok($$ select public.accept_submission('5b000000-0000-0000-0000-0000000e0003') $$,
  'P0001', 'engagement_locked', 'accepting twice is refused');
reset role;
select is((select count(*)::integer from public.ledger_entries
            where engagement_id = '5b000000-0000-0000-0000-0000000e0003'), 8,
  'and wrote nothing (5 funding rows + 3 settlement rows)');

-- Creator withdraws from work in progress (hire 4) ----------------------------------------------------------
select is(public.wallet_balance('00000000-0000-0000-0000-00000005b001', 'business_wallet'), 5154594::bigint,
  'before: Ada''s wallet holds hire 1''s fault refund');
set local role authenticated;
set local request.jwt.claims = '{"sub": "5b5b5b5b-0000-0000-0000-00000005b001"}'; -- Ada
select throws_ok($$ select public.withdraw_from_engagement('5b000000-0000-0000-0000-0000000e0004') $$,
  'P0001', 'no_such_engagement', 'the business cannot withdraw for the creator');
set local request.jwt.claims = '{"sub": "5b5b5b5b-0000-0000-0000-00000005b102"}'; -- creator 2
select throws_ok($$ select public.withdraw_from_engagement('5b000000-0000-0000-0000-0000000e0002') $$,
  'P0001', 'engagement_locked', 'a funded hire is cancelled, not withdrawn from');
set local request.jwt.claims = '{"sub": "5b5b5b5b-0000-0000-0000-00000005b104"}'; -- creator 4
select lives_ok($$ select public.withdraw_from_engagement('5b000000-0000-0000-0000-0000000e0004') $$,
  'creator 4 withdraws from work in progress');
select throws_ok($$ select public.withdraw_from_engagement('5b000000-0000-0000-0000-0000000e0004') $$,
  'P0001', 'engagement_locked', 'withdrawing twice is refused');
reset role;
select is((select array[status::text, settle_outcome, coalesce(cancel_reason, 'none')] from public.engagements
            where id = '5b000000-0000-0000-0000-0000000e0004'),
  array['refunded', 'refund_creator_fault', 'none'], 'hire 4 is refunded with the creator at fault');
select is((select array_agg(account || ':' || amount_kobo order by account) from public.ledger_entries
            where engagement_id = '5b000000-0000-0000-0000-0000000e0004' and event_type = 'hire_settled'),
  '{business_wallet:-5154594,escrow:5000000,platform_revenue:154594}'::text[],
  'the business gets ₦50,000 + ₦2,500 − ₦954.06 Paystack charge');
select is(public.wallet_balance('00000000-0000-0000-0000-00000005b001', 'business_wallet'), 10309188::bigint,
  'after: Ada''s wallet holds both fault refunds');
select ok((select bool_and(actor_user_id = '00000000-0000-0000-0000-00000005b104' and reason = 'creator_withdrew')
             from public.ledger_entries
            where engagement_id = '5b000000-0000-0000-0000-0000000e0004' and event_type = 'hire_settled'),
  'the settlement records the creator and why');

-- Past the review deadline (hires 5 and 6) ----------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "5b5b5b5b-0000-0000-0000-00000005b105"}'; -- creator 5
select lives_ok($$ select public.submit_work('5b000000-0000-0000-0000-0000000e0005', null, array['https://x.com/p/5'], null) $$,
  'creator 5 submits');
set local request.jwt.claims = '{"sub": "5b5b5b5b-0000-0000-0000-00000005b106"}'; -- creator 6
select lives_ok($$ select public.submit_work('5b000000-0000-0000-0000-0000000e0006', null, array['https://x.com/p/6'], null) $$,
  'creator 6 submits');
reset role;
update public.submissions set review_deadline_at = now() - interval '1 second'
 where engagement_id in ('5b000000-0000-0000-0000-0000000e0005', '5b000000-0000-0000-0000-0000000e0006');

set local role authenticated;
set local request.jwt.claims = '{"sub": "5b5b5b5b-0000-0000-0000-00000005b001"}'; -- Ada
select is((select public.deny_submission('5b000000-0000-0000-0000-0000000e0005', array['Too late now'])), 'review_closed',
  'a denial after the deadline is answered review_closed, not raised');
select is((select public.accept_submission('5b000000-0000-0000-0000-0000000e0006')), 'auto_released',
  'an accept after the deadline is answered auto_released');
reset role;
select is((select array_agg(status::text || ':' || settle_outcome order by id) from public.engagements
            where id in ('5b000000-0000-0000-0000-0000000e0005', '5b000000-0000-0000-0000-0000000e0006')),
  array['auto_released:release', 'auto_released:release'], 'both hires are auto-released in full');
select ok((select bool_and(status = 'auto_accepted' and decided_at = now() and decided_by is null and denial_reasons is null)
             from public.submissions
            where engagement_id in ('5b000000-0000-0000-0000-0000000e0005', '5b000000-0000-0000-0000-0000000e0006')),
  'both submissions are auto-accepted by nobody, and the late denial left no reasons');
select is(public.wallet_balance('00000000-0000-0000-0000-00000005b105', 'creator_wallet')
          + public.wallet_balance('00000000-0000-0000-0000-00000005b106', 'creator_wallet'), 9500000::bigint,
  'creators 5 and 6 get ₦47,500 each');
select ok((select bool_and(actor_user_id is null and reason = 'auto_released') from public.ledger_entries
            where engagement_id in ('5b000000-0000-0000-0000-0000000e0005', '5b000000-0000-0000-0000-0000000e0006')
              and event_type = 'hire_settled'),
  'the release is recorded as the system''s, not Ada''s');

-- Screenshots (hire 7) ------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "5b5b5b5b-0000-0000-0000-00000005b107"}'; -- creator 7
select throws_ok($$ select public.submit_work('5b000000-0000-0000-0000-0000000e0007', null, null,
                      array[(select other from files)]) $$,
  'P0001', 'not_your_file', 'another creator''s file is refused');
select throws_ok($$ select public.submit_work('5b000000-0000-0000-0000-0000000e0007', null, null,
                      array[(select one from files), gen_random_uuid()]) $$,
  'P0001', 'not_your_file', 'an unknown file is refused');
select throws_ok($$ select public.submit_work('5b000000-0000-0000-0000-0000000e0007', null, null,
                      array[(select one from files), (select one from files)]) $$,
  'P0001', 'proof_invalid', 'the same file twice is refused');
select throws_ok($$ select public.submit_work('5b000000-0000-0000-0000-0000000e0007', null, null,
                      array(select gen_random_uuid() from generate_series(1, 6))) $$,
  'P0001', 'proof_invalid', 'six screenshots are refused');
select lives_ok($$ select public.submit_work('5b000000-0000-0000-0000-0000000e0007', null, null,
                     array[(select one from files)]) $$,
  'a screenshot alone is proof');
reset role;
select ok((select f.submission_id = s.id from public.proof_files f
             join public.submissions s on s.engagement_id = '5b000000-0000-0000-0000-0000000e0007'
            where f.id = (select one from files)),
  'the screenshot is attached to the submission');
set local role authenticated;
set local request.jwt.claims = '{"sub": "5b5b5b5b-0000-0000-0000-00000005b001"}'; -- Ada
select is((select public.deny_submission('5b000000-0000-0000-0000-0000000e0007', array['Blurry screenshot'])), 'denied',
  'Ada denies hire 7');
set local request.jwt.claims = '{"sub": "5b5b5b5b-0000-0000-0000-00000005b107"}'; -- creator 7
select throws_ok($$ select public.submit_work('5b000000-0000-0000-0000-0000000e0007', null, null,
                      array[(select one from files)]) $$,
  'P0001', 'not_your_file', 'a file already attached to a round cannot be reused');

-- Reading -------------------------------------------------------------------------------------------------------
select is((select count(*)::integer from public.submissions where engagement_id = '5b000000-0000-0000-0000-0000000e0007'), 1,
  'the creator reads their submission');
select is((select count(*)::integer from public.proof_files where id in ((select one from files), (select two from files))), 2,
  'the creator reads their files, attached or not');
set local request.jwt.claims = '{"sub": "5b5b5b5b-0000-0000-0000-00000005b001"}'; -- Ada
select is((select count(*)::integer from public.submissions where engagement_id = '5b000000-0000-0000-0000-0000000e0007'), 1,
  'the business reads the submission');
select is((select count(*)::integer from public.proof_files where id in ((select one from files), (select two from files))), 1,
  'the business reads the attached file only');
set local request.jwt.claims = '{"sub": "5b5b5b5b-0000-0000-0000-00000005b003"}'; -- Efe
select is((select count(*)::integer from public.submissions where engagement_id::text like '5b000000-%'), 8,
  'an admin reads every submission');
select is((select count(*)::integer from public.proof_files where id in ((select one from files), (select two from files),
                                                                         (select other from files))), 3,
  'an admin reads every file');
set local request.jwt.claims = '{"sub": "5b5b5b5b-0000-0000-0000-00000005b002"}'; -- Bola
select is((select count(*)::integer from public.submissions where engagement_id::text like '5b000000-%'), 0,
  'another business reads no submissions');
select is((select count(*)::integer from public.proof_files where id in ((select one from files), (select two from files))), 0,
  'and no files');
set local request.jwt.claims = '{"sub": "5b5b5b5b-0000-0000-0000-00000005b108"}'; -- creator 8
select is((select count(*)::integer from public.proof_files where id in ((select one from files), (select two from files))), 0,
  'another creator reads none of creator 7''s files');

-- No direct writes ----------------------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "5b5b5b5b-0000-0000-0000-00000005b107"}'; -- creator 7
select throws_ok($$ insert into public.submissions (engagement_id, round, links, review_deadline_at)
                    values ('5b000000-0000-0000-0000-0000000e0007', 2, '{}', now()) $$,
  '42501', null, 'a signed-in person cannot insert a submission');
select throws_ok($$ update public.submissions set status = 'accepted' $$,
  '42501', null, 'or update one');
select throws_ok($$ delete from public.submissions $$,
  '42501', null, 'or delete one');
select throws_ok($$ insert into public.proof_files (owner_id, path, content_type, bytes)
                    values ('00000000-0000-0000-0000-00000005b107', 'c7/x.webp', 'image/webp', 1) $$,
  '42501', null, 'a signed-in person cannot insert a file row');
select throws_ok($$ update public.proof_files set submission_id = null $$,
  '42501', null, 'or update one');
select throws_ok($$ delete from public.proof_files $$,
  '42501', null, 'or delete one');
select throws_ok($$ select public.register_proof_file('00000000-0000-0000-0000-00000005b107', 'c7/y.webp', 'image/webp', 1) $$,
  '42501', null, 'a signed-in person cannot register a file');
reset role;
set local role anon;
select throws_ok($$ select count(*) from public.submissions $$, '42501', null, 'anon cannot read submissions');
select throws_ok($$ insert into public.proof_files (owner_id, path, content_type, bytes)
                    values ('00000000-0000-0000-0000-00000005b107', 'c7/z.webp', 'image/webp', 1) $$,
  '42501', null, 'anon cannot insert a file row');
select throws_ok($$ select public.submit_work('5b000000-0000-0000-0000-0000000e0007', null, array['https://x.com'], null) $$,
  '42501', null, 'anon cannot submit');
reset role;

select ok(not has_table_privilege('service_role', 'public.submissions', 'insert')
          and not has_table_privilege('service_role', 'public.submissions', 'update')
          and not has_table_privilege('service_role', 'public.submissions', 'delete')
          and not has_table_privilege('service_role', 'public.submissions', 'truncate')
          and has_table_privilege('service_role', 'public.submissions', 'select'),
  'the server reads submissions but cannot write them directly');
select ok(not has_table_privilege('service_role', 'public.proof_files', 'insert')
          and not has_table_privilege('service_role', 'public.proof_files', 'update')
          and not has_table_privilege('service_role', 'public.proof_files', 'delete')
          and not has_table_privilege('service_role', 'public.proof_files', 'truncate')
          and has_table_privilege('service_role', 'public.proof_files', 'select'),
  'the server reads proof files but cannot write them directly');
set local role service_role;
select throws_ok($$ delete from public.proof_files $$, '42501', null, 'a service-role delete of a file row is refused');
select isnt((select public.register_proof_file('00000000-0000-0000-0000-00000005b108', '00000000-0000-0000-0000-00000005b108/two.webp', 'image/webp', 1)),
  null, 'the server registers a file through the function');
reset role;

-- Function grants and the bucket ------------------------------------------------------------------------------
select ok(not has_function_privilege('authenticated', 'public.release_if_overdue(public.engagements)', 'execute')
          and not has_function_privilege('service_role', 'public.release_if_overdue(public.engagements)', 'execute')
          and not has_function_privilege('anon', 'public.release_if_overdue(public.engagements)', 'execute'),
  'release_if_overdue is internal: no role may call it');
select ok(has_function_privilege('authenticated', 'public.submit_work(uuid, text, text[], uuid[])', 'execute')
          and has_function_privilege('authenticated', 'public.accept_submission(uuid)', 'execute')
          and has_function_privilege('authenticated', 'public.deny_submission(uuid, text[])', 'execute')
          and has_function_privilege('authenticated', 'public.withdraw_from_engagement(uuid)', 'execute')
          and not has_function_privilege('anon', 'public.accept_submission(uuid)', 'execute')
          and not has_function_privilege('anon', 'public.deny_submission(uuid, text[])', 'execute')
          and not has_function_privilege('anon', 'public.withdraw_from_engagement(uuid)', 'execute'),
  'the four entry points are for signed-in people only');
select ok(has_function_privilege('service_role', 'public.register_proof_file(uuid, text, text, integer)', 'execute')
          and not has_function_privilege('authenticated', 'public.register_proof_file(uuid, text, text, integer)', 'execute')
          and not has_function_privilege('anon', 'public.register_proof_file(uuid, text, text, integer)', 'execute'),
  'only the server registers files');
select ok((select not public and file_size_limit = 5242880 and allowed_mime_types = array['image/webp']
             from storage.buckets where id = 'work-proof'),
  'the work-proof bucket is private, 5 MB, WebP only');

-- Totals ---------------------------------------------------------------------------------------------------------
select is((select count(*)::integer from (
  select group_id from public.ledger_entries group by group_id having sum(amount_kobo) <> 0) g), 0,
  'every group sums to zero');
select is((select count(*)::integer from (
  select engagement_id from public.ledger_entries
   where engagement_id::text like '5b000000-%' and event_type = 'hire_settled'
   group by engagement_id having count(distinct group_id) > 1) d), 0,
  'no hire has two settlement groups');

select * from finish();
rollback;
