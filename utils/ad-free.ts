import { supabase } from '@/utils/supabase';

// Mirrors users.is_ad_free/ad_free_expires_at from
// supabase/migrations/0021_ad_free_subscription.sql — the Supabase-stored
// value is the source of truth for cross-device consistency (a purchase
// made on one device should hide ads on another), synced by
// supabase/functions/revenuecat-webhook. Never written directly by the
// client — see that migration's column-level revoke.

export function deriveIsAdFree(isAdFree: boolean, expiresAt: string | null): boolean {
  // Per the architecture doc: "check both the boolean and expiry, don't
  // trust a stale true alone" — is_ad_free can still read true briefly
  // after a subscription's real expiry if the EXPIRATION webhook hasn't
  // landed yet, so a passed expiry always wins over a stale flag.
  return isAdFree && (!expiresAt || new Date(expiresAt) > new Date());
}

export async function fetchIsAdFree(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('users')
    .select('is_ad_free, ad_free_expires_at')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return deriveIsAdFree(data.is_ad_free, data.ad_free_expires_at);
}
