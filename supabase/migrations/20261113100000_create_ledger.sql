-- Fee config and the append-only ledger (Stage 6).
-- Design: docs/superpowers/specs/2026-11-13-stage-6-money-design.md §3, §4, §5, §11, §12.
--
-- Invariants this migration protects:
--   1. Money moves only as ledger groups. A group is one business event and
--      its rows sum to zero; post_ledger_group() refuses any other.
--   2. The ledger is append-only. A trigger rejects update, delete and
--      truncate, even for the table owner, and no role is granted insert,
--      update or delete. Mistakes are corrected with a reversing group.
--   3. Signs: cash and expense accounts are positive, liabilities and revenue
--      negative. Cash is `paystack`; expense is `paystack_fees`; liabilities
--      are `escrow`, `business_wallet`, `creator_wallet`, `payout_in_flight`;
--      revenue is `platform_revenue`. Because every group sums to zero:
--        Paystack cash = escrow + wallets + payouts in flight
--                        + platform revenue − paystack_fees
--      (each liability and revenue taken as the amount owed or earned).
--   4. Fee rules are data. fee_config has one row per version, rows are never
--      changed, and the current one is the latest by created_at (then id).
--      Ledger rows record the version they used.
--   5. People read only their own wallet rows and the escrow rows of their own
--      hires, never the internal accounts. Admins read everything.

-- Fee config -------------------------------------------------------------------------------------

create table public.fee_config (
  id uuid primary key default gen_random_uuid(),
  business_fee_bps integer not null,
  creator_fee_bps integer not null,
  min_fee_kobo bigint not null,
  min_payout_kobo bigint not null,
  -- [{up_to_kobo: number | null, fee_kobo: number}], inclusive bounds, in
  -- order; null is the open-ended last tier.
  transfer_fee_tiers jsonb not null,
  -- Flat stamp duty on transfers of transfer_stamp_duty_from_kobo and over.
  transfer_stamp_duty_kobo bigint not null,
  transfer_stamp_duty_from_kobo bigint not null,
  -- Paystack's card charge, used only by the fee-vs-charge test (CLAUDE.md §6.1):
  -- {rate_bps, flat_kobo, flat_waived_under_kobo, cap_kobo, vat_bps}.
  paystack_rate jsonb not null,
  created_at timestamptz not null default now(),

  constraint fee_config_rates_check check (
    business_fee_bps between 0 and 10000 and creator_fee_bps between 0 and 10000
  ),
  constraint fee_config_amounts_check check (
    min_fee_kobo >= 0 and min_payout_kobo > 0
    and transfer_stamp_duty_kobo >= 0 and transfer_stamp_duty_from_kobo >= 0
  ),
  constraint fee_config_tiers_check check (
    jsonb_typeof(transfer_fee_tiers) = 'array' and jsonb_array_length(transfer_fee_tiers) > 0
  ),
  constraint fee_config_paystack_rate_check check (jsonb_typeof(paystack_rate) = 'object')
);

-- The seed is one JSON literal so src/lib/fee-config.test.ts can read it from
-- this file and check it equals src/lib/fees.ts. Change both together.
insert into public.fee_config (business_fee_bps, creator_fee_bps, min_fee_kobo, min_payout_kobo,
                               transfer_fee_tiers, transfer_stamp_duty_kobo, transfer_stamp_duty_from_kobo,
                               paystack_rate)
select (s ->> 'business_fee_bps')::integer,
       (s ->> 'creator_fee_bps')::integer,
       (s ->> 'min_fee_kobo')::bigint,
       (s ->> 'min_payout_kobo')::bigint,
       s -> 'transfer_fee_tiers',
       (s ->> 'transfer_stamp_duty_kobo')::bigint,
       (s ->> 'transfer_stamp_duty_from_kobo')::bigint,
       s -> 'paystack_rate'
  from (select $fee_config_seed$
{
  "business_fee_bps": 500,
  "creator_fee_bps": 500,
  "min_fee_kobo": 50000,
  "min_payout_kobo": 100000,
  "transfer_fee_tiers": [
    { "up_to_kobo": 500000, "fee_kobo": 1000 },
    { "up_to_kobo": 5000000, "fee_kobo": 2500 },
    { "up_to_kobo": null, "fee_kobo": 5000 }
  ],
  "transfer_stamp_duty_kobo": 5000,
  "transfer_stamp_duty_from_kobo": 1000000,
  "paystack_rate": {
    "rate_bps": 150,
    "flat_kobo": 10000,
    "flat_waived_under_kobo": 250000,
    "cap_kobo": 200000,
    "vat_bps": 750
  }
}
$fee_config_seed$::jsonb as s) seed;

create function public.current_fee_config()
returns public.fee_config
language sql
stable
security definer
set search_path = ''
as $$
  select f.* from public.fee_config f order by f.created_at desc, f.id desc limit 1
$$;

