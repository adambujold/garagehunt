import { supabase } from '@/utils/supabase';

// Mirrors public.users.has_completed_onboarding (see migration
// 0027_onboarding.sql) — gates the first-time hybrid spotlight/concept-card
// tour (feature spec Section 2). .maybeSingle(), not .single() — same
// PGRST116 gotcha as the rest of this codebase's public.users lookups when
// a signed-in account's row hasn't been backfilled yet; defaults to true
// (tour already "done") rather than false, since surfacing an unwanted tour
// is worse than silently skipping a genuinely-new user's one in this edge
// case.
export async function fetchHasCompletedOnboarding(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('users')
    .select('has_completed_onboarding')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.has_completed_onboarding ?? true;
}

// Called once, on finishing the tour OR hitting Skip at any point in either
// part — both count as "done," per the technical architecture doc.
export async function markOnboardingCompleted(userId: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ has_completed_onboarding: true })
    .eq('id', userId);
  if (error) throw error;
}
