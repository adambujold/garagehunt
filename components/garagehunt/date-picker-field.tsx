import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { Colors, Fonts } from '@/constants/brand';
import { formatDisplayDate } from '@/utils/parse-sale-form-input';

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// A real calendar picker, not a raw editable text field — replaces the old
// "type a date and hope the parser guesses the right year" input, which
// also used to default to a hardcoded, silently-stale date. value is an
// ISO "YYYY-MM-DD" string, or "" for genuinely unselected (no default date
// pre-filled) — the field shows placeholder text until the seller actually
// picks one.
export function DatePickerField({
  value,
  onChange,
  minimumDateIso,
  placeholder = 'Select date',
  style,
}: {
  value: string;
  onChange: (iso: string) => void;
  minimumDateIso?: string;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [visible, setVisible] = useState(false);
  const minimumDate = minimumDateIso ? parseIsoDate(minimumDateIso) : undefined;
  // The picker needs some real Date to render even before a value is ever
  // chosen — defaults to today (or minimumDate if that's later) purely so
  // it opens on the current month, without that default ever being written
  // into the field's own value unless the seller actually confirms a pick.
  const initialDraft = () => {
    const today = new Date();
    return minimumDate && minimumDate > today ? minimumDate : today;
  };
  const [draft, setDraft] = useState<Date>(value ? parseIsoDate(value) : initialDraft());

  const open = () => {
    setDraft(value ? parseIsoDate(value) : initialDraft());
    setVisible(true);
  };

  const handleAndroidChange = (event: DateTimePickerEvent, selected?: Date) => {
    setVisible(false);
    if (event.type === 'set' && selected) onChange(toIsoDate(selected));
  };

  return (
    <>
      <View style={style}>
        <Pressable style={styles.tapArea} onPress={open}>
          <Ionicons name="calendar-outline" size={14} color={Colors.muted} />
          <Text style={[styles.text, !value && styles.placeholder]}>
            {value ? formatDisplayDate(value) : placeholder}
          </Text>
        </Pressable>
        {value && (
          <Pressable onPress={() => onChange('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={Colors.mutedLight} />
          </Pressable>
        )}
      </View>

      {visible && Platform.OS === 'android' && (
        <DateTimePicker mode="date" value={draft} minimumDate={minimumDate} onChange={handleAndroidChange} />
      )}

      {Platform.OS === 'ios' && (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
          <Pressable style={styles.backdrop} onPress={() => setVisible(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Pressable onPress={() => setVisible(false)} hitSlop={8}>
                <Text style={styles.sheetCancel}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  onChange(toIsoDate(draft));
                  setVisible(false);
                }}
                hitSlop={8}>
                <Text style={styles.sheetDone}>Done</Text>
              </Pressable>
            </View>
            <DateTimePicker
              mode="date"
              display="inline"
              value={draft}
              minimumDate={minimumDate}
              onChange={(_, selected) => selected && setDraft(selected)}
              style={styles.picker}
            />
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  tapArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  text: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.ink,
  },
  placeholder: {
    color: Colors.mutedLight,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  sheet: {
    backgroundColor: Colors.paper,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 24,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: Colors.tan,
  },
  sheetCancel: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 14,
    color: Colors.muted,
  },
  sheetDone: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 14,
    color: Colors.coral,
  },
  picker: {
    alignSelf: 'stretch',
  },
});
