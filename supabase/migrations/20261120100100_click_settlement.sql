-- Settling per-click hires (pay per click, Part 2;
-- docs/superpowers/specs/2026-11-18-pay-per-click-design.md §3, §7).
--
-- Invariants protected here:
--   1. Escrow still leaves a hire only through settle_money(), one balanced
--      hire_settled group, at most once (a settled hire is a no-op).
--   2. A per-click hire releases least(billable clicks × cost per click, the
--      agreed budget), whole naira. Outcome release / split / refund by amount.
--   3. On a per-click hire that isn't at fault, the business keeps
--      least(fee paid, greatest(5% of released, the minimum fee, Paystack's
--      charge on the payment that funded the hire)) and gets the rest of its
--      fee back in the same group. Because the charge is a floor, a paid hire
--      never loses money (CLAUDE.md §6.1). Same rule as clickFeeKept() in
--      src/lib/fees.ts. The fault rule is unchanged.
--   4. Lock order: the business's users row, then the engagement, then the
--      tracked link. record_click() takes the engagement FOR SHARE first, so
--      once settlement holds the engagement no further click can count, and
--      the count it reads is final.
--   5. The daily job is idempotent and safe to run twice or late: it claims a
--      hire's hold notice by setting click_hold_notified_at under the row lock
--      (a second run finds it set), settles each due hire in its own
--      subtransaction, and settle_click_hire() reports whether it settled.
--   6. An open dispute holds a hire back: only funded or in_progress hires settle.

alter table public.engagements
  -- When a per-click creator withdrew: their link stops counting from then.
  add column clicks_stopped_at timestamptz,
  -- When both people were told the click window ended (once per hire).
  add column click_hold_notified_at timestamptz;

-- The window and the hold ----------------------------------------------------------------------------

create function public.click_window_end(deliver_by date)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select (deliver_by + 1)::timestamp at time zone 'Africa/Lagos'
$$;

create function public.click_settles_at(deliver_by date)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select public.click_window_end(deliver_by) + interval '72 hours'
$$;

-- settle_money: the per-click fee rule ------------------------------------------------------------------
-- As in 20261113100250_fix_fault_refund_charge.sql, plus the per-click branch.

create or replace function public.settle_money(
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
  per_click boolean;
  fee_bps integer;
  min_fee bigint;
  kept bigint;
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

  select k.payment_model = 'per_click' into per_click from public.campaigns k where k.id = e.campaign_id;
  if fault or per_click then
    -- Paystack's charge on the one payment that funded the hire (none from the wallet).
    select coalesce(p.paystack_fee_kobo, 0) into charges
      from public.payments p
     where p.id = (
       select l.payment_id from public.ledger_entries l
        where l.engagement_id = e.id and l.account = 'escrow' and l.amount_kobo < 0
          and l.event_type in ('payment_received', 'hire_funded')
        order by l.created_at, l.id
        limit 1
     );
    charges := coalesce(charges, 0);
  end if;

  if fault then
    fee_back := e.business_fee_kobo - least(charges, e.business_fee_kobo);
  elsif per_click then
    select f.business_fee_bps, f.min_fee_kobo into fee_bps, min_fee
      from public.fee_config f where f.id = e.fee_config_id;
    kept := least(e.business_fee_kobo,
                  greatest((released * fee_bps + 5000) / 10000, min_fee, charges));
    fee_back := e.business_fee_kobo - kept;
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

revoke all on function public.settle_money(uuid, text, bigint, boolean, public.engagement_status, text, uuid, text)
  from public, anon, authenticated, service_role;

-- Settling one per-click hire for its clicks -----------------------------------------------------------
-- Internal: called by settle_due_click_hires(). True if it settled now; false
-- if the hire was already settled or isn't funded or in progress (a dispute
-- opened, say), so a concurrent run neither double counts nor fails.

