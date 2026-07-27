import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

// moderateListingPhoto is no longer called from here — the Edge Function now
// classifies, stores, and records the photo in one operation, so there is no
// verdict for this layer to receive (0042). utils/moderation.ts keeps the
// wrapper only for its timeout/fail-safe helpers used elsewhere.
import { supabase } from '@/utils/supabase';

// Mirrors listing_photos from supabase/migrations/0001_sale_listings_schema.sql
// (storage_key, sort_order, moderation_status) plus the Storage bucket and
// RLS policies added in 0005_listing_photos_storage.sql. Image content
// screening (feature spec Section 9, item 1) runs on every upload, below.

const PHOTO_BUCKET = 'listing-photos';
export const MAX_LISTING_PHOTOS = 10;

// listing_photos.photo_type (0036_day_of_photos.sql). 'planning' is the
// default for every normal List a Sale / Edit Listing upload; 'day_of' is
// tagged only by the day-of add-photos flow (app/day-of-photos/[id].tsx).
export type PhotoType = 'planning' | 'day_of';

export type ListingPhoto = {
  id: string;
  storageKey: string;
  url: string;
  sortOrder: number;
};

function inferExtension(uri: string): string {
  const match = uri.match(/\.(\w+)(?:\?.*)?$/);
  return match?.[1]?.toLowerCase() ?? 'jpg';
}

function inferContentType(extension: string): string {
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return 'image/jpeg';
}

const HEIC_EXTENSIONS = new Set(['heic', 'heif']);

// iPhones capture photos as HEIC by default. It's not a web-standard
// format — no mainstream browser (or Next.js's server-side image
// optimizer, which the companion website relies on) can decode it — so a
// HEIC upload renders fine in this app but as a broken image everywhere
// else. Converting to JPEG once here, at upload time, is simpler than
// making every future consumer of these photos handle HEIC.
async function normalizeToJpegIfHeic(
  localUri: string,
  extension: string
): Promise<{ uri: string; extension: string }> {
  if (!HEIC_EXTENSIONS.has(extension)) return { uri: localUri, extension };

  const rendered = await ImageManipulator.manipulate(localUri).renderAsync();
  const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
  return { uri: result.uri, extension: 'jpg' };
}

export function getListingPhotoUrl(storageKey: string): string {
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(storageKey).data.publicUrl;
}

// A listing_photos row as embedded in a sale query — just the fields needed
// to decide display order (see deriveDisplayPhotos). created_at is an ISO
// timestamptz string.
export type DisplayPhotoRow = {
  storage_key: string;
  sort_order: number;
  photo_type: PhotoType;
  created_at: string;
};

// Naive-local "is this timestamp today?" — matches deriveDisplayStatus's
// device-local date handling in utils/sale-listings.ts (the app has no
// per-listing timezone; see 0037_day_of_photo_reminders_cron.sql's header for
// the same limitation on the send side).
function isToday(iso: string, now: Date = new Date()): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

// Day-of Photos display rule (feature spec 4f / tech arch Section 10),
// derived at render time — no stored "primary photo" flag. Any day_of photo
// added *today* leads the gallery/thumbnail (most recent first); everything
// else (planning photos, plus day_of photos from earlier days of a multi-day
// sale, which are kept, never replaced) follows in sort_order. When no day_of
// photo exists from today, this is exactly the old behavior: all photos in
// sort_order. hasFreshPhotoToday drives the "📸 Fresh Photos" badge.
export function deriveDisplayPhotos(
  photos: DisplayPhotoRow[] | null,
  now: Date = new Date()
): { urls: string[]; hasFreshPhotoToday: boolean } {
  const all = photos ?? [];
  const freshToday = all
    .filter((p) => p.photo_type === 'day_of' && isToday(p.created_at, now))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const freshKeys = new Set(freshToday.map((p) => p.storage_key));
  const rest = all
    .filter((p) => !freshKeys.has(p.storage_key))
    .sort((a, b) => a.sort_order - b.sort_order);

  return {
    urls: [...freshToday, ...rest].map((p) => getListingPhotoUrl(p.storage_key)),
    hasFreshPhotoToday: freshToday.length > 0,
  };
}

