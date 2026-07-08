-- GarageHunt — re-sync the matches table's INSERT policy
--
-- Publishing a new listing was failing with "new row violates row-level
-- security policy for table \"matches\"" (42501) when computeAndInsertMatches
-- tried to record matches against buyers' saved searches. The policy in
-- 0007_saved_searches_and_matches.sql is correct (it only requires the
-- referenced listing to be published), but the live database's copy may
-- have drifted from that file during development. This migration is a safe,
-- idempotent re-apply — drop then recreate — so the live policy is
-- guaranteed to match what's in source control, regardless of what's
-- currently deployed.
--
-- HOW TO RUN THIS: same as prior migrations — paste into the Supabase
-- Dashboard's SQL Editor and run.

drop policy if exists "Anyone can record a match against a published listing" on public.matches;

create policy "Anyone can record a match against a published listing"
  on public.matches for insert
  with check (
    exists (
      select 1 from public.sale_listings
      where sale_listings.id = listing_id
        and sale_listings.status = 'published'
    )
  );
