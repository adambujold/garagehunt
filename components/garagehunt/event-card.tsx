import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts } from '@/constants/brand';
import { useSpotlightTarget } from '@/hooks/use-spotlight-target';
import { formatDisplayDate } from '@/utils/parse-sale-form-input';
import { TownWideEvent } from '@/utils/town-wide-events';

// spotlightId is only ever passed for the first card in Discover's nearby-
// events list (see index.tsx) — the onboarding tour's "town-wide event
// card" stop needs exactly one real target, not one per event.
export function EventCard({
  event,
  participantCount,
  spotlightId,
}: {
  event: TownWideEvent;
  participantCount: number;
  spotlightId?: string;
}) {
  const dateLabel =
    event.startDate === event.endDate
      ? formatDisplayDate(event.startDate)
      : `${formatDisplayDate(event.startDate)} – ${formatDisplayDate(event.endDate)}`;
  // Every disabled instance needs its own unique fallback id (not a shared
  // constant) — useSpotlightTarget unregisters its id on mount when
  // disabled, and a shared id would unregister the one real card's already-
  // registered target the moment a second, disabled card mounts.
  const spotlight = useSpotlightTarget(spotlightId ?? `event-card-inactive-${event.id}`, spotlightId !== undefined);

  return (
    <Pressable
      ref={spotlight.ref}
      onLayout={spotlight.onLayout}
      style={styles.card}
      onPress={() => router.push({ pathname: '/event/[id]', params: { id: event.id } })}>
      <View style={styles.iconCircle}>
        <Ionicons name="people" size={16} color="#fff" />
      </View>
      <View style={styles.textBlock}>
        <Text style={styles.title} numberOfLines={1}>
          {event.name}
        </Text>
        <Text style={styles.subtitle}>
          {participantCount} {participantCount === 1 ? 'home' : 'homes'} participating &middot; {dateLabel}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.violet} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.lavender,
    borderWidth: 2,
    borderColor: Colors.violetBorder,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.violet,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textBlock: {
    flex: 1,
  },
  title: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 13,
    color: Colors.ink,
  },
  subtitle: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.mutedDark,
    marginTop: 2,
  },
});
