-- Reconciliation runs, admin audit reads and payout hardening (Stage 6).
-- Design: docs/superpowers/specs/2026-11-13-stage-6-money-design.md §4 rule 8, §11 call 1, §12;
-- CLAUDE.md §6 rules 2–3, §6.3, §7.
--
-- Invariants this migration protects:
--   1. Expected cash. Every ledger group sums to zero, so the signed totals of
--      all accounts sum to zero. With the stored signs (cash `paystack` and
--      expense `paystack_fees` positive; liabilities `escrow`,
--      `business_wallet`, `creator_wallet`, `payout_in_flight` and revenue
--      `platform_revenue` negative):
--        paystack = −(escrow + business_wallet + creator_wallet
--                     + payout_in_flight + platform_revenue) − paystack_fees
--      which is spec §11 call 1 (cash = what we owe + what we earned − what
--      Paystack charged us). reconciliation_figures() computes it from the
--      other accounts, not from `paystack` itself, so a run checks the ledger
--      as well as the bank: if the ledger stops balancing, `ledger_balanced`
--      is false and the note says by how much.
--   2. Runs are append-only. No role may insert, update or delete
--      reconciliation_runs; only record_reconciliation() (service_role) writes
--      it, and triggers set to fire ALWAYS (even with replication triggers
--      off) reject update, delete and truncate.
--   3. Audit reads are for admins only (not_allowed for anyone else) and
--      return no secrets: no Paystack payloads, event keys or recipient codes.
--      Bank accounts appear only as bank name and last four digits.
--   4. A full bank account number is never stored (create_payouts invariant 6):
--      finish_payout() now removes it from the transfer payload before saving
--      the event.
--   5. A creator cannot write their own payout account name. The server saves
--      the account through save_bank_account_for() after Paystack resolved the
--      name; save_bank_account() is no longer callable by signed-in people.
--
-- Errors raised (P0001 are refusals the app shows, see src/lib/refusals.ts):
--   P0001 not_allowed            admin_* reads: the caller isn't an admin
--   P0001 no_such_engagement     admin_engagement_trail: unknown hire
--   22023 invalid_amount         record_reconciliation: balance null or negative
--   42501 (no message match)     save_bank_account_for: person isn't a creator
--   22023 invalid_bank_account   save_bank_account_for: malformed details

-- Reconciliation runs -------------------------------------------------------------------------------

create table public.reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  -- Paystack's available balance as the server read it, in kobo.
  paystack_balance_kobo bigint not null,
  expected_cash_kobo bigint not null,
  difference_kobo bigint not null,
  -- Set when the ledger doesn't balance or the difference isn't zero.
  note text,

  constraint reconciliation_runs_difference_check check (
    difference_kobo = paystack_balance_kobo - expected_cash_kobo
  )
);

create index reconciliation_runs_ran_at_idx on public.reconciliation_runs (ran_at desc);

create trigger reconciliation_runs_append_only
  before update or delete on public.reconciliation_runs
  for each row execute function public.reject_change('reconciliation_runs_append_only');

create trigger reconciliation_runs_no_truncate
  before truncate on public.reconciliation_runs
  for each statement execute function public.reject_change('reconciliation_runs_append_only');

alter table public.reconciliation_runs enable always trigger reconciliation_runs_append_only;
alter table public.reconciliation_runs enable always trigger reconciliation_runs_no_truncate;

-- Internal: the arithmetic of one run, from signed account totals (the shape
-- ledger_totals() returns; a missing account counts as 0). Kept separate so a
-- test can feed it an unbalanced ledger, which post_ledger_group() never allows.
create function public.reconciliation_figures(totals jsonb, paystack_balance_kobo bigint)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  owed_and_earned bigint := coalesce((totals ->> 'escrow')::bigint, 0)
                          + coalesce((totals ->> 'business_wallet')::bigint, 0)
                          + coalesce((totals ->> 'creator_wallet')::bigint, 0)
                          + coalesce((totals ->> 'payout_in_flight')::bigint, 0)
                          + coalesce((totals ->> 'platform_revenue')::bigint, 0);
  expected bigint := -owed_and_earned - coalesce((totals ->> 'paystack_fees')::bigint, 0);
  ledger_sum bigint := owed_and_earned + coalesce((totals ->> 'paystack_fees')::bigint, 0)
                     + coalesce((totals ->> 'paystack')::bigint, 0);
  difference bigint := paystack_balance_kobo - expected;
  notes text[] := '{}';
begin
  if ledger_sum <> 0 then
    notes := notes || format('Ledger accounts sum to %s kobo, not 0.', ledger_sum);
  end if;
  if difference <> 0 then
    notes := notes || format('Paystack balance differs from expected cash by %s kobo.', difference);
  end if;

  return jsonb_build_object(
    'expected_cash_kobo', expected,
    'difference_kobo', difference,
    'ledger_balanced', ledger_sum = 0,
    'note', case when cardinality(notes) > 0 then array_to_string(notes, ' ') end
  );
end;
$$;

