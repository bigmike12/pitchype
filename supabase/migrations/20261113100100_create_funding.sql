-- Payments and funding hires into escrow (Stage 6).
-- Design: docs/superpowers/specs/2026-11-13-stage-6-money-design.md §3, §4, §5, §11.
--
-- Invariants this migration protects:
--   1. Amounts come from the server. start_payment() freezes the total
--      (price + business fee), the fee, the fee_config id, the wallet part and
--      the card part on a `payments` row; nothing later recomputes them.
--   2. A hire is funded at most once. Every money function takes its locks in
--      one order: the business's users row, then the engagement, then the
--      payment. Funding requires `awaiting_payment` under those locks, so a
--      second or concurrent attempt sees `funded` and does nothing.
--   3. Paystack events are processed once. record_card_payment() stores the
--      event key first (unique); a repeat returns 'duplicate'. A second event
--      for an already succeeded payment also returns 'duplicate'. Two callers
--      with the same reference serialise on the locks; the second sees
--      `succeeded` and returns 'duplicate'.
--   4. A wrong amount funds nothing: the event is kept for audit, the payment
--      is left as it was and nothing is written to the ledger ('mismatch').
--   5. A payment that cannot fund its hire (lapsed, cancelled, already funded,
--      or the wallet part no longer covered) is stranded: the card amount is
--      credited to the business wallet and nothing else moves (spec §2).
--   6. A wallet is never overdrawn: the balance is read under the business's
--      users row lock and must cover the wallet part.
--   7. The fee snapshot on the engagement comes from the payment's frozen
--      fee_config, never the current one.
--   8. A payment started in the last 30 minutes holds the lapse and the
--      business's cancel, so money in flight is not stranded by the clock.
--
-- Superseded payments: calling start_payment() again marks the older
-- `initiated` payment for that engagement `failed` (never deleted), so only one
-- stays initiated. If Paystack later reports a success for that older
-- reference, record_card_payment() still accepts it (status `initiated` or
-- `failed`): it funds the hire if that is still possible, otherwise strands it
-- into the business wallet. Money that reached us is never ignored.
--
-- Ledger groups (Task 2 signs: cash and expense positive, liabilities and
-- revenue negative):
--   card payment that funds   payment_received: paystack +card,
--                             business_wallet +wallet part (if any),
--                             escrow −price, platform_revenue −fee
--   wallet-only funding       hire_funded: business_wallet +total,
--                             escrow −price, platform_revenue −fee
--   stranded card payment     payment_received: paystack +card,
--                             business_wallet −card
--   Paystack's charge         paystack_fee: paystack −charge, paystack_fees +charge
--
-- Errors raised (P0001 are refusals the app shows, see src/lib/refusals.ts):
--   P0001 not_enough_balance    pay_from_wallet: the wallet doesn't cover the total
--   P0001 payment_in_progress   cancel_engagement: a payment started < 30 min ago
--   P0001 wallet_covers_total   start_payment: pay from the wallet instead
--   P0001 engagement_locked     not awaiting payment, or past pay_by
--   P0001 no_such_engagement    not the caller's hire
--   P0001 no_such_payment       record_card_payment: unknown reference (the
--                               webhook turns it into a 200 no-op)
--   22023 fee_notice_required   the non-refundable-fee notice wasn't ticked
--                               (the form requires it; not a refusal)
--   P0001 ledger_bad_line       post_ledger_group: a line that is not an
--                               object, or an amount that is not a JSON number

-- Ledger hardening (review findings on 20261113100000) --------------------------------------------

-- Replica mode (session_replication_role = replica, used by some restore
-- tools) skips ordinary triggers. These must fire whatever the mode.
alter table public.ledger_entries enable always trigger ledger_entries_append_only;
alter table public.ledger_entries enable always trigger ledger_entries_no_truncate;
alter table public.fee_config enable always trigger fee_config_append_only;
alter table public.fee_config enable always trigger fee_config_no_truncate;

