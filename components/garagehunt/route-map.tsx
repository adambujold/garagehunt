import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, Region } from 'react-native-maps';

import { Colors, Fonts } from '@/constants/brand';
import { Coordinates } from '@/hooks/use-current-location';

export type RouteStopPin = {
  id: string;
  coordinate: Coordinates;
  order: number;
};

type RouteMapProps = {
  origin: Coordinates;
  stops: RouteStopPin[];
  // [longitude, latitude] pairs, straight from the Mapbox GeoJSON response.
  geometry: [number, number][];
  // Manual Pick keeps the original violet; Auto-Suggest uses jade
  // (Colors.jade, #0F9D8B) — the exact accent from the reskinned mockup's
  // auto-suggest route dots/stop-nums — so the two modes stay visually
  // distinct at a glance. Defaults to violet so every existing Manual Pick
  // call site is unaffected.
  accentColor?: string;
};

export function RouteMap({ origin, stops, geometry, accentColor = Colors.violet }: RouteMapProps) {
  const initialRegion: Region = {
    latitude: origin.latitude,
    longitude: origin.longitude,
    latitudeDelta: 0.12,
    longitudeDelta: 0.12,
  };
  const polylineCoordinates = geometry.map(([longitude, latitude]) => ({ latitude, longitude }));

  return (
    <View style={styles.card}>
      <MapView style={styles.map} initialRegion={initialRegion} showsUserLocation>
        <Polyline coordinates={polylineCoordinates} strokeColor={accentColor} strokeWidth={4} />
        {stops.map((stop) => (
          <Marker key={stop.id} coordinate={stop.coordinate}>
            <View style={[styles.stopPin, { backgroundColor: accentColor }]}>
              <Text style={styles.stopPinLabel}>{stop.order}</Text>
            </View>
          </Marker>
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 200,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.ink,
    overflow: 'hidden',
    marginBottom: 12,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  stopPin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.violet,
    borderWidth: 2,
    borderColor: Colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopPinLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 11,
    color: '#fff',
  },
});
