-- Bank-transfer deposits through a permanent Cray account per business
-- (docs/superpowers/specs/2026-11-21-cray-payments-design.md §5.3).
--
-- Invariants this migration protects:
--   1. A deposit is credited once. record_deposit() stores the event key first
--      (payment_events, unique); a repeat, or two at once, returns 'duplicate'
--      and writes nothing. Cray's signed webhook is the only evidence of a
--      deposit (there is no API to look one up), so the server checks the
--      signature before calling this; here the account reference AND number
--      must both match one of our accounts.
--   2. A deposit lands in the business wallet at what actually arrived: gross
--      minus Cray's charge. The business carries the charge; it never touches
--      our accounts. One `deposit_received` group: cray +net, business_wallet
--      -net.
--   3. A deposit funds a hire only if the business started a TRANSFER payment
--      for it (so the non-refundable-fee notice was seen and stored), the hire
--      is still awaiting payment and not lapsed, and the wallet now covers the
--      whole total. Oldest payment first; the first one the wallet cannot
--      cover stops the loop. Funding goes through fund_engagement(), the same
--      internals as a card payment or a wallet payment, and the transfer
--      payment is closed `succeeded` with a processor charge of 0 on our side,
--      so a creator-fault refund returns price plus fee in full.
--   4. Lock order stays users -> engagement -> payment, so a deposit races the
--      lapse, the business's cancel and a card payment safely.
--   5. An account the deposit names but we do not know (wrong reference or
--      wrong number) writes nothing, not even the event key, so Cray's retry
--      after we fix it is not swallowed as a duplicate.
--
-- fund_engagement() is replaced again: a TRANSFER payment is funded wholly from
-- the wallet (the deposit already put the money there), so its cash line is
-- skipped and the whole total is taken from the wallet. Card and wallet
-- payments behave exactly as before.
--
-- Errors raised:
--   P0001 not_a_business           deposit_account_reference: only businesses
--   P0001 no_such_deposit_account  complete_deposit_account: unknown reference
--   P0001 deposit_account_conflict complete_deposit_account: already set to other values
--   22023 invalid_deposit          record_deposit: gross <= 0, charge < 0 or charge >= gross

alter type public.notification_kind add value 'deposit_received';

-- Transfer accounts -----------------------------------------------------------------------------------------

create table public.deposit_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete restrict,
  provider text not null,
  -- pit_va_<32 hex>; sent to Cray as the account's reference, and what the
  -- deposit webhook names back as customer_reference.
  reference text not null unique,
  -- Our receiving account, not personal data, so stored in clear. All four
  -- are filled together once the provider has created the account.
  provider_account_id text,
  account_number text,
  bank_name text,
  account_name text,
  created_at timestamptz not null default now(),

  constraint deposit_accounts_provider_check check (provider in ('cray')),
  constraint deposit_accounts_reference_check check (reference ~ '^pit_va_[0-9a-f]{32}$'),
  constraint deposit_accounts_number_check check (account_number is null or account_number ~ '^[0-9]{10}$'),
  constraint deposit_accounts_complete_check check (
    (provider_account_id is null and account_number is null and bank_name is null and account_name is null)
    or (provider_account_id is not null and account_number is not null
        and bank_name is not null and account_name is not null)
  ),
  constraint deposit_accounts_one_per_provider unique (user_id, provider)
);

-- Two businesses can never share a receiving account number.
create unique index deposit_accounts_number_idx
  on public.deposit_accounts (account_number) where account_number is not null;

alter table public.deposit_accounts enable row level security;
revoke all on table public.deposit_accounts from anon, authenticated, service_role;
grant select on table public.deposit_accounts to authenticated, service_role;

create policy "Deposit accounts: the business's own completed account, admins"
  on public.deposit_accounts for select to authenticated
  using (
    (user_id = (select public.current_user_id()) and account_number is not null)
    or (select public.current_user_role()) = 'admin'
  );

