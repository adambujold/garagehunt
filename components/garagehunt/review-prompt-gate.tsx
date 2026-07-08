import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';

import { ReviewPromptModal } from '@/components/garagehunt/review-prompt-modal';
import { useAuthSession } from '@/hooks/use-auth-session';
import { fetchPendingReviewPrompt, PendingReview } from '@/utils/pending-review';

// Mount this once on Discover and once on Profile (feature spec Section 4d:
// "check for eligible reviews when the app opens, or when the Profile/
// Discover tab gains focus"). Both mounts share the same eligibility check,
// so whichever tab the user lands on first shows the prompt.
export function ReviewPromptGate() {
  const { session } = useAuthSession();
  const [pending, setPending] = useState<PendingReview | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      let cancelled = false;
      fetchPendingReviewPrompt(session.user.id)
        .then((result) => {
          if (!cancelled) setPending(result);
        })
        .catch((err) => console.error('Failed to check for pending review prompts', err));
      return () => {
        cancelled = true;
      };
    }, [session])
  );

  if (!pending || !session) return null;

  return (
    <ReviewPromptModal
      pending={pending}
      reviewerId={session.user.id}
      onDone={() => setPending(null)}
    />
  );
}
