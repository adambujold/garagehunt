import { MockSale, PaymentMethod } from '@/components/garagehunt/sale-card';
import { PriceTagVariant } from '@/constants/brand';
import { Coordinates } from '@/hooks/use-current-location';
import { detectClusterForListing } from '@/utils/cluster-suggestions';
import { formatSaleSchedule } from '@/utils/format-sale-schedule';
import { BOOST_DURATION_HOURS, deriveIsBoosted } from '@/utils/listing-boost';
import { getListingPhotoUrl } from '@/utils/listing-photos';
import { moderateListingText } from '@/utils/moderation';
import { formatTimeOfDay } from '@/utils/parse-sale-form-input';
import { fetchSellerRatings } from '@/utils/reviews';
import { supabase } from '@/utils/supabase';
import { haversineDistanceKm } from '@/utils/haversine';

// Real sale_listings rows from Supabase, mapped into the same MockSale shape
// the UI already renders (SaleCard, Discover, Sale Detail, Route Planner) so
// none of those components need to know whether a listing is real or mock.
// See supabase/migrations/0001_sale_listings_schema.sql for the schema this
// mirrors, and its header comment for the PostGIS/fuzzing deviations.

// Only 3 values are ever stored — see
// supabase/migrations/0004_listing_status_lifecycle.sql. "Scheduled" /
// "Live" / "Ended" are display-only, derived from start_date/end_date for
// any `published` row (see deriveDisplayStatus below), never written to the
// database.
export type SaleStatus = 'draft' | 'published' | 'cancelled';
export type DisplayStatus = 'draft' | 'scheduled' | 'live' | 'ended' | 'cancelled';

function parseIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function deriveDisplayStatus(
  status: SaleStatus,
  startDate: string,
  endDate: string,
  now: Date = new Date()
): DisplayStatus {
  if (status !== 'published') return status;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);

  if (today < start) return 'scheduled';
  if (today > end) return 'ended';
  return 'live';
}

export type DbSaleListingRow = {
  id: string;
  seller_id: string;
  latitude: number;
  longitude: number;
  address_text: string;
  start_date: string;
  end_date: string;
  daily_start_time: string;
  daily_end_time: string;
  status: SaleStatus;
  title: string | null;
  description: string | null;
  other_items: string[];
  favorite_count: number;
  checkin_count: number;
  event_id: string | null;
  is_boosted: boolean;
  boost_expires_at: string | null;
  payment_method: PaymentMethod;
  listing_categories: { categories: { name: string } | null }[] | null;
  listing_photos: { storage_key: string; sort_order: number }[] | null;
};

export const LISTING_SELECT = `
  id, seller_id, latitude, longitude, address_text, start_date, end_date,
  daily_start_time, daily_end_time, status, title, description, other_items,
  favorite_count, checkin_count, event_id, is_boosted, boost_expires_at,
  payment_method,
  listing_categories(categories(name)), listing_photos(storage_key, sort_order)
`;

