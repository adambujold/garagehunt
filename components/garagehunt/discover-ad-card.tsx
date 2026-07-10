import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';

import { Colors, Fonts } from '@/constants/brand';
import { isPurchasesAvailable, purchaseAdFree } from '@/utils/purchases';

// Discover feed's sponsored placement — see garagehunt-brand-identity.html's
// .ad-card/.ad-label for the exact visual spec this mirrors (dashed border,
// muted tone, same card shape as a real listing, clearly labeled so it's
// never mistaken for one). Wired to the real Google Mobile Ads SDK, pointed
// at Google's public test ad units for now (see .env.example) — safe to
// ship, never real ads/revenue until those env vars are swapped for
// production IDs from the AdMob console.
//
// react-native-google-mobile-ads has no web target at all (no .web.js entry
// in the package, unlike e.g. react-native-maps) — see discover-ad-card.web.tsx
// for the web fallback, following the same per-platform-file pattern
// discover-map.tsx/.web.tsx already established for react-native-maps.
//
// This component is only ever mounted when the caller (app/(tabs)/index.tsx)
// has already determined the user isn't ad-free — the "Remove ads" link
// below is the natural upsell for someone seeing an ad who'd rather not,
// not a redundant second entitlement check.

const BANNER_UNIT_ID = Platform.select({
  ios: process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER_ID,
  android: process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID,
});

export function DiscoverAdCard() {
  const [failed, setFailed] = useState(false);
  const [purchasing, setPurchasing] = useState(false);

  // No unit id configured, or the ad failed to load — nothing worth
  // showing a "Sponsored" frame around with no ad inside it.
  if (!BANNER_UNIT_ID || failed) return null;

  const handleRemoveAds = async () => {
    setPurchasing(true);
    try {
      await purchaseAdFree();
    } catch {
      // Settings' RemoveAdsCard is the full purchase flow with error
      // messaging — this upsell link is best-effort; a failed/cancelled tap
      // here just leaves the ad showing, nothing more to report.
    } finally {
      setPurchasing(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.label}>
        <Text style={styles.labelText}>Sponsored</Text>
      </View>
      <BannerAd unitId={BANNER_UNIT_ID} size={BannerAdSize.BANNER} onAdFailedToLoad={() => setFailed(true)} />
      {isPurchasesAvailable() && (
        <Pressable style={styles.removeAdsLink} disabled={purchasing} onPress={handleRemoveAds} hitSlop={6}>
          <Text style={styles.removeAdsLinkText}>{purchasing ? 'Processing…' : 'Remove ads'}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.adCardBg,
    borderWidth: 2,
    borderColor: Colors.tanBorder,
    borderStyle: 'dashed',
    borderRadius: 14,
    padding: 10,
    marginBottom: 10,
    position: 'relative',
  },
  label: {
    position: 'absolute',
    top: 8,
    right: 10,
    backgroundColor: Colors.adLabelBg,
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  labelText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 9,
    color: Colors.adLabelText,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  removeAdsLink: {
    marginTop: 6,
  },
  removeAdsLinkText: {
    fontFamily: Fonts.body,
    fontSize: 10,
    color: Colors.muted,
    textDecorationLine: 'underline',
  },
});
