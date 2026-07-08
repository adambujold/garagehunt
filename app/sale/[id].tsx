import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MockSale } from '@/components/garagehunt/sale-card';
import { PhotoGallery } from '@/components/garagehunt/photo-gallery';
import { PriceTag } from '@/components/garagehunt/price-tag';
import { Colors, Fonts } from '@/constants/brand';
import { MOCK_SALES } from '@/constants/mock-data';
import { useAuthSession } from '@/hooks/use-auth-session';
import { useCurrentLocation } from '@/hooks/use-current-location';
import { checkIn, isCheckedIn, isWithinCheckInRange } from '@/utils/check-ins';
import { addFavorite, isListingFavorited, removeFavorite } from '@/utils/favorites';
import { formatSaleSchedule } from '@/utils/format-sale-schedule';
import { deriveHotTier, HOT_TIER_LABELS } from '@/utils/hot-tier';
import { fetchSaleListingById } from '@/utils/sale-listings';

export default function SaleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuthSession();
  const [isFavorited, setIsFavorited] = useState(false);
  const [favoritePending, setFavoritePending] = useState(false);
  const [isCheckedInHere, setIsCheckedInHere] = useState(false);
  const [checkInPending, setCheckInPending] = useState(false);
  // Discover cards link real Supabase ids here now, but Route Planner/Profile
  // still route through the original 6 mock ids — check mock data first
  // (sync, no loading flash) and fall back to a real fetch by id.
  const [sale, setSale] = useState<MockSale | null | undefined>(() =>
    MOCK_SALES.find((s) => s.id === id)
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const { coords } = useCurrentLocation();
  const isMockListing = MOCK_SALES.some((s) => s.id === id);

  // useFocusEffect (not mount-only useEffect) so returning to this screen
  // — e.g. after favoriting it elsewhere — reflects the current real count.
  useFocusEffect(
    useCallback(() => {
      const mockMatch = MOCK_SALES.find((s) => s.id === id);
      if (mockMatch) {
        setSale(mockMatch);
        return;
      }

      let cancelled = false;
      setSale(undefined);
      fetchSaleListingById(id, coords)
        .then((result) => {
          if (cancelled) return;
          setSale(result);
          if (result && session) {
            isListingFavorited(session.user.id, result.id)
              .then((favorited) => {
                if (!cancelled) setIsFavorited(favorited);
              })
              .catch((err) => console.error('Failed to check favorite status', err));
            isCheckedIn(result.id, session.user.id)
              .then((checkedIn) => {
                if (!cancelled) setIsCheckedInHere(checkedIn);
              })
              .catch((err) => console.error('Failed to check check-in status', err));
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setLoadError(err instanceof Error ? err.message : 'Failed to load this sale.');
            setSale(null);
          }
        });
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, coords?.latitude, coords?.longitude, session])
  );

  const handleToggleFavorite = async () => {
    if (!sale || favoritePending) return;

    // Legacy mock ids ('1'-'6') have no real sale_listings row for the
    // favorites table to reference — keep this path purely local, same as
    // the original placeholder behavior.
    if (isMockListing) {
      setIsFavorited((v) => !v);
      return;
    }

    if (!session) return;

    const nextFavorited = !isFavorited;
    const delta = nextFavorited ? 1 : -1;
    setFavoritePending(true);
    setIsFavorited(nextFavorited);
    setSale((prev) => (prev ? { ...prev, favoriteCount: prev.favoriteCount + delta } : prev));

    try {
      if (nextFavorited) {
        await addFavorite(session.user.id, sale.id);
      } else {
        await removeFavorite(session.user.id, sale.id);
      }
    } catch (err) {
      console.error('Failed to toggle favorite', err);
      setIsFavorited(!nextFavorited);
      setSale((prev) => (prev ? { ...prev, favoriteCount: prev.favoriteCount - delta } : prev));
    } finally {
      setFavoritePending(false);
    }
  };

  // Route Planner's manual-pick mode pulls from favorited listings, so
  // "Add route" just favorites the listing — never un-favorites, so tapping
  // it again on an already-favorited sale is a harmless no-op rather than
  // toggling it off by surprise.
  const handleAddToRoute = async () => {
    if (!sale || favoritePending || isFavorited) return;

    if (isMockListing) {
      setIsFavorited(true);
      return;
    }

    if (!session) return;

    setFavoritePending(true);
    setIsFavorited(true);
    setSale((prev) => (prev ? { ...prev, favoriteCount: prev.favoriteCount + 1 } : prev));

    try {
      await addFavorite(session.user.id, sale.id);
    } catch (err) {
      // A unique-constraint violation (Postgres 23505) means a favorites
      // row already existed — local isFavorited state was just stale. The
      // outcome the user wants (listing in the route pool) already holds,
      // so only undo the optimistic favoriteCount bump, not isFavorited
      // itself — otherwise a correct add looks like a failed one.
      const isDuplicate = typeof err === 'object' && err !== null && 'code' in err && err.code === '23505';
      if (!isDuplicate) {
        console.error('Failed to add to route', err);
        setIsFavorited(false);
      }
      setSale((prev) => (prev ? { ...prev, favoriteCount: prev.favoriteCount - 1 } : prev));
    } finally {
      setFavoritePending(false);
    }
  };

  const handleShare = async () => {
    if (!sale) return;
    try {
      await Share.share({
        message: `${sale.title}\n${formatSaleSchedule(sale)}\n\n${sale.description}`,
      });
    } catch (err) {
      console.error('Failed to open share sheet', err);
    }
  };

  const handleCheckIn = async () => {
    if (!sale || !session || isMockListing || checkInPending) return;
    setCheckInPending(true);
    try {
      await checkIn(sale.id, session.user.id);
      setIsCheckedInHere(true);
    } catch (err) {
      console.error('Failed to check in', err);
    } finally {
      setCheckInPending(false);
    }
  };

  if (sale === undefined) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.stateBox}>
          <ActivityIndicator color={Colors.coral} />
        </View>
      </SafeAreaView>
    );
  }

  if (!sale) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <Text style={styles.notFound}>{loadError ?? 'Sale not found.'}</Text>
      </SafeAreaView>
    );
  }

  const isTownWide = sale.tagVariant === 'town';
  const hotTier = deriveHotTier(sale.favoriteCount);
  const isLive = sale.tagVariant === 'live';
  const withinCheckInRange = Boolean(
    coords && isWithinCheckInRange(coords, { latitude: sale.latitude, longitude: sale.longitude })
  );
  const showCheckInButton = !isMockListing && isLive && withinCheckInRange && !isCheckedInHere;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable style={styles.iconButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={18} color={Colors.ink} />
        </Pressable>
        <View style={styles.topBarActions}>
          <Pressable style={styles.iconButton} onPress={handleShare}>
            <Ionicons name="share-outline" size={16} color={Colors.mutedDark} />
          </Pressable>
          <Pressable style={styles.iconButton} onPress={handleToggleFavorite} disabled={favoritePending}>
            <Ionicons
              name={isFavorited ? 'heart' : 'heart-outline'}
              size={16}
              color={isFavorited ? Colors.coral : Colors.mutedDark}
            />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <PhotoGallery photos={sale.photos} icon={sale.icon}>
          {isTownWide && (
            <View style={styles.heroTag}>
              <PriceTag label="Community sale" variant="town" rotate={-2} />
            </View>
          )}
        </PhotoGallery>

        <Text style={styles.title}>{sale.title}</Text>

        <View style={styles.tagRow}>
          <PriceTag label={sale.tagLabel} variant={sale.tagVariant} rotate={-2} />
          {hotTier && <PriceTag label={HOT_TIER_LABELS[hotTier]} variant={hotTier} rotate={-3} />}
        </View>

        <View style={styles.chipRow}>
          {sale.categories.map((category) => (
            <View key={category} style={styles.categoryChip}>
              <Text style={styles.categoryChipLabel}>{category}</Text>
            </View>
          ))}
        </View>

        <View style={styles.interestRow}>
          <Ionicons name={hotTier ? 'heart' : 'heart-outline'} size={13} color={Colors.interestPink} />
          <Text style={styles.interestText}>
            {sale.favoriteCount} {sale.favoriteCount === 1 ? 'person' : 'people'} interested
          </Text>
        </View>

        {sale.sellerReviewCount > 0 && (
          <View style={styles.interestRow}>
            <Ionicons name="star" size={13} color={Colors.marigold} />
            <Text style={styles.ratingText}>
              {sale.sellerRating?.toFixed(1)} seller rating · {sale.sellerReviewCount} review
              {sale.sellerReviewCount === 1 ? '' : 's'}
            </Text>
          </View>
        )}

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={13} color={Colors.muted} />
            <Text style={styles.infoText}>{formatSaleSchedule(sale)}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={13} color={Colors.muted} />
            <Text style={styles.infoText}>
              {sale.addressLabel} &middot; {sale.distanceKm}km
            </Text>
          </View>
        </View>

        {showCheckInButton && (
          <Pressable style={styles.checkInButton} onPress={handleCheckIn} disabled={checkInPending}>
            <Ionicons name="location" size={14} color="#fff" />
            <Text style={styles.checkInButtonLabel}>Check in here</Text>
          </Pressable>
        )}

        {isCheckedInHere && (
          <View style={styles.checkedInRow}>
            <Ionicons name="checkmark-circle" size={14} color={Colors.jade} />
            <Text style={styles.checkedInText}>You&apos;re checked in</Text>
          </View>
        )}

        <Text style={styles.description}>{sale.description}</Text>

        <View style={styles.actionRow}>
          <Pressable
            style={[styles.secondaryButton, isFavorited && styles.secondaryButtonDone]}
            onPress={handleAddToRoute}
            disabled={favoritePending || isFavorited}>
            <Ionicons
              name={isFavorited ? 'checkmark-circle' : 'git-network-outline'}
              size={14}
              color={isFavorited ? Colors.jade : Colors.mutedDark}
            />
            <Text style={[styles.secondaryButtonLabel, isFavorited && styles.secondaryButtonLabelDone]}>
              {isFavorited ? 'Added to route' : 'Add route'}
            </Text>
          </Pressable>
          <Pressable style={styles.primaryButton}>
            <Ionicons name="navigate" size={14} color="#fff" />
            <Text style={styles.primaryButtonLabel}>Directions</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.lavender,
  },
  notFound: {
    fontFamily: Fonts.body,
    color: Colors.muted,
    textAlign: 'center',
    marginTop: 40,
  },
  stateBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 4,
  },
  topBarActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  heroTag: {
    position: 'absolute',
    top: 10,
    left: 10,
  },
  title: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 19,
    color: Colors.ink,
    marginBottom: 8,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  interestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 12,
  },
  interestText: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 12,
    color: Colors.interestPink,
  },
  ratingText: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 12,
    color: Colors.amberText,
  },
  categoryChip: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  categoryChipLabel: {
    fontFamily: Fonts.displayMedium,
    fontSize: 11,
    color: Colors.amberText,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 14,
    padding: 12,
    gap: 8,
    marginBottom: 14,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.mutedDark,
  },
  description: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.mutedDark,
    lineHeight: 20,
    marginBottom: 20,
  },
  checkInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.jade,
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 14,
  },
  checkInButtonLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 13,
    color: '#fff',
  },
  checkedInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 14,
  },
  checkedInText: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 12,
    color: Colors.jade,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 12,
    paddingVertical: 12,
  },
  secondaryButtonLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 12,
    color: Colors.mutedDark,
  },
  secondaryButtonDone: {
    backgroundColor: '#EAF7F4',
    borderColor: Colors.jade,
  },
  secondaryButtonLabelDone: {
    color: Colors.jade,
  },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.coral,
    borderRadius: 12,
    paddingVertical: 12,
  },
  primaryButtonLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 12,
    color: '#fff',
  },
});
