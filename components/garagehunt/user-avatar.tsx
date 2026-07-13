import { Ionicons } from '@expo/vector-icons';
import { Image, ImageStyle, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { Colors, Fonts } from '@/constants/brand';

function deriveInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// Shared avatar display for every spot a user's photo shows — Profile
// header, the checked-in-buyers list, the "neighbors nearby" nudge stack.
// Three-tier fallback: avatarUrl set -> the real photo; no photo but a
// displayName is known -> the existing initials-in-a-circle treatment; no
// photo AND no name (other users' names aren't fetchable client-side — e.g.
// anonymized buyers, or other sellers in the nudge stack) -> a generic
// person icon, matching what those screens already showed before avatars
// existed.
export function UserAvatar({
  avatarUrl,
  displayName,
  size,
  style,
}: {
  avatarUrl?: string | null;
  displayName?: string | null;
  size: number;
  style?: StyleProp<ViewStyle>;
}) {
  const circleStyle = { width: size, height: size, borderRadius: size / 2 };

  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={[circleStyle, style] as StyleProp<ImageStyle>} />;
  }

  if (displayName) {
    return (
      <View style={[styles.fallback, circleStyle, style]}>
        <Text style={[styles.initialsLabel, { fontSize: Math.round(size * 0.33) }]}>{deriveInitials(displayName)}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.fallback, circleStyle, style]}>
      {/* amberText, not amberIcon — matches the initials fallback's text
          color so both no-photo states of this avatar read as the same
          treatment, just with vs. without a known name, not two different
          amber shades. */}
      <Ionicons name="person" size={Math.round(size * 0.47)} color={Colors.amberText} />
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: Colors.amberBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsLabel: {
    fontFamily: Fonts.displaySemiBold,
    color: Colors.amberText,
  },
});
