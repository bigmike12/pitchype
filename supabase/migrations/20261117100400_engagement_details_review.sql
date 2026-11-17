-- The hire page's review facts (Stage 7): engagement_details gains the latest
-- round, the pending round's review deadline, how many resubmissions are
-- left, the open dispute, when a non-delivery dispute may be opened and the
-- campaign's deliver-by date. Everything it returned before is unchanged.
--
-- Invariants: a read only (stable, no writes). Who may call it is as before:
-- either person on the hire, or an admin. The dispute time comes from
-- non_delivery_dispute_at() so the page and the dispute check can't disagree.
-- engagement_json is not touched: an overdue hire is not shown as released
-- (spec §3); the daily job and the next accept or deny release it.

create or replace function public.engagement_details(engagement uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  e public.engagements;
  latest_round integer;
begin
  select * into e from public.engagements x where x.id = engagement;
  if e.id is null
     or (me not in (e.business_id, e.creator_id) and public.current_user_role() is distinct from 'admin') then
    raise exception 'no_such_engagement' using errcode = 'P0001';
  end if;

  select max(s.round) into latest_round from public.submissions s where s.engagement_id = e.id;

  return public.engagement_json(e) || jsonb_build_object(
    'application_id', e.application_id,
    'campaign', (select jsonb_build_object('id', k.id, 'title', k.title, 'price_kobo', k.price_kobo,
                                           'deliver_by', k.deliver_by)
                   from public.campaigns k where k.id = e.campaign_id),
    'creator', (select jsonb_build_object('id', i.user_id, 'name', i.display_name, 'slug', i.slug)
                  from public.influencer_profiles i where i.user_id = e.creator_id),
    'business', (select jsonb_build_object('id', b.user_id, 'name', b.business_name)
                   from public.business_profiles b where b.user_id = e.business_id),
    'round', latest_round,
    'review_deadline_at', (select s.review_deadline_at from public.submissions s
                            where s.engagement_id = e.id and s.status = 'pending_review'),
    'rounds_left', 4 - coalesce(latest_round, 0),
    'open_dispute_id', (select d.id from public.disputes d
                         where d.engagement_id = e.id and d.status = 'open'),
    'dispute_allowed_from', case
      when e.status = 'in_progress' and e.started_at is not null
      then public.non_delivery_dispute_at(e) end
  );
end;
$$;

revoke all on function public.engagement_details(uuid) from public, anon;
grant execute on function public.engagement_details(uuid) to authenticated;
