-- Cray as the default payment provider, Paystack kept (docs/superpowers/specs/2026-11-21-cray-payments-design.md §5.1, §5.2, §5.6).
--
-- Invariants this migration protects:
--   1. The provider is chosen once per payment, when it starts, and stamped on
--      the row. Everything that happens to that payment later (the return page,
--      webhooks, pollers, the ledger accounts it posts to) follows the row,
--      never the current switch. Flipping the switch strands and re-routes
--      nothing that is already started.
--   2. The switch is append-only: the current provider is the latest row, and
--      the table is its own audit trail (who, why, when). Only an admin writes
--      it, through set_payment_provider().
--   3. The Paystack path is unchanged: a Paystack payment still posts its cash
--      to `paystack` and its charge to `paystack_fees` as `paystack_fee`. A Cray
--      payment posts to `cray` and `cray_fees` (`processor_fee`), and posts no
--      fee group at all when Cray's charge was borne by the business (0).
--   4. The ledger accepts the new accounts and event types, and nothing else.
--
-- Names: `payments.paystack_fee_kobo` now means "the processor's charge on this
-- payment, whichever provider" and `paystack`/`paystack_fees`/`paystack_fee`
-- stay as they are. Renaming them everywhere is not worth the risk now
-- (docs/TODO.md).
--
-- Errors raised (P0001 are refusals the app shows):
--   P0001 not_admin               set_payment_provider: admins only
--   P0001 invalid_provider        a provider other than cray or paystack
--   P0001 reason_required         the reason must be 3 to 500 characters
--   P0001 already_active          switching to the provider already active
--   P0001 transfer_not_available  start_payment(..., 'transfer') unless Cray is active
--   22023 invalid_method          a method other than card or transfer

-- The switch ----------------------------------------------------------------------------------------

create table public.payment_provider_settings (
  id uuid primary key default gen_random_uuid(),
  -- The latest row wins. created_at is the transaction's start time, so two
  -- rows written in one transaction would tie on it; seq never does.
  seq bigint generated always as identity,
  provider text not null,
  changed_by uuid references public.users (id) on delete restrict,
  reason text not null,
  created_at timestamptz not null default now(),

  constraint payment_provider_settings_provider_check check (provider in ('cray', 'paystack')),
  constraint payment_provider_settings_reason_check check (
    reason = btrim(reason) and char_length(reason) between 3 and 500
  )
);

create unique index payment_provider_settings_seq_idx
  on public.payment_provider_settings (seq desc);

create trigger payment_provider_settings_append_only
  before update or delete on public.payment_provider_settings
  for each row execute function public.reject_change('payment_provider_settings_append_only');

create trigger payment_provider_settings_no_truncate
  before truncate on public.payment_provider_settings
  for each statement execute function public.reject_change('payment_provider_settings_append_only');

alter table public.payment_provider_settings enable always trigger payment_provider_settings_append_only;
alter table public.payment_provider_settings enable always trigger payment_provider_settings_no_truncate;

insert into public.payment_provider_settings (provider, changed_by, reason)
values ('cray', null, 'Default since 2026-11-21');

alter table public.payment_provider_settings enable row level security;
revoke all on table public.payment_provider_settings from anon, authenticated, service_role;
grant select on table public.payment_provider_settings to authenticated, service_role;

create policy "Payment provider settings: admins read"
  on public.payment_provider_settings for select to authenticated
  using ((select public.current_user_role()) = 'admin');

-- Which provider new payments and payouts start on. Everyone who starts one
-- needs the answer, so it is not behind the admin-only policy.
create function public.active_payment_provider()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.provider from public.payment_provider_settings s order by s.seq desc limit 1
$$;

