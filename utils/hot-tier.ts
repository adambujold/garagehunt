import { HOT_TIER_THRESHOLDS } from '@/constants/brand';

// Derived from sale_listings.favorite_count. null below the first tier —
// SaleCard/Sale Detail show no badge in that case, same as before this was
// a three-tier progression.
export type HotTier = 'hot' | 'blazingHot' | 'infernoHot' | null;

export const HOT_TIER_LABELS: Record<Exclude<HotTier, null>, string> = {
  hot: '🔥 Hot Listing',
  blazingHot: '🔥🔥 Blazing Hot',
  infernoHot: '🔥🔥🔥 Inferno Hot',
};

export function deriveHotTier(favoriteCount: number): HotTier {
  if (favoriteCount >= HOT_TIER_THRESHOLDS.infernoHot) return 'infernoHot';
  if (favoriteCount >= HOT_TIER_THRESHOLDS.blazingHot) return 'blazingHot';
  if (favoriteCount >= HOT_TIER_THRESHOLDS.hot) return 'hot';
  return null;
}

export type HotTierProgress = {
  remaining: number;
  nextLabel: string;
};

// Powers My Listings' progress note at every tier, not just before the
// first one — null once Inferno Hot (the top tier) is reached, since
// there's nothing further to progress toward.
export function nextHotTierProgress(favoriteCount: number): HotTierProgress | null {
  if (favoriteCount < HOT_TIER_THRESHOLDS.hot) {
    return { remaining: HOT_TIER_THRESHOLDS.hot - favoriteCount, nextLabel: HOT_TIER_LABELS.hot };
  }
  if (favoriteCount < HOT_TIER_THRESHOLDS.blazingHot) {
    return { remaining: HOT_TIER_THRESHOLDS.blazingHot - favoriteCount, nextLabel: HOT_TIER_LABELS.blazingHot };
  }
  if (favoriteCount < HOT_TIER_THRESHOLDS.infernoHot) {
    return { remaining: HOT_TIER_THRESHOLDS.infernoHot - favoriteCount, nextLabel: HOT_TIER_LABELS.infernoHot };
  }
  return null;
}
