import { supabase } from '@/utils/supabase';

// Mirrors supabase/migrations/0020_account_deletion.sql — see that file's
// header comment for the full cascade picture and why photo files are
// removed here rather than in the DB function itself.
const PHOTO_BUCKET = 'listing-photos';

export async function deleteOwnAccount(userId: string): Promise<void> {
  const { data: listings, error: listingsError } = await supabase
    .from('sale_listings')
    .select('id')
    .eq('seller_id', userId);
  if (listingsError) throw listingsError;

  const listingIds = (listings ?? []).map((listing) => listing.id);
  if (listingIds.length > 0) {
    const { data: photos, error: photosError } = await supabase
      .from('listing_photos')
      .select('storage_key')
      .in('listing_id', listingIds);
    if (photosError) throw photosError;

    const storageKeys = (photos ?? []).map((photo) => photo.storage_key);
    if (storageKeys.length > 0) {
      const { error: removeError } = await supabase.storage.from(PHOTO_BUCKET).remove(storageKeys);
      if (removeError) throw removeError;
    }
  }

  const { error: rpcError } = await supabase.rpc('delete_own_account');
  if (rpcError) throw rpcError;

  await supabase.auth.signOut();
}
