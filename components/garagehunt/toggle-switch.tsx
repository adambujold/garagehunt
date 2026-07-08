import { Pressable, StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/brand';

export function ToggleSwitch({ value, onValueChange }: { value: boolean; onValueChange: (next: boolean) => void }) {
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      style={[styles.track, { backgroundColor: value ? Colors.jade : Colors.tanBorder }]}>
      <View style={[styles.thumb, value ? styles.thumbOn : styles.thumbOff]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 42,
    height: 24,
    borderRadius: 999,
    justifyContent: 'center',
    flexShrink: 0,
  },
  thumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fff',
    position: 'absolute',
  },
  thumbOn: {
    right: 3,
  },
  thumbOff: {
    left: 3,
  },
});
