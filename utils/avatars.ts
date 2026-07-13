import { File } from 'expo-file-system';

import { supabase } from '@/utils/supabase';

// Mirrors users.avatar_url from supabase/migrations/0023_user_avatars.sql,
// and the `avatars` Storage bucket created there — same upload-and-record
// pattern as utils/listing-photos.ts, but simpler: one avatar per user, at
// a fixed "<user_id>/avatar" key (upsert on re-upload) rather than a
// separate photos table with multiple ordered rows.

const AVATAR_BUCKET = 'avatars';

function inferExtension(uri: string): string {
  const match = uri.match(/\.(\w+)(?:\?.*)?$/);
  return match?.[1]?.toLowerCase() ?? 'jpg';
}

function inferContentType(extension: string): string {
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return 'image/jpeg';
}

export async function fetchAvatarUrl(userId: string): Promise<string | null> {
  const { data, error } = await supabase.from('users').select('avatar_url').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data?.avatar_url ?? null;
}

export async function fetchAvatarUrls(userIds: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  if (userIds.length === 0) return map;

  const { data, error } = await supabase.from('users').select('id, avatar_url').in('id', userIds);
  if (error) throw error;

  for (const row of data ?? []) map.set(row.id, row.avatar_url);
  return map;
}

// The "neighbors nearby" nudge card (Profile) has no direct seller_id list
// to work from — only the cluster's listingIds — so this resolves
// listings -> distinct seller ids (excluding the caller) -> their
// avatar_urls in one call.
export async function fetchNeighborAvatarUrls(listingIds: string[], excludeUserId: string): Promise<(string | null)[]> {
  if (listingIds.length === 0) return [];

  const { data: listingRows, error: listingError } = await supabase
    .from('sale_listings')
    .select('seller_id')
    .in('id', listingIds);
  if (listingError) throw listingError;

  const sellerIds = [...new Set((listingRows ?? []).map((row) => row.seller_id as string))].filter(
    (sellerId) => sellerId !== excludeUserId
  );
  if (sellerIds.length === 0) return [];

  const avatarMap = await fetchAvatarUrls(sellerIds);
  return sellerIds.map((sellerId) => avatarMap.get(sellerId) ?? null);
}

// Uploads a locally-picked image (a file:// / content:// URI from
// expo-image-picker) to Storage at the caller's fixed "<userId>/avatar"
// key, then updates users.avatar_url. Existing self-update RLS ("Users can
// update their own row" from 0008_reviews.sql) already covers this column —
// no new users-table policy needed, just the Storage ones added alongside
// this file's migration.
export async function uploadAvatar(userId: string, localUri: string): Promise<string> {
  const extension = inferExtension(localUri);
  const contentType = inferContentType(extension);
  const storageKey = `${userId}/avatar`;

  // Same File.arrayBuffer() approach as uploadListingPhoto — fetch(uri).blob()
  // is unreliable for local file:// URIs on-device; see that function's
  // comment in utils/listing-photos.ts for the full reasoning.
  const arrayBuffer = await new File(localUri).arrayBuffer();
  if (arrayBuffer.byteLength < 1000) {
    throw new Error('That photo could not be read. Please try again.');
  }

  const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(storageKey, arrayBuffer, {
    contentType,
    upsert: true,
  });
  if (uploadError) throw uploadError;

  // The storage key is stable across re-uploads (one avatar per user), so
  // without a cache-busting query param every client that already cached
  // the old image at this exact URL — CDN, browser, RN's own Image cache —
  // would keep showing it after a successful re-upload. Storing the
  // versioned URL (not just the bare public URL) means every consumer of
  // avatar_url automatically gets the busted version for free.
  const baseUrl = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(storageKey).data.publicUrl;
  const avatarUrl = `${baseUrl}?v=${Date.now()}`;

  const { error: updateError } = await supabase.from('users').update({ avatar_url: avatarUrl }).eq('id', userId);
  if (updateError) throw updateError;

  return avatarUrl;
}
