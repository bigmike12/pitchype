-- Bank accounts and payouts per provider (docs/superpowers/specs/2026-11-21-cray-payments-design.md §5.4, §5.6).
--
-- Invariants this migration protects:
--   1. A creator holds one bank account PER PROVIDER. A payout snapshots the
--      account for the provider that is active when it is requested, together
--      with that provider's transfer cost, and is sent only through that
--      provider. Changing the switch or the bank account later cannot redirect
--      or re-route a payout already requested.
--   2. The full account number of a Cray account is stored only encrypted
--      (`v1:` ciphertext made by src/lib/account-crypto.ts); only the last four
--      digits are ever shown. The database never sees the key.
--   3. A payout is never sent twice and never re-credited for money that may
--      have gone out. The provider's id is set once (record_payout_send);
--      `waiting_for_funds` (Cray refused: nothing sent) and `needs_reference`
--      (Cray rejected our reference as a duplicate: it may have been sent) both
--      leave the payout `processing`; only a verified provider answer finishes it.
--   4. finish_payout() keeps its idempotency rules (event key first; a repeated
--      outcome is 'duplicate'; a contradicting one after a final state is
--      'ignored'), with ONE exception, for Cray only: a payout recorded `paid`
--      whose verified requery says reversed moves to the final status `reversed`
--      and the money Cray returned goes back to the creator's wallet. A second
--      reversal is a duplicate.
--   5. Cash leaves the provider's own account. A Cray payout is paid out as
--      amount sent + Cray's actual charge; if that differs from the payout's
--      gross amount_kobo (the creator's snapshotted transfer fee differs from
--      Cray's real charge) the difference is booked to `cray_fees` in the same
--      group, never charged to the creator after the fact.
--   6. Lock order stays: the creator's users row, then the payout.
--
-- Ledger groups added or changed (signs: cash and expense positive, liabilities negative):
--   paid on Cray     payout_paid:     payout_in_flight +amount, cray −(sent+charge), cray_fees +(sent+charge−amount) when not 0
--   reversed on Cray payout_reversed: cray +returned, creator_wallet −returned
--
-- Errors raised (P0001 are refusals the app shows):
--   P0001 not_allowed               attach_payout_reference: not an admin
--   P0001 no_such_payout            unknown payout, reference or id
--   P0001 payout_not_flaggable      flag_payout: not a processing Cray payout
--   P0001 payout_not_attachable     attach_payout_reference: not a processing Cray payout without an id
--   P0001 payout_not_processing     record_payout_send: the payout isn't processing
--   P0001 payout_amount_mismatch    finish_payout: Cray paid an amount other than amount − transfer fee
--   22023 invalid_bank_account      save_cray_bank_account_for: malformed details
--   22023 invalid_outcome / invalid_amount   finish_payout: bad outcome (reversed on a Paystack payout
--                                            included) or missing figures

alter type public.notification_kind add value 'payout_reversed';

-- Bank accounts: one per user per provider -----------------------------------------------------------------

alter table public.bank_accounts
  add column provider text not null default 'paystack',
  add column account_number_encrypted text;

alter table public.bank_accounts drop constraint bank_accounts_user_id_key;
alter table public.bank_accounts add constraint bank_accounts_user_provider_key unique (user_id, provider);
alter table public.bank_accounts alter column recipient_code drop not null;

alter table public.bank_accounts
  add constraint bank_accounts_provider_check check (provider in ('paystack', 'cray')),
  add constraint bank_accounts_provider_details_check check (
    (provider = 'paystack' and recipient_code is not null and account_number_encrypted is null)
    or (provider = 'cray' and recipient_code is null and account_number_encrypted like 'v1:%')
  );

-- The upsert conflict target changed with the unique constraint. Both save
-- functions keep working for Paystack accounts.
create or replace function public.save_bank_account(
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
  insert into public.bank_accounts as b (user_id, provider, bank_code, bank_name, last4, account_name, recipient_code)
  values (me, 'paystack', clean[1], clean[2], last4, clean[3], clean[4])
  on conflict (user_id, provider) do update
     set bank_code = excluded.bank_code, bank_name = excluded.bank_name, last4 = excluded.last4,
         account_name = excluded.account_name, recipient_code = excluded.recipient_code, updated_at = now();
end;
$$;

create or replace function public.save_bank_account_for(
  person uuid,
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
  clean text[] := array[btrim(bank_code), btrim(bank_name), btrim(account_name), btrim(recipient_code)];
begin
  -- Lock the creator first, as request_payout() does.
  perform 1 from public.users u where u.id = person and u.role = 'influencer' for no key update;
  if not found then
    raise exception 'creators save payout accounts' using errcode = '42501';
  end if;
  if last4 is null or last4 !~ '^[0-9]{4}$'
     or exists (select 1 from unnest(clean) c where c is null or c = '' or char_length(c) > 200) then
    raise exception 'invalid_bank_account' using errcode = '22023';
  end if;

  insert into public.bank_accounts as b (user_id, provider, bank_code, bank_name, last4, account_name, recipient_code)
  values (person, 'paystack', clean[1], clean[2], last4, clean[3], clean[4])
  on conflict (user_id, provider) do update
     set bank_code = excluded.bank_code, bank_name = excluded.bank_name, last4 = excluded.last4,
         account_name = excluded.account_name, recipient_code = excluded.recipient_code, updated_at = now();
end;
$$;

-- The server saves a Cray account after Cray validated it and the number was
-- encrypted. Only the last four digits and the ciphertext are stored.
create function public.save_cray_bank_account_for(
  person uuid,
  bank_code text,
  bank_name text,
  last4 text,
  account_name text,
  encrypted_number text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  clean text[] := array[btrim(bank_code), btrim(bank_name), btrim(account_name)];
begin
  perform 1 from public.users u where u.id = person and u.role = 'influencer' for no key update;
  if not found then
    raise exception 'creators save payout accounts' using errcode = '42501';
  end if;
  if last4 is null or last4 !~ '^[0-9]{4}$'
     or encrypted_number is null or encrypted_number not like 'v1:%' or char_length(encrypted_number) > 500
     or exists (select 1 from unnest(clean) c where c is null or c = '' or char_length(c) > 200) then
    raise exception 'invalid_bank_account' using errcode = '22023';
  end if;

  insert into public.bank_accounts as b (user_id, provider, bank_code, bank_name, last4, account_name,
                                         recipient_code, account_number_encrypted)
  values (person, 'cray', clean[1], clean[2], last4, clean[3], null, encrypted_number)
  on conflict (user_id, provider) do update
     set bank_code = excluded.bank_code, bank_name = excluded.bank_name, last4 = excluded.last4,
         account_name = excluded.account_name, account_number_encrypted = excluded.account_number_encrypted,
         updated_at = now();
end;
$$;

-- Payouts know their provider and carry what Cray needs ------------------------------------------------------------

alter table public.payouts
  add column provider text not null default 'paystack',
  add column bank_code text,
  add column account_number_encrypted text,
  -- Cray's own id for the transfer; set once. Cray looks a payout up only by it.
  add column provider_reference text unique,
  -- Cray refused the send because its Main Balance is short: nothing was sent.
  add column waiting_for_funds boolean not null default false,
  -- Cray rejected our reference as a duplicate: it may have been sent, so an admin attaches Cray's id.
  add column needs_reference boolean not null default false,
  -- What Cray reported sending and charging, from the verified requery.
  add column sent_kobo bigint,
  add column provider_charge_kobo bigint,
  -- What went back to the wallet if Cray reversed a payout it had paid.
  add column reversed_kobo bigint,
  add column reference_attached_by uuid references public.users (id) on delete restrict,
  add column reference_attached_at timestamptz;

alter table public.payouts alter column recipient_code drop not null;

alter table public.payouts drop constraint payouts_status_check;
alter table public.payouts add constraint payouts_status_check check (
  status in ('requested', 'processing', 'paid', 'failed', 'rejected', 'reversed')
);

alter table public.payouts drop constraint payouts_approval_check;
alter table public.payouts add constraint payouts_approval_check check (
  (status in ('requested', 'rejected') and reference is null and approved_by is null and approved_at is null)
  or (status in ('processing', 'paid', 'failed', 'reversed') and reference is not null and approved_by is not null
      and approved_at is not null)
);

alter table public.payouts drop constraint payouts_paid_check;
alter table public.payouts add constraint payouts_paid_check check (
  (status in ('paid', 'reversed')) = (paid_at is not null)
);

alter table public.payouts
  add constraint payouts_provider_check check (provider in ('paystack', 'cray')),
  add constraint payouts_provider_details_check check (
    (provider = 'paystack' and recipient_code is not null and account_number_encrypted is null
       and provider_reference is null and not waiting_for_funds and not needs_reference)
    or (provider = 'cray' and recipient_code is null and bank_code is not null
        and account_number_encrypted like 'v1:%')
  ),
  add constraint payouts_flags_check check (
    (not waiting_for_funds and not needs_reference) or status = 'processing'
  ),
  add constraint payouts_reversed_check check ((status = 'reversed') = (reversed_kobo is not null));

-- Fees by provider ------------------------------------------------------------------------------------------------------

-- What the creator pays the provider to send `amount_kobo`, from the current
-- fee_config: Paystack from its original columns (as transfer_fee_for), Cray
-- from provider_fees. Matches payoutTransferFee() in src/lib/fees.ts.
create function public.payout_fee_for(which text, amount_kobo bigint)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cfg public.fee_config := public.current_fee_config();
  payout jsonb;
  tier_fee bigint;
  stamp bigint;
  stamp_from bigint;
begin
  if which = 'paystack' then
    return public.transfer_fee_for(amount_kobo);
  end if;
  if amount_kobo is null or amount_kobo < 1 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  payout := cfg.provider_fees -> which -> 'payout';
  if payout is null then
    raise exception 'payout_fee_not_configured' using errcode = 'P0001';
  end if;

  select (t.tier ->> 'fee_kobo')::bigint into tier_fee
    from jsonb_array_elements(payout -> 'tiers') with ordinality as t (tier, n)
   where t.tier ->> 'up_to_kobo' is null or amount_kobo <= (t.tier ->> 'up_to_kobo')::bigint
   order by t.n
   limit 1;
  if tier_fee is null then
    raise exception 'transfer_fee_tiers_incomplete' using errcode = 'P0001';
  end if;
  stamp := coalesce((payout ->> 'stamp_duty_kobo')::bigint, 0);
  stamp_from := coalesce((payout ->> 'stamp_duty_from_kobo')::bigint, 0);
  return tier_fee + case when stamp > 0 and amount_kobo >= stamp_from then stamp else 0 end;
end;
$$;

-- Requesting: snapshot the active provider's account and cost -------------------------------------------------------

create or replace function public.request_payout(amount_kobo bigint)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  cfg public.fee_config := public.current_fee_config();
  chosen text := public.active_payment_provider();
  account public.bank_accounts;
  fee bigint;
  new_payout uuid;
begin
  if me is null or public.current_user_role() is distinct from 'influencer' then
    raise exception 'creators request payouts' using errcode = '42501';
  end if;

  -- Lock the creator first: the balance below is read under this lock.
  perform 1 from public.users u where u.id = me for no key update;

  select * into account from public.bank_accounts b where b.user_id = me and b.provider = chosen;
  if account.id is null then
    raise exception 'no_bank_account' using errcode = 'P0001';
  end if;
  if amount_kobo is null or amount_kobo < cfg.min_payout_kobo then
    raise exception 'payout_too_small' using errcode = 'P0001';
  end if;
  fee := public.payout_fee_for(chosen, amount_kobo);
  if fee >= amount_kobo then
    raise exception 'payout_fee_too_high' using errcode = 'P0001';
  end if;
  if public.wallet_balance(me, 'creator_wallet') < amount_kobo then
    raise exception 'payout_not_enough_balance' using errcode = 'P0001';
  end if;

  insert into public.payouts (user_id, amount_kobo, transfer_fee_kobo, fee_config_id, provider,
                              bank_code, bank_name, last4, account_name, recipient_code, account_number_encrypted)
  values (me, amount_kobo, fee, cfg.id, chosen,
          account.bank_code, account.bank_name, account.last4, account.account_name,
          account.recipient_code, account.account_number_encrypted)
  returning id into new_payout;

  perform public.post_ledger_group('payout_requested', me, null, null, null, new_payout, null, cfg.id,
    jsonb_build_array(
      jsonb_build_object('account', 'creator_wallet', 'owner', me, 'amount', amount_kobo),
      jsonb_build_object('account', 'payout_in_flight', 'amount', -amount_kobo)
    ));
  return new_payout;
end;
$$;

-- Approving returns what the server sends: Paystack's shape is unchanged; Cray adds the encrypted number and bank code ---

create or replace function public.approve_payout(payout uuid)
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

  if p.provider = 'paystack' then
    -- Exactly what it has always returned.
    return jsonb_build_object(
      'reference', p.reference,
      'recipient_code', p.recipient_code,
      'send_kobo', p.amount_kobo - p.transfer_fee_kobo,
      'bank_name', p.bank_name,
      'last4', p.last4,
      'account_name', p.account_name
    );
  end if;
  return jsonb_build_object(
    'reference', p.reference,
    'provider', p.provider,
    'bank_code', p.bank_code,
    'account_number_encrypted', p.account_number_encrypted,
    'send_kobo', p.amount_kobo - p.transfer_fee_kobo,
    'bank_name', p.bank_name,
    'last4', p.last4,
    'account_name', p.account_name
  );
end;
$$;

-- Sending: Cray's id, the two "nothing settles" flags, and an admin attaching the id --------------------------------

-- Sets Cray's id for a payout, once. 'set', 'already_set' (same id again) or 'conflict' (another id).
create function public.record_payout_send(payout_reference text, new_provider_reference text)
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
  select x.user_id into creator from public.payouts x where x.reference = payout_reference;
  if creator is null then
    raise exception 'no_such_payout' using errcode = 'P0001';
  end if;
  perform 1 from public.users u where u.id = creator for no key update;
  select * into p from public.payouts x where x.reference = payout_reference for update;

  if p.provider <> 'cray' or p.status <> 'processing' then
    raise exception 'payout_not_processing' using errcode = 'P0001';
  end if;
  if p.provider_reference is not null then
    return case when p.provider_reference = new_provider_reference then 'already_set' else 'conflict' end;
  end if;

  update public.payouts x
     set provider_reference = new_provider_reference, waiting_for_funds = false, needs_reference = false,
         updated_at = now()
   where x.id = p.id;
  return 'set';
end;
$$;

create function public.flag_payout(payout_reference text, flag text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  creator uuid;
  p public.payouts;
begin
  if flag is null or flag not in ('waiting_for_funds', 'needs_reference') then
    raise exception 'payout_not_flaggable' using errcode = 'P0001';
  end if;
  select x.user_id into creator from public.payouts x where x.reference = payout_reference;
  if creator is null then
    raise exception 'no_such_payout' using errcode = 'P0001';
  end if;
  perform 1 from public.users u where u.id = creator for no key update;
  select * into p from public.payouts x where x.reference = payout_reference for update;

  if p.provider <> 'cray' or p.status <> 'processing' then
    raise exception 'payout_not_flaggable' using errcode = 'P0001';
  end if;

  update public.payouts x
     set waiting_for_funds = (flag = 'waiting_for_funds'),
         needs_reference = (flag = 'needs_reference'),
         updated_at = now()
   where x.id = p.id;
end;
$$;

-- An admin pastes Cray's id for a payout whose send is unclear. The next check
-- verifies it by requery (merchant reference must match) before anything settles.
create function public.attach_payout_reference(payout uuid, new_provider_reference text)
returns void
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

  if p.provider <> 'cray' or p.status <> 'processing' or p.provider_reference is not null then
    raise exception 'payout_not_attachable' using errcode = 'P0001';
  end if;

  update public.payouts x
     set provider_reference = btrim(new_provider_reference), needs_reference = false, waiting_for_funds = false,
         reference_attached_by = me, reference_attached_at = now(), updated_at = now()
   where x.id = p.id;
end;
$$;

-- Finishing: the provider's final word --------------------------------------------------------------------------------

-- Replaces the 4-argument version (which a 4-argument call still reaches
-- through the two defaults). `sent` and `charge` come from Cray's verified
-- requery; Paystack payouts ignore them.
drop function public.finish_payout(text, text, text, jsonb);

create function public.finish_payout(
  reference text,
  outcome text,
  event_key text,
  payload jsonb,
  sent_kobo bigint default null,
  charge_kobo bigint default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  creator uuid;
  p public.payouts;
  stored jsonb := coalesce(finish_payout.payload, '{}'::jsonb);
  cash_out bigint;
  cash_account text;
  returned bigint;
  lines jsonb;
begin
  if outcome is null or outcome not in ('paid', 'failed', 'reversed') then
    raise exception 'invalid_outcome' using errcode = '22023';
  end if;

  -- `#-` raises unless every step of the path is an object, so scrub only
  -- where the shape allows it; any other payload is stored as received. The
  -- full account number is removed wherever Paystack puts it in a well-formed
  -- event. A Cray payload never reaches here with a number: payments.ts stores
  -- a trimmed copy of Cray's answer.
  if jsonb_typeof(stored #> '{data,recipient,details}') = 'object' then
    stored := stored #- '{data,recipient,details,account_number}';
  end if;
  if jsonb_typeof(stored #> '{data,recipient}') = 'object' then
    stored := stored #- '{data,recipient,account_number}';
  end if;

  insert into public.payment_events (event_key, payload)
  values (finish_payout.event_key, stored)
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

  if outcome = 'reversed' then
    -- Only Cray reverses. For a Paystack payout "reversed" is still not an
    -- outcome (as before this change), and nothing is written.
    if p.provider <> 'cray' then
      raise exception 'invalid_outcome' using errcode = '22023';
    end if;
    if p.status <> 'paid' then
      return 'ignored';
    end if;
    if sent_kobo is null or sent_kobo <= 0 or (charge_kobo is not null and charge_kobo < 0) then
      raise exception 'invalid_amount' using errcode = '22023';
    end if;
    returned := sent_kobo + coalesce(charge_kobo, 0);
    update public.payouts x
       set status = 'reversed', reversed_kobo = returned, updated_at = now()
     where x.id = p.id;
    perform public.post_ledger_group('payout_reversed', null, null, null, null, p.id, p.reference, p.fee_config_id,
      jsonb_build_array(
        jsonb_build_object('account', 'cray', 'amount', returned),
        jsonb_build_object('account', 'creator_wallet', 'owner', p.user_id, 'amount', -returned)
      ));
    return 'reversed';
  end if;

  if p.status <> 'processing' then
    return 'ignored';
  end if;

  if outcome = 'paid' then
    cash_account := case p.provider when 'cray' then 'cray' else 'paystack' end;
    lines := jsonb_build_array(jsonb_build_object('account', 'payout_in_flight', 'amount', p.amount_kobo));
    if p.provider = 'cray' then
      -- Cray reports what it sent and what it charged; the amount sent must be
      -- what we asked for, and the cash out is both together.
      if sent_kobo is null or sent_kobo <= 0 or (charge_kobo is not null and charge_kobo < 0) then
        raise exception 'invalid_amount' using errcode = '22023';
      end if;
      if sent_kobo <> p.amount_kobo - p.transfer_fee_kobo then
        raise exception 'payout_amount_mismatch' using errcode = 'P0001';
      end if;
      cash_out := sent_kobo + coalesce(charge_kobo, p.transfer_fee_kobo);
      lines := lines || jsonb_build_object('account', 'cray', 'amount', -cash_out);
      if cash_out <> p.amount_kobo then
        lines := lines || jsonb_build_object('account', 'cray_fees', 'amount', cash_out - p.amount_kobo);
      end if;
      update public.payouts x
         set status = 'paid', paid_at = now(), sent_kobo = finish_payout.sent_kobo,
             provider_charge_kobo = coalesce(finish_payout.charge_kobo, p.transfer_fee_kobo),
             waiting_for_funds = false, needs_reference = false, updated_at = now()
       where x.id = p.id;
    else
      lines := lines || jsonb_build_object('account', cash_account, 'amount', -p.amount_kobo);
      update public.payouts x set status = 'paid', paid_at = now(), updated_at = now() where x.id = p.id;
    end if;
    perform public.post_ledger_group('payout_paid', null, null, null, null, p.id, p.reference, p.fee_config_id, lines);
  else
    update public.payouts x
       set status = 'failed', waiting_for_funds = false, needs_reference = false, updated_at = now()
     where x.id = p.id;
    perform public.post_ledger_group('payout_failed', null, null, null, null, p.id, p.reference, p.fee_config_id,
      jsonb_build_array(
        jsonb_build_object('account', 'payout_in_flight', 'amount', p.amount_kobo),
        jsonb_build_object('account', 'creator_wallet', 'owner', p.user_id, 'amount', -p.amount_kobo)
      ));
  end if;
  return outcome;
end;
$$;

-- The creator is told when Cray took a paid payout back.
create or replace function public.payouts_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  facts jsonb := jsonb_build_object('payout_id', new.id, 'amount_kobo', new.amount_kobo);
begin
  if new.status is not distinct from old.status then
    return null;
  end if;
  case new.status
    when 'paid' then
      perform public.notify(new.user_id, 'payout_paid', facts);
    when 'failed' then
      perform public.notify(new.user_id, 'payout_failed', facts);
    when 'rejected' then
      perform public.notify(new.user_id, 'payout_rejected',
        facts || jsonb_build_object('decision_reason', new.decision_reason));
    when 'reversed' then
      perform public.notify(new.user_id, 'payout_reversed',
        facts || jsonb_build_object('credited_kobo', new.reversed_kobo));
    else
      null;
  end case;
  return null;
end;
$$;

-- Function grants ---------------------------------------------------------------------------------------------------------

revoke all on function public.payout_fee_for(text, bigint) from public, anon, authenticated;
revoke all on function public.save_cray_bank_account_for(uuid, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.record_payout_send(text, text) from public, anon, authenticated;
revoke all on function public.flag_payout(text, text) from public, anon, authenticated;
revoke all on function public.attach_payout_reference(uuid, text) from public, anon;
revoke all on function public.finish_payout(text, text, text, jsonb, bigint, bigint) from public, anon, authenticated;

grant execute on function public.payout_fee_for(text, bigint) to service_role;
grant execute on function public.save_cray_bank_account_for(uuid, text, text, text, text, text) to service_role;
grant execute on function public.record_payout_send(text, text) to service_role;
grant execute on function public.flag_payout(text, text) to service_role;
grant execute on function public.attach_payout_reference(uuid, text) to authenticated;
grant execute on function public.finish_payout(text, text, text, jsonb, bigint, bigint) to service_role;
