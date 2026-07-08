import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, TouchableWithoutFeedback, View } from 'react-native';

import { Colors, Fonts } from '@/constants/brand';

// A small custom bottom sheet instead of ActionSheetIOS (iOS-only, so
// Android would have no camera entry point at all) or Alert.alert (RN Web's
// implementation collapses multi-button alerts down to a plain
// window.confirm, losing the distinct "Take Photo" / "Choose from Library"
// labels) — this renders identically, and is testable, on every platform.
export function PhotoSourceSheet({
  visible,
  onTakePhoto,
  onChooseFromLibrary,
  onCancel,
}: {
  visible: boolean;
  onTakePhoto: () => void;
  onChooseFromLibrary: () => void;
  onCancel: () => void;
}) {
  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible statusBarTranslucent onRequestClose={onCancel}>
      <TouchableWithoutFeedback onPress={onCancel} accessible={false}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback accessible={false}>
            <View style={styles.sheet}>
              <Pressable style={styles.option} onPress={onTakePhoto}>
                <Ionicons name="camera-outline" size={18} color={Colors.ink} />
                <Text style={styles.optionLabel}>Take Photo</Text>
              </Pressable>
              <View style={styles.divider} />
              <Pressable style={styles.option} onPress={onChooseFromLibrary}>
                <Ionicons name="images-outline" size={18} color={Colors.ink} />
                <Text style={styles.optionLabel}>Choose from Library</Text>
              </Pressable>
              <Pressable style={styles.cancelButton} onPress={onCancel}>
                <Text style={styles.cancelLabel}>Cancel</Text>
              </Pressable>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(43, 27, 77, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 8,
    paddingBottom: 28,
    paddingHorizontal: 16,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
  },
  optionLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 14,
    color: Colors.ink,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.tan,
  },
  cancelButton: {
    alignItems: 'center',
    marginTop: 8,
    paddingVertical: 14,
    backgroundColor: Colors.lavender,
    borderRadius: 12,
  },
  cancelLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 13,
    color: Colors.mutedDark,
  },
});
