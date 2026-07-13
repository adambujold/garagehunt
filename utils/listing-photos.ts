import { File } from 'expo-file-system';

import { moderateListingPhoto } from '@/utils/moderation';
import { supabase } from '@/utils/supabase';

// Mirrors listing_photos from supabase/migrations/0001_sale_listings_schema.sql
// (storage_key, sort_order, moderation_status) plus the Storage bucket and
// RLS policies added in 0005_listing_photos_storage.sql. Image content
// screening (feature spec Section 9, item 1) runs on every upload, below.

const PHOTO_BUCKET = 'listing-photos';
export const MAX_LISTING_PHOTOS = 10;

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

export function getListingPhotoUrl(storageKey: string): string {
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(storageKey).data.publicUrl;
}

export async function fetchListingPhotos(listingId: string): Promise<ListingPhoto[]> {
  const { data, error } = await supabase
    .from('listing_photos')
    .select('id, storage_key, sort_order')
    .eq('listing_id', listingId)
    .order('sort_order', { ascending: true });

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
export async function uploadListingPhoto(listingId: string, localUri: string, sortOrder: number): Promise<ListingPhoto> {
  const extension = inferExtension(localUri);
  const contentType = inferContentType(extension);
  const randomName = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.${extension}`;
  const storageKey = `${listingId}/${randomName}`;

  // fetch(uri).blob() is unreliable for local file:// URIs on native iOS/
  // Android (works fine in a browser, but can silently produce a
  // corrupt/empty upload on-device) — expo-file-system's File.arrayBuffer()
  // reads the raw bytes directly and works identically on web and native.
  const arrayBuffer = await new File(localUri).arrayBuffer();

  // File.arrayBuffer() has been observed to silently resolve with a tiny
  // placeholder (e.g. a ~70-byte 1x1 PNG) instead of throwing when it can't
  // actually read the picked URI — a real photo is always well over this.
  // Uploading that "succeeds" and leaves the listing with a photo that
  // decodes fine but renders as a single stretched-out color block, which is
  // worse than no photo at all (PhotoGallery's normal empty-state icon).
  // Catching it here turns a silent corruption into a visible retryable
  // error via the existing photoError banner on List a Sale / Edit Listing.
  if (arrayBuffer.byteLength < 1000) {
    throw new Error('That photo could not be read. Please try again.');
  }

  // Classified before anything touches Storage — a rejected photo is never
  // uploaded at all, not uploaded-then-deleted. Read as base64 separately
  // from the arrayBuffer above (a second local read, not a second network
  // round trip) since that's the format Claude's vision API takes.
  const imageBase64 = await new File(localUri).base64();
  const decision = await moderateListingPhoto(imageBase64, contentType);
  if (decision === 'reject') {
    throw new Error("That photo doesn't meet our content guidelines. Please choose a different photo.");
  }

  const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(storageKey, arrayBuffer, {
    contentType,
  });
  if (uploadError) throw uploadError;

  // 'flag' maps to the schema's existing 'pending' value (awaiting manual
  // review); 'approve' maps to 'approved'. Explicit either way, rather than
  // relying on the column's 'pending' default, so this stays correct if
  // that default ever changes.
  const moderationStatus = decision === 'approve' ? 'approved' : 'pending';

  const { data, error: insertError } = await supabase
    .from('listing_photos')
    .insert({ listing_id: listingId, storage_key: storageKey, sort_order: sortOrder, moderation_status: moderationStatus })
    .select('id, storage_key, sort_order')
    .single();

  if (insertError) {
    // Best-effort cleanup — an orphaned storage object is harmless (it's
    // just never linked/shown), so a failure here doesn't need to surface.
    await supabase.storage.from(PHOTO_BUCKET).remove([storageKey]).catch(() => {});
    throw insertError;
  }

  return {
    id: data.id,
    storageKey: data.storage_key,
    url: getListingPhotoUrl(data.storage_key),
    sortOrder: data.sort_order,
  };
}

export async function deleteListingPhoto(photoId: string, storageKey: string): Promise<void> {
  const { error: storageError } = await supabase.storage.from(PHOTO_BUCKET).remove([storageKey]);
  if (storageError) throw storageError;

  const { error: deleteError } = await supabase.from('listing_photos').delete().eq('id', photoId);
  if (deleteError) throw deleteError;
}
