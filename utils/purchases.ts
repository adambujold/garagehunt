import { Platform } from 'react-native';
import Purchases, { CustomerInfo } from 'react-native-purchases';

// GarageHunt — ad-free subscription purchase flow (technical architecture
// doc Section 4, Monetization Data Model). RevenueCat sits on top of native
// App Store billing; supabase/functions/revenuecat-webhook is the
// server-side half that actually persists the entitlement to
// users.is_ad_free/ad_free_expires_at once a purchase completes.
//
// iOS only for now — Android is blocked on Google's pending bank
// verification, so there's no EXPO_PUBLIC_REVENUECAT_ANDROID_KEY yet.
// getApiKeyForPlatform() returning null on Android is what makes every
// export below a safe no-op there: no crash, no purchase option shown,
// same "gracefully absent" treatment discover-ad-card.tsx already gives a
// missing AdMob unit id.
//
// react-native-purchases has no web target at all — see purchases.web.ts
// for the stub, following the same per-platform-file pattern already
// established for react-native-google-mobile-ads and expo-notifications.

export const AD_FREE_ENTITLEMENT_ID = 'ad_free';

function getApiKeyForPlatform(): string | null {
  if (Platform.OS === 'ios') return process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? null;
  // Platform.OS === 'android' falls through to null deliberately — see this
  // file's header comment.
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

export async function purchaseAdFree(): Promise<void> {
  if (!isPurchasesAvailable()) {
    throw new Error('Removing ads is not available on this platform yet.');
  }

  const offerings = await Purchases.getOfferings();
  const adFreePackage = offerings.current?.availablePackages[0];
  if (!adFreePackage) {
    throw new Error('The ad-free subscription is not available right now. Please try again later.');
  }

  await Purchases.purchasePackage(adFreePackage);
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
