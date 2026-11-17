-- Bank accounts and admin-approved payouts (Stage 6).
-- Design: docs/superpowers/specs/2026-11-13-stage-6-money-design.md §2, §3 "Payouts", §4, §11 calls 4–5, §12;
-- CLAUDE.md §6 rules 2, 4, 8 and §6.5.
--
-- Invariants this migration protects:
--   1. A payout moves only requested → processing (approve) → paid | failed,
--      or requested → rejected. paid, failed and rejected are final. Each
--      function checks the status under the row lock, so a double click, a
--      repeated webhook or two admins at once change nothing the second time.
--   2. Lock order, in every function: the creator's users row, then the
--      payout. The wallet balance is read after the users lock, so two
--      requests at once can never overdraw the wallet.
--   3. Every money move is one balanced ledger group (Task 2 signs: cash
--      positive, liabilities negative):
--        request   payout_requested  creator_wallet +amount, payout_in_flight −amount
--        reject    payout_rejected   payout_in_flight +amount, creator_wallet −amount
--        paid      payout_paid       payout_in_flight +amount, paystack −amount
--        failed    payout_failed     payout_in_flight +amount, creator_wallet −amount
--      `amount` is the gross wallet debit: Paystack sends amount − transfer fee
--      and charges the fee, so cash falls by the whole amount and the platform
--      nets 0. Approval moves no money; cash leaves the ledger only when
--      Paystack confirms the transfer.
--   4. The transfer fee and the destination (bank, last four digits, account
--      name, recipient code) are copied onto the payout at request time.
--      Approval returns those copies, so changing the bank account later
--      cannot redirect a payout already requested.
--   5. Paystack events are processed once: finish_payout() stores the event key
--      first (unique, shared with card payments) and returns 'duplicate' on a
--      repeat. A repeated outcome is 'duplicate'; a contradicting one after a
--      final state (failed after paid) is 'ignored' and moves nothing.
--   6. No full account number is ever stored, only the last four digits.
--   7. Suspension is not forfeiture (CLAUDE.md §6.5): a suspended creator can
--      save an account and request payouts, and admins approve them as usual.
--
-- Errors raised (P0001 are refusals the app shows, see src/lib/refusals.ts):
--   P0001 no_bank_account            request_payout: no saved bank account
--   P0001 payout_too_small           below fee_config.min_payout_kobo
--   P0001 payout_fee_too_high        the transfer fee is the whole amount or more
--   P0001 payout_not_enough_balance  more than the wallet holds
--   P0001 not_allowed                approve/reject: the caller isn't an admin
--   P0001 no_such_payout             unknown payout id or transfer reference
--   P0001 payout_not_pending         approve/reject a payout that isn't `requested`
--   P0001 payout_reason_required     reject: reason blank or over 500 characters
--   22023 invalid_bank_account       save_bank_account: malformed details (the
--                                    server builds them from Paystack's answer)
--   22023 invalid_outcome            finish_payout: outcome not paid or failed
--   22023 invalid_amount             transfer_fee_for: amount null or below 1 kobo

-- Bank accounts ---------------------------------------------------------------------------------------

create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete restrict,
  bank_code text not null,
  bank_name text not null,
  last4 text not null,
  account_name text not null,
  -- Paystack's transfer recipient, created by the server after name resolution.
  recipient_code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint bank_accounts_last4_check check (last4 ~ '^[0-9]{4}$'),
  constraint bank_accounts_text_check check (
    bank_code = btrim(bank_code) and char_length(bank_code) between 1 and 200
    and bank_name = btrim(bank_name) and char_length(bank_name) between 1 and 200
    and account_name = btrim(account_name) and char_length(account_name) between 1 and 200
    and recipient_code = btrim(recipient_code) and char_length(recipient_code) between 1 and 200
  )
);