-- Returns the business's account reference, creating the pending row the
-- first time. The server then asks Cray to create the account with this
-- reference (and retries with the same one if that times out).
create function public.deposit_account_reference(person uuid, which text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  found_reference text;
begin
  if not exists (select 1 from public.users u where u.id = person and u.role = 'business') then
    raise exception 'not_a_business' using errcode = 'P0001';
  end if;

  insert into public.deposit_accounts (user_id, provider, reference)
  values (person, which, 'pit_va_' || replace(gen_random_uuid()::text, '-', ''))
  on conflict (user_id, provider) do nothing;

  select a.reference into found_reference
    from public.deposit_accounts a
   where a.user_id = person and a.provider = which;
  return found_reference;
end;
$$;

-- Records what Cray created. Setting the same values again is a no-op; other
-- values for an account already set are refused.
create function public.complete_deposit_account(
  account_reference text,
  new_provider_account_id text,
  new_account_number text,
  new_bank_name text,
  new_account_name text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.deposit_accounts;
begin
  select * into a from public.deposit_accounts x where x.reference = account_reference for update;
  if a.id is null then
    raise exception 'no_such_deposit_account' using errcode = 'P0001';
  end if;
  if a.account_number is not null then
    if a.provider_account_id = new_provider_account_id and a.account_number = new_account_number
       and a.bank_name = new_bank_name and a.account_name = new_account_name then
      return;
    end if;
    raise exception 'deposit_account_conflict' using errcode = 'P0001';
  end if;
  update public.deposit_accounts x
     set provider_account_id = new_provider_account_id, account_number = new_account_number,
         bank_name = new_bank_name, account_name = new_account_name
   where x.id = a.id;
end;
$$;

-- Funding a transfer payment from the wallet -----------------------------------------------------------------------

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
  cash_kobo bigint;
  wallet_kobo bigint;
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

  -- A transfer payment's money is already in the wallet (the deposit put it
  -- there), so the whole total comes out of the wallet and no cash line is posted.
  if p.method = 'transfer' then
    cash_kobo := 0;
    wallet_kobo := p.total_kobo;
  else
    cash_kobo := p.card_amount_kobo;
    wallet_kobo := p.wallet_part_kobo;
  end if;

  if e.status <> 'awaiting_payment' then
    return false;
  end if;
  -- Past pay_by only a card or transfer payment started inside the 30-minute hold funds.
  if now() > e.pay_by
     and not ((p.card_amount_kobo > 0 or p.method = 'transfer') and p.created_at > now() - interval '30 minutes') then
    return false;
  end if;
  if public.wallet_balance(e.business_id, 'business_wallet') < wallet_kobo then
    return false;
  end if;

  lines := jsonb_build_array(
    jsonb_build_object('account', 'escrow', 'amount', -(p.total_kobo - p.business_fee_kobo)),
    jsonb_build_object('account', 'platform_revenue', 'amount', -p.business_fee_kobo)
  );
  if cash_kobo > 0 then
    lines := lines || jsonb_build_object('account', case p.provider when 'cray' then 'cray' else 'paystack' end,
                                         'amount', cash_kobo);
  end if;
  if wallet_kobo > 0 then
    lines := lines || jsonb_build_object('account', 'business_wallet', 'owner', e.business_id,
                                         'amount', wallet_kobo);
  end if;

  perform public.post_ledger_group(
    case when cash_kobo > 0 then 'payment_received' else 'hire_funded' end,
    case when cash_kobo > 0 then null else e.business_id end,
    null, e.id, p.id, null,
    case when cash_kobo > 0 then p.reference end,
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

-- A deposit arrives ------------------------------------------------------------------------------------------------

-- Returns {outcome, business_user_id, engagement_id, credited_kobo,
-- still_needed_kobo, wallet_after_kobo}. Outcomes: funded, funded_with_extra,
-- short, hire_ended, credited, duplicate, unknown_account.
create function public.record_deposit(
  deposit_provider text,
  account_reference text,
  account_number text,
  deposit_reference text,
  gross_kobo bigint,
  charge_kobo bigint,
  event_key text,
  payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  acct public.deposit_accounts;
  net bigint;
  cand record;
  e public.engagements;
  p public.payments;
  cash_account text;
  held boolean;
  bal bigint;
  funded_count integer := 0;
  funded_engagement uuid;
  ended_engagement uuid;
  short_engagement uuid;
  still_needed bigint;
  outcome text;
  named uuid;
  title text;
  creator uuid;
begin
  if deposit_provider is distinct from 'cray' then
    raise exception 'invalid_deposit' using errcode = '22023';
  end if;
  if gross_kobo is null or charge_kobo is null or gross_kobo <= 0 or charge_kobo < 0 or charge_kobo >= gross_kobo then
    raise exception 'invalid_deposit' using errcode = '22023';
  end if;
  net := gross_kobo - charge_kobo;
  cash_account := 'cray';

  -- Both the reference and the number must match one of our accounts. Looked up
  -- before the event key is stored, so an unknown account leaves no trace.
  select * into acct from public.deposit_accounts a
   where a.reference = account_reference and a.account_number = record_deposit.account_number
     and a.provider = deposit_provider;
  if acct.id is null then
    return jsonb_build_object('outcome', 'unknown_account');
  end if;

  insert into public.payment_events (event_key, payload)
  values (record_deposit.event_key, coalesce(record_deposit.payload, '{}'::jsonb))
  on conflict do nothing;
  if not found then
    return jsonb_build_object('outcome', 'duplicate');
  end if;

  -- Lock order: the business, then each engagement, then its payment.
  perform 1 from public.users u where u.id = acct.user_id for no key update;

  perform public.post_ledger_group('deposit_received', null, null, null, null, null, deposit_reference, null,
    jsonb_build_array(
      jsonb_build_object('account', cash_account, 'amount', net),
      jsonb_build_object('account', 'business_wallet', 'owner', acct.user_id, 'amount', -net)
    ));

  for cand in
    select x.id as payment_id, x.engagement_id
      from public.payments x
      join public.engagements g on g.id = x.engagement_id
     where g.business_id = acct.user_id and x.method = 'transfer' and x.status = 'initiated'
     order by x.created_at, x.id
  loop
    select * into e from public.engagements g where g.id = cand.engagement_id for update;
    select * into p from public.payments x where x.id = cand.payment_id for update;
    if p.status <> 'initiated' then
      continue;
    end if;

    held := p.created_at > now() - interval '30 minutes';
    if e.status <> 'awaiting_payment' or (now() > e.pay_by and not held) then
      update public.payments x set status = 'failed', updated_at = now() where x.id = p.id;
      ended_engagement := coalesce(ended_engagement, e.id);
      continue;
    end if;

    bal := public.wallet_balance(acct.user_id, 'business_wallet');
    if bal < p.total_kobo then
      short_engagement := e.id;
      still_needed := p.total_kobo - bal;
      exit;
    end if;

    update public.payments x
       set status = 'succeeded', paystack_fee_kobo = 0, updated_at = now()
     where x.id = p.id;
    if public.fund_engagement(p.id) then
      funded_count := funded_count + 1;
      funded_engagement := e.id;
    else
      update public.payments x set status = 'failed', updated_at = now() where x.id = p.id;
      ended_engagement := coalesce(ended_engagement, e.id);
    end if;
  end loop;

  bal := public.wallet_balance(acct.user_id, 'business_wallet');
  if short_engagement is not null then
    outcome := 'short';
    named := short_engagement;
  elsif funded_count > 0 then
    outcome := case when bal > 0 then 'funded_with_extra' else 'funded' end;
    named := funded_engagement;
  elsif ended_engagement is not null then
    outcome := 'hire_ended';
    named := ended_engagement;
  else
    outcome := 'credited';
    -- A hire still waiting for payment with no transfer payment behind it: the
    -- notice points the business at paying it from the wallet.
    select g.id into named
      from public.engagements g
     where g.business_id = acct.user_id and g.status = 'awaiting_payment' and g.pay_by > now()
     order by g.pay_by, g.id
     limit 1;
  end if;

  if named is not null then
    select k.title, g.creator_id into title, creator
      from public.engagements g join public.campaigns k on k.id = g.campaign_id
     where g.id = named;
  end if;

  perform public.notify(acct.user_id, 'deposit_received', jsonb_strip_nulls(jsonb_build_object(
    'amount_sent_kobo', gross_kobo,
    'charge_kobo', charge_kobo,
    'credited_kobo', net,
    'outcome', outcome,
    'engagement_id', named,
    'engagement_title', title,
    'name', case when creator is not null then public.display_name_of(creator) end,
    'still_needed_kobo', still_needed,
    'wallet_after_kobo', bal)));

  return jsonb_strip_nulls(jsonb_build_object(
    'outcome', outcome,
    'business_user_id', acct.user_id,
    'engagement_id', named,
    'credited_kobo', net,
    'still_needed_kobo', still_needed,
    'wallet_after_kobo', bal));
end;
$$;

-- Function grants ----------------------------------------------------------------------------------------------------

revoke all on function public.deposit_account_reference(uuid, text) from public, anon, authenticated;
revoke all on function public.complete_deposit_account(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.record_deposit(text, text, text, text, bigint, bigint, text, jsonb)
  from public, anon, authenticated;

grant execute on function public.deposit_account_reference(uuid, text) to service_role;
grant execute on function public.complete_deposit_account(text, text, text, text, text) to service_role;
grant execute on function public.record_deposit(text, text, text, text, bigint, bigint, text, jsonb) to service_role;
