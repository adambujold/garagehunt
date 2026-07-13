import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip } from '@/components/garagehunt/chip';
import { PriceTag } from '@/components/garagehunt/price-tag';
import { RouteMap, RouteStopPin } from '@/components/garagehunt/route-map';
import { MockSale } from '@/components/garagehunt/sale-card';
import { Colors, Fonts } from '@/constants/brand';
import { DEFAULT_MAP_REGION } from '@/constants/map';
import { MOCK_SALES } from '@/constants/mock-data';
import { useAuthSession } from '@/hooks/use-auth-session';
import { Coordinates, useCurrentLocation } from '@/hooks/use-current-location';
import { buildSaleDeepLink } from '@/utils/deep-links';
import { formatSaleSchedule } from '@/utils/format-sale-schedule';
import { getErrorMessage } from '@/utils/get-error-message';
import { getOptimizedRoute, OptimizedRoute } from '@/utils/mapbox-directions';
import { goBack } from '@/utils/navigation';
import {
  AUTO_SUGGEST_STOP_COUNT,
  AutoSuggestWindow,
  fetchScoredCandidates,
  nextBestAlternative,
  RADIUS_OPTIONS_KM,
  ScoredSale,
} from '@/utils/route-suggestions';

// Manual-pick mode only (feature spec Section 4b, Mode 1) — routes through
// every mock listing rather than a real favorited-listings selection, since
// there's no shared favorites store yet.
const STOPS = MOCK_SALES;

const WINDOW_LABELS: Record<AutoSuggestWindow, string> = {
  today: 'Today',
  weekend: 'This weekend',
  next7days: 'Next 7 days',
};

type RouteMode = 'manual' | 'auto';

