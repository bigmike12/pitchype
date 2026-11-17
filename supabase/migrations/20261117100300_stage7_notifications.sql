-- In-app notifications for Stage 7 (CLAUDE.md §8): a submission, a denial, a
-- dispute opened, a statement, a withdrawal, and who hears about a
-- settlement. Same rules as the earlier notification migrations: rows are
-- written only by triggers on the tables where things happen, and nobody is
-- told about their own action. Email is Stage 8.
--
--   work_submitted     to the business  a submission is made
--   submission_denied  to the creator   denied, with the reasons and the rounds left
--   dispute_opened     to the other person
--   dispute_statement  to the other person; an admin's goes to both. The opening
--                      statement open_dispute() writes is not announced:
--                      dispute_opened covers it.
--   dispute_withdrawn  to the other person
--   engagement_settled to everyone but the person who settled it (below)
--
-- A dispute's decision is announced by engagement_settled (the admin decided,
-- so both people hear); there is no separate "dispute decided" kind.
--
-- The kinds themselves are in 20261117100050 (a new enum value can't be used
-- in the transaction that adds it).

-- A submission is made or denied ---------------------------------------------------------------------------------
create function public.submissions_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  hire public.engagements;
  facts jsonb;
begin
  select * into hire from public.engagements g where g.id = new.engagement_id;
  select jsonb_build_object('campaign_id', k.id, 'campaign_title', k.title, 'engagement_id', hire.id)
    into facts
    from public.campaigns k where k.id = hire.campaign_id;

  if tg_op = 'INSERT' then
    -- The creator submitted, so only the business hears.
    perform public.notify(hire.business_id, 'work_submitted',
      facts || jsonb_build_object(
        'name', public.display_name_of(hire.creator_id),
        'round', new.round,
        'review_deadline_at', new.review_deadline_at));
  elsif new.status = 'denied' and old.status is distinct from 'denied' then
    -- The business denied, so only the creator hears. Rounds are 1-4: three resubmissions.
    perform public.notify(hire.creator_id, 'submission_denied',
      facts || jsonb_build_object(
        'name', public.display_name_of(hire.business_id),
        'reasons', to_jsonb(new.denial_reasons),
        'rounds_left', 4 - new.round));
  end if;
  return null;
end;
$$;

create trigger submissions_notify_insert
  after insert on public.submissions
  for each row execute function public.submissions_notify();
create trigger submissions_notify_denied
  after update of status on public.submissions
  for each row when (new.status = 'denied' and old.status is distinct from 'denied')
  execute function public.submissions_notify();

-- A dispute is opened or withdrawn --------------------------------------------------------------------------------
create function public.disputes_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  hire public.engagements;
  facts jsonb;
  other uuid;
begin
  select * into hire from public.engagements g where g.id = new.engagement_id;
  -- Only the opener can withdraw, so the other person is the same either way.
  other := case when new.opened_by = hire.business_id then hire.creator_id else hire.business_id end;
  select jsonb_build_object('campaign_id', k.id, 'campaign_title', k.title,
                            'engagement_id', hire.id, 'dispute_id', new.id,
                            'name', public.display_name_of(new.opened_by))
    into facts
    from public.campaigns k where k.id = hire.campaign_id;

  if tg_op = 'INSERT' then
    perform public.notify(other, 'dispute_opened', facts);
  else
    perform public.notify(other, 'dispute_withdrawn', facts);
  end if;
  return null;
end;
$$;

create trigger disputes_notify_insert
  after insert on public.disputes
  for each row execute function public.disputes_notify();
create trigger disputes_notify_withdrawn
  after update of status on public.disputes
  for each row when (new.status = 'withdrawn' and old.status is distinct from 'withdrawn')
  execute function public.disputes_notify();

-- A statement is added ---------------------------------------------------------------------------------------------
create function public.dispute_statements_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.disputes;
  hire public.engagements;
  facts jsonb;
begin
  select * into d from public.disputes x where x.id = new.dispute_id;
  -- open_dispute() writes the opener's reason as the first statement in the
  -- same transaction (same author, same instant). dispute_opened covers it.
  if new.author_id = d.opened_by and new.created_at = d.opened_at then
    return null;
  end if;

  select * into hire from public.engagements g where g.id = d.engagement_id;
  select jsonb_build_object('campaign_id', k.id, 'campaign_title', k.title,
                            'engagement_id', hire.id, 'dispute_id', d.id,
                            -- An admin writes as Pitchype.
                            'name', coalesce(public.display_name_of(new.author_id), 'Pitchype'))
    into facts
    from public.campaigns k where k.id = hire.campaign_id;

  if new.author_id is distinct from hire.business_id then
    perform public.notify(hire.business_id, 'dispute_statement', facts);
  end if;
  if new.author_id is distinct from hire.creator_id then
    perform public.notify(hire.creator_id, 'dispute_statement', facts);
  end if;
  return null;
end;
$$;

