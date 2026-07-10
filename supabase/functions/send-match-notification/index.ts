// GarageHunt — sends a push notification for a new "I'm Looking For" match.
// See supabase/migrations/0018_push_notifications.sql for the schema this
// reads/writes, and utils/push-notifications.ts for the client-side token
// registration this depends on.
//
// Triggered by a Supabase Database Webhook on `matches` INSERT, not called
// directly by the app — there's no per-caller user JWT to scope queries to
// (the seller who triggered the match and the buyer who should be notified
// are different people), so this uses the service role key to read across
// users, same reasoning documented in migration 0018's header comment.
//
// HOW TO DEPLOY: Supabase Dashboard → Edge Functions → "Deploy a new
// function" → name it exactly `send-match-notification` → paste this file's
// contents in the editor → Deploy. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// are already available to every Edge Function automatically — no secrets
// need adding by hand for this one.
//
// HOW TO WIRE THE WEBHOOK: Supabase Dashboard → Database → Webhooks →
// Create a new webhook → Table: matches → Events: Insert → Type: HTTP
// Request → URL: this function's URL (shown after deploying, looks like
// https://<project-ref>.supabase.co/functions/v1/send-match-notification)
// → HTTP method POST → add header "Authorization" = "Bearer <service_role
// key>" (Project Settings → API → service_role secret — paste it directly
// into the webhook's header field, never into this file or chat). That
// header is what satisfies this function's default JWT verification, since
// the webhook itself has no user session to authenticate with otherwise.

import { createClient } from 'npm:@supabase/supabase-js@2';

type WebhookPayload = {
  type: string;
  table: string;
  record: {
    id: string;
    saved_search_id: string;
    listing_id: string;
  };
};

// Mirrors deriveTitle in utils/sale-listings.ts — duplicated rather than
// imported since this runs in Deno, a separate runtime/bundle from the app.
function deriveTitle(addressText: string): string {
  const firstSegment = addressText.split(',')[0]?.trim() || addressText;
  const streetName = firstSegment.replace(/^\d+\s+/, '');
  return `${streetName} garage sale`;
}

Deno.serve(async (req) => {
  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }

  if (payload.type !== 'INSERT' || payload.table !== 'matches') {
    return new Response(JSON.stringify({ skipped: 'Not a matches insert.' }), { status: 200 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { saved_search_id: savedSearchId, listing_id: listingId, id: matchId } = payload.record;

  const { data: savedSearch, error: savedSearchError } = await supabase
    .from('saved_searches')
    .select('user_id, notify_enabled')
    .eq('id', savedSearchId)
    .single();
  if (savedSearchError) {
    return new Response(JSON.stringify({ error: savedSearchError.message }), { status: 500 });
  }
  if (!savedSearch.notify_enabled) {
    return new Response(JSON.stringify({ skipped: 'notify_enabled is false.' }), { status: 200 });
  }

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('notification_prefs')
    .eq('id', savedSearch.user_id)
    .single();
  if (userError) {
    return new Response(JSON.stringify({ error: userError.message }), { status: 500 });
  }
  if (user.notification_prefs?.push_enabled === false) {
    return new Response(JSON.stringify({ skipped: 'push_enabled is false.' }), { status: 200 });
  }

  const { data: tokens, error: tokensError } = await supabase
    .from('push_tokens')
    .select('expo_push_token')
    .eq('user_id', savedSearch.user_id);
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
    .single();
  if (listingError) {
    return new Response(JSON.stringify({ error: listingError.message }), { status: 500 });
  }
  const listingTitle = listing.title ?? deriveTitle(listing.address_text);

  const messages = tokens.map((token) => ({
    to: token.expo_push_token,
    sound: 'default',
    title: 'New match near you!',
    body: `${listingTitle} matches your saved search.`,
    data: { type: 'match', savedSearchId, listingId },
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
  // it still returns per-notification tickets in the body, each of which
  // can independently report an error (e.g. an expired/invalid token) even
  // though the HTTP call itself succeeded. Logging this was a real gap:
  // the previous version returned `{ sent: messages.length }` unconditionally
  // and never looked at this, so a token failing here was indistinguishable
  // from a real send in every log.
  const pushResult: { data?: { status: string; message?: string; details?: { error?: string } }[] } =
    await pushResponse.json();
  console.log('Expo push tickets', JSON.stringify(pushResult));

  const tickets = pushResult.data ?? [];
  const staleTokens = tokens
    .map((token, i) => ({ token: token.expo_push_token, ticket: tickets[i] }))
    .filter(({ ticket }) => ticket?.details?.error === 'DeviceNotRegistered')
    .map(({ token }) => token);

  if (staleTokens.length > 0) {
    // The device uninstalled the app or the token otherwise expired —
    // Expo's own guidance is to stop sending to it. Best-effort: this
    // shouldn't turn an otherwise-successful send into an error response.
    await supabase.from('push_tokens').delete().in('expo_push_token', staleTokens);
  }

  // Best-effort — a failure here shouldn't turn a successful send into an
  // error response, since the notification already went out.
  await supabase.from('matches').update({ notified_at: new Date().toISOString() }).eq('id', matchId);

  return new Response(JSON.stringify({ sent: messages.length, tickets }), { status: 200 });
});
