import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
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
import { currentUserNeedsTermsAcceptance, recordTermsAcceptance } from '@/utils/terms-acceptance';

// Real Supabase email/password, Google, and Apple auth. A successful sign-in
// updates the shared session (see hooks/use-auth-session.ts), which the root
// layout listens to and swaps into the tab bar automatically — no callback
// needed here either way. Apple is iOS-only (see the Platform.OS gate below)
// — Apple's requirement to offer Sign in with Apple doesn't apply on
// Android, and expo-apple-authentication's native module has no Android
// equivalent.
export function LoginScreen({ onNavigateToSignUp }: { onNavigateToSignUp: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const anyLoading = loading || googleLoading || appleLoading;

  const handleSignIn = async () => {
    setError(null);
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
    }
  };

  // Unlike Sign Up, this screen has no Terms checkbox to gate on — but
  // Supabase's OAuth sign-in silently creates a new account if one doesn't
  // already exist, so "Continue with Google/Apple" here can be someone's
  // very first time, same as Sign Up. Anyone (new or pre-existing) who
  // hasn't recorded acceptance gets a required prompt before they're let
  // in; declining signs them back out rather than leaving an authenticated
  // session that never agreed to anything.
  const requireTermsAcceptance = async () => {
    const userId = await currentUserNeedsTermsAcceptance();
    if (!userId) return;
    await new Promise<void>((resolve) => {
      Alert.alert(
        'Terms of Service & Privacy Policy',
        'By continuing, you agree to our Terms of Service and Privacy Policy.',
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: async () => {
              await supabase.auth.signOut();
              setError('You need to agree to the Terms of Service and Privacy Policy to continue.');
              resolve();
            },
          },
          {
            text: 'Agree & Continue',
            onPress: async () => {
              await recordTermsAcceptance(userId);
              resolve();
            },
          },
        ],
        { cancelable: false }
      );
    });
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      await requireTermsAcceptance();
    } catch (err) {
      setError(getErrorMessage(err, 'Something went wrong signing in with Google.'));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setError(null);
    setAppleLoading(true);
    try {
      await signInWithApple();
      await requireTermsAcceptance();
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
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to find this weekend&apos;s best sales</Text>
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
          <Text style={styles.dividerLabel}>or continue with email</Text>
          <View style={styles.dividerLine} />
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
            textContentType="password"
            autoComplete="password"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.fieldInput}
          />
        </View>

        <Pressable style={styles.forgotPassword}>
          <Text style={styles.forgotPasswordLabel}>Forgot password?</Text>
        </Pressable>

        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={13} color={Colors.errorText} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Pressable style={styles.signInButton} onPress={handleSignIn} disabled={anyLoading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.signInButtonLabel}>Sign in</Text>
          )}
        </Pressable>

        <View style={styles.signUpRow}>
          <Text style={styles.signUpText}>Don&apos;t have an account? </Text>
          <Pressable onPress={onNavigateToSignUp}>
            <Text style={styles.signUpLink}>Sign up</Text>
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
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 16,
  },
  forgotPasswordLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    color: Colors.violet,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.errorBg,
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
  },
  errorText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.errorText,
  },
  signInButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.coral,
    borderRadius: 12,
    paddingVertical: 14,
  },
  signInButtonLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 13,
    color: '#fff',
  },
  signUpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 18,
  },
  signUpText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.muted,
  },
  signUpLink: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: Colors.coral,
  },
});
