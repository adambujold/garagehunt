import { MockSale } from '@/components/garagehunt/sale-card';
import { PriceTagVariant } from '@/constants/brand';
import { Coordinates } from '@/hooks/use-current-location';
import { formatSaleSchedule } from '@/utils/format-sale-schedule';
import { getListingPhotoUrl } from '@/utils/listing-photos';
import { computeAndInsertMatches } from '@/utils/matches';
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
  description: string | null;
  other_items: string[];
  favorite_count: number;
  checkin_count: number;
  event_id: string | null;
  listing_categories: { categories: { name: string } | null }[] | null;
  listing_photos: { storage_key: string; sort_order: number }[] | null;
};

export const LISTING_SELECT = `
  id, seller_id, latitude, longitude, address_text, start_date, end_date,
  daily_start_time, daily_end_time, status, description, other_items,
  favorite_count, checkin_count, event_id, listing_categories(categories(name)),
  listing_photos(storage_key, sort_order)
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

// No title field exists on sale_listings (per the architecture doc) and the
// form doesn't collect one — derive a plain, honest display title from the
// address rather than fabricating detail that isn't there.
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
    title: deriveTitle(row.address_text),
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
  description: string;
  otherItems: string[];
  categoryNames: string[];
  // 'draft' for "Save as draft" (hidden from Discover, only in My Listings)
  // vs. 'published' for "Publish sale".
  status: 'draft' | 'published';
};

export async function createSaleListing(input: CreateSaleListingInput): Promise<string> {
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
      status: input.status,
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

  if (input.status === 'published') {
    try {
      await computeAndInsertMatches({
        id: listing.id,
        latitude: input.latitude,
        longitude: input.longitude,
        startDate: input.startDate,
        endDate: input.endDate,
        description: input.description,
        otherItems: input.otherItems,
        categoryIds,
      });
    } catch (err) {
      // Matching is a side effect of publishing, not core listing data —
      // don't fail the whole publish over it, but don't swallow it silently
      // either.
      console.error('Failed to compute matches for new listing', err);
    }
  }

  return listing.id;
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
};

type DbMyListingRow = {
  id: string;
  address_text: string;
  start_date: string;
  end_date: string;
  daily_start_time: string;
  daily_end_time: string;
  status: SaleStatus;
  view_count: number;
  favorite_count: number;
  checkin_count: number;
  listing_photos: { storage_key: string; sort_order: number }[] | null;
};

export async function fetchMyListings(sellerId: string): Promise<MyListingSummary[]> {
  const { data, error } = await supabase
    .from('sale_listings')
    .select(
      'id, address_text, start_date, end_date, daily_start_time, daily_end_time, status, view_count, favorite_count, checkin_count, listing_photos(storage_key, sort_order)'
    )
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return ((data ?? []) as DbMyListingRow[]).map((row) => {
    const { tagLabel, tagVariant } = statusToTag(row.status, row.start_date, row.end_date);
    const photoUrls = sortedPhotoUrls(row.listing_photos);
    return {
      id: row.id,
      title: deriveTitle(row.address_text),
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
    .select('id, address_text, start_date, end_date, description, other_items, status, listing_categories(categories(name))')
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
  description: string;
  otherItems: string[];
  categoryNames: string[];
  // true when this save should also transition a draft to published
  // ("Publish sale" instead of "Save changes").
  publish?: boolean;
};

export async function updateSaleListing(input: UpdateSaleListingInput): Promise<void> {
  const updatePayload: Record<string, unknown> = {
    start_date: input.startDate,
    end_date: input.endDate,
    description: input.description || null,
    other_items: input.otherItems,
  };
  if (input.publish) updatePayload.status = 'published';

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
    try {
      const { data: listingRow, error: fetchError } = await supabase
        .from('sale_listings')
        .select('latitude, longitude')
        .eq('id', input.id)
        .single();
      if (fetchError) throw fetchError;

      await computeAndInsertMatches({
        id: input.id,
        latitude: listingRow.latitude,
        longitude: listingRow.longitude,
        startDate: input.startDate,
        endDate: input.endDate,
        description: input.description,
        otherItems: input.otherItems,
        categoryIds,
      });
    } catch (err) {
      console.error('Failed to compute matches for published listing', err);
    }
  }
}

export async function cancelSaleListing(id: string): Promise<void> {
  const { error } = await supabase.from('sale_listings').update({ status: 'cancelled' }).eq('id', id);
  if (error) throw error;
}
