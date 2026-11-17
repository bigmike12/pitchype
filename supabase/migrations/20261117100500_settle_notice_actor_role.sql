-- The settlement notice says who settled the hire.
-- As in 20261117100300 (who is told, the facts), plus one fact: 'settled_by',
-- the role of the person who settled it ('influencer', 'business' or 'admin'),
-- or null when nobody did (auto-release). Without it a creator withdrawing and
-- an admin refunding at the creator's fault (both refund_creator_fault) look
-- the same, and the business would be told "the creator withdrew" for both.
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
  actor_role text;
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
    select u.role::text into actor_role from public.users u where u.id = actor;
    facts := facts || jsonb_build_object(
      'outcome', new.settle_outcome,
      'status', new.status,
      'settled_by', actor_role,
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
