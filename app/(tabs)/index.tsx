import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip } from '@/components/garagehunt/chip';
import { DiscoverMap } from '@/components/garagehunt/discover-map';
import { MockSale, SaleCard } from '@/components/garagehunt/sale-card';
import { ReviewPromptGate } from '@/components/garagehunt/review-prompt-gate';
import { Colors, Fonts } from '@/constants/brand';
import { CATEGORIES } from '@/constants/categories';
import { useCurrentLocation } from '@/hooks/use-current-location';
import {
  matchesCategory,
  matchesNext7Days,
  matchesOtherKeyword,
  matchesThisWeekend,
  matchesToday,
  matchesTownWide,
} from '@/utils/discover-filters';
import { fetchSaleListings } from '@/utils/sale-listings';

const DATE_FILTERS = ['Today', 'This weekend', 'Next 7 days'];

// Town-wide stays its own toggle rather than folding into the category
// list — it isn't one of the 11 seller-facing categories, it's a listing
// attribute (sale_listings.event_id).
const FILTERS = [...DATE_FILTERS, 'Town-wide', ...CATEGORIES];

const CATEGORY_NAMES: readonly string[] = CATEGORIES;

// Active filters combine as AND — a listing must satisfy every selected
// chip, not just one of them.
function matchesActiveFilters(sale: MockSale, activeFilters: string[], otherKeyword: string): boolean {
  return activeFilters.every((filter) => {
    if (filter === 'Today') return matchesToday(sale);
    if (filter === 'This weekend') return matchesThisWeekend(sale);
    if (filter === 'Next 7 days') return matchesNext7Days(sale);
    if (filter === 'Town-wide') return matchesTownWide(sale);
    // "Other" switches matching to free text (see matchesOtherKeyword) rather
    // than the plain category-tag check the other 10 categories use.
    if (filter === 'Other') return matchesOtherKeyword(sale, otherKeyword);
    if (CATEGORY_NAMES.includes(filter)) return matchesCategory(sale, filter);
    return true;
  });
}

type ViewMode = 'map' | 'list';

export default function DiscoverScreen() {
  const [activeFilters, setActiveFilters] = useState<string[]>(['This weekend']);
  // Free-text query for the "Other" chip — reset whenever that chip is
  // deselected so re-selecting it later doesn't resurface a stale query.
  const [otherKeyword, setOtherKeyword] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('map');
  const [listings, setListings] = useState<MockSale[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { coords } = useCurrentLocation();

  // Expo Router keeps each tab's screen mounted in the background, so a
  // plain useEffect-on-mount would never refetch after publishing a new
  // listing from another tab. useFocusEffect refetches every time Discover
  // regains focus instead.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchSaleListings(coords)
        .then((data) => {
          if (!cancelled) setListings(data);
        })
        .catch((err) => {
          if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load sales.');
        });
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [coords?.latitude, coords?.longitude])
  );

  const toggleFilter = (filter: string) => {
    setActiveFilters((current) => {
      const isActive = current.includes(filter);
      if (isActive && filter === 'Other') setOtherKeyword('');
      return isActive ? current.filter((f) => f !== filter) : [...current, filter];
    });
  };

  // null while the initial fetch is still in flight; an empty active-filters
  // array is a no-op here (.every on []  is true), so clearing every chip
  // naturally falls back to showing everything again.
  const filteredListings = listings
    ? listings.filter((sale) => matchesActiveFilters(sale, activeFilters, otherKeyword))
    : null;

  const header = (
    <View>
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <View style={styles.logoMark}>
            <Ionicons name="location" size={14} color={Colors.ink} />
          </View>
          <Text style={styles.wordmark}>GarageHunt</Text>
        </View>
        <Pressable style={styles.bellButton}>
          <Ionicons name="notifications-outline" size={16} color={Colors.amberText} />
        </Pressable>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={15} color={Colors.mutedDark} />
        <TextInput
          placeholder="Search categories or items"
          placeholderTextColor={Colors.muted}
          style={styles.searchInput}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chipRow}>
        {FILTERS.map((filter) => (
          <Chip
            key={filter}
            label={filter}
            active={activeFilters.includes(filter)}
            onPress={() => toggleFilter(filter)}
          />
        ))}
      </ScrollView>

      {activeFilters.includes('Other') && (
        <View style={styles.otherKeywordField}>
          <Ionicons name="search" size={13} color={Colors.muted} />
          <TextInput
            value={otherKeyword}
            onChangeText={setOtherKeyword}
            placeholder="e.g. record player, board games..."
            placeholderTextColor={Colors.mutedLight}
            style={styles.otherKeywordInput}
          />
        </View>
      )}

      <View style={styles.viewToggleRow}>
        <Pressable
          onPress={() => setViewMode('map')}
          style={[styles.viewToggle, viewMode === 'map' && styles.viewToggleActive]}>
          <Ionicons name="map-outline" size={13} color={viewMode === 'map' ? '#fff' : Colors.mutedDark} />
          <Text style={[styles.viewToggleLabel, viewMode === 'map' && styles.viewToggleLabelActive]}>
            Map
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setViewMode('list')}
          style={[styles.viewToggle, viewMode === 'list' && styles.viewToggleActive]}>
          <Ionicons name="list-outline" size={13} color={viewMode === 'list' ? '#fff' : Colors.mutedDark} />
          <Text style={[styles.viewToggleLabel, viewMode === 'list' && styles.viewToggleLabelActive]}>
            List
          </Text>
        </Pressable>
      </View>

      {viewMode === 'map' && (
        <DiscoverMap sales={filteredListings ?? []} onPlanRoute={() => router.push('/route-planner')} />
      )}

      {filteredListings && (
        <Text style={styles.sectionLabel}>{filteredListings.length} sales near you</Text>
      )}
    </View>
  );

  if (!listings && !loadError) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ReviewPromptGate />
        {header}
        <View style={styles.stateBox}>
          <ActivityIndicator color={Colors.coral} />
          <Text style={styles.stateText}>Loading sales&hellip;</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ReviewPromptGate />
        {header}
        <View style={styles.stateBox}>
          <Ionicons name="warning-outline" size={20} color={Colors.amberText} />
          <Text style={styles.stateText}>{loadError}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ReviewPromptGate />
      <FlatList<MockSale>
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={filteredListings ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <SaleCard sale={item} />}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {activeFilters.length > 0 && (listings?.length ?? 0) > 0
              ? 'No sales match these filters.'
              : 'No sales listed yet — be the first to list one!'}
          </Text>
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
  },
  stateBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 60,
    paddingHorizontal: 16,
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 14,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoMark: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.marigold,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-10deg' }],
  },
  wordmark: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 17,
    color: Colors.ink,
  },
  bellButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.amberBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.ink,
    borderRadius: 14,
    height: 42,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.ink,
  },
  chipScroll: {
    marginBottom: 12,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 6,
    paddingRight: 4,
  },
  otherKeywordField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 12,
    height: 40,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  otherKeywordInput: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.ink,
  },
  viewToggleRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  viewToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 2,
    borderColor: Colors.tan,
    backgroundColor: '#fff',
  },
  viewToggleActive: {
    backgroundColor: Colors.ink,
    borderColor: Colors.ink,
  },
  viewToggleLabel: {
    fontFamily: Fonts.displayMedium,
    fontSize: 11,
    color: Colors.mutedDark,
  },
  viewToggleLabelActive: {
    color: '#fff',
  },
  sectionLabel: {
    fontFamily: Fonts.displayMedium,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: Colors.mutedDark,
    marginBottom: 10,
  },
});
