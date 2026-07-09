import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

import { Colors, Fonts } from '@/constants/brand';
import { suggestListingCopy } from '@/utils/ai-suggestions';
import { getErrorMessage } from '@/utils/get-error-message';

// List a Sale / Edit Listing's "✨ Get AI suggestions" button opens this.
// Nothing reaches the real title/description fields until the seller taps
// "Use this title & description" — the suggestion always lands in this
// modal's own (always-editable) fields first, which doubles as the "Edit"
// affordance from the feature request without a separate edit mode.
export function AiSuggestionModal({
  visible,
  categories,
  otherItems,
  onAccept,
  onClose,
}: {
  visible: boolean;
  categories: string[];
  otherItems: string[];
  onAccept: (title: string, description: string) => void;
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [hasGenerated, setHasGenerated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setPrompt('');
    setTitle('');
    setDescription('');
    setHasGenerated(false);
    setLoading(false);
    setError(null);
  }, [visible]);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const suggestion = await suggestListingCopy({ categories, otherItems, prompt: prompt.trim() || undefined });
      setTitle(suggestion.title);
      setDescription(suggestion.description);
      setHasGenerated(true);
    } catch (err) {
      setError(getErrorMessage(err, 'Something went wrong. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleUse = () => {
    onAccept(title.trim(), description.trim());
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flexFill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback onPress={onClose} accessible={false}>
            <View style={StyleSheet.absoluteFillObject} />
          </TouchableWithoutFeedback>
          <View style={styles.card}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>✨ AI suggestions</Text>
              <Pressable onPress={onClose} hitSlop={8}>
                <Ionicons name="close" size={20} color={Colors.muted} />
              </Pressable>
            </View>

            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
              <ScrollView keyboardShouldPersistTaps="handled" style={styles.scroll}>
                <Text style={styles.fieldLabel}>Anything to mention? (optional)</Text>
                <TextInput
                  style={styles.promptInput}
                  placeholder="e.g. mostly kids' toys and winter coats, cash only"
                  placeholderTextColor={Colors.mutedLight}
                  value={prompt}
                  onChangeText={setPrompt}
                  multiline
                  editable={!loading}
                />

                {hasGenerated && (
                  <>
                    <Text style={styles.fieldLabel}>Title</Text>
                    <TextInput
                      style={styles.titleInput}
                      value={title}
                      onChangeText={setTitle}
                      editable={!loading}
                    />

                    <Text style={styles.fieldLabel}>Description</Text>
                    <TextInput
                      style={styles.descriptionInput}
                      value={description}
                      onChangeText={setDescription}
                      multiline
                      editable={!loading}
                    />
                  </>
                )}

                {error && <Text style={styles.errorText}>{error}</Text>}

                <Pressable
                  style={[styles.generateButton, loading && styles.disabledButton]}
                  disabled={loading}
                  onPress={handleGenerate}>
                  {loading ? (
                    <ActivityIndicator color={Colors.violet} />
                  ) : (
                    <Text style={styles.generateButtonLabel}>
                      {hasGenerated ? 'Regenerate' : 'Generate suggestion'}
                    </Text>
                  )}
                </Pressable>

                {hasGenerated && (
                  <Pressable style={styles.useButton} disabled={loading} onPress={handleUse}>
                    <Text style={styles.useButtonLabel}>Use this title & description</Text>
                  </Pressable>
                )}
              </ScrollView>
            </TouchableWithoutFeedback>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flexFill: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(43, 27, 77, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 2,
    borderColor: Colors.tan,
    padding: 20,
  },
  scroll: {
    flexGrow: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  title: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 16,
    color: Colors.ink,
  },
  fieldLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: Colors.mutedDark,
    marginBottom: 6,
  },
  promptInput: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.ink,
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 12,
    padding: 12,
    minHeight: 56,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  titleInput: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.ink,
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  descriptionInput: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.ink,
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 12,
    padding: 12,
    minHeight: 90,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  errorText: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.coral,
    textAlign: 'center',
    marginBottom: 12,
  },
  generateButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.violet,
    borderRadius: 12,
    paddingVertical: 12,
  },
  disabledButton: {
    opacity: 0.5,
  },
  generateButtonLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 13,
    color: Colors.violet,
  },
  useButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.violet,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 10,
  },
  useButtonLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 13,
    color: '#fff',
  },
});