-- Ledger -----------------------------------------------------------------------------------------

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  event_type text not null,
  account text not null,
  -- The person a wallet belongs to; null for platform accounts.
  owner_user_id uuid references public.users (id) on delete restrict,
  engagement_id uuid references public.engagements (id) on delete restrict,
  -- Foreign keys arrive with the payments and payouts tables.
  payment_id uuid,
  payout_id uuid,
  paystack_reference text,
  amount_kobo bigint not null,
  -- Null when the system (a webhook or scheduled job) made the change.
  actor_user_id uuid references public.users (id) on delete restrict,
  reason text,
  fee_config_id uuid not null references public.fee_config (id) on delete restrict,
  created_at timestamptz not null default now(),

  constraint ledger_entries_account_check check (
    account in ('paystack', 'business_wallet', 'escrow', 'creator_wallet',
                'platform_revenue', 'paystack_fees', 'payout_in_flight')
  ),
  constraint ledger_entries_event_type_check check (
    event_type in ('payment_received', 'hire_funded', 'hire_settled', 'payout_requested',
                   'payout_rejected', 'payout_paid', 'payout_failed', 'paystack_fee', 'correction')
  ),
  constraint ledger_entries_amount_check check (amount_kobo <> 0),
  constraint ledger_entries_wallet_owner_check check (
    account not in ('business_wallet', 'creator_wallet') or owner_user_id is not null
  ),
  constraint ledger_entries_escrow_engagement_check check (
    account <> 'escrow' or engagement_id is not null
  ),
  constraint ledger_entries_reason_check check (
    reason is null or (reason = btrim(reason) and char_length(reason) between 1 and 1000)
  )
);

create index ledger_entries_owner_idx on public.ledger_entries (owner_user_id, account);
create index ledger_entries_engagement_idx on public.ledger_entries (engagement_id);
create index ledger_entries_group_idx on public.ledger_entries (group_id);

-- Append-only: triggers fire for every role, the table owner included.
create function public.reject_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '%', tg_argv[0] using errcode = 'P0001';
end;
$$;

create trigger ledger_entries_append_only
  before update or delete on public.ledger_entries
  for each row execute function public.reject_change('ledger_append_only');

create trigger ledger_entries_no_truncate
  before truncate on public.ledger_entries
  for each statement execute function public.reject_change('ledger_append_only');

create trigger fee_config_append_only
  before update or delete on public.fee_config
  for each row execute function public.reject_change('fee_config_append_only');

create trigger fee_config_no_truncate
  before truncate on public.fee_config
  for each statement execute function public.reject_change('fee_config_append_only');

-- Posts one business event. `lines` is [{account, owner?, amount}]; every line
-- shares the group's engagement, payment, payout, reference, actor and reason.
-- Internal: later money functions call it inside their own transaction.
create function public.post_ledger_group(
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

-- What the platform owes this person in their wallet (liabilities are stored
-- negative, so this is minus the signed sum).
create function public.wallet_balance(person uuid, kind text)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if kind is null or kind not in ('business_wallet', 'creator_wallet') then
    raise exception 'invalid_wallet_kind' using errcode = 'P0001';
  end if;

  return coalesce((
    select -sum(e.amount_kobo)
      from public.ledger_entries e
     where e.owner_user_id = person and e.account = kind
  ), 0)::bigint;
end;
$$;

-- The signed sum per account, every account present, for reconciliation.
create function public.ledger_totals()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_object_agg(a.account, coalesce(t.total, 0))
    from unnest(array['paystack', 'business_wallet', 'escrow', 'creator_wallet',
                      'platform_revenue', 'paystack_fees', 'payout_in_flight']) as a (account)
    left join (
      select e.account, sum(e.amount_kobo) as total
        from public.ledger_entries e
       group by e.account
    ) t on t.account = a.account
$$;

-- Function grants ---------------------------------------------------------------------------------

revoke all on function public.current_fee_config() from public, anon, authenticated;
revoke all on function public.reject_change() from public, anon, authenticated;
revoke all on function public.post_ledger_group(text, uuid, text, uuid, uuid, uuid, text, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.wallet_balance(uuid, text) from public, anon, authenticated;
revoke all on function public.ledger_totals() from public, anon, authenticated;

grant execute on function public.current_fee_config() to service_role;
grant execute on function public.post_ledger_group(text, uuid, text, uuid, uuid, uuid, text, uuid, jsonb)
  to service_role;
grant execute on function public.wallet_balance(uuid, text) to service_role;
grant execute on function public.ledger_totals() to service_role;

-- Table grants and row level security -----------------------------------------------------------

alter table public.fee_config enable row level security;
alter table public.ledger_entries enable row level security;

-- Nobody writes these tables directly: new fee versions come in migrations,
-- ledger rows only through post_ledger_group().
revoke all on table public.fee_config from anon, authenticated, service_role;
revoke all on table public.ledger_entries from anon, authenticated, service_role;
grant select on table public.fee_config to authenticated, service_role;
grant select on table public.ledger_entries to authenticated, service_role;

create policy "Fee config: anyone signed in"
  on public.fee_config for select to authenticated
  using (true);

create policy "Ledger: own wallet rows, escrow of own hires, admins"
  on public.ledger_entries for select to authenticated
  using (
    (account in ('business_wallet', 'creator_wallet')
      and owner_user_id = (select public.current_user_id()))
    or (account = 'escrow'
      and exists (
        select 1 from public.engagements g
         where g.id = engagement_id
           and (select public.current_user_id()) in (g.business_id, g.creator_id)
      ))
    or (select public.current_user_role()) = 'admin'
  );
