-- Starting work, cancelling a paid hire, and settling escrow (Stage 6).
-- Design: docs/superpowers/specs/2026-11-13-stage-6-money-design.md §3, §4, §11, §12;
-- CLAUDE.md §5, §6.1, §6.2.
--
-- Invariants this migration protects:
--   1. Escrow leaves an engagement only through settle_money(), one balanced
--      hire_settled group that empties the hire's escrow exactly:
--        escrow +price
--        creator_wallet −(r − creator fee)           (when above zero)
--        platform_revenue −creator fee               (when above zero)
--        platform_revenue +fee returned              (fault outcome only)
--        business_wallet −(price − r + fee returned) (when above zero)
--      where r is the part released to the creator. Before posting it checks
--      the hire's escrow holds exactly the price.
--   2. Once settled, always settled. settled_at is set in the same
--      transaction as the group. A second settle_engagement() call on a
--      settled hire (including one cancelled here) is a no-op that writes
--      nothing; a second cancel is refused with engagement_locked.
--   3. Lock order, as in funding: the business's users row, then the
--      engagement. Statuses and balances are read after the locks, so a
--      cancel, a start and a settlement on the same hire serialise.
--   4. Fees come from the engagement's snapshot (creator_fee_bps,
--      creator_min_fee_kobo, business_fee_kobo, fee_config_id), never from
--      the current fee_config. The creator fee on a release r is 0 when r is
--      0, otherwise least(r, greatest(min, round_half_up(r × bps / 10000))),
--      the same as creatorFee() in src/lib/fees.ts.
--   5. Creator at fault (admin outcome, or the creator withdrawing): the
--      business gets price + business fee − Paystack's charges on the hire's
--      succeeded payments (wallet money carries no charge), so the platform
--      breaks even. The charges are capped at the fee, so the business never
--      gets back less than the price.
--   6. Nothing is overdrawn: every line either empties this hire's escrow or
--      credits a wallet or revenue; nothing debits a wallet.
--   7. Work starts only on a funded hire and only by its creator. Once work
--      started neither side can cancel alone; only an admin settles.
--      Suspension does not stop a creator starting work already agreed
--      (CLAUDE.md §6.5).
--
-- Errors raised (P0001 are refusals the app shows, see src/lib/refusals.ts):
--   P0001 no_such_engagement      not the caller's hire, or no such hire
--   P0001 engagement_locked       wrong status for this action
--   P0001 not_allowed             settle_engagement: the caller isn't an admin
--   P0001 settle_reason_required  reason blank or over 500 characters
--   P0001 release_invalid         release amount out of range or not whole naira
--   22023 invalid_outcome         outcome not one of the four (form control)
--   22023 fee_notice_required     business cancel without the fee notice ticked
--   P0001 escrow_mismatch         escrow for the hire isn't the price (a bug)

-- Engagements: settled outcome and the cancel notice -----------------------------------------------

alter table public.engagements
  -- When the business ticked the non-refundable-fee notice on the cancel screen (CLAUDE.md §6.2).
  add column cancel_fee_notice_seen_at timestamptz;

alter table public.engagements
  add constraint engagements_settle_outcome_check check (
    settle_outcome is null or settle_outcome in ('release', 'refund', 'split', 'refund_creator_fault')
  ),
  -- Outcome, time and amounts are written together, once.
  add constraint engagements_settled_check check (
    (settled_at is null and settle_outcome is null and released_kobo is null and refunded_kobo is null)
    or (settled_at is not null and settle_outcome is not null and released_kobo is not null
        and refunded_kobo is not null)
  );

-- Stage 5's keys, plus the funding, settlement and fee snapshot (additive).
create or replace function public.engagement_json(e public.engagements)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when e.id is null then null else jsonb_build_object(
    'id', e.id, 'status', e.status, 'agreed_price_kobo', e.agreed_price_kobo,
    'approved_at', e.approved_at, 'pay_by', e.pay_by,
    'cancelled_at', e.cancelled_at, 'cancel_reason', e.cancel_reason,
    'funded_at', e.funded_at, 'started_at', e.started_at, 'settled_at', e.settled_at,
    'settle_outcome', e.settle_outcome, 'released_kobo', e.released_kobo,
    'refunded_kobo', e.refunded_kobo, 'business_fee_kobo', e.business_fee_kobo,
    'creator_fee_bps', e.creator_fee_bps, 'creator_min_fee_kobo', e.creator_min_fee_kobo
  ) end
