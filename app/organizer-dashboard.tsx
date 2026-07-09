import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Fonts } from '@/constants/brand';
import { useAuthSession } from '@/hooks/use-auth-session';
import { formatDisplayDate } from '@/utils/parse-sale-form-input';
import {
  fetchEventParticipantCount,
  fetchJoinRequestsForEvent,
  fetchOrganizerEvents,
  TownWideEvent,
} from '@/utils/town-wide-events';

type EventWithCounts = TownWideEvent & { participantCount: number; pendingCount: number };

function dateRangeLabel(event: TownWideEvent): string {
  return event.startDate === event.endDate
    ? formatDisplayDate(event.startDate)
    : `${formatDisplayDate(event.startDate)} – ${formatDisplayDate(event.endDate)}`;
}

function EventCard({ event }: { event: EventWithCounts }) {
  return (
    <Pressable
      style={styles.card}
      onPress={() => router.push({ pathname: '/organizer-event/[id]', params: { id: event.id } })}>
      <Text style={styles.cardTitle}>{event.name}</Text>
      <Text style={styles.cardSchedule}>
        {dateRangeLabel(event)} &middot; {event.radiusKm}km radius
      </Text>
      <View style={styles.cardStatsRow}>
        <View style={styles.statItem}>
          <Ionicons name="home-outline" size={12} color={Colors.muted} />
          <Text style={styles.statText}>
            {event.participantCount} {event.participantCount === 1 ? 'home' : 'homes'}
          </Text>
        </View>
        {event.pendingCount > 0 && (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeLabel}>
              {event.pendingCount} pending request{event.pendingCount === 1 ? '' : 's'}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

export default function OrganizerDashboardScreen() {
  const { session } = useAuthSession();
  const [events, setEvents] = useState<EventWithCounts[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      let cancelled = false;
      setLoadError(null);

      fetchOrganizerEvents(session.user.id)
        .then(async (rows) => {
          const withCounts = await Promise.all(
            rows.map(async (event) => {
              const [participantCount, joinRequests] = await Promise.all([
                fetchEventParticipantCount(event.id),
                fetchJoinRequestsForEvent(event.id),
              ]);
              return {
                ...event,
                participantCount,
                pendingCount: joinRequests.filter((r) => r.status === 'pending').length,
              };
            })
          );
          if (!cancelled) setEvents(withCounts);
        })
        .catch((err) => {
          if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load your events.');
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
          <Text style={styles.title}>Organizer dashboard</Text>
        </View>
        <Pressable style={styles.addButton} onPress={() => router.push('/create-event')}>
          <Ionicons name="add" size={18} color="#fff" />
        </Pressable>
      </View>

      {!events && !loadError && (
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

      {events && !loadError && (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => <EventCard event={item} />}
          ListEmptyComponent={
            <View style={styles.stateBox}>
              <Text style={styles.stateText}>You haven&apos;t created an event yet.</Text>
              <Pressable style={styles.emptyCta} onPress={() => router.push('/create-event')}>
                <Text style={styles.emptyCtaLabel}>Create your first event</Text>
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
    fontSize: 16,
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
    padding: 14,
    marginBottom: 10,
  },
  cardTitle: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 15,
    color: Colors.ink,
    marginBottom: 4,
  },
  cardSchedule: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.muted,
    marginBottom: 8,
  },
  cardStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.muted,
  },
  pendingBadge: {
    backgroundColor: Colors.amberBg,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 9,
  },
  pendingBadgeLabel: {
    fontFamily: Fonts.displayMedium,
    fontSize: 10,
    color: Colors.amberText,
  },
});
