import { matchesOtherKeyword } from '@/utils/discover-filters';
import { supabase } from '@/utils/supabase';

// Mirrors the `matches` table from
// supabase/migrations/0007_saved_searches_and_matches.sql.
//
// The live-publish write path (a brand new listing matching existing saved
// searches) used to be computed here client-side (computeAndInsertMatches)
// — moved server-side as of
// supabase/migrations/0035_server_side_match_computation.sql, a trigger on
// sale_listings_raw that fires on the publish transition regardless of
// which client (mobile or web) performed it. That trigger reuses this
// file's same category-overlap/keyword-substring semantics, just
// reimplemented in plpgsql — see that migration for the SQL version.
//
// This file now only handles the OTHER direction: backfilling matches for
// listings that were already published before a saved search existed (see
// backfillMatchesForSavedSearch below) — still very much a live client-side
// call, made right after a search is saved.

type CandidateListing = {
  id: string;
  description: string | null;
  other_items: string[] | null;
  category_ids: string[] | null;
};

// The other direction of computeAndInsertMatches above — called right after
// a search is saved (create or edit), so it also picks up listings that were
// already published before the search existed. Without this, a saved search
// only ever matched listings published after it (see
// supabase/migrations/0017_backfill_matches_for_saved_search.sql for the
// root-cause note), which silently looked "broken" any time a search was
// saved second. Safe to call on every save, not just the first — it only
// inserts matches that aren't already recorded (see below).
export async function backfillMatchesForSavedSearch(input: {
  searchId: string;
  keywords: string[];
  categoryIds: string[];
}): Promise<void> {
  const { data, error } = await supabase.rpc('candidate_listings_for_saved_search', {
    p_search_id: input.searchId,
  });
  if (error) throw error;

  const candidates = (data ?? []) as CandidateListing[];
  const matchedListingIds = candidates
    .filter((listing) => {
      const categoryIds = listing.category_ids ?? [];
      const categoryOverlap = categoryIds.some((id) => input.categoryIds.includes(id));
      const keywordOverlap = input.keywords.some((keyword) =>
        matchesOtherKeyword(
          { description: listing.description ?? '', otherItems: listing.other_items ?? [] },
          keyword
        )
      );
      return categoryOverlap || keywordOverlap;
    })
    .map((listing) => listing.id);

  if (matchedListingIds.length === 0) return;

  // Unlike computeAndInsertMatches (always a brand-new listing_id, so a
  // duplicate-key conflict is a rare edge case worth just swallowing), this
  // runs on every save of the same search — a second save routinely
  // re-matches listings already recorded from the first. A single bulk
  // .insert() is all-or-nothing, so one already-matched row in the batch
  // would reject the whole statement, including the genuinely new rows.
  // Filtering to only the not-yet-recorded listing ids first avoids that.
  const { data: existing, error: existingError } = await supabase
    .from('matches')
    .select('listing_id')
    .eq('saved_search_id', input.searchId)
    .in('listing_id', matchedListingIds);
  if (existingError) throw existingError;

  const alreadyMatchedIds = new Set((existing ?? []).map((row) => row.listing_id));
  const newListingIds = matchedListingIds.filter((id) => !alreadyMatchedIds.has(id));
  if (newListingIds.length === 0) return;

  // is_backfill: true — these are pre-existing listings the user is only
  // now matching because they just saved/edited this search, not a live
  // "new listing just appeared" event. See migration 0029: a bulk insert
  // here can be many rows at once (e.g. a broad search matching most
  // categories), and the per-row notification trigger sending that many
  // pushes in a burst is a confirmed real-device crash — backfilled matches
  // skip the push entirely since the save flow already navigates the user
  // straight to Matches for You right after this resolves.
  const { error: insertError } = await supabase.from('matches').insert(
    newListingIds.map((listingId) => ({ saved_search_id: input.searchId, listing_id: listingId, is_backfill: true }))
  );
  if (insertError) throw insertError;
}
