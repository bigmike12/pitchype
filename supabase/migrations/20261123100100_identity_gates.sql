-- Identity gates (design: docs/superpowers/specs/2026-11-22-identity-verification-design.md §5.6, §5.7).
-- Existing functions, each copied from its latest definition with one check added:
--   * apply_to_campaign (from 20261114100000): identity_required unless the creator is verified.
--   * approve_application (from 20261114100100): identity_required unless the business is verified.
--   * transition_campaign (from 20261119100000): identity_required on 'submit' (draft to
--     open or pending_review) unless the owner is verified. Resume, pause, close and every
--     admin action are untouched.
--   * request_payout (from 20261122100300): identity_required unless the creator is verified;
--     the wallet is not touched.
--   * approve_payout (from 20261122100300): screening_hold unless screening_state(creator) is
--     'clear' (no screening, a possible match, an error and a confirmed match all hold).
--     reject_payout is not gated.
--
-- Invariants (proven by supabase/tests/identity_gates.test.sql):
--   * Nothing already agreed is taken away: a hire approved before verification existed can
--     still be paid, a paused campaign resumes, admin takedowns and every money function other
--     than the two payout ones are unchanged.
--   * An existing creator with earnings who never verified is refused a payout and keeps
--     the earnings.
--
-- New errors (errcode P0001): identity_required, screening_hold.

create or replace function public.apply_to_campaign(campaign uuid, proposed_price_kobo bigint, note text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  me uuid := public.current_user_id();
  k public.campaigns;
  cleaned text;
  new_id uuid;
  existing public.applications;
begin
  if me is null or public.current_user_role() is distinct from 'influencer' then
    raise exception 'creators apply to campaigns' using errcode = '42501';
  end if;
  perform public.check_standing(me);
  -- Applying needs a verified identity (design §5.7). Existing creators are
  -- unverified until they complete a check; nothing they already hold changes.
  if not public.identity_verified(me) then
    raise exception 'identity_required' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.listed_creators c where c.user_id = me) then
    raise exception 'profile_not_listed' using errcode = 'P0001';
  end if;

  select * into k from public.campaigns c where c.id = campaign;
  if k.id is null or k.status <> 'open' or k.applications_close_on < public.lagos_today() then
    raise exception 'campaign_closed' using errcode = 'P0001';
  end if;
  -- Lapse unpaid hires past their deadline first, so their places count as free
  -- (the daily job is not the only thing that applies a lapse).
  perform public.expire_unpaid_engagements(k.id);
  if public.held_places(k.id) >= k.places then
    raise exception 'campaign_full' using errcode = 'P0001';
  end if;
  if public.is_blocked_between(me, k.business_id) or public.is_suspended(k.business_id) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if not public.valid_proposed_price(proposed_price_kobo) then
    raise exception 'price_invalid' using errcode = 'P0001';
  end if;
  cleaned := public.clean_note(note);
  if public.campaign_problems(k.id, me) <> '[]'::jsonb then
    raise exception 'not_eligible' using errcode = 'P0001';
  end if;
  select * into existing from public.applications a
   where a.campaign_id = k.id and a.creator_id = me for update;
  if existing.id is not null then
    -- A hire that was never paid for (it lapsed, or the business cancelled
    -- before payment) leaves the creator free to apply again. The same
    -- application goes back to "waiting for a decision" with the new price and
    -- note; the old hire stays as history. Anything else is still refused: a
    -- live or paid hire, a passed-over application, a withdrawn one.
    if existing.status = 'approved'
       and not exists (
         select 1 from public.engagements e
          where e.application_id = existing.id
            and (e.status <> 'cancelled' or e.funded_at is not null)
       ) then
      update public.applications a
         set status = 'submitted',
             proposed_price_kobo = case when proposed_price_kobo = k.price_kobo then null else proposed_price_kobo end,
             note = cleaned,
             decision_note = null,
             created_at = now(),
             updated_at = now()
       where a.id = existing.id;
      return existing.id;
    end if;
    raise exception 'already_applied' using errcode = 'P0001';
  end if;

  insert into public.applications (campaign_id, creator_id, proposed_price_kobo, note)
  values (
    k.id, me,
    case when proposed_price_kobo = k.price_kobo then null else proposed_price_kobo end,
    cleaned
  )
  returning id into new_id;
  return new_id;
end;
$$;


