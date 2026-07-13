import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { OtherCategoryField } from '@/components/garagehunt/other-category-field';
import { ToggleSwitch } from '@/components/garagehunt/toggle-switch';
import { Colors, Fonts } from '@/constants/brand';
import { CATEGORIES } from '@/constants/categories';
import { DEFAULT_MAP_REGION } from '@/constants/map';
import { useAuthSession } from '@/hooks/use-auth-session';
import { useCurrentLocation } from '@/hooks/use-current-location';
import { getErrorMessage } from '@/utils/get-error-message';
import { backfillMatchesForSavedSearch } from '@/utils/matches';
import { formatDisplayDate, parseDisplayDate } from '@/utils/parse-sale-form-input';
import { fetchMySavedSearch, saveSavedSearch } from '@/utils/saved-searches';

const RADII_KM = [5, 10, 20, 50];

export default function LookingForScreen() {
  const { session } = useAuthSession();
  const { coords } = useCurrentLocation();

  // Fetched once on mount, not via useFocusEffect — this is a form with
  // its own in-progress draft state, so refetching every time the tab
  // regains focus would clobber whatever the user's currently typing
  // (same reasoning as List a Sale, which also only loads/init once).
  const [initializing, setInitializing] = useState(true);
  const [savedSearchId, setSavedSearchId] = useState<string | null>(null);

  const [keyword, setKeyword] = useState('');
  const [activeCategories, setActiveCategories] = useState<string[]>(['Furniture']);
  // Each bubble pushes into the same saved_searches.keywords array the main
  // keyword field feeds — a second entry point, not a separate field.
  const [otherKeywordItems, setOtherKeywordItems] = useState<string[]>([]);
  const [radiusKm, setRadiusKm] = useState(10);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notifyEnabled, setNotifyEnabled] = useState(true);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    fetchMySavedSearch(session.user.id)
      .then((existing) => {
        if (cancelled) return;
        if (existing) {
          setSavedSearchId(existing.id);
          setActiveCategories(existing.categoryNames);
          // All existing keywords are redisplayed as bubbles rather than
          // trying to guess which ones originally came from the main text
          // field vs. the "Other" entry point — both feed the same array,
          // so there's no distinction to preserve.
          setOtherKeywordItems(existing.keywords);
          setRadiusKm(existing.radiusKm);
          setNotifyEnabled(existing.notifyEnabled);
          setStartDate(existing.dateFrom ? formatDisplayDate(existing.dateFrom) : '');
          setEndDate(existing.dateTo ? formatDisplayDate(existing.dateTo) : '');
        }
      })
      .catch((err) => console.error('Failed to load saved search', err))
      .finally(() => {
        if (!cancelled) setInitializing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  const toggleCategory = (category: string) => {
    setActiveCategories((current) => {
      const isActive = current.includes(category);
      if (isActive && category === 'Other') {
        setOtherKeywordItems([]);
      }
      return isActive ? current.filter((c) => c !== category) : [...current, category];
    });
    setSaveError(null);
  };

  const addOtherKeyword = (item: string) => {
    setOtherKeywordItems((current) => [...current, item]);
    setSaveError(null);
  };

  const removeOtherKeyword = (index: number) => {
    setOtherKeywordItems((current) => current.filter((_, i) => i !== index));
    setSaveError(null);
  };

  const mainKeywords = keyword
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  const handleSave = async () => {
    if (!session) {
      setSaveError('You need to be signed in to save a search.');
      return;
    }
    // Dismissed here, not left implicit — this screen (unlike every other
    // form in the app) navigates straight to a different screen right after
    // an async save instead of showing an in-place success state. Giving the
    // keyboard the full save round-trip to dismiss, rather than letting it
    // still be mid-dismissal at the exact instant router.push fires, is a
    // real-device crash fix (confirmed via crash log: an uncaught native
    // exception on the TurboModule dispatch queue, happening on every save
    // regardless of how much data comes back — not a data-scale issue).
    Keyboard.dismiss();
    setSaveError(null);
    setSaving(true);
    try {
      const dateFrom = startDate.trim() ? parseDisplayDate(startDate.trim()) : null;
      const dateTo = endDate.trim() ? parseDisplayDate(endDate.trim()) : null;
      const origin = coords ?? {
        latitude: DEFAULT_MAP_REGION.latitude,
        longitude: DEFAULT_MAP_REGION.longitude,
      };

      const keywords = [...mainKeywords, ...otherKeywordItems];
      const { id, categoryIds } = await saveSavedSearch({
        id: savedSearchId ?? undefined,
        userId: session.user.id,
        keywords,
        categoryNames: activeCategories,
        centerLatitude: origin.latitude,
        centerLongitude: origin.longitude,
        radiusKm,
        dateFrom,
        dateTo,
        notifyEnabled,
      });
      setSavedSearchId(id);
      try {
        // Picks up listings that were already published before this search
        // existed/changed — see utils/matches.ts's header comment on why
        // this doesn't happen automatically otherwise.
        await backfillMatchesForSavedSearch({ searchId: id, keywords, categoryIds });
      } catch (err) {
        // Same reasoning as computeAndInsertMatches's own callers — a
        // side effect of saving, not the save itself, so it shouldn't block
        // navigating to the (possibly still-accurate) matches screen.
        console.error('Failed to backfill matches for saved search', err);
      }
      router.push('/matches-for-you');
    } catch (err) {
      console.error('Failed to save search', err);
      setSaveError(getErrorMessage(err, 'Something went wrong saving your search.'));
    } finally {
      setSaving(false);
    }
  };

  if (initializing) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.stateBox}>
          <ActivityIndicator color={Colors.coral} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <KeyboardAvoidingView style={styles.flexFill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>I&apos;m looking for</Text>

        <Text style={styles.fieldLabel}>What are you after?</Text>
        <View style={styles.field}>
          <Ionicons name="search" size={14} color={Colors.muted} />
          <TextInput
            value={keyword}
            onChangeText={(text) => {
              setKeyword(text);
              setSaveError(null);
            }}
            placeholder="kids bike, dining table..."
            placeholderTextColor={Colors.mutedLight}
            style={styles.fieldInput}
          />
        </View>

        <Text style={styles.fieldLabel}>Or match by category</Text>
        <View style={styles.chipRow}>
          {CATEGORIES.map((category) => (
            <Chip
              key={category}
              label={category}
              active={activeCategories.includes(category)}
              onPress={() => toggleCategory(category)}
            />
          ))}
        </View>

        {activeCategories.includes('Other') && (
          <OtherCategoryField
            label="What else are you looking for?"
            placeholder="Type and press return..."
            items={otherKeywordItems}
            onAddItem={addOtherKeyword}
            onRemoveItem={removeOtherKeyword}
          />
        )}

        <Text style={styles.fieldLabel}>Area &amp; radius</Text>
        <View style={styles.field}>
          <Ionicons name="location-outline" size={14} color={Colors.muted} />
          <Text style={styles.fieldText}>London, ON &middot; {radiusKm}km</Text>
        </View>
        <View style={styles.chipRow}>
          {RADII_KM.map((km) => (
            <Chip
              key={km}
              label={`${km}km`}
              active={radiusKm === km}
              onPress={() => {
                setRadiusKm(km);
                setSaveError(null);
              }}
            />
          ))}
        </View>

        <Text style={styles.fieldLabel}>Date range (optional)</Text>
        <View style={styles.fieldRow}>
          <View style={[styles.field, styles.fieldRowItem]}>
            <Ionicons name="calendar-outline" size={14} color={Colors.muted} />
            <TextInput
              value={startDate}
              onChangeText={(text) => {
                setStartDate(text);
                setSaveError(null);
              }}
              placeholder="Any date"
              placeholderTextColor={Colors.mutedLight}
              style={styles.fieldInput}
            />
          </View>
          <View style={[styles.field, styles.fieldRowItem]}>
            <Ionicons name="calendar-outline" size={14} color={Colors.muted} />
            <TextInput
              value={endDate}
              onChangeText={(text) => {
                setEndDate(text);
                setSaveError(null);
              }}
              placeholder="Any date"
              placeholderTextColor={Colors.mutedLight}
              style={styles.fieldInput}
            />
          </View>
        </View>
        <Text style={styles.fieldHint}>Leave blank to match sales on any date.</Text>

        <View style={styles.toggleRow}>
          <View style={styles.toggleTextGroup}>
            <Text style={styles.toggleLabel}>Notify me</Text>
            <Text style={styles.toggleDescription}>Push alert on new match</Text>
          </View>
          <ToggleSwitch
            value={notifyEnabled}
            onValueChange={(next) => {
              setNotifyEnabled(next);
              setSaveError(null);
            }}
          />
        </View>

        {saveError && (
          <View style={styles.warningBanner}>
            <Ionicons name="warning-outline" size={13} color={Colors.amberText} />
            <Text style={styles.warningBannerText}>{saveError}</Text>
          </View>
        )}

        <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="locate" size={14} color="#fff" />
              <Text style={styles.saveButtonLabel}>Save &amp; find matches</Text>
            </>
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
  stateBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  title: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 20,
    color: Colors.ink,
    paddingTop: 8,
    marginBottom: 18,
  },
  fieldLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: Colors.mutedDark,
    marginBottom: 6,
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
  fieldText: {
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
  fieldHint: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.muted,
    marginTop: -6,
    marginBottom: 14,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.amberBg,
    borderRadius: 14,
    padding: 14,
    marginBottom: 18,
  },
  toggleTextGroup: {
    flex: 1,
    marginRight: 12,
  },
  toggleLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 13,
    color: Colors.ink,
  },
  toggleDescription: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.amberText,
    marginTop: 2,
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
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.coral,
    borderRadius: 12,
    paddingVertical: 14,
  },
  saveButtonLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 13,
    color: '#fff',
  },
});