export async function fetchListingPhotos(
  listingId: string,
  photoType?: PhotoType
): Promise<ListingPhoto[]> {
  let query = supabase
    .from('listing_photos')
    .select('id, storage_key, sort_order')
    .eq('listing_id', listingId);
  // Optional filter — the day-of add-photos screen fetches only 'day_of'
  // photos; every other caller passes nothing and gets all of them.
  if (photoType) query = query.eq('photo_type', photoType);
  const { data, error } = await query.order('sort_order', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    storageKey: row.storage_key,
    url: getListingPhotoUrl(row.storage_key),
    sortOrder: row.sort_order,
  }));
}

// Uploads a locally-picked image (a file:// / content:// URI from
// expo-image-picker) to Storage under "<listingId>/<random-name>", then
// records it in listing_photos. The storage path's first segment is what
// the bucket's RLS policies match against sale_listings.seller_id, so a
// photo can only ever land under a listing the uploader owns.
// The client's job is now just "read the picked file and hand it over". The
// moderate-listing-photo Edge Function classifies it, stores it, and records
// it in one server-side operation — see that function's header, and
// 0042_server_side_photo_moderation.sql, for why: this code used to receive a
// verdict and then write the row itself, which meant it could simply ignore
// the verdict and insert 'approved'. Clients no longer hold INSERT on
// listing_photos or on the bucket at all.
export async function uploadListingPhoto(
  listingId: string,
  localUri: string,
  sortOrder: number,
  photoType: PhotoType = 'planning'
): Promise<ListingPhoto> {
  const { uri, extension } = await normalizeToJpegIfHeic(localUri, inferExtension(localUri));
  const contentType = inferContentType(extension);

  // Read as base64 — the format both Claude's vision API and the function's
  // upload path take. fetch(uri).blob() is unreliable for local file:// URIs
  // on native (works in a browser, but can silently produce corrupt bytes
  // on-device); expo-file-system reads them directly.
  const imageBase64 = await new File(uri).base64();

  // A read that silently yields a tiny placeholder instead of throwing is a
  // real, observed failure mode — Anthropic consistently rejected one specific
  // photo with "Could not process image", which only makes sense if the bytes
  // were never a valid image. A real photo's base64 is many times this size.
  // Caught here so it surfaces as a retryable error in the photoError banner
  // rather than as a confusing server-side failure.
  if (imageBase64.length < 1000) {
    throw new Error('That photo could not be read. Please try again.');
  }

  const { data, error } = await supabase.functions.invoke('moderate-listing-photo', {
    body: {
      image_base64: imageBase64,
      media_type: contentType,
      listing_id: listingId,
      sort_order: sortOrder,
      photo_type: photoType,
    },
  });

  if (error) {
    // Non-2xx arrives as FunctionsHttpError with our JSON body attached; that
    // message is written for the seller (the content-guidelines wording, or a
    // read failure), so prefer it over a generic.
    const response = (error as { context?: Response }).context;
    let message: string | null = null;
    try {
      const body = await response?.json();
      if (body?.error) message = body.error as string;
    } catch {
      // No JSON body — failed below the function (gateway/network).
    }
    throw new Error(
      message ??
        (response?.status === 404
          ? "Photo upload isn't available right now — the moderate-listing-photo function isn't deployed."
          : 'That photo could not be added. Please try again.')
    );
  }
  if (data?.error) throw new Error(data.error as string);

  const photo = data.photo as { id: string; storage_key: string; sort_order: number };
  return {
    id: photo.id,
    storageKey: photo.storage_key,
    url: getListingPhotoUrl(photo.storage_key),
    sortOrder: photo.sort_order,
  };
}

export async function deleteListingPhoto(photoId: string, storageKey: string): Promise<void> {
  const { error: storageError } = await supabase.storage.from(PHOTO_BUCKET).remove([storageKey]);
  if (storageError) throw storageError;

  const { error: deleteError } = await supabase.from('listing_photos').delete().eq('id', photoId);
  if (deleteError) throw deleteError;
}