export default function RoutePlannerScreen() {
  const { session } = useAuthSession();
  const { coords, status } = useCurrentLocation();
  const [mode, setMode] = useState<RouteMode>('manual');
  // route and the exact stop set it was computed from are kept together —
  // deriving orderedStops from `route` against the *current* activeStops
  // (rather than the stops that were actually optimized) breaks the instant
  // a mode switch changes activeStops before this effect has re-run: the
  // stale route's orderedStopIndexes then index into a shorter/different
  // array and orderedStops.map produces undefined entries, crashing
  // stopPins' `stop.id` read. Bundling them removes that desync window
  // entirely, independent of render/effect timing.
  const [routeResult, setRouteResult] = useState<{ route: OptimizedRoute; stops: MockSale[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Auto-Suggest mode state — kept separate from Manual Pick's STOPS
  // constant, and persisted across mode switches so flipping back to
  // Auto-Suggest after checking Manual Pick doesn't lose a suggestion.
  const [radiusKm, setRadiusKm] = useState<number>(10);
  const [window, setWindow] = useState<AutoSuggestWindow>('weekend');
  const [suggested, setSuggested] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  // The FULL scored/sorted candidate pool (not just the chosen stops) — kept
  // around so swapping a stop pulls the next-best alternative straight out
  // of it rather than re-querying (spec: "not a full re-run").
  const [candidates, setCandidates] = useState<ScoredSale[]>([]);
  const [stopIds, setStopIds] = useState<string[]>([]);

  const origin: Coordinates =
    coords ?? { latitude: DEFAULT_MAP_REGION.latitude, longitude: DEFAULT_MAP_REGION.longitude };

  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const activeStops =
    mode === 'manual'
      ? STOPS
      : stopIds.map((id) => candidateById.get(id)).filter((sale): sale is ScoredSale => Boolean(sale));
  const activeStopsKey = activeStops.map((stop) => stop.id).join(',');

  useEffect(() => {
    if (status === 'loading') return;

    if (activeStops.length === 0) {
      setRouteResult(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const stopsForThisRequest = activeStops;
    setLoading(true);
    setError(null);

    getOptimizedRoute(
      origin,
      stopsForThisRequest.map((stop) => ({ latitude: stop.latitude, longitude: stop.longitude }))
    )
      .then((result) => {
        if (!cancelled) setRouteResult({ route: result, stops: stopsForThisRequest });
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
  }, [status, activeStopsKey]);

  const handleSuggest = async () => {
    if (!session || suggestLoading) return;
    setSuggestLoading(true);
    setSuggestError(null);
    try {
      const scored = await fetchScoredCandidates(origin, radiusKm, window, session.user.id);
      if (scored.length === 0) {
        setSuggestError('No sales found in that area or time window — try a wider radius or a different window.');
        return;
      }
      setCandidates(scored);
      setStopIds(scored.slice(0, AUTO_SUGGEST_STOP_COUNT).map((sale) => sale.id));
      setSuggested(true);
    } catch (err) {
      console.error('Failed to suggest a route', err);
      setSuggestError(getErrorMessage(err, 'Could not suggest a route. Please try again.'));
    } finally {
      setSuggestLoading(false);
    }
  };

  const handleSwapStop = (stopId: string) => {
    const alternative = nextBestAlternative(candidates, stopIds);
    if (!alternative) return;
    setStopIds((current) => current.map((id) => (id === stopId ? alternative.id : id)));
  };

  const orderedStops = routeResult
    ? routeResult.route.orderedStopIndexes.map((index) => routeResult.stops[index])
    : [];
  const stopPins: RouteStopPin[] = orderedStops.map((stop, i) => ({
    id: stop.id,
    coordinate: { latitude: stop.latitude, longitude: stop.longitude },
    order: i + 1,
  }));
  const accentColor = mode === 'auto' ? Colors.jade : Colors.violet;

  // Every optimized stop, not just the last one — the map already shows all
  // of them connected, so navigation needs to route through all of them too.
  // Both platforms support this as a URL: Apple Maps chains waypoints in
  // daddr with "+to:" separators; Google Maps takes intermediate stops via
  // &waypoints= (pipe-separated) with the final stop as &destination=.
  const startNavigation = () => {
    if (orderedStops.length === 0) return;
    const destination = orderedStops[orderedStops.length - 1];
    const waypoints = orderedStops.slice(0, -1);
    const coordsOf = (stop: MockSale) => `${stop.latitude},${stop.longitude}`;

    const url =
      Platform.OS === 'ios'
        ? `http://maps.apple.com/?daddr=${[...waypoints, destination].map(coordsOf).join('+to:')}&dirflg=d`
        : `https://www.google.com/maps/dir/?api=1&destination=${coordsOf(destination)}${
            waypoints.length > 0 ? `&waypoints=${waypoints.map(coordsOf).join('|')}` : ''
          }`;
    Linking.openURL(url);
  };

  // Feature spec Section 12b's "Route sharing" — every stop gets its own
  // deep link (not just one link to the route as a whole), since the
  // recipient doesn't have this exact optimized order/mode themselves; each
  // link just opens straight to that individual listing.
  const handleShareRoute = async () => {
    if (orderedStops.length === 0) return;
    const stopLines = orderedStops
      .map((stop, index) => `${index + 1}. ${stop.title} — ${buildSaleDeepLink(stop.id)}`)
      .join('\n');
    try {
      await Share.share({
        message: `Come hunt with me this Saturday! 🔥\n\n${stopLines}`,
      });
    } catch (err) {
      console.error('Failed to open share sheet', err);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.backRow}>
        <Pressable style={styles.iconButton} onPress={() => goBack()}>
          <Ionicons name="chevron-back" size={18} color={Colors.ink} />
        </Pressable>
        <Text style={styles.title}>Plan my route</Text>
      </View>

      <View style={styles.modeChipRow}>
        <Chip label="Manual pick" active={mode === 'manual'} onPress={() => setMode('manual')} />
        <Chip label="Auto-suggest" active={mode === 'auto'} onPress={() => setMode('auto')} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {mode === 'auto' && !suggested && (
          <View style={styles.pickerCard}>
            <Text style={styles.pickerLabel}>Area</Text>
            <View style={styles.chipRow}>
              {RADIUS_OPTIONS_KM.map((km) => (
                <Chip key={km} label={`${km}km`} active={radiusKm === km} onPress={() => setRadiusKm(km)} />
              ))}
            </View>
            <Text style={styles.pickerLabel}>When</Text>
            <View style={styles.chipRow}>
              {(Object.keys(WINDOW_LABELS) as AutoSuggestWindow[]).map((option) => (
                <Chip
                  key={option}
                  label={WINDOW_LABELS[option]}
                  active={window === option}
                  onPress={() => setWindow(option)}
                />
              ))}
            </View>
            <Pressable style={styles.suggestButton} onPress={handleSuggest} disabled={suggestLoading}>
              {suggestLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.suggestButtonLabel}>Suggest a Route</Text>
              )}
            </Pressable>
            {suggestError && (
              <View style={styles.warningBanner}>
                <Ionicons name="warning-outline" size={13} color={Colors.amberText} />
                <Text style={styles.warningBannerText}>{suggestError}</Text>
              </View>
            )}
          </View>
        )}

        {mode === 'auto' && suggested && (
          <Pressable style={styles.summaryField} onPress={() => setSuggested(false)}>
            <View style={styles.summaryFieldLeft}>
              <Ionicons name="location-outline" size={13} color={Colors.muted} />
              <Text style={styles.summaryFieldText}>
                {radiusKm}km &middot; {WINDOW_LABELS[window]}
              </Text>
            </View>
            <Text style={styles.summaryFieldEdit}>Edit</Text>
          </Pressable>
        )}

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

        {!loading && !error && routeResult && (
          <>
            <RouteMap origin={origin} stops={stopPins} geometry={routeResult.route.geometry} accentColor={accentColor} />

            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>{orderedStops.length}</Text>
                <Text style={styles.statLabel}>stops</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>{(routeResult.route.distanceMeters / 1000).toFixed(1)}km</Text>
                <Text style={styles.statLabel}>total</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statNumber}>{Math.round(routeResult.route.durationSeconds / 60)}min</Text>
                <Text style={styles.statLabel}>drive</Text>
              </View>
            </View>

            {orderedStops.map((stop, index) => {
              const matched = mode === 'auto' && candidateById.get(stop.id)?.isMatched;
              return (
                <View key={stop.id} style={styles.stopRow}>
                  <View style={[styles.stopNum, { backgroundColor: accentColor }]}>
                    <Text style={styles.stopNumLabel}>{index + 1}</Text>
                  </View>
                  <View style={styles.stopTextGroup}>
                    <View style={styles.stopTitleRow}>
                      <Text style={styles.stopTitle} numberOfLines={1}>
                        {stop.title}
                      </Text>
                      {matched && <PriceTag label="Matched" variant="new" rotate={-2} />}
                    </View>
                    <Text style={styles.stopSub}>{formatSaleSchedule(stop)}</Text>
                  </View>
                  {mode === 'auto' && (
                    <Pressable onPress={() => handleSwapStop(stop.id)} hitSlop={8}>
                      <Ionicons name="refresh" size={14} color={Colors.mutedLight} />
                    </Pressable>
                  )}
                </View>
              );
            })}

            <Pressable style={styles.navButton} onPress={startNavigation}>
              <Ionicons name="navigate" size={14} color="#fff" />
              <Text style={styles.navButtonLabel}>Start navigation</Text>
            </Pressable>

            <Pressable style={styles.shareRouteButton} onPress={handleShareRoute}>
              <Ionicons name="share-outline" size={14} color={Colors.mutedDark} />
              <Text style={styles.shareRouteButtonLabel}>Share my route</Text>
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
  modeChipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  pickerCard: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  pickerLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: Colors.mutedDark,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  suggestButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.jade,
    borderRadius: 12,
    paddingVertical: 13,
  },
  suggestButtonLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 13,
    color: '#fff',
  },
  warningBanner: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: Colors.amberBg,
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  warningBannerText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.amberText,
    lineHeight: 16,
  },
  summaryField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 12,
    height: 44,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  summaryFieldLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  summaryFieldText: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 12,
    color: Colors.mutedDark,
  },
  summaryFieldEdit: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: Colors.coral,
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
  stopTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stopTitle: {
    flexShrink: 1,
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
  shareRouteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 8,
  },
  shareRouteButtonLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 13,
    color: Colors.mutedDark,
  },
});
