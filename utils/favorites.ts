import { supabase } from '@/utils/supabase';

// Mirrors the `favorites` table from
// supabase/migrations/0002_favorites.sql — a real insert/delete here fires
// the sync_listing_favorite_count trigger, which keeps
// sale_listings.favorite_count in sync server-side.

export async function isListingFavorited(userId: string, listingId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('favorites')
    .select('user_id')
    .eq('user_id', userId)
    .eq('listing_id', listingId)
    .maybeSingle();

  if (error) throw error;
  return data !== null;
}

export async function addFavorite(userId: string, listingId: string): Promise<void> {
  const { error } = await supabase.from('favorites').insert({ user_id: userId, listing_id: listingId });
  if (error) throw error;
}

export async function removeFavorite(userId: string, listingId: string): Promise<void> {
  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('user_id', userId)
    .eq('listing_id', listingId);
  if (error) throw error;
}