$$;

-- Internal: moving escrow out --------------------------------------------------------------------------

-- Writes the one hire_settled group and marks the hire settled. The caller
-- holds the locks and has checked the status; `released` is already valid
-- (whole naira, 0..price). `fault` returns the business fee minus charges.
create function public.settle_money(
  engagement uuid,
  outcome text,
  released bigint,
  fault boolean,
  new_status public.engagement_status,
  cancel_reason text,
  actor uuid,
  reason text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e public.engagements;
  escrow_held bigint;
  creator_fee bigint := 0;
  charges bigint := 0;
  fee_back bigint := 0;
  to_business bigint;
  lines jsonb;
begin
  select * into e from public.engagements x where x.id = engagement for update;

  select coalesce(-sum(l.amount_kobo), 0) into escrow_held
    from public.ledger_entries l where l.engagement_id = e.id and l.account = 'escrow';
  if escrow_held <> e.agreed_price_kobo then
    raise exception 'escrow_mismatch' using errcode = 'P0001';
  end if;

  if released > 0 then
    creator_fee := least(released, greatest(e.creator_min_fee_kobo, (released * e.creator_fee_bps + 5000) / 10000));
  end if;
  if fault then
    select coalesce(sum(p.paystack_fee_kobo), 0) into charges
      from public.payments p where p.engagement_id = e.id and p.status = 'succeeded';
    fee_back := e.business_fee_kobo - least(charges, e.business_fee_kobo);
  end if;
  to_business := e.agreed_price_kobo - released + fee_back;

  lines := jsonb_build_array(jsonb_build_object('account', 'escrow', 'amount', e.agreed_price_kobo));
  if released - creator_fee > 0 then
    lines := lines || jsonb_build_object('account', 'creator_wallet', 'owner', e.creator_id,
                                         'amount', -(released - creator_fee));
  end if;
  if creator_fee > 0 then
    lines := lines || jsonb_build_object('account', 'platform_revenue', 'amount', -creator_fee);
  end if;
  if fee_back > 0 then
    lines := lines || jsonb_build_object('account', 'platform_revenue', 'amount', fee_back);
  end if;
  if to_business > 0 then
    lines := lines || jsonb_build_object('account', 'business_wallet', 'owner', e.business_id,
                                         'amount', -to_business);
  end if;

  perform public.post_ledger_group('hire_settled', actor, reason, e.id, null, null, null, e.fee_config_id, lines);

  update public.engagements x
     set status = new_status,
         settle_outcome = outcome,
         released_kobo = released,
         refunded_kobo = to_business,
         settled_at = now(),
         cancelled_at = case when settle_money.cancel_reason is not null then now() end,
         cancel_reason = settle_money.cancel_reason,
         updated_at = now()
   where x.id = e.id;
end;
$$;

-- Settles a funded hire. Stage 7's accept, auto-release and dispute decisions
-- call this too. A settled hire is left alone: no error, nothing written.
create function public.settle_engagement_internal(
  engagement uuid,
  outcome text,
  release_kobo bigint,
  reason text,
  actor uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  clean_reason text := btrim(reason);
  business uuid;
  e public.engagements;
  released bigint;
  final_outcome text := outcome;
begin
  if outcome is null or outcome not in ('release', 'refund', 'split', 'refund_creator_fault') then
    raise exception 'invalid_outcome' using errcode = '22023';
  end if;
  if clean_reason is null or clean_reason = '' or char_length(clean_reason) > 500 then
    raise exception 'settle_reason_required' using errcode = 'P0001';
  end if;

  select g.business_id into business from public.engagements g where g.id = engagement;
  perform 1 from public.users u where u.id = business for no key update;
  select * into e from public.engagements x where x.id = engagement for update;
  if e.id is null then
    raise exception 'no_such_engagement' using errcode = 'P0001';
  end if;

  -- Release amounts are checked before the no-op, so a bad call is always refused.
  released := case outcome when 'release' then e.agreed_price_kobo
                           when 'split' then release_kobo
                           else 0 end;
  if released is null or released < 0 or released > e.agreed_price_kobo or released % 100 <> 0
     or (outcome <> 'split' and release_kobo is not null and release_kobo <> released) then
    raise exception 'release_invalid' using errcode = 'P0001';
  end if;

  if e.settled_at is not null then
    return;
  end if;
  -- Stage 7 widens this to `submitted` and `disputed`.
  if e.status not in ('funded', 'in_progress') then
    raise exception 'engagement_locked' using errcode = 'P0001';
  end if;

  if outcome = 'split' and released = e.agreed_price_kobo then
    final_outcome := 'release';
  elsif outcome = 'split' and released = 0 then
    final_outcome := 'refund';
  end if;

  perform public.settle_money(e.id, final_outcome, released, final_outcome = 'refund_creator_fault',
    case when released > 0 then 'accepted' else 'refunded' end::public.engagement_status,
    null, actor, clean_reason);
end;
$$;

-- For admins -------------------------------------------------------------------------------------------

create function public.settle_engagement(engagement uuid, outcome text, release_kobo bigint, reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
begin
  if me is null or public.current_user_role() is distinct from 'admin' then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  perform public.settle_engagement_internal(engagement, outcome, release_kobo, reason, me);
end;
$$;

-- For the creator and the business ----------------------------------------------------------------------

-- "Start work": funded → in_progress. From here neither side cancels alone.
create function public.start_engagement(engagement uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  business uuid;
  e public.engagements;
begin
  select g.business_id into business from public.engagements g where g.id = engagement;
  perform 1 from public.users u where u.id = business for no key update;
  select * into e from public.engagements x where x.id = engagement for update;
  if e.id is null or me is null or e.creator_id is distinct from me then
    raise exception 'no_such_engagement' using errcode = 'P0001';
  end if;
  if e.status <> 'funded' then
    raise exception 'engagement_locked' using errcode = 'P0001';
  end if;

  update public.engagements x
     set status = 'in_progress', started_at = now(), updated_at = now()
   where x.id = e.id;
end;
$$;

-- Cancels a paid hire before work starts (CLAUDE.md §6.2). The business gets
-- the price back and the fee is kept; the creator withdrawing is treated as
-- creator at fault, so the business also gets the fee minus Paystack's charges.
create function public.cancel_funded_engagement(engagement uuid, fee_notice_seen boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  business uuid;
  e public.engagements;
begin
  select g.business_id into business from public.engagements g where g.id = engagement;
  perform 1 from public.users u where u.id = business for no key update;
  select * into e from public.engagements x where x.id = engagement for update;
  if e.id is null or me is null or me not in (e.business_id, e.creator_id) then
    raise exception 'no_such_engagement' using errcode = 'P0001';
  end if;
  if me = e.business_id and fee_notice_seen is not true then
    raise exception 'fee_notice_required' using errcode = '22023';
  end if;
  if e.status <> 'funded' or e.settled_at is not null then
    raise exception 'engagement_locked' using errcode = 'P0001';
  end if;

  if me = e.business_id then
    update public.engagements x set cancel_fee_notice_seen_at = now() where x.id = e.id;
    perform public.settle_money(e.id, 'refund', 0, false, 'cancelled', 'cancelled_by_business',
      me, 'cancelled_by_business');
  else
    perform public.settle_money(e.id, 'refund_creator_fault', 0, true, 'cancelled', 'cancelled_by_creator',
      me, 'cancelled_by_creator');
  end if;
end;
$$;

-- Function grants ---------------------------------------------------------------------------------

-- Unchanged from Stage 5: create or replace keeps these, restated for the reader.
revoke all on function public.engagement_json(public.engagements) from public, anon, authenticated;

revoke all on function public.settle_money(uuid, text, bigint, boolean, public.engagement_status, text, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.settle_engagement_internal(uuid, text, bigint, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.settle_engagement(uuid, text, bigint, text) from public, anon;
revoke all on function public.start_engagement(uuid) from public, anon;
revoke all on function public.cancel_funded_engagement(uuid, boolean) from public, anon;

grant execute on function public.settle_engagement(uuid, text, bigint, text) to authenticated;
grant execute on function public.start_engagement(uuid) to authenticated;
grant execute on function public.cancel_funded_engagement(uuid, boolean) to authenticated;