create or replace function public.approve_application(application uuid, expected_price_kobo bigint)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  a public.applications;
  k public.campaigns;
  agreed bigint;
  engagement_id uuid;
  rehire boolean;
begin
  if me is null or public.current_user_role() is distinct from 'business' then
    raise exception 'businesses approve applications' using errcode = '42501';
  end if;

  select * into a from public.applications x where x.id = application;
  if a.id is null then
    raise exception 'no_such_application' using errcode = 'P0001';
  end if;
  select * into k from public.campaigns c where c.id = a.campaign_id for update;
  if k.business_id is distinct from me then
    raise exception 'no_such_application' using errcode = 'P0001';
  end if;
  -- Read the application again under the lock: its price may just have changed.
  select * into a from public.applications x where x.id = application for update;

  perform public.check_standing(me);
  -- Hiring needs a verified identity. A hire approved earlier can still be
  -- paid: start_payment() is not gated.
  if not public.identity_verified(me) then
    raise exception 'identity_required' using errcode = 'P0001';
  end if;
  if public.is_suspended(a.creator_id) then
    raise exception 'creator_unavailable' using errcode = 'P0001';
  end if;
  if public.is_blocked_between(me, a.creator_id) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  perform public.expire_unpaid_engagements(k.id);
  if k.status not in ('open', 'paused') then
    raise exception 'campaign_closed' using errcode = 'P0001';
  end if;
  -- Waiting for a decision, or approved before but never paid for (the hire
  -- lapsed, or was cancelled before payment): the business can hire again.
  rehire := a.status = 'approved' and public.hire_ended_unpaid(a.id);
  if a.status not in ('submitted', 'shortlisted') and not rehire then
    raise exception 'application_locked' using errcode = 'P0001';
  end if;
  agreed := coalesce(a.proposed_price_kobo, k.price_kobo);
  if agreed is distinct from expected_price_kobo then
    raise exception 'price_changed' using errcode = 'P0001';
  end if;
  if public.held_places(k.id) >= k.places then
    raise exception 'campaign_full' using errcode = 'P0001';
  end if;

  insert into public.engagements (application_id, campaign_id, business_id, creator_id, agreed_price_kobo, pay_by)
  values (a.id, k.id, me, a.creator_id, agreed, now() + interval '48 hours')
  returning id into engagement_id;
  update public.applications x set status = 'approved', updated_at = now() where x.id = a.id;
  if rehire then
    -- The status was already 'approved', so the application trigger stays quiet:
    -- tell the creator they are hired again.
    perform public.notify(a.creator_id, 'application_hired',
      jsonb_build_object('campaign_id', k.id, 'campaign_title', k.title, 'application_id', a.id,
                         'name', public.display_name_of(me)));
  end if;
  return engagement_id;
end;
$$;


create or replace function public.transition_campaign(
  campaign_id uuid,
  action text,
  note text default null
)
returns public.campaign_status
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  caller uuid := public.current_user_id();
  caller_role public.user_role := public.current_user_role();
  c public.campaigns;
  clean_note text := nullif(btrim(note), '');
  new_status public.campaign_status;
