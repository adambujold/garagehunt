import { Session } from '@supabase/supabase-js';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MyListingCard } from '@/components/garagehunt/my-listing-card';
import { PhotoSourceSheet } from '@/components/garagehunt/photo-source-sheet';
import { PriceTag } from '@/components/garagehunt/price-tag';
import { ReviewPromptGate } from '@/components/garagehunt/review-prompt-gate';
import { ShopperTierInfoModal } from '@/components/garagehunt/shopper-tier-info-modal';
import { UserAvatar } from '@/components/garagehunt/user-avatar';
import { Colors, Fonts, SHOPPER_TIER_THRESHOLDS } from '@/constants/brand';
import { useAuthSession } from '@/hooks/use-auth-session';
import { fetchAvatarUrl, fetchNeighborAvatarUrls, uploadAvatar } from '@/utils/avatars';
import { fetchBuyerCheckinCount } from '@/utils/check-ins';
import { ClusterSuggestion, fetchActiveClusterForUser } from '@/utils/cluster-suggestions';
import { getErrorMessage } from '@/utils/get-error-message';
import {
  fetchIsVerifiedOrganizer,
  fetchLatestOrganizerApplication,
  markOrganizerApplicationSeen,
} from '@/utils/organizer-applications';
import { pickListingPhoto, takeListingPhoto } from '@/utils/pick-listing-photo';
import { fetchSellerRating, SellerRating } from '@/utils/reviews';
import { fetchMyListings, MyListingSummary } from '@/utils/sale-listings';
import { deriveShopperTier, SHOPPER_TIER_LABELS } from '@/utils/shopper-tier';
import { supabase } from '@/utils/supabase';

// display_name is saved to auth user_metadata at Sign Up (see
// signup-screen.tsx) — no separate profile table exists yet. Accounts that
// never went through that flow (or predate it) won't have one, so this
// falls back to the email's local part rather than showing nothing.
export function deriveDisplayName(session: Session | null): string {
  const metaName = session?.user.user_metadata?.display_name;
  if (typeof metaName === 'string' && metaName.trim().length > 0) return metaName.trim();
  const email = session?.user.email;
  if (email) return email.split('@')[0];
  return 'Your account';
}

type Shortcut = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress?: () => void;
};

// Generic "Invite a friend" (feature spec Section 12b) — promotes the app
// itself, not a specific listing/route, so it's just brand-voice copy with
// no deep link attached.
//
// TODO: no real download link exists yet since GarageHunt isn't publicly
// live on the App Store or Play Store — add the real store link to this
// message the moment it actually goes public. Ship the messaging now
// rather than waiting, per the spec's explicit call-out on this.
async function handleInviteFriend() {
  try {
    await Share.share({
      message: "Join me on GarageHunt — Canada's weekend treasure hunt 🔥",
    });
  } catch (err) {
    console.error('Failed to open share sheet', err);
  }
}

// "Organizer dashboard" replaces "Become an organizer" once verified —
// re-applying makes no sense at that point, and the dashboard is the thing
// they actually want (feature spec Section 5b lists both as separate,
// conditional shortcuts).
function buildShortcuts(isVerifiedOrganizer: boolean): Shortcut[] {
  return [
    { icon: 'list-outline', label: 'My listings', onPress: () => router.push('/my-listings') },
    { icon: 'locate-outline', label: 'Saved searches', onPress: () => router.push('/looking-for') },
    isVerifiedOrganizer
      ? { icon: 'megaphone-outline', label: 'Organizer dashboard', onPress: () => router.push('/organizer-dashboard') }
      : { icon: 'shield-checkmark-outline', label: 'Become an organizer', onPress: () => router.push('/organizer-application') },
    { icon: 'gift-outline', label: 'Invite a friend', onPress: handleInviteFriend },
    { icon: 'log-out-outline', label: 'Sign out', onPress: () => supabase.auth.signOut() },
  ];
}

