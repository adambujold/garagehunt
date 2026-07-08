import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

import { Colors, Fonts } from '@/constants/brand';
import { PendingReview } from '@/utils/pending-review';
import { submitReview } from '@/utils/reviews';

// Two-step flow per feature spec Section 4d: "Did you visit?" gates whether a
// rating step is even shown. Answering "No" still inserts a reviews row
// (visited: false, rating: null) so this same listing never prompts again,
// while correctly staying out of the seller's aggregate (enforced by the DB
// trigger, which only recalculates on visited=true rows with a rating).
type Step = 'visited' | 'rate';

export function ReviewPromptModal({
  pending,
  reviewerId,
  onDone,
}: {
  pending: PendingReview;
  reviewerId: string;
  onDone: () => void;
}) {
  const [step, setStep] = useState<Step>('visited');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [commentFocused, setCommentFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDidNotVisit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await submitReview({
        listingId: pending.listingId,
        reviewerId,
        sellerId: pending.sellerId,
        visited: false,
        rating: null,
        comment: null,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  const handleSubmitRating = async () => {
    if (rating === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitReview({
        listingId: pending.listingId,
        reviewerId,
        sellerId: pending.sellerId,
        visited: true,
        rating,
        comment: comment.trim() ? comment.trim() : null,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <Modal transparent animationType="fade" visible statusBarTranslucent>
      <KeyboardAvoidingView style={styles.flexFill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.backdrop}>
          {/* The dismiss-on-tap-outside catcher sits BEHIND the card as a
              sibling, not as a wrapper around it — wrapping the card (and
              its TextInput) in TouchableWithoutFeedback broke focus on web:
              its touch-responder system intercepts the mouseup that
              browsers need to complete "focus this element on click",
              so clicking the comment field highlighted text but never
              actually focused it. */}
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View style={StyleSheet.absoluteFillObject} />
          </TouchableWithoutFeedback>
          <View style={styles.card}>
              {step === 'visited' ? (
                <>
                  <Text style={styles.title}>Did you visit this sale?</Text>
                  <Text style={styles.subtitle}>{pending.title}</Text>
                  <View style={styles.buttonRow}>
                    <Pressable
                      style={styles.secondaryButton}
                      disabled={submitting}
                      onPress={handleDidNotVisit}>
                      <Text style={styles.secondaryButtonLabel}>No</Text>
                    </Pressable>
                    <Pressable
                      style={styles.primaryButton}
                      disabled={submitting}
                      onPress={() => setStep('rate')}>
                      <Text style={styles.primaryButtonLabel}>Yes</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.title}>How was it?</Text>
                  <Text style={styles.subtitle}>{pending.title}</Text>
                  <View style={styles.starRow}>
                    {[1, 2, 3, 4, 5].map((value) => (
                      <Pressable key={value} onPress={() => setRating(value)} hitSlop={6}>
                        <Ionicons
                          name={value <= rating ? 'star' : 'star-outline'}
                          size={30}
                          color={Colors.marigold}
                        />
                      </Pressable>
                    ))}
                  </View>
                  {/* A plain in-tree row instead of InputAccessoryView — that
                      API's native accessory sizing proved unreliable across
                      two fix attempts on device, so this avoids the whole
                      class of bug by using ordinary layout that renders the
                      same way everything else on this screen does. Always
                      rendered (visibility toggled, not mounted/unmounted) so
                      focusing the comment field never reflows the card —
                      an insert/remove here was shifting the TextInput under
                      the cursor and fighting focus on some browsers. */}
                  <View style={[styles.commentToolbar, !commentFocused && styles.commentToolbarHidden]}>
                    <Pressable onPress={Keyboard.dismiss} hitSlop={8} disabled={!commentFocused}>
                      <Text style={styles.commentToolbarDone}>Done</Text>
                    </Pressable>
                  </View>
                  <TextInput
                    style={styles.commentInput}
                    placeholder="Add a comment (optional)"
                    placeholderTextColor={Colors.muted}
                    value={comment}
                    onChangeText={setComment}
                    onFocus={() => setCommentFocused(true)}
                    onBlur={() => setCommentFocused(false)}
                    multiline
                  />
                  <Pressable
                    style={[styles.submitButton, rating === 0 && styles.disabledButton]}
                    disabled={submitting || rating === 0}
                    onPress={handleSubmitRating}>
                    <Text style={styles.primaryButtonLabel}>Submit review</Text>
                  </Pressable>
                </>
              )}
              {error && <Text style={styles.errorText}>{error}</Text>}
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
  subtitle: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.muted,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 18,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 12,
    paddingVertical: 12,
  },
  secondaryButtonLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 13,
    color: Colors.mutedDark,
  },
  primaryButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.coral,
    borderRadius: 12,
    paddingVertical: 12,
  },
  submitButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.coral,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 4,
  },
  disabledButton: {
    opacity: 0.5,
  },
  primaryButtonLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 13,
    color: '#fff',
  },
  starRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  commentToolbar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 6,
  },
  commentToolbarHidden: {
    opacity: 0,
  },
  commentToolbarDone: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 14,
    color: Colors.coral,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  commentInput: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.ink,
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 12,
    padding: 12,
    minHeight: 64,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  errorText: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.coral,
    textAlign: 'center',
    marginTop: 12,
  },
});
