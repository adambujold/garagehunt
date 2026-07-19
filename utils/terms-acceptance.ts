import { supabase } from '@/utils/supabase';

// Bump this (and the corresponding hosted document) any time the Terms of
// Service or Privacy Policy materially changes — a simple date string, not a
// semver, since there's no automated versioning of the hosted HTML.
export const TERMS_VERSION = '2026-07-11';
export const PRIVACY_POLICY_URL = 'https://adambujold.github.io/garagehunt-legal/';
export const TERMS_OF_SERVICE_URL = 'https://adambujold.github.io/garagehunt-legal/terms.html';

// Google/Apple's signInWithOAuth/signInWithIdToken calls have no
// options.data param the way supabase.auth.signUp() does — the public.users
// row (with terms_accepted_at/terms_version null) already exists by the time
// a caller checks this (created by the handle_new_auth_user trigger as part
// of the same sign-in). Returns the signed-in user's id if they still need
// to accept, or null if there's no session or they've already accepted —
// callers branch on that to decide whether to prompt/record.
export async function currentUserNeedsTermsAcceptance(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('users').select('terms_accepted_at').eq('id', user.id).maybeSingle();
  return profile && profile.terms_accepted_at === null ? user.id : null;
}

export async function recordTermsAcceptance(userId: string): Promise<void> {
  await supabase
    .from('users')
    .update({ terms_accepted_at: new Date().toISOString(), terms_version: TERMS_VERSION })
    .eq('id', userId);
}
