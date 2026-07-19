import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddressPreviewMap } from '@/components/garagehunt/address-preview-map';
import { AiSuggestionModal } from '@/components/garagehunt/ai-suggestion-modal';
import { Chip } from '@/components/garagehunt/chip';
import { DatePickerField } from '@/components/garagehunt/date-picker-field';
import { OtherCategoryField } from '@/components/garagehunt/other-category-field';
import { PaymentMethodToggle } from '@/components/garagehunt/payment-method-toggle';
import { PhotoSourceSheet } from '@/components/garagehunt/photo-source-sheet';
import { PaymentMethod } from '@/components/garagehunt/sale-card';
import { ToggleSwitch } from '@/components/garagehunt/toggle-switch';
import { Colors, Fonts } from '@/constants/brand';
import { CATEGORIES } from '@/constants/categories';
import { DEFAULT_MAP_REGION } from '@/constants/map';
import { useAuthSession } from '@/hooks/use-auth-session';
import { Coordinates, useCurrentLocation } from '@/hooks/use-current-location';
import { buildSaleDeepLink } from '@/utils/deep-links';
import { getErrorMessage } from '@/utils/get-error-message';
import { MAX_LISTING_PHOTOS, uploadListingPhoto } from '@/utils/listing-photos';
import {
  AddressSuggestion,
  createSearchSessionToken,
  retrieveAddress,
  suggestAddresses,
} from '@/utils/mapbox-address-search';
import { geocodeAddress } from '@/utils/mapbox-geocoding';
import { formatDisplayDate, parseDisplayTimeRange } from '@/utils/parse-sale-form-input';
import { pickListingPhoto, takeListingPhoto } from '@/utils/pick-listing-photo';
import { createSaleListing, publishSaleListing } from '@/utils/sale-listings';
import {
  fetchEventParticipantCount,
  findNearbyEvent,
  submitEventJoinRequest,
  TownWideEvent,
} from '@/utils/town-wide-events';

const TOTAL_STEPS = 4;

type JoinEventStatus = 'undecided' | 'requested' | 'declined';

