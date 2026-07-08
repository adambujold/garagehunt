import { SaleStatus, deriveDisplayStatus, deriveTitle } from '@/utils/sale-listings';
import { supabase } from '@/utils/supabase';

// The "is a review prompt due" eligibility check described in feature spec
// Section 4d — normally triggered by a scheduled push notification job,
// which doesn't exist yet, so this runs client-side instead: on Discover or
// Profile focus, check for a favorited listing that has ended and doesn't
// have a reviews row for this user yet. See utils/reviews.ts's header
// comment for why this lives in its own file rather than alongside it.

export type PendingReview = {
  listingId: string;
  sellerId: string;
  title: string;
};

type FavoriteRow = {
  sale_listings: {
    id: string;
    seller_id: string;
    address_text: string;
    start_date: string;
    end_date: string;
    status: SaleStatus;
  } | null;
};

export async function fetchPendingReviewPrompt(userId: string): Promise<PendingReview | null> {
  const { data, error } = await supabase
    .from('favorites')
    .select('sale_listings(id, seller_id, address_text, start_date, end_date, status)')
    .eq('user_id', userId);
  if (error) throw error;

  const ended = ((data ?? []) as unknown as FavoriteRow[])
    .map((row) => row.sale_listings)
    .filter((listing): listing is NonNullable<FavoriteRow['sale_listings']> => listing !== null)
    .filter((listing) => deriveDisplayStatus(listing.status, listing.start_date, listing.end_date) === 'ended')
    .sort((a, b) => b.end_date.localeCompare(a.end_date));

  if (ended.length === 0) return null;

  const candidateIds = ended.map((listing) => listing.id);
  const { data: existingReviews, error: reviewsError } = await supabase
    .from('reviews')
    .select('listing_id')
    .eq('reviewer_id', userId)
    .in('listing_id', candidateIds);
  if (reviewsError) throw reviewsError;

  const reviewedIds = new Set((existingReviews ?? []).map((row) => row.listing_id));
  const next = ended.find((listing) => !reviewedIds.has(listing.id));
  if (!next) return null;

  return {
    listingId: next.id,
    sellerId: next.seller_id,
    title: deriveTitle(next.address_text),
  };
}
