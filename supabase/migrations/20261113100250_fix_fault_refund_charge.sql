-- Fault refunds subtract only the charge of the payment that funded the hire.
-- Fixes 20261113100200_create_settlement.sql, which summed the charges of every
-- succeeded payment for the engagement. A late, superseded payment that was
-- stranded into the business wallet is not part of the hire: the platform
-- already absorbed its charge when it was stranded (spec §11 call 1), so it
-- must not be taken from the business again.
--
-- The funding payment is the payment_id on the hire's funding group
-- (payment_received or hire_funded); fund_engagement() writes it on every line,
-- the escrow line included, and funds a hire at most once. Wallet-only funding
-- has no Paystack charge (paystack_fee_kobo is null, counted as 0).
-- Everything else is as in 20261113100200, including the cap that keeps the
-- business from getting back less than the price.

create or replace function public.settle_money(
  engagement uuid,
  outcome text,
  released bigint,
  fault boolean,
  new_status public.engagement_status,
  cancel_reason text,
  actor uuid,
  reason text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e public.engagements;
  escrow_held bigint;
  creator_fee bigint := 0;
  charges bigint := 0;
  fee_back bigint := 0;
  to_business bigint;
  lines jsonb;
begin
  select * into e from public.engagements x where x.id = engagement for update;

  select coalesce(-sum(l.amount_kobo), 0) into escrow_held
    from public.ledger_entries l where l.engagement_id = e.id and l.account = 'escrow';
  if escrow_held <> e.agreed_price_kobo then
    raise exception 'escrow_mismatch' using errcode = 'P0001';
  end if;

  if released > 0 then
    creator_fee := least(released, greatest(e.creator_min_fee_kobo, (released * e.creator_fee_bps + 5000) / 10000));
  end if;
  if fault then
    select coalesce(p.paystack_fee_kobo, 0) into charges
      from public.payments p
     where p.id = (
       select l.payment_id from public.ledger_entries l
        where l.engagement_id = e.id and l.account = 'escrow' and l.amount_kobo < 0
          and l.event_type in ('payment_received', 'hire_funded')
        order by l.created_at, l.id
        limit 1
     );
    charges := coalesce(charges, 0);
    fee_back := e.business_fee_kobo - least(charges, e.business_fee_kobo);
  end if;
  to_business := e.agreed_price_kobo - released + fee_back;

  lines := jsonb_build_array(jsonb_build_object('account', 'escrow', 'amount', e.agreed_price_kobo));
  if released - creator_fee > 0 then
    lines := lines || jsonb_build_object('account', 'creator_wallet', 'owner', e.creator_id,
                                         'amount', -(released - creator_fee));
  end if;
  if creator_fee > 0 then
    lines := lines || jsonb_build_object('account', 'platform_revenue', 'amount', -creator_fee);
  end if;
  if fee_back > 0 then
    lines := lines || jsonb_build_object('account', 'platform_revenue', 'amount', fee_back);
  end if;
  if to_business > 0 then
    lines := lines || jsonb_build_object('account', 'business_wallet', 'owner', e.business_id,
                                         'amount', -to_business);
  end if;

  perform public.post_ledger_group('hire_settled', actor, reason, e.id, null, null, null, e.fee_config_id, lines);

  update public.engagements x
     set status = new_status,
         settle_outcome = outcome,
         released_kobo = released,
         refunded_kobo = to_business,
         settled_at = now(),
         cancelled_at = case when settle_money.cancel_reason is not null then now() end,
         cancel_reason = settle_money.cancel_reason,
         updated_at = now()
   where x.id = e.id;
end;
$$;

-- Unchanged: internal, no role may call it (create or replace keeps this; restated).
revoke all on function public.settle_money(uuid, text, bigint, boolean, public.engagement_status, text, uuid, text)
  from public, anon, authenticated, service_role;
