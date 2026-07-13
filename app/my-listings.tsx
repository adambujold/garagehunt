import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyStateCard } from '@/components/garagehunt/empty-state-card';
import { MyListingCard } from '@/components/garagehunt/my-listing-card';
import { Colors, Fonts } from '@/constants/brand';
import { useAuthSession } from '@/hooks/use-auth-session';
import { goBack } from '@/utils/navigation';
import { fetchMyListings, MyListingSummary } from '@/utils/sale-listings';

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

  // Patches the specific listing's boosted state in place rather than
  // refetching — same reasoning as the ad-free purchase fix: the purchase
  // happens on this same screen, which useFocusEffect's focus-only refetch
  // wouldn't pick up until navigating away and back.
  const handleBoosted = (listingId: string, expiresAt: string) => {
    setListings((current) =>
      current?.map((listing) =>
        listing.id === listingId ? { ...listing, isBoosted: true, boostExpiresAt: expiresAt } : listing
      ) ?? null
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Pressable style={styles.iconButton} onPress={() => goBack()}>
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
          renderItem={({ item }) => <MyListingCard listing={item} onBoosted={handleBoosted} />}
          ListEmptyComponent={
            <EmptyStateCard
              tagLabel="Get started"
              tagVariant="new"
              heading="You haven't listed a sale yet"
              subtext="Turn your clutter into cash — get your sale live in under 3 minutes."
              ctaLabel="List your first sale"
              onPressCta={() => router.push('/list-sale')}
            />
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
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
});
