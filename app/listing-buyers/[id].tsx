import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { UserAvatar } from '@/components/garagehunt/user-avatar';
import { Colors, Fonts } from '@/constants/brand';
import { useAuthSession } from '@/hooks/use-auth-session';
import { fetchAvatarUrls } from '@/utils/avatars';
import {
  CheckedInBuyer,
  fetchCheckedInBuyers,
  fetchListingReviewsForSeller,
  giveBuyerThumbsUp,
  ListingReview,
} from '@/utils/check-ins';
import { goBack } from '@/utils/navigation';
import { fetchSaleListingById } from '@/utils/sale-listings';

export default function ListingBuyersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuthSession();
  const [title, setTitle] = useState<string | null>(null);
  const [checkinCount, setCheckinCount] = useState(0);
  const [buyers, setBuyers] = useState<CheckedInBuyer[] | null>(null);
  const [reviews, setReviews] = useState<ListingReview[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [thumbsUpPendingId, setThumbsUpPendingId] = useState<string | null>(null);
  const [avatarUrls, setAvatarUrls] = useState<Map<string, string | null>>(new Map());

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      let cancelled = false;
      setLoadError(null);

      fetchSaleListingById(id, null)
        .then((sale) => {
          if (cancelled) return;
          setTitle(sale?.title ?? null);
          setCheckinCount(sale?.checkinCount ?? 0);
        })
        .catch((err) => console.error('Failed to load listing title', err));

      Promise.all([fetchCheckedInBuyers(id), fetchListingReviewsForSeller(id)])
        .then(([buyerRows, reviewRows]) => {
          if (cancelled) return;
          setBuyers(buyerRows);
          setReviews(reviewRows);
          // Photo only, never a name — buyers stay identified as "Buyer
          // #XXXX" here by design (see fetchCheckedInBuyers' comment); a
          // real avatar photo is a visual upgrade to that anonymized row,
          // not a way to reveal who they are.
          return fetchAvatarUrls(buyerRows.map((buyer) => buyer.buyerId)).then((map) => {
            if (!cancelled) setAvatarUrls(map);
          });
        })
        .catch((err) => {
          if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load buyers.');
        });

      return () => {
        cancelled = true;
      };
    }, [id, session])
  );

  const handleThumbsUp = async (buyer: CheckedInBuyer) => {
    if (!session || buyer.thumbsUpGiven || thumbsUpPendingId) return;
    setThumbsUpPendingId(buyer.checkInId);
    try {
      await giveBuyerThumbsUp({
        checkInId: buyer.checkInId,
        listingId: id,
        buyerId: buyer.buyerId,
        sellerId: session.user.id,
      });
      setBuyers((prev) =>
        prev ? prev.map((b) => (b.checkInId === buyer.checkInId ? { ...b, thumbsUpGiven: true } : b)) : prev
      );
    } catch (err) {
      console.error('Failed to give thumbs-up', err);
    } finally {
      setThumbsUpPendingId(null);
    }
  };

  // Reviews from a buyer who also has a check-ins row here are tagged
  // "Verified visit"; reviews from a buyer who self-reported "yes I
  // visited" without ever checking in show plain, with no tag.
  const checkedInBuyerIds = new Set((buyers ?? []).map((buyer) => buyer.buyerId));

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.headerRow}>
        <Pressable style={styles.iconButton} onPress={() => goBack()}>
          <Ionicons name="chevron-back" size={18} color={Colors.ink} />
        </Pressable>
        <View style={styles.headerTextBlock}>
          <Text style={styles.title} numberOfLines={1}>
            {title ?? 'Buyers'}
          </Text>
          <Text style={styles.checkinCountText}>
            {checkinCount} {checkinCount === 1 ? 'person' : 'people'} checked in
          </Text>
        </View>
      </View>

      {!buyers && !loadError && (
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

      {buyers && !loadError && (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={buyers}
          keyExtractor={(item) => item.checkInId}
          ListHeaderComponent={<Text style={styles.sectionTitle}>Checked in</Text>}
          renderItem={({ item }) => (
            <View style={styles.buyerRow}>
              <UserAvatar avatarUrl={avatarUrls.get(item.buyerId) ?? null} size={30} />
              <Text style={styles.buyerLabel}>Buyer #{item.buyerId.slice(0, 4).toUpperCase()}</Text>
              <Pressable
                style={[styles.thumbsUpButton, item.thumbsUpGiven && styles.thumbsUpButtonGiven]}
                onPress={() => handleThumbsUp(item)}
                disabled={item.thumbsUpGiven || thumbsUpPendingId === item.checkInId}>
                <Ionicons
                  name={item.thumbsUpGiven ? 'thumbs-up' : 'thumbs-up-outline'}
                  size={15}
                  color={item.thumbsUpGiven ? '#fff' : Colors.mutedDark}
                />
              </Pressable>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>No one has checked in yet.</Text>}
          ListFooterComponent={
            reviews.length > 0 ? (
              <View style={styles.reviewsSection}>
                <Text style={styles.sectionTitle}>Reviews</Text>
                {reviews.map((review, index) => (
                  <View key={index} style={styles.reviewCard}>
                    <View style={styles.reviewHeaderRow}>
                      <Text style={styles.reviewStars}>
                        {'★'.repeat(review.rating)}
                        {'☆'.repeat(5 - review.rating)}
                      </Text>
                      {checkedInBuyerIds.has(review.reviewerId) && (
                        <View style={styles.verifiedTag}>
                          <Ionicons name="checkmark-circle" size={11} color={Colors.jade} />
                          <Text style={styles.verifiedTagLabel}>Verified visit</Text>
                        </View>
                      )}
                    </View>
                    {review.comment && <Text style={styles.reviewComment}>{review.comment}</Text>}
                  </View>
                ))}
              </View>
            ) : null
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
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextBlock: {
    flex: 1,
  },
  title: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 16,
    color: Colors.ink,
  },
  checkinCountText: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.muted,
    marginTop: 1,
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
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  sectionTitle: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: Colors.mutedDark,
    marginBottom: 10,
  },
  emptyText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.muted,
    textAlign: 'center',
    paddingVertical: 24,
  },
  buyerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  buyerLabel: {
    flex: 1,
    fontFamily: Fonts.displaySemiBold,
    fontSize: 12,
    color: Colors.ink,
  },
  thumbsUpButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.tan,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbsUpButtonGiven: {
    backgroundColor: Colors.jade,
    borderColor: Colors.jade,
  },
  reviewsSection: {
    marginTop: 20,
  },
  reviewCard: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  reviewHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reviewStars: {
    fontSize: 13,
    color: Colors.marigold,
  },
  verifiedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  verifiedTagLabel: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 10,
    color: Colors.jade,
  },
  reviewComment: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.mutedDark,
    marginTop: 6,
    lineHeight: 17,
  },
});