-- For the server's daily job: compares Paystack's balance (fetched by the
-- server) with the ledger and stores the run.
create function public.record_reconciliation(paystack_balance_kobo bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  figures jsonb;
begin
  if paystack_balance_kobo is null or paystack_balance_kobo < 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  figures := public.reconciliation_figures(public.ledger_totals(), paystack_balance_kobo);
  insert into public.reconciliation_runs (paystack_balance_kobo, expected_cash_kobo, difference_kobo, note)
  values (record_reconciliation.paystack_balance_kobo, (figures ->> 'expected_cash_kobo')::bigint,
          (figures ->> 'difference_kobo')::bigint, figures ->> 'note');

  return figures - 'note';
end;
$$;

-- Admin audit reads ------------------------------------------------------------------------------------

-- Internal: how the audit names a person. Admins have no profile, so their
-- email stands in.
create function public.audit_name(person uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(b.business_name, i.display_name, u.email)
    from public.users u
    left join public.business_profiles b on b.user_id = u.id
    left join public.influencer_profiles i on i.user_id = u.id
   where u.id = person
$$;

-- Internal: groups written in the same instant (one transaction, as in tests
-- or a payment that funds and books its charge together) sort in the order
-- the money moves.
create function public.ledger_event_rank(event_type text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case event_type
           when 'payment_received' then 1
           when 'hire_funded' then 1
           when 'paystack_fee' then 2
           when 'hire_settled' then 3
           when 'payout_requested' then 4
           when 'payout_rejected' then 5
           when 'payout_paid' then 5
           when 'payout_failed' then 5
           else 6
         end
$$;

-- One hire's money from start to end: the engagement, its payments, its
-- ledger groups oldest first, and the creator's payouts (paid from the wallet,
-- so not tied to one hire).
create function public.admin_engagement_trail(engagement uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e public.engagements;
begin
  if public.current_user_role() is distinct from 'admin' then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  select * into e from public.engagements x where x.id = admin_engagement_trail.engagement;
  if e.id is null then
    raise exception 'no_such_engagement' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'engagement', public.engagement_json(e) || jsonb_build_object(
      'campaign_id', e.campaign_id,
      'campaign_title', (select c.title from public.campaigns c where c.id = e.campaign_id),
      'business_id', e.business_id,
      'business_name', public.audit_name(e.business_id),
      'creator_id', e.creator_id,
      'creator_name', public.audit_name(e.creator_id),
      'fee_config_id', e.fee_config_id,
      'cancel_fee_notice_seen_at', e.cancel_fee_notice_seen_at
    ),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'reference', p.reference, 'status', p.status, 'total_kobo', p.total_kobo,
               'card_amount_kobo', p.card_amount_kobo, 'wallet_part_kobo', p.wallet_part_kobo,
               'paystack_fee_kobo', p.paystack_fee_kobo, 'created_at', p.created_at)
             order by p.created_at, p.id)
        from public.payments p
       where p.engagement_id = e.id
    ), '[]'::jsonb),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
               'group_id', g.group_id, 'event_type', g.event_type, 'created_at', g.created_at,
               'actor_user_id', g.actor_user_id,
               'actor_name', coalesce(public.audit_name(g.actor_user_id), 'System'),
               'reason', g.reason, 'paystack_reference', g.paystack_reference,
               'payment_id', g.payment_id, 'payout_id', g.payout_id, 'lines', g.lines)
             order by g.created_at, public.ledger_event_rank(g.event_type), g.group_id)
        from (
          select l.group_id, l.event_type, min(l.created_at) as created_at, l.actor_user_id, l.reason,
                 l.paystack_reference, l.payment_id, l.payout_id,
                 jsonb_agg(jsonb_build_object(
                   'account', l.account, 'owner_name', public.audit_name(l.owner_user_id),
                   'amount_kobo', l.amount_kobo)
                 order by l.account, l.id) as lines
            from public.ledger_entries l
           where l.engagement_id = e.id
           group by l.group_id, l.event_type, l.actor_user_id, l.reason, l.paystack_reference,
                    l.payment_id, l.payout_id
        ) g
    ), '[]'::jsonb),
    'payouts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'status', p.status, 'amount_kobo', p.amount_kobo,
               'transfer_fee_kobo', p.transfer_fee_kobo, 'bank_name', p.bank_name, 'last4', p.last4,
               'reference', p.reference, 'approved_by_name', public.audit_name(p.approved_by),
               'approved_at', p.approved_at, 'decision_reason', p.decision_reason, 'paid_at', p.paid_at,
               'created_at', p.created_at)
             order by p.created_at, p.id)
        from public.payouts p
       where p.user_id = e.creator_id
    ), '[]'::jsonb)
  );
end;
$$;

