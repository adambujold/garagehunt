import { supabase } from '@/utils/supabase';

// Mirrors public.users (seller_avg_rating, seller_review_count) and
// public.reviews from supabase/migrations/0008_reviews.sql. This file holds
// the rating-read and review-write paths; the "is a review prompt due"
// eligibility check lives separately in utils/pending-review.ts since that
// needs deriveDisplayStatus/deriveTitle from sale-listings.ts, and
// sale-listings.ts imports fetchSellerRatings from here — keeping them
// apart avoids a circular import between the two (same reasoning as the
// matches.ts / fetch-matches.ts split).

export type SellerRating = {
  avgRating: number | null;
  reviewCount: number;
};

export async function fetchSellerRatings(sellerIds: string[]): Promise<Map<string, SellerRating>> {
  const ratings = new Map<string, SellerRating>();
  if (sellerIds.length === 0) return ratings;

  const { data, error } = await supabase
    .from('users')
    .select('id, seller_avg_rating, seller_review_count')
    .in('id', sellerIds);

  if (error) throw error;

  for (const row of data ?? []) {
    ratings.set(row.id, { avgRating: row.seller_avg_rating, reviewCount: row.seller_review_count });
  }
  return ratings;
}

export async function fetchSellerRating(sellerId: string): Promise<SellerRating> {
  const ratings = await fetchSellerRatings([sellerId]);
  return ratings.get(sellerId) ?? { avgRating: null, reviewCount: 0 };
}

export type SubmitReviewInput = {
  listingId: string;
  reviewerId: string;
  sellerId: string;
  visited: boolean;
  // null when visited is false — the DB's reviews_rating_requires_visited
  // check constraint enforces this pairing too, this just mirrors it.
  rating: number | null;
  comment: string | null;
};

export async function submitReview(input: SubmitReviewInput): Promise<void> {
  const { error } = await supabase.from('reviews').insert({
    listing_id: input.listingId,
    reviewer_id: input.reviewerId,
    seller_id: input.sellerId,
    visited: input.visited,
    rating: input.rating,
    comment: input.comment,
  });
  if (error) throw error;
}
