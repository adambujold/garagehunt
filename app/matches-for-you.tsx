import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MockSale, SaleCard } from '@/components/garagehunt/sale-card';
import { Colors, Fonts } from '@/constants/brand';
import { useAuthSession } from '@/hooks/use-auth-session';
import { useCurrentLocation } from '@/hooks/use-current-location';
import { fetchMatches, MatchedListing } from '@/utils/fetch-matches';
import { goBack } from '@/utils/navigation';
import { fetchMySavedSearch, SavedSearch } from '@/utils/saved-searches';

function buildSearchSummary(search: SavedSearch): string {
  const parts: string[] = [];
  if (search.keywords.length > 0) parts.push(`"${search.keywords.join(', ')}"`);
  if (search.categoryNames.length > 0) parts.push(search.categoryNames.join(', '));
  parts.push(`${search.radiusKm}km`);
  return parts.join(' · ');
}

export default function MatchesForYouScreen() {
  const { session } = useAuthSession();
  const { coords } = useCurrentLocation();

  const [savedSearch, setSavedSearch] = useState<SavedSearch | null | undefined>(undefined);
  const [matches, setMatches] = useState<MatchedListing[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;

      let cancelled = false;
      setLoadError(null);
      fetchMySavedSearch(session.user.id)
        .then((search) => {
          if (cancelled) return;
          setSavedSearch(search);
          if (!search) {
            setMatches([]);
            return;
          }
          return fetchMatches(search.id, coords).then((result) => {
            if (!cancelled) setMatches(result);
          });
        })
        .catch((err) => {
          if (!cancelled) {
            console.error('Failed to load matches', err);
            setLoadError(err instanceof Error ? err.message : 'Failed to load your matches.');
            setSavedSearch(null);
            setMatches([]);
          }
        });

      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session, coords?.latitude, coords?.longitude])
  );

  const newCount = (matches ?? []).filter((match) => match.isNew).length;

  const header = (
    <View>
      <View style={styles.topBar}>
        <Pressable style={styles.iconButton} onPress={() => goBack()}>
          <Ionicons name="chevron-back" size={18} color={Colors.ink} />
        </Pressable>
        <Text style={styles.topBarTitle}>Matches for you</Text>
        <View style={styles.iconButton} />
      </View>

      {savedSearch && <Text style={styles.summary}>{buildSearchSummary(savedSearch)}</Text>}

      {newCount > 0 && (
        <View style={styles.newBanner}>
          <Ionicons name="notifications" size={13} color="#0F6E56" />
          <Text style={styles.newBannerText}>
            {newCount} new match{newCount === 1 ? '' : 'es'} since yesterday
          </Text>
        </View>
      )}
    </View>
  );

  if (savedSearch === undefined || matches === null) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {header}
        <View style={styles.stateBox}>
          <ActivityIndicator color={Colors.coral} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {header}
        <View style={styles.stateBox}>
          <Ionicons name="warning-outline" size={20} color={Colors.amberText} />
          <Text style={styles.stateText}>{loadError}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!savedSearch) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {header}
        <View style={styles.stateBox}>
          <Text style={styles.stateText}>You haven&apos;t saved a search yet.</Text>
          <Pressable style={styles.editSearchCta} onPress={() => router.push('/looking-for')}>
            <Text style={styles.editSearchCtaLabel}>Set up "I'm looking for"</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <FlatList<MockSale & { matchedAt: string; isNew: boolean }>
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={matches.map((match) => ({ ...match.sale, matchedAt: match.matchedAt, isNew: match.isNew }))}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <SaleCard sale={item} isNew={item.isNew} />}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            No matches yet — we&apos;ll add sales here as they&apos;re published.
          </Text>
        }
        ListFooterComponent={
          <Pressable style={styles.editSearchButton} onPress={() => router.push('/looking-for')}>
            <Ionicons name="settings-outline" size={13} color={Colors.mutedDark} />
            <Text style={styles.editSearchButtonLabel}>Edit search</Text>
          </Pressable>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.lavender,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    flexGrow: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    paddingBottom: 10,
  },
  topBarTitle: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 16,
    color: Colors.ink,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.muted,
    marginBottom: 8,
  },
  newBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#DCF3EE',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  newBannerText: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 11,
    color: '#0F6E56',
  },
  stateBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  stateText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.muted,
    textAlign: 'center',
  },
  emptyText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.muted,
    textAlign: 'center',
    paddingVertical: 24,
  },
  editSearchCta: {
    backgroundColor: Colors.coral,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  editSearchCtaLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 13,
    color: '#fff',
  },
  editSearchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 8,
  },
  editSearchButtonLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 12,
    color: Colors.mutedDark,
  },
});
