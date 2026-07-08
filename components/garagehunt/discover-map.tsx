import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';

import { MockSale } from '@/components/garagehunt/sale-card';
import { Colors, Fonts } from '@/constants/brand';
import { DEFAULT_MAP_REGION } from '@/constants/map';
import { useCurrentLocation } from '@/hooks/use-current-location';

const PIN_COLORS = [Colors.coral, Colors.violet, Colors.jade] as const;

export function DiscoverMap({
  sales,
  onPlanRoute,
}: {
  sales: MockSale[];
  onPlanRoute?: () => void;
}) {
  const { coords } = useCurrentLocation();

  const initialRegion: Region = coords
    ? { latitude: coords.latitude, longitude: coords.longitude, latitudeDelta: 0.08, longitudeDelta: 0.08 }
    : DEFAULT_MAP_REGION;

  return (
    <View style={styles.card}>
      <MapView style={styles.map} initialRegion={initialRegion} showsUserLocation={coords !== null}>
        {sales.map((sale, index) => (
          <Marker
            key={sale.id}
            coordinate={{ latitude: sale.latitude, longitude: sale.longitude }}
            onPress={() => router.push({ pathname: '/sale/[id]', params: { id: sale.id } })}>
            <View style={[styles.pin, { backgroundColor: PIN_COLORS[index % PIN_COLORS.length] }]}>
              <Text style={styles.pinLabel}>{sale.distanceKm}km</Text>
            </View>
          </Marker>
        ))}
      </MapView>
      <Pressable style={styles.fab} onPress={onPlanRoute}>
        <Ionicons name="navigate" size={12} color="#fff" />
        <Text style={styles.fabLabel}>Plan route</Text>
      </Pressable>
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
  pinLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 8,
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
});
