import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PhotoSourceSheet } from '@/components/garagehunt/photo-source-sheet';
import { Colors, Fonts } from '@/constants/brand';
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
import { EditableListing, fetchEditableListing } from '@/utils/sale-listings';

// The lightweight "snap fresh photos" flow the day-of reminder deep-links to
// (feature spec 4f / tech arch Section 10) — push tap routes here via
// hooks/use-notification-deep-link.ts, the reminder email via
// https://garagehunt.ca/day-of-photos/<id>. Single Expo Router screen, so it
// works identically on mobile and web (RN Web). Unlike the full Edit Listing
// form this only does one thing: add photos tagged photo_type='day_of', which
// then lead the gallery/thumbnail and light up the "📸 Fresh Photos" badge for
// the rest of today (all derived at render time, see deriveDisplayPhotos).
//
// Uploads immediately on pick (same model as Edit Listing, not the deferred
// batch of List a Sale) since the listing already has a real id. Ownership is
// enforced by fetchEditableListing being scoped to the signed-in seller — it
// returns null for a listing the caller doesn't own.
export default function DayOfPhotosScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuthSession();

  const [listing, setListing] = useState<EditableListing | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<ListingPhoto[]>([]);
  const [pickingPhoto, setPickingPhoto] = useState(false);
  const [photoSourceSheetVisible, setPhotoSourceSheetVisible] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

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
            // Only the day_of photos already added — this screen is scoped to
            // today's fresh shots, not the original planning gallery.
            fetchListingPhotos(result.id, 'day_of')
              .then((fetched) => {
                if (!cancelledEffect) setPhotos(fetched);
              })
              .catch((err) => console.error('Failed to load day-of photos', err));
          }
        })
        .catch((err) => {
          if (!cancelledEffect) {
            console.error('Failed to load listing for day-of photos', err);
            setLoadError(getErrorMessage(err, 'Failed to load this listing.'));
            setListing(null);
          }
        });
      return () => {
        cancelledEffect = true;
      };
    }, [id, session])
  );

  const handleAddPhoto = () => {
    if (!listing || photos.length >= MAX_LISTING_PHOTOS || pickingPhoto) return;
    setPhotoError(null);
    setPhotoSourceSheetVisible(true);
  };

  const runPhotoPicker = async (picker: () => Promise<string | null>) => {
    if (!listing) return;
    setPhotoSourceSheetVisible(false);
    // Same iOS Modal-close race guard as Edit Listing — presenting the native
    // picker in the same tick the sheet closes can leave it silently stuck.
    await new Promise((resolve) => setTimeout(resolve, 500));
    setPickingPhoto(true);
    try {
      const uri = await picker();
      if (uri) {
        // sort_order well above the planning photos (0..n) so that once
        // today's freshness expires these trail the original gallery rather
        // than interleaving with it — deriveDisplayPhotos leads with them only
        // while they're from *today*.
        const uploaded = await uploadListingPhoto(listing.id, uri, 1000 + photos.length, 'day_of');
        setPhotos((current) => [...current, uploaded]);
      }
    } catch (err) {
      console.error('Failed to add day-of photo', err);
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
      console.error('Failed to remove day-of photo', err);
      setPhotoError(getErrorMessage(err, 'Could not remove that photo.'));
    } finally {
      setDeletingPhotoId(null);
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
          <Text style={styles.topBarTitle}>Fresh photos</Text>
          <View style={styles.iconButton} />
        </View>
        <View style={styles.stateBox}>
          <Ionicons name="warning-outline" size={20} color={Colors.amberText} />
          <Text style={styles.stateText}>{loadError ?? 'Listing not found.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const listingTitle = listing.title?.trim() ? listing.title : listing.addressText.split(',')[0];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable style={styles.iconButton} onPress={() => goBack()}>
          <Ionicons name="chevron-back" size={18} color={Colors.ink} />
        </Pressable>
        <Text style={styles.topBarTitle}>Fresh photos</Text>
        <View style={styles.iconButton} />
      </View>

      <ScrollView style={styles.flexFill} contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Your sale is starting! 📸</Text>
        <Text style={styles.blurb}>
          Snap a fresh photo of <Text style={styles.blurbStrong}>{listingTitle}</Text> now — tables set up,
          everything laid out — to pull in more buyers today. These get added alongside your original photos and
          lead your listing with a <Text style={styles.blurbStrong}>📸 Fresh Photos</Text> badge for the rest of
          the day.
        </Text>

        <Text style={styles.fieldLabel}>
          Today&apos;s photos ({photos.length}/{MAX_LISTING_PHOTOS})
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
                <Pressable style={styles.photoRemoveButton} onPress={() => handleRemovePhoto(photo)} hitSlop={6}>
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

        {photos.length === 0 && !pickingPhoto && (
          <Text style={styles.emptyHint}>No fresh photos yet — tap the camera above to add one.</Text>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.primaryButton} onPress={() => goBack()}>
          <Text style={styles.primaryButtonLabel}>{photos.length > 0 ? 'Done' : 'Not now'}</Text>
        </Pressable>
      </View>

      <PhotoSourceSheet
        visible={photoSourceSheetVisible}
        onTakePhoto={() => runPhotoPicker(takeListingPhoto)}
        onChooseFromLibrary={() => runPhotoPicker(pickListingPhoto)}
        onCancel={() => setPhotoSourceSheetVisible(false)}
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
    paddingBottom: 40,
  },
  heading: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 20,
    color: Colors.ink,
    marginBottom: 8,
  },
  blurb: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.mutedDark,
    lineHeight: 19,
    marginBottom: 20,
  },
  blurbStrong: {
    fontFamily: Fonts.bodySemiBold,
    color: Colors.ink,
  },
  fieldLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: Colors.mutedDark,
    marginBottom: 6,
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
  emptyHint: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.muted,
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
});
