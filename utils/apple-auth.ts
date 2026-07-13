import * as AppleAuthentication from 'expo-apple-authentication';

import { supabase } from '@/utils/supabase';

// Native Sign in with Apple (iOS only — see login-screen.tsx/signup-screen.tsx
// for the Platform.OS gate around the button itself). Requires
// ios.usesAppleSignIn in app.config.ts and a real device/EAS build; the
// native module has no Expo Go or web equivalent, unlike Google's
// browser-based OAuth flow in google-auth.ts.
export async function signInWithApple(): Promise<void> {
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (err) {
    // The user backed out of the native Face ID / Apple ID sheet — not an
    // error, just nothing left to do (mirrors the "backed out of the
    // picker" early return in google-auth.ts's OAuth flow).
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ERR_REQUEST_CANCELED') return;
    throw err;
  }

  if (!credential.identityToken) throw new Error('Apple sign-in did not return an identity token.');

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;

  // Apple only includes fullName in the credential on the very first
  // authorization this Apple ID ever grants to this app — every sign-in
  // after that returns null here, even after signing out and back in. So
  // this is the only chance to ever capture it; same user_metadata field
  // Sign Up's email/password flow writes to (see signup-screen.tsx), so
  // Profile reads one field regardless of which auth method set it.
  const displayName = [credential.fullName?.givenName, credential.fullName?.familyName]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (displayName) {
    await supabase.auth.updateUser({ data: { display_name: displayName } });
  }
}
