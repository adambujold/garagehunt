import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts } from '@/constants/brand';
import { BOOST_PRICE_LABEL } from '@/utils/listing-boost';
import { isPurchasesAvailable, purchaseBoost } from '@/utils/purchases';
import { applyListingBoost } from '@/utils/sale-listings';

// My Listings' per-card boost purchase entry point. isPurchasesAvailable()
// is false on web (no StoreKit/Play Billing there) — this renders nothing
// at all in that case, matching the "no purchase option shown" treatment
// established for ad-free rather than a broken/disabled button.
export function BoostListingButton({
  listingId,
  isBoosted,
  onBoosted,
}: {
  listingId: string;
  isBoosted: boolean;
  onBoosted: (expiresAt: string) => void;
}) {
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isPurchasesAvailable()) return null;

  const handlePress = async () => {
    setPurchasing(true);
    setError(null);
    try {
      await purchaseBoost();
      // applyListingBoost always sets a fresh now()+48h expiry regardless
      // of any existing boost — re-boosting an already-boosted listing
      // extends/restarts the window rather than stacking (feature spec
      // Section 10), so this call is identical whether isBoosted is
      // currently true or false.
      const expiresAt = await applyListingBoost(listingId);
      onBoosted(expiresAt);
    } catch (err) {
      // RevenueCat reports the user backing out of the native purchase
      // sheet as an error with userCancelled: true — not a failure worth
      // showing a banner for, same handling as RemoveAdsCard.
      const userCancelled = (err as { userCancelled?: boolean } | null)?.userCancelled === true;
      if (!userCancelled) {
        setError(err instanceof Error ? err.message : 'Purchase failed. Please try again.');
      }
    } finally {
      setPurchasing(false);
    }
  };

  return (
    <View style={styles.wrapper}>
      <Pressable style={styles.button} disabled={purchasing} onPress={handlePress}>
        <Text style={styles.label}>
          {purchasing
            ? 'Processing…'
            : isBoosted
              ? `⭐ Extend boost — ${BOOST_PRICE_LABEL}`
              : `⭐ Boost this listing — ${BOOST_PRICE_LABEL}`}
        </Text>
      </Pressable>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderTopWidth: 2,
    borderTopColor: Colors.tan,
    marginTop: 12,
    paddingTop: 10,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.marigold,
    borderRadius: 10,
    paddingVertical: 9,
  },
  label: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 12,
    color: Colors.ink,
  },
  errorText: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.errorText,
    textAlign: 'center',
    marginTop: 6,
  },
});
