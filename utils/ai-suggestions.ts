import { supabase } from '@/utils/supabase';

export type SuggestListingCopyInput = {
  categories: string[];
  otherItems: string[];
  prompt?: string;
};

export type ListingCopySuggestion = {
  title: string;
  description: string;
};

export async function suggestListingCopy(input: SuggestListingCopyInput): Promise<ListingCopySuggestion> {
  const { data, error } = await supabase.functions.invoke('suggest-listing-copy', { body: input });

  if (error) {
    // Supabase's FunctionsHttpError exposes the actual response on `context`
    // — that's where our edge function's { error: "..." } body lives, so
    // surface that message instead of the generic "Edge Function returned a
    // non-2xx status code" fallback. Guarded defensively since `context`
    // isn't always a Response with a working .json() (e.g. network-level
    // failures when the function isn't deployed yet).
    const context = (error as { context?: unknown }).context;
    if (context && typeof (context as Response).json === 'function') {
      const message = await (context as Response)
        .json()
        .then((body) => (typeof body?.error === 'string' ? body.error : null))
        .catch(() => null);
      if (message) throw new Error(message);
    }
    throw new Error(error.message || 'Failed to get an AI suggestion.');
  }

  if (!data?.title || !data?.description) {
    throw new Error('The AI suggestion was incomplete. Please try again.');
  }

  return { title: data.title, description: data.description };
}
