import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
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
import { getErrorMessage } from '@/utils/get-error-message';
import { signInWithGoogle } from '@/utils/google-auth';
import { supabase } from '@/utils/supabase';

// Real Supabase email/password and Google auth. A successful sign-in updates
// the shared session (see hooks/use-auth-session.ts), which the root layout
// listens to and swaps into the tab bar automatically — no callback needed
// here either way. Apple is still a visual placeholder — Sign in with Apple
// needs an Apple Developer Program account, which isn't set up yet; wire it
// up alongside push notifications later, since both need one.
export function LoginScreen({ onNavigateToSignUp }: { onNavigateToSignUp: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setError(null);
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(getErrorMessage(err, 'Something went wrong signing in with Google.'));
    } finally {
      setGoogleLoading(false);
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

        {/* Non-functional until Sign in with Apple is wired up — see the
            header comment. */}
        <Pressable style={styles.appleButton}>
          <Ionicons name="logo-apple" size={16} color="#fff" />
          <Text style={styles.appleButtonLabel}>Continue with Apple</Text>
        </Pressable>

        <Pressable style={styles.googleButton} onPress={handleGoogleSignIn} disabled={googleLoading || loading}>
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
            <Ionicons name="warning-outline" size={13} color="#B3261E" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Pressable style={styles.signInButton} onPress={handleSignIn} disabled={loading || googleLoading}>
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
    backgroundColor: '#FDECEA',
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
  },
  errorText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 11,
    color: '#B3261E',
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