export default function ListSaleScreen() {
  const { session } = useAuthSession();
  const { coords } = useCurrentLocation();
  const [step, setStep] = useState(1);
  const [published, setPublished] = useState(false);
  const [publishedListingId, setPublishedListingId] = useState<string | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const [address, setAddress] = useState('');
  // Set only when the seller picks a suggestion from the autocomplete
  // dropdown — lets publish/save-draft skip a redundant geocode call for the
  // exact address Mapbox already resolved. Cleared on any further typing
  // (see handleAddressChange) since the address text no longer necessarily
  // matches these coordinates once edited.
  const [selectedCoords, setSelectedCoords] = useState<Coordinates | null>(null);
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressSuggestionsLoading, setAddressSuggestionsLoading] = useState(false);
  const [isAddressFocused, setIsAddressFocused] = useState(false);
  // A fresh token per typing session (new query after a prior selection),
  // not per keystroke — see createSearchSessionToken's header comment.
  const searchSessionTokenRef = useRef(createSearchSessionToken());
  // Delays hiding the dropdown on blur just long enough for a suggestion's
  // onPress to register first — otherwise the dropdown unmounts (since it's
  // gated on isAddressFocused) before the tap completes, and the press is
  // lost. keyboardShouldPersistTaps="handled" on the ScrollView below
  // doesn't cover this specific TextInput-blur-vs-Pressable-tap race.
  const addressBlurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirrors sale_listings.start_date/end_date — equal values represent a
  // single-day sale, per the feature spec (Section 3, step 3). ISO
  // "YYYY-MM-DD" strings, same as the DB column, or "" for genuinely
  // unselected — no default date pre-filled (a real bug fixed here: this
  // used to default to a hardcoded, silently-stale date).
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [time, setTime] = useState('9am–2pm');
  const [showExactAddress, setShowExactAddress] = useState(false);

  // Local URIs only — the listing doesn't exist in the DB yet at this point
  // in the wizard, so actual Storage upload + listing_photos rows happen at
  // publish/save-draft time once a real listing id exists (see
  // uploadPendingPhotos below). Edit Listing, by contrast, already has a
  // real id and uploads immediately on pick.
  const [photos, setPhotos] = useState<string[]>([]);
  const [pickingPhoto, setPickingPhoto] = useState(false);
  const [photoSourceSheetVisible, setPhotoSourceSheetVisible] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>(['Furniture']);
  const [title, setTitle] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash_only');
  const [description, setDescription] = useState('');
  // Mirrors sale_listings.other_items — a discrete tag list, not appended
  // into description, per the technical architecture doc.
  const [otherItems, setOtherItems] = useState<string[]>([]);
  const [aiModalVisible, setAiModalVisible] = useState(false);

  const [joinEventStatus, setJoinEventStatus] = useState<JoinEventStatus>('undecided');
  // undefined = hasn't checked yet (or still checking), null = checked and
  // found nothing nearby — distinct from "haven't looked" so step 3 can
  // show a loading state vs. the real "no matching event" state.
  const [matchedEvent, setMatchedEvent] = useState<TownWideEvent | null | undefined>(undefined);
  const [matchedEventParticipantCount, setMatchedEventParticipantCount] = useState(0);

  // Checks for a real nearby town-wide event once the seller reaches step
  // 3, using whatever address/dates they already entered in step 1 — the
  // listing doesn't exist yet at this point (see uploadPendingPhotos'
  // comment for the same deferred-until-a-real-id pattern), so this can
  // only match against the event's location/dates, not a listing id.
  useEffect(() => {
    if (step !== 3) return;
    let cancelled = false;
    setMatchedEvent(undefined);

    if (!startDate || !endDate) {
      setMatchedEvent(null);
      return;
    }

    const origin = coords ?? {
      latitude: DEFAULT_MAP_REGION.latitude,
      longitude: DEFAULT_MAP_REGION.longitude,
    };

    findNearbyEvent({ latitude: origin.latitude, longitude: origin.longitude, startDate, endDate })
      .then((event) => {
        if (cancelled) return;
        setMatchedEvent(event);
        if (event) {
          return fetchEventParticipantCount(event.id).then((count) => {
            if (!cancelled) setMatchedEventParticipantCount(count);
          });
        }
      })
      .catch((err) => {
        console.error('Failed to check for nearby town-wide events', err);
        if (!cancelled) setMatchedEvent(null);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Live address autocomplete — debounced so every keystroke doesn't fire
  // its own request. Only searches while the field is actually focused, so
  // programmatic address changes elsewhere (resetForm, selecting a
  // suggestion) don't trigger a pointless extra lookup.
  useEffect(() => {
    if (!isAddressFocused) return;
    const trimmed = address.trim();
    if (trimmed.length < 3) {
      setAddressSuggestions([]);
      setAddressSuggestionsLoading(false);
      return;
    }
    setAddressSuggestionsLoading(true);
    const timeout = setTimeout(() => {
      suggestAddresses(trimmed, searchSessionTokenRef.current, coords ?? undefined)
        .then(setAddressSuggestions)
        .catch((err) => {
          console.error('Failed to fetch address suggestions', err);
          setAddressSuggestions([]);
        })
        .finally(() => setAddressSuggestionsLoading(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [address, isAddressFocused, coords]);

  const handleAddressChange = (text: string) => {
    setAddress(text);
    setSelectedCoords(null);
  };

  const handleAddressFocus = () => {
    if (addressBlurTimeoutRef.current) clearTimeout(addressBlurTimeoutRef.current);
    setIsAddressFocused(true);
  };

  const handleAddressBlur = () => {
    addressBlurTimeoutRef.current = setTimeout(() => setIsAddressFocused(false), 150);
  };

  const handleSelectAddressSuggestion = async (suggestion: AddressSuggestion) => {
    setIsAddressFocused(false);
    setAddressSuggestions([]);
    Keyboard.dismiss();
    try {
      const result = await retrieveAddress(suggestion.id, searchSessionTokenRef.current);
      setAddress(result.address);
      setSelectedCoords(result.coordinates);
    } catch (err) {
      // Falls back to whatever text is already in the field — publish/save
      // still geocode it the normal way, so this isn't fatal to the flow.
      console.error('Failed to retrieve selected address', err);
    } finally {
      // Selecting an address ends this typing session per Mapbox's session
      // model — the next query starts a new one.
      searchSessionTokenRef.current = createSearchSessionToken();
    }
  };

  const toggleCategory = (category: string) => {
    setCategories((current) => {
      const isActive = current.includes(category);
      if (isActive && category === 'Other') {
        setOtherItems([]);
      }
      return isActive ? current.filter((c) => c !== category) : [...current, category];
    });
  };

  const addOtherItem = (item: string) => {
    setOtherItems((current) => [...current, item]);
  };

  const removeOtherItem = (index: number) => {
    setOtherItems((current) => current.filter((_, i) => i !== index));
  };

  const handleAddPhoto = () => {
    if (photos.length >= MAX_LISTING_PHOTOS || pickingPhoto) return;
    setPhotoError(null);
    setPhotoSourceSheetVisible(true);
  };

  const runPhotoPicker = async (picker: () => Promise<string | null>) => {
    setPhotoSourceSheetVisible(false);
    // Presenting the native camera/library picker in the same tick as
    // closing this Modal races its close animation on iOS — the picker can
    // silently fail to appear (the promise never resolves, leaving the
    // loading spinner stuck forever). Waiting for the close animation to
    // finish first avoids it.
    await new Promise((resolve) => setTimeout(resolve, 500));
    setPickingPhoto(true);
    try {
      const uri = await picker();
      if (uri) setPhotos((current) => [...current, uri]);
    } catch (err) {
      console.error('Failed to pick a photo', err);
      setPhotoError(getErrorMessage(err, 'Could not access your photos.'));
    } finally {
      setPickingPhoto(false);
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((current) => current.filter((_, i) => i !== index));
  };

  // Uploads whatever's in `photos` (local URIs) to a listing that now has a
  // real id, in picked order. Runs after the listing row itself is created,
  // for both Publish and Save-draft.
  const uploadPendingPhotos = async (listingId: string) => {
    for (let i = 0; i < photos.length; i++) {
      await uploadListingPhoto(listingId, photos[i], i);
    }
  };

  // Same deferred-until-a-real-id pattern as uploadPendingPhotos — the join
  // request needs a real listing_id, which only exists once the listing
  // itself has been created.
  const submitPendingEventJoinRequest = async (listingId: string, sellerId: string) => {
    if (joinEventStatus !== 'requested' || !matchedEvent) return;
    await submitEventJoinRequest({ eventId: matchedEvent.id, listingId, sellerId });
  };

  const resetForm = () => {
    setStep(1);
    setPublished(false);
    setPublishedListingId(null);
    setDraftSaved(false);
    setPublishError(null);
    setAddress('');
    setSelectedCoords(null);
    setStartDate('Sat, Jul 11');
    setEndDate('Sat, Jul 11');
    setTime('9am–2pm');
    setShowExactAddress(false);
    setPhotos([]);
    setPhotoError(null);
    setCategories(['Furniture']);
    setTitle('');
    setDescription('');
    setOtherItems([]);
    setJoinEventStatus('undecided');
    setMatchedEvent(undefined);
    setMatchedEventParticipantCount(0);
  };

  const handlePublish = async () => {
    if (!session) {
      setPublishError('You need to be signed in to publish a sale.');
      return;
    }
    setPublishError(null);
    setPublishing(true);
    try {
      const startDateIso = startDate;
      const endDateIso = endDate;
      const { startTime, endTime } = parseDisplayTimeRange(time);
      // A live public listing needs its real address geocoded, not the
      // seller's live GPS position — those only coincide if the seller
      // happens to be standing at the sale address when they hit Publish.
      // Left to throw and block publish on failure (rather than falling
      // back to device GPS) since a wrong-location live listing is worse
      // than being asked to fix the address first. Skipped entirely when
      // the seller picked a suggestion from the autocomplete dropdown —
      // Mapbox already resolved exact coordinates for that address at
      // selection time, so re-geocoding the same text would just be a
      // redundant network call for the same result.
      const geocoded = selectedCoords ?? (await geocodeAddress(address, coords ?? undefined));

      // Always created as a draft first — publishSaleListing below is the
      // only path allowed to flip it to published, since photos need to
      // already be uploaded and classified before that moderation gate can
      // evaluate them (feature spec Section 9).
      const { id: listingId, categoryIds } = await createSaleListing({
        sellerId: session.user.id,
        latitude: geocoded.latitude,
        longitude: geocoded.longitude,
        addressText: address,
        immediateRevealOptIn: showExactAddress,
        startDate: startDateIso,
        endDate: endDateIso,
        dailyStartTime: startTime,
        dailyEndTime: endTime,
        title,
        paymentMethod,
        description,
        otherItems,
        categoryNames: categories,
      });
      await uploadPendingPhotos(listingId);
      // If this throws (a photo's still pending review, or the description
      // got flagged/rejected), the listing stays saved as a draft — the
      // error banner below surfaces exactly why, and My Listings already
      // shows drafts with a "Finish listing" prompt either way.
      await publishSaleListing({ id: listingId, description });
      try {
        await submitPendingEventJoinRequest(listingId, session.user.id);
      } catch (err) {
        // Same reasoning as computeAndInsertMatches — a side effect of
        // publishing, not core listing data, so it shouldn't fail the
        // publish itself.
        console.error('Failed to submit event join request', err);
      }

      setPublishedListingId(listingId);
      setPublished(true);
    } catch (err) {
      console.error('Failed to publish sale', err);
      setPublishError(getErrorMessage(err, 'Something went wrong publishing your sale.'));
    } finally {
      setPublishing(false);
    }
  };

  // A draft doesn't need every field filled in yet — but sale_listings still
  // has NOT NULL date/time columns, so this reuses whatever's currently in
  // the form (including the untouched defaults) rather than requiring the
  // user to reach the review step first.
  const handleSaveDraft = async () => {
    if (!session) {
      setPublishError('You need to be signed in to save a draft.');
      return;
    }
    setPublishError(null);
    setSavingDraft(true);
    try {
      const startDateIso = startDate;
      const endDateIso = endDate;
      const { startTime, endTime } = parseDisplayTimeRange(time);
      const origin = coords ?? {
        latitude: DEFAULT_MAP_REGION.latitude,
        longitude: DEFAULT_MAP_REGION.longitude,
      };
      // Best-effort geocode for a draft — unlike Publish, this shouldn't
      // block saving over an address the seller hasn't finished typing yet
      // (drafts are private WIP, never shown to buyers), so a failed geocode
      // just falls back to device GPS for now rather than throwing; the real
      // address gets properly geocoded once they publish for real. Same
      // autocomplete-selection skip as handlePublish above.
      const geocoded = selectedCoords ?? (await geocodeAddress(address, coords ?? undefined).catch(() => origin));

      const { id: listingId } = await createSaleListing({
        sellerId: session.user.id,
        latitude: geocoded.latitude,
        longitude: geocoded.longitude,
        addressText: address,
        immediateRevealOptIn: showExactAddress,
        startDate: startDateIso,
        endDate: endDateIso,
        dailyStartTime: startTime,
        dailyEndTime: endTime,
        title,
        paymentMethod,
        description,
        otherItems,
        categoryNames: categories,
      });
      await uploadPendingPhotos(listingId);
      try {
        await submitPendingEventJoinRequest(listingId, session.user.id);
      } catch (err) {
        console.error('Failed to submit event join request', err);
      }

      setDraftSaved(true);
    } catch (err) {
      console.error('Failed to save draft', err);
      setPublishError(getErrorMessage(err, 'Something went wrong saving your draft.'));
    } finally {
      setSavingDraft(false);
    }
  };

  const handleContinue = () => {
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
    } else {
      handlePublish();
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const dateRangeLabel = !startDate
    ? ''
    : startDate === endDate
      ? formatDisplayDate(startDate)
      : `${formatDisplayDate(startDate)} – ${formatDisplayDate(endDate)}`;

  const handleShareSale = async () => {
    if (!publishedListingId) return;
    try {
      await Share.share({
        message: `${title || 'My garage sale'}\n${dateRangeLabel} · ${time}\n\nCheck it out on GarageHunt: ${buildSaleDeepLink(publishedListingId)}`,
      });
    } catch (err) {
      console.error('Failed to open share sheet', err);
    }
  };

  if (published) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.successBody}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={30} color="#fff" />
          </View>
          <Text style={styles.successTitle}>Your sale is live!</Text>
          <Text style={styles.successSubtitle}>
            {address} &middot; {dateRangeLabel} &middot; {time}
          </Text>
          <Pressable style={styles.shareButton} onPress={handleShareSale}>
            <Ionicons name="share-outline" size={14} color={Colors.mutedDark} />
            <Text style={styles.shareButtonLabel}>Share to social</Text>
          </Pressable>
          <Pressable
            style={styles.doneButton}
            onPress={() => {
              resetForm();
              router.replace('/');
            }}>
            <Text style={styles.doneButtonLabel}>Done</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (draftSaved) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.successBody}>
          <View style={[styles.successIcon, styles.draftSuccessIcon]}>
            <Ionicons name="document-text-outline" size={28} color="#fff" />
          </View>
          <Text style={styles.successTitle}>Saved as draft</Text>
          <Text style={styles.successSubtitle}>
            Finish it up anytime from My Listings — it won&apos;t show on Discover until you publish.
          </Text>
          <Pressable
            style={styles.doneButton}
            onPress={() => {
              resetForm();
              // push, not replace — replace wiped this screen out of the
              // history, so My Listings' back button had nowhere to go and
              // crashed with "GO_BACK was not handled by any navigator".
              router.push('/my-listings');
            }}>
            <Text style={styles.doneButtonLabel}>Go to My Listings</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>List a sale</Text>
      </View>

      <View style={styles.progressRow}>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <View key={i} style={[styles.progressDot, i < step && styles.progressDotOn]} />
        ))}
      </View>

      <KeyboardAvoidingView style={styles.flexFill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <ScrollView
        style={styles.flexFill}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        {step === 1 && (
          <>
            <Text style={styles.fieldLabel}>Address</Text>
            <View style={styles.field}>
              <Ionicons name="location-outline" size={14} color={Colors.muted} />
              <TextInput
                value={address}
                onChangeText={handleAddressChange}
                onFocus={handleAddressFocus}
                onBlur={handleAddressBlur}
                style={styles.fieldInput}
                placeholder="Street address"
                placeholderTextColor={Colors.mutedLight}
              />
              {selectedCoords && (
                <Ionicons name="checkmark-circle" size={16} color={Colors.jade} />
              )}
            </View>

            {isAddressFocused && address.trim().length >= 3 && (
              <View style={styles.suggestionsBox}>
                {addressSuggestionsLoading ? (
                  <View style={styles.suggestionRow}>
                    <ActivityIndicator size="small" color={Colors.muted} />
                  </View>
                ) : addressSuggestions.length > 0 ? (
                  addressSuggestions.map((item) => (
                    <Pressable
                      key={item.id}
                      style={styles.suggestionRow}
                      onPress={() => handleSelectAddressSuggestion(item)}>
                      <Ionicons name="location-outline" size={13} color={Colors.muted} />
                      <Text style={styles.suggestionText} numberOfLines={1}>
                        {item.label}
                      </Text>
                    </Pressable>
                  ))
                ) : (
                  <View style={styles.suggestionRow}>
                    <Text style={styles.suggestionEmptyText}>
                      No matching addresses — you can still type it in manually.
                    </Text>
                  </View>
                )}
              </View>
            )}

            <AddressPreviewMap coordinates={selectedCoords ?? coords} />

            <Text style={styles.fieldLabel}>Date range</Text>
            <View style={styles.fieldRow}>
              <DatePickerField
                value={startDate}
                onChange={(iso) => {
                  setStartDate(iso);
                  // Keep a same-day sale in sync, and never leave the end
                  // date sitting before a newly-picked later start date.
                  if (!endDate || endDate < iso) setEndDate(iso);
                }}
                style={[styles.field, styles.fieldRowItem]}
              />
              <DatePickerField
                value={endDate}
                onChange={setEndDate}
                minimumDateIso={startDate || undefined}
                style={[styles.field, styles.fieldRowItem]}
              />
            </View>
            <Text style={styles.fieldHint}>
              Single-day sale? Leave the end date the same as the start date.
            </Text>

            <Text style={styles.fieldLabel}>Daily time window</Text>
            <View style={styles.field}>
              <Ionicons name="time-outline" size={14} color={Colors.muted} />
              <TextInput value={time} onChangeText={setTime} style={styles.fieldInput} />
            </View>

            <View style={styles.toggleRow}>
              <View style={styles.toggleTextGroup}>
                <Text style={styles.toggleLabel}>Show exact address now</Text>
                <Text style={styles.toggleDescription}>Off by default</Text>
              </View>
              <ToggleSwitch value={showExactAddress} onValueChange={setShowExactAddress} />
            </View>

            {showExactAddress && (
              <View style={styles.warningBanner}>
                <Ionicons name="warning-outline" size={13} color={Colors.amberText} />
                <Text style={styles.warningBannerText}>
                  Your exact address will be visible to all app users immediately. We recommend
                  waiting until the day of your sale for privacy and safety.
                </Text>
              </View>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.fieldLabel}>
              Photos ({photos.length}/{MAX_LISTING_PHOTOS})
            </Text>
            <View style={styles.photoGrid}>
              {photos.map((uri, index) => (
                <View key={uri} style={styles.photoSlot}>
                  <Image source={{ uri }} style={styles.photoImage} resizeMode="cover" />
                  <Pressable style={styles.photoRemoveButton} onPress={() => handleRemovePhoto(index)} hitSlop={6}>
                    <Ionicons name="close" size={12} color="#fff" />
                  </Pressable>
                </View>
              ))}
              {photos.length < MAX_LISTING_PHOTOS && (
                <Pressable
                  style={[styles.photoSlot, styles.photoSlotEmpty]}
                  onPress={handleAddPhoto}
                  disabled={pickingPhoto}>
                  {pickingPhoto ? (
                    <ActivityIndicator size="small" color={Colors.mutedLight} />
                  ) : (
                    <Ionicons name="camera-outline" size={18} color={Colors.mutedLight} />
                  )}
                </Pressable>
              )}
            </View>
            {photoError && (
              <View style={styles.warningBanner}>
                <Ionicons name="warning-outline" size={13} color={Colors.amberText} />
                <Text style={styles.warningBannerText}>{photoError}</Text>
              </View>
            )}

            <Text style={styles.fieldLabel}>Categories</Text>
            <View style={styles.chipRow}>
              {CATEGORIES.map((category) => (
                <Chip
                  key={category}
                  label={category}
                  active={categories.includes(category)}
                  onPress={() => toggleCategory(category)}
                />
              ))}
            </View>

            {categories.includes('Other') && (
              <OtherCategoryField
                label="What else are you bringing?"
                placeholder="Type and press return..."
                items={otherItems}
                onAddItem={addOtherItem}
                onRemoveItem={removeOtherItem}
              />
            )}

            <Pressable style={styles.aiSuggestButton} onPress={() => setAiModalVisible(true)}>
              <Text style={styles.aiSuggestButtonLabel}>✨ Get AI suggestions</Text>
            </Pressable>

            <Text style={styles.fieldLabel}>Title (optional)</Text>
            <View style={styles.field}>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Auto-generated from your address if left blank"
                placeholderTextColor={Colors.mutedLight}
                style={styles.fieldInput}
              />
            </View>

            <Text style={styles.fieldLabel}>Payment accepted</Text>
            <PaymentMethodToggle value={paymentMethod} onChange={setPaymentMethod} />

            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Moving sale, everything must go..."
              placeholderTextColor={Colors.mutedLight}
              style={styles.descriptionInput}
              multiline
            />
          </>
        )}

        {step === 3 && (
          <>
            {matchedEvent === undefined ? (
              <View style={styles.stepCenterBox}>
                <ActivityIndicator color={Colors.coral} />
              </View>
            ) : matchedEvent === null ? (
              <>
                <Text style={styles.fieldLabel}>Town-wide events</Text>
                <View style={styles.reviewCard}>
                  <Text style={styles.eventStatusText}>
                    No town-wide event matches your area and dates yet — you can skip this step and
                    list independently.
                  </Text>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.fieldLabel}>A town-wide event is happening near you</Text>
                <View style={styles.reviewCard}>
                  <View style={styles.eventRow}>
                    <View style={styles.eventAvatar}>
                      <Ionicons name="people-outline" size={16} color={Colors.violet} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.eventTitle}>{matchedEvent.name}</Text>
                      <Text style={styles.eventSubtitle}>
                        {formatDisplayDate(matchedEvent.startDate)} &middot; {matchedEventParticipantCount}{' '}
                        {matchedEventParticipantCount === 1 ? 'home' : 'homes'}
                      </Text>
                    </View>
                  </View>

                  {joinEventStatus === 'undecided' ? (
                    <View style={styles.buttonRow}>
                      <Pressable
                        style={styles.secondaryButton}
                        onPress={() => setJoinEventStatus('declined')}>
                        <Text style={styles.secondaryButtonLabel}>Not this time</Text>
                      </Pressable>
                      <Pressable
                        style={styles.primaryButton}
                        onPress={() => setJoinEventStatus('requested')}>
                        <Text style={styles.primaryButtonLabel}>Request to join</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={styles.eventStatusBanner}>
                      <Ionicons
                        name={joinEventStatus === 'requested' ? 'checkmark-circle' : 'close-circle'}
                        size={14}
                        color={joinEventStatus === 'requested' ? '#0F6E56' : Colors.muted}
                      />
                      <Text style={styles.eventStatusText}>
                        {joinEventStatus === 'requested'
                          ? 'Request sent to the organizer'
                          : "You'll list independently"}
                      </Text>
                    </View>
                  )}
                </View>
              </>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <Text style={styles.fieldLabel}>Review your listing</Text>
            <View style={styles.reviewCard}>
              {photos.length > 0 && (
                <View style={styles.photoGrid}>
                  {photos.map((uri) => (
                    <Image key={uri} source={{ uri }} style={[styles.photoSlot, styles.photoImage]} resizeMode="cover" />
                  ))}
                </View>
              )}
              <View style={styles.reviewInfoRow}>
                <Ionicons name="location-outline" size={12} color={Colors.muted} />
                <Text style={styles.reviewInfoText}>
                  {showExactAddress ? address : 'Maple Street area, London'}
                </Text>
              </View>
              <View style={styles.reviewInfoRow}>
                <Ionicons name="calendar-outline" size={12} color={Colors.muted} />
                <Text style={styles.reviewInfoText}>
                  {dateRangeLabel} &middot; {time}
                </Text>
              </View>
              <View style={styles.chipRow}>
                {categories.length > 0 ? (
                  categories.map((category) => (
                    <View key={category} style={styles.categoryChip}>
                      <Text style={styles.categoryChipLabel}>{category}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.reviewInfoText}>No categories selected</Text>
                )}
              </View>
              {otherItems.length > 0 && (
                <Text style={styles.reviewInfoText}>Also bringing: {otherItems.join(', ')}</Text>
              )}
              {description.length > 0 && (
                <Text style={styles.reviewDescription}>{description}</Text>
              )}
              <Text style={styles.reviewMeta}>
                {photos.length} photo{photos.length === 1 ? '' : 's'} &middot;{' '}
                {joinEventStatus === 'requested' ? 'Joining Riverdale event' : 'Independent listing'}
              </Text>
            </View>
          </>
        )}

        {publishError && (
          <View style={styles.warningBanner}>
            <Ionicons name="warning-outline" size={13} color={Colors.amberText} />
            <Text style={styles.warningBannerText}>{publishError}</Text>
          </View>
        )}
      </ScrollView>
      </TouchableWithoutFeedback>

      <Pressable
        style={styles.draftLink}
        onPress={handleSaveDraft}
        disabled={publishing || savingDraft}>
        {savingDraft ? (
          <ActivityIndicator size="small" color={Colors.mutedDark} />
        ) : (
          <Text style={styles.draftLinkLabel}>Save as draft</Text>
        )}
      </Pressable>

      <View style={styles.buttonRow}>
        {step > 1 && (
          <Pressable style={styles.secondaryButton} onPress={handleBack} disabled={publishing || savingDraft}>
            <Text style={styles.secondaryButtonLabel}>Back</Text>
          </Pressable>
        )}
        <Pressable
          style={[styles.primaryButton, step === 1 && styles.primaryButtonFull]}
          onPress={handleContinue}
          disabled={publishing || savingDraft}>
          {publishing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonLabel}>{step < TOTAL_STEPS ? 'Continue' : 'Publish sale'}</Text>
          )}
        </Pressable>
      </View>
      </KeyboardAvoidingView>

      <PhotoSourceSheet
        visible={photoSourceSheetVisible}
        onTakePhoto={() => runPhotoPicker(takeListingPhoto)}
        onChooseFromLibrary={() => runPhotoPicker(pickListingPhoto)}
        onCancel={() => setPhotoSourceSheetVisible(false)}
      />

      <AiSuggestionModal
        visible={aiModalVisible}
        categories={categories}
        otherItems={otherItems}
        onAccept={(suggestedTitle, suggestedDescription) => {
          setTitle(suggestedTitle);
          setDescription(suggestedDescription);
        }}
        onClose={() => setAiModalVisible(false)}
      />
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
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  title: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 20,
    color: Colors.ink,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    marginTop: 14,
    marginBottom: 6,
  },
  progressDot: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.tan,
  },
  progressDotOn: {
    backgroundColor: Colors.coral,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    // Generous bottom padding (not just 24) so fields near the end of the
    // form — the description textarea in particular — have enough scroll
    // headroom to be pulled fully above the keyboard; with too little
    // trailing content, the ScrollView hits its max scroll offset before
    // the focused field clears the keyboard.
    paddingBottom: 220,
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
  suggestionsBox: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 12,
    marginTop: -8,
    marginBottom: 14,
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.tan,
  },
  suggestionText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.ink,
  },
  suggestionEmptyText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.muted,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.amberBg,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
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
    marginBottom: 8,
  },
  warningBannerText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.amberText,
    lineHeight: 16,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  photoSlot: {
    width: '22%',
    aspectRatio: 1,
    borderRadius: 10,
    backgroundColor: Colors.amberBg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoSlotEmpty: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
    borderStyle: 'dashed',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoRemoveButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  descriptionInput: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 12,
    padding: 12,
    minHeight: 80,
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.ink,
    textAlignVertical: 'top',
  },
  aiSuggestButton: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.lavender,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  aiSuggestButtonLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 12,
    color: Colors.violet,
  },
  stepCenterBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  reviewCard: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 14,
    padding: 14,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  eventAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventTitle: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 13,
    color: Colors.ink,
  },
  eventSubtitle: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.muted,
  },
  eventStatusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.lavender,
    borderRadius: 10,
    padding: 10,
  },
  eventStatusText: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.mutedDark,
  },
  reviewInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  reviewInfoText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.mutedDark,
  },
  categoryChip: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  categoryChipLabel: {
    fontFamily: Fonts.displayMedium,
    fontSize: 10,
    color: Colors.amberText,
  },
  reviewDescription: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.mutedDark,
    lineHeight: 18,
    borderTopWidth: 1,
    borderTopColor: Colors.tan,
    paddingTop: 8,
    marginTop: 4,
  },
  reviewMeta: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.muted,
    marginTop: 8,
  },
  draftLink: {
    alignItems: 'center',
    paddingTop: 4,
  },
  draftLinkLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: Colors.mutedDark,
    textDecorationLine: 'underline',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
  },
  secondaryButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 12,
    paddingVertical: 13,
  },
  secondaryButtonLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 12,
    color: Colors.mutedDark,
  },
  primaryButton: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.coral,
    borderRadius: 12,
    paddingVertical: 13,
  },
  primaryButtonFull: {
    flex: 1,
  },
  primaryButtonLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 12,
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
    backgroundColor: Colors.jade,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  draftSuccessIcon: {
    backgroundColor: Colors.mutedDark,
  },
  successTitle: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 19,
    color: Colors.ink,
    marginBottom: 6,
  },
  successSubtitle: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.muted,
    textAlign: 'center',
    marginBottom: 20,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  shareButtonLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 12,
    color: Colors.mutedDark,
  },
  doneButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  doneButtonLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 12,
    color: Colors.coral,
  },
});
