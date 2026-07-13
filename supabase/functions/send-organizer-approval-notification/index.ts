// GarageHunt — sends a push notification to a seller when their organizer
// application is approved. See
// supabase/migrations/0028_organizer_approval_notification.sql for the
// trigger this is called from, and
// supabase/functions/send-hot-tier-notification for the sibling function
// this mirrors (same token-lookup / notification-prefs / Expo-push-send /
// stale-token-cleanup pattern, just a different trigger source and
// recipient).
//
// Called directly by a pg_net trigger (not a Database Webhook), so the
// payload shape is whatever that trigger's net.http_post body is, not
// Supabase's standard {type, table, record} webhook envelope.
//
// HOW TO DEPLOY: Supabase Dashboard → Edge Functions → "Deploy a new
// function" → name it exactly `send-organizer-approval-notification` →
// paste this file's contents in the editor → Deploy. SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are already available to every Edge Function
// automatically — no secrets need adding by hand for this one.
//
// No separate "wire up a Database Webhook" step needed — the trigger in
// 0028 calls this function's URL directly via pg_net, with the
// service_role key already embedded in the trigger's own Authorization
// header (pasted into the SQL Editor at migration time, not stored here).

import { createClient } from 'npm:@supabase/supabase-js@2';

type TriggerPayload = {
  user_id: string;
  application_id: string;
};

Deno.serve(async (req) => {
  let payload: TriggerPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }

  const { user_id: userId } = payload;
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Missing user_id.' }), { status: 400 });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('notification_prefs')
    .eq('id', userId)
    .maybeSingle();
  if (userError) {
    return new Response(JSON.stringify({ error: userError.message }), { status: 500 });
  }
  // No public.users row yet (e.g. a signed-in account whose row hasn't been
  // backfilled) — nothing to check prefs against, so skip rather than error.
  if (!user) {
    return new Response(JSON.stringify({ skipped: 'No matching user for this user_id.' }), { status: 200 });
  }
  if (user.notification_prefs?.push_enabled === false) {
    return new Response(JSON.stringify({ skipped: 'push_enabled is false.' }), { status: 200 });
  }

  const { data: tokens, error: tokensError } = await supabase
    .from('push_tokens')
    .select('expo_push_token, device_type')
    .eq('user_id', userId);
  if (tokensError) {
    return new Response(JSON.stringify({ error: tokensError.message }), { status: 500 });
  }
  if (!tokens || tokens.length === 0) {
    return new Response(JSON.stringify({ skipped: 'No registered devices.' }), { status: 200 });
  }

  const messages = tokens.map((token) => ({
    to: token.expo_push_token,
    sound: 'default',
    title: "🎉 You're a verified organizer!",
    body: 'Your application was approved — you can now create and manage town-wide events.',
    data: { type: 'organizer_approved' },
    // iOS ignores this field entirely — Android uses it to pick which
    // notification channel to post to. Reuses "match-alerts" rather than
    // introducing a third channel: like a match, this is a one-off,
    // buyer/seller-account-level good-news alert, not an ongoing per-listing
    // signal the way Hot Listing tiers are — the same "once created, a
    // channel's importance is locked forever" constraint documented in
    // utils/push-notifications.ts makes adding channels a one-way door, so
    // this reuses an existing one rather than spending another.
    channelId: 'match-alerts',
  }));

  const pushResponse = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify(messages),
  });

  if (!pushResponse.ok) {
    const errorText = await pushResponse.text();
    return new Response(JSON.stringify({ error: `Expo push API error: ${errorText}` }), { status: 502 });
  }

  // A 200 from Expo's endpoint only means the *request* was well-formed —
  // per-notification tickets in the body can independently report an error
  // (e.g. an expired/invalid token) even though the HTTP call itself
  // succeeded — same gap already fixed once in send-match-notification.
  const pushResult: { data?: { status: string; message?: string; details?: { error?: string } }[] } =
    await pushResponse.json();
  const tickets = pushResult.data ?? [];

  console.log(
    'Expo push tickets',
    JSON.stringify(
      tokens.map((token, i) => ({
        device_type: token.device_type,
        expo_push_token: token.expo_push_token,
        ticket: tickets[i],
      }))
    )
  );
  const staleTokens = tokens
    .map((token, i) => ({ token: token.expo_push_token, ticket: tickets[i] }))
    .filter(({ ticket }) => ticket?.details?.error === 'DeviceNotRegistered')
    .map(({ token }) => token);

  if (staleTokens.length > 0) {
    await supabase.from('push_tokens').delete().in('expo_push_token', staleTokens);
  }

  return new Response(JSON.stringify({ sent: messages.length, tickets }), { status: 200 });
});
