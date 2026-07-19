// GarageHunt — sends a push notification (and, as of Phase 2d, an
// immediate email via Resend) for a new "I'm Looking For" match. See
// supabase/migrations/0018_push_notifications.sql for the push schema this
// reads/writes, and utils/push-notifications.ts for the client-side token
// registration push depends on.
//
// Triggered by a Supabase Database Webhook on `matches` INSERT, not called
// directly by the app — there's no per-caller user JWT to scope queries to
// (the seller who triggered the match and the buyer who should be notified
// are different people), so this uses the service role key to read across
// users, same reasoning documented in migration 0018's header comment. As
// of 0035_server_side_match_computation.sql, that INSERT can come from
// either the mobile app or the website (or neither, directly) — this
// function doesn't care who published the listing, only that a match row
// landed.
//
// Email is sent as its own early step, gated only on the saved search's
// own notify_enabled — deliberately BEFORE the push_enabled/push_tokens
// checks below, so a buyer with push disabled (or no registered devices)
// still gets emailed instead of silently getting nothing. The existing
// push logic below is otherwise unchanged from before this file added
// email.
//
// Email uses the same Resend pattern already established in
// send-organizer-application-alert/index.ts: RESEND_API_KEY secret,
// api.resend.com/emails, plain inline HTML, sending from
// alerts@garagehunt.ca (a verified Resend sending domain) — delivers to
// any buyer's real address, not just one Resend-verified account.
//
// HOW TO DEPLOY: Supabase Dashboard → Edge Functions → "Deploy a new
// function" → name it exactly `send-match-notification` → paste this file's
// contents in the editor → Deploy. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// are already available to every Edge Function automatically. RESEND_API_KEY
// is already set as a secret (shared with send-organizer-application-alert)
// — no new secret needed for this function either.
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

// The companion website's real domain, once deployed — update this if/when
// that changes. Not read from an env var since this is a fixed, public
// value, not a secret.
const SITE_URL = 'https://garagehunt.ca';

// Best-effort, same as the push send below — a Resend failure (including
// the sandbox-sender restriction noted above) shouldn't turn an otherwise-
// successful match-processing run into an error response.
async function sendMatchEmail(toEmail: string, listingTitle: string, listingId: string): Promise<void> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    console.error('RESEND_API_KEY is not configured — skipping match email.');
    return;
  }

  try {
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'GarageHunt <alerts@garagehunt.ca>',
        to: [toEmail],
        subject: 'New match near you!',
        html: `
          <p><strong>${listingTitle}</strong> matches one of your saved searches on GarageHunt.</p>
          <p><a href="${SITE_URL}/sale/${listingId}">View the listing</a></p>
        `,
      }),
    });

    const responseText = await emailResponse.text();
    console.log('Resend response', emailResponse.status, responseText);
  } catch (err) {
    console.error('Failed to call Resend', err);
  }
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

  const { data: listing, error: listingError } = await supabase
    .from('sale_listings')
    .select('title, address_text')
    .eq('id', listingId)
    .single();
  if (listingError) {
    return new Response(JSON.stringify({ error: listingError.message }), { status: 500 });
  }
  const listingTitle = listing.title ?? deriveTitle(listing.address_text);

  // Email is independent of the push-specific checks below — a buyer with
  // push disabled or no registered devices should still get emailed, not
  // silently get nothing at all.
  let emailSent = false;
  const { data: authUserResult, error: authUserError } = await supabase.auth.admin.getUserById(savedSearch.user_id);
  if (authUserError) {
    console.error('Failed to look up buyer email', authUserError);
  } else if (authUserResult.user?.email) {
    await sendMatchEmail(authUserResult.user.email, listingTitle, listingId);
    emailSent = true;
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
    return new Response(JSON.stringify({ skipped: 'push_enabled is false.', emailSent }), { status: 200 });
  }

  const { data: tokens, error: tokensError } = await supabase
    .from('push_tokens')
    .select('expo_push_token, device_type')
    .eq('user_id', savedSearch.user_id);
  if (tokensError) {
    return new Response(JSON.stringify({ error: tokensError.message }), { status: 500 });
  }
  if (!tokens || tokens.length === 0) {
    return new Response(JSON.stringify({ skipped: 'No registered devices.', emailSent }), { status: 200 });
  }

  const messages = tokens.map((token) => ({
    to: token.expo_push_token,
    sound: 'default',
    title: 'New match near you!',
    body: `${listingTitle} matches your saved search.`,
    data: { type: 'match', savedSearchId, listingId },
    // iOS ignores this field entirely — Android uses it to pick which
    // notification channel to post to, and must match the channel ID
    // created in utils/push-notifications.ts exactly, or it silently falls
    // back to Android's own generic default channel instead.
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
  // it still returns per-notification tickets in the body, each of which
  // can independently report an error (e.g. an expired/invalid token) even
  // though the HTTP call itself succeeded. Logging this was a real gap:
  // the previous version returned `{ sent: messages.length }` unconditionally
  // and never looked at this, so a token failing here was indistinguishable
  // from a real send in every log.
  const pushResult: { data?: { status: string; message?: string; details?: { error?: string } }[] } =
    await pushResponse.json();
  const tickets = pushResult.data ?? [];

  // Logged per-token (device_type + ticket paired explicitly) rather than
  // as a bare array — a bare array left which ticket belonged to which
  // platform ambiguous whenever a user had multiple devices, which was a
  // real gap hit while debugging an Android-only delivery failure: the raw
  // tickets alone couldn't confirm which entry was the Android token's.
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
    // The device uninstalled the app or the token otherwise expired —
    // Expo's own guidance is to stop sending to it. Best-effort: this
    // shouldn't turn an otherwise-successful send into an error response.
    await supabase.from('push_tokens').delete().in('expo_push_token', staleTokens);
  }

  // Best-effort — a failure here shouldn't turn a successful send into an
  // error response, since the notification already went out.
  await supabase.from('matches').update({ notified_at: new Date().toISOString() }).eq('id', matchId);

  return new Response(JSON.stringify({ sent: messages.length, tickets, emailSent }), { status: 200 });
});
