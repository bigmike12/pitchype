-- Proves the rules from the create_disputes migration: either side opens a
-- dispute from denied, the business also from in_progress once the
-- non-delivery date has passed, never from submitted; one open dispute per
-- hire, and nothing else moves the hire while it is open; statements are
-- added by the two people and admins, only while open, and never changed;
-- only the opener withdraws, which puts the hire back where it was; an admin
-- decides with the Stage 6 outcomes and the same ledger amounts, once; the
-- business may accept during a dispute about denied work, which closes it;
-- only the two people and admins read disputes, and nobody writes directly.
-- Run with: supabase test db
begin;

create extension if not exists pgtap with schema extensions;

select plan(116);

-- Ada and Bola are businesses, Efe is an admin, creators d1101..d1108; Ada
-- hires creators 1 to 7.
insert into public.users (id, auth_user_id, email, role) values
  ('00000000-0000-0000-0000-0000000d1001', 'd1d1d1d1-0000-0000-0000-0000000d1001', 'ada.dispute@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000d1002', 'd1d1d1d1-0000-0000-0000-0000000d1002', 'bola.dispute@example.com', 'business'),
  ('00000000-0000-0000-0000-0000000d1003', 'd1d1d1d1-0000-0000-0000-0000000d1003', 'efe.dispute@example.com', 'admin');

insert into public.users (id, auth_user_id, email, role)
select ('00000000-0000-0000-0000-0000000d11' || lpad(n::text, 2, '0'))::uuid,
       ('d1d1d1d1-0000-0000-0000-0000000d11' || lpad(n::text, 2, '0'))::uuid,
       'c' || n || '.dispute@example.com', 'influencer'
  from generate_series(1, 8) n;

insert into public.business_profiles (user_id, business_name, contact_name, state, city) values
  ('00000000-0000-0000-0000-0000000d1001', 'Ada Dispute Kitchen', 'Ada Obi', 'Lagos', 'Ikeja'),
  ('00000000-0000-0000-0000-0000000d1002', 'Bola Dispute Shop', 'Bola A', 'Oyo', 'Ibadan');

-- Campaign A's posts are due today; campaign B's were due yesterday.
insert into public.campaigns (id, business_id, status, title, brief, price_kobo, places,
                              applications_close_on, deliver_by, published_at, submitted_at) values
  ('d1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000d1001', 'open', 'Disputes test A',
   'A brief that is long enough for the checks.', 5000000, 20, public.lagos_today(), public.lagos_today(), now(), now()),
  ('d1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000d1001', 'open', 'Disputes test B',
   'A brief that is long enough for the checks.', 5000000, 20, public.lagos_today() - 1, public.lagos_today() - 1, now(), now());

-- Hire n is creator n's, ₦50,000 each; hire 7 is on campaign B.
insert into public.applications (id, campaign_id, creator_id, status)
select ('d1000000-0000-0000-0000-0000000a00' || lpad(n::text, 2, '0'))::uuid,
       case when n = 7 then 'd1000000-0000-0000-0000-000000000002' else 'd1000000-0000-0000-0000-000000000001' end::uuid,
       ('00000000-0000-0000-0000-0000000d11' || lpad(n::text, 2, '0'))::uuid, 'approved'
  from generate_series(1, 7) n;

insert into public.engagements (id, application_id, campaign_id, business_id, creator_id, agreed_price_kobo, pay_by)
select ('d1000000-0000-0000-0000-0000000e00' || lpad(n::text, 2, '0'))::uuid,
       ('d1000000-0000-0000-0000-0000000a00' || lpad(n::text, 2, '0'))::uuid,
       case when n = 7 then 'd1000000-0000-0000-0000-000000000002' else 'd1000000-0000-0000-0000-000000000001' end::uuid,
       '00000000-0000-0000-0000-0000000d1001',
       ('00000000-0000-0000-0000-0000000d11' || lpad(n::text, 2, '0'))::uuid,
       5000000, now() + interval '48 hours'
  from generate_series(1, 7) n;

