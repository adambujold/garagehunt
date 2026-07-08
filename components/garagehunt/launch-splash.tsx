import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts } from '@/constants/brand';

const SPLASH_DURATION_MS = 1800;
const DOT_INTERVAL_MS = 350;

export function LaunchSplash({ onFinish }: { onFinish: () => void }) {
  const [activeDot, setActiveDot] = useState(0);

  useEffect(() => {
    const dotTimer = setInterval(() => {
      setActiveDot((current) => (current + 1) % 3);
    }, DOT_INTERVAL_MS);
    const finishTimer = setTimeout(onFinish, SPLASH_DURATION_MS);
    return () => {
      clearInterval(dotTimer);
      clearTimeout(finishTimer);
    };
  }, [onFinish]);

  return (
    <View style={styles.container}>
      <View style={styles.glowCoral} />
      <View style={styles.glowJade} />

      <View style={styles.logoMark}>
        <Ionicons name="location" size={30} color={Colors.ink} />
      </View>
      <Text style={styles.wordmark}>
        Garage<Text style={styles.wordmarkAccent}>Hunt</Text>
      </Text>
      <Text style={styles.tagline}>finding your next find...</Text>

      <View style={styles.dotsRow}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.dot, { opacity: i === activeDot ? 1 : 0.35 }]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  glowCoral: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: Colors.coral,
    opacity: 0.15,
    top: -70,
    left: -60,
  },
  glowJade: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: Colors.jade,
    opacity: 0.18,
    bottom: -90,
    right: -60,
  },
  logoMark: {
    width: 68,
    height: 68,
    backgroundColor: Colors.marigold,
    borderTopLeftRadius: 17,
    borderTopRightRadius: 17,
    borderBottomRightRadius: 17,
    borderBottomLeftRadius: 5,
    transform: [{ rotate: '-10deg' }],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  wordmark: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 28,
    color: Colors.paper,
  },
  wordmarkAccent: {
    color: Colors.marigold,
  },
  tagline: {
    fontFamily: Fonts.script,
    fontSize: 17,
    color: Colors.marigold,
    marginTop: 6,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 28,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.paper,
  },
});