-- Same as before, plus: every line must be a JSON object whose amount is a
-- JSON number, so "10" (a string) or null can never slip through a cast.
create or replace function public.post_ledger_group(
  event_type text,
  actor uuid,
  reason text,
  engagement uuid,
  payment uuid,
  payout uuid,
  reference text,
  config uuid,
  lines jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  new_group uuid := gen_random_uuid();
  total numeric;
begin
  if jsonb_typeof(lines) is distinct from 'array' or jsonb_array_length(lines) = 0 then
    raise exception 'ledger_empty' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from jsonb_array_elements(lines) l
     where jsonb_typeof(l) is distinct from 'object'
        or jsonb_typeof(l -> 'amount') is distinct from 'number'
  ) then
    raise exception 'ledger_bad_line' using errcode = 'P0001';
  end if;

  select sum((l ->> 'amount')::bigint) into total from jsonb_array_elements(lines) l;
  if total is distinct from 0 then
    raise exception 'ledger_unbalanced' using errcode = 'P0001';
  end if;

  insert into public.ledger_entries (group_id, event_type, account, owner_user_id, engagement_id,
                                     payment_id, payout_id, paystack_reference, amount_kobo,
                                     actor_user_id, reason, fee_config_id)
  select new_group,
         post_ledger_group.event_type,
         l ->> 'account',
         (l ->> 'owner')::uuid,
         post_ledger_group.engagement,
         post_ledger_group.payment,
         post_ledger_group.payout,
         post_ledger_group.reference,
         (l ->> 'amount')::bigint,
         post_ledger_group.actor,
         post_ledger_group.reason,
         coalesce(post_ledger_group.config, (public.current_fee_config()).id)
    from jsonb_array_elements(lines) l;

  return new_group;
end;
$$;

-- Engagements: fee snapshot, funding and settlement -------------------------------------------------

alter table public.engagements
  add column business_fee_kobo bigint,
  add column creator_fee_bps integer,
  add column creator_min_fee_kobo bigint,
  add column fee_config_id uuid references public.fee_config (id) on delete restrict,
  add column funded_at timestamptz,
  add column started_at timestamptz,
  add column settled_at timestamptz,
  -- Values are set by the settlement migration, which adds their check.
  add column settle_outcome text,
  add column released_kobo bigint,
  add column refunded_kobo bigint;

-- The snapshot is written once, all together, when the hire is funded.
alter table public.engagements
  add constraint engagements_funding_check check (
    (funded_at is null and business_fee_kobo is null and creator_fee_bps is null
       and creator_min_fee_kobo is null and fee_config_id is null)
    or (funded_at is not null and business_fee_kobo >= 0 and creator_fee_bps between 0 and 10000
       and creator_min_fee_kobo >= 0 and fee_config_id is not null)
  ),
  add constraint engagements_settled_amounts_check check (
    (released_kobo is null or released_kobo >= 0) and (refunded_kobo is null or refunded_kobo >= 0)
  );

alter table public.engagements drop constraint engagements_cancel_reason_check;
alter table public.engagements add constraint engagements_cancel_reason_check check (
  cancel_reason is null or cancel_reason in ('payment_expired', 'cancelled_by_business', 'cancelled_by_creator')
);

-- Payments ---------------------------------------------------------------------------------------------

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements (id) on delete restrict,
  -- pit_<uuid without dashes>; sent to Paystack as the transaction reference.
  reference text not null unique,
  total_kobo bigint not null,
  business_fee_kobo bigint not null,
  fee_config_id uuid not null references public.fee_config (id) on delete restrict,
  card_amount_kobo bigint not null,
  wallet_part_kobo bigint not null,
  status text not null default 'initiated',
  -- What Paystack actually charged, from the verified transaction.
  paystack_fee_kobo bigint,
  -- When the business ticked the non-refundable-fee notice (CLAUDE.md §6.2).
  fee_notice_seen_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payments_reference_check check (reference ~ '^pit_[0-9a-f]{32}$'),
  constraint payments_status_check check (status in ('initiated', 'succeeded', 'failed')),
  constraint payments_amounts_check check (
    total_kobo > 0 and business_fee_kobo >= 0 and business_fee_kobo < total_kobo
    and card_amount_kobo >= 0 and wallet_part_kobo >= 0
    and card_amount_kobo + wallet_part_kobo = total_kobo
  ),
  -- A card payment needs something to charge; wallet-only payments are
  -- created already succeeded by pay_from_wallet().
  constraint payments_card_check check (status <> 'initiated' or card_amount_kobo > 0),
  constraint payments_paystack_fee_check check (
    paystack_fee_kobo is null or paystack_fee_kobo between 0 and card_amount_kobo
  )
);

