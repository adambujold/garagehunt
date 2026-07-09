/**
 * GarageHunt brand tokens — see garagehunt-brand-identity.html and
 * garagehunt-reskinned-screens.html for the source design reference.
 */

export const Colors = {
  lavender: '#EDE3F5',
  paper: '#FFF8E7',
  ink: '#2B1B4D',
  nearBlack: '#1A1030',
  coral: '#FF6B4A',
  jade: '#0F9D8B',
  violet: '#7B5FD9',
  marigold: '#FFC53D',
  tan: '#F0DFC0',
  tanBorder: '#D9C6A0',
  violetBorder: '#C6B2E8',
  amberBg: '#FFEFD1',
  amberText: '#8A5A00',
  amberIcon: '#C98A00',
  amberFieldBg: '#FFF3D6',
  amberFieldBorder: '#E0BE7A',
  amberFieldAccent: '#C9A65F',
  muted: '#8A7A9E',
  mutedDark: '#5B4A7A',
  mutedLight: '#B8A8CC',
  interestPink: '#D4537E',
} as const;

export const Fonts = {
  displayMedium: 'Fredoka_500Medium',
  displaySemiBold: 'Fredoka_600SemiBold',
  body: 'WorkSans_400Regular',
  bodyMedium: 'WorkSans_500Medium',
  bodySemiBold: 'WorkSans_600SemiBold',
  script: 'Caveat_600SemiBold',
  tag: 'Kalam_400Regular',
  // Used by PriceTag for the two upper hot-listing tiers only — see
  // HOT_TIER_INTENSITY in price-tag.tsx. Every other tag stays regular
  // weight.
  tagBold: 'Kalam_700Bold',
} as const;

export type PriceTagVariant =
  | 'live'
  | 'town'
  | 'new'
  | 'scheduled'
  | 'draft'
  | 'ended'
  | 'cancelled'
  | 'category'
  | 'hot'
  | 'blazingHot'
  | 'infernoHot'
  | 'organizer';

export const PriceTagVariantColors: Record<PriceTagVariant, string> = {
  live: Colors.jade,
  town: Colors.violet,
  new: Colors.coral,
  scheduled: '#23407A',
  draft: Colors.mutedDark,
  ended: '#8A8272',
  cancelled: '#A8493E',
  category: Colors.tanBorder,
  // Escalating saturation/darkness across the three hot tiers — Inferno
  // should read as visually hotter than Hot Listing, not just relabeled.
  hot: '#E05A1E',
  blazingHot: '#C7360A',
  infernoHot: '#9E1B0A',
  // Shares "town"'s violet — organizer status is directly about town-wide
  // events, so the same accent reads as intentional, not coincidental.
  organizer: Colors.violet,
};

// Three-tier "Hot listing" progression (feature spec Section 4d: "once a
// listing's favorite count crosses a threshold... tunable" — now three
// escalating thresholds instead of one). Named here, not scattered, so
// SaleCard, Sale Detail, and My Listings all derive from the same source.
// See utils/hot-tier.ts for the derivation logic built on these.
export const HOT_TIER_THRESHOLDS = {
  hot: 11,
  blazingHot: 26,
  infernoHot: 51,
} as const;

// Shopper tier thresholds, keyed off users.buyer_checkin_count (see
// supabase/migrations/0009_check_ins_and_buyer_ratings.sql). Not from either
// doc — see that migration's header comment. Named here, not inlined, so
// Profile's badge/progress copy and the tier explainer read from one source.
export const SHOPPER_TIER_THRESHOLDS = {
  regular: 10,
  trustedShopper: 100,
  superShopper: 250,
} as const;
