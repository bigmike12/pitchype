-- Guards the payout payload scrub against odd payload shapes.
-- Fixes 20261113100500_create_audit.sql, whose finish_payout() applied `#-`
-- to any payload. `#-` raises when the payload, `data` or `data.recipient` is
-- a scalar, JSON null or an array, so a malformed transfer webhook would fail
-- every time: Paystack would retry forever and the payout would stay in
-- `processing` with no event recorded. Now each path is removed only when its
-- parent is an object; any other payload is stored unchanged. The full account
-- number is still removed wherever Paystack puts it in a well-formed event.
-- Everything else is as in 20261113100500, including the grants (service_role
-- only), which create or replace keeps.

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
  stored jsonb := coalesce(finish_payout.payload, '{}'::jsonb);
begin
  if outcome is null or outcome not in ('paid', 'failed') then
    raise exception 'invalid_outcome' using errcode = '22023';
  end if;

  -- `#-` raises unless every step of the path is an object, so scrub only
  -- where the shape allows it; any other payload is stored as received.
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

revoke all on function public.finish_payout(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.finish_payout(text, text, text, jsonb) to service_role;
