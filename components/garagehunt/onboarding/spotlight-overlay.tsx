import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Colors, Fonts } from '@/constants/brand';
import { SpotlightRect } from '@/contexts/spotlight-registry';

// Extra breathing room between the target's edges and the circle drawn
// around it — a circle sized to exactly bound the rect reads as clipping
// the element rather than spotlighting it.
const CUTOUT_PADDING = 14;

export function SpotlightOverlay({
  visible,
  targetRect,
  title,
  body,
  stepNumber,
  stepCount,
  onNext,
  onSkip,
}: {
  visible: boolean;
  targetRect: SpotlightRect;
  title: string;
  body: string;
  stepNumber: number;
  stepCount: number;
  onNext: () => void;
  onSkip: () => void;
}) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const cx = targetRect.x + targetRect.width / 2;
  const cy = targetRect.y + targetRect.height / 2;
  const radius = Math.hypot(targetRect.width / 2, targetRect.height / 2) + CUTOUT_PADDING;

  // Keeps the bubble from ever overlapping the cutout it's explaining — flip
  // above/below based on which half of the screen the target sits in, since
  // targets range from the top tab area to the bottom tab bar.
  const bubbleBelow = cy < screenHeight / 2;

  return (
    <Modal transparent animationType="fade" visible={visible} statusBarTranslucent onRequestClose={onSkip}>
      <View style={styles.fill}>
        <Svg width={screenWidth} height={screenHeight} style={StyleSheet.absoluteFill}>
          {/* One path — the full screen, with the spotlight circle as a second
              subpath removed by the even-odd fill rule. This replaces an SVG
              <Mask> whose black circle should have punched a fully transparent
              hole but rendered as a partially dimmed one on Android:
              react-native-svg's mask compositing doesn't reliably produce a
              clean cutout there. Even-odd needs no compositing at all — the
              circle is simply never filled — so the highlighted element shows
              at full brightness on both platforms. */}
          <Path
            d={
              `M0,0 H${screenWidth} V${screenHeight} H0 Z ` +
              `M${cx - radius},${cy} ` +
              `a${radius},${radius} 0 1,0 ${radius * 2},0 ` +
              `a${radius},${radius} 0 1,0 ${-radius * 2},0 Z`
            }
            fill="rgba(26, 16, 48, 0.82)"
            fillRule="evenodd"
          />
          <Circle cx={cx} cy={cy} r={radius} stroke={Colors.coral} strokeWidth={3} fill="none" />
        </Svg>

        <View
          style={[
            styles.bubble,
            bubbleBelow
              ? { top: Math.min(cy + radius + 16, screenHeight - 180) }
              : // Anchor the bubble's BOTTOM edge just above the cutout rather
                // than computing a top from an assumed height. The old version
                // subtracted a hardcoded 140px "bubble height", so any bubble
                // shorter than that floated well above its target — most
                // visible on the bottom-tab steps, where it detached from the
                // tabs it was pointing at.
                { bottom: Math.max(screenHeight - (cy - radius - 16), 16) },
          ]}>
          <Text style={styles.stepLabel}>
            {stepNumber} of {stepCount}
          </Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          <View style={styles.buttonRow}>
            <Pressable onPress={onSkip} hitSlop={8}>
              <Text style={styles.skipLabel}>Skip</Text>
            </Pressable>
            <Pressable style={styles.nextButton} onPress={onNext}>
              <Text style={styles.nextButtonLabel}>Next</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  bubble: {
    position: 'absolute',
    left: 20,
    right: 20,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.ink,
    padding: 16,
  },
  stepLabel: {
    // Small uppercase "eyebrow" labels use Work Sans (body), not Fredoka —
    // matches garagehunt-brand-identity.html's .eyebrow spec and Profile's
    // own sectionTitle ("MY SALES", "SHORTCUTS"); Fredoka is reserved for
    // headlines/UI text, not this style of label.
    fontFamily: Fonts.bodySemiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: Colors.muted,
    marginBottom: 4,
  },
  title: {
    fontFamily: Fonts.displaySemiBold,
    fontSize: 16,
    color: Colors.ink,
    marginBottom: 6,
  },
  body: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.mutedDark,
    lineHeight: 19,
    marginBottom: 14,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
