import { StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts, PriceTagVariant, PriceTagVariantColors } from '@/constants/brand';

type PriceTagProps = {
  label: string;
  variant?: PriceTagVariant;
  rotate?: number;
};

// Escalating intensity for the three hot-listing tiers only — every other
// variant uses the baseline (1.5 border, no alpha boost, regular weight),
// same look as before this became a tiered system. Border thickness AND
// color saturation AND text weight all step up together so Inferno reads
// as noticeably more intense than Hot Listing, not just a relabeled badge.
const HOT_TIER_INTENSITY: Partial<Record<PriceTagVariant, { borderWidth: number; alphaBoost: number; bold: boolean }>> = {
  hot: { borderWidth: 1.5, alphaBoost: 0, bold: false },
  blazingHot: { borderWidth: 2.25, alphaBoost: 0.15, bold: true },
  infernoHot: { borderWidth: 3, alphaBoost: 0.3, bold: true },
};

export function PriceTag({ label, variant = 'category', rotate = -3 }: PriceTagProps) {
  const accent = PriceTagVariantColors[variant];
  const dashed = variant === 'draft';
  const intensity = HOT_TIER_INTENSITY[variant];
  const alphaBoost = intensity?.alphaBoost ?? 0;

  return (
    <View style={[styles.wrapper, { transform: [{ rotate: `${rotate}deg` }] }]}>
      <View
        style={[
          styles.tape,
          {
            backgroundColor: withAlpha(accent, 0.22 + alphaBoost),
            borderColor: withAlpha(accent, 0.35 + alphaBoost),
          },
        ]}
      />
      <View
        style={[
          styles.tag,
          {
            borderWidth: intensity?.borderWidth ?? 1.5,
            borderColor: withAlpha(accent, 0.4 + alphaBoost),
            borderStyle: dashed ? 'dashed' : 'solid',
          },
        ]}>
        <View style={[styles.dot, { backgroundColor: withAlpha(accent, 0.55 + alphaBoost) }]} />
        <Text style={[styles.label, intensity?.bold && styles.labelBold]}>{label}</Text>
      </View>
    </View>
  );
}

function withAlpha(hex: string, alpha: number) {
  const clean = hex.replace('#', '');
  const bigint = parseInt(
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean,
    16
  );
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  tape: {
    position: 'absolute',
    top: -7,
    left: 6,
    width: 30,
    height: 11,
    borderWidth: 1,
    transform: [{ rotate: '-6deg' }],
  },
  tag: {
    backgroundColor: Colors.paper,
    borderWidth: 1.5,
    borderRadius: 3,
    paddingVertical: 4,
    paddingHorizontal: 10,
    paddingLeft: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    position: 'absolute',
    left: 5,
    top: '50%',
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: -2.5,
  },
  label: {
    fontFamily: Fonts.tag,
    fontSize: 12,
    color: Colors.ink,
  },
  labelBold: {
    fontFamily: Fonts.tagBold,
  },
});
