// react-native-purchases has no web target — see purchases.ts's header
// comment. There's no StoreKit/Play Billing in a browser, so every export
// here is a safe no-op / always-unavailable stub with the same signatures.
export const AD_FREE_ENTITLEMENT_ID = 'ad_free';

export function isPurchasesAvailable(): boolean {
  return false;
}

export function syncPurchasesUser(_userId: string): void {}

export async function purchaseAdFree(): Promise<void> {
  throw new Error('Removing ads is not available on this platform yet.');
}

export async function restorePurchases(): Promise<void> {}

export async function isAdFreeFromSdk(): Promise<boolean> {
  return false;
}

export function subscribeToCustomerInfoUpdates(_listener: (isAdFree: boolean) => void): () => void {
  return () => {};
}
