import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableWithoutFeedback, View } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MockSale, SaleCard } from '@/components/garagehunt/sale-card';
import { Colors, Fonts } from '@/constants/brand';
import { DEFAULT_MAP_REGION } from '@/constants/map';
import { useCurrentLocation } from '@/hooks/use-current-location';
import { useSpotlightTarget } from '@/hooks/use-spotlight-target';

const PIN_COLORS = [Colors.coral, Colors.violet, Colors.jade] as const;

// This app doesn't geocode a listing's typed address_text — latitude/
// longitude are captured from the seller's device location at publish time
// (see createSaleListing's callers). That means listings published from the
// same device/location legitimately land on identical coordinates, which is
// common in test data but also a real scenario (e.g. an apartment building).
// Rounding to 4 decimal places (~11m) groups those together into one pin
// instead of letting react-native-maps silently stack separate Markers on
// top of each other, where only the topmost one is visible or tappable.
function groupSalesByLocation(sales: MockSale[]): MockSale[][] {
  const groups = new Map<string, MockSale[]>();
  for (const sale of sales) {
    const key = `${sale.latitude.toFixed(4)},${sale.longitude.toFixed(4)}`;
    const group = groups.get(key);
    if (group) {
      group.push(sale);
    } else {
      groups.set(key, [sale]);
    }
  }
  return [...groups.values()];
}

export function DiscoverMap({
  sales,
  onPlanRoute,
}: {
  sales: MockSale[];
  onPlanRoute?: () => void;
}) {
  const { coords } = useCurrentLocation();
  const insets = useSafeAreaInsets();
  const [selectedCluster, setSelectedCluster] = useState<MockSale[] | null>(null);
  const mapSpotlight = useSpotlightTarget('map');
  const planRouteSpotlight = useSpotlightTarget('plan-route-button');

  const initialRegion: Region = coords
    ? { latitude: coords.latitude, longitude: coords.longitude, latitudeDelta: 0.08, longitudeDelta: 0.08 }
    : DEFAULT_MAP_REGION;

  const groups = useMemo(() => groupSalesByLocation(sales), [sales]);

  return (
    <View ref={mapSpotlight.ref} onLayout={mapSpotlight.onLayout} style={styles.card}>
      <MapView style={styles.map} initialRegion={initialRegion} showsUserLocation={coords !== null}>
        {groups.map((group, index) => {
          const [first] = group;
          const color = PIN_COLORS[index % PIN_COLORS.length];
          return (
            <Marker
              key={first.id}
              coordinate={{ latitude: first.latitude, longitude: first.longitude }}
              onPress={() =>
                group.length === 1
                  ? router.push({ pathname: '/sale/[id]', params: { id: first.id } })
                  : setSelectedCluster(group)
              }>
              <View style={[styles.pin, group.length > 1 && styles.pinCluster, { backgroundColor: color }]}>
                {group.length === 1 ? (
                  <Text style={styles.pinLabel}>{first.distanceKm}km</Text>
                ) : (
                  <>
                    <Text style={styles.pinClusterCount}>{group.length}</Text>
                    <Text style={styles.pinClusterLabel}>sales</Text>
                  </>
                )}
              </View>
            </Marker>
          );
        })}
      </MapView>
      <Pressable
        ref={planRouteSpotlight.ref}
        onLayout={planRouteSpotlight.onLayout}
        style={styles.fab}
        onPress={onPlanRoute}>
        <Ionicons name="navigate" size={12} color="#fff" />
        <Text style={styles.fabLabel}>Plan route</Text>
      </Pressable>

      <Modal
        transparent
        animationType="fade"
        visible={selectedCluster !== null}
        statusBarTranslucent
        onRequestClose={() => setSelectedCluster(null)}>
        <TouchableWithoutFeedback onPress={() => setSelectedCluster(null)} accessible={false}>
          <View style={styles.backdrop}>
            <TouchableWithoutFeedback accessible={false}>
              <View style={[styles.sheet, { paddingBottom: 24 + insets.bottom }]}>
                <Text style={styles.sheetTitle}>
                  {selectedCluster?.length} sales at this spot
                </Text>
                <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
                  {selectedCluster?.map((sale) => (
                    <SaleCard key={sale.id} sale={sale} />
                  ))}
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 220,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.ink,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 12,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  pin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: Colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinCluster: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  pinLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 8,
    color: '#fff',
  },
  pinClusterCount: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 13,
    color: '#fff',
    lineHeight: 15,
  },
  pinClusterLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 7,
    color: '#fff',
  },
  fab: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.coral,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  fabLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 11,
    color: '#fff',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(43, 27, 77, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.lavender,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 16,
    paddingHorizontal: 16,
    maxHeight: '70%',
  },
  sheetTitle: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 15,
    color: Colors.ink,
    marginBottom: 12,
  },
  sheetScroll: {
    flexGrow: 0,
  },
});
