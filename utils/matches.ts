import { matchesOtherKeyword } from '@/utils/discover-filters';
import { supabase } from '@/utils/supabase';

// Mirrors the `matches` table from
// supabase/migrations/0007_saved_searches_and_matches.sql. See that
// migration's header comment for why keyword matching happens here in the
// app layer (reusing matchesOtherKeyword, the same function Discover's
// "Other" filter uses) rather than as a second, SQL-side implementation of
// the same substring logic — and why radius/date pre-filtering instead goes
// through a security-definer RPC rather than a direct saved_searches query.
//
// This file only handles the write path (called from sale-listings.ts right
// after a listing publishes) — the read path (utils/fetch-matches.ts) lives
// separately since it needs to import from sale-listings.ts, and this file
// is imported BY sale-listings.ts; keeping them apart avoids a circular
// import between the two.

type ListingForMatching = {
  id: string;
  latitude: number;
  longitude: number;
  startDate: string;
  endDate: string;
  description: string;
  otherItems: string[];
  // Already-resolved category ids from the insert/update call site (it just
  // looked these up to link listing_categories) — avoids a redundant
  // name→id round trip here.
  categoryIds: string[];
};

type CandidateSavedSearch = {
  id: string;
  keywords: string[] | null;
  category_ids: string[] | null;
};

// Called once, right after a listing transitions to published. Failing to
// compute matches shouldn't block the publish itself — this is a secondary
// side effect, not core listing data — so callers should catch/log rather
// than let this fail the publish flow.
export async function computeAndInsertMatches(listing: ListingForMatching): Promise<void> {
  const { data, error } = await supabase.rpc('candidate_saved_searches_for_listing', {
    p_latitude: listing.latitude,
    p_longitude: listing.longitude,
    p_start_date: listing.startDate,
    p_end_date: listing.endDate,
  });
  if (error) throw error;

  const candidates = (data ?? []) as CandidateSavedSearch[];
  const matchedSearchIds = candidates
    .filter((search) => {
      const categoryIds = search.category_ids ?? [];
      const keywords = search.keywords ?? [];
      const categoryOverlap = categoryIds.some((id) => listing.categoryIds.includes(id));
      const keywordOverlap = keywords.some((keyword) =>
        matchesOtherKeyword({ description: listing.description, otherItems: listing.otherItems }, keyword)
      );
      return categoryOverlap || keywordOverlap;
    })
    .map((search) => search.id);

  if (matchedSearchIds.length === 0) return;

  // Plain insert, not upsert — Postgres/PostgREST has a real quirk where an
  // INSERT ... ON CONFLICT (what .upsert() compiles to) doesn't correctly
  // evaluate a WITH CHECK policy that references another table via EXISTS
  // (confirmed by direct testing: the identical row insert succeeds via
  // .insert() and fails via .upsert(), regardless of onConflict options).
  // A 23505 (duplicate key) is the ignoreDuplicates equivalent here — this
  // is a brand new listing_id each time, so it should be rare, but treat it
  // as a harmless already-matched case rather than a real failure.
  const { error: insertError } = await supabase.from('matches').insert(
    matchedSearchIds.map((savedSearchId) => ({ saved_search_id: savedSearchId, listing_id: listing.id }))
  );
  const isDuplicate =
    typeof insertError === 'object' && insertError !== null && 'code' in insertError && insertError.code === '23505';
  if (insertError && !isDuplicate) throw insertError;
}
