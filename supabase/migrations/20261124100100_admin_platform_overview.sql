-- Platform figures for the admin home: how many people and campaigns there are
-- and how much money has moved, read from real records only.
--
-- Invariants (proven by supabase/tests/admin_platform_overview.test.sql):
--   * Only an admin may read it; the role is checked inside.
--   * Admins are not counted as people; drafts are not counted as campaigns.
--   * Money paid in is cash that reached us from businesses: the positive
--     amounts on the cash accounts in payment_received and deposit_received
--     groups. Wallet and escrow moves, refunds and provider fees are not.
--   * Money paid out is what reached creators: payouts that finished `paid`
--     (a reversed or failed one is not `paid`), less the transfer cost the
--     creator bears.
--   * Revenue is the negated balance of the platform_revenue account: fees
--     kept, after a per-click hire's unspent fee went back to the business.
--     It is separate from volume: paid in is not our income.

create function public.admin_platform_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.current_user_role() is distinct from 'admin' then
    raise exception 'not_an_admin' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'businesses', (select count(*) from public.users u where u.role = 'business'),
    'creators', (select count(*) from public.users u where u.role = 'influencer'),
    'campaigns_total', (select count(*) from public.campaigns c where c.status <> 'draft'),
    'campaigns_live', (select count(*) from public.campaigns c where c.status in ('open', 'in_progress')),
    'paid_in_kobo', (
      select coalesce(sum(l.amount_kobo), 0) from public.ledger_entries l
       where l.account in ('paystack', 'cray')
         and l.event_type in ('payment_received', 'deposit_received')
         and l.amount_kobo > 0
    ),
    'paid_out_kobo', (
      select coalesce(sum(p.amount_kobo - p.transfer_fee_kobo), 0) from public.payouts p
       where p.status = 'paid'
    ),
    'revenue_kobo', (
      select -coalesce(sum(l.amount_kobo), 0) from public.ledger_entries l
       where l.account = 'platform_revenue'
    ),
    'as_of', now()
  );
end;
$$;

revoke all on function public.admin_platform_overview() from public, anon, service_role;
grant execute on function public.admin_platform_overview() to authenticated;
