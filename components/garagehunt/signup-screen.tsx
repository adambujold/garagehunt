import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Fonts } from '@/constants/brand';
import { signInWithApple } from '@/utils/apple-auth';
import { getErrorMessage } from '@/utils/get-error-message';
import { signInWithGoogle } from '@/utils/google-auth';
import { supabase } from '@/utils/supabase';

// Bump this (and the corresponding hosted document) any time the Terms of
// Service or Privacy Policy materially changes — a simple date string, not a
// semver, since there's no automated versioning of the hosted HTML.
const TERMS_VERSION = '2026-07-11';
const PRIVACY_POLICY_URL = 'https://adambujold.github.io/garagehunt-legal/';
const TERMS_OF_SERVICE_URL = 'https://adambujold.github.io/garagehunt-legal/terms.html';

// Real Supabase email/password, Google, and Apple auth. display_name is
// stored in the auth user's metadata for now — syncing it into a dedicated
// `users` profile table (per the technical architecture doc) is a follow-up
// once that table exists. Apple is iOS-only — see login-screen.tsx's header
// comment for why.
export function SignUpScreen({
  onNavigateToLogin,
}: {
  onNavigateToLogin: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const anyLoading = loading || googleLoading || appleLoading;

  const handleCreateAccount = async () => {
    setError(null);
    setInfoMessage(null);
    setLoading(true);
    // terms_accepted_at/terms_version travel through auth metadata (read
    // back out by the handle_new_auth_user trigger, see migration 0031) —
    // not a direct client-side update to public.users, since that would
    // silently no-op under RLS for the "check your email to confirm" path
    // below, where there's no active session yet to satisfy auth.uid() = id.
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: name,
          terms_accepted_at: new Date().toISOString(),
          terms_version: TERMS_VERSION,
        },
      },
    });
    setLoading(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    if (!data.session) {
      setInfoMessage('Check your email to confirm your account, then sign in.');
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setInfoMessage(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(getErrorMessage(err, 'Something went wrong signing in with Google.'));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setError(null);
    setInfoMessage(null);
    setAppleLoading(true);
    try {
      await signInWithApple();
    } catch (err) {
      setError(getErrorMessage(err, 'Something went wrong signing in with Apple.'));
    } finally {
      setAppleLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flexFill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.logoMark}>
            <Ionicons name="location" size={13} color={Colors.ink} />
          </View>
          <Text style={styles.title}>Join GarageHunt</Text>
          <Text style={styles.subtitle}>Sign up to start discovering sales near you</Text>
        </View>

        {Platform.OS === 'ios' && (
          <Pressable style={styles.appleButton} onPress={handleAppleSignIn} disabled={anyLoading}>
            {appleLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="logo-apple" size={16} color="#fff" />
                <Text style={styles.appleButtonLabel}>Continue with Apple</Text>
              </>
            )}
          </Pressable>
        )}

        <Pressable style={styles.googleButton} onPress={handleGoogleSignIn} disabled={anyLoading}>
          {googleLoading ? (
            <ActivityIndicator color={Colors.coral} />
          ) : (
            <>
              <Ionicons name="logo-google" size={15} color={Colors.coral} />
              <Text style={styles.googleButtonLabel}>Continue with Google</Text>
            </>
          )}
        </Pressable>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerLabel}>or sign up with email</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.field}>
          <Ionicons name="person-outline" size={14} color={Colors.muted} />
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Full name"
            placeholderTextColor={Colors.mutedLight}
            style={styles.fieldInput}
          />
        </View>

        <View style={styles.field}>
          <Ionicons name="mail-outline" size={14} color={Colors.muted} />
          <TextInput
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              setError(null);
            }}
            placeholder="Email address"
            placeholderTextColor={Colors.mutedLight}
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.fieldInput}
          />
        </View>

        <View style={styles.field}>
          <Ionicons name="lock-closed-outline" size={14} color={Colors.muted} />
          {/* textContentType is required, not cosmetic — without it, iOS's AutoFill heuristics can reset the keyboard to letters after every digit typed. */}
          <TextInput
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setError(null);
            }}
            placeholder="Password"
            placeholderTextColor={Colors.mutedLight}
            secureTextEntry
            textContentType="newPassword"
            autoComplete="new-password"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.fieldInput}
          />
        </View>

        <View style={styles.termsRow}>
          {/* The checkbox is its own Pressable, a sibling of the text below
              — not a wrapper around it. Nesting the link Texts inside a
              single row-wide Pressable let a link tap also toggle the
              checkbox (confirmed live): React Native's native touch
              responder system doesn't honor stopPropagation() the way DOM
              click bubbling does, so this needed a structural fix, not an
              event-handling one. */}
          <Pressable onPress={() => setAgreedToTerms((current) => !current)} hitSlop={8}>
            <View style={[styles.checkbox, agreedToTerms && styles.checkboxChecked]}>
              {agreedToTerms && <Ionicons name="checkmark" size={12} color="#fff" />}
            </View>
          </Pressable>
          <Text style={styles.termsText}>
            I agree to the{' '}
            <Text style={styles.termsLink} onPress={() => Linking.openURL(TERMS_OF_SERVICE_URL)}>
              Terms of Service
            </Text>{' '}
            and{' '}
            <Text style={styles.termsLink} onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
              Privacy Policy
            </Text>
          </Text>
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={13} color={Colors.errorText} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {infoMessage && (
          <View style={styles.infoBanner}>
            <Ionicons name="mail-outline" size={13} color="#0F6E56" />
            <Text style={styles.infoText}>{infoMessage}</Text>
          </View>
        )}

        <Pressable
          style={[styles.signUpButton, !agreedToTerms && styles.signUpButtonDisabled]}
          onPress={handleCreateAccount}
          disabled={anyLoading || !agreedToTerms}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.signUpButtonLabel}>Create account</Text>
          )}
        </Pressable>

        <View style={styles.signInRow}>
          <Text style={styles.signInText}>Already have an account? </Text>
          <Pressable onPress={onNavigateToLogin}>
            <Text style={styles.signInLink}>Sign in</Text>
          </Pressable>
        </View>
      </ScrollView>
      </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.lavender,
  },
  flexFill: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoMark: {
    width: 34,
    height: 34,
    backgroundColor: Colors.marigold,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    borderBottomLeftRadius: 3,
    transform: [{ rotate: '-10deg' }],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 20,
    color: Colors.ink,
  },
  subtitle: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.muted,
    marginTop: 4,
    textAlign: 'center',
  },
  appleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.nearBlack,
    borderRadius: 12,
    paddingVertical: 13,
    marginBottom: 10,
  },
  appleButtonLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 13,
    color: '#fff',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.ink,
    borderRadius: 12,
    paddingVertical: 13,
    marginBottom: 6,
  },
  googleButtonLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 13,
    color: Colors.ink,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.tan,
  },
  dividerLabel: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.mutedLight,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 12,
    height: 46,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  fieldInput: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.ink,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 14,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: Colors.tan,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: Colors.coral,
    borderColor: Colors.coral,
  },
  termsText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.muted,
    lineHeight: 17,
  },
  termsLink: {
    fontFamily: Fonts.bodySemiBold,
    color: Colors.violet,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.errorBg,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  errorText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.errorText,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#DCF3EE',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  infoText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 11,
    color: '#0F6E56',
  },
  signUpButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.coral,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 6,
  },
  signUpButtonDisabled: {
    backgroundColor: Colors.mutedLight,
  },
  signUpButtonLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 13,
    color: '#fff',
  },
  signInRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 18,
  },
  signInText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.muted,
  },
  signInLink: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: Colors.coral,
  },
});