function sortedPhotoUrls(photos: { storage_key: string; sort_order: number }[] | null): string[] {
  return [...(photos ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((photo) => getListingPhotoUrl(photo.storage_key));
}

function displayStatusToTag(status: DisplayStatus): { tagLabel: string; tagVariant: PriceTagVariant } {
  switch (status) {
    case 'live':
      return { tagLabel: 'Live now', tagVariant: 'live' };
    case 'ended':
      return { tagLabel: 'Ended', tagVariant: 'ended' };
    case 'cancelled':
      return { tagLabel: 'Cancelled', tagVariant: 'cancelled' };
    case 'draft':
      return { tagLabel: 'Draft', tagVariant: 'draft' };
    case 'scheduled':
    default:
      return { tagLabel: 'Scheduled', tagVariant: 'scheduled' };
  }
}

function statusToTag(
  status: SaleStatus,
  startDate: string,
  endDate: string
): { tagLabel: string; tagVariant: PriceTagVariant } {
  return displayStatusToTag(deriveDisplayStatus(status, startDate, endDate));
}

// Fallback for listings without a seller-chosen or AI-suggested title (the
// nullable sale_listings.title column) — derive a plain, honest display
// title from the address rather than leaving it blank.
export function deriveTitle(addressText: string): string {
  const firstSegment = addressText.split(',')[0]?.trim() || addressText;
  const streetName = firstSegment.replace(/^\d+\s+/, '');
  return `${streetName} garage sale`;
}

export function mapRowToSaleView(row: DbSaleListingRow, origin: Coordinates | null): MockSale {
  const { tagLabel, tagVariant } = statusToTag(row.status, row.start_date, row.end_date);
  const categories = (row.listing_categories ?? [])
    .map((entry) => entry.categories?.name)
    .filter((name): name is string => Boolean(name));
  const distanceKm = origin
    ? Math.round(haversineDistanceKm(origin, { latitude: row.latitude, longitude: row.longitude }) * 10) / 10
    : 0;

  return {
    id: row.id,
    sellerId: row.seller_id,
    title: row.title ?? deriveTitle(row.address_text),
    distanceKm,
    latitude: row.latitude,
    longitude: row.longitude,
    startDate: row.start_date,
    endDate: row.end_date,
    dailyStartTime: formatTimeOfDay(row.daily_start_time),
    dailyEndTime: formatTimeOfDay(row.daily_end_time),
    categories,
    otherItems: row.other_items,
    tagLabel,
    tagVariant,
    icon: 'image-outline',
    addressLabel: row.address_text,
    description: row.description ?? '',
    favoriteCount: row.favorite_count,
    checkinCount: row.checkin_count,
    eventId: row.event_id,
    isBoosted: deriveIsBoosted(row.is_boosted, row.boost_expires_at),
    paymentMethod: row.payment_method,
    photos: sortedPhotoUrls(row.listing_photos),
    // Filled in by attachSellerRatings below — mapRowToSaleView itself has
    // no seller-rating data to work with (that lives in public.users, a
    // separate table, fetched in one batched call rather than embedded here
    // to avoid adding a second FK relationship to sale_listings just for a
    // display-only field). Defaults to "no rating yet" until merged.
    sellerRating: null,
    sellerReviewCount: 0,
  };
}

async function attachSellerRatings(sales: MockSale[]): Promise<MockSale[]> {
  const sellerIds = [...new Set(sales.map((sale) => sale.sellerId))];
  if (sellerIds.length === 0) return sales;

  const ratings = await fetchSellerRatings(sellerIds);
  return sales.map((sale) => {
    const rating = ratings.get(sale.sellerId);
    return {
      ...sale,
      sellerRating: rating?.avgRating ?? null,
      sellerReviewCount: rating?.reviewCount ?? 0,
    };
  });
}

export async function fetchSaleListings(origin: Coordinates | null): Promise<MockSale[]> {
  // Drafts and cancelled listings never appear on Discover — only My
  // Listings shows those, via fetchMyListings below (unfiltered).
  const { data, error } = await supabase
    .from('sale_listings')
    .select(LISTING_SELECT)
    .eq('status', 'published')
    .order('created_at', { ascending: false });

  if (error) throw error;
  const sales = ((data ?? []) as unknown as DbSaleListingRow[]).map((row) => mapRowToSaleView(row, origin));
  const withRatings = await attachSellerRatings(sales);

  // Boosted listings get priority placement in Discover's default browse
  // order only (feature spec Section 10) — a plain stable sort on the
  // already-derived isBoosted flag, so an expired boost naturally stops
  // affecting placement without any cleanup process. Deliberately not
  // applied to fetchListingsForEvent/fetchListingsByIds below, and never
  // touches "I'm Looking For" matching (utils/matches.ts), which has no
  // concept of boost at all.
  return [...withRatings].sort((a, b) => Number(b.isBoosted) - Number(a.isBoosted));
}

// The event page's "approved joined listings" list — sale_listings.event_id
// is only ever set by the event_join_request approval trigger (see
// 0014_town_wide_events.sql), so a plain equality filter here already means
// "approved and joined," no separate status check needed.
export async function fetchListingsForEvent(eventId: string, origin: Coordinates | null): Promise<MockSale[]> {
  const { data, error } = await supabase
    .from('sale_listings')
    .select(LISTING_SELECT)
    .eq('event_id', eventId)
    .eq('status', 'published')
    .order('created_at', { ascending: false });

  if (error) throw error;
  const sales = ((data ?? []) as unknown as DbSaleListingRow[]).map((row) => mapRowToSaleView(row, origin));
  return attachSellerRatings(sales);
}

// The cluster-claim screen's "other listings in this cluster" list — title
// and distance only (no address_text rendered by MockSale's consumers here),
// consistent with the privacy level already used elsewhere for
// not-yet-favorited/unrelated listings.
export async function fetchListingsByIds(ids: string[], origin: Coordinates | null): Promise<MockSale[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('sale_listings').select(LISTING_SELECT).in('id', ids);

  if (error) throw error;
  const sales = ((data ?? []) as unknown as DbSaleListingRow[]).map((row) => mapRowToSaleView(row, origin));
  return attachSellerRatings(sales);
}

export async function fetchSaleListingById(
  id: string,
  origin: Coordinates | null
): Promise<MockSale | null> {
  const { data, error } = await supabase
    .from('sale_listings')
    .select(LISTING_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  const [sale] = await attachSellerRatings([mapRowToSaleView(data as unknown as DbSaleListingRow, origin)]);
  return sale;
}

export type CreateSaleListingInput = {
  sellerId: string;
  latitude: number;
  longitude: number;
  addressText: string;
  immediateRevealOptIn: boolean;
  startDate: string;
  endDate: string;
  dailyStartTime: string;
  dailyEndTime: string;
  title?: string;
  paymentMethod: PaymentMethod;
  description: string;
  otherItems: string[];
  categoryNames: string[];
};

export type CreateSaleListingResult = {
  id: string;
  categoryIds: string[];
};

// Always inserts as 'draft', regardless of whether the seller's ultimate
// intent is "Save as draft" or "Publish" — see publishSaleListing below for
// why a direct create-as-published path no longer exists (feature spec
// Section 9's photo-moderation gate needs photos to already be uploaded and
// classified before a listing can become published, and photos are only
// uploaded after a listing row — with a real id — already exists).
export async function createSaleListing(input: CreateSaleListingInput): Promise<CreateSaleListingResult> {
  const revealAt = input.immediateRevealOptIn
    ? new Date().toISOString()
    : new Date(`${input.startDate}T00:00:00`).toISOString();

  const { data: listing, error: insertError } = await supabase
    .from('sale_listings')
    .insert({
      seller_id: input.sellerId,
      latitude: input.latitude,
      longitude: input.longitude,
      address_text: input.addressText,
      reveal_at: revealAt,
      immediate_reveal_opt_in: input.immediateRevealOptIn,
      start_date: input.startDate,
      end_date: input.endDate,
      daily_start_time: input.dailyStartTime,
      daily_end_time: input.dailyEndTime,
      status: 'draft',
      title: input.title?.trim() ? input.title.trim() : null,
      payment_method: input.paymentMethod,
      description: input.description || null,
      other_items: input.otherItems,
    })
    .select('id')
    .single();

  if (insertError) throw insertError;

  let categoryIds: string[] = [];
  if (input.categoryNames.length > 0) {
    const { data: categoryRows, error: categoryError } = await supabase
      .from('categories')
      .select('id, name')
      .in('name', input.categoryNames);

    if (categoryError) throw categoryError;

    if (categoryRows && categoryRows.length > 0) {
      categoryIds = categoryRows.map((category) => category.id);
      const { error: linkError } = await supabase.from('listing_categories').insert(
        categoryRows.map((category) => ({
          listing_id: listing.id,
          category_id: category.id,
        }))
      );
      if (linkError) throw linkError;
    }
  }

  return { id: listing.id, categoryIds };
}

export type PublishSaleListingInput = {
  id: string;
  description: string;
};

// The gate a draft listing must pass to become published (feature spec
// Section 9, items 1/2/6) — shared by both List a Sale's initial publish
// (after createSaleListing + photo upload) and Edit Listing's "Publish
// sale" from an existing draft (after updateSaleListing's field save).
// Throwing here leaves the listing as-is (still draft, any field edits
// already saved by the caller) — only the status transition itself is
// blocked, not the seller's other changes.
export async function publishSaleListing(input: PublishSaleListingInput): Promise<void> {
  const { data: listingRow, error: fetchError } = await supabase
    .from('sale_listings')
    .select('seller_id')
    .eq('id', input.id)
    .single();
  if (fetchError) throw fetchError;

  // Photo approval gate — a listing can't publish until every photo is
  // approved, or there are zero photos. Photos land as 'approved' or
  // 'pending' at upload time (see uploadListingPhoto) — 'rejected' is only
  // ever set by a human via Table Editor, but is included here too in case
  // a reviewer rejects a photo on an already-published listing's later
  // resubmission.
  const { data: photos, error: photosError } = await supabase
    .from('listing_photos')
    .select('moderation_status')
    .eq('listing_id', input.id);
  if (photosError) throw photosError;
  if ((photos ?? []).some((photo) => photo.moderation_status !== 'approved')) {
    throw new Error(
      "One or more of your photos was flagged for manual review and can't be auto-approved — publishing again won't change that. Your listing has been saved as a draft; remove/replace the flagged photo, or wait for it to be manually approved."
    );
  }

  // Text moderation — clearly bad content blocks publishing synchronously;
  // borderline content publishes but gets flagged.
  const textResult = await moderateListingText(input.description);
  if (textResult.decision === 'reject') {
    throw new Error(textResult.reason || 'Your listing description needs to be revised before publishing.');
  }

  // New-account trust signal — a seller's first-ever published listing is
  // always flagged for manual review regardless of what screening found,
  // an extra caution layer for unproven accounts. Counts PUBLISHED listings
  // only (not drafts) — an account with several abandoned drafts but zero
  // real listings still counts as unproven.
  const { count: publishedCount, error: countError } = await supabase
    .from('sale_listings')
    .select('id', { count: 'exact', head: true })
    .eq('seller_id', listingRow.seller_id)
    .eq('status', 'published');
  if (countError) throw countError;
  const isFirstListing = (publishedCount ?? 0) === 0;

  const moderationStatus: 'clean' | 'pending_review' =
    isFirstListing || textResult.decision === 'flag' ? 'pending_review' : 'clean';

  // Match computation used to happen here client-side (computeAndInsertMatches)
  // — moved server-side as of supabase/migrations/0035_server_side_match_computation.sql,
  // a trigger on sale_listings_raw that fires on this exact status update
  // regardless of which client performed it, so it no longer needs to be
  // called from here (or from the website's equivalent publish flow).
  const { error: publishError } = await supabase
    .from('sale_listings')
    .update({ status: 'published', moderation_status: moderationStatus })
    .eq('id', input.id);
  if (publishError) throw publishError;

  try {
    await detectClusterForListing(input.id);
  } catch (err) {
    console.error('Failed to check for a nearby cluster', err);
  }
}

// My Listings (seller dashboard) — a leaner shape than MockSale since that
// screen doesn't need distance/coordinates/categories, just status + stats.
export type MyListingSummary = {
  id: string;
  title: string;
  tagLabel: string;
  tagVariant: PriceTagVariant;
  isDraft: boolean;
  isCancelled: boolean;
  scheduleLabel: string;
  viewCount: number;
  favoriteCount: number;
  // Denormalized from sale_listings.checkin_count — this listing's own
  // foot-traffic tally, distinct from a buyer's cumulative
  // users.buyer_checkin_count across all sales.
  checkinCount: number;
  photoUrl: string | null;
  // Already accounts for expiry (see utils/listing-boost.ts) — safe to use
  // directly for the "⭐ Featured" badge/button label. boostExpiresAt is
  // carried separately (unlike MockSale) so the Boost button can show
  // when the current boost runs out.
  isBoosted: boolean;
  boostExpiresAt: string | null;
};

type DbMyListingRow = {
  id: string;
  address_text: string;
  start_date: string;
  end_date: string;
  daily_start_time: string;
  daily_end_time: string;
  status: SaleStatus;
  title: string | null;
  view_count: number;
  favorite_count: number;
  checkin_count: number;
  is_boosted: boolean;
  boost_expires_at: string | null;
  listing_photos: { storage_key: string; sort_order: number }[] | null;
};

export async function fetchMyListings(sellerId: string): Promise<MyListingSummary[]> {
  const { data, error } = await supabase
    .from('sale_listings')
    .select(
      'id, address_text, start_date, end_date, daily_start_time, daily_end_time, status, title, view_count, favorite_count, checkin_count, is_boosted, boost_expires_at, listing_photos(storage_key, sort_order)'
    )
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return ((data ?? []) as DbMyListingRow[]).map((row) => {
    const { tagLabel, tagVariant } = statusToTag(row.status, row.start_date, row.end_date);
    const photoUrls = sortedPhotoUrls(row.listing_photos);
    return {
      id: row.id,
      title: row.title ?? deriveTitle(row.address_text),
      tagLabel,
      tagVariant,
      isDraft: row.status === 'draft',
      isCancelled: row.status === 'cancelled',
      scheduleLabel: formatSaleSchedule({
        startDate: row.start_date,
        endDate: row.end_date,
        dailyStartTime: formatTimeOfDay(row.daily_start_time),
        dailyEndTime: formatTimeOfDay(row.daily_end_time),
      }),
      viewCount: row.view_count,
      favoriteCount: row.favorite_count,
      isBoosted: deriveIsBoosted(row.is_boosted, row.boost_expires_at),
      boostExpiresAt: row.boost_expires_at,
      checkinCount: row.checkin_count,
      photoUrl: photoUrls[0] ?? null,
    };
  });
}

// Edit Listing screen — a lean, editable-fields-only shape. Address/coords
// are deliberately excluded from what's fetched for editing (beyond display)
// since they're locked from editing once published (architecture doc).
export type EditableListing = {
  id: string;
  addressText: string;
  startDate: string;
  endDate: string;
  title: string | null;
  paymentMethod: PaymentMethod;
  description: string;
  otherItems: string[];
  categoryNames: string[];
  status: SaleStatus;
};

type DbEditableListingRow = {
  id: string;
  address_text: string;
  start_date: string;
  end_date: string;
  title: string | null;
  payment_method: PaymentMethod;
  description: string | null;
  other_items: string[];
  status: SaleStatus;
  listing_categories: { categories: { name: string } | null }[] | null;
};

// Scoped to sellerId (not just id) so a seller can't be handed another
// seller's listing to edit just by guessing/visiting a URL — sale_listings'
// SELECT policy is "viewable by everyone", so this filter is the only thing
// standing between "fetch for display" and "fetch for editing".
export async function fetchEditableListing(id: string, sellerId: string): Promise<EditableListing | null> {
  const { data, error } = await supabase
    .from('sale_listings')
    .select(
      'id, address_text, start_date, end_date, title, payment_method, description, other_items, status, listing_categories(categories(name))'
    )
    .eq('id', id)
    .eq('seller_id', sellerId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as DbEditableListingRow;
  const categoryNames = (row.listing_categories ?? [])
    .map((entry) => entry.categories?.name)
    .filter((name): name is string => Boolean(name));

  return {
    id: row.id,
    addressText: row.address_text,
    startDate: row.start_date,
    endDate: row.end_date,
    title: row.title,
    paymentMethod: row.payment_method,
    description: row.description ?? '',
    otherItems: row.other_items,
    categoryNames,
    status: row.status,
  };
}

export type UpdateSaleListingInput = {
  id: string;
  startDate: string;
  endDate: string;
  title?: string;
  paymentMethod: PaymentMethod;
  description: string;
  otherItems: string[];
  categoryNames: string[];
  // true when this save should also transition a draft to published
  // ("Publish sale" instead of "Save changes").
  publish?: boolean;
};

export async function updateSaleListing(input: UpdateSaleListingInput): Promise<void> {
  // status is deliberately never set here, even when input.publish is true
  // — publishSaleListing below is the only path allowed to flip a listing
  // to 'published', since it's also the moderation gate (feature spec
  // Section 9). Field edits still save regardless of whether the gate
  // ultimately blocks the publish.
  const updatePayload: Record<string, unknown> = {
    start_date: input.startDate,
    end_date: input.endDate,
    title: input.title?.trim() ? input.title.trim() : null,
    payment_method: input.paymentMethod,
    description: input.description || null,
    other_items: input.otherItems,
  };

  const { error: updateError } = await supabase
    .from('sale_listings')
    .update(updatePayload)
    .eq('id', input.id);
  if (updateError) throw updateError;

  // Replace the category set wholesale — simpler and just as correct as
  // diffing add/remove given there are only 11 possible categories.
  const { error: deleteError } = await supabase
    .from('listing_categories')
    .delete()
    .eq('listing_id', input.id);
  if (deleteError) throw deleteError;

  let categoryIds: string[] = [];
  if (input.categoryNames.length > 0) {
    const { data: categoryRows, error: categoryError } = await supabase
      .from('categories')
      .select('id, name')
      .in('name', input.categoryNames);
    if (categoryError) throw categoryError;

    if (categoryRows && categoryRows.length > 0) {
      categoryIds = categoryRows.map((category) => category.id);
      const { error: linkError } = await supabase.from('listing_categories').insert(
        categoryRows.map((category) => ({
          listing_id: input.id,
          category_id: category.id,
        }))
      );
      if (linkError) throw linkError;
    }
  }

  if (input.publish) {
    await publishSaleListing({ id: input.id, description: input.description });
  }
}

export async function cancelSaleListing(id: string): Promise<void> {
  const { error } = await supabase.from('sale_listings').update({ status: 'cancelled' }).eq('id', id);
  if (error) throw error;
}

// Applies a boost purchase to a specific listing — called immediately
// after utils/purchases.ts's purchaseBoost() resolves successfully. See
// supabase/migrations/0022_listing_boost.sql's header comment for why this
// is a direct client-side write rather than something the RevenueCat
// webhook triggers: the existing "Sellers can update their own listings"
// RLS policy is what makes this safe (a client-only) approach — the update
// simply fails to match any row if the caller isn't that listing's seller.
// Always sets a fresh now()+48h expiry regardless of any existing boost —
// per feature spec Section 10, re-boosting an already-boosted listing
// extends/restarts the window rather than stacking or erroring.
export async function applyListingBoost(listingId: string): Promise<string> {
  const expiresAt = new Date(Date.now() + BOOST_DURATION_HOURS * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('sale_listings')
    .update({ is_boosted: true, boost_expires_at: expiresAt })
    .eq('id', listingId)
    .select('boost_expires_at')
    .single();
  // .single() throws its own PostgrestError if zero rows matched (e.g. the
  // RLS check failed because this isn't actually the caller's listing) —
  // surfacing that as a real error here matters more than for a typical
  // update, since the user already paid for this to take effect.
  if (error) throw error;
  return data.boost_expires_at;
}