-- Payouts ------------------------------------------------------------------------------------------------

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete restrict,
  -- The gross wallet debit; the bank receives amount_kobo − transfer_fee_kobo.
  amount_kobo bigint not null,
  transfer_fee_kobo bigint not null,
  fee_config_id uuid not null references public.fee_config (id) on delete restrict,
  status text not null default 'requested',
  -- The destination when the payout was requested (invariant 4).
  bank_name text not null,
  last4 text not null,
  account_name text not null,
  recipient_code text not null,
  -- pit_po_<payout id without dashes>, fixed at approval and sent to Paystack.
  reference text unique,
  approved_by uuid references public.users (id) on delete restrict,
  approved_at timestamptz,
  decision_reason text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payouts_status_check check (status in ('requested', 'processing', 'paid', 'failed', 'rejected')),
  constraint payouts_amounts_check check (
    amount_kobo > 0 and transfer_fee_kobo >= 0 and transfer_fee_kobo < amount_kobo
  ),
  constraint payouts_reference_check check (reference ~ '^pit_po_[0-9a-f]{32}$'),
  -- Approved payouts, and only those, carry the approver, time and reference.
  constraint payouts_approval_check check (
    (status in ('requested', 'rejected') and reference is null and approved_by is null and approved_at is null)
    or (status in ('processing', 'paid', 'failed') and reference is not null and approved_by is not null
        and approved_at is not null)
  ),
  constraint payouts_reason_check check (
    (status = 'rejected') = (decision_reason is not null)
    and (decision_reason is null
         or (decision_reason = btrim(decision_reason) and char_length(decision_reason) between 1 and 500))
  ),
  constraint payouts_paid_check check ((status = 'paid') = (paid_at is not null))
);

create index payouts_user_idx on public.payouts (user_id, created_at desc);
-- The admin queue and the stuck-transfer poll.
create index payouts_open_idx on public.payouts (created_at) where status in ('requested', 'processing');

alter table public.ledger_entries
  add constraint ledger_entries_payout_fk
  foreign key (payout_id) references public.payouts (id) on delete restrict;

-- Internal helpers --------------------------------------------------------------------------------

-- What the creator pays Paystack for a transfer of amount_kobo, from the
-- current fee_config: the tier fee plus stamp duty from its threshold up.
-- Matches transferFee() in src/lib/fees.ts.
create function public.transfer_fee_for(amount_kobo bigint)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cfg public.fee_config := public.current_fee_config();
  tier_fee bigint;
begin
  if amount_kobo is null or amount_kobo < 1 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  select (t.tier ->> 'fee_kobo')::bigint into tier_fee
    from jsonb_array_elements(cfg.transfer_fee_tiers) with ordinality as t (tier, n)
   where t.tier ->> 'up_to_kobo' is null or amount_kobo <= (t.tier ->> 'up_to_kobo')::bigint
   order by t.n
   limit 1;
  if tier_fee is null then
    raise exception 'transfer_fee_tiers_incomplete' using errcode = 'P0001';
  end if;

  return tier_fee + case when amount_kobo >= cfg.transfer_stamp_duty_from_kobo
                         then cfg.transfer_stamp_duty_kobo else 0 end;
end;
$$;

-- For the creator ---------------------------------------------------------------------------------------

