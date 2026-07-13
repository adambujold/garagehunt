import { supabase } from '@/utils/supabase';

// Client-side callers for the two moderation Edge Functions (feature spec
// Section 9, items 1/2). Both functions already fail safe internally
// (an Anthropic-side failure returns "flag", never an error) — this layer
// additionally fails safe against invoke-level failures (network issues,
// the function not being deployed yet), for the same reason: a seller's
// upload/publish shouldn't be blocked by our own infrastructure being down,
// but the content still shouldn't silently skip review entirely.

export type ModerationDecision = 'approve' | 'flag' | 'reject';

export async function moderateListingPhoto(imageBase64: string, mediaType: string): Promise<ModerationDecision> {
  const { data, error } = await supabase.functions.invoke('moderate-listing-photo', {
    body: { image_base64: imageBase64, media_type: mediaType },
  });
  if (error || !data?.decision) {
    console.error('Photo moderation call failed, defaulting to flag', error);
    return 'flag';
  }
  return data.decision as ModerationDecision;
}

export type TextModerationResult = {
  decision: ModerationDecision;
  reason: string;
};

export async function moderateListingText(description: string): Promise<TextModerationResult> {
  const { data, error } = await supabase.functions.invoke('moderate-listing-text', {
    body: { description },
  });
  if (error || !data?.decision) {
    console.error('Text moderation call failed, defaulting to flag', error);
    return { decision: 'flag', reason: '' };
  }
  return { decision: data.decision as ModerationDecision, reason: typeof data.reason === 'string' ? data.reason : '' };
}
