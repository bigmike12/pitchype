-- A creator's wallet, told the way they think of it: what they earned before
-- our fee, the fee, what they have asked to be paid out, and what is left.
--
-- Read only. Every figure comes from the ledger and the settled hires, so
-- earned - fee - payouts + other always equals wallet_balance(); a test holds
-- that. "Earned" is the amount released from escrow for the creator's hires
-- (engagements.released_kobo, before our fee). "Fee" is what is left of it
-- after the credit the settlement posted to the wallet, never a recomputation.
-- "Payouts" is money asked for and not given back: a requested payout counts
-- until it is rejected or fails, so it is the amount sent or on its way.
-- "Other" is anything else on the wallet (corrections).
--
-- Like wallet_balance(), service_role only: the page passes the signed-in
-- person's own id.

create function public.creator_wallet_summary(person uuid)
returns table (earned_kobo bigint, fee_kobo bigint, payouts_kobo bigint, other_kobo bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with credits as (
    select e.released_kobo, -l.amount_kobo as credit_kobo
      from public.ledger_entries l
      join public.engagements e on e.id = l.engagement_id
     where l.owner_user_id = person
       and l.account = 'creator_wallet'
       and l.event_type = 'hire_settled'
  ), moves as (
    select coalesce(sum(l.amount_kobo) filter (
             where l.event_type in ('payout_requested', 'payout_rejected', 'payout_failed')), 0) as payouts,
           coalesce(sum(-l.amount_kobo) filter (
             where l.event_type not in ('hire_settled', 'payout_requested', 'payout_rejected', 'payout_failed')), 0) as other
      from public.ledger_entries l
     where l.owner_user_id = person and l.account = 'creator_wallet'
  )
  select coalesce((select sum(released_kobo) from credits), 0)::bigint,
         (coalesce((select sum(released_kobo) from credits), 0)
          - coalesce((select sum(credit_kobo) from credits), 0))::bigint,
         (select payouts from moves)::bigint,
         (select other from moves)::bigint;
$$;

revoke all on function public.creator_wallet_summary(uuid) from public, anon, authenticated;
grant execute on function public.creator_wallet_summary(uuid) to service_role;
