-- A switch for identity checks (2026-11-25), off by default. While Pitchype is
-- an MVP the owner doesn't want Dojah's costs, so the platform runs end to end
-- without anyone verifying. Nothing of the identity build is removed: turning
-- the switch on (an admin, on /admin/identity) brings every gate back.
--
--   - identity_settings: one row, checks_required false. Read through
--     identity_checks_required(); changed only by set_identity_checks_required()
--     (admins), which records who and when.
--   - identity_verified() is what every gate asks (apply_to_campaign,
--     approve_application, transition_campaign on submit and at admin approval,
--     request_payout) and what the app asks for its banner and disabled
--     buttons. While the switch is off it answers true for everyone, so all of
--     them open without being redefined. While it is on it answers as before.
--   - approve_payout() asks for a clear screening only while the switch is on.
--     The app doesn't screen while it is off (src/lib/screening.ts).
--   - start_identity_check() still asks identity_verified(), so while the
--     switch is off it refuses with already_verified. No screen offers a check
--     while it is off.
--
-- Turning it on later: people who never verified meet the gates again, as on
-- the day identity first shipped. Nothing already agreed is undone; a payout
-- requested while it was off waits for a screening before an admin approves it.

create table public.identity_settings (
  id boolean primary key default true check (id),
  checks_required boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users (id)
);
insert into public.identity_settings default values;

alter table public.identity_settings enable row level security;
-- No policies: read and change it only through the functions below.
revoke all on table public.identity_settings from public, anon, authenticated;

create function public.identity_checks_required()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.checks_required from public.identity_settings s where s.id), false);
$$;

create function public.set_identity_checks_required(required boolean)
returns boolean
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
  if required is null then
    raise exception 'invalid_setting' using errcode = 'P0001';
  end if;
  update public.identity_settings s
     set checks_required = required, updated_at = now(), updated_by = me
   where s.id;
  return required;
end;
$$;

-- As in 20261128100000, plus the switch: while it is off everyone passes.
create or replace function public.identity_verified(person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not public.identity_checks_required()
      or exists (
           select 1
             from public.users u
            where u.id = person
              and (
                u.role = 'admin'
                or exists (
                  select 1
                    from public.identity_checks c
                   where c.user_id = u.id
                     and c.status = 'verified'
                     and ((u.role = 'influencer' and c.kind = 'creator_nin')
                       or (u.role = 'business' and c.kind in ('owner_nin', 'business_cac')))
                )
              )
         );
$$;

-- As in 20261123100100, except the screening is asked for only while identity
-- checks are on.
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
  -- While identity checks are on, the creator must have been screened clear
  -- (or an admin cleared a match) before any money is sent. Rejecting a
  -- payout is never blocked.
  if public.identity_checks_required() and public.screening_state(creator) <> 'clear' then
    raise exception 'screening_hold' using errcode = 'P0001';
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

revoke all on function public.identity_checks_required() from public, anon;
revoke all on function public.set_identity_checks_required(boolean) from public, anon;
grant execute on function public.identity_checks_required() to authenticated, service_role;
grant execute on function public.set_identity_checks_required(boolean) to authenticated;
-- create or replace keeps the existing grants; stated again so a reader sees them here.
revoke all on function public.approve_payout(uuid) from public, anon;
