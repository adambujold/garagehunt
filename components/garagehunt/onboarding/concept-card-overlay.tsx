import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Fonts, PriceTagVariantColors } from '@/constants/brand';

// Part B of the first-time tour (feature spec Section 2) — illustrated
// concept cards for mechanics that need something to already exist to
// demonstrate live, unlike Part A's SpotlightOverlay which points at real
// on-screen elements. Not tied to any live data, so this works identically
// for a brand-new account with zero listings/check-ins/reviews yet.
type ConceptCard = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconBg: string;
  eyebrow: string;
  title: string;
  body: string;
};

const CARDS: ConceptCard[] = [
  {
    icon: 'flame',
    // Same orange as the real Hot Listing badge (PriceTagVariantColors.hot)
    // — not a standalone color choice, since this card is literally
    // previewing that exact badge.
    iconBg: PriceTagVariantColors.hot,
    eyebrow: 'Hot Listing tiers',
    title: '🔥 → 🔥🔥 → 🔥🔥🔥',
    body: 'Real momentum sellers can watch build — the more buyers who favorite a sale, the hotter its badge gets.',
  },
  {
    icon: 'ribbon',
    iconBg: Colors.violet,
    eyebrow: 'Shopper tiers & check-ins',
    title: 'Regular → Trusted Shopper → Super Shopper',
    body: 'Earned by GPS-verified check-ins at sales you actually visit — not just browsing, real footsteps.',
  },
  {
    icon: 'notifications',
    iconBg: Colors.coral,
    eyebrow: '"I’m Looking For" + notifications',
    title: 'Set it once, get pushed the moment it shows up',
    body: 'Tell the app what you want. The moment a matching sale goes live nearby, you get notified — no more manually checking.',
  },
  {
    icon: 'shield-checkmark',
    iconBg: Colors.jade,
    eyebrow: 'Trust & safety',
    title: 'A real community, not just a marketplace',
    body: 'Verified reviews, GPS-confirmed check-ins, and address-reveal timing that protects sellers keep it that way.',
  },
];

export function ConceptCardOverlay({
  visible,
  cardIndex,
  onNext,
  onSkip,
}: {
  visible: boolean;
  cardIndex: number;
  onNext: () => void;
  onSkip: () => void;
}) {
  const card = CARDS[cardIndex];
  const isLast = cardIndex === CARDS.length - 1;

  return (
    <Modal transparent animationType="fade" visible={visible} statusBarTranslucent onRequestClose={onSkip}>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <Text style={styles.stepLabel}>
              {cardIndex + 1} of {CARDS.length}
            </Text>
            <View style={[styles.iconCircle, { backgroundColor: card.iconBg }]}>
              <Ionicons name={card.icon} size={30} color="#fff" />
            </View>
            <Text style={styles.eyebrow}>{card.eyebrow}</Text>
            <Text style={styles.title}>{card.title}</Text>
            <Text style={styles.body}>{card.body}</Text>

            <View style={styles.buttonRow}>
              <Pressable onPress={onSkip} hitSlop={8}>
                <Text style={styles.skipLabel}>Skip</Text>
              </Pressable>
              <Pressable style={styles.nextButton} onPress={onNext}>
                <Text style={styles.nextButtonLabel}>{isLast ? 'Get Started' : 'Next'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(26, 16, 48, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: Colors.ink,
    padding: 24,
    alignItems: 'center',
  },
  stepLabel: {
    alignSelf: 'flex-start',
    // Work Sans, not Fredoka — see spotlight-overlay.tsx's matching comment.
    fontFamily: Fonts.bodySemiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: Colors.muted,
    marginBottom: 12,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  eyebrow: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: Colors.violet,
    marginBottom: 6,
    textAlign: 'center',
  },
  title: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 18,
    color: Colors.ink,
    textAlign: 'center',
    marginBottom: 10,
  },
  body: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.mutedDark,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 22,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  skipLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 13,
    color: Colors.muted,
  },
  nextButton: {
    backgroundColor: Colors.coral,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  nextButtonLabel: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 13,
    color: '#fff',
  },
});