export default function ProfileScreen() {
  const { session } = useAuthSession();
  const [rating, setRating] = useState<SellerRating>({ avgRating: null, reviewCount: 0 });
  const [myListings, setMyListings] = useState<MyListingSummary[] | null>(null);
  const [checkinCount, setCheckinCount] = useState(0);
  const [isVerifiedOrganizer, setIsVerifiedOrganizer] = useState(false);
  const [showApprovalBanner, setShowApprovalBanner] = useState(false);
  const [showTierInfo, setShowTierInfo] = useState(false);
  const [activeCluster, setActiveCluster] = useState<ClusterSuggestion | null>(null);
  const [neighborAvatarUrls, setNeighborAvatarUrls] = useState<(string | null)[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarSheetVisible, setAvatarSheetVisible] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      let cancelled = false;
      fetchSellerRating(session.user.id)
        .then((result) => {
          if (!cancelled) setRating(result);
        })
        .catch((err) => console.error('Failed to fetch seller rating', err));
      fetchMyListings(session.user.id)
        .then((data) => {
          if (!cancelled) setMyListings(data);
        })
        .catch((err) => console.error('Failed to fetch my listings', err));
      fetchBuyerCheckinCount(session.user.id)
        .then((count) => {
          if (!cancelled) setCheckinCount(count);
        })
        .catch((err) => console.error('Failed to fetch check-in count', err));
      fetchIsVerifiedOrganizer(session.user.id)
        .then((verified) => {
          if (!cancelled) setIsVerifiedOrganizer(verified);
        })
        .catch((err) => console.error('Failed to fetch organizer status', err));
      // Surfaces approval proactively, rather than requiring the user to
      // think to check the "Become an organizer" screen — a one-time
      // banner, immediately marked seen so it doesn't resurface next visit.
      fetchLatestOrganizerApplication(session.user.id)
        .then((application) => {
          if (cancelled || !application) return;
          if (application.status === 'approved' && !application.seenApproval) {
            setShowApprovalBanner(true);
            markOrganizerApplicationSeen(application.id).catch((err) =>
              console.error('Failed to mark organizer approval as seen', err)
            );
          }
        })
        .catch((err) => console.error('Failed to check organizer application status', err));
      fetchActiveClusterForUser()
        .then((cluster) => {
          if (cancelled) return;
          setActiveCluster(cluster);
          if (!cluster) {
            setNeighborAvatarUrls([]);
            return;
          }
          // Chained rather than parallel — needs the cluster's listingIds
          // first to know which sellers to look up.
          return fetchNeighborAvatarUrls(cluster.listingIds, session.user.id).then((urls) => {
            if (!cancelled) setNeighborAvatarUrls(urls);
          });
        })
        .catch((err) => console.error('Failed to check for a nearby cluster suggestion', err));
      fetchAvatarUrl(session.user.id)
        .then((url) => {
          if (!cancelled) setAvatarUrl(url);
        })
        .catch((err) => console.error('Failed to fetch avatar', err));
      return () => {
        cancelled = true;
      };
    }, [session])
  );

  const shopperTier = deriveShopperTier(checkinCount);
  const shortcuts = buildShortcuts(isVerifiedOrganizer);
  const displayName = deriveDisplayName(session);

  // Same in-place patch as My Listings — the purchase happens on this same
  // screen, which useFocusEffect's focus-only refetch wouldn't pick up until
  // navigating away and back.
  const handleBoosted = (listingId: string, expiresAt: string) => {
    setMyListings((current) =>
      current?.map((listing) =>
        listing.id === listingId ? { ...listing, isBoosted: true, boostExpiresAt: expiresAt } : listing
      ) ?? null
    );
  };

  const runAvatarPicker = async (picker: () => Promise<string | null>) => {
    setAvatarSheetVisible(false);
    // Same close-animation race as List a Sale's runPhotoPicker — presenting
    // the native camera/library picker in the same tick as closing this
    // Modal can silently fail to appear on iOS. See that file's comment.
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (!session) return;
    setAvatarUploading(true);
    setAvatarError(null);
    try {
      const uri = await picker();
      if (!uri) return;
      const url = await uploadAvatar(session.user.id, uri);
      setAvatarUrl(url);
    } catch (err) {
      console.error('Failed to update avatar', err);
      setAvatarError(getErrorMessage(err, 'Could not update your photo.'));
    } finally {
      setAvatarUploading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ReviewPromptGate />
      <ScrollView contentContainerStyle={styles.content}>
        {showApprovalBanner && (
          <View style={styles.approvalBanner}>
            <Text style={styles.approvalBannerText}>
              🎉 Your organizer application was approved!
            </Text>
            <Pressable onPress={() => setShowApprovalBanner(false)} hitSlop={8}>
              <Ionicons name="close" size={15} color="#0F6E56" />
            </Pressable>
          </View>
        )}

        <View style={styles.header}>
          <Pressable onPress={() => setAvatarSheetVisible(true)} disabled={avatarUploading}>
            <UserAvatar avatarUrl={avatarUrl} displayName={displayName} size={48} />
            <View style={styles.avatarEditBadge}>
              {avatarUploading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="camera" size={11} color="#fff" />
              )}
            </View>
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.name}>{displayName}</Text>
            {isVerifiedOrganizer && <PriceTag label="Verified organizer" variant="organizer" rotate={-2} />}
            <View style={styles.headerSubRow}>
              <Ionicons name="location" size={10} color={Colors.muted} />
              <Text style={styles.headerSub}>London, ON &middot; Member since 2026</Text>
            </View>
            {rating.reviewCount > 0 && (
              <View style={styles.headerSubRow}>
                <Ionicons name="star" size={10} color={Colors.marigold} />
                <Text style={styles.headerSub}>
                  {rating.avgRating?.toFixed(1)} &middot; {rating.reviewCount} review
                  {rating.reviewCount === 1 ? '' : 's'}
                </Text>
              </View>
            )}
            <View style={styles.tierRow}>
              {shopperTier ? (
                <View style={styles.tierBadge}>
                  <Text style={styles.tierBadgeLabel}>{SHOPPER_TIER_LABELS[shopperTier]}</Text>
                </View>
              ) : (
                <Text style={styles.tierProgressText}>
                  {checkinCount} check-in{checkinCount === 1 ? '' : 's'} &middot;{' '}
                  {SHOPPER_TIER_THRESHOLDS.regular - checkinCount} more for {SHOPPER_TIER_LABELS.regular}
                </Text>
              )}
              <Pressable onPress={() => setShowTierInfo(true)} hitSlop={6}>
                <Ionicons name="information-circle-outline" size={13} color={Colors.muted} />
              </Pressable>
            </View>
          </View>
          <Pressable style={styles.settingsButton} onPress={() => router.push('/settings')}>
            <Ionicons name="settings-outline" size={17} color={Colors.muted} />
          </Pressable>
        </View>

        {avatarError && (
          <View style={styles.warningBanner}>
            <Ionicons name="warning-outline" size={13} color={Colors.amberText} />
            <Text style={styles.warningBannerText}>{avatarError}</Text>
          </View>
        )}

        {activeCluster && (
          <View style={styles.nudgeCard}>
            <View style={styles.nudgeAvatarRow}>
              {(neighborAvatarUrls.length > 0 ? neighborAvatarUrls : [null]).map((url, index) => (
                <UserAvatar
                  key={index}
                  avatarUrl={url}
                  size={28}
                  style={[styles.nudgeAvatarItem, index > 0 && styles.nudgeAvatarOverlap]}
                />
              ))}
            </View>
            <Text style={styles.nudgeTitle}>
              {activeCluster.listingIds.length - 1} neighbor
              {activeCluster.listingIds.length - 1 === 1 ? '' : 's'} planning sales nearby
            </Text>
            <Text style={styles.nudgeSubtitle}>
              Team up for the same weekend and everyone gets more traffic.
            </Text>
            <Pressable
              style={styles.nudgeButton}
              onPress={() => router.push({ pathname: '/cluster-claim/[id]', params: { id: activeCluster.id } })}>
              <Text style={styles.nudgeButtonLabel}>See who&apos;s selling nearby</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.sectionTitle}>My sales</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.saleScrollContent}>
          {(myListings ?? []).map((listing) => (
            <View key={listing.id} style={styles.saleCardWrapper}>
              <MyListingCard listing={listing} onBoosted={handleBoosted} />
            </View>
          ))}
          <Pressable style={styles.planSaleCard} onPress={() => router.push('/list-sale')}>
            <View style={styles.planSaleIcon}>
              <Ionicons name="add" size={18} color={Colors.tanBorder} />
            </View>
            <Text style={styles.planSaleTitle}>Plan a sale</Text>
            <Text style={styles.planSaleSubtitle}>Draft ahead</Text>
          </Pressable>
        </ScrollView>

        <Text style={styles.sectionTitle}>Shortcuts</Text>
        {shortcuts.map((shortcut) => (
          <Pressable key={shortcut.label} style={styles.shortcutRow} onPress={shortcut.onPress}>
            <Ionicons name={shortcut.icon} size={16} color={Colors.violet} />
            <Text style={styles.shortcutLabel}>{shortcut.label}</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.tanBorder} />
          </Pressable>
        ))}
      </ScrollView>
      {showTierInfo && <ShopperTierInfoModal onClose={() => setShowTierInfo(false)} />}
      <PhotoSourceSheet
        visible={avatarSheetVisible}
        onTakePhoto={() => runAvatarPicker(takeListingPhoto)}
        onChooseFromLibrary={() => runAvatarPicker(pickListingPhoto)}
        onCancel={() => setAvatarSheetVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.lavender,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  approvalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#DCF3EE',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    marginBottom: 4,
  },
  approvalBannerText: {
    flex: 1,
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: '#0F6E56',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 8,
    paddingBottom: 16,
  },
  avatarEditBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.coral,
    borderWidth: 2,
    borderColor: Colors.lavender,
    alignItems: 'center',
    justifyContent: 'center',
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
  headerText: {
    flex: 1,
  },
  name: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 16,
    color: Colors.ink,
  },
  headerSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  headerSub: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.muted,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  tierBadge: {
    backgroundColor: Colors.amberBg,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 9,
  },
  tierBadgeLabel: {
    fontFamily: Fonts.displayMedium,
    fontSize: 10,
    color: Colors.amberText,
  },
  tierProgressText: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 11,
    color: Colors.interestPink,
  },
  settingsButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudgeCard: {
    backgroundColor: Colors.lavender,
    borderWidth: 2,
    borderColor: Colors.violetBorder,
    borderRadius: 14,
    padding: 12,
    marginBottom: 18,
  },
  nudgeAvatarRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  nudgeAvatarItem: {
    borderWidth: 2,
    borderColor: Colors.lavender,
  },
  nudgeAvatarOverlap: {
    marginLeft: -10,
  },
  nudgeTitle: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 13,
    color: Colors.ink,
    marginBottom: 4,
  },
  nudgeSubtitle: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.mutedDark,
    lineHeight: 16,
    marginBottom: 10,
  },
  nudgeButton: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.coral,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  nudgeButtonLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 11,
    color: '#fff',
  },
  sectionTitle: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: Colors.mutedDark,
    marginBottom: 10,
  },
  saleScrollContent: {
    gap: 10,
    paddingBottom: 18,
  },
  saleCardWrapper: {
    width: 260,
  },
  planSaleCard: {
    width: 130,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.tan,
    borderStyle: 'dashed',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  planSaleIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F2ECDD',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  planSaleTitle: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 12,
    color: Colors.coral,
  },
  planSaleSubtitle: {
    fontFamily: Fonts.body,
    fontSize: 10,
    color: Colors.muted,
    marginTop: 2,
  },
  shortcutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  shortcutLabel: {
    flex: 1,
    fontFamily: Fonts.displaySemiBold,
    fontSize: 12,
    color: Colors.ink,
  },
});
