import { Platform } from 'react-native';
import Purchases, { CustomerInfo, PurchasesPackage } from 'react-native-purchases';

// GarageHunt — ad-free subscription purchase flow (technical architecture
// doc Section 4, Monetization Data Model). RevenueCat sits on top of native
// App Store/Play Store billing; supabase/functions/revenuecat-webhook is the
// server-side half that actually persists the entitlement to
// users.is_ad_free/ad_free_expires_at once a purchase completes.
//
// iOS and Android both live now — Google Play products can be created and
// service account linking is in progress, so EXPO_PUBLIC_REVENUECAT_ANDROID_KEY
// is a real (if not-yet-populated) env var. getApiKeyForPlatform() returning
// null is what makes every export below a safe no-op on a platform without a
// configured key: no crash, no purchase option shown, same "gracefully
// absent" treatment discover-ad-card.tsx already gives a missing AdMob unit
// id — this is what keeps Android purchases harmlessly disabled again if the
// Android key is ever unset (e.g. a fresh .env checkout before it's filled
// in), no separate flag needed.
//
// react-native-purchases has no web target at all — see purchases.web.ts
// for the stub, following the same per-platform-file pattern already
// established for react-native-google-mobile-ads and expo-notifications.

export const AD_FREE_ENTITLEMENT_ID = 'ad_free';

// Store product ids differ by platform, not just convention — Android
// subscriptions carry a ":<basePlanId>" suffix on top of the product id
// (Play Console's own product.identifier format), and the Boost product
// happened to be created in Play Console under a different id than its App
// Store counterpart. Matched against PurchasesPackage.product.identifier in
// findPackageByProductId below, which is exactly what react-native-purchases
// reports per platform, so this has to track the real per-store ids exactly
// rather than a single shared constant.
export const AD_FREE_PRODUCT_ID =
  Platform.select({
    ios: 'com.garagehunt.app.adfree.monthly',
    android: 'com.garagehunt.app.adfree.monthly:monthly',
  }) ?? 'com.garagehunt.app.adfree.monthly';
export const BOOST_PRODUCT_ID =
  Platform.select({
    ios: 'com.garagehunt.app.boost',
    android: 'com.garagehunt.app.boost.48h',
  }) ?? 'com.garagehunt.app.boost';

function getApiKeyForPlatform(): string | null {
  // `|| null`, not `?? null` — an unset env var and an env var explicitly
  // set to an empty string both need to fall through to null here (the
  // Android key starts out present-but-empty in .env until RevenueCat's
  // Android app actually exists to generate a real one from).
  if (Platform.OS === 'ios') return process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || null;
  if (Platform.OS === 'android') return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || null;
  return null;
}

export function isPurchasesAvailable(): boolean {
  return getApiKeyForPlatform() !== null;
}

let configured = false;

// "On login/app open", same as registerForPushNotificationsAsync — call on
// every session, not just the first ever sign-in, so switching accounts
// within the same app run re-links RevenueCat's appUserID via logIn()
// rather than silently staying attached to the previous user.
export function syncPurchasesUser(userId: string): void {
  const apiKey = getApiKeyForPlatform();
  if (!apiKey) return;

  if (!configured) {
    Purchases.configure({ apiKey, appUserID: userId });
    configured = true;
    return;
  }

  Purchases.logIn(userId).catch((err) => console.error('Failed to sync RevenueCat user', err));
}

// Must be called on sign-out, before the next person can sign in on this
// device — without this, RevenueCat stays identified as whoever was
// signed in last, and the next account to sign in inherits that person's
// entitlement via logIn() (confirmed as a real bug: Account B was reading
// as ad-free purely because Account A had purchased it earlier on the same
// device). logOut() resets the SDK to a fresh anonymous identity, so the
// next syncPurchasesUser() call re-identifies cleanly instead of reusing
// the previous person's customer record.
export function signOutPurchasesUser(): void {
  if (!isPurchasesAvailable()) return;
  // Nothing to log out of if configure() was never called this app
  // session (e.g. the app launched straight to a signed-out state).
  if (!configured) return;

  Purchases.logOut().catch((err) => console.error('Failed to sign out RevenueCat user', err));
}

// Matched by the underlying store product id, not array position — with
// two distinct one-time-purchasable products now living in the same
// "default" offering (ad-free monthly, listing boost), grabbing
// availablePackages[0] would silently purchase whichever one happened to
// be listed first. This is deliberately explicit instead.
async function findPackageByProductId(productId: string): Promise<PurchasesPackage> {
  const offerings = await Purchases.getOfferings();
  const match = offerings.current?.availablePackages.find((pkg) => pkg.product.identifier === productId);
  if (!match) {
    throw new Error('That purchase is not available right now. Please try again later.');
  }
  return match;
}

export async function purchaseAdFree(): Promise<void> {
  if (!isPurchasesAvailable()) {
    throw new Error('Removing ads is not available on this platform yet.');
  }

  const adFreePackage = await findPackageByProductId(AD_FREE_PRODUCT_ID);
  await Purchases.purchasePackage(adFreePackage);
}

// Boost is a one-time consumable purchase tied to a specific listing, not
// an account-wide entitlement — see supabase/migrations/0022_listing_boost.sql
// for why this doesn't use a RevenueCat entitlement at all. This only
// drives the actual App Store/StoreKit transaction; applying the boost to
// a specific listing happens immediately after in
// utils/sale-listings.ts's applyListingBoost, by the caller.
export async function purchaseBoost(): Promise<void> {
  if (!isPurchasesAvailable()) {
    throw new Error('Boosting a listing is not available on this platform yet.');
  }

  const boostPackage = await findPackageByProductId(BOOST_PRODUCT_ID);
  await Purchases.purchasePackage(boostPackage);
}

export async function restorePurchases(): Promise<void> {
  if (!isPurchasesAvailable()) return;
  await Purchases.restorePurchases();
}

// Best-effort, instant local read of this device's entitlement state right
// after a purchase — not the source of truth (see utils/ad-free.ts for
// that), just a way to hide ads immediately instead of waiting for
// revenuecat-webhook's round trip to Supabase to land.
export async function isAdFreeFromSdk(): Promise<boolean> {
  if (!isPurchasesAvailable()) return false;
  const info = await Purchases.getCustomerInfo();
  return info.entitlements.active[AD_FREE_ENTITLEMENT_ID] !== undefined;
}

// Fires immediately whenever RevenueCat's CustomerInfo changes — critically,
// this fires right after purchasePackage()/restorePurchases() resolve, even
// while the screen that triggered the purchase stays mounted/focused the
// whole time. useIsAdFree relies on this instead of only re-fetching on
// screen focus (a useFocusEffect alone missed same-screen purchases
// entirely — confirmed by real-device testing where ads didn't disappear
// until navigating away and back).
export function subscribeToCustomerInfoUpdates(listener: (isAdFree: boolean) => void): () => void {
  if (!isPurchasesAvailable()) return () => {};

  const handler = (info: CustomerInfo) => {
    listener(info.entitlements.active[AD_FREE_ENTITLEMENT_ID] !== undefined);
  };
  Purchases.addCustomerInfoUpdateListener(handler);
  return () => {
    Purchases.removeCustomerInfoUpdateListener(handler);
  };
}
