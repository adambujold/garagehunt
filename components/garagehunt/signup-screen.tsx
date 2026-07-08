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
import { supabase } from '@/utils/supabase';

// Real Supabase email/password auth. display_name is stored in the auth
// user's metadata for now — syncing it into a dedicated `users` profile
// table (per the technical architecture doc) is a follow-up once that table
// exists. Apple/Google are visual placeholders only (see login-screen.tsx).
export function SignUpScreen({
  onNavigateToLogin,
}: {
  onNavigateToLogin: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleCreateAccount = async () => {
    setError(null);
    setInfoMessage(null);
    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: name } },
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

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flexFill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.logoMark}>
            <Ionicons name="location" size={13} color={Colors.ink} />
          </View>
          <Text style={styles.title}>Join GarageHunt</Text>
          <Text style={styles.subtitle}>Sign up to start discovering sales near you</Text>
        </View>

        <Pressable style={styles.appleButton}>
          <Ionicons name="logo-apple" size={16} color="#fff" />
          <Text style={styles.appleButtonLabel}>Continue with Apple</Text>
        </Pressable>

        <Pressable style={styles.googleButton}>
          <Ionicons name="logo-google" size={15} color={Colors.coral} />
          <Text style={styles.googleButtonLabel}>Continue with Google</Text>
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

        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={13} color="#B3261E" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {infoMessage && (
          <View style={styles.infoBanner}>
            <Ionicons name="mail-outline" size={13} color="#0F6E56" />
            <Text style={styles.infoText}>{infoMessage}</Text>
          </View>
        )}

        <Pressable style={styles.signUpButton} onPress={handleCreateAccount} disabled={loading}>
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
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FDECEA',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  errorText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 11,
    color: '#B3261E',
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
