import { useCallback, useEffect, useMemo, useState } from 'react';

import { ConceptCardOverlay } from '@/components/garagehunt/onboarding/concept-card-overlay';
import { SpotlightOverlay } from '@/components/garagehunt/onboarding/spotlight-overlay';
import { useSpotlightRegistry } from '@/contexts/spotlight-registry';
import { fetchHasCompletedOnboarding, markOnboardingCompleted } from '@/utils/onboarding';

// Part A step order per feature spec Section 2 — target ids match the
// useSpotlightTarget calls wired into (tabs)/_layout.tsx, discover-map.tsx,
// index.tsx, and sale-card.tsx. Copy quoted in the spec is used verbatim as
// the body text; the tab stops and the map/list toggle have no bubble copy
// specified there, so those bodies are this implementation's own minimal
// wording, not spec quotes.
const PART_A_STEPS: { targetId: string; title: string; body: string }[] = [
  { targetId: 'tab-discover', title: 'Discover', body: 'Browse every sale near you — this is home base.' },
  {
    targetId: 'tab-looking-for',
    title: "I'm Looking For",
    body: "Tell the app what you want and get notified the moment it's listed nearby.",
  },
  { targetId: 'tab-list-sale', title: 'List a Sale', body: 'Get your own sale live in under 3 minutes.' },
  { targetId: 'tab-profile', title: 'Profile', body: 'Track your shopper tier, your listings, and your settings.' },
  { targetId: 'map', title: 'The map', body: 'Every sale near you, live.' },
  { targetId: 'view-toggle', title: 'Map or list', body: 'Switch between map and list view anytime.' },
  {
    targetId: 'sale-card-heart',
    title: 'Favorite listings',
    body: "Favorite the ones you don't want to miss — enough interest and a listing goes 🔥 Hot.",
  },
  {
    targetId: 'event-card',
    title: 'Town-wide events',
    body: 'One card, dozens of sales — team up with neighbors and find the whole event without hunting down each seller one by one.',
  },
  {
    targetId: 'plan-route-button',
    title: 'Plan my route',
    body: 'Let the app map your whole Saturday, or build your own stop by stop.',
  },
];

const CONCEPT_CARD_COUNT = 4;

type TourStatus = 'checking' | 'hidden' | 'partA' | 'partB';

// Gates the whole hybrid spotlight/concept-card tour behind
// public.users.has_completed_onboarding (see migration 0027_onboarding.sql)
// — shown once ever, skip available throughout, "Get Started" as the final
// action (see ConceptCardOverlay).
//
// ready should stay false until Discover's own data (listings, nearby
// events) has had a real chance to load — starting the status check earlier
// risks evaluating Part A's steps before the sample listing/event card
// targets have ever had a chance to register, which would skip them even
// though they'd genuinely be on screen a moment later.
export function OnboardingTour({ userId, ready }: { userId: string; ready: boolean }) {
  const { targets } = useSpotlightRegistry();
  const [status, setStatus] = useState<TourStatus>('checking');
  const [partAStepIndex, setPartAStepIndex] = useState(0);
  const [partBIndex, setPartBIndex] = useState(0);

  useEffect(() => {
    if (!ready || status !== 'checking') return;
    let cancelled = false;
    fetchHasCompletedOnboarding(userId)
      .then((completed) => {
        if (cancelled || completed) {
          if (!cancelled) setStatus('hidden');
          return;
        }
        // Real on-screen targets (the map, the sample listing's heart, etc.)
        // register asynchronously via requestAnimationFrame after their
        // first paint — this buffer guarantees Part A only starts
        // evaluating availability once that's had a chance to settle, so a
        // genuinely-present element is never mistaken for absent purely
        // because its onLayout callback hasn't resolved yet. In the real
        // (non-debug) flow, fetchHasCompletedOnboarding's own network
        // round-trip already provides most of this buffer incidentally —
        // this makes it a guarantee rather than something relying on
        // incidental timing.
        setTimeout(() => {
          if (!cancelled) setStatus('partA');
        }, 400);
      })
      .catch((err) => {
        // Never let a failed check block the whole app behind an infinite
        // "checking" state — worst case a returning user sees the tour
        // again once, which is far better than Discover being unusable.
        console.error('Failed to check has_completed_onboarding', err);
        if (!cancelled) setStatus('hidden');
      });
    return () => {
      cancelled = true;
    };
  }, [ready, status, userId]);

  const finish = useCallback(() => {
    setStatus('hidden');
    markOnboardingCompleted(userId).catch((err) => console.error('Failed to mark onboarding completed', err));
  }, [userId]);

  // The first Part A step (at or after partAStepIndex) whose target is
  // actually registered right now — an id with no rect means that element
  // genuinely isn't on screen for this user (e.g. no nearby town-wide
  // event), so it's skipped rather than spotlighting nothing.
  const currentPartAStep = useMemo(() => {
    if (status !== 'partA') return null;
    for (let i = partAStepIndex; i < PART_A_STEPS.length; i++) {
      const rect = targets[PART_A_STEPS[i].targetId];
      if (rect) return { ...PART_A_STEPS[i], rect, index: i };
    }
    return null;
  }, [status, partAStepIndex, targets]);

  // Every remaining Part A step is currently unavailable (either none of
  // them ever registered, or they've all been stepped through) — move on to
  // Part B rather than leaving the tour stuck with nothing to show.
  useEffect(() => {
    if (status === 'partA' && !currentPartAStep) setStatus('partB');
  }, [status, currentPartAStep]);

  const handlePartANext = () => {
    if (!currentPartAStep) return;
    const nextIndex = currentPartAStep.index + 1;
    if (nextIndex >= PART_A_STEPS.length) {
      setStatus('partB');
    } else {
      setPartAStepIndex(nextIndex);
    }
  };

  const handlePartBNext = () => {
    if (partBIndex + 1 >= CONCEPT_CARD_COUNT) {
      finish();
    } else {
      setPartBIndex((i) => i + 1);
    }
  };

  if (status === 'partA' && currentPartAStep) {
    return (
      <SpotlightOverlay
        visible
        targetRect={currentPartAStep.rect}
        title={currentPartAStep.title}
        body={currentPartAStep.body}
        stepNumber={currentPartAStep.index + 1}
        stepCount={PART_A_STEPS.length}
        onNext={handlePartANext}
        onSkip={finish}
      />
    );
  }

  if (status === 'partB') {
    return <ConceptCardOverlay visible cardIndex={partBIndex} onNext={handlePartBNext} onSkip={finish} />;
  }

  return null;
}