create index payments_engagement_idx on public.payments (engagement_id, created_at desc);
-- Only one card payment per hire waits at a time.
create unique index payments_one_initiated_idx on public.payments (engagement_id) where status = 'initiated';

-- Paystack events already processed (idempotency, and an audit of what
-- Paystack told us). Callers strip secrets and mask account numbers first.
create table public.payment_events (
  event_key text primary key,
  payload jsonb not null,
  received_at timestamptz not null default now(),

  constraint payment_events_key_check check (char_length(event_key) between 1 and 200)
);

alter table public.ledger_entries
  add constraint ledger_entries_payment_fk
  foreign key (payment_id) references public.payments (id) on delete restrict;

-- Internal helpers --------------------------------------------------------------------------------

-- Matches src/lib/fees.ts: the larger of the minimum and the rate, rounded
-- half up, in integer arithmetic.
create function public.fee_kobo(amount bigint, bps integer, min_fee bigint)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select greatest(min_fee, (amount * bps + 5000) / 10000)
$$;

-- An engagement has a card payment in flight: initiated in the last 30 minutes.
create function public.payment_in_flight(engagement uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.payments p
     where p.engagement_id = engagement
       and p.status = 'initiated'
       and p.created_at > now() - interval '30 minutes'
  )
$$;

-- Funds the hire from a succeeded payment if it still can. Returns false, and
-- changes nothing, when it cannot; the caller then strands the money or
-- refuses. Callers already hold the locks; taking them again here (same
-- order, same transaction) keeps this safe on its own.
create function public.fund_engagement(payment uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  p public.payments;
  e public.engagements;
  cfg public.fee_config;
  lines jsonb;
begin
  select * into p from public.payments x where x.id = payment;
  if p.id is null then
    raise exception 'no_such_payment' using errcode = 'P0001';
  end if;
  perform 1 from public.users u
   where u.id = (select g.business_id from public.engagements g where g.id = p.engagement_id)
     for no key update;
  select * into e from public.engagements x where x.id = p.engagement_id for update;
  select * into p from public.payments x where x.id = payment for update;

  if p.status <> 'succeeded' then
    raise exception 'payment_not_succeeded' using errcode = 'P0001';
  end if;
  if p.total_kobo - p.business_fee_kobo <> e.agreed_price_kobo then
    raise exception 'payment_total_wrong' using errcode = 'P0001';
  end if;

  if e.status <> 'awaiting_payment' then
    return false;
  end if;
  -- Past pay_by only a card payment started inside the 30-minute hold funds.
  if now() > e.pay_by
     and not (p.card_amount_kobo > 0 and p.created_at > now() - interval '30 minutes') then
    return false;
  end if;
  if public.wallet_balance(e.business_id, 'business_wallet') < p.wallet_part_kobo then
    return false;
  end if;

  lines := jsonb_build_array(
    jsonb_build_object('account', 'escrow', 'amount', -(p.total_kobo - p.business_fee_kobo)),
    jsonb_build_object('account', 'platform_revenue', 'amount', -p.business_fee_kobo)
  );
  if p.card_amount_kobo > 0 then
    lines := lines || jsonb_build_object('account', 'paystack', 'amount', p.card_amount_kobo);
  end if;
  if p.wallet_part_kobo > 0 then
    lines := lines || jsonb_build_object('account', 'business_wallet', 'owner', e.business_id,
                                         'amount', p.wallet_part_kobo);
  end if;

  perform public.post_ledger_group(
    case when p.card_amount_kobo > 0 then 'payment_received' else 'hire_funded' end,
    case when p.card_amount_kobo > 0 then null else e.business_id end,
    null, e.id, p.id, null,
    case when p.card_amount_kobo > 0 then p.reference end,
    p.fee_config_id, lines);

  select * into cfg from public.fee_config f where f.id = p.fee_config_id;
  update public.engagements x
     set status = 'funded', funded_at = now(),
         business_fee_kobo = p.business_fee_kobo,
         creator_fee_bps = cfg.creator_fee_bps,
         creator_min_fee_kobo = cfg.min_fee_kobo,
         fee_config_id = p.fee_config_id,
         updated_at = now()
   where x.id = e.id;
  return true;
end;
$$;

-- For the business ---------------------------------------------------------------------------------------

-- Starts a card payment: freezes the figures and returns what Paystack needs.
-- Wallet balance pays first; the card pays the rest.
create function public.start_payment(engagement uuid, fee_notice_seen boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  my_email text;
  e public.engagements;
  cfg public.fee_config := public.current_fee_config();
  fee bigint;
  total bigint;
  wallet_part bigint;
  new_payment public.payments;
begin
  if me is null or public.current_user_role() is distinct from 'business' then
    raise exception 'businesses pay for hires' using errcode = '42501';
  end if;
  if fee_notice_seen is not true then
    raise exception 'fee_notice_required' using errcode = '22023';
  end if;

  select u.email into my_email from public.users u where u.id = me for no key update;
  select * into e from public.engagements x where x.id = engagement for update;
  if e.id is null or e.business_id is distinct from me then
    raise exception 'no_such_engagement' using errcode = 'P0001';
  end if;
  if e.status <> 'awaiting_payment' or now() > e.pay_by then
    raise exception 'engagement_locked' using errcode = 'P0001';
  end if;

  fee := public.fee_kobo(e.agreed_price_kobo, cfg.business_fee_bps, cfg.min_fee_kobo);
  total := e.agreed_price_kobo + fee;
  wallet_part := least(greatest(public.wallet_balance(me, 'business_wallet'), 0), total);
  if wallet_part = total then
    raise exception 'wallet_covers_total' using errcode = 'P0001';
  end if;

  update public.payments x
     set status = 'failed', updated_at = now()
   where x.engagement_id = e.id and x.status = 'initiated';

  insert into public.payments (engagement_id, reference, total_kobo, business_fee_kobo, fee_config_id,
                               card_amount_kobo, wallet_part_kobo, fee_notice_seen_at)
  values (e.id, 'pit_' || replace(gen_random_uuid()::text, '-', ''), total, fee, cfg.id,
          total - wallet_part, wallet_part, now())
  returning * into new_payment;

  return jsonb_build_object(
    'payment_id', new_payment.id,
    'reference', new_payment.reference,
    'card_amount_kobo', new_payment.card_amount_kobo,
    'email', my_email
  );
end;
$$;

-- Funds a hire wholly from the business wallet. One payment row records it.
create function public.pay_from_wallet(engagement uuid, fee_notice_seen boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  e public.engagements;
  cfg public.fee_config := public.current_fee_config();
  fee bigint;
  total bigint;
  new_payment uuid;
begin
  if me is null or public.current_user_role() is distinct from 'business' then
    raise exception 'businesses pay for hires' using errcode = '42501';
  end if;
  if fee_notice_seen is not true then
    raise exception 'fee_notice_required' using errcode = '22023';
  end if;

  perform 1 from public.users u where u.id = me for no key update;
  select * into e from public.engagements x where x.id = engagement for update;
  if e.id is null or e.business_id is distinct from me then
    raise exception 'no_such_engagement' using errcode = 'P0001';
  end if;
  if e.status <> 'awaiting_payment' or now() > e.pay_by then
    raise exception 'engagement_locked' using errcode = 'P0001';
  end if;

  fee := public.fee_kobo(e.agreed_price_kobo, cfg.business_fee_bps, cfg.min_fee_kobo);
  total := e.agreed_price_kobo + fee;
  if public.wallet_balance(me, 'business_wallet') < total then
    raise exception 'not_enough_balance' using errcode = 'P0001';
  end if;

  -- A card payment still waiting is superseded; if it succeeds later it is stranded.
  update public.payments x
     set status = 'failed', updated_at = now()
   where x.engagement_id = e.id and x.status = 'initiated';

  insert into public.payments (engagement_id, reference, total_kobo, business_fee_kobo, fee_config_id,
                               card_amount_kobo, wallet_part_kobo, status, fee_notice_seen_at)
  values (e.id, 'pit_' || replace(gen_random_uuid()::text, '-', ''), total, fee, cfg.id,
          0, total, 'succeeded', now())
  returning id into new_payment;

  if not public.fund_engagement(new_payment) then
    raise exception 'engagement_locked' using errcode = 'P0001';
  end if;
end;
$$;

-- For the server (webhook and the pay-return page) ---------------------------------------------------

-- Records a card payment Paystack has confirmed (the caller verified it with
-- Paystack first). Returns 'funded', 'stranded', 'duplicate' or 'mismatch'.
create function public.record_card_payment(
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
  if paid_kobo is distinct from p.card_amount_kobo then
    return 'mismatch';
  end if;
  if paystack_fee_kobo is null or paystack_fee_kobo < 0 or paystack_fee_kobo > paid_kobo then
    raise exception 'invalid_paystack_fee' using errcode = '22023';
  end if;

  update public.payments x
     set status = 'succeeded', paystack_fee_kobo = record_card_payment.paystack_fee_kobo, updated_at = now()
   where x.id = p.id;

  if public.fund_engagement(p.id) then
    result := 'funded';
  else
    perform public.post_ledger_group('payment_received', null, null, p.engagement_id, p.id, null, p.reference,
      p.fee_config_id,
      jsonb_build_array(
        jsonb_build_object('account', 'paystack', 'amount', p.card_amount_kobo),
        jsonb_build_object('account', 'business_wallet', 'owner', business, 'amount', -p.card_amount_kobo)
      ));
    result := 'stranded';
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

-- Lapse and cancel respect a payment in flight ----------------------------------------------------

-- As in Stage 5, plus: skip a hire with a card payment started in the last
-- 30 minutes. fund_engagement() still checks the status itself.
create or replace function public.expire_unpaid_engagements(campaign uuid default null)
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with expired as (
    update public.engagements e
       set status = 'cancelled', cancelled_at = now(), cancel_reason = 'payment_expired', updated_at = now()
     where e.status = 'awaiting_payment'
       and e.pay_by < now()
       and (campaign is null or e.campaign_id = campaign)
       and not public.payment_in_flight(e.id)
    returning 1
  )
  select count(*)::integer from expired
$$;

-- As in Stage 5, plus: refused while a card payment is in flight.
create or replace function public.cancel_engagement(engagement uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  e public.engagements;
begin
  select * into e from public.engagements x where x.id = engagement for update;
  if e.id is null or e.business_id is distinct from me then
    raise exception 'no_such_engagement' using errcode = 'P0001';
  end if;
  if e.status <> 'awaiting_payment' then
    raise exception 'engagement_locked' using errcode = 'P0001';
  end if;
  if public.payment_in_flight(e.id) then
    raise exception 'payment_in_progress' using errcode = 'P0001';
  end if;
  update public.engagements x
     set status = 'cancelled', cancelled_at = now(), cancel_reason = 'cancelled_by_business', updated_at = now()
   where x.id = e.id;
end;
$$;

-- Function grants ---------------------------------------------------------------------------------

revoke all on function public.fee_kobo(bigint, integer, bigint) from public, anon, authenticated, service_role;
revoke all on function public.payment_in_flight(uuid) from public, anon, authenticated, service_role;
revoke all on function public.fund_engagement(uuid) from public, anon, authenticated, service_role;
revoke all on function public.start_payment(uuid, boolean) from public, anon;
revoke all on function public.pay_from_wallet(uuid, boolean) from public, anon;
revoke all on function public.record_card_payment(text, bigint, bigint, text, jsonb) from public, anon, authenticated;

grant execute on function public.start_payment(uuid, boolean) to authenticated;
grant execute on function public.pay_from_wallet(uuid, boolean) to authenticated;
grant execute on function public.record_card_payment(text, bigint, bigint, text, jsonb) to service_role;

-- Table grants and row level security -----------------------------------------------------------

alter table public.payments enable row level security;
alter table public.payment_events enable row level security;

-- Writes only through the functions above.
revoke all on table public.payments from anon, authenticated, service_role;
revoke all on table public.payment_events from anon, authenticated, service_role;
grant select on table public.payments to authenticated, service_role;
grant select on table public.payment_events to service_role;

create policy "Payments: the paying business, admins"
  on public.payments for select to authenticated
  using (
    exists (
      select 1 from public.engagements g
       where g.id = engagement_id and g.business_id = (select public.current_user_id())
    )
    or (select public.current_user_role()) = 'admin'
  );
