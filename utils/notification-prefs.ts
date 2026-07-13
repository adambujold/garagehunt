import { supabase } from '@/utils/supabase';

// Real per-user preference now (users.notification_prefs, migration 0018) —
// this used to be an AsyncStorage-only placeholder before push notifications
// existed to gate. send-match-notification (the Edge Function that actually
// sends) checks this same field before sending to any of a user's tokens.
//
// A single push_enabled key today, stored in a jsonb column rather than a
// plain boolean so a future preference (e.g. a digest-frequency setting)
// doesn't need a schema migration to add — but since that's the only key
// anything reads or writes right now, setNotificationsEnabled overwrites the
// whole object rather than merge-patching it. Revisit if a second key shows
// up.

export async function getNotificationsEnabled(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('users')
    .select('notification_prefs')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  // No row (a signed-in auth.users account without a public.users row yet)
  // defaults to enabled — .single() would instead throw PGRST116 on this
  // exact case, same failure mode fixed in utils/ad-free.ts.
  return data?.notification_prefs?.push_enabled ?? true;
}

export async function setNotificationsEnabled(userId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ notification_prefs: { push_enabled: enabled } })
    .eq('id', userId);
  if (error) throw error;
}
