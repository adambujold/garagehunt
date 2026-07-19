import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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

import { AiSuggestionModal } from '@/components/garagehunt/ai-suggestion-modal';
import { Chip } from '@/components/garagehunt/chip';
import { DatePickerField } from '@/components/garagehunt/date-picker-field';
import { OtherCategoryField } from '@/components/garagehunt/other-category-field';
import { PaymentMethodToggle } from '@/components/garagehunt/payment-method-toggle';
import { PhotoSourceSheet } from '@/components/garagehunt/photo-source-sheet';
import { PaymentMethod } from '@/components/garagehunt/sale-card';
import { Colors, Fonts, PriceTagVariantColors } from '@/constants/brand';
import { CATEGORIES } from '@/constants/categories';
import { useAuthSession } from '@/hooks/use-auth-session';
import { getErrorMessage } from '@/utils/get-error-message';
import {
  deleteListingPhoto,
  fetchListingPhotos,
  ListingPhoto,
  MAX_LISTING_PHOTOS,
  uploadListingPhoto,
} from '@/utils/listing-photos';
import { goBack } from '@/utils/navigation';
import { pickListingPhoto, takeListingPhoto } from '@/utils/pick-listing-photo';
import {
  cancelSaleListing,
  EditableListing,
  fetchEditableListing,
  updateSaleListing,
} from '@/utils/sale-listings';
import {
  fetchPendingInvitationForListing,
  PendingInvitation,
  updateEventJoinRequestStatus,
} from '@/utils/town-wide-events';

