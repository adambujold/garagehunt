import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RouteMap, RouteStopPin } from '@/components/garagehunt/route-map';
import { Colors, Fonts } from '@/constants/brand';
import { DEFAULT_MAP_REGION } from '@/constants/map';
import { MOCK_SALES } from '@/constants/mock-data';
import { Coordinates, useCurrentLocation } from '@/hooks/use-current-location';
import { formatSaleSchedule } from '@/utils/format-sale-schedule';
import { getOptimizedRoute, OptimizedRoute } from '@/utils/mapbox-directions';

// Manual-pick mode only (feature spec Section 4b, Mode 1) — routes through
// every mock listing rather than a real favorited-listings selection, since
// there's no shared favorites store yet.
const STOPS = MOCK_SALES;

export default function RoutePlannerScreen() {
  const { coords, status } = useCurrentLocation();
  const [route, setRoute] = useState<OptimizedRoute | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const origin: Coordinates =
    coords ?? { latitude: DEFAULT_MAP_REGION.latitude, longitude: DEFAULT_MAP_REGION.longitude };

  useEffect(() => {
    if (status === 'loading') return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    getOptimizedRoute(
      origin,
      STOPS.map((stop) => ({ latitude: stop.latitude, longitude: stop.longitude }))
    )
      .then((result) => {
        if (!cancelled) setRoute(result);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const orderedStops = route ? route.orderedStopIndexes.map((index) => STOPS[index]) : [];
  const stopPins: RouteStopPin[] = orderedStops.map((stop, i) => ({
    id: stop.id,
    coordinate: { latitude: stop.latitude, longitude: stop.longitude },
    order: i + 1,
  }));

  const startNavigation = () => {
    const destination = orderedStops[orderedStops.length - 1];
    if (!destination) return;
    const url =
      Platform.OS === 'ios'
        ? `http://maps.apple.com/?daddr=${destination.latitude},${destination.longitude}`
        : `https://www.google.com/maps/dir/?api=1&destination=${destination.latitude},${destination.longitude}`;
    Linking.openURL(url);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.backRow}>
        <Pressable style={styles.iconButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={18} color={Colors.ink} />
        </Pressable>
        <Text style={styles.title}>Plan my route</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading && (
          <View style={styles.stateBox}>
            <ActivityIndicator color={Colors.coral} />
            <Text style={styles.stateText}>Optimizing your route&hellip;</Text>
          </View>
        )}

        {!loading && error && (
          <View style={styles.stateBox}>
            <Ionicons name="warning-outline" size={20} color={Colors.amberText} />
            <Text style={styles.stateText}>{error}</Text>
          </View>
        )}

        {!loading && !error && route && (
          <>
            <RouteMap origin={origin} stops={stopPins} geometry={route.geometry} />

            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>{orderedStops.length}</Text>
                <Text style={styles.statLabel}>stops</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>{(route.distanceMeters / 1000).toFixed(1)}km</Text>
                <Text style={styles.statLabel}>total</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>{Math.round(route.durationSeconds / 60)}min</Text>
                <Text style={styles.statLabel}>drive</Text>
              </View>
            </View>

            {orderedStops.map((stop, index) => (
              <View key={stop.id} style={styles.stopRow}>
                <View style={styles.stopNum}>
                  <Text style={styles.stopNumLabel}>{index + 1}</Text>
                </View>
                <View style={styles.stopTextGroup}>
                  <Text style={styles.stopTitle} numberOfLines={1}>
                    {stop.title}
                  </Text>
                  <Text style={styles.stopSub}>{formatSaleSchedule(stop)}</Text>
                </View>
              </View>
            ))}

            <Pressable style={styles.navButton} onPress={startNavigation}>
              <Ionicons name="navigate" size={14} color="#fff" />
              <Text style={styles.navButtonLabel}>Start navigation</Text>
            </Pressable>
          </>
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
  backRow: {
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
    fontFamily: Fonts.displaySemiBold,
    fontSize: 17,
    color: Colors.ink,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  stateBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 60,
  },
  stateText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.muted,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.amberBg,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  statNumber: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 15,
    color: Colors.ink,
  },
  statLabel: {
    fontFamily: Fonts.body,
    fontSize: 10,
    color: Colors.amberText,
    marginTop: 2,
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  stopNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.violet,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stopNumLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 11,
    color: '#fff',
  },
  stopTextGroup: {
    flex: 1,
  },
  stopTitle: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 13,
    color: Colors.ink,
  },
  stopSub: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.muted,
    marginTop: 1,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.coral,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 8,
  },
  navButtonLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 13,
    color: '#fff',
  },
});
