import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';

import { Colors, Fonts } from '@/constants/brand';

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
// PHASE 2 TODO: once RevenueCat's ad-free entitlement lands, gate this
// component's mount point in app/(tabs)/index.tsx behind the user's
// is_ad_free flag — there's no such check yet, so ads always show today.

const BANNER_UNIT_ID = Platform.select({
  ios: process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER_ID,
  android: process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID,
});

export function DiscoverAdCard() {
  const [failed, setFailed] = useState(false);

  // No unit id configured, or the ad failed to load — nothing worth
  // showing a "Sponsored" frame around with no ad inside it.
  if (!BANNER_UNIT_ID || failed) return null;

  return (
    <View style={styles.card}>
      <View style={styles.label}>
        <Text style={styles.labelText}>Sponsored</Text>
      </View>
      <BannerAd unitId={BANNER_UNIT_ID} size={BannerAdSize.BANNER} onAdFailedToLoad={() => setFailed(true)} />
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
});
