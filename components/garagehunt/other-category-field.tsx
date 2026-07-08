import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Colors, Fonts } from '@/constants/brand';

type OtherCategoryFieldProps = {
  label: string;
  placeholder: string;
  items: string[];
  onAddItem: (item: string) => void;
  onRemoveItem: (index: number) => void;
};

// Revealed only while the "Other" category chip is active — tag-style
// multi-entry per garagehunt-other-category-interaction.html and the feature
// spec (Sections 3 and 4c). Typing text and pressing return commits it as a
// removable bubble and clears the input for the next entry.
export function OtherCategoryField({
  label,
  placeholder,
  items,
  onAddItem,
  onRemoveItem,
}: OtherCategoryFieldProps) {
  const [draft, setDraft] = useState('');

  const commitDraft = () => {
    const trimmed = draft.trim();
    if (trimmed.length > 0) {
      onAddItem(trimmed);
    }
    setDraft('');
  };

  return (
    <View>
      <Ionicons name="arrow-redo" size={14} color={Colors.amberFieldAccent} style={styles.arrow} />
      <View style={styles.expandField}>
        <Text style={styles.label}>{label}</Text>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={commitDraft}
          placeholder={placeholder}
          placeholderTextColor={Colors.mutedLight}
          style={styles.input}
        />
        {items.length > 0 && (
          <View style={styles.bubbleRow}>
            {items.map((item, index) => (
              <View key={`${item}-${index}`} style={styles.bubble}>
                <Text style={styles.bubbleLabel}>{item}</Text>
                <Pressable onPress={() => onRemoveItem(index)} hitSlop={6}>
                  <Text style={styles.bubbleClose}>&times;</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  arrow: {
    alignSelf: 'center',
    transform: [{ rotate: '90deg' }],
    marginBottom: 2,
  },
  expandField: {
    backgroundColor: Colors.amberFieldBg,
    borderWidth: 2,
    borderColor: Colors.amberFieldBorder,
    borderStyle: 'dashed',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  label: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 12,
    color: Colors.amberText,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: Colors.tan,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.ink,
  },
  bubbleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: Colors.amberFieldBorder,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  bubbleLabel: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.ink,
  },
  bubbleClose: {
    fontFamily: Fonts.body,
    fontSize: 14,
    lineHeight: 14,
    color: Colors.amberFieldAccent,
  },
});