-- The ledger, one row per line, newest first. Every filter is optional (null
-- means any). `person` matches every line of a group that touches them: as a
-- wallet owner, the actor, either side of the group's hire, or the payout's
-- creator. Dates are Lagos calendar days, inclusive. At most 200 rows a page.
create function public.admin_ledger(
  person uuid,
  engagement uuid,
  event_type text,
  from_date date,
  to_date date,
  row_limit integer,
  row_offset integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  page_size integer := greatest(1, least(coalesce(admin_ledger.row_limit, 50), 200));
  skip integer := greatest(0, coalesce(admin_ledger.row_offset, 0));
  result jsonb;
begin
  if public.current_user_role() is distinct from 'admin' then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  with matched as (
    select l.*
      from public.ledger_entries l
     where (admin_ledger.engagement is null or l.engagement_id = admin_ledger.engagement)
       and (admin_ledger.event_type is null or l.event_type = admin_ledger.event_type)
       and (admin_ledger.from_date is null
            or (l.created_at at time zone 'Africa/Lagos')::date >= admin_ledger.from_date)
       and (admin_ledger.to_date is null
            or (l.created_at at time zone 'Africa/Lagos')::date <= admin_ledger.to_date)
       and (admin_ledger.person is null or exists (
             select 1
               from public.ledger_entries m
               left join public.engagements g on g.id = m.engagement_id
               left join public.payouts p on p.id = m.payout_id
              where m.group_id = l.group_id
                and admin_ledger.person in (m.owner_user_id, m.actor_user_id, g.business_id, g.creator_id,
                                            p.user_id)))
  ),
  page as (
    select m.*
      from matched m
     order by m.created_at desc, public.ledger_event_rank(m.event_type) desc, m.group_id, m.account, m.id
     limit page_size offset skip
  )
  select jsonb_build_object(
           'total', (select count(*) from matched),
           'row_limit', page_size,
           'row_offset', skip,
           'rows', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', r.id, 'group_id', r.group_id, 'event_type', r.event_type, 'account', r.account,
                      'owner_user_id', r.owner_user_id, 'owner_name', public.audit_name(r.owner_user_id),
                      'engagement_id', r.engagement_id, 'payment_id', r.payment_id, 'payout_id', r.payout_id,
                      'paystack_reference', r.paystack_reference, 'amount_kobo', r.amount_kobo,
                      'actor_user_id', r.actor_user_id,
                      'actor_name', coalesce(public.audit_name(r.actor_user_id), 'System'),
                      'reason', r.reason, 'fee_config_id', r.fee_config_id, 'created_at', r.created_at)
                    order by r.created_at desc, public.ledger_event_rank(r.event_type) desc, r.group_id,
                             r.account, r.id)
               from page r
           ), '[]'::jsonb)
         )
    into result;
  return result;
end;
$$;

-- Hardening: scrub account numbers from transfer events -------------------------------------------------

-- As in 20261113100300_create_payouts.sql, plus: the payload is stored without
-- the recipient's full account number (Paystack sends it at
-- data.recipient.details.account_number, and older payloads at
-- data.recipient.account_number). Everything else is kept for audit.
create or replace function public.finish_payout(reference text, outcome text, event_key text, payload jsonb)
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
  values (finish_payout.event_key,
          coalesce(finish_payout.payload, '{}'::jsonb)
            #- '{data,recipient,details,account_number}'
            #- '{data,recipient,account_number}')
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

-- Hardening: only the server saves payout accounts -----------------------------------------------------

-- As save_bank_account(), but for the server: it calls this after Paystack
-- resolved the account name and created the transfer recipient, so the name
-- stored is the bank's, not one the creator typed. `person` must be a creator.
create function public.save_bank_account_for(
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

  insert into public.bank_accounts as b (user_id, bank_code, bank_name, last4, account_name, recipient_code)
  values (person, clean[1], clean[2], last4, clean[3], clean[4])
  on conflict (user_id) do update
     set bank_code = excluded.bank_code, bank_name = excluded.bank_name, last4 = excluded.last4,
         account_name = excluded.account_name, recipient_code = excluded.recipient_code, updated_at = now();
end;
$$;

-- Function grants ---------------------------------------------------------------------------------

revoke all on function public.reconciliation_figures(jsonb, bigint) from public, anon, authenticated, service_role;
revoke all on function public.record_reconciliation(bigint) from public, anon, authenticated;
revoke all on function public.audit_name(uuid) from public, anon, authenticated, service_role;
revoke all on function public.ledger_event_rank(text) from public, anon, authenticated, service_role;
revoke all on function public.admin_engagement_trail(uuid) from public, anon;
revoke all on function public.admin_ledger(uuid, uuid, text, date, date, integer, integer) from public, anon;
revoke all on function public.save_bank_account_for(uuid, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.save_bank_account(text, text, text, text, text) from public, anon, authenticated;

grant execute on function public.record_reconciliation(bigint) to service_role;
grant execute on function public.admin_engagement_trail(uuid) to authenticated;
grant execute on function public.admin_ledger(uuid, uuid, text, date, date, integer, integer) to authenticated;
grant execute on function public.save_bank_account_for(uuid, text, text, text, text, text) to service_role;

-- Table grants and row level security -----------------------------------------------------------

alter table public.reconciliation_runs enable row level security;

-- Nobody writes runs directly; record_reconciliation() does.
revoke all on table public.reconciliation_runs from anon, authenticated, service_role;
grant select on table public.reconciliation_runs to authenticated, service_role;

create policy "Reconciliation runs: admins"
  on public.reconciliation_runs for select to authenticated
  using ((select public.current_user_role()) = 'admin');
