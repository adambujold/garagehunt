import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';

// Shared registry that real on-screen elements (tab bar icons, the map, the
// favorite heart on a sample listing, etc.) report their measured
// window-space rect into, keyed by a stable string id. The onboarding tour
// (components/garagehunt/onboarding) reads from this rather than hardcoding
// positions — an id with no registered rect means that element genuinely
// isn't on screen right now (e.g. no town-wide event nearby), which is what
// lets the tour skip a step gracefully instead of pointing at nothing.
//
// Mounted once in app/(tabs)/_layout.tsx, wrapping <Tabs> — that's the
// lowest common ancestor of both the tab bar itself (rendered by <Tabs>)
// and every individual tab screen's content, which is why a target
// registered from inside index.tsx (e.g. the map) and one registered from
// the tab bar icon render prop can both be read by the same tour.
export type SpotlightRect = { x: number; y: number; width: number; height: number };

type SpotlightRegistryValue = {
  targets: Record<string, SpotlightRect>;
  registerTarget: (id: string, rect: SpotlightRect) => void;
  unregisterTarget: (id: string) => void;
};

const SpotlightRegistryContext = createContext<SpotlightRegistryValue | null>(null);

export function SpotlightRegistryProvider({ children }: { children: ReactNode }) {
  const [targets, setTargets] = useState<Record<string, SpotlightRect>>({});

  const registerTarget = useCallback((id: string, rect: SpotlightRect) => {
    setTargets((current) => {
      const existing = current[id];
      // Skip the state update (and the re-render it'd cause on every
      // consumer) when a target re-measures to the exact same rect it
      // already had — onLayout can fire repeatedly for reasons unrelated to
      // actual position (e.g. a FlatList re-render).
      if (
        existing &&
        existing.x === rect.x &&
        existing.y === rect.y &&
        existing.width === rect.width &&
        existing.height === rect.height
      ) {
        return current;
      }
      return { ...current, [id]: rect };
    });
  }, []);

  const unregisterTarget = useCallback((id: string) => {
    setTargets((current) => {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ targets, registerTarget, unregisterTarget }),
    [targets, registerTarget, unregisterTarget]
  );

  return <SpotlightRegistryContext.Provider value={value}>{children}</SpotlightRegistryContext.Provider>;
}

export function useSpotlightRegistry(): SpotlightRegistryValue {
  const ctx = useContext(SpotlightRegistryContext);
  if (!ctx) {
    throw new Error('useSpotlightRegistry must be used within a SpotlightRegistryProvider');
  }
  return ctx;
}
