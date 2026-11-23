-- Tell the creator when an admin takes down a work sample or removes their
-- cover, with the admin's reason (owner's decision, 2026-11-23). Emailed
-- always, like the other standing notices (src/lib/notification-email.ts).
-- Same functions as 20261127100100 with the notice added; create or replace
-- keeps their grants. A removal that finds nothing to remove tells nobody.

create or replace function public.hide_portfolio_sample(sample uuid, reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  admin_id uuid := public.current_user_id();
  clean_reason text := btrim(reason);
  owner uuid;
  taken_caption text;
begin
  if admin_id is null or public.current_user_role() is distinct from 'admin' then
    raise exception 'only admins take samples down' using errcode = '42501';
  end if;
  if clean_reason is null or char_length(clean_reason) not between 2 and 200 then
    raise exception 'give a reason of 2 to 200 characters' using errcode = '22023';
  end if;

  update public.portfolio_samples s
     set hidden_at = now(), hidden_reason = clean_reason, hidden_by = admin_id
   where s.id = sample and s.hidden_at is null
  returning s.user_id, s.caption into owner, taken_caption;
  if owner is null then
    raise exception 'no such sample, or it is already down' using errcode = 'P0002';
  end if;

  insert into public.moderation_events (user_id, kind, actor_id, reason)
  values (owner, 'portfolio_sample_hidden', admin_id, clean_reason);
  perform public.notify(owner, 'portfolio_sample_hidden',
    jsonb_build_object('note', clean_reason, 'caption', taken_caption));
end;
$$;

create or replace function public.clear_cover(creator uuid, reason text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  admin_id uuid := public.current_user_id();
  clean_reason text := btrim(reason);
  previous integer;
begin
  if admin_id is null or public.current_user_role() is distinct from 'admin' then
    raise exception 'only admins remove covers' using errcode = '42501';
  end if;
  if clean_reason is null or char_length(clean_reason) not between 2 and 200 then
    raise exception 'give a reason of 2 to 200 characters' using errcode = '22023';
  end if;

  select p.cover_version into previous
    from public.influencer_profiles p
   where p.user_id = creator
     for update;
  if previous is null then
    return null;
  end if;

  update public.influencer_profiles p set cover_version = null where p.user_id = creator;
  insert into public.moderation_events (user_id, kind, actor_id, reason)
  values (creator, 'cover_removed', admin_id, clean_reason);
  perform public.notify(creator, 'cover_removed', jsonb_build_object('note', clean_reason));
  return previous;
end;
$$;
