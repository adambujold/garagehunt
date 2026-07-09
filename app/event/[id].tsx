import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DiscoverMap } from '@/components/garagehunt/discover-map';
import { MockSale, SaleCard } from '@/components/garagehunt/sale-card';
import { Colors, Fonts } from '@/constants/brand';
import { useCurrentLocation } from '@/hooks/use-current-location';
import { formatDisplayDate } from '@/utils/parse-sale-form-input';
import { fetchListingsForEvent } from '@/utils/sale-listings';
import { fetchEventById, TownWideEvent } from '@/utils/town-wide-events';

function dateRangeLabel(event: TownWideEvent): string {
  return event.startDate === event.endDate
    ? formatDisplayDate(event.startDate)
    : `${formatDisplayDate(event.startDate)} – ${formatDisplayDate(event.endDate)}`;
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { coords } = useCurrentLocation();
  const [event, setEvent] = useState<TownWideEvent | null | undefined>(undefined);
  const [listings, setListings] = useState<MockSale[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoadError(null);

      fetchEventById(id)
        .then((result) => {
          if (cancelled) return;
          setEvent(result);
          if (result) {
            return fetchListingsForEvent(result.id, coords).then((rows) => {
              if (!cancelled) setListings(rows);
            });
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setLoadError(err instanceof Error ? err.message : 'Failed to load this event.');
            setEvent(null);
          }
        });

      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, coords?.latitude, coords?.longitude])
  );

  if (event === undefined) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.stateBox}>
          <ActivityIndicator color={Colors.coral} />
        </View>
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <Text style={styles.notFound}>{loadError ?? 'Event not found.'}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.headerRow}>
        <Pressable style={styles.iconButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={18} color={Colors.ink} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {event.name}
        </Text>
      </View>

      <FlatList<MockSale>
        contentContainerStyle={styles.listContent}
        data={listings}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <SaleCard sale={item} />}
        ListHeaderComponent={
          <View>
            <Text style={styles.schedule}>{dateRangeLabel(event)}</Text>
            <View style={styles.participantRow}>
              <Ionicons name="home" size={13} color={Colors.violet} />
              <Text style={styles.participantText}>
                {listings.length} {listings.length === 1 ? 'home' : 'homes'} participating
              </Text>
            </View>
            <DiscoverMap sales={listings} onPlanRoute={() => router.push('/route-planner')} />
            <Text style={styles.sectionLabel}>Participating sales</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.emptyText}>No sales have joined yet.</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.lavender,
  },
  stateBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFound: {
    fontFamily: Fonts.body,
    color: Colors.muted,
    textAlign: 'center',
    marginTop: 40,
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
  title: {
    flex: 1,
    fontFamily: Fonts.displaySemiBold,
    fontSize: 16,
    color: Colors.ink,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  schedule: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.muted,
    marginBottom: 6,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  participantText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 13,
    color: Colors.violet,
  },
  sectionLabel: {
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
});
