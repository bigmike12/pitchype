-- Cash moved between places, and reconciliation per provider
-- (docs/superpowers/specs/2026-11-21-cray-payments-design.md §5.6).
--
-- Invariants this migration protects:
--   1. Each provider is reconciled on its own. A run's expected cash is the
--      ledger balance of THAT provider's cash account (`paystack` or `cray`),
--      compared with the balance the provider reports. A Paystack run is
--      unaffected by Cray rows and the other way round. The whole-ledger check
--      stays: if all accounts together no longer sum to zero, the run says by
--      how much. Runs are append-only as before.
--   2. Money moving between places is a ledger group. When the owner tops up
--      Cray from the bank (so Paystack-collected money can be paid out, say),
--      record_cash_movement() writes one balanced `cash_moved` group with the
--      acting admin and a required reason; without it per-provider
--      reconciliation could not stay true once the switch is used. A provider
--      cash account is never moved below what the ledger says it holds; `bank`
--      is our own bank account, outside any provider, and is not capped.
--
-- Errors raised (P0001 are refusals the app shows):
--   P0001 not_allowed            record_cash_movement: not an admin
--   P0001 invalid_cash_account   an account other than paystack, cray or bank, or from = to
--   P0001 reason_required        reason shorter than 3 or longer than 500 characters
--   P0001 cash_not_available     more than the ledger says that provider account holds
--   22023 invalid_amount         amount not positive; or a run's balance null or negative
--   22023 invalid_provider       record_reconciliation: not paystack or cray

alter table public.reconciliation_runs
  add column provider text not null default 'paystack';

alter table public.reconciliation_runs
  add constraint reconciliation_runs_provider_check check (provider in ('paystack', 'cray'));

-- `paystack_balance_kobo` now means "the provider's reported balance, whichever
-- provider the run is for" (docs/TODO.md: rename later).

-- Internal: the arithmetic of one provider's run, from signed account totals
-- (the shape ledger_totals() returns; a missing account counts as 0). Kept
-- separate so a test can feed it an unbalanced ledger, which post_ledger_group()
-- never allows.
create function public.provider_reconciliation_figures(totals jsonb, which text, balance_kobo bigint)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  expected bigint := coalesce((totals ->> which)::bigint, 0);
  ledger_sum bigint := coalesce((select sum(value::bigint) from jsonb_each_text(totals)), 0);
  difference bigint := balance_kobo - expected;
  notes text[] := '{}';
begin
  if ledger_sum <> 0 then
    notes := notes || format('Ledger accounts sum to %s kobo, not 0.', ledger_sum);
  end if;
  if difference <> 0 then
    notes := notes || format('%s balance differs from expected cash by %s kobo.',
                             case which when 'cray' then 'Cray' else 'Paystack' end, difference);
  end if;

  return jsonb_build_object(
    'expected_cash_kobo', expected,
    'difference_kobo', difference,
    'ledger_balanced', ledger_sum = 0,
    'note', case when cardinality(notes) > 0 then array_to_string(notes, ' ') end
  );
end;
$$;

-- For the server's daily job: compares one provider's reported balance with
-- the ledger and stores the run. `note_parts` is [{name, kobo}], the pieces of
-- the balance the provider reported (Cray: Main and Settlement), written into
-- the note so an admin can see them.
create function public.record_reconciliation(which text, balance_kobo bigint, note_parts jsonb default '[]')
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  figures jsonb;
  note text;
  parts text;
begin
  if which is null or which not in ('paystack', 'cray') then
    raise exception 'invalid_provider' using errcode = '22023';
  end if;
  if balance_kobo is null or balance_kobo < 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  figures := public.provider_reconciliation_figures(public.ledger_totals(), which, balance_kobo);
  note := figures ->> 'note';
  if jsonb_typeof(note_parts) = 'array' and jsonb_array_length(note_parts) > 0 then
    select string_agg(format('%s %s kobo', p ->> 'name', p ->> 'kobo'), '; ' order by n)
      into parts
      from jsonb_array_elements(note_parts) with ordinality as t (p, n);
    note := concat_ws(' ', note, 'Balance parts: ' || parts || '.');
  end if;

  insert into public.reconciliation_runs (provider, paystack_balance_kobo, expected_cash_kobo, difference_kobo, note)
  values (which, balance_kobo, (figures ->> 'expected_cash_kobo')::bigint,
          (figures ->> 'difference_kobo')::bigint, note);

  return figures - 'note';
end;
$$;

-- The original call is a Paystack run.
create or replace function public.record_reconciliation(paystack_balance_kobo bigint)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select public.record_reconciliation('paystack', paystack_balance_kobo, '[]'::jsonb)
$$;

-- Cash moved between places ---------------------------------------------------------------------------

create function public.record_cash_movement(from_account text, to_account text, amount_kobo bigint, reason text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  cleaned text := btrim(coalesce(reason, ''));
begin
  if me is null or public.current_user_role() is distinct from 'admin' then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if from_account is null or to_account is null
     or from_account not in ('paystack', 'cray', 'bank') or to_account not in ('paystack', 'cray', 'bank')
     or from_account = to_account then
    raise exception 'invalid_cash_account' using errcode = 'P0001';
  end if;
  if amount_kobo is null or amount_kobo <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if char_length(cleaned) not between 3 and 500 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;

  -- Two movements at once (or against a run) take the same lock, so the
  -- balance checked below is the balance moved from.
  perform pg_advisory_xact_lock(hashtext('cash_movement'));
  if from_account <> 'bank'
     and coalesce((public.ledger_totals() ->> from_account)::bigint, 0) < amount_kobo then
    raise exception 'cash_not_available' using errcode = 'P0001';
  end if;

  return public.post_ledger_group('cash_moved', me, cleaned, null, null, null, null, null,
    jsonb_build_array(
      jsonb_build_object('account', to_account, 'amount', amount_kobo),
      jsonb_build_object('account', from_account, 'amount', -amount_kobo)
    ));
end;
$$;

-- Function grants -------------------------------------------------------------------------------------

revoke all on function public.provider_reconciliation_figures(jsonb, text, bigint)
  from public, anon, authenticated, service_role;
revoke all on function public.record_reconciliation(text, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.record_cash_movement(text, text, bigint, text) from public, anon;

grant execute on function public.record_reconciliation(text, bigint, jsonb) to service_role;
grant execute on function public.record_cash_movement(text, text, bigint, text) to authenticated;
