import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MockSale, SaleCard } from '@/components/garagehunt/sale-card';
import { Colors, Fonts } from '@/constants/brand';
import { useAuthSession } from '@/hooks/use-auth-session';
import { useCurrentLocation } from '@/hooks/use-current-location';
import { fetchListingsForEvent } from '@/utils/sale-listings';
import {
  EventJoinRequest,
  fetchEventById,
  fetchJoinRequestsForEvent,
  TownWideEvent,
  updateEventJoinRequestStatus,
} from '@/utils/town-wide-events';

export default function OrganizerEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuthSession();
  const { coords } = useCurrentLocation();
  const [event, setEvent] = useState<TownWideEvent | null | undefined>(undefined);
  const [joinRequests, setJoinRequests] = useState<EventJoinRequest[]>([]);
  const [joinedListings, setJoinedListings] = useState<MockSale[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [decisionPendingId, setDecisionPendingId] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!session) return () => {};
    let cancelled = false;
    setLoadError(null);

    fetchEventById(id)
      .then((result) => {
        if (!cancelled) setEvent(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load this event.');
          setEvent(null);
        }
      });

    fetchJoinRequestsForEvent(id)
      .then((requests) => {
        if (!cancelled) setJoinRequests(requests);
      })
      .catch((err) => console.error('Failed to load join requests', err));

    fetchListingsForEvent(id, coords)
      .then((listings) => {
        if (!cancelled) setJoinedListings(listings);
      })
      .catch((err) => console.error('Failed to load joined listings', err));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, session, coords?.latitude, coords?.longitude]);

  useFocusEffect(reload);

  const handleDecision = async (request: EventJoinRequest, status: 'approved' | 'denied') => {
    if (decisionPendingId) return;
    setDecisionPendingId(request.id);
    try {
      await updateEventJoinRequestStatus(request.id, status);
      setJoinRequests((current) => current.map((r) => (r.id === request.id ? { ...r, status } : r)));
      if (status === 'approved') {
        fetchListingsForEvent(id, coords)
          .then(setJoinedListings)
          .catch((err) => console.error('Failed to refresh joined listings', err));
      }
    } catch (err) {
      console.error('Failed to update join request', err);
    } finally {
      setDecisionPendingId(null);
    }
  };

  const pendingRequests = joinRequests.filter((r) => r.status === 'pending');

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

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>
          Pending requests {pendingRequests.length > 0 ? `(${pendingRequests.length})` : ''}
        </Text>
        {pendingRequests.length === 0 ? (
          <Text style={styles.emptyText}>No pending join requests.</Text>
        ) : (
          pendingRequests.map((request) => (
            <View key={request.id} style={styles.requestRow}>
              <View style={styles.requestTextBlock}>
                <Text style={styles.requestTitle}>{request.listingTitle}</Text>
                <Text style={styles.requestAddress}>{request.listingAddress}</Text>
              </View>
              <View style={styles.requestActions}>
                <Pressable
                  style={[styles.actionButton, styles.denyButton]}
                  onPress={() => handleDecision(request, 'denied')}
                  disabled={decisionPendingId === request.id}>
                  <Ionicons name="close" size={15} color={Colors.mutedDark} />
                </Pressable>
                <Pressable
                  style={[styles.actionButton, styles.approveButton]}
                  onPress={() => handleDecision(request, 'approved')}
                  disabled={decisionPendingId === request.id}>
                  <Ionicons name="checkmark" size={15} color="#fff" />
                </Pressable>
              </View>
            </View>
          ))
        )}

        <Text style={[styles.sectionTitle, styles.joinedSectionTitle]}>
          Joined listings ({joinedListings.length})
        </Text>
        {joinedListings.length === 0 ? (
          <Text style={styles.emptyText}>No listings have joined yet.</Text>
        ) : (
          joinedListings.map((sale) => <SaleCard key={sale.id} sale={sale} />)
        )}
      </ScrollView>
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
  content: {
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
  joinedSectionTitle: {
    marginTop: 20,
  },
  emptyText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.muted,
    marginBottom: 12,
  },
  requestRow: {
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
  requestTextBlock: {
    flex: 1,
  },
  requestTitle: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 12,
    color: Colors.ink,
  },
  requestAddress: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.muted,
    marginTop: 1,
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  denyButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
  },
  approveButton: {
    backgroundColor: Colors.jade,
  },
});
