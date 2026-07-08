import { Coordinates } from '@/hooks/use-current-location';
import { haversineDistanceKm } from '@/utils/haversine';
import { supabase } from '@/utils/supabase';

// Mirrors public.check_ins / public.buyer_ratings from
// supabase/migrations/0009_check_ins_and_buyer_ratings.sql.

export const CHECK_IN_PROXIMITY_METERS = 150;

export function isWithinCheckInRange(deviceCoords: Coordinates, listingCoords: Coordinates): boolean {
  return haversineDistanceKm(deviceCoords, listingCoords) * 1000 <= CHECK_IN_PROXIMITY_METERS;
}

export async function isCheckedIn(listingId: string, buyerId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('check_ins')
    .select('id')
    .eq('listing_id', listingId)
    .eq('buyer_id', buyerId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

export async function checkIn(listingId: string, buyerId: string): Promise<void> {
  const { error } = await supabase.from('check_ins').insert({ listing_id: listingId, buyer_id: buyerId });
  if (error) throw error;
}

// Powers Profile's shopper tier badge/progress note.
export async function fetchBuyerCheckinCount(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('users')
    .select('buyer_checkin_count')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.buyer_checkin_count ?? 0;
}

export type CheckedInBuyer = {
  checkInId: string;
  buyerId: string;
  checkedInAt: string;
  thumbsUpGiven: boolean;
};

type CheckInRow = {
  id: string;
  buyer_id: string;
  created_at: string;
  // check_in_id is unique on buyer_ratings, so PostgREST treats this as a
  // to-one embed (a single object, or null) rather than a to-many array —
  // unlike every other embed in this codebase (categories, photos), which
  // are genuine one-to-many and come back as arrays.
  buyer_ratings: { id: string } | null;
};

// Seller-facing: who checked in to this listing, and has each already been
// thumbs-upped. RLS (check_ins' "seller can view check-ins on their
// listings" policy) is what actually restricts this to the listing's real
// seller — no sellerId param needed here since a mismatched caller would
// just get an empty result, not an error.
export async function fetchCheckedInBuyers(listingId: string): Promise<CheckedInBuyer[]> {
  const { data, error } = await supabase
    .from('check_ins')
    .select('id, buyer_id, created_at, buyer_ratings(id)')
    .eq('listing_id', listingId)
    .order('created_at', { ascending: true });
  if (error) throw error;

  return ((data ?? []) as unknown as CheckInRow[]).map((row) => ({
    checkInId: row.id,
    buyerId: row.buyer_id,
    checkedInAt: row.created_at,
    thumbsUpGiven: row.buyer_ratings !== null,
  }));
}

export async function giveBuyerThumbsUp(input: {
  checkInId: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
}): Promise<void> {
  const { error } = await supabase.from('buyer_ratings').insert({
    check_in_id: input.checkInId,
    listing_id: input.listingId,
    buyer_id: input.buyerId,
    seller_id: input.sellerId,
  });
  if (error) throw error;
}

export type ListingReview = {
  reviewerId: string;
  rating: number;
  comment: string | null;
};

// Seller-facing: every rated review left on this listing. RLS (reviews'
// "reviewer and seller can view" policy) restricts this to the listing's
// real seller in the same way fetchCheckedInBuyers is restricted above.
// Cross-referencing reviewerId against fetchCheckedInBuyers' buyerId set is
// what drives the "Verified visit" tag — a review from someone who never
// checked in still displays, just without that tag.
export async function fetchListingReviewsForSeller(listingId: string): Promise<ListingReview[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select('reviewer_id, rating, comment')
    .eq('listing_id', listingId)
    .eq('visited', true)
    .not('rating', 'is', null);
  if (error) throw error;

  return (data ?? []).map((row) => ({
    reviewerId: row.reviewer_id,
    rating: row.rating as number,
    comment: row.comment,
  }));
}