create trigger dispute_statements_notify
  after insert on public.dispute_statements
  for each row execute function public.dispute_statements_notify();

-- Who hears about a settlement ----------------------------------------------------------------------------------------
-- As in 20261114100200, except for who is told. The person who settled it is
-- the actor on the hire's settlement rows in the ledger: the business
-- accepting, the creator withdrawing, an admin (neither of the two, so both
-- hear), or nobody (auto-release, so both hear). The facts gain the status the
-- hire ended in, so auto_released reads differently from accepted.
create or replace function public.engagements_money_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  facts jsonb;
  net bigint;
  actor uuid;
begin
  select jsonb_build_object('campaign_id', k.id, 'campaign_title', k.title, 'engagement_id', new.id)
    into facts
    from public.campaigns k where k.id = new.campaign_id;

  if old.status = 'awaiting_payment' and new.status = 'funded' then
    -- The business paid, so only the creator hears.
    perform public.notify(new.creator_id, 'hire_funded',
      facts || jsonb_build_object('name', public.display_name_of(new.business_id)));
  elsif old.status = 'funded' and new.status = 'in_progress' then
    -- Starting is the creator's action, so only the business hears.
    perform public.notify(new.business_id, 'work_started',
      facts || jsonb_build_object('name', public.display_name_of(new.creator_id)));
  end if;

  -- A cancellation also sets settled_at, but it is announced as
  -- funded_hire_cancelled to the side that didn't cancel, not as a settlement.
  if old.settled_at is null and new.settled_at is not null and new.cancel_reason is null then
    select coalesce(sum(-l.amount_kobo), 0) into net
      from public.ledger_entries l
     where l.engagement_id = new.id
       and l.event_type = 'hire_settled'
       and l.account = 'creator_wallet';
    -- One settlement group per hire, and every row of it carries the actor.
    select l.actor_user_id into actor
      from public.ledger_entries l
     where l.engagement_id = new.id and l.event_type = 'hire_settled'
     limit 1;
    facts := facts || jsonb_build_object(
      'outcome', new.settle_outcome,
      'status', new.status,
      'released_kobo', new.released_kobo,
      'refunded_kobo', new.refunded_kobo);
    if actor is distinct from new.business_id then
      perform public.notify(new.business_id, 'engagement_settled',
        facts || jsonb_build_object('name', public.display_name_of(new.creator_id)));
    end if;
    if actor is distinct from new.creator_id then
      perform public.notify(new.creator_id, 'engagement_settled',
        facts || jsonb_build_object(
          'name', public.display_name_of(new.business_id),
          'creator_net_kobo', net,
          'creator_fee_kobo', coalesce(new.released_kobo, 0) - net));
    end if;
  end if;
  return null;
end;
$$;

-- Review reminders: the "1 day" one now goes out when 2 days or less are left ---------------------------------------
-- The job runs once a day (03:15), so a 1-day window could be missed
-- altogether: a deadline 25 hours away at one run is 1 hour away at the next.
-- With a 2-day window every submission gets its last reminder with at least a
-- day to act. Otherwise as in 20261117100100: the 3-day one stays at 3 days or
-- less, and when both are due only the 1-day one is sent and both columns are
-- set. days_left is 1 for the last reminder and 3 for the earlier one.
create or replace function public.send_review_reminders()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
  sent integer := 0;
begin
  for r in
    update public.submissions s
       set reminded_3d_at = coalesce(s.reminded_3d_at, now()),
           reminded_1d_at = case when s.review_deadline_at - now() <= interval '2 days'
                                 then now() else s.reminded_1d_at end
      from public.engagements g
      join public.campaigns k on k.id = g.campaign_id
     where g.id = s.engagement_id
       and g.status = 'submitted'
       and s.status = 'pending_review'
       and s.review_deadline_at > now()
       and ((s.review_deadline_at - now() <= interval '2 days' and s.reminded_1d_at is null)
            or (s.review_deadline_at - now() <= interval '3 days' and s.reminded_3d_at is null))
    returning g.id as engagement_id, g.business_id, g.creator_id, k.id as campaign_id, k.title,
              s.review_deadline_at
  loop
    perform public.notify(r.business_id, 'review_reminder', jsonb_build_object(
      'campaign_id', r.campaign_id,
      'campaign_title', r.title,
      'engagement_id', r.engagement_id,
      'name', public.display_name_of(r.creator_id),
      'review_deadline_at', r.review_deadline_at,
      'days_left', case when r.review_deadline_at - now() <= interval '2 days' then 1 else 3 end));
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;

revoke all on function public.submissions_notify() from public, anon, authenticated;
revoke all on function public.disputes_notify() from public, anon, authenticated;
revoke all on function public.dispute_statements_notify() from public, anon, authenticated;
revoke all on function public.engagements_money_notify() from public, anon, authenticated;
-- Restated: create or replace keeps them, but this is the function's latest home.
revoke all on function public.send_review_reminders() from public, anon, authenticated;
grant execute on function public.send_review_reminders() to service_role;
