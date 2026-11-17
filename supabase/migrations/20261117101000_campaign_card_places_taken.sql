-- Creators see how many places a campaign still has. The campaign card (the
-- JSON behind the creator's list and a campaign's page) gains `places_taken`,
-- the number held_places() reports, which is also what list_open_campaigns()
-- uses to leave a full campaign out of the list. Creators can't read other
-- businesses' hires, so this is the only way for them to know. It reveals
-- nothing but that number (held_places is already granted for that reason).
--
-- Only the card changes: same signature, same grants, same other fields.

create or replace function public.campaign_card(k public.campaigns, viewer uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', k.id,
    'title', k.title,
    'status', k.status,
    'business_name', b.business_name,
    'business_city', b.city,
    'business_state', b.state,
    'niches', k.niches,
    'states', k.states,
    'verified_only', k.verified_only,
    'payment_model', k.payment_model,
    'price_kobo', k.price_kobo,
    'places', k.places,
    'places_taken', public.held_places(k.id),
    'applications_close_on', k.applications_close_on,
    'post_from', k.post_from,
    'deliver_by', k.deliver_by,
    'published_at', k.published_at,
    'platforms', (
      select coalesce(jsonb_agg(jsonb_build_object('platform', p.platform, 'min_followers', p.min_followers)
                                order by p.platform), '[]'::jsonb)
        from public.campaign_platforms p where p.campaign_id = k.id
    ),
    'deliverables', (
      select coalesce(jsonb_agg(jsonb_build_object('platform', d.platform, 'kind', d.kind, 'quantity', d.quantity)
                                order by d.position), '[]'::jsonb)
        from public.campaign_deliverables d where d.campaign_id = k.id
    ),
    'problems', case
      when public.current_user_role() = 'influencer' then public.campaign_problems(k.id, viewer)
      else '[]'::jsonb
    end
  )
  from public.business_profiles b
  where b.user_id = k.business_id
$$;
