-- GarageHunt — move match computation server-side (Phase 2d), so a listing
-- published from EITHER the mobile app or the website triggers matches the
-- same way, instead of each client needing to remember to call
-- computeAndInsertMatches itself.
--
-- Mirrors the exact matching semantics utils/matches.ts's
-- computeAndInsertMatches already used client-side:
--   - Radius/date candidate filtering: reuses the EXISTING
--     candidate_saved_searches_for_listing() RPC from
--     0007_saved_searches_and_matches.sql, unchanged — no need to
--     re-derive the haversine formula here.
--   - Category match: exact array overlap (listing's category_ids &&
--     saved_search's category_ids) — same as the client-side `.some(id =>
--     ...includes(id))` check.
--   - Keyword match: case-insensitive substring against description OR any
--     other_items entry, same as utils/discover-filters.ts's
--     matchesOtherKeyword — replicated directly in SQL below, not
--     reimplemented differently.
--   - Duplicate-safe: `matches` already has a unique (saved_search_id,
--     listing_id) constraint (0007) — this uses that directly via
--     ON CONFLICT DO NOTHING rather than the client's insert-then-catch-
--     23505 dance (that workaround was for an RLS/upsert quirk that
--     doesn't apply here since this function runs as security definer,
--     bypassing RLS entirely, same as candidate_saved_searches_for_listing
--     and notify_match_webhook already do).
--
-- Fires on public.sale_listings_raw (the real table — sale_listings is a
-- view since 0034_address_privacy_enforcement.sql, and a plain AFTER
-- trigger has to live on the base table; the view's UPDATE always forwards
-- through to a full-column UPDATE on sale_listings_raw regardless of which
-- client/table the caller wrote to, so this fires correctly either way).
--
-- New matches rows land with is_backfill's default (false), so the
-- EXISTING matches_send_notification trigger (0019/0029) picks them up and
-- sends push exactly as before — nothing about that trigger changes here.
--
-- HOW TO RUN THIS: paste into the Supabase Dashboard's SQL Editor and run.

create or replace function public.compute_matches_for_listing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  listing_category_ids uuid[];
begin
  select coalesce(array_agg(category_id), '{}')
  into listing_category_ids
  from public.listing_categories
  where listing_id = new.id;

  insert into public.matches (saved_search_id, listing_id)
  select c.id, new.id
  from public.candidate_saved_searches_for_listing(new.latitude, new.longitude, new.start_date, new.end_date) c
  where
    (c.category_ids && listing_category_ids)
    or exists (
      select 1
      from unnest(coalesce(c.keywords, '{}')) as kw
      where kw <> ''
        and (
          position(lower(kw) in lower(coalesce(new.description, ''))) > 0
          or exists (
            select 1
            from unnest(coalesce(new.other_items, '{}')) as oi
            where position(lower(kw) in lower(oi)) > 0
          )
        )
    )
  on conflict (saved_search_id, listing_id) do nothing;

  return new;
end;
$$;

drop trigger if exists sale_listings_compute_matches on public.sale_listings_raw;

create trigger sale_listings_compute_matches
  after update on public.sale_listings_raw
  for each row
  when (new.status = 'published' and old.status is distinct from 'published')
  execute function public.compute_matches_for_listing();
