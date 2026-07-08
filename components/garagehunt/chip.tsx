import { Pressable, StyleSheet, Text } from 'react-native';

import { Colors, Fonts } from '@/constants/brand';

type ChipProps = {
  label: string;
  active?: boolean;
  onPress?: () => void;
};

export function Chip({ label, active, onPress }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active ? styles.chipActive : styles.chipIdle]}>
      <Text style={[styles.label, active ? styles.labelActive : styles.labelIdle]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  chipActive: {
    backgroundColor: Colors.coral,
  },
  chipIdle: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
  },
  label: {
    fontFamily: Fonts.displayMedium,
    fontSize: 12,
  },
  labelActive: {
    color: '#fff',
  },
  labelIdle: {
    color: Colors.amberText,
  },
});
