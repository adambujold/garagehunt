import { Session } from '@supabase/supabase-js';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ReviewPromptGate } from '@/components/garagehunt/review-prompt-gate';
import { SaleCard } from '@/components/garagehunt/sale-card';
import { ShopperTierInfoModal } from '@/components/garagehunt/shopper-tier-info-modal';
import { Colors, Fonts, SHOPPER_TIER_THRESHOLDS } from '@/constants/brand';
import { MOCK_SALES } from '@/constants/mock-data';
import { useAuthSession } from '@/hooks/use-auth-session';
import { fetchBuyerCheckinCount } from '@/utils/check-ins';
import { fetchSellerRating, SellerRating } from '@/utils/reviews';
import { deriveShopperTier, SHOPPER_TIER_LABELS } from '@/utils/shopper-tier';
import { supabase } from '@/utils/supabase';

const MY_SALE_IDS = ['1', '4'];
const myListings = MOCK_SALES.filter((sale) => MY_SALE_IDS.includes(sale.id));

// display_name is saved to auth user_metadata at Sign Up (see
// signup-screen.tsx) — no separate profile table exists yet. Accounts that
// never went through that flow (or predate it) won't have one, so this
// falls back to the email's local part rather than showing nothing.
function deriveDisplayName(session: Session | null): string {
  const metaName = session?.user.user_metadata?.display_name;
  if (typeof metaName === 'string' && metaName.trim().length > 0) return metaName.trim();
  const email = session?.user.email;
  if (email) return email.split('@')[0];
  return 'Your account';
}

function deriveInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const SHORTCUTS: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress?: () => void;
}[] = [
  { icon: 'list-outline', label: 'My listings', onPress: () => router.push('/my-listings') },
  { icon: 'locate-outline', label: 'Saved searches', onPress: () => router.push('/looking-for') },
  { icon: 'shield-checkmark-outline', label: 'Become an organizer' },
  { icon: 'log-out-outline', label: 'Sign out', onPress: () => supabase.auth.signOut() },
];

export default function ProfileScreen() {
  const { session } = useAuthSession();
  const [rating, setRating] = useState<SellerRating>({ avgRating: null, reviewCount: 0 });
  const [checkinCount, setCheckinCount] = useState(0);
  const [showTierInfo, setShowTierInfo] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      let cancelled = false;
      fetchSellerRating(session.user.id)
        .then((result) => {
          if (!cancelled) setRating(result);
        })
        .catch((err) => console.error('Failed to fetch seller rating', err));
      fetchBuyerCheckinCount(session.user.id)
        .then((count) => {
          if (!cancelled) setCheckinCount(count);
        })
        .catch((err) => console.error('Failed to fetch check-in count', err));
      return () => {
        cancelled = true;
      };
    }, [session])
  );

  const shopperTier = deriveShopperTier(checkinCount);
  const displayName = deriveDisplayName(session);
  const initials = deriveInitials(displayName);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ReviewPromptGate />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarLabel}>{initials}</Text>
          </View>
          <View style={styles.headerText}>
            <Text style={styles.name}>{displayName}</Text>
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

        <View style={styles.nudgeCard}>
          <View style={styles.nudgeAvatarRow}>
            <View style={[styles.nudgeAvatar, { zIndex: 1 }]}>
              <Text style={styles.nudgeAvatarLabel}>RP</Text>
            </View>
            <View style={[styles.nudgeAvatar, styles.nudgeAvatarOverlap]}>
              <Text style={styles.nudgeAvatarLabel}>SL</Text>
            </View>
          </View>
          <Text style={styles.nudgeTitle}>2 neighbors planning sales nearby</Text>
          <Text style={styles.nudgeSubtitle}>
            Team up for the same weekend and everyone gets more traffic.
          </Text>
          <Pressable style={styles.nudgeButton}>
            <Text style={styles.nudgeButtonLabel}>See who&apos;s selling nearby</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>My sales</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.saleScrollContent}>
          {myListings.map((sale) => (
            <View key={sale.id} style={styles.saleCardWrapper}>
              <SaleCard sale={sale} />
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
        {SHORTCUTS.map((shortcut) => (
          <Pressable key={shortcut.label} style={styles.shortcutRow} onPress={shortcut.onPress}>
            <Ionicons name={shortcut.icon} size={16} color={Colors.violet} />
            <Text style={styles.shortcutLabel}>{shortcut.label}</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.tanBorder} />
          </Pressable>
        ))}
      </ScrollView>
      {showTierInfo && <ShopperTierInfoModal onClose={() => setShowTierInfo(false)} />}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 8,
    paddingBottom: 16,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.amberBg,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 16,
    color: Colors.amberText,
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
  nudgeAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.amberBg,
    borderWidth: 2,
    borderColor: Colors.lavender,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudgeAvatarOverlap: {
    marginLeft: -10,
  },
  nudgeAvatarLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 10,
    color: Colors.amberText,
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
