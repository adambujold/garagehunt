import { supabase } from '@/utils/supabase';

// Client-side callers for the two moderation Edge Functions (feature spec
// Section 9, items 1/2). Both functions already fail safe internally
// (an Anthropic-side failure returns "flag", never an error) — this layer
// additionally fails safe against invoke-level failures (network issues,
// the function not being deployed yet), for the same reason: a seller's
// upload/publish shouldn't be blocked by our own infrastructure being down,
// but the content still shouldn't silently skip review entirely.
//
// withTimeout guards the same thing one layer further out: the Edge
// Functions themselves bound their Anthropic call to 20s, but a hang
// between this device and Supabase's function gateway (bad connection,
// gateway issue) isn't covered by that — without a client-side bound too,
// supabase.functions.invoke() has no timeout of its own and the calling
// upload/publish flow would just sit there indefinitely.

const MODERATION_TIMEOUT_MS = 25000;

function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), MODERATION_TIMEOUT_MS);
    promise.then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}

export type ModerationDecision = 'approve' | 'flag' | 'reject';

export async function moderateListingPhoto(imageBase64: string, mediaType: string): Promise<ModerationDecision> {
  return withTimeout(
    (async () => {
      const { data, error } = await supabase.functions.invoke('moderate-listing-photo', {
        body: { image_base64: imageBase64, media_type: mediaType },
      });
      if (error || !data?.decision) {
        console.error('Photo moderation call failed, defaulting to flag', error);
        return 'flag';
      }
      return data.decision as ModerationDecision;
    })(),
    'flag'
  );
}

export type TextModerationResult = {
  decision: ModerationDecision;
  reason: string;
};

export async function moderateListingText(description: string): Promise<TextModerationResult> {
  return withTimeout(
    (async () => {
      const { data, error } = await supabase.functions.invoke('moderate-listing-text', {
        body: { description },
      });
      if (error || !data?.decision) {
        console.error('Text moderation call failed, defaulting to flag', error);
        return { decision: 'flag' as const, reason: '' };
      }
      return {
        decision: data.decision as ModerationDecision,
        reason: typeof data.reason === 'string' ? data.reason : '',
      };
    })(),
    { decision: 'flag', reason: '' }
  );
}