create function public.settle_click_hire(engagement uuid, actor uuid, reason text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  business uuid;
  e public.engagements;
  k public.campaigns;
  link public.tracked_links;
  released bigint;
begin
  select g.business_id into business from public.engagements g where g.id = engagement;
  perform 1 from public.users u where u.id = business for no key update;
  select * into e from public.engagements x where x.id = engagement for update;
  if e.id is null then
    raise exception 'no_such_engagement' using errcode = 'P0001';
  end if;
  select * into link from public.tracked_links t where t.engagement_id = e.id for update;
  if e.settled_at is not null or e.status not in ('funded', 'in_progress') then
    return false;
  end if;
  select * into k from public.campaigns c where c.id = e.campaign_id;
  if k.payment_model <> 'per_click' then
    raise exception 'not_per_click' using errcode = 'P0001';
  end if;

  released := least(coalesce(link.billable_clicks, 0)::bigint * k.cpc_kobo, e.agreed_price_kobo);
  perform public.settle_money(
    e.id,
    case when released = e.agreed_price_kobo then 'release' when released = 0 then 'refund' else 'split' end,
    released, false,
    case when released > 0 then 'accepted' else 'refunded' end::public.engagement_status,
    null, actor, reason);
  return true;
end;
$$;

revoke all on function public.settle_click_hire(uuid, uuid, text) from public, anon, authenticated, service_role;

-- The daily job --------------------------------------------------------------------------------------

create function public.settle_due_click_hires()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
  claimed uuid;
  notified integer := 0;
  settled integer := 0;
  failed integer := 0;
begin
  -- 1. Tell both people, once, that the click window ended and when it settles.
  for r in
    select e.id, e.business_id, e.creator_id, k.title, k.deliver_by, k.cpc_kobo, e.agreed_price_kobo,
           coalesce(t.billable_clicks, 0) as billable
      from public.engagements e
      join public.campaigns k on k.id = e.campaign_id
      left join public.tracked_links t on t.engagement_id = e.id
     where k.payment_model = 'per_click'
       and e.status in ('funded', 'in_progress') and e.settled_at is null
       and e.click_hold_notified_at is null
       and now() >= public.click_window_end(k.deliver_by)
     order by e.id
  loop
    -- Same lock order as the money functions; the claim makes a second run skip it.
    perform 1 from public.users u where u.id = r.business_id for no key update;
    update public.engagements x set click_hold_notified_at = now()
     where x.id = r.id and x.click_hold_notified_at is null
    returning x.id into claimed;
    continue when claimed is null;
    perform public.notify(p, 'click_hold_started', jsonb_build_object(
        'engagement_id', r.id,
        'campaign_title', r.title,
        'settles_at', public.click_settles_at(r.deliver_by),
        'billable', r.billable,
        'earned_kobo', least(r.billable::bigint * r.cpc_kobo, r.agreed_price_kobo)),
      'click_hold:' || r.id)
      from unnest(array[r.creator_id, r.business_id]) as p;
    notified := notified + 2;
  end loop;

  -- 2. Settle each hire whose hold is over, one subtransaction each.
  for r in
    select e.id
      from public.engagements e
      join public.campaigns k on k.id = e.campaign_id
     where k.payment_model = 'per_click'
       and e.status in ('funded', 'in_progress') and e.settled_at is null
       and now() >= public.click_settles_at(k.deliver_by)
     order by e.id
  loop
    begin
      if public.settle_click_hire(r.id, null, 'click_hold_ended') then
        settled := settled + 1;
      end if;
    exception when others then
      failed := failed + 1;
      raise warning 'settle_click_hire % failed: %', r.id, sqlstate;
    end;
  end loop;

  return jsonb_build_object('notified', notified, 'settled', settled, 'failed', failed);
end;
$$;

revoke all on function public.settle_due_click_hires() from public, anon, authenticated;
grant execute on function public.settle_due_click_hires() to service_role;

-- The hire pages: when clicks stop, when it settles, the creator fee snapshot ----------------------------

create or replace function public.engagement_click_summary(engagement uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  e public.engagements;
  link public.tracked_links;
  k public.campaigns;
  timing jsonb;
begin
  select * into e from public.engagements g where g.id = engagement;
  if e.id is null
     or not (me in (e.creator_id, e.business_id) or public.current_user_role() = 'admin') then
    return null;
  end if;
  select * into k from public.campaigns c where c.id = e.campaign_id;
  if k.payment_model <> 'per_click' then
    return null;
  end if;
  timing := jsonb_build_object(
    'clicksEndAt', public.click_window_end(k.deliver_by),
    'settlesAt', public.click_settles_at(k.deliver_by),
    'clicksStoppedAt', e.clicks_stopped_at,
    'creatorFeeBps', e.creator_fee_bps,
    'creatorMinFeeKobo', e.creator_min_fee_kobo);
  select * into link from public.tracked_links t where t.engagement_id = e.id;
  if link.id is null then
    return jsonb_build_object('code', null, 'cpcKobo', k.cpc_kobo, 'capKobo', e.agreed_price_kobo,
                              'blockedChannels', to_jsonb(k.blocked_channels)) || timing;
  end if;
  return public.link_summary(link, k) || timing;
end;
$$;