-- Saves (or replaces) the creator's payout account. The server resolves the
-- account name and creates the Paystack recipient first; only the last four
-- digits reach the database. Replacing it affects later payouts only.
create function public.save_bank_account(
  bank_code text,
  bank_name text,
  last4 text,
  account_name text,
  recipient_code text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  clean text[] := array[btrim(bank_code), btrim(bank_name), btrim(account_name), btrim(recipient_code)];
begin
  if me is null or public.current_user_role() is distinct from 'influencer' then
    raise exception 'creators save payout accounts' using errcode = '42501';
  end if;
  if last4 is null or last4 !~ '^[0-9]{4}$'
     or exists (select 1 from unnest(clean) c where c is null or c = '' or char_length(c) > 200) then
    raise exception 'invalid_bank_account' using errcode = '22023';
  end if;

  perform 1 from public.users u where u.id = me for no key update;
  insert into public.bank_accounts as b (user_id, bank_code, bank_name, last4, account_name, recipient_code)
  values (me, clean[1], clean[2], last4, clean[3], clean[4])
  on conflict (user_id) do update
     set bank_code = excluded.bank_code, bank_name = excluded.bank_name, last4 = excluded.last4,
         account_name = excluded.account_name, recipient_code = excluded.recipient_code, updated_at = now();
end;
$$;

-- Moves amount_kobo from the creator's wallet into payout_in_flight and
-- creates the payout as `requested`. No money leaves until an admin approves
-- and Paystack confirms.
create function public.request_payout(amount_kobo bigint)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  cfg public.fee_config := public.current_fee_config();
  account public.bank_accounts;
  fee bigint;
  new_payout uuid;
begin
  if me is null or public.current_user_role() is distinct from 'influencer' then
    raise exception 'creators request payouts' using errcode = '42501';
  end if;

  -- Lock the creator first: the balance below is read under this lock.
  perform 1 from public.users u where u.id = me for no key update;

  select * into account from public.bank_accounts b where b.user_id = me;
  if account.id is null then
    raise exception 'no_bank_account' using errcode = 'P0001';
  end if;
  if amount_kobo is null or amount_kobo < cfg.min_payout_kobo then
    raise exception 'payout_too_small' using errcode = 'P0001';
  end if;
  fee := public.transfer_fee_for(amount_kobo);
  if fee >= amount_kobo then
    raise exception 'payout_fee_too_high' using errcode = 'P0001';
  end if;
  if public.wallet_balance(me, 'creator_wallet') < amount_kobo then
    raise exception 'payout_not_enough_balance' using errcode = 'P0001';
  end if;

  insert into public.payouts (user_id, amount_kobo, transfer_fee_kobo, fee_config_id,
                              bank_name, last4, account_name, recipient_code)
  values (me, amount_kobo, fee, cfg.id,
          account.bank_name, account.last4, account.account_name, account.recipient_code)
  returning id into new_payout;

  perform public.post_ledger_group('payout_requested', me, null, null, null, new_payout, null, cfg.id,
    jsonb_build_array(
      jsonb_build_object('account', 'creator_wallet', 'owner', me, 'amount', amount_kobo),
      jsonb_build_object('account', 'payout_in_flight', 'amount', -amount_kobo)
    ));
  return new_payout;
end;
$$;

-- For admins ---------------------------------------------------------------------------------------------

-- requested → processing. Fixes the transfer reference and returns what the
-- server sends to Paystack: the destination saved at request time.
create function public.approve_payout(payout uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  creator uuid;
  p public.payouts;
begin
  if me is null or public.current_user_role() is distinct from 'admin' then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  select x.user_id into creator from public.payouts x where x.id = payout;
  if creator is null then
    raise exception 'no_such_payout' using errcode = 'P0001';
  end if;
  perform 1 from public.users u where u.id = creator for no key update;
  select * into p from public.payouts x where x.id = payout for update;
  if p.status <> 'requested' then
    raise exception 'payout_not_pending' using errcode = 'P0001';
  end if;

  update public.payouts x
     set status = 'processing', approved_by = me, approved_at = now(),
         reference = 'pit_po_' || replace(p.id::text, '-', ''), updated_at = now()
   where x.id = p.id
  returning * into p;

  return jsonb_build_object(
    'reference', p.reference,
    'recipient_code', p.recipient_code,
    'send_kobo', p.amount_kobo - p.transfer_fee_kobo,
    'bank_name', p.bank_name,
    'last4', p.last4,
    'account_name', p.account_name
  );
end;
$$;

-- requested → rejected, with a written reason; the amount goes back to the wallet.
create function public.reject_payout(payout uuid, reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  clean_reason text := btrim(reason);
  creator uuid;
  p public.payouts;
begin
  if me is null or public.current_user_role() is distinct from 'admin' then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if clean_reason is null or clean_reason = '' or char_length(clean_reason) > 500 then
    raise exception 'payout_reason_required' using errcode = 'P0001';
  end if;

  select x.user_id into creator from public.payouts x where x.id = payout;
  if creator is null then
    raise exception 'no_such_payout' using errcode = 'P0001';
  end if;
  perform 1 from public.users u where u.id = creator for no key update;
  select * into p from public.payouts x where x.id = payout for update;
  if p.status <> 'requested' then
    raise exception 'payout_not_pending' using errcode = 'P0001';
  end if;

  update public.payouts x
     set status = 'rejected', decision_reason = clean_reason, updated_at = now()
   where x.id = p.id;

  perform public.post_ledger_group('payout_rejected', me, clean_reason, null, null, p.id, null, p.fee_config_id,
    jsonb_build_array(
      jsonb_build_object('account', 'payout_in_flight', 'amount', p.amount_kobo),
      jsonb_build_object('account', 'creator_wallet', 'owner', p.user_id, 'amount', -p.amount_kobo)
    ));
end;
$$;

-- For the server (webhook and the stuck-transfer poll) ------------------------------------------------

-- Records Paystack's final word on a transfer. The caller has verified it
-- with Paystack (for a failure, by fetching the transfer first, spec §11.4).
-- Returns 'paid', 'failed', 'duplicate' or 'ignored'.
create function public.finish_payout(reference text, outcome text, event_key text, payload jsonb)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  creator uuid;
  p public.payouts;
begin
  if outcome is null or outcome not in ('paid', 'failed') then
    raise exception 'invalid_outcome' using errcode = '22023';
  end if;

  insert into public.payment_events (event_key, payload)
  values (finish_payout.event_key, coalesce(finish_payout.payload, '{}'::jsonb))
  on conflict do nothing;
  if not found then
    return 'duplicate';
  end if;

  select x.user_id into creator from public.payouts x where x.reference = finish_payout.reference;
  if creator is null then
    raise exception 'no_such_payout' using errcode = 'P0001';
  end if;
  perform 1 from public.users u where u.id = creator for no key update;
  select * into p from public.payouts x where x.reference = finish_payout.reference for update;

  if p.status = outcome then
    return 'duplicate';
  end if;
  if p.status <> 'processing' then
    return 'ignored';
  end if;

  if outcome = 'paid' then
    update public.payouts x set status = 'paid', paid_at = now(), updated_at = now() where x.id = p.id;
    perform public.post_ledger_group('payout_paid', null, null, null, null, p.id, p.reference, p.fee_config_id,
      jsonb_build_array(
        jsonb_build_object('account', 'payout_in_flight', 'amount', p.amount_kobo),
        jsonb_build_object('account', 'paystack', 'amount', -p.amount_kobo)
      ));
  else
    update public.payouts x set status = 'failed', updated_at = now() where x.id = p.id;
    perform public.post_ledger_group('payout_failed', null, null, null, null, p.id, p.reference, p.fee_config_id,
      jsonb_build_array(
        jsonb_build_object('account', 'payout_in_flight', 'amount', p.amount_kobo),
        jsonb_build_object('account', 'creator_wallet', 'owner', p.user_id, 'amount', -p.amount_kobo)
      ));
  end if;
  return outcome;
end;
$$;

-- Function grants ---------------------------------------------------------------------------------

revoke all on function public.transfer_fee_for(bigint) from public, anon, authenticated;
revoke all on function public.save_bank_account(text, text, text, text, text) from public, anon;
revoke all on function public.request_payout(bigint) from public, anon;
revoke all on function public.approve_payout(uuid) from public, anon;
revoke all on function public.reject_payout(uuid, text) from public, anon;
revoke all on function public.finish_payout(text, text, text, jsonb) from public, anon, authenticated;

grant execute on function public.transfer_fee_for(bigint) to service_role;
grant execute on function public.save_bank_account(text, text, text, text, text) to authenticated;
grant execute on function public.request_payout(bigint) to authenticated;
grant execute on function public.approve_payout(uuid) to authenticated;
grant execute on function public.reject_payout(uuid, text) to authenticated;
grant execute on function public.finish_payout(text, text, text, jsonb) to service_role;

-- Table grants and row level security -----------------------------------------------------------

alter table public.bank_accounts enable row level security;
alter table public.payouts enable row level security;

-- Writes only through the functions above.
revoke all on table public.bank_accounts from anon, authenticated, service_role;
revoke all on table public.payouts from anon, authenticated, service_role;
grant select on table public.bank_accounts to authenticated, service_role;
grant select on table public.payouts to authenticated, service_role;

create policy "Bank accounts: the owner, admins"
  on public.bank_accounts for select to authenticated
  using (
    user_id = (select public.current_user_id())
    or (select public.current_user_role()) = 'admin'
  );

create policy "Payouts: the owner, admins"
  on public.payouts for select to authenticated
  using (
    user_id = (select public.current_user_id())
    or (select public.current_user_role()) = 'admin'
  );
