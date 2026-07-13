import { MockSale } from '@/components/garagehunt/sale-card';
import { Coordinates } from '@/hooks/use-current-location';
import { matchesNext7Days, matchesThisWeekend, matchesToday } from '@/utils/discover-filters';
import { fetchMySavedSearch } from '@/utils/saved-searches';
import { fetchSaleListings } from '@/utils/sale-listings';

// Route Planner's Auto-Suggest mode (feature spec Section 4b, Mode 2 +
// technical architecture doc's "distance_weight + category_match_weight"
// scoring note). Reuses fetchSaleListings (already published-only,
// distance-from-origin, boosted-first) rather than a separate query — this
// just re-scores and re-sorts that same candidate pool.

export type AutoSuggestWindow = 'today' | 'weekend' | 'next7days';

export const RADIUS_OPTIONS_KM = [5, 10, 20, 50] as const;

export const AUTO_SUGGEST_STOP_COUNT = 5;

// Tunable, named the same way HOT_TIER_THRESHOLDS/SHOPPER_TIER_THRESHOLDS
// are in constants/brand.ts — easy to retune post-launch once there's real
// usage data, same philosophy as those.
const SCORE_WEIGHTS = {
  // Closer listings score higher; capped at the search radius so nothing
  // outside the area contributes (candidates are already radius-filtered
  // before scoring, so this never goes negative in practice).
  proximityPerKm: 1,
  // Per matching category between the listing and the buyer's saved-search
  // interests. Weighted well above a single proximity km so a genuine
  // interest match can meaningfully outrank a slightly-closer mismatch.
  categoryMatch: 8,
  // Small per-favorite nudge — lets an already-loved listing edge out an
  // otherwise-identical unloved one without dominating the score.
  favoritePerCount: 0.15,
  // seller_avg_rating is 0-5; scaled up so a strong rating meaningfully
  // competes with proximity/category rather than rounding to noise.
  ratingPerStar: 2,
} as const;

export type ScoredSale = MockSale & {
  score: number;
  // True when at least one of the listing's categories overlaps the
  // buyer's saved-search interests — drives the "Matched" tag on stops.
  isMatched: boolean;
};

function windowPredicate(window: AutoSuggestWindow) {
  if (window === 'today') return matchesToday;
  if (window === 'weekend') return matchesThisWeekend;
  return matchesNext7Days;
}

function scoreSale(sale: MockSale, radiusKm: number, interestCategories: string[]): ScoredSale {
  const proximityScore = Math.max(0, radiusKm - sale.distanceKm) * SCORE_WEIGHTS.proximityPerKm;
  const matchCount =
    interestCategories.length > 0 ? sale.categories.filter((category) => interestCategories.includes(category)).length : 0;
  const qualityScore = sale.favoriteCount * SCORE_WEIGHTS.favoritePerCount + (sale.sellerRating ?? 0) * SCORE_WEIGHTS.ratingPerStar;

  return {
    ...sale,
    score: proximityScore + matchCount * SCORE_WEIGHTS.categoryMatch + qualityScore,
    isMatched: matchCount > 0,
  };
}

// Returns every in-radius, in-window candidate, scored and sorted highest
// first — the FULL list, not just the top N. Route Planner keeps this
// around so swapping a stop can pull the next-best alternative straight out
// of it (see nextBestAlternative below) instead of re-querying, per the
// spec's "not a full re-run" swap behavior.
//
// No saved search (or fetching one fails) falls back to zero category
// weighting rather than erroring — proximity/quality alone still produce a
// perfectly usable suggestion.
export async function fetchScoredCandidates(
  origin: Coordinates,
  radiusKm: number,
  window: AutoSuggestWindow,
  userId: string
): Promise<ScoredSale[]> {
  const [allListings, savedSearch] = await Promise.all([
    fetchSaleListings(origin),
    fetchMySavedSearch(userId).catch(() => null),
  ]);

  const interestCategories = savedSearch?.categoryNames ?? [];
  const predicate = windowPredicate(window);

  return allListings
    .filter((sale) => sale.distanceKm <= radiusKm && predicate(sale))
    .map((sale) => scoreSale(sale, radiusKm, interestCategories))
    .sort((a, b) => b.score - a.score);
}

// The concrete "next-best-scoring alternative from the same query" swap
// action — highest-scored candidate not already used as a stop.
export function nextBestAlternative(candidates: ScoredSale[], currentStopIds: string[]): ScoredSale | null {
  return candidates.find((candidate) => !currentStopIds.includes(candidate.id)) ?? null;
}
