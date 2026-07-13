import { useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';

import { useSpotlightRegistry } from '@/contexts/spotlight-registry';

// Attach both `ref` and `onLayout` to a real on-screen element to make it a
// valid onboarding tour stop under `id` — see contexts/spotlight-registry.tsx
// for why a registry (rather than hardcoded coordinates) is what lets the
// tour skip an element that genuinely isn't rendered for this user right now.
//
// enabled defaults to true; pass false to skip measuring/registering
// entirely (e.g. SaleCard only wants its very first list item to register
// as the sample listing's heart, not every card).
export function useSpotlightTarget(id: string, enabled: boolean = true) {
  const ref = useRef<View>(null);
  const { registerTarget, unregisterTarget } = useSpotlightRegistry();

  useEffect(() => {
    if (!enabled) unregisterTarget(id);
    return () => unregisterTarget(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, enabled]);

  const onLayout = useCallback(() => {
    if (!enabled) return;
    // measureInWindow needs to run after the layout pass this onLayout
    // callback fires within has actually committed to the native side —
    // calling it synchronously here can read stale (often zeroed) values.
    requestAnimationFrame(() => {
      ref.current?.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) registerTarget(id, { x, y, width, height });
      });
    });
  }, [id, enabled, registerTarget]);

  return { ref, onLayout };
}
