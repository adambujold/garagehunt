import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
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

import { Chip } from '@/components/garagehunt/chip';
import { Colors, Fonts } from '@/constants/brand';
import { DEFAULT_MAP_REGION } from '@/constants/map';
import { useAuthSession } from '@/hooks/use-auth-session';
import { useCurrentLocation } from '@/hooks/use-current-location';
import { getErrorMessage } from '@/utils/get-error-message';
import { goBack } from '@/utils/navigation';
import { parseDisplayDate } from '@/utils/parse-sale-form-input';
import { createTownWideEvent } from '@/utils/town-wide-events';

// Radius presets rather than a free-number input — simpler, and keeps
// values sane without needing min/max validation (see 0014's header
// comment on why radius-from-a-point, not a drawn polygon, for MVP).
const RADIUS_PRESETS_KM = [0.5, 1, 2, 5];

export default function CreateEventScreen() {
  const { session } = useAuthSession();
  const { coords } = useCurrentLocation();
  const [name, setName] = useState('');
  const [radiusKm, setRadiusKm] = useState(1);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!session) {
      setSubmitError('You need to be signed in to create an event.');
      return;
    }
    if (!name.trim() || !startDate.trim() || !endDate.trim()) {
      setSubmitError('Please fill in every field before creating the event.');
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      const origin = coords ?? {
        latitude: DEFAULT_MAP_REGION.latitude,
        longitude: DEFAULT_MAP_REGION.longitude,
      };
      const startDateIso = parseDisplayDate(startDate);
      const endDateIso = parseDisplayDate(endDate);

      await createTownWideEvent({
        organizerId: session.user.id,
        name: name.trim(),
        centerLatitude: origin.latitude,
        centerLongitude: origin.longitude,
        radiusKm,
        startDate: startDateIso,
        endDate: endDateIso,
      });
      goBack();
    } catch (err) {
      console.error('Failed to create event', err);
      setSubmitError(getErrorMessage(err, 'Something went wrong creating your event.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.headerRow}>
        <Pressable style={styles.iconButton} onPress={() => goBack()}>
          <Ionicons name="chevron-back" size={18} color={Colors.ink} />
        </Pressable>
        <Text style={styles.title}>Create event</Text>
      </View>

      <KeyboardAvoidingView style={styles.flexFill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            style={styles.flexFill}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled">
            <Text style={styles.intro}>
              The event area is centered on your current location — buyers and sellers within the
              radius you pick can find and join it.
            </Text>

            <Text style={styles.fieldLabel}>Event name</Text>
            <View style={styles.field}>
              <Ionicons name="megaphone-outline" size={14} color={Colors.muted} />
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. Riverdale Community Garage Sale"
                placeholderTextColor={Colors.mutedLight}
                style={styles.fieldInput}
              />
            </View>

            <Text style={styles.fieldLabel}>Radius</Text>
            <View style={styles.chipRow}>
              {RADIUS_PRESETS_KM.map((preset) => (
                <Chip
                  key={preset}
                  label={`${preset}km`}
                  active={radiusKm === preset}
                  onPress={() => setRadiusKm(preset)}
                />
              ))}
            </View>

            <Text style={styles.fieldLabel}>Date range</Text>
            <View style={styles.fieldRow}>
              <View style={[styles.field, styles.fieldRowItem]}>
                <Ionicons name="calendar-outline" size={14} color={Colors.muted} />
                <TextInput
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholder="Sat, Jul 11"
                  placeholderTextColor={Colors.mutedLight}
                  style={styles.fieldInput}
                />
              </View>
              <View style={[styles.field, styles.fieldRowItem]}>
                <Ionicons name="calendar-outline" size={14} color={Colors.muted} />
                <TextInput
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholder="Sun, Jul 12"
                  placeholderTextColor={Colors.mutedLight}
                  style={styles.fieldInput}
                />
              </View>
            </View>
            <Text style={styles.fieldHint}>Single-day event? Use the same date for both.</Text>

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
                <Text style={styles.submitButtonLabel}>Create event</Text>
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
    marginTop: -6,
    marginBottom: 14,
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
  fieldRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  fieldRowItem: {
    flex: 1,
    marginBottom: 0,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
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
});
