import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
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

import { deriveDisplayName } from '@/app/(tabs)/profile';
import { Colors, Fonts } from '@/constants/brand';
import { useAuthSession } from '@/hooks/use-auth-session';
import { getErrorMessage } from '@/utils/get-error-message';
import {
  fetchLatestOrganizerApplication,
  OrganizerApplication,
  submitOrganizerApplication,
} from '@/utils/organizer-applications';

const STATUS_COPY: Record<OrganizerApplication['status'], { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string }> = {
  pending: {
    icon: 'time-outline',
    title: 'Application submitted',
    subtitle: "We'll review it soon and follow up by email.",
  },
  approved: {
    icon: 'shield-checkmark',
    title: "You're a verified organizer!",
    subtitle: 'You can now set up town-wide events for your neighborhood.',
  },
  denied: {
    icon: 'close-circle-outline',
    title: 'Application not approved',
    subtitle: 'You can submit a new application below.',
  },
};

export default function OrganizerApplicationScreen() {
  const { session } = useAuthSession();
  const [loading, setLoading] = useState(true);
  const [existingApplication, setExistingApplication] = useState<OrganizerApplication | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const [fullName, setFullName] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [affiliationNotes, setAffiliationNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      // Independent of the application fetch below — the prefill shouldn't
      // wait on (or be skipped by a failure in) an unrelated network call.
      setFullName((current) => current || deriveDisplayName(session));

      let cancelled = false;
      setLoading(true);
      fetchLatestOrganizerApplication(session.user.id)
        .then((application) => {
          if (cancelled) return;
          setExistingApplication(application);
          setLoading(false);
        })
        .catch((err) => {
          if (cancelled) return;
          console.error('Failed to load organizer application', err);
          setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [session])
  );

  const handleSubmit = async () => {
    if (!session) {
      setSubmitError('You need to be signed in to apply.');
      return;
    }
    if (!fullName.trim() || !neighborhood.trim() || !affiliationNotes.trim()) {
      setSubmitError('Please fill in every field before submitting.');
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      await submitOrganizerApplication({
        userId: session.user.id,
        fullName: fullName.trim(),
        neighborhood: neighborhood.trim(),
        affiliationNotes: affiliationNotes.trim(),
      });
      setJustSubmitted(true);
    } catch (err) {
      console.error('Failed to submit organizer application', err);
      setSubmitError(getErrorMessage(err, 'Something went wrong submitting your application.'));
    } finally {
      setSubmitting(false);
    }
  };

  const header = (
    <View style={styles.headerRow}>
      <Pressable style={styles.iconButton} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={18} color={Colors.ink} />
      </Pressable>
      <Text style={styles.title}>Become an organizer</Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {header}
        <View style={styles.stateBox}>
          <ActivityIndicator color={Colors.coral} />
        </View>
      </SafeAreaView>
    );
  }

  // Once submitted (this visit or a prior one), show status instead of the
  // form — 'denied' is the one status that still falls through to the form
  // below, since a denial doesn't block resubmission.
  const statusToShow: OrganizerApplication['status'] | null = justSubmitted
    ? 'pending'
    : existingApplication && existingApplication.status !== 'denied'
      ? existingApplication.status
      : null;

  if (statusToShow) {
    const copy = STATUS_COPY[statusToShow];
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {header}
        <View style={styles.successBody}>
          <View style={styles.successIcon}>
            <Ionicons name={copy.icon} size={30} color="#fff" />
          </View>
          <Text style={styles.successTitle}>{copy.title}</Text>
          <Text style={styles.successSubtitle}>{copy.subtitle}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {header}
      <KeyboardAvoidingView style={styles.flexFill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            style={styles.flexFill}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled">
            <Text style={styles.intro}>
              Organizers can set up town-wide events that group nearby sales together. Applications
              are reviewed manually — tell us a bit about who you are and the neighborhood you'd
              represent.
            </Text>

            {existingApplication?.status === 'denied' && (
              <View style={styles.warningBanner}>
                <Ionicons name="information-circle-outline" size={13} color={Colors.amberText} />
                <Text style={styles.warningBannerText}>
                  Your previous application wasn't approved. You're welcome to apply again below.
                </Text>
              </View>
            )}

            <Text style={styles.fieldLabel}>Full name</Text>
            <View style={styles.field}>
              <Ionicons name="person-outline" size={14} color={Colors.muted} />
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder="Your full name"
                placeholderTextColor={Colors.mutedLight}
                style={styles.fieldInput}
              />
            </View>

            <Text style={styles.fieldLabel}>Neighborhood</Text>
            <View style={styles.field}>
              <Ionicons name="location-outline" size={14} color={Colors.muted} />
              <TextInput
                value={neighborhood}
                onChangeText={setNeighborhood}
                placeholder="e.g. Riverdale, Old East Village"
                placeholderTextColor={Colors.mutedLight}
                style={styles.fieldInput}
              />
            </View>

            <Text style={styles.fieldLabel}>Affiliation</Text>
            <Text style={styles.fieldHint}>
              A formal affiliation (resident association, BIA) or informal vouching (neighbor names,
              a link to an existing community group) — either is fine.
            </Text>
            <TextInput
              value={affiliationNotes}
              onChangeText={setAffiliationNotes}
              placeholder="Tell us about your connection to the neighborhood..."
              placeholderTextColor={Colors.mutedLight}
              style={styles.affiliationInput}
              multiline
            />

            {submitError && (
              <View style={styles.warningBanner}>
                <Ionicons name="warning-outline" size={13} color={Colors.amberText} />
                <Text style={styles.warningBannerText}>{submitError}</Text>
              </View>
            )}

            <Pressable style={styles.submitButton} onPress={handleSubmit} disabled={submitting}>
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonLabel}>Submit application</Text>
              )}
            </Pressable>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 16,
    color: Colors.ink,
  },
  stateBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 220,
  },
  intro: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.mutedDark,
    lineHeight: 18,
    marginBottom: 18,
  },
  fieldLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: Colors.mutedDark,
    marginBottom: 6,
  },
  fieldHint: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.muted,
    lineHeight: 16,
    marginTop: -2,
    marginBottom: 8,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 12,
    height: 44,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  fieldInput: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.ink,
  },
  affiliationInput: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 12,
    padding: 12,
    minHeight: 100,
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.ink,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  warningBanner: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: Colors.amberBg,
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
  },
  warningBannerText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.amberText,
    lineHeight: 16,
  },
  submitButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.coral,
    borderRadius: 12,
    paddingVertical: 14,
  },
  submitButtonLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 13,
    color: '#fff',
  },
  successBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.violet,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successTitle: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 19,
    color: Colors.ink,
    marginBottom: 6,
    textAlign: 'center',
  },
  successSubtitle: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.muted,
    textAlign: 'center',
  },
});