-- Fund every hire by card (Paystack's charge ₦954.06 on ₦52,500) and start
-- the work. Creators 1, 3, 4, 5 and 6 submit and Ada denies.
do $$
declare
  n integer;
  started jsonb;
  hire uuid;
begin
  for n in 1..7 loop
    hire := ('d1000000-0000-0000-0000-0000000e00' || lpad(n::text, 2, '0'))::uuid;
    perform set_config('request.jwt.claims', '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1001"}', true);
    started := public.start_payment(hire, true);
    perform public.record_card_payment(started ->> 'reference', (started ->> 'card_amount_kobo')::bigint,
      95406, 'evt-dispute-' || n, '{}');
    perform set_config('request.jwt.claims', json_build_object('sub',
      'd1d1d1d1-0000-0000-0000-0000000d11' || lpad(n::text, 2, '0'))::text, true);
    perform public.start_engagement(hire);
    if n in (1, 3, 4, 5, 6) then
      perform public.submit_work(hire, null, array['https://x.com/p/' || n], null);
      perform set_config('request.jwt.claims', '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1001"}', true);
      perform public.deny_submission(hire, array['Wrong hashtag']);
    end if;
  end loop;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

select is((select array_agg(status::text order by id) from public.engagements
            where id::text like 'd1000000-0000-0000-0000-0000000e00%'),
  array['denied', 'in_progress', 'denied', 'denied', 'denied', 'denied', 'in_progress'],
  'hires 2 and 7 are in progress, the rest denied');

-- Screenshots registered by the server: creator 3 owns the first two, creator 8 the third.
create temporary table files on commit drop as
select public.register_proof_file('00000000-0000-0000-0000-0000000d1103', '00000000-0000-0000-0000-0000000d1103/one.webp', 'image/webp', 120000) as one,
       public.register_proof_file('00000000-0000-0000-0000-0000000d1103', '00000000-0000-0000-0000-0000000d1103/two.webp', 'image/webp', 90000) as two,
       public.register_proof_file('00000000-0000-0000-0000-0000000d1108', '00000000-0000-0000-0000-0000000d1108/one.webp', 'image/webp', 80000) as other;
grant select on files to authenticated;

-- Dispute ids by hire, read past row level security so a stranger's call
-- names a real dispute.
create temporary view dids as
select right(engagement_id::text, 2)::integer as hire, id, status
  from public.disputes where engagement_id::text like 'd1000000-%';
grant select on dids to authenticated;

-- Opening: who, and from where --------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1102"}'; -- creator 2
select throws_ok($$ select public.open_dispute('d1000000-0000-0000-0000-0000000e0002', 'The business is not answering me.', null, null) $$,
  'P0001', 'not_allowed', 'a creator cannot dispute work in progress');
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1001"}'; -- Ada
select throws_ok($$ select public.open_dispute('d1000000-0000-0000-0000-0000000e0002', 'Nothing has been posted at all.', null, null) $$,
  'P0001', 'dispute_not_allowed_yet', 'the business cannot dispute work just started');
reset role;
update public.engagements set started_at = now() - interval '8 days' where id = 'd1000000-0000-0000-0000-0000000e0002';
set local role authenticated;
select throws_ok($$ select public.open_dispute('d1000000-0000-0000-0000-0000000e0002', 'Nothing has been posted at all.', null, null) $$,
  'P0001', 'dispute_not_allowed_yet', 'a week since starting is not enough while the deliver-by day is not over');
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1002"}'; -- Bola
select throws_ok($$ select public.open_dispute('d1000000-0000-0000-0000-0000000e0001', 'Nothing has been posted at all.', null, null) $$,
  'P0001', 'no_such_engagement', 'another business cannot dispute Ada''s hire');
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1003"}'; -- Efe
select throws_ok($$ select public.open_dispute('d1000000-0000-0000-0000-0000000e0001', 'Nothing has been posted at all.', null, null) $$,
  'P0001', 'no_such_engagement', 'an admin does not open disputes');

-- No dispute from submitted (hire 2)
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1102"}'; -- creator 2
select lives_ok($$ select public.submit_work('d1000000-0000-0000-0000-0000000e0002', null, array['https://x.com/p/2'], null) $$,
  'creator 2 submits');
select throws_ok($$ select public.open_dispute('d1000000-0000-0000-0000-0000000e0002', 'Please look at this before they deny.', null, null) $$,
  'P0001', 'engagement_locked', 'the creator cannot dispute work under review');
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1001"}'; -- Ada
select throws_ok($$ select public.open_dispute('d1000000-0000-0000-0000-0000000e0002', 'The work does not match the brief.', null, null) $$,
  'P0001', 'engagement_locked', 'the business denies first, it cannot dispute submitted work');

-- Non-delivery (hire 7: posts were due yesterday)
reset role;
update public.engagements set started_at = now() - interval '2 days' where id = 'd1000000-0000-0000-0000-0000000e0007';
set local role authenticated;
select throws_ok($$ select public.open_dispute('d1000000-0000-0000-0000-0000000e0007', 'Nothing has been posted at all.', null, null) $$,
  'P0001', 'dispute_not_allowed_yet', 'a creator who started 2 days ago still has a week');
reset role;
update public.engagements set started_at = now() - interval '7 days' where id = 'd1000000-0000-0000-0000-0000000e0007';
set local role authenticated;
select throws_ok($$ select public.open_dispute('d1000000-0000-0000-0000-0000000e0007', 'Nothing has been posted at all.', null, null) $$,
  'P0001', 'dispute_not_allowed_yet', 'exactly a week is not past it');
reset role;
update public.engagements set started_at = now() - interval '8 days' where id = 'd1000000-0000-0000-0000-0000000e0007';
set local role authenticated;
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1107"}'; -- creator 7
select throws_ok($$ select public.open_dispute('d1000000-0000-0000-0000-0000000e0007', 'I would like an admin to look at this.', null, null) $$,
  'P0001', 'not_allowed', 'the creator cannot open a non-delivery dispute');
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1001"}'; -- Ada
select lives_ok($$ select public.open_dispute('d1000000-0000-0000-0000-0000000e0007', '  Nothing has been posted at all.  ', null, null) $$,
  'Ada opens a non-delivery dispute past both dates');
reset role;
select ok((select g.status = 'disputed' and d.opened_from = 'in_progress' and d.status = 'open'
                  and d.opened_by = '00000000-0000-0000-0000-0000000d1001' and d.opened_at = now()
                  and d.reason = 'Nothing has been posted at all.'
             from public.disputes d join public.engagements g on g.id = d.engagement_id
            where d.engagement_id = 'd1000000-0000-0000-0000-0000000e0007'),
  'hire 7 is disputed from in_progress, with the trimmed reason');
set local role authenticated;
select throws_ok($$ select public.accept_submission('d1000000-0000-0000-0000-0000000e0007') $$,
  'P0001', 'engagement_locked', 'nothing was submitted, so there is nothing to accept');
select lives_ok($$ select public.withdraw_dispute((select id from dids where hire = 7)) $$,
  'Ada withdraws her dispute');
reset role;
select ok((select g.status = 'in_progress' and d.status = 'withdrawn' and d.closed_at = now()
                  and d.closed_by = '00000000-0000-0000-0000-0000000d1001' and d.outcome is null
             from public.disputes d join public.engagements g on g.id = d.engagement_id
            where d.engagement_id = 'd1000000-0000-0000-0000-0000000e0007'),
  'hire 7 is back in progress and the dispute is withdrawn by Ada');
select is((select count(*)::integer from public.ledger_entries
            where engagement_id = 'd1000000-0000-0000-0000-0000000e0007' and event_type = 'hire_settled'), 0,
  'opening and withdrawing moved no money');

-- The reason and the proof (hire 3) -------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1103"}'; -- creator 3
select throws_ok($$ select public.open_dispute('d1000000-0000-0000-0000-0000000e0003', repeat('r', 19), null, null) $$,
  'P0001', 'dispute_reason_invalid', 'a 19-character reason is refused');
select throws_ok($$ select public.open_dispute('d1000000-0000-0000-0000-0000000e0003', '   ' || repeat('r', 19) || '   ', null, null) $$,
  'P0001', 'dispute_reason_invalid', 'the reason is measured after trimming');
select throws_ok($$ select public.open_dispute('d1000000-0000-0000-0000-0000000e0003', repeat('r', 2001), null, null) $$,
  'P0001', 'dispute_reason_invalid', 'a reason over 2,000 characters is refused');
select throws_ok($$ select public.open_dispute('d1000000-0000-0000-0000-0000000e0003', null, null, null) $$,
  'P0001', 'dispute_reason_invalid', 'a missing reason is refused');
select throws_ok($$ select public.open_dispute('d1000000-0000-0000-0000-0000000e0003', 'The posts match the brief exactly.',
                      array['ftp://x.com/p/3'], null) $$,
  'P0001', 'proof_invalid', 'a link must be http or https');
select throws_ok($$ select public.open_dispute('d1000000-0000-0000-0000-0000000e0003', 'The posts match the brief exactly.',
                      null, array[(select other from files)]) $$,
  'P0001', 'not_your_file', 'another creator''s file is refused');
select is((select count(*)::integer from public.disputes where engagement_id = 'd1000000-0000-0000-0000-0000000e0003'), 0,
  'refused openings wrote nothing');
select lives_ok($$ select public.open_dispute('d1000000-0000-0000-0000-0000000e0003', ' The posts match the brief exactly. ',
                     array[' https://instagram.com/p/c3 '], array[(select one from files)]) $$,
  'creator 3 opens a dispute with a link and a screenshot');
reset role;
select ok((select g.status = 'disputed' and d.opened_from = 'denied' and d.opened_by = '00000000-0000-0000-0000-0000000d1103'
                  and d.reason = 'The posts match the brief exactly.'
             from public.disputes d join public.engagements g on g.id = d.engagement_id
            where d.engagement_id = 'd1000000-0000-0000-0000-0000000e0003'),
  'hire 3 is disputed from denied by creator 3');
select is((select array[t.author_id::text, t.body, t.links::text] from public.dispute_statements t
            where t.dispute_id = (select id from dids where hire = 3)),
  array['00000000-0000-0000-0000-0000000d1103', 'The posts match the brief exactly.', '{https://instagram.com/p/c3}'],
  'the opening is the first statement: the reason with the trimmed link');
select ok((select f.dispute_statement_id = t.id and f.submission_id is null
             from public.proof_files f join public.dispute_statements t on t.dispute_id = (select id from dids where hire = 3)
            where f.id = (select one from files)),
  'the screenshot hangs off the opening statement');
select is((select status from public.submissions where engagement_id = 'd1000000-0000-0000-0000-0000000e0003'),
  'denied', 'the denied submission is left as it was');

-- While a dispute is open, nothing else moves the hire --------------------------------------------------
set local role authenticated;
select throws_ok($$ select public.open_dispute('d1000000-0000-0000-0000-0000000e0003', 'The posts match the brief exactly.', null, null) $$,
  'P0001', 'dispute_open', 'a second dispute is refused');
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1001"}'; -- Ada
select throws_ok($$ select public.open_dispute('d1000000-0000-0000-0000-0000000e0003', 'The hashtag is still wrong here.', null, null) $$,
  'P0001', 'dispute_open', 'the other side cannot open a second one either');
select throws_ok($$ select public.deny_submission('d1000000-0000-0000-0000-0000000e0003', array['Still wrong']) $$,
  'P0001', 'engagement_locked', 'the business cannot deny during a dispute');
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1103"}'; -- creator 3
select throws_ok($$ select public.submit_work('d1000000-0000-0000-0000-0000000e0003', null, array['https://x.com/p/3b'], null) $$,
  'P0001', 'engagement_locked', 'the creator cannot resubmit during a dispute');
select throws_ok($$ select public.withdraw_from_engagement('d1000000-0000-0000-0000-0000000e0003') $$,
  'P0001', 'engagement_locked', 'the creator cannot walk away during a dispute');
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1003"}'; -- Efe
select throws_ok($$ select public.settle_engagement('d1000000-0000-0000-0000-0000000e0003', 'release', null, 'Looks fine') $$,
  'P0001', 'engagement_locked', 'the Stage 6 escrow tool cannot settle a disputed hire');
reset role;
select is((select count(*)::integer from public.ledger_entries
            where engagement_id = 'd1000000-0000-0000-0000-0000000e0003' and event_type = 'hire_settled'), 0,
  'and nothing settled');

-- Statements (hire 3) --------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1001"}'; -- Ada
select lives_ok($$ select public.add_dispute_statement((select id from dids where hire = 3 and status = 'open'),
                     ' The hashtag is still wrong. ', array['https://instagram.com/p/c3'], null) $$,
  'Ada adds a statement');
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1003"}'; -- Efe
select lives_ok($$ select public.add_dispute_statement((select id from dids where hire = 3 and status = 'open'),
                     'Can you both send the dates of the posts?', null, null) $$,
  'an admin adds a question');
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1103"}'; -- creator 3
select lives_ok($$ select public.add_dispute_statement((select id from dids where hire = 3 and status = 'open'),
                     'Posted on Monday.', null, array[(select two from files)]) $$,
  'creator 3 answers with a screenshot');
select throws_ok($$ select public.add_dispute_statement((select id from dids where hire = 3 and status = 'open'), '   ', null, null) $$,
  'P0001', 'statement_invalid', 'an empty statement is refused');
select throws_ok($$ select public.add_dispute_statement((select id from dids where hire = 3 and status = 'open'), repeat('s', 2001), null, null) $$,
  'P0001', 'statement_invalid', 'a statement over 2,000 characters is refused');
select throws_ok($$ select public.add_dispute_statement((select id from dids where hire = 3 and status = 'open'), 'Again.',
                      null, array[(select one from files)]) $$,
  'P0001', 'not_your_file', 'a file already attached cannot be reused');
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1002"}'; -- Bola
select throws_ok($$ select public.add_dispute_statement((select id from dids where hire = 3 and status = 'open'), 'Hello there.', null, null) $$,
  'P0001', 'no_such_dispute', 'another business cannot add a statement');
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1108"}'; -- creator 8
select throws_ok($$ select public.add_dispute_statement((select id from dids where hire = 3 and status = 'open'), 'Hello there.', null, null) $$,
  'P0001', 'no_such_dispute', 'another creator cannot add a statement');
select throws_ok($$ select public.add_dispute_statement(gen_random_uuid(), 'Hello there.', null, null) $$,
  'P0001', 'no_such_dispute', 'an unknown dispute is refused');
reset role;
-- One test transaction gives every row the same created_at, so compare as a set.
select is((select array_agg(body || ' by ' || author_id::text order by body) from public.dispute_statements
            where dispute_id = (select id from dids where hire = 3)),
  array['Can you both send the dates of the posts? by 00000000-0000-0000-0000-0000000d1003',
        'Posted on Monday. by 00000000-0000-0000-0000-0000000d1103',
        'The hashtag is still wrong. by 00000000-0000-0000-0000-0000000d1001',
        'The posts match the brief exactly. by 00000000-0000-0000-0000-0000000d1103'],
  'four statements from the three of them, trimmed');
select ok((select f.dispute_statement_id = t.id from public.proof_files f
             join public.dispute_statements t on t.body = 'Posted on Monday.'
            where f.id = (select two from files)),
  'creator 3''s second screenshot hangs off their answer');
select throws_ok($$ update public.dispute_statements set body = 'Changed.' $$,
  'P0001', 'dispute_statements_append_only', 'statements cannot be changed, even by the table owner');
select throws_ok($$ delete from public.dispute_statements $$,
  'P0001', 'dispute_statements_append_only', 'or deleted');
select throws_ok($$ truncate public.dispute_statements, public.proof_files $$,
  'P0001', 'dispute_statements_append_only', 'or truncated');

-- Withdrawing (hire 3) ----------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1001"}'; -- Ada
select throws_ok($$ select public.withdraw_dispute((select id from dids where hire = 3 and status = 'open')) $$,
  'P0001', 'not_allowed', 'only the opener can withdraw');
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1003"}'; -- Efe
select throws_ok($$ select public.withdraw_dispute((select id from dids where hire = 3 and status = 'open')) $$,
  'P0001', 'not_allowed', 'an admin decides, it does not withdraw');
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1002"}'; -- Bola
select throws_ok($$ select public.withdraw_dispute((select id from dids where hire = 3 and status = 'open')) $$,
  'P0001', 'no_such_dispute', 'a stranger cannot see the dispute');
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1103"}'; -- creator 3
select lives_ok($$ select public.withdraw_dispute((select id from dids where hire = 3 and status = 'open')) $$,
  'creator 3 withdraws the dispute');
select throws_ok($$ select public.withdraw_dispute((select id from dids where hire = 3)) $$,
  'P0001', 'dispute_closed', 'withdrawing twice is refused');
select throws_ok($$ select public.add_dispute_statement((select id from dids where hire = 3), 'One more thing.', null, null) $$,
  'P0001', 'dispute_closed', 'no statements after it is closed');
reset role;
select ok((select g.status = 'denied' and d.status = 'withdrawn' and d.closed_by = '00000000-0000-0000-0000-0000000d1103'
             from public.disputes d join public.engagements g on g.id = d.engagement_id
            where d.engagement_id = 'd1000000-0000-0000-0000-0000000e0003'),
  'hire 3 is back to denied');
set local role authenticated;
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1003"}'; -- Efe
select throws_ok($$ select public.decide_dispute((select id from dids where hire = 3), 'release', null, 'Too late') $$,
  'P0001', 'dispute_closed', 'a withdrawn dispute cannot be decided');

-- Deciding (hires 3 to 6) ----------------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1001"}'; -- Ada
select lives_ok($$ select public.open_dispute('d1000000-0000-0000-0000-0000000e0003', 'The hashtag is still wrong on both posts.', null, null) $$,
  'Ada opens a new dispute on hire 3 after the first was withdrawn');
reset role;
select is((select count(*)::integer from public.disputes where engagement_id = 'd1000000-0000-0000-0000-0000000e0003'), 2,
  'hire 3 has had two disputes, one open');

do $$
declare
  n integer;
begin
  for n in 4..6 loop
    perform set_config('request.jwt.claims', json_build_object('sub',
      'd1d1d1d1-0000-0000-0000-0000000d11' || lpad(n::text, 2, '0'))::text, true);
    perform public.open_dispute(('d1000000-0000-0000-0000-0000000e00' || lpad(n::text, 2, '0'))::uuid,
      'The posts match the brief exactly.', null, null);
  end loop;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

set local role authenticated;
select throws_ok($$ select public.decide_dispute((select id from dids where hire = 3 and status = 'open'), 'refund', null, 'Mine') $$,
  'P0001', 'not_allowed', 'the business cannot decide');
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1104"}'; -- creator 4
select throws_ok($$ select public.decide_dispute((select id from dids where hire = 4), 'release', null, 'Mine') $$,
  'P0001', 'not_allowed', 'the creator cannot decide');
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1003"}'; -- Efe
select throws_ok($$ select public.decide_dispute(gen_random_uuid(), 'release', null, 'Fine') $$,
  'P0001', 'no_such_dispute', 'an unknown dispute is refused');
select throws_ok($$ select public.decide_dispute((select id from dids where hire = 3 and status = 'open'), 'accepted_by_business', null, 'Fine') $$,
  '22023', 'invalid_outcome', 'an admin cannot decide as the business');
select throws_ok($$ select public.decide_dispute((select id from dids where hire = 3 and status = 'open'), 'release', null, '   ') $$,
  'P0001', 'settle_reason_required', 'a decision needs a reason');
select throws_ok($$ select public.decide_dispute((select id from dids where hire = 5), 'split', 100050, 'Half done') $$,
  'P0001', 'release_invalid', 'a split must be whole naira');
select lives_ok($$ select public.decide_dispute((select id from dids where hire = 3 and status = 'open'), 'release', null, '  The work met the brief.  ') $$,
  'Efe releases hire 3');
select lives_ok($$ select public.decide_dispute((select id from dids where hire = 4), 'refund', null, 'Posts went up after the deadline') $$,
  'Efe refunds hire 4');
select lives_ok($$ select public.decide_dispute((select id from dids where hire = 5), 'split', 2000000, 'Partly delivered') $$,
  'Efe splits hire 5: ₦20,000 to the creator');
select lives_ok($$ select public.decide_dispute((select id from dids where hire = 6), 'refund_creator_fault', null, 'Off the brief') $$,
  'Efe refunds hire 6 with the creator at fault');
select throws_ok($$ select public.decide_dispute((select id from dids where hire = 3 and status = 'decided'), 'refund', null, 'Again') $$,
  'P0001', 'dispute_closed', 'deciding twice is refused');
select throws_ok($$ select public.decide_dispute((select id from dids where hire = 4), 'release', null, 'Changed my mind') $$,
  'P0001', 'dispute_closed', 'a decided dispute cannot be turned around');
reset role;

select is((select array_agg(status::text || ':' || settle_outcome order by id) from public.engagements
            where id in ('d1000000-0000-0000-0000-0000000e0003', 'd1000000-0000-0000-0000-0000000e0004',
                         'd1000000-0000-0000-0000-0000000e0005', 'd1000000-0000-0000-0000-0000000e0006')),
  array['accepted:release', 'refunded:refund', 'accepted:split', 'refunded:refund_creator_fault'],
  'each hire ends as the decision says');
select is((select array_agg(account || ':' || amount_kobo order by account) from public.ledger_entries
            where engagement_id = 'd1000000-0000-0000-0000-0000000e0003' and event_type = 'hire_settled'),
  '{creator_wallet:-4750000,escrow:5000000,platform_revenue:-250000}'::text[],
  'release: the creator gets ₦47,500, the creator fee is ₦2,500');
select is((select array_agg(account || ':' || amount_kobo order by account) from public.ledger_entries
            where engagement_id = 'd1000000-0000-0000-0000-0000000e0004' and event_type = 'hire_settled'),
  '{business_wallet:-5000000,escrow:5000000}'::text[], 'refund: the business wallet gets ₦50,000');
select is((select array_agg(account || ':' || amount_kobo order by account) from public.ledger_entries
            where engagement_id = 'd1000000-0000-0000-0000-0000000e0005' and event_type = 'hire_settled'),
  '{business_wallet:-3000000,creator_wallet:-1900000,escrow:5000000,platform_revenue:-100000}'::text[],
  'split: creator fee 5% of ₦20,000, creator ₦19,000, business ₦30,000');
select is((select array_agg(account || ':' || amount_kobo order by account) from public.ledger_entries
            where engagement_id = 'd1000000-0000-0000-0000-0000000e0006' and event_type = 'hire_settled'),
  '{business_wallet:-5154594,escrow:5000000,platform_revenue:154594}'::text[],
  'creator at fault: the business gets ₦50,000 + ₦2,500 − ₦954.06 Paystack charge');
select is((select array_agg(right(engagement_id::text, 1) || ':' || outcome order by engagement_id) from public.disputes
            where engagement_id::text like 'd1000000-%' and status = 'decided'),
  array['3:release', '4:refund', '5:split', '6:refund_creator_fault'], 'each dispute is decided with its outcome');
select ok((select bool_and(closed_by = '00000000-0000-0000-0000-0000000d1003' and closed_at = now())
             from public.disputes where engagement_id::text like 'd1000000-%' and status = 'decided'),
  'closed by Efe, now');
select is((select decision_reason from public.disputes
            where engagement_id = 'd1000000-0000-0000-0000-0000000e0003' and status = 'decided'),
  'The work met the brief.', 'the decision reason is stored trimmed');
select ok((select bool_and(actor_user_id = '00000000-0000-0000-0000-0000000d1003' and reason = 'The work met the brief.')
             from public.ledger_entries
            where engagement_id = 'd1000000-0000-0000-0000-0000000e0003' and event_type = 'hire_settled'),
  'the settlement records Efe and the reason');
select is((select count(*)::integer from public.ledger_entries
            where engagement_id = 'd1000000-0000-0000-0000-0000000e0004'), 7,
  'the second decide wrote nothing (5 funding rows + 2 settlement rows)');
select is(public.wallet_balance('00000000-0000-0000-0000-0000000d1103', 'creator_wallet'), 4750000::bigint,
  'creator 3''s wallet holds ₦47,500');

-- The business accepts during a dispute (hire 1) ---------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1101"}'; -- creator 1
select lives_ok($$ select public.open_dispute('d1000000-0000-0000-0000-0000000e0001', 'The hashtag was in the caption all along.', null, null) $$,
  'creator 1 opens a dispute');
select throws_ok($$ select public.accept_submission('d1000000-0000-0000-0000-0000000e0001') $$,
  'P0001', 'no_such_engagement', 'the creator cannot accept their own work');
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1001"}'; -- Ada
select is((select public.accept_submission('d1000000-0000-0000-0000-0000000e0001')), 'accepted',
  'Ada accepts the denied work during the dispute');
select throws_ok($$ select public.accept_submission('d1000000-0000-0000-0000-0000000e0001') $$,
  'P0001', 'engagement_locked', 'accepting twice is refused');
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1003"}'; -- Efe
select throws_ok($$ select public.decide_dispute((select id from dids where hire = 1), 'refund', null, 'Too late') $$,
  'P0001', 'dispute_closed', 'the admin cannot decide a dispute the business ended');
reset role;
select is((select array[status::text, settle_outcome] from public.engagements
            where id = 'd1000000-0000-0000-0000-0000000e0001'), array['accepted', 'release'],
  'hire 1 is released in full');
select is(public.wallet_balance('00000000-0000-0000-0000-0000000d1101', 'creator_wallet'), 4750000::bigint,
  'creator 1 gets ₦47,500');
select ok((select status = 'decided' and outcome = 'accepted_by_business' and decision_reason is null
                  and closed_by = '00000000-0000-0000-0000-0000000d1001' and closed_at = now()
             from public.disputes where engagement_id = 'd1000000-0000-0000-0000-0000000e0001'),
  'the dispute is decided as accepted by the business, closed by Ada');
select ok((select status = 'accepted' and decided_by = '00000000-0000-0000-0000-0000000d1001' and decided_at = now()
                  and denial_reasons = array['Wrong hashtag']
             from public.submissions where engagement_id = 'd1000000-0000-0000-0000-0000000e0001'),
  'the denied submission is now accepted by Ada, and keeps its denial reasons');
select ok((select bool_and(actor_user_id = '00000000-0000-0000-0000-0000000d1001' and reason = 'accepted')
             from public.ledger_entries
            where engagement_id = 'd1000000-0000-0000-0000-0000000e0001' and event_type = 'hire_settled'),
  'the release records Ada as the actor');

-- Reading -------------------------------------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1103"}'; -- creator 3
select is((select count(*)::integer from public.disputes where engagement_id = 'd1000000-0000-0000-0000-0000000e0003'), 2,
  'the creator reads the disputes on their hire');
select is((select count(*)::integer from public.dispute_statements t join dids on dids.id = t.dispute_id where dids.hire = 3), 5,
  'and every statement on them');
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1001"}'; -- Ada
select is((select count(*)::integer from public.disputes where engagement_id::text like 'd1000000-%'), 7,
  'the business reads the disputes on its hires');
select is((select count(*)::integer from public.proof_files where id in ((select one from files), (select two from files))), 2,
  'and the creator''s screenshots on the statements');
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1003"}'; -- Efe
select is((select count(*)::integer from public.dispute_statements t join dids on dids.id = t.dispute_id), 10,
  'an admin reads every statement');
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1002"}'; -- Bola
select is((select count(*)::integer from public.disputes where engagement_id::text like 'd1000000-%'), 0,
  'another business reads no disputes');
select is((select count(*)::integer from public.dispute_statements t join dids on dids.id = t.dispute_id), 0,
  'and no statements');
select is((select count(*)::integer from public.proof_files where id in ((select one from files), (select two from files))), 0,
  'and no screenshots');
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1104"}'; -- creator 4
select is((select count(*)::integer from public.disputes where engagement_id = 'd1000000-0000-0000-0000-0000000e0003'), 0,
  'another creator of the same business reads none of hire 3''s disputes');
select is((select count(*)::integer from public.dispute_statements t join dids on dids.id = t.dispute_id where dids.hire = 3), 0,
  'nor its statements');

-- No direct writes ----------------------------------------------------------------------------------------------
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1102"}'; -- creator 2
select throws_ok($$ insert into public.disputes (engagement_id, opened_by, opened_from, reason)
                    values ('d1000000-0000-0000-0000-0000000e0002', '00000000-0000-0000-0000-0000000d1102',
                            'denied', 'The business is not answering me.') $$,
  '42501', null, 'a signed-in person cannot insert a dispute');
set local request.jwt.claims = '{"sub": "d1d1d1d1-0000-0000-0000-0000000d1103"}'; -- creator 3
select throws_ok($$ update public.disputes set status = 'withdrawn' $$, '42501', null, 'or update one');
select throws_ok($$ insert into public.dispute_statements (dispute_id, author_id, body)
                    values ((select id from dids where hire = 3 and status = 'decided'),
                            '00000000-0000-0000-0000-0000000d1103', 'Sneaky.') $$,
  '42501', null, 'or insert a statement');
select throws_ok($$ delete from public.dispute_statements $$, '42501', null, 'or delete one');
reset role;
set local role anon;
select throws_ok($$ select count(*) from public.disputes $$, '42501', null, 'anon cannot read disputes');
select throws_ok($$ select public.open_dispute('d1000000-0000-0000-0000-0000000e0002', 'The business is not answering me.', null, null) $$,
  '42501', null, 'anon cannot open a dispute');
reset role;

select ok(not has_table_privilege('service_role', 'public.disputes', 'insert')
          and not has_table_privilege('service_role', 'public.disputes', 'update')
          and not has_table_privilege('service_role', 'public.disputes', 'delete')
          and not has_table_privilege('service_role', 'public.disputes', 'truncate')
          and has_table_privilege('service_role', 'public.disputes', 'select'),
  'the server reads disputes but cannot write them directly');
select ok(not has_table_privilege('service_role', 'public.dispute_statements', 'insert')
          and not has_table_privilege('service_role', 'public.dispute_statements', 'update')
          and not has_table_privilege('service_role', 'public.dispute_statements', 'delete')
          and not has_table_privilege('service_role', 'public.dispute_statements', 'truncate')
          and has_table_privilege('service_role', 'public.dispute_statements', 'select'),
  'the server reads statements but cannot write them directly');
select ok(has_function_privilege('authenticated', 'public.open_dispute(uuid, text, text[], uuid[])', 'execute')
          and has_function_privilege('authenticated', 'public.add_dispute_statement(uuid, text, text[], uuid[])', 'execute')
          and has_function_privilege('authenticated', 'public.withdraw_dispute(uuid)', 'execute')
          and has_function_privilege('authenticated', 'public.decide_dispute(uuid, text, bigint, text)', 'execute')
          and not has_function_privilege('anon', 'public.open_dispute(uuid, text, text[], uuid[])', 'execute')
          and not has_function_privilege('anon', 'public.add_dispute_statement(uuid, text, text[], uuid[])', 'execute')
          and not has_function_privilege('anon', 'public.withdraw_dispute(uuid)', 'execute')
          and not has_function_privilege('anon', 'public.decide_dispute(uuid, text, bigint, text)', 'execute'),
  'the four entry points are for signed-in people only');
select ok(not has_function_privilege('authenticated', 'public.write_dispute_statement(uuid, uuid, text, text[], uuid[])', 'execute')
          and not has_function_privilege('service_role', 'public.write_dispute_statement(uuid, uuid, text, text[], uuid[])', 'execute')
          and not has_function_privilege('authenticated', 'public.non_delivery_dispute_at(public.engagements)', 'execute')
          and not has_function_privilege('service_role', 'public.non_delivery_dispute_at(public.engagements)', 'execute'),
  'the helpers are internal');

-- Totals ---------------------------------------------------------------------------------------------------------
select is((select count(*)::integer from (
  select group_id from public.ledger_entries group by group_id having sum(amount_kobo) <> 0) g), 0,
  'every group sums to zero');
select is((select count(*)::integer from (
  select engagement_id from public.ledger_entries
   where engagement_id::text like 'd1000000-%' and event_type = 'hire_settled'
   group by engagement_id having count(distinct group_id) > 1) d), 0,
  'no hire has two settlement groups');

select * from finish();
rollback;
