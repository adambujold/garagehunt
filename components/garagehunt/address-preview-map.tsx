import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';

import { Colors } from '@/constants/brand';
import { DEFAULT_MAP_REGION } from '@/constants/map';
import { Coordinates } from '@/hooks/use-current-location';

// List a Sale's address step — a small live preview pinned at the address
// the seller has typed/selected (via mapbox-address-search.ts) or, absent
// that, their device GPS as a best-effort placement. Previously just a
// static decorative box with no real map at all. Non-interactive by
// design: a compact preview embedded in a scrollable form shouldn't fight
// the surrounding ScrollView for pan/zoom gestures. See
// address-preview-map.web.tsx for the web fallback — react-native-maps has
// no web target, same reasoning as discover-map.tsx/.web.tsx.
export function AddressPreviewMap({ coordinates }: { coordinates: Coordinates | null }) {
  const region: Region = coordinates
    ? { latitude: coordinates.latitude, longitude: coordinates.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }
    : DEFAULT_MAP_REGION;

  return (
    <View style={styles.card}>
      <MapView
        style={styles.map}
        region={region}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}>
        {coordinates && <Marker coordinate={coordinates} pinColor={Colors.coral} />}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 90,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.ink,
    overflow: 'hidden',
    marginBottom: 14,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
});
