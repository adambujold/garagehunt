import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PriceTag } from '@/components/garagehunt/price-tag';
import { Colors, Fonts } from '@/constants/brand';
import { useAuthSession } from '@/hooks/use-auth-session';
import { deriveHotTier, HOT_TIER_LABELS, nextHotTierProgress } from '@/utils/hot-tier';
import { fetchMyListings, MyListingSummary } from '@/utils/sale-listings';

function MyListingCard({ listing }: { listing: MyListingSummary }) {
  const hotTier = deriveHotTier(listing.favoriteCount);
  const tierProgress = nextHotTierProgress(listing.favoriteCount);
  const isEnded = listing.tagVariant === 'ended';

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
            <Text style={styles.cardTitle}>{listing.title}</Text>
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
                {hotTier && (
                  <View style={styles.hotRow}>
                    <PriceTag label={HOT_TIER_LABELS[hotTier]} variant={hotTier} rotate={-2} />
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

export default function MyListingsScreen() {
  const { session } = useAuthSession();
  const [listings, setListings] = useState<MyListingSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Refetch every time this screen regains focus (e.g. returning here after
  // publishing a new sale) rather than only on mount — same fix as Discover.
  useFocusEffect(
    useCallback(() => {
      if (!session) return;

      let cancelled = false;
      setLoadError(null);
      fetchMyListings(session.user.id)
        .then((data) => {
          if (!cancelled) setListings(data);
        })
        .catch((err) => {
          if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load your listings.');
        });
      return () => {
        cancelled = true;
      };
    }, [session])
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Pressable style={styles.iconButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={18} color={Colors.ink} />
          </Pressable>
          <Text style={styles.title}>My listings</Text>
        </View>
        <Pressable style={styles.addButton} onPress={() => router.push('/list-sale')}>
          <Ionicons name="add" size={18} color="#fff" />
        </Pressable>
      </View>

      {!listings && !loadError && (
        <View style={styles.stateBox}>
          <ActivityIndicator color={Colors.coral} />
        </View>
      )}

      {loadError && (
        <View style={styles.stateBox}>
          <Ionicons name="warning-outline" size={20} color={Colors.amberText} />
          <Text style={styles.stateText}>{loadError}</Text>
        </View>
      )}

      {listings && !loadError && (
        <FlatList
          data={listings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => <MyListingCard listing={item} />}
          ListEmptyComponent={
            <View style={styles.stateBox}>
              <Text style={styles.stateText}>You haven&apos;t listed a sale yet.</Text>
              <Pressable style={styles.emptyCta} onPress={() => router.push('/list-sale')}>
                <Text style={styles.emptyCtaLabel}>List your first sale</Text>
              </Pressable>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.lavender,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 17,
    color: Colors.ink,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
    paddingTop: 60,
  },
  stateText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.muted,
    textAlign: 'center',
  },
  emptyCta: {
    backgroundColor: Colors.coral,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  emptyCtaLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 13,
    color: '#fff',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
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
