import { StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts } from '@/constants/brand';
import { Coordinates } from '@/hooks/use-current-location';

// react-native-maps has no web target — see discover-map.web.tsx. This shows
// a static numbered-stop illustration instead of the real route line.
export type RouteStopPin = {
  id: string;
  coordinate: Coordinates;
  order: number;
};

const PIN_POSITIONS = [
  { top: 30, left: '12%' },
  { top: 60, left: '38%' },
  { top: 40, left: '62%' },
  { top: 75, left: '84%' },
] as const;

export function RouteMap({ stops }: { origin: Coordinates; stops: RouteStopPin[]; geometry: unknown }) {
  return (
    <View style={styles.card}>
      {stops.slice(0, PIN_POSITIONS.length).map((stop, index) => (
        <View
          key={stop.id}
          style={[styles.stopPin, { top: PIN_POSITIONS[index].top, left: PIN_POSITIONS[index].left }]}>
          <Text style={styles.stopPinLabel}>{stop.order}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 200,
    borderRadius: 16,
    backgroundColor: Colors.lavender,
    borderWidth: 2,
    borderColor: Colors.ink,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 12,
  },
  stopPin: {
    position: 'absolute',
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
