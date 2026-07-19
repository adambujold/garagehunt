import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts } from '@/constants/brand';
import { PaymentMethod } from '@/components/garagehunt/sale-card';

// Shared by List a Sale and Edit Listing — same two-button segmented style
// already established by Discover's Map/List toggle, just for a different
// pair of options.
export function PaymentMethodToggle({
  value,
  onChange,
}: {
  value: PaymentMethod;
  onChange: (next: PaymentMethod) => void;
}) {
  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => onChange('cash_only')}
        style={[styles.option, value === 'cash_only' && styles.optionActive]}>
        <Text style={[styles.label, value === 'cash_only' && styles.labelActive]}>Cash only</Text>
      </Pressable>
      <Pressable
        onPress={() => onChange('cash_and_etransfer')}
        style={[styles.option, value === 'cash_and_etransfer' && styles.optionActive]}>
        <Text style={[styles.label, value === 'cash_and_etransfer' && styles.labelActive]}>
          Cash + e-Transfer
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 10,
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: Colors.tan,
    backgroundColor: '#fff',
  },
  optionActive: {
    backgroundColor: Colors.ink,
    borderColor: Colors.ink,
  },
  label: {
    fontFamily: Fonts.displayMedium,
    fontSize: 12,
    color: Colors.mutedDark,
  },
  labelActive: {
    color: '#fff',
  },
});
