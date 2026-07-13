// GarageHunt — sends a push notification to a seller when their listing
// crosses a new Hot Listing tier. See
// supabase/migrations/0026_hot_tier_notifications.sql for the trigger this
// is called from, and supabase/functions/send-match-notification for the
// sibling function this mirrors (same token-lookup / notification-prefs /
// Expo-push-send / stale-token-cleanup pattern, just a different trigger
// source and recipient).
//
// Called directly by a pg_net trigger (not a Database Webhook), so the
// payload shape is whatever that trigger's net.http_post body is, not
// Supabase's standard {type, table, record} webhook envelope.
//
// HOW TO DEPLOY: Supabase Dashboard → Edge Functions → "Deploy a new
// function" → name it exactly `send-hot-tier-notification` → paste this
// file's contents in the editor → Deploy. SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are already available to every Edge Function
// automatically — no secrets need adding by hand for this one.
//
// Unlike send-match-notification, this needs no separate "wire up a
// Database Webhook" step — the trigger in 0026 calls this function's URL
// directly via pg_net, with the service_role key already embedded in the
// trigger's own Authorization header (pasted into the SQL Editor at
// migration time, not stored here).

import { createClient } from 'npm:@supabase/supabase-js@2';

type HotTier = 'hot' | 'blazing' | 'inferno';

type TriggerPayload = {
  listing_id: string;
  seller_id: string;
  tier: HotTier;
};

// Mirrors HOT_TIER_LABELS in utils/hot-tier.ts — duplicated rather than
// imported since this runs in Deno, a separate runtime/bundle from the app.
const TIER_MESSAGES: Record<HotTier, string> = {
  hot: '🔥 Your listing just went Hot!',
  blazing: '🔥🔥 Your listing just went Blazing Hot!',
  inferno: '🔥🔥🔥 Your listing just went Inferno Hot!',
};

Deno.serve(async (req) => {
  let payload: TriggerPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }

  const { listing_id: listingId, seller_id: sellerId, tier } = payload;
  if (!listingId || !sellerId || !TIER_MESSAGES[tier]) {
    return new Response(JSON.stringify({ error: 'Missing or invalid listing_id/seller_id/tier.' }), { status: 400 });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('notification_prefs')
    .eq('id', sellerId)
    .maybeSingle();
  if (userError) {
    return new Response(JSON.stringify({ error: userError.message }), { status: 500 });
  }
  // No public.users row yet (e.g. a signed-in account whose row hasn't been
  // backfilled) — nothing to check prefs against, so skip rather than error.
  if (!user) {
    return new Response(JSON.stringify({ skipped: 'No matching user for this seller_id.' }), { status: 200 });
  }
  if (user.notification_prefs?.push_enabled === false) {
    return new Response(JSON.stringify({ skipped: 'push_enabled is false.' }), { status: 200 });
  }

  const { data: tokens, error: tokensError } = await supabase
    .from('push_tokens')
    .select('expo_push_token, device_type')
    .eq('user_id', sellerId);
  if (tokensError) {
    return new Response(JSON.stringify({ error: tokensError.message }), { status: 500 });
  }
  if (!tokens || tokens.length === 0) {
    return new Response(JSON.stringify({ skipped: 'No registered devices.' }), { status: 200 });
  }

  const { data: listing, error: listingError } = await supabase
    .from('sale_listings')
    .select('title, address_text')
    .eq('id', listingId)
    .maybeSingle();
  if (listingError) {
    return new Response(JSON.stringify({ error: listingError.message }), { status: 500 });
  }
  const listingTitle = listing?.title ?? 'Your listing';

  const messages = tokens.map((token) => ({
    to: token.expo_push_token,
    sound: 'default',
    title: TIER_MESSAGES[tier],
    body: listingTitle,
    data: { type: 'hot_tier', listingId },
    // iOS ignores this field entirely — Android uses it to pick which
    // notification channel to post to, and must match the channel ID
    // created in utils/push-notifications.ts exactly, or it silently falls
    // back to Android's own generic default channel instead. A distinct
    // channel from "match-alerts" — once a channel is created on a device
    // its importance is locked forever (can't be raised later), so this
    // reuses that same hard-won lesson from the matches flow rather than
    // risking a mislabeled "Match alerts" channel showing Hot Listing
    // notifications in the user's system settings.
    channelId: 'hot-tier-alerts',
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
