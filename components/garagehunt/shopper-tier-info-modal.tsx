import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts, SHOPPER_TIER_THRESHOLDS } from '@/constants/brand';

const TIERS = [
  {
    label: 'Regular',
    threshold: SHOPPER_TIER_THRESHOLDS.regular,
    description: 'Check in to sales you actually visit — reach this after your 10th check-in.',
  },
  {
    label: 'Trusted Shopper',
    threshold: SHOPPER_TIER_THRESHOLDS.trustedShopper,
    description: 'A regular fixture at sales around town — reached at 100 check-ins.',
  },
  {
    label: 'Super Shopper',
    threshold: SHOPPER_TIER_THRESHOLDS.superShopper,
    description: 'The top shopper tier — reached at 250 check-ins.',
  },
];

export function ShopperTierInfoModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal transparent animationType="fade" visible statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>How to earn badges</Text>
          <Text style={styles.subtitle}>
            Check in when you&apos;re actually at a sale (Sale Detail shows a &quot;Check in
            here&quot; button once you&apos;re there). Badges are based on your total check-in
            count.
          </Text>
          {TIERS.map((tier) => (
            <View key={tier.label} style={styles.tierRow}>
              <View style={styles.tierBadge}>
                <Text style={styles.tierBadgeLabel}>{tier.label}</Text>
              </View>
              <View style={styles.tierTextBlock}>
                <Text style={styles.tierThreshold}>{tier.threshold}+ check-ins</Text>
                <Text style={styles.tierDescription}>{tier.description}</Text>
              </View>
            </View>
          ))}
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonLabel}>Got it</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(43, 27, 77, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 2,
    borderColor: Colors.tan,
    padding: 20,
  },
  title: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 17,
    color: Colors.ink,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.muted,
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 16,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  tierBadge: {
    backgroundColor: Colors.amberBg,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
    flexShrink: 0,
  },
  tierBadgeLabel: {
    fontFamily: Fonts.displayMedium,
    fontSize: 11,
    color: Colors.amberText,
  },
  tierTextBlock: {
    flex: 1,
  },
  tierThreshold: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: Colors.ink,
  },
  tierDescription: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.mutedDark,
    marginTop: 1,
    lineHeight: 15,
  },
  closeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.coral,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 4,
  },
  closeButtonLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 13,
    color: '#fff',
  },
});
