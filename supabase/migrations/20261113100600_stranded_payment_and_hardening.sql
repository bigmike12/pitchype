-- Final-review fixes for Stage 6 (spec docs/superpowers/specs/2026-11-13-stage-6-money-design.md §13).
--
-- 1. A stranded payment is announced. A card payment that cannot fund its
--    hire (the hire lapsed, was cancelled or already paid, or the wallet part
--    is no longer covered) is credited to the business wallet by
--    record_card_payment(). Until now nobody was told. The notice is raised by
--    a trigger on the ledger, so the reviewed money functions are not edited
--    again. The stranded group is the only `payment_received` group with a
--    NEGATIVE `business_wallet` line (create_funding: a funding card payment
--    spends the wallet part as a positive line; wallet-only funding is
--    `hire_funded`; refunds are `hire_settled`; test credits are
--    `correction`), so that shape identifies it exactly. The trigger reads the
--    row it is given and writes one notification; it moves no money.
--
--      payment_stranded   to the business   the amount now in its wallet
--
-- 2. Hardening. No app role needs post_ledger_group(): every money function
--    calls it as the owner (security definer). save_bank_account() is unused;
--    the server saves accounts through save_bank_account_for(). Both lose the
--    service role's grant, so the secret key cannot post an arbitrary ledger
--    group or write an unverified bank account.

alter type public.notification_kind add value 'payment_stranded';

create function public.ledger_entries_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  facts jsonb;
begin
  if new.account <> 'business_wallet' or new.event_type <> 'payment_received' or new.amount_kobo >= 0 then
    return null;
  end if;
  -- The hire and campaign when the row names one; a left join keeps the
  -- amount even if it doesn't.
  select jsonb_strip_nulls(jsonb_build_object(
           'amount_kobo', -new.amount_kobo,
           'engagement_id', new.engagement_id,
           'campaign_id', k.id,
           'campaign_title', k.title))
    into facts
    from (select 1) one
    left join public.engagements g on g.id = new.engagement_id
    left join public.campaigns k on k.id = g.campaign_id;
  perform public.notify(new.owner_user_id, 'payment_stranded', facts);
  return null;
end;
$$;

create trigger ledger_entries_notify
  after insert on public.ledger_entries
  for each row execute function public.ledger_entries_notify();

revoke all on function public.ledger_entries_notify() from public, anon, authenticated;

revoke execute on function public.post_ledger_group(text, uuid, text, uuid, uuid, uuid, text, uuid, jsonb)
  from service_role;
revoke execute on function public.save_bank_account(text, text, text, text, text) from service_role;
