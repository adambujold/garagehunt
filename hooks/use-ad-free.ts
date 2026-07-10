import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';

import { fetchIsAdFree } from '@/utils/ad-free';
import { isAdFreeFromSdk } from '@/utils/purchases';

// Combines Supabase's stored value (source of truth, cross-device) with an
// instant local RevenueCat SDK check (catches a just-completed purchase on
// this device before revenuecat-webhook's round trip lands) — either one
// reporting ad-free is enough to hide ads. Refetches on focus so returning
// to Discover right after buying in Settings picks up the new state.
export function useIsAdFree(userId: string | undefined): boolean {
  const [supabaseAdFree, setSupabaseAdFree] = useState(false);
  const [sdkAdFree, setSdkAdFree] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;

      let cancelled = false;
      fetchIsAdFree(userId)
        .then((result) => {
          if (!cancelled) setSupabaseAdFree(result);
        })
        .catch((err) => console.error('Failed to load ad-free status', err));

      isAdFreeFromSdk()
        .then((result) => {
          if (!cancelled) setSdkAdFree(result);
        })
        .catch(() => {
          // Best-effort only — Supabase's value above remains authoritative.
        });

      return () => {
        cancelled = true;
      };
    }, [userId])
  );

  return supabaseAdFree || sdkAdFree;
}
