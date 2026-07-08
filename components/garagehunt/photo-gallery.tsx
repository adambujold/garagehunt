import { Ionicons } from '@expo/vector-icons';
import { ReactNode, useState } from 'react';
import {
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Colors, Fonts } from '@/constants/brand';

type PhotoGalleryProps = {
  photos: string[];
  icon: React.ComponentProps<typeof Ionicons>['name'];
  height?: number;
  children?: ReactNode;
};

// Sale Detail's version of the "1/4" style photo counter from the original
// mockup — a horizontal paging ScrollView is enough for that, no carousel
// library needed. Falls back to the icon placeholder only when the listing
// genuinely has zero photos.
export function PhotoGallery({ photos, icon, height = 170, children }: PhotoGalleryProps) {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width === 0) return;
    setIndex(Math.round(event.nativeEvent.contentOffset.x / width));
  };

  if (photos.length === 0) {
    return (
      <View style={[styles.container, styles.fallback, { height }]}>
        <Ionicons name={icon} size={30} color={Colors.amberIcon} />
        {children}
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={handleScrollEnd}>
          {photos.map((url, i) => (
            <Image key={i} source={{ uri: url }} style={{ width, height }} resizeMode="cover" />
          ))}
        </ScrollView>
      )}
      {photos.length > 1 && (
        <View style={styles.counter}>
          <Text style={styles.counterText}>
            {index + 1}/{photos.length}
          </Text>
        </View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 14,
    backgroundColor: Colors.amberBg,
    position: 'relative',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  counterText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    color: '#fff',
  },
});
