import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableWithoutFeedback, View } from 'react-native';

import { Colors, Fonts } from '@/constants/brand';
import { deleteOwnAccount } from '@/utils/account-deletion';

// Mirrors garagehunt-account-deletion.html's disclosed policy — this text
// must stay consistent with that page since it's the same commitment made
// twice (in-app and on the web disclosure Apple/Google link to).
export function DeleteAccountModal({
  userId,
  onCancel,
  onDeleted,
}: {
  userId: string;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteOwnAccount(userId);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setDeleting(false);
    }
  };

  return (
    <Modal transparent animationType="fade" visible statusBarTranslucent onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <TouchableWithoutFeedback onPress={deleting ? undefined : onCancel} accessible={false}>
          <View style={StyleSheet.absoluteFillObject} />
        </TouchableWithoutFeedback>
        <View style={styles.card}>
          <Text style={styles.title}>Delete your account?</Text>
          <Text style={styles.body}>This is permanent and can&apos;t be undone. Deleting your account will:</Text>
          <View style={styles.list}>
            <Text style={styles.listItem}>• Permanently delete your profile, listings, photos, and saved searches</Text>
            <Text style={styles.listItem}>• Permanently delete your favorites and check-ins</Text>
            <Text style={styles.listItem}>
              • Anonymize (not delete) reviews you&apos;ve left or received, so other users&apos; ratings stay intact
            </Text>
          </View>
          {error && <Text style={styles.errorText}>{error}</Text>}
          <View style={styles.buttonRow}>
            <Pressable style={styles.cancelButton} disabled={deleting} onPress={onCancel}>
              <Text style={styles.cancelButtonLabel}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.deleteButton} disabled={deleting} onPress={handleConfirm}>
              <Text style={styles.deleteButtonLabel}>{deleting ? 'Deleting…' : 'Delete my account'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(43, 27, 77, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 2,
    borderColor: Colors.tan,
    padding: 20,
  },
  title: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 17,
    color: Colors.ink,
    textAlign: 'center',
  },
  body: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.muted,
    textAlign: 'center',
    marginTop: 8,
  },
  list: {
    marginTop: 12,
    gap: 6,
  },
  listItem: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.mutedDark,
    lineHeight: 17,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 12,
    paddingVertical: 12,
  },
  cancelButtonLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 13,
    color: Colors.mutedDark,
  },
  deleteButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    // Colors.danger, not the primary coral — a permanent, undoable action
    // shouldn't carry the same "happy" weight as Publish/Continue/Sign in.
    backgroundColor: Colors.danger,
    borderRadius: 12,
    paddingVertical: 12,
  },
  deleteButtonLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 13,
    color: '#fff',
  },
  errorText: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.errorText,
    textAlign: 'center',
    marginTop: 12,
  },
});
