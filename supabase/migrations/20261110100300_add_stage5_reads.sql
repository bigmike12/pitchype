-- Read helpers for Stage 5 pages. Profiles are readable only by their owner,
-- so the names these pages show come through these functions, which return
-- only what each person may see.

-- The people the caller has blocked, with a name to show.
create function public.my_blocks()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', ub.blocked_id,
           'role', u.role,
           'name', coalesce(b.business_name, i.display_name, 'Someone'),
           'created_at', ub.created_at
         ) order by ub.created_at desc), '[]'::jsonb)
    from public.user_blocks ub
    join public.users u on u.id = ub.blocked_id
    left join public.business_profiles b on b.user_id = ub.blocked_id
    left join public.influencer_profiles i on i.user_id = ub.blocked_id
   where ub.blocker_id = public.current_user_id()
$$;

-- One engagement for either side (or an admin): the pay page and the
-- creator's view of a hire.
create function public.engagement_details(engagement uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := public.current_user_id();
  e public.engagements;
begin
  select * into e from public.engagements x where x.id = engagement;
  if e.id is null
     or (me not in (e.business_id, e.creator_id) and public.current_user_role() is distinct from 'admin') then
    raise exception 'no_such_engagement' using errcode = 'P0001';
  end if;

  return public.engagement_json(e) || jsonb_build_object(
    'application_id', e.application_id,
    'campaign', (select jsonb_build_object('id', k.id, 'title', k.title, 'price_kobo', k.price_kobo)
                   from public.campaigns k where k.id = e.campaign_id),
    'creator', (select jsonb_build_object('id', i.user_id, 'name', i.display_name, 'slug', i.slug)
                  from public.influencer_profiles i where i.user_id = e.creator_id),
    'business', (select jsonb_build_object('id', b.user_id, 'name', b.business_name)
                   from public.business_profiles b where b.user_id = e.business_id)
  );
end;
$$;

revoke all on function public.my_blocks() from public, anon;
revoke all on function public.engagement_details(uuid) from public, anon;
grant execute on function public.my_blocks() to authenticated;
grant execute on function public.engagement_details(uuid) to authenticated;