begin
  select * into c from public.campaigns k where k.id = campaign_id for update;
  if c.id is null then
    raise exception 'no such campaign' using errcode = 'P0002';
  end if;

  if action in ('submit', 'withdraw', 'pause', 'resume', 'close') then
    if caller is null or c.business_id <> caller then
      raise exception 'only the business that owns this campaign can do that' using errcode = '42501';
    end if;
  elsif action in ('approve', 'reject', 'take_down') then
    if caller_role is distinct from 'admin' then
      raise exception 'only admins can do that' using errcode = '42501';
    end if;
  else
    raise exception 'unknown action %', action using errcode = '22023';
  end if;

  case action
    when 'submit' then
      if c.status <> 'draft' then
        raise exception 'only drafts can be submitted' using errcode = '55000';
      end if;
      -- Sending a campaign for listing needs a verified owner. Resuming a
      -- paused campaign and admin actions are not gated: a live campaign stays live.
      if not public.identity_verified(c.business_id) then
        raise exception 'identity_required' using errcode = 'P0001';
      end if;
      if c.applications_close_on < public.lagos_today() then
        raise exception 'the application deadline has passed' using errcode = '22023';
      end if;
      if not exists (select 1 from public.campaign_deliverables d where d.campaign_id = c.id)
         or exists (
           select 1 from public.campaign_platforms p
            where p.campaign_id = c.id
              and not exists (
                select 1 from public.campaign_deliverables d
                 where d.campaign_id = c.id and d.platform = p.platform
              )
         )
      then
        raise exception 'every platform needs at least one deliverable' using errcode = '22023';
      end if;
      -- A business is trusted once an admin has approved one of its campaigns.
      -- Per-click campaigns always wait: an admin checks the destination is the
      -- business's own (a stand-in for domain verification).
      if c.payment_model = 'fixed' and exists (
        select 1 from public.campaigns k
         where k.business_id = c.business_id and k.approved_at is not null
      ) then
        new_status := 'open';
      else
        new_status := 'pending_review';
      end if;
      update public.campaigns k
         set status = new_status,
             submitted_at = now(),
             published_at = case when new_status = 'open' then coalesce(k.published_at, now()) else k.published_at end,
             review_note = null
       where k.id = c.id;

    when 'withdraw' then
      if c.status <> 'pending_review' then
        raise exception 'only campaigns waiting for review can be withdrawn' using errcode = '55000';
      end if;
      new_status := 'draft';
      update public.campaigns k set status = new_status where k.id = c.id;

    when 'approve' then
      if c.status <> 'pending_review' then
        raise exception 'this campaign is not waiting for review' using errcode = '55000';
      end if;
      if c.applications_close_on < public.lagos_today() then
        raise exception 'the application deadline has passed; send it back instead' using errcode = '22023';
      end if;
      new_status := 'open';
      update public.campaigns k
         set status = new_status, approved_at = now(), approved_by = caller,
             published_at = coalesce(k.published_at, now())
       where k.id = c.id;

    when 'reject' then
      if c.status <> 'pending_review' then
        raise exception 'this campaign is not waiting for review' using errcode = '55000';
      end if;
      if clean_note is null then
        raise exception 'say why it is being sent back' using errcode = '22023';
      end if;
      new_status := 'draft';
      update public.campaigns k set status = new_status, review_note = clean_note where k.id = c.id;

    when 'pause' then
      if c.status <> 'open' then
        raise exception 'only open campaigns can be paused' using errcode = '55000';
      end if;
      new_status := 'paused';
      update public.campaigns k set status = new_status where k.id = c.id;

    when 'resume' then
      if c.status <> 'paused' then
        raise exception 'only paused campaigns can be resumed' using errcode = '55000';
      end if;
      if c.applications_close_on < public.lagos_today() then
        raise exception 'the application deadline has passed; extend it first' using errcode = '22023';
      end if;
      new_status := 'open';
      update public.campaigns k set status = new_status where k.id = c.id;

    when 'close' then
      if c.status not in ('open', 'paused') then
        raise exception 'only open or paused campaigns can be closed' using errcode = '55000';
      end if;
      new_status := 'closed';
      update public.campaigns k set status = new_status, closed_at = now() where k.id = c.id;

    when 'take_down' then
      if c.status not in ('pending_review', 'open', 'paused') then
        raise exception 'this campaign is not live' using errcode = '55000';
      end if;
      if clean_note is null then
        raise exception 'give a reason the business will see' using errcode = '22023';
      end if;
      new_status := 'closed';
      update public.campaigns k
         set status = new_status, closed_at = now(), removed_reason = clean_note
       where k.id = c.id;
  end case;

  return new_status;
end;
$$;


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
  -- Payouts need a verified identity, existing creators included. Nothing is
  -- taken: the earnings stay in the wallet.
  if not public.identity_verified(me) then
    raise exception 'identity_required' using errcode = 'P0001';
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
  -- The creator must have been screened clear (or an admin cleared a match)
  -- before any money is sent. Rejecting a payout is never blocked.
  if public.screening_state(creator) <> 'clear' then
    raise exception 'screening_hold' using errcode = 'P0001';
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


-- create or replace keeps the existing grants; stated again so a reader sees them here.
revoke all on function public.apply_to_campaign(uuid, bigint, text) from public, anon;
revoke all on function public.approve_application(uuid, bigint) from public, anon;
revoke all on function public.transition_campaign(uuid, text, text) from public, anon;
revoke all on function public.request_payout(bigint) from public, anon;
revoke all on function public.approve_payout(uuid) from public, anon;
