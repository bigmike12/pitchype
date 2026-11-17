-- Notifications for the Stage 6 money events (CLAUDE.md §8): a hire being
-- paid, work starting, a paid hire cancelled, escrow settled, and a payout
-- paid, failed or rejected. Same rules as the create_notifications migration:
-- rows are written only by triggers on the tables where things happen, and
-- nobody is told about their own action.
--
--   hire_funded            to the creator   status awaiting_payment -> funded
--   work_started           to the business  status funded -> in_progress
--   funded_hire_cancelled  to the other side of a cancel of a PAID hire
--   engagement_settled     to both          settled_at set (admin settlement)
--   payout_paid / payout_failed / payout_rejected   to the creator
--
-- No bell for `requested` and `processing` payouts: admins have none, and
-- the creator made the request.

alter type public.notification_kind add value 'hire_funded';
alter type public.notification_kind add value 'work_started';
alter type public.notification_kind add value 'funded_hire_cancelled';
alter type public.notification_kind add value 'engagement_settled';
alter type public.notification_kind add value 'payout_paid';
alter type public.notification_kind add value 'payout_failed';
alter type public.notification_kind add value 'payout_rejected';

-- Cancellations. Stage 5's version told the creator "hire_cancelled" on any
-- cancel by the business. A hire cancelled after payment is a different
-- event (money went back), so it is split out here; every other branch is
-- as it was. The creator withdrawing from a paid hire tells the business.
create or replace function public.engagements_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  facts jsonb;
begin
  if new.status <> 'cancelled' or old.status = 'cancelled' then
    return null;
  end if;
  select jsonb_build_object('campaign_id', k.id, 'campaign_title', k.title, 'engagement_id', new.id)
    into facts
    from public.campaigns k where k.id = new.campaign_id;

  if new.cancel_reason = 'payment_expired' then
    perform public.notify(new.business_id, 'hire_lapsed',
      facts || jsonb_build_object('name', public.display_name_of(new.creator_id)));
    perform public.notify(new.creator_id, 'hire_lapsed',
      facts || jsonb_build_object('name', public.display_name_of(new.business_id)));
  elsif new.cancel_reason = 'cancelled_by_business' then
    perform public.notify(new.creator_id,
      case when new.funded_at is null then 'hire_cancelled' else 'funded_hire_cancelled' end::public.notification_kind,
      facts || jsonb_build_object('name', public.display_name_of(new.business_id)));
  elsif new.cancel_reason = 'cancelled_by_creator' and new.funded_at is not null then
    perform public.notify(new.business_id, 'funded_hire_cancelled',
      facts || jsonb_build_object('name', public.display_name_of(new.creator_id)));
  end if;
  return null;
end;
$$;

-- Money events on a hire: paid and work started (the other side is told),
-- and settled.
create function public.engagements_money_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  facts jsonb;
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
  -- Only an admin settles in Stage 6, so both people hear. Stage 7's accept
  -- by the business must skip the actor here.
  if old.settled_at is null and new.settled_at is not null and new.cancel_reason is null then
    facts := facts || jsonb_build_object(
      'outcome', new.settle_outcome,
      'released_kobo', new.released_kobo,
      'refunded_kobo', new.refunded_kobo);
    perform public.notify(new.business_id, 'engagement_settled',
      facts || jsonb_build_object('name', public.display_name_of(new.creator_id)));
    perform public.notify(new.creator_id, 'engagement_settled',
      facts || jsonb_build_object('name', public.display_name_of(new.business_id)));
  end if;
  return null;
end;
$$;

create trigger engagements_money_notify
  after update of status, settled_at on public.engagements
  for each row execute function public.engagements_money_notify();

-- A payout's final word, to the creator.
create function public.payouts_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  facts jsonb := jsonb_build_object('payout_id', new.id, 'amount_kobo', new.amount_kobo);
begin
  if new.status is not distinct from old.status then
    return null;
  end if;
  case new.status
    when 'paid' then
      perform public.notify(new.user_id, 'payout_paid', facts);
    when 'failed' then
      perform public.notify(new.user_id, 'payout_failed', facts);
    when 'rejected' then
      perform public.notify(new.user_id, 'payout_rejected',
        facts || jsonb_build_object('decision_reason', new.decision_reason));
    else
      null;
  end case;
  return null;
end;
$$;

create trigger payouts_notify
  after update of status on public.payouts
  for each row execute function public.payouts_notify();

revoke all on function public.engagements_notify() from public, anon, authenticated;
revoke all on function public.engagements_money_notify() from public, anon, authenticated;
revoke all on function public.payouts_notify() from public, anon, authenticated;
