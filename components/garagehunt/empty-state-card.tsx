import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PriceTag } from '@/components/garagehunt/price-tag';
import { Colors, Fonts, PriceTagVariant } from '@/constants/brand';

// Shared "nothing here yet" visual — a PriceTag flourish (the same
// masking-tape tag shape used for every badge in the app) plus heading,
// subtext, and a prominent CTA, rather than a bare line of text. Used by
// Discover's two distinct empty states (feature spec Section 4a) and My
// Listings', so all three read as one consistent brand moment instead of
// looking like three separately-designed dead ends.
export function EmptyStateCard({
  tagLabel,
  tagVariant,
  heading,
  subtext,
  ctaLabel,
  onPressCta,
}: {
  tagLabel: string;
  tagVariant: PriceTagVariant;
  heading: string;
  subtext: string;
  ctaLabel: string;
  onPressCta: () => void;
}) {
  return (
    <View style={styles.container}>
      <PriceTag label={tagLabel} variant={tagVariant} rotate={-4} />
      <Text style={styles.heading}>{heading}</Text>
      <Text style={styles.subtext}>{subtext}</Text>
      <Pressable style={styles.cta} onPress={onPressCta}>
        <Text style={styles.ctaLabel}>{ctaLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 48,
    paddingBottom: 24,
  },
  heading: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 17,
    color: Colors.ink,
    textAlign: 'center',
    marginTop: 14,
    marginBottom: 6,
  },
  subtext: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.muted,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  cta: {
    backgroundColor: Colors.coral,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  ctaLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 13,
    color: '#fff',
  },
});
