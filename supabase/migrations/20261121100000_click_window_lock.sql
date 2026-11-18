-- A per-click campaign's end date (deliver_by) can't change once its clicks
-- have stopped: the owner's decision of 2026-11-20 ("Once clicks have stopped
-- and the 72-hour waiting period begins, the business cannot extend the
-- campaign"). Moving it would reopen the clicks, close the dispute window
-- and contradict the settle date both sides were already told. Before that it
-- may still move later, as before. Fixed-price campaigns are unchanged.
-- Otherwise as in 20261119100000_per_click_campaigns.sql.

create or replace function public.campaigns_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
       select 1 from unnest(new.niches) as chosen (slug)
       where chosen.slug not in (select n.slug from public.niches n)
     )
     or cardinality(new.niches) <> (select count(distinct n) from unnest(new.niches) as n)
     or cardinality(new.states) <> (select count(distinct s) from unnest(new.states) as s)
  then
    raise exception 'niches and states must be distinct entries from their lists'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();

    if new.places < old.places and new.places < public.held_places(new.id) then
      raise exception 'places_below_held' using errcode = 'P0001';
    end if;

    if old.status <> 'draft' then
      if (new.niches, new.states, new.verified_only, new.payment_model, new.price_kobo, new.post_from,
          new.cpc_kobo, new.destination_url, new.utm_tags, new.blocked_channels)
         is distinct from
         (old.niches, old.states, old.verified_only, old.payment_model, old.price_kobo, old.post_from,
          old.cpc_kobo, old.destination_url, old.utm_tags, old.blocked_channels)
      then
        raise exception 'price, requirements and posting dates are locked once a campaign is submitted'
          using errcode = '42501';
      end if;
      -- Pay per click: once clicks have stopped (the 72-hour wait has begun),
      -- the end date is final, so the settle date both sides were told holds.
      if old.payment_model = 'per_click' and new.deliver_by is distinct from old.deliver_by
         and now() >= public.click_window_end(old.deliver_by) then
        raise exception 'the click window has ended' using errcode = '42501';
      end if;
      if new.applications_close_on < old.applications_close_on or new.deliver_by < old.deliver_by then
        raise exception 'deadlines can only move later once a campaign is submitted'
          using errcode = '42501';
      end if;
      -- Wording, deadlines and places change only while open or paused.
      if old.status not in ('open', 'paused')
         and (new.title, new.brief, new.guidelines, new.applications_close_on, new.deliver_by, new.places)
             is distinct from
             (old.title, old.brief, old.guidelines, old.applications_close_on, old.deliver_by, old.places)
      then
        raise exception 'a campaign can only be edited while it is a draft, open or paused'
          using errcode = '42501';
      end if;
    end if;
  end if;

  return new;
end;
$$;
