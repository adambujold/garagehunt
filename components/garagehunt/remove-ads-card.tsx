import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts } from '@/constants/brand';
import { useIsAdFree } from '@/hooks/use-ad-free';
import { isPurchasesAvailable, purchaseAdFree, restorePurchases } from '@/utils/purchases';

// Settings' "Remove Ads" section — and the natural place for the same
// upsell to live directly on the ad card itself (discover-ad-card.tsx),
// per this feature's brief. isPurchasesAvailable() is false on Android
// (blocked on Google's pending bank verification) and web (no StoreKit) —
// this renders nothing at all in either case rather than a broken/disabled
// button, matching "no purchase option shown" until Android's ready.
export function RemoveAdsCard({ userId }: { userId: string }) {
  const isAdFree = useIsAdFree(userId);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isPurchasesAvailable()) return null;

  const handlePurchase = async () => {
    setPurchasing(true);
    setError(null);
    try {
      await purchaseAdFree();
      // Supabase's copy of is_ad_free lands moments later via
      // revenuecat-webhook — useIsAdFree already picks up the purchase
      // immediately from the SDK's own customer info, no extra step needed
      // here.
    } catch (err) {
      // RevenueCat reports the user backing out of the native purchase
      // sheet as an error with userCancelled: true — that's not a failure
      // worth showing a banner for.
      const userCancelled = (err as { userCancelled?: boolean } | null)?.userCancelled === true;
      if (!userCancelled) {
        setError(err instanceof Error ? err.message : 'Purchase failed. Please try again.');
      }
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    setError(null);
    try {
      await restorePurchases();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore purchases. Please try again.');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <>
      <Text style={styles.sectionTitle}>Ads</Text>
      <View style={styles.card}>
        {isAdFree ? (
          <View style={styles.row}>
            <Ionicons name="checkmark-circle" size={18} color={Colors.coral} />
            <View style={styles.rowTextBlock}>
              <Text style={styles.rowLabel}>Ad-free active</Text>
              <Text style={styles.rowSubtext}>Thanks for supporting GarageHunt — enjoy an ad-free feed.</Text>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.row}>
              <View style={styles.rowTextBlock}>
                <Text style={styles.rowLabel}>Remove ads</Text>
                <Text style={styles.rowSubtext}>$4.99/month — no more sponsored cards in Discover.</Text>
              </View>
            </View>
            <Pressable style={styles.purchaseButton} disabled={purchasing} onPress={handlePurchase}>
              <Text style={styles.purchaseButtonLabel}>{purchasing ? 'Processing…' : 'Remove ads'}</Text>
            </Pressable>
            <Pressable style={styles.restoreButton} disabled={restoring} onPress={handleRestore}>
              <Text style={styles.restoreButtonLabel}>{restoring ? 'Restoring…' : 'Restore purchases'}</Text>
            </Pressable>
          </>
        )}
        {error && <Text style={styles.errorText}>{error}</Text>}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: Colors.mutedDark,
    marginBottom: 10,
  },
  card: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowTextBlock: {
    flex: 1,
  },
  rowLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 13,
    color: Colors.ink,
  },
  rowSubtext: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.muted,
    marginTop: 2,
  },
  purchaseButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.coral,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 12,
  },
  purchaseButtonLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 13,
    color: '#fff',
  },
  restoreButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  restoreButtonLabel: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.muted,
  },
  errorText: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.coral,
    textAlign: 'center',
    marginTop: 8,
  },
});
