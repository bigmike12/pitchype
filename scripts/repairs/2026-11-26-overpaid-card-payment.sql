-- One-off production repair, 2026-11-26. Written record per CLAUDE.md §11.
--
-- What happened: Paystack was set to pass its charge on to the customer, so for
-- payment pit_bc6e94c61c6d4a5cb8f368b626eab076 (card part ₦5,500 = ₦5,000 price
-- + ₦500 business fee) it collected ₦5,685.28 and kept its ₦185.28 charge.
-- record_card_payment() saw paid ≠ card part, stored the event and returned
-- 'mismatch': nothing was funded and nothing was written to the ledger, and
-- every later attempt was a 'duplicate'. Paystack's setting was changed back
-- the same day; 20261130100000_card_payment_amounts.sql applies such payments
-- from now on.
--
-- What this does, in one transaction, through the same functions the webhook
-- uses (as the database owner, since they have no grant to any app role):
--   1. marks the payment succeeded with Paystack's charge (₦185.28),
--   2. funds the hire with fund_engagement() exactly as a normal card payment
--      (paystack +₦5,500, escrow −₦5,000, platform_revenue −₦500),
--   3. books the extra ₦185.28 the business paid to its wallet, as a
--      `correction` group with a reason (so no "stranded" notice is sent with
--      the wrong words; the business is told by hand),
--   4. books Paystack's charge (paystack −₦185.28, paystack_fees +₦185.28).
-- Net cash in the ledger: ₦5,500, which is what reached our Paystack balance.
-- Funding notifies the creator as usual.
--
-- Every precondition is checked first; if anything differs the block raises
-- and writes nothing. Safe to run twice: the second run stops at the status check.

do $$
declare
  ref constant text := 'pit_bc6e94c61c6d4a5cb8f368b626eab076';
  collected constant bigint := 568528;  -- what Paystack collected (verified, in payment_events)
  charge constant bigint := 18528;      -- Paystack's charge on it
  p public.payments;
  e public.engagements;
  ev jsonb;
  wallet_before bigint;
begin
  select * into p from public.payments x where x.reference = ref;
  if p.id is null then
    raise exception 'repair: no payment %', ref;
  end if;

  -- Lock order of every money function: the business, the engagement, the payment.
  perform 1 from public.users u
   where u.id = (select g.business_id from public.engagements g where g.id = p.engagement_id)
     for no key update;
  select * into e from public.engagements x where x.id = p.engagement_id for update;
  select * into p from public.payments x where x.id = p.id for update;

  if p.status <> 'initiated' or p.card_amount_kobo <> 550000 or p.wallet_part_kobo <> 0
     or p.total_kobo <> 550000 or p.business_fee_kobo <> 50000 then
    raise exception 'repair: payment not as expected (status %, card %, wallet %)',
      p.status, p.card_amount_kobo, p.wallet_part_kobo;
  end if;
  if e.status <> 'awaiting_payment' or e.agreed_price_kobo <> 500000 then
    raise exception 'repair: hire not as expected (status %)', e.status;
  end if;
  if now() > e.pay_by then
    raise exception 'repair: the hire''s pay-by time has passed (%); decide again before funding', e.pay_by;
  end if;

  select x.payload into ev from public.payment_events x where x.event_key = 'charge.success:' || ref;
  if ev is null
     or (ev ->> 'amount')::bigint <> collected
     or (ev ->> 'fees')::bigint <> charge
     or ev ->> 'status' <> 'success'
     or ev ->> 'currency' <> 'NGN'
     or ev ->> 'reference' <> ref then
    raise exception 'repair: stored Paystack answer not as expected: %', ev;
  end if;
  if exists (select 1 from public.ledger_entries l where l.payment_id = p.id or l.paystack_reference = ref) then
    raise exception 'repair: the ledger already has rows for this payment';
  end if;

  wallet_before := public.wallet_balance(e.business_id, 'business_wallet');

  update public.payments x
     set status = 'succeeded', paystack_fee_kobo = charge, updated_at = now()
   where x.id = p.id;

  if not public.fund_engagement(p.id) then
    raise exception 'repair: fund_engagement refused';
  end if;

  perform public.post_ledger_group('correction', null,
    'Repair 2026-11-26: Paystack passed its charge to the business and collected ₦5,685.28 for a ₦5,500 card part; the extra ₦185.28 is returned to the business wallet.',
    e.id, p.id, null, ref, p.fee_config_id,
    jsonb_build_array(
      jsonb_build_object('account', 'paystack', 'amount', collected - p.card_amount_kobo),
      jsonb_build_object('account', 'business_wallet', 'owner', e.business_id,
                         'amount', -(collected - p.card_amount_kobo))
    ));

  perform public.post_ledger_group('paystack_fee', null, null, e.id, p.id, null, ref, p.fee_config_id,
    jsonb_build_array(
      jsonb_build_object('account', 'paystack', 'amount', -charge),
      jsonb_build_object('account', 'paystack_fees', 'amount', charge)
    ));

  -- Checks after the writes; any failure undoes everything above.
  if (select g.status::text from public.engagements g where g.id = e.id) <> 'funded' then
    raise exception 'repair check: hire is not funded';
  end if;
  if (select sum(l.amount_kobo) from public.ledger_entries l
       where l.payment_id = p.id and l.account = 'escrow') <> -500000 then
    raise exception 'repair check: escrow is not ₦5,000';
  end if;
  if (select sum(l.amount_kobo) from public.ledger_entries l
       where l.payment_id = p.id and l.account = 'paystack') <> collected - charge then
    raise exception 'repair check: Paystack cash is not ₦5,500';
  end if;
  if public.wallet_balance(e.business_id, 'business_wallet') <> wallet_before + (collected - p.card_amount_kobo) then
    raise exception 'repair check: the business wallet did not gain ₦185.28';
  end if;
  if (select sum(l.amount_kobo) from public.ledger_entries l where l.payment_id = p.id) <> 0 then
    raise exception 'repair check: the payment''s ledger rows do not balance';
  end if;

  raise notice 'repair done: hire % funded, ₦185.28 to the business wallet', e.id;
end;
$$;