export default function EditListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuthSession();

  const [listing, setListing] = useState<EditableListing | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash_only');
  const [description, setDescription] = useState('');
  const [otherItems, setOtherItems] = useState<string[]>([]);
  const [aiModalVisible, setAiModalVisible] = useState(false);
  // Unlike List a Sale, this listing already has a real id — photos upload
  // (and delete) immediately on pick rather than being deferred to a save
  // action.
  const [photos, setPhotos] = useState<ListingPhoto[]>([]);
  const [pickingPhoto, setPickingPhoto] = useState(false);
  const [photoSourceSheetVisible, setPhotoSourceSheetVisible] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // An invitation an organizer sent this listing after claiming a nearby
  // cluster (see 0015_cluster_suggestions.sql) — distinct from the
  // seller-initiated "request to join" flow in List a Sale, which doesn't
  // apply here since this listing already exists.
  const [invitation, setInvitation] = useState<PendingInvitation | null>(null);
  const [respondingToInvitation, setRespondingToInvitation] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;

      let cancelledEffect = false;
      setLoadError(null);
      fetchEditableListing(id, session.user.id)
        .then((result) => {
          if (cancelledEffect) return;
          setListing(result);
          if (result) {
            setStartDate(result.startDate);
            setEndDate(result.endDate);
            setCategories(result.categoryNames);
            setTitle(result.title ?? '');
            setPaymentMethod(result.paymentMethod);
            setDescription(result.description);
            setOtherItems(result.otherItems);
            fetchListingPhotos(result.id)
              .then((fetchedPhotos) => {
                if (!cancelledEffect) setPhotos(fetchedPhotos);
              })
              .catch((err) => console.error('Failed to load listing photos', err));
            fetchPendingInvitationForListing(result.id)
              .then((invitationResult) => {
                if (!cancelledEffect) setInvitation(invitationResult);
              })
              .catch((err) => console.error('Failed to check for a pending event invitation', err));
          }
        })
        .catch((err) => {
          if (!cancelledEffect) {
            console.error('Failed to load listing for editing', err);
            setLoadError(getErrorMessage(err, 'Failed to load this listing.'));
            setListing(null);
          }
        });
      return () => {
        cancelledEffect = true;
      };
    }, [id, session])
  );

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

  const handleRespondToInvitation = async (status: 'approved' | 'denied') => {
    if (!invitation || respondingToInvitation) return;
    setRespondingToInvitation(true);
    try {
      await updateEventJoinRequestStatus(invitation.id, status);
      setInvitation(null);
    } catch (err) {
      console.error('Failed to respond to event invitation', err);
    } finally {
      setRespondingToInvitation(false);
    }
  };

  const handleAddPhoto = () => {
    if (!listing || photos.length >= MAX_LISTING_PHOTOS || pickingPhoto) return;
    setPhotoError(null);
    setPhotoSourceSheetVisible(true);
  };

  const runPhotoPicker = async (picker: () => Promise<string | null>) => {
    if (!listing) return;
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
      if (uri) {
        const uploaded = await uploadListingPhoto(listing.id, uri, photos.length);
        setPhotos((current) => [...current, uploaded]);
      }
    } catch (err) {
      console.error('Failed to add photo', err);
      setPhotoError(getErrorMessage(err, 'Could not add that photo.'));
    } finally {
      setPickingPhoto(false);
    }
  };

  const handleRemovePhoto = async (photo: ListingPhoto) => {
    setPhotoError(null);
    setDeletingPhotoId(photo.id);
    try {
      await deleteListingPhoto(photo.id, photo.storageKey);
      setPhotos((current) => current.filter((p) => p.id !== photo.id));
    } catch (err) {
      console.error('Failed to remove photo', err);
      setPhotoError(getErrorMessage(err, 'Could not remove that photo.'));
    } finally {
      setDeletingPhotoId(null);
    }
  };

  const handleSave = async () => {
    if (!listing) return;
    setSaveError(null);
    setSaving(true);
    try {
      await updateSaleListing({
        id: listing.id,
        startDate,
        endDate,
        title,
        paymentMethod,
        description,
        otherItems,
        categoryNames: categories,
        publish: listing.status === 'draft',
      });
      goBack();
    } catch (err) {
      console.error('Failed to save listing changes', err);
      setSaveError(getErrorMessage(err, 'Something went wrong saving your changes.'));
    } finally {
      setSaving(false);
    }
  };

  const handleCancelListing = async () => {
    if (!listing) return;
    setCancelling(true);
    try {
      await cancelSaleListing(listing.id);
      goBack();
    } catch (err) {
      console.error('Failed to cancel listing', err);
      setSaveError(getErrorMessage(err, 'Something went wrong cancelling this sale.'));
      setCancelling(false);
      setConfirmingCancel(false);
    }
  };

  if (listing === undefined) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.stateBox}>
          <ActivityIndicator color={Colors.coral} />
        </View>
      </SafeAreaView>
    );
  }

  if (!listing) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.topBar}>
          <Pressable style={styles.iconButton} onPress={() => goBack()}>
            <Ionicons name="chevron-back" size={18} color={Colors.ink} />
          </Pressable>
          <Text style={styles.topBarTitle}>Edit listing</Text>
          <View style={styles.iconButton} />
        </View>
        <View style={styles.stateBox}>
          <Ionicons name="warning-outline" size={20} color={Colors.amberText} />
          <Text style={styles.stateText}>{loadError ?? 'Listing not found.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isDraft = listing.status === 'draft';
  const isCancelled = listing.status === 'cancelled';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable style={styles.iconButton} onPress={() => goBack()}>
          <Ionicons name="chevron-back" size={18} color={Colors.ink} />
        </Pressable>
        <Text style={styles.topBarTitle}>Edit listing</Text>
        <View style={styles.iconButton} />
      </View>

      {isCancelled ? (
        <View style={styles.stateBox}>
          <Ionicons name="close-circle-outline" size={22} color={Colors.muted} />
          <Text style={styles.stateText}>This sale has been cancelled and can no longer be edited.</Text>
        </View>
      ) : (
        <KeyboardAvoidingView style={styles.flexFill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            style={styles.flexFill}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled">
            {invitation && (
              <View style={styles.invitationCard}>
                <View style={styles.invitationRow}>
                  <Ionicons name="people-outline" size={16} color={Colors.violet} />
                  <Text style={styles.invitationText}>
                    You&apos;ve been invited to join <Text style={styles.invitationEventName}>{invitation.eventName}</Text>
                  </Text>
                </View>
                <View style={styles.buttonRow}>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() => handleRespondToInvitation('denied')}
                    disabled={respondingToInvitation}>
                    <Text style={styles.secondaryButtonLabel}>Decline</Text>
                  </Pressable>
                  <Pressable
                    style={styles.primaryInviteButton}
                    onPress={() => handleRespondToInvitation('approved')}
                    disabled={respondingToInvitation}>
                    {respondingToInvitation ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.primaryButtonLabel}>Accept</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            )}

            <Text style={styles.fieldLabel}>
              Photos ({photos.length}/{MAX_LISTING_PHOTOS})
            </Text>
            <View style={styles.photoGrid}>
              {photos.map((photo) => (
                <View key={photo.id} style={styles.photoSlot}>
                  <Image source={{ uri: photo.url }} style={styles.photoImage} resizeMode="cover" />
                  {deletingPhotoId === photo.id ? (
                    <View style={styles.photoRemoveButton}>
                      <ActivityIndicator size="small" color="#fff" />
                    </View>
                  ) : (
                    <Pressable
                      style={styles.photoRemoveButton}
                      onPress={() => handleRemovePhoto(photo)}
                      hitSlop={6}>
                      <Ionicons name="close" size={12} color="#fff" />
                    </Pressable>
                  )}
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

            <Text style={styles.fieldLabel}>Sale dates</Text>
            <View style={styles.fieldRow}>
              <DatePickerField
                value={startDate}
                onChange={(iso) => {
                  setStartDate(iso);
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
              Extend or shorten your dates anytime — extending past end date makes it live again.
            </Text>

            <Text style={styles.fieldLabel}>Address</Text>
            <View style={[styles.field, styles.fieldLocked]}>
              <Ionicons name="lock-closed-outline" size={13} color={Colors.muted} />
              <Text style={styles.lockedFieldText}>{listing.addressText}</Text>
            </View>
            <Text style={styles.fieldHint}>
              Address is locked after publishing. Need to fix an error? Contact support.
            </Text>

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

            {saveError && (
              <View style={styles.warningBanner}>
                <Ionicons name="warning-outline" size={13} color={Colors.amberText} />
                <Text style={styles.warningBannerText}>{saveError}</Text>
              </View>
            )}
          </ScrollView>
        </TouchableWithoutFeedback>

          <View style={styles.footer}>
            <Pressable style={styles.primaryButton} onPress={handleSave} disabled={saving || cancelling}>
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonLabel}>{isDraft ? 'Publish sale' : 'Save changes'}</Text>
              )}
            </Pressable>

            {!confirmingCancel ? (
              <Pressable
                style={styles.cancelLink}
                onPress={() => setConfirmingCancel(true)}
                disabled={saving || cancelling}>
                <Text style={styles.cancelLinkLabel}>Cancel this sale</Text>
              </Pressable>
            ) : (
              <View style={styles.confirmRow}>
                <Text style={styles.confirmText}>Cancel this sale? This can&apos;t be undone.</Text>
                <View style={styles.confirmButtonRow}>
                  <Pressable
                    style={styles.confirmKeepButton}
                    onPress={() => setConfirmingCancel(false)}
                    disabled={cancelling}>
                    <Text style={styles.confirmKeepLabel}>Keep it</Text>
                  </Pressable>
                  <Pressable style={styles.confirmCancelButton} onPress={handleCancelListing} disabled={cancelling}>
                    {cancelling ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.confirmCancelLabel}>Yes, cancel it</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      )}

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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
  },
  topBarTitle: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 16,
    color: Colors.ink,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  stateText: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.muted,
    textAlign: 'center',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
    // Same fix as list-sale.tsx: enough trailing space for the description
    // field (near the end of the form) to scroll fully above the keyboard.
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
  fieldLocked: {
    backgroundColor: Colors.tan,
    opacity: 0.7,
  },
  lockedFieldText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.mutedDark,
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
  invitationCard: {
    backgroundColor: Colors.lavender,
    borderWidth: 2,
    borderColor: Colors.violetBorder,
    borderRadius: 14,
    padding: 12,
    marginBottom: 18,
  },
  invitationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  invitationText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.ink,
    lineHeight: 17,
  },
  invitationEventName: {
    fontFamily: Fonts.displaySemiBold,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  secondaryButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 12,
    paddingVertical: 10,
  },
  secondaryButtonLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 12,
    color: Colors.mutedDark,
  },
  primaryInviteButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.violet,
    borderRadius: 12,
    paddingVertical: 10,
  },
  warningBanner: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: Colors.amberBg,
    borderRadius: 10,
    padding: 10,
    marginTop: 4,
  },
  warningBannerText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.amberText,
    lineHeight: 16,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.coral,
    borderRadius: 12,
    paddingVertical: 13,
  },
  primaryButtonLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 13,
    color: '#fff',
  },
  cancelLink: {
    alignItems: 'center',
    paddingTop: 12,
  },
  cancelLinkLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: Colors.danger,
  },
  confirmRow: {
    marginTop: 12,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  confirmText: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 12,
    color: Colors.ink,
    textAlign: 'center',
  },
  confirmButtonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  confirmKeepButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 10,
    paddingVertical: 10,
  },
  confirmKeepLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 12,
    color: Colors.mutedDark,
  },
  confirmCancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    // Same red as a Cancelled listing's own badge (PriceTagVariantColors.cancelled)
    // — this button is confirming that exact state, not a standalone color choice.
    backgroundColor: PriceTagVariantColors.cancelled,
    borderRadius: 10,
    paddingVertical: 10,
  },
  confirmCancelLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 12,
    color: '#fff',
  },
});