create function public.set_payment_provider(new_provider text, change_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  cleaned text := btrim(coalesce(change_reason, ''));
begin
  if me is null or public.current_user_role() is distinct from 'admin' then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  if new_provider is null or new_provider not in ('cray', 'paystack') then
    raise exception 'invalid_provider' using errcode = 'P0001';
  end if;
  if char_length(cleaned) not between 3 and 500 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;

  -- Two admins switching at once: the second sees the first's row and is refused.
  perform pg_advisory_xact_lock(hashtext('payment_provider_switch'));
  if public.active_payment_provider() = new_provider then
    raise exception 'already_active' using errcode = 'P0001';
  end if;

  insert into public.payment_provider_settings (provider, changed_by, reason)
  values (new_provider, me, cleaned);
end;
$$;

revoke all on function public.active_payment_provider() from public, anon;
revoke all on function public.set_payment_provider(text, text) from public, anon;
grant execute on function public.active_payment_provider() to authenticated, service_role;
grant execute on function public.set_payment_provider(text, text) to authenticated;

-- Ledger accounts and events ----------------------------------------------------------------------

-- `cray` is cash held at Cray, `cray_fees` its charges when we bear them, and
-- `bank` is our own bank account (cash outside any provider).
alter table public.ledger_entries drop constraint ledger_entries_account_check;
alter table public.ledger_entries add constraint ledger_entries_account_check check (
  account in ('paystack', 'business_wallet', 'escrow', 'creator_wallet',
              'platform_revenue', 'paystack_fees', 'payout_in_flight',
              'cray', 'cray_fees', 'bank')
);

alter table public.ledger_entries drop constraint ledger_entries_event_type_check;
alter table public.ledger_entries add constraint ledger_entries_event_type_check check (
  event_type in ('payment_received', 'hire_funded', 'hire_settled', 'payout_requested',
                 'payout_rejected', 'payout_paid', 'payout_failed', 'paystack_fee', 'correction',
                 'deposit_received', 'processor_fee', 'cash_moved', 'payout_reversed')
);

create or replace function public.ledger_totals()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_object_agg(a.account, coalesce(t.total, 0))
    from unnest(array['paystack', 'business_wallet', 'escrow', 'creator_wallet',
                      'platform_revenue', 'paystack_fees', 'payout_in_flight',
                      'cray', 'cray_fees', 'bank']) as a (account)
    left join (
      select e.account, sum(e.amount_kobo) as total
        from public.ledger_entries e
       group by e.account
    ) t on t.account = a.account
$$;

-- Payments know their provider and method -------------------------------------------------------------

alter table public.payments
  add column provider text not null default 'paystack',
  add column method text not null default 'card';

alter table public.payments
  add constraint payments_provider_check check (provider in ('paystack', 'cray')),
  add constraint payments_method_check check (method in ('card', 'transfer', 'wallet'));

-- As before, plus: the cash line goes to the payment's provider account.
-- (Wallet-only payments have no cash line.)
create or replace function public.fund_engagement(payment uuid)
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
    lines := lines || jsonb_build_object('account', case p.provider when 'cray' then 'cray' else 'paystack' end,
                                         'amount', p.card_amount_kobo);
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

-- A new payment's provider comes from the switch (read inside this transaction),
-- and is then frozen on the row. A transfer payment waits for the business's
-- bank transfer instead of a card charge; the part to pay from outside the
-- wallet is stored in card_amount_kobo either way.
drop function public.start_payment(uuid, boolean);

create function public.start_payment(engagement uuid, fee_notice_seen boolean, method text default 'card')
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
  chosen text := public.active_payment_provider();
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
  if method is null or method not in ('card', 'transfer') then
    raise exception 'invalid_method' using errcode = '22023';
  end if;
  if method = 'transfer' and chosen <> 'cray' then
    raise exception 'transfer_not_available' using errcode = 'P0001';
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
                               card_amount_kobo, wallet_part_kobo, fee_notice_seen_at, provider, method)
  values (e.id, 'pit_' || replace(gen_random_uuid()::text, '-', ''), total, fee, cfg.id,
          total - wallet_part, wallet_part, now(), chosen, start_payment.method)
  returning * into new_payment;

  return jsonb_build_object(
    'payment_id', new_payment.id,
    'reference', new_payment.reference,
    'card_amount_kobo', new_payment.card_amount_kobo,
    'email', my_email,
    'provider', new_payment.provider,
    'method', new_payment.method
  );
end;
$$;

revoke all on function public.start_payment(uuid, boolean, text) from public, anon;
grant execute on function public.start_payment(uuid, boolean, text) to authenticated;

-- As before, plus the row records that it was paid from the wallet.
create or replace function public.pay_from_wallet(engagement uuid, fee_notice_seen boolean)
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
                               card_amount_kobo, wallet_part_kobo, status, fee_notice_seen_at,
                               provider, method)
  values (e.id, 'pit_' || replace(gen_random_uuid()::text, '-', ''), total, fee, cfg.id,
          0, total, 'succeeded', now(), public.active_payment_provider(), 'wallet')
  returning id into new_payment;

  if not public.fund_engagement(new_payment) then
    raise exception 'engagement_locked' using errcode = 'P0001';
  end if;
end;
$$;

-- As before, plus: the cash and the charge post to the payment's own provider
-- (Cray: `cray`, and `cray_fees` as `processor_fee` only when the charge is
-- above 0, since the business normally carries it). A card event for a
-- transfer payment is refused: that reference never went to a checkout.
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
  cash_account text;
begin
  insert into public.payment_events (event_key, payload)
  values (record_card_payment.event_key, coalesce(record_card_payment.payload, '{}'::jsonb))
  on conflict do nothing;
  if not found then
    return 'duplicate';
  end if;

  select * into p from public.payments x where x.reference = record_card_payment.reference;
  if p.id is null or p.method <> 'card' then
    raise exception 'no_such_payment' using errcode = 'P0001';
  end if;
  cash_account := case p.provider when 'cray' then 'cray' else 'paystack' end;

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
        jsonb_build_object('account', cash_account, 'amount', p.card_amount_kobo),
        jsonb_build_object('account', 'business_wallet', 'owner', business, 'amount', -p.card_amount_kobo)
      ));
    result := 'stranded';
  end if;

  if record_card_payment.paystack_fee_kobo > 0 then
    perform public.post_ledger_group(
      case p.provider when 'cray' then 'processor_fee' else 'paystack_fee' end,
      null, null, p.engagement_id, p.id, null, p.reference,
      p.fee_config_id,
      jsonb_build_array(
        jsonb_build_object('account', cash_account, 'amount', -record_card_payment.paystack_fee_kobo),
        jsonb_build_object('account', case p.provider when 'cray' then 'cray_fees' else 'paystack_fees' end,
                           'amount', record_card_payment.paystack_fee_kobo)
      ));
  end if;
  return result;
end;
$$;
