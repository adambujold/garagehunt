import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { BoostListingButton } from '@/components/garagehunt/boost-listing-button';
import { PriceTag } from '@/components/garagehunt/price-tag';
import { Colors, Fonts } from '@/constants/brand';
import { deriveHotTier, HOT_TIER_LABELS, nextHotTierProgress } from '@/utils/hot-tier';
import { MyListingSummary } from '@/utils/sale-listings';

// Shared between My Listings' full-width vertical list and Profile's
// horizontal "My sales" preview row — same seller-facing card (including the
// Boost purchase entry point) in both places, since a seller decides to
// boost wherever they happen to glance at a listing, not only on the
// dedicated dashboard. Neither caller sets a width on this component itself;
// My Listings fills its FlatList row, Profile wraps it in a fixed-width
// horizontal-scroll item.
export function MyListingCard({
  listing,
  onBoosted,
}: {
  listing: MyListingSummary;
  onBoosted: (listingId: string, expiresAt: string) => void;
}) {
  const hotTier = deriveHotTier(listing.favoriteCount);
  const tierProgress = nextHotTierProgress(listing.favoriteCount);
  const isEnded = listing.tagVariant === 'ended';
  // Boosting a draft (not visible anywhere yet) or an ended sale (no more
  // Discover placement to prioritize) wouldn't do anything — cancelled is
  // excluded for the same reason as ended.
  const canBoost = !listing.isDraft && !listing.isCancelled && !isEnded;

  return (
    <View style={[styles.card, listing.isDraft && styles.cardDraft, listing.isCancelled && styles.cardCancelled]}>
      <Pressable onPress={() => router.push({ pathname: '/edit-listing/[id]', params: { id: listing.id } })}>
        <View style={styles.cardRow}>
          {listing.photoUrl ? (
            <Image source={{ uri: listing.photoUrl }} style={styles.thumb} resizeMode="cover" />
          ) : (
            <View style={styles.thumb}>
              <Ionicons name="image-outline" size={18} color={Colors.amberIcon} />
            </View>
          )}
          <View style={styles.cardBody}>
            <View style={styles.cardTopRow}>
              <PriceTag label={listing.tagLabel} variant={listing.tagVariant} rotate={-2} />
              <Ionicons name="ellipsis-horizontal" size={14} color={Colors.mutedLight} />
            </View>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {listing.title}
            </Text>
            {listing.isDraft ? (
              <Text style={styles.finishListingText}>Finish listing</Text>
            ) : listing.isCancelled ? (
              <Text style={styles.cardSchedule}>{listing.scheduleLabel}</Text>
            ) : (
              <>
                <Text style={styles.cardSchedule}>{listing.scheduleLabel}</Text>
                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <Ionicons name="eye-outline" size={11} color={Colors.muted} />
                    <Text style={styles.statText}>{listing.viewCount}</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Ionicons name="heart-outline" size={11} color={Colors.muted} />
                    <Text style={styles.statText}>{listing.favoriteCount}</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Ionicons name="checkmark-circle-outline" size={11} color={Colors.muted} />
                    <Text style={styles.statText}>{listing.checkinCount} checked in</Text>
                  </View>
                </View>
                {(hotTier || listing.isBoosted) && (
                  <View style={styles.hotRow}>
                    {listing.isBoosted && <PriceTag label="⭐ Featured" variant="boosted" rotate={-2} />}
                    {hotTier && <PriceTag label={HOT_TIER_LABELS[hotTier]} variant={hotTier} rotate={-2} />}
                  </View>
                )}
                {tierProgress && (
                  <Text style={styles.progressText}>
                    {listing.favoriteCount} interested · {tierProgress.remaining} more for {tierProgress.nextLabel}
                  </Text>
                )}
              </>
            )}
          </View>
        </View>
      </Pressable>
      {canBoost && (
        <BoostListingButton
          listingId={listing.id}
          isBoosted={listing.isBoosted}
          onBoosted={(expiresAt) => onBoosted(listing.id, expiresAt)}
        />
      )}
      {isEnded && (
        <Pressable
          style={styles.buyersButton}
          onPress={() => router.push({ pathname: '/listing-buyers/[id]', params: { id: listing.id } })}>
          <Ionicons name="people-outline" size={13} color={Colors.mutedDark} />
          <Text style={styles.buyersButtonLabel}>See buyers who checked in</Text>
          <Ionicons name="chevron-forward" size={13} color={Colors.tanBorder} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  cardDraft: {
    borderStyle: 'dashed',
  },
  cardCancelled: {
    opacity: 0.6,
  },
  cardRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: Colors.amberBg,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardBody: {
    flex: 1,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cardTitle: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 14,
    color: Colors.ink,
    marginBottom: 2,
  },
  cardSchedule: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.muted,
    marginBottom: 6,
  },
  finishListingText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    color: Colors.coral,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontFamily: Fonts.body,
    fontSize: 10,
    color: Colors.muted,
  },
  hotRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    alignItems: 'flex-start',
  },
  progressText: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 11,
    color: Colors.interestPink,
    marginTop: 8,
  },
  buyersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderTopWidth: 2,
    borderTopColor: Colors.tan,
    marginTop: 12,
    paddingTop: 10,
  },
  buyersButtonLabel: {
    flex: 1,
    fontFamily: Fonts.displaySemiBold,
    fontSize: 11,
    color: Colors.mutedDark,
  },
});
