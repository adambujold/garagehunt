import { SHOPPER_TIER_THRESHOLDS } from '@/constants/brand';

// Derived from users.buyer_checkin_count — see
// supabase/migrations/0009_check_ins_and_buyer_ratings.sql. null below the
// Regular threshold; Profile shows a progress note instead of a badge in
// that case (same pattern as My Listings' Hot Listing progress note).
export type ShopperTier = 'regular' | 'trustedShopper' | 'superShopper' | null;

export const SHOPPER_TIER_LABELS: Record<Exclude<ShopperTier, null>, string> = {
  regular: 'Regular',
  trustedShopper: 'Trusted Shopper',
  superShopper: 'Super Shopper',
};

export function deriveShopperTier(checkinCount: number): ShopperTier {
  if (checkinCount >= SHOPPER_TIER_THRESHOLDS.superShopper) return 'superShopper';
  if (checkinCount >= SHOPPER_TIER_THRESHOLDS.trustedShopper) return 'trustedShopper';
  if (checkinCount >= SHOPPER_TIER_THRESHOLDS.regular) return 'regular';
  return null;
}
