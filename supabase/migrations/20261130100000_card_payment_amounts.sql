-- A card payment for a different amount than we asked for is applied, not left stuck.
--
-- Why: on 2026-11-26 Paystack passed its charge on to a business (a dashboard
-- setting), so it collected ₦5,685.28 for a ₦5,500 card part. The old rule
-- (create_funding invariant 4) stored the event and funded nothing: the money
-- sat in our Paystack balance with no ledger entry, the hire kept asking to be
-- paid, and every retry was a 'duplicate'. Owner's decision (2026-11-26):
-- apply such payments automatically.
--
-- Invariants this migration protects (replacing create_funding invariant 4;
-- the others are unchanged):
--   1. Every kobo Paystack collected is in the ledger. Cash in is what Paystack
--      verified (`paid_kobo`), never the amount we asked for.
--   2. Paid at least the card part, and the hire can still be funded: it is
--      funded exactly as before (escrow price, revenue fee), and the extra is
--      credited to the business wallet in its own payment_received group.
--   3. Paid less, or the hire cannot be funded: everything collected is
--      stranded into the business wallet, as a stranded payment already was.
--      An underpayment never funds a hire.
--   4. Paystack's charge is booked as before, from what it reported.
--   5. Idempotency, lock order and the duplicate rules are unchanged.
--   6. 'mismatch' is no longer returned. Each differing amount raises a
--      WARNING (reference and the two amounts) for the database log.
--
-- The stranded notice (ledger_entries_notify) fires on a payment_received row
-- with a negative business_wallet amount. An extra credit has that shape too,
-- so the trigger now tells the two apart: an extra credit belongs to a payment
-- that also put money in escrow, a stranded payment never does. The extra
-- notice carries `extra: true` and the words say the hire is paid.

create or replace function public.record_card_payment(
  reference text,
  paid_kobo bigint,
  paystack_fee_kobo bigint,
  event_key text,
  payload jsonb
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  p public.payments;
  business uuid;
  result text;
begin
  insert into public.payment_events (event_key, payload)
  values (record_card_payment.event_key, coalesce(record_card_payment.payload, '{}'::jsonb))
  on conflict do nothing;
  if not found then
    return 'duplicate';
  end if;

  select * into p from public.payments x where x.reference = record_card_payment.reference;
  if p.id is null then
    raise exception 'no_such_payment' using errcode = 'P0001';
  end if;

  -- Lock order: the business, the engagement, the payment.
  select g.business_id into business from public.engagements g where g.id = p.engagement_id;
  perform 1 from public.users u where u.id = business for no key update;
  perform 1 from public.engagements g where g.id = p.engagement_id for update;
  select * into p from public.payments x where x.id = p.id for update;

  if p.status = 'succeeded' then
    return 'duplicate';
  end if;
  if paid_kobo is null or paid_kobo <= 0 then
    raise exception 'invalid_paid_amount' using errcode = '22023';
  end if;
  if paystack_fee_kobo is null or paystack_fee_kobo < 0 or paystack_fee_kobo > paid_kobo then
    raise exception 'invalid_paystack_fee' using errcode = '22023';
  end if;
  if paid_kobo <> p.card_amount_kobo then
    raise warning 'card payment % collected % kobo for a card part of % kobo',
      p.reference, paid_kobo, p.card_amount_kobo;
  end if;

  update public.payments x
     set status = 'succeeded', paystack_fee_kobo = record_card_payment.paystack_fee_kobo, updated_at = now()
   where x.id = p.id;

  result := 'stranded';
  -- Nested, not `and`: SQL does not promise to evaluate the amount check
  -- first, and an underpayment must never reach fund_engagement.
  if paid_kobo >= p.card_amount_kobo then
    if public.fund_engagement(p.id) then
      result := 'funded';
    end if;
  end if;

  if result = 'funded' then
    if paid_kobo > p.card_amount_kobo then
      perform public.post_ledger_group('payment_received', null, null, p.engagement_id, p.id, null, p.reference,
        p.fee_config_id,
        jsonb_build_array(
          jsonb_build_object('account', 'paystack', 'amount', paid_kobo - p.card_amount_kobo),
          jsonb_build_object('account', 'business_wallet', 'owner', business,
                             'amount', -(paid_kobo - p.card_amount_kobo))
        ));
    end if;
  else
    perform public.post_ledger_group('payment_received', null, null, p.engagement_id, p.id, null, p.reference,
      p.fee_config_id,
      jsonb_build_array(
        jsonb_build_object('account', 'paystack', 'amount', paid_kobo),
        jsonb_build_object('account', 'business_wallet', 'owner', business, 'amount', -paid_kobo)
      ));
  end if;

  if record_card_payment.paystack_fee_kobo > 0 then
    perform public.post_ledger_group('paystack_fee', null, null, p.engagement_id, p.id, null, p.reference,
      p.fee_config_id,
      jsonb_build_array(
        jsonb_build_object('account', 'paystack', 'amount', -record_card_payment.paystack_fee_kobo),
        jsonb_build_object('account', 'paystack_fees', 'amount', record_card_payment.paystack_fee_kobo)
      ));
  end if;
  return result;
end;
$$;

create or replace function public.ledger_entries_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  facts jsonb;
  extra boolean;
begin
  if new.account <> 'business_wallet' or new.event_type <> 'payment_received' or new.amount_kobo >= 0 then
    return null;
  end if;
  -- The same payment already put money in escrow: this is the extra it
  -- collected, and the hire is paid. A stranded payment never reaches escrow.
  extra := new.payment_id is not null and exists (
    select 1 from public.ledger_entries l
     where l.payment_id = new.payment_id and l.account = 'escrow'
  );
  -- The hire and campaign when the row names one; a left join keeps the
  -- amount even if it doesn't.
  select jsonb_strip_nulls(jsonb_build_object(
           'amount_kobo', -new.amount_kobo,
           'engagement_id', new.engagement_id,
           'campaign_id', k.id,
           'campaign_title', k.title,
           'extra', case when extra then true end))
    into facts
    from (select 1) one
    left join public.engagements g on g.id = new.engagement_id
    left join public.campaigns k on k.id = g.campaign_id;
  perform public.notify(new.owner_user_id, 'payment_stranded', facts);
  return null;
end;
$$;

revoke all on function public.ledger_entries_notify() from public, anon, authenticated;
revoke all on function public.record_card_payment(text, bigint, bigint, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_card_payment(text, bigint, bigint, text, jsonb) to service_role;
