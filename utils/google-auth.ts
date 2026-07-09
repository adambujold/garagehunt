import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from '@/utils/supabase';

// Only needed on web (closes the auth popup and hands control back to this
// tab) — a no-op on iOS/Android per Expo's docs, so it's safe to call
// unconditionally at module load rather than gating it by platform.
WebBrowser.maybeCompleteAuthSession();

// Google sign-in via Supabase's hosted OAuth flow (signInWithOAuth +
// expo-web-browser), not @react-native-google-signin/google-signin — that
// library needs a native module and its own Google Cloud iOS/Android OAuth
// client IDs, so it can't run in Expo Go. This approach only needs the
// Google Client ID/Secret already configured in the Supabase dashboard:
// expo-linking resolves the redirect to Expo Go's own exp:// scheme
// automatically in development, and to the app's real "garagehunt" scheme
// in a standalone build, with no extra logic needed here either way.
//
// Whatever URL Linking.createURL('/') resolves to at runtime must be on the
// allow-list under Supabase Dashboard → Authentication → URL Configuration →
// Redirect URLs (a wildcard like exp://** / garagehunt://** covers both
// Expo Go and a standalone build without needing to update it per device).
export async function signInWithGoogle(): Promise<void> {
  const redirectTo = Linking.createURL('/');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error('Could not start Google sign-in.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  // The user backed out of the Google account picker/consent screen —
  // not an error, just nothing left to do.
  if (result.type !== 'success') return;

  const { queryParams } = Linking.parse(result.url);

  const errorDescription = firstParam(queryParams?.error_description);
  if (errorDescription) throw new Error(errorDescription);

  const code = firstParam(queryParams?.code);
  if (!code) throw new Error('Google sign-in did not return a valid code.');

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) throw exchangeError;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
