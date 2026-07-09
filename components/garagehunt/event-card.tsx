import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts } from '@/constants/brand';
import { formatDisplayDate } from '@/utils/parse-sale-form-input';
import { TownWideEvent } from '@/utils/town-wide-events';

export function EventCard({ event, participantCount }: { event: TownWideEvent; participantCount: number }) {
  const dateLabel =
    event.startDate === event.endDate
      ? formatDisplayDate(event.startDate)
      : `${formatDisplayDate(event.startDate)} – ${formatDisplayDate(event.endDate)}`;

  return (
    <Pressable
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
