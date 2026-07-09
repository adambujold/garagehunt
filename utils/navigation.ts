import { Href, router } from 'expo-router';

// Guards every back button against a real crash: if a screen was reached via
// router.replace() (wiping the history entry it would otherwise pop back
// into), router.back() throws "The action 'GO_BACK' was not handled by any
// navigator" and leaves navigation completely stuck, requiring a force-quit
// to recover. Falls back to a safe default route instead of crashing when
// there's genuinely nothing to go back to.
export function goBack(fallbackHref: Href = '/') {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallbackHref);
  }
}
