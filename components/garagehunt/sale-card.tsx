import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { PriceTag } from '@/components/garagehunt/price-tag';
import { Colors, Fonts, PriceTagVariant } from '@/constants/brand';
import { useSpotlightTarget } from '@/hooks/use-spotlight-target';
import { formatSaleSchedule } from '@/utils/format-sale-schedule';
import { deriveHotTier, HOT_TIER_LABELS } from '@/utils/hot-tier';

export type PaymentMethod = 'cash_only' | 'cash_and_etransfer';

export type MockSale = {
  id: string;
  title: string;
  distanceKm: number;
  latitude: number;
  longitude: number;
  // Mirrors sale_listings.start_date/end_date/daily_start_time/daily_end_time —
  // startDate === endDate for a single-day sale.
  startDate: string;
  endDate: string;
  dailyStartTime: string;
  dailyEndTime: string;
  categories: string[];
  // Mirrors sale_listings.other_items — the seller's free-text tag list for
  // items outside the fixed category set. The Discover "Other" filter
  // matches against this (and description), not a category-tag equality
  // check, per feature spec Section 4c's Item Seeker matching.
  otherItems: string[];
  tagLabel: string;
  tagVariant: PriceTagVariant;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  addressLabel: string;
  description: string;
  // Mirrors sale_listings.favorite_count. Hot tier is derived from this via
  // deriveHotTier, never stored/authored directly.
  favoriteCount: number;
  // Mirrors sale_listings.checkin_count — this listing's own foot-traffic
  // tally (seller-facing), distinct from a buyer's cumulative
  // buyer_checkin_count across all sales. Not rendered on SaleCard itself
  // today (only My Listings and the checked-in-buyers screen show it), but
  // carried here since this is the shared real-listing shape.
  checkinCount: number;
  // Mirrors sale_listings.event_id — non-null once the listing belongs to a
  // town-wide event. That feature isn't built yet, so this is always null
  // today; the Town-wide filter is written against it regardless so it
  // starts working the moment events exist.
  eventId: string | null;
  // Mirrors listing_photos, ordered by sort_order, as public Storage URLs.
  // Empty when the listing genuinely has no photos yet — every thumbnail
  // falls back to `icon` in that case rather than a broken image.
  photos: string[];
  sellerId: string;
  // Denormalized from public.users (seller_avg_rating/seller_review_count),
  // aggregated across all of the seller's sales, not per-listing — per
  // feature spec Section 4d. sellerRating is null and sellerReviewCount is 0
  // for a seller with zero reviews; render nothing in that case rather than
  // a misleading "0★".
  sellerRating: number | null;
  sellerReviewCount: number;
  // Derived from sale_listings.is_boosted/boost_expires_at (see
  // utils/listing-boost.ts's deriveIsBoosted) — already accounts for
  // expiry, so this is safe to treat as "currently boosted" as-is, no
  // further date checking needed by consumers.
  isBoosted: boolean;
  // Mirrors sale_listings.payment_method — cash_only is the common,
  // unremarkable case (no badge shown for it); cash_and_etransfer gets a
  // small badge on the card/detail page since it's the noteworthy option.
  paymentMethod: PaymentMethod;
};

// isNew is only ever set by the Matches for You screen (a listing that
// matched a saved search within the last day) — every other caller omits
// it, so the badge/border stay invisible everywhere else. spotlightId is
// only ever passed for Discover's first feed card (see index.tsx) — the
// onboarding tour's "favorite this one" stop needs exactly one real target.
export function SaleCard({
  sale,
  isNew = false,
  spotlightId,
}: {
  sale: MockSale;
  isNew?: boolean;
  spotlightId?: string;
}) {
  const hotTier = deriveHotTier(sale.favoriteCount);
  // Every disabled instance needs its own unique fallback id — see the
  // matching comment in event-card.tsx for why a shared constant would
  // unregister the one real card's already-registered target.
  const heartSpotlight = useSpotlightTarget(spotlightId ?? `sale-card-heart-inactive-${sale.id}`, spotlightId !== undefined);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        hotTier && styles.cardHot,
        isNew && styles.cardNew,
        pressed && styles.cardPressed,
      ]}
      onPress={() => router.push({ pathname: '/sale/[id]', params: { id: sale.id } })}>
      {hotTier && (
        <View style={styles.hotBadge}>
          <PriceTag label={HOT_TIER_LABELS[hotTier]} variant={hotTier} rotate={-3} />
        </View>
      )}
      {sale.photos[0] ? (
        <Image source={{ uri: sale.photos[0] }} style={styles.thumb} resizeMode="cover" />
      ) : (
        <View style={styles.thumb}>
          <Ionicons name={sale.icon} size={20} color={Colors.amberIcon} />
        </View>
      )}
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {sale.title}
          </Text>
          {isNew && <PriceTag label="New" variant="new" rotate={-2} />}
        </View>
        <Text style={styles.sub}>
          {sale.distanceKm}km &middot; {formatSaleSchedule(sale)}
        </Text>
        <View style={styles.footerRow}>
          <PriceTag label={sale.tagLabel} variant={sale.tagVariant} rotate={-2} />
          {sale.isBoosted && <PriceTag label="⭐ Featured" variant="boosted" rotate={-2} />}
          {sale.eventId !== null && <PriceTag label="Community sale" variant="town" rotate={-2} />}
          {sale.paymentMethod === 'cash_and_etransfer' && (
            <PriceTag label="💸 Cash + e-Transfer" variant="etransfer" rotate={-2} />
          )}
        </View>
        <Text style={styles.categories} numberOfLines={2}>
          {sale.categories.join(' · ')}
        </Text>
        {sale.sellerReviewCount > 0 && (
          <Text style={styles.ratingText}>
            {sale.sellerRating?.toFixed(1)}★ · {sale.sellerReviewCount} review{sale.sellerReviewCount === 1 ? '' : 's'}
          </Text>
        )}
        <View ref={heartSpotlight.ref} onLayout={heartSpotlight.onLayout} style={styles.interestRow}>
          <Ionicons name={hotTier ? 'heart' : 'heart-outline'} size={12} color={Colors.interestPink} />
          <Text style={styles.interestText}>
            {sale.favoriteCount} {sale.favoriteCount === 1 ? 'person' : 'people'} interested
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.tan,
    borderRadius: 14,
    padding: 10,
    marginBottom: 10,
  },
  cardPressed: {
    opacity: 0.75,
  },
  cardHot: {
    paddingTop: 30,
  },
  cardNew: {
    borderColor: Colors.violet,
  },
  hotBadge: {
    position: 'absolute',
    top: -9,
    left: 10,
    zIndex: 2,
  },
  thumb: {
    width: 46,
    height: 46,
    borderRadius: 10,
    backgroundColor: Colors.amberBg,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  body: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  title: {
    flex: 1,
    fontFamily: Fonts.displaySemiBold,
    fontSize: 14,
    color: Colors.ink,
  },
  sub: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.muted,
    marginTop: 2,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  categories: {
    fontFamily: Fonts.body,
    fontSize: 10,
    color: Colors.muted,
    marginTop: 4,
  },
  ratingText: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 11,
    color: Colors.marigold,
    marginTop: 2,
  },
  interestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  interestText: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 11,
    color: Colors.interestPink,
  },
});
