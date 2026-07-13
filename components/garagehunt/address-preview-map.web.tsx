import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/brand';
import { Coordinates } from '@/hooks/use-current-location';

// react-native-maps has no web target, so web (including this preview)
// shows a static placeholder instead of crashing — same reasoning as
// discover-map.web.tsx. The real MapView lives in address-preview-map.tsx
// and renders on iOS/Android. Pin color at least reflects whether a real
// address has been resolved yet, so this isn't purely decorative on web.
export function AddressPreviewMap({ coordinates }: { coordinates: Coordinates | null }) {
  return (
    <View style={styles.card}>
      <Ionicons name="location" size={22} color={coordinates ? Colors.coral : Colors.mutedLight} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 90,
    borderRadius: 14,
    backgroundColor: Colors.lavender,
    borderWidth: 2,
    borderColor: Colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
});
