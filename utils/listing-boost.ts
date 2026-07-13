// Mirrors sale_listings.is_boosted/boost_expires_at from
// supabase/migrations/0022_listing_boost.sql. Feature spec Section 10:
// $2.99, 48 hours, priority placement in Discover's default browse order
// only — never in "I'm Looking For" matching.

export const BOOST_DURATION_HOURS = 48;
export const BOOST_PRICE_LABEL = '$2.99';

// Same "derive at query time" pattern as utils/ad-free.ts's
// deriveIsAdFree — is_boosted can read true past its real expiry if
// nothing ever flips it back (there's no cleanup job, by design), so a
// passed boost_expires_at always wins over a stale flag. Every caller
// (Discover's sort, SaleCard's badge, My Listings' button label) re-derives
// fresh from this on every fetch, so an expired boost stops affecting
// anything automatically, with no cron/cleanup process required.
export function deriveIsBoosted(isBoosted: boolean, boostExpiresAt: string | null): boolean {
  return isBoosted && !!boostExpiresAt && new Date(boostExpiresAt) > new Date();
}
