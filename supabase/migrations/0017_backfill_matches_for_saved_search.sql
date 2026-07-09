-- GarageHunt — backfill matches for newly-saved/edited searches.
--
-- ROOT CAUSE: matches were only ever computed in one direction —
-- candidate_saved_searches_for_listing (0007_saved_searches_and_matches.sql)
-- runs once, right when a NEW listing is published, checking it against all
-- *existing* saved searches. There was no reverse direction: saving a new
-- "I'm Looking For" search never checked it against listings that were
-- already published before the search existed. That's not a location/GPS
-- bug — it reproduces on any platform, every time; it just wasn't exercised
-- by earlier testing, which happened to always save the search before
-- publishing a matching listing.
--
-- This mirrors that RPC in the opposite direction: given one saved search
-- (owned by the caller — scoped by auth.uid(), not security definer, since
-- there's no cross-user data to bridge here, unlike the listing-side
-- function), return every currently-published listing within its date
-- range/radius, plus enough fields (description, other_items, category_ids)
-- for the client to finish the same matchesOtherKeyword/category-overlap
-- decision utils/matches.ts already makes for the forward direction.
--
-- HOW TO RUN THIS: same as prior migrations — paste into the Supabase
-- Dashboard's SQL Editor and run.

create or replace function public.candidate_listings_for_saved_search(
  p_search_id uuid
)
returns table (
  id uuid,
  description text,
  other_items text[],
  category_ids uuid[]
)
language sql
stable
as $$
  select
    l.id,
    l.description,
    l.other_items,
    coalesce(array_agg(lc.category_id) filter (where lc.category_id is not null), '{}') as category_ids
  from public.saved_searches s
  join public.sale_listings l
    on l.status = 'published'
    and (s.date_from is null or l.end_date is null or s.date_from <= l.end_date)
    and (s.date_to is null or l.start_date is null or s.date_to >= l.start_date)
    and (
      6371 * acos(
        least(1, greatest(-1,
          cos(radians(s.center_latitude)) * cos(radians(l.latitude)) *
          cos(radians(l.longitude) - radians(s.center_longitude)) +
          sin(radians(s.center_latitude)) * sin(radians(l.latitude))
        ))
      )
    ) <= s.radius_km
  left join public.listing_categories lc on lc.listing_id = l.id
  where s.id = p_search_id
    and s.user_id = auth.uid()
  group by l.id, l.description, l.other_items;
$$;

grant execute on function public.candidate_listings_for_saved_search to authenticated;
