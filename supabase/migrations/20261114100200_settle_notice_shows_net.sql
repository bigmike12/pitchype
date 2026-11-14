-- The creator's "settled" notice said "₦25,000 was released to your wallet, less
-- our fee" while their wallet got ₦23,750: `released_kobo` is the gross amount
-- that left escrow, and the notice printed it as the wallet credit.
--
-- The notice now also carries the fee taken and what the wallet actually got,
-- read from the settlement's own ledger group (the credit to the creator's
-- wallet), so the notice can never disagree with the wallet. The ledger rows
-- are posted before the engagement is updated (settle_money), so they exist
-- when this trigger runs. Nothing else in the function changes.

create or replace function public.engagements_money_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  facts jsonb;
  net bigint;
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
    select coalesce(sum(-l.amount_kobo), 0) into net
      from public.ledger_entries l
     where l.engagement_id = new.id
       and l.event_type = 'hire_settled'
       and l.account = 'creator_wallet';
    facts := facts || jsonb_build_object(
      'outcome', new.settle_outcome,
      'released_kobo', new.released_kobo,
      'refunded_kobo', new.refunded_kobo);
    perform public.notify(new.business_id, 'engagement_settled',
      facts || jsonb_build_object('name', public.display_name_of(new.creator_id)));
    perform public.notify(new.creator_id, 'engagement_settled',
      facts || jsonb_build_object(
        'name', public.display_name_of(new.business_id),
        'creator_net_kobo', net,
        'creator_fee_kobo', coalesce(new.released_kobo, 0) - net));
  end if;
  return null;
end;
$$;

-- Notices already sent to creators get the same two numbers from the ledger.
-- A notice is a message, not a ledger row, so updating it is allowed.
update public.notifications n
   set data = n.data || jsonb_build_object(
         'creator_net_kobo', s.net,
         'creator_fee_kobo', (n.data->>'released_kobo')::bigint - s.net)
  from (
    select l.engagement_id, sum(-l.amount_kobo)::bigint as net
      from public.ledger_entries l
     where l.event_type = 'hire_settled' and l.account = 'creator_wallet'
     group by l.engagement_id
  ) s
 where n.kind = 'engagement_settled'
   and (n.data->>'engagement_id')::uuid = s.engagement_id
   and n.user_id = (select e.creator_id from public.engagements e where e.id = s.engagement_id)
   and not n.data ? 'creator_net_kobo'
   and n.data ? 'released_kobo';
