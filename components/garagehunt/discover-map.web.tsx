import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MockSale } from '@/components/garagehunt/sale-card';
import { Colors, Fonts } from '@/constants/brand';
import { useSpotlightTarget } from '@/hooks/use-spotlight-target';

// react-native-maps has no web target, so web (including this preview) shows
// a static illustration instead of crashing. The real MapView lives in
// discover-map.tsx and renders on iOS/Android.
const PIN_POSITIONS = [
  { top: 22, left: '16%' },
  { top: 58, left: '46%' },
  { top: 86, left: '74%' },
] as const;
const PIN_COLORS = [Colors.coral, Colors.violet, Colors.jade] as const;

export function DiscoverMap({
  sales,
  onPlanRoute,
}: {
  sales: MockSale[];
  onPlanRoute?: () => void;
}) {
  const previewSales = sales.slice(0, PIN_POSITIONS.length);
  const mapSpotlight = useSpotlightTarget('map');
  const planRouteSpotlight = useSpotlightTarget('plan-route-button');

  return (
    <View ref={mapSpotlight.ref} onLayout={mapSpotlight.onLayout} style={styles.card}>
      {previewSales.map((sale, index) => (
        <View
          key={sale.id}
          style={[
            styles.pin,
            {
              backgroundColor: PIN_COLORS[index % PIN_COLORS.length],
              top: PIN_POSITIONS[index].top,
              left: PIN_POSITIONS[index].left,
            },
          ]}>
          <Text style={styles.pinLabel}>{sale.distanceKm}km</Text>
        </View>
      ))}
      <Pressable
        ref={planRouteSpotlight.ref}
        onLayout={planRouteSpotlight.onLayout}
        style={styles.fab}
        onPress={onPlanRoute}>
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
    backgroundColor: Colors.lavender,
    borderWidth: 2,
    borderColor: Colors.ink,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 12,
  },
  pin: {
    position: 'absolute',
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
