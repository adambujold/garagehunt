// GarageHunt — RevenueCat webhook receiver. Handles two unrelated flows:
//
// 1. The ad-free subscription entitlement — see
//    supabase/migrations/0021_ad_free_subscription.sql for the columns this
//    writes, and utils/purchases.ts for the client-side purchase flow this
//    is downstream of.
// 2. Logging listing-boost purchases (a one-time consumable, RevenueCat
//    event type NON_RENEWING_PURCHASE) into boost_purchases — see
//    supabase/migrations/0022_listing_boost.sql's header comment for why
//    this is a backend record only, not what actually applies the boost
//    (utils/sale-listings.ts's applyListingBoost does that directly,
//    client-side, right after the purchase resolves).
//
// Not called by the app directly — RevenueCat calls this on every
// purchase/entitlement lifecycle event. There's no per-caller user JWT to
// scope queries to (RevenueCat isn't a signed-in user), so this uses the
// service role key, same reasoning as send-match-notification.
//
// ASSUMES the RevenueCat dashboard's entitlement identifier is exactly
// `ad_free`, matching users.is_ad_free's naming. If you set it up under a
// different identifier, update ENTITLEMENT_ID below to match.
//
// HOW TO DEPLOY: Supabase Dashboard → Edge Functions → "Deploy a new
// function" → name it exactly `revenuecat-webhook` → paste this file's
// contents in the editor → Deploy. SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are already available automatically.
//
// HOW TO WIRE IT UP: RevenueCat Dashboard → Project Settings → Integrations
// → Webhooks → Add → URL: this function's URL (shown after deploying, looks
// like https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook)
// → Authorization header value: "Bearer <service_role key>" (Project
// Settings → API → service_role secret — paste it directly into RevenueCat's
// field, never into this file or chat). That header is what satisfies this
// function's default JWT verification, same as the matches Database
// Webhook's setup.

import { createClient } from 'npm:@supabase/supabase-js@2';

const ENTITLEMENT_ID = 'ad_free';
// Boost was created under different product ids per store (iOS vs Android's
// Play Console listing) — see utils/purchases.ts's BOOST_PRODUCT_ID comment
// for why these can't be a single shared id.
const BOOST_PRODUCT_IDS = ['com.garagehunt.app.boost', 'com.garagehunt.app.boost.48h'];

type RevenueCatEvent = {
  type: string;
  app_user_id: string;
  entitlement_ids?: string[];
  entitlement_id?: string;
  expiration_at_ms?: number | null;
  product_id?: string;
  price_in_purchased_currency?: number;
  currency?: string;
  purchased_at_ms?: number;
  transaction_id?: string;
};

type WebhookPayload = {
  event: RevenueCatEvent;
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid request body.' }, 400);
  }

  const event = payload.event;
  if (!event?.type || !event?.app_user_id) {
    return jsonResponse({ error: 'Missing event.type or event.app_user_id.' }, 400);
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Boost purchases have no entitlement attached at all (see this file's
  // header comment), so they're handled entirely separately from the
  // ad-free branch below — best-effort logging only, never blocks/affects
  // the actual boost (already applied client-side by the time this fires).
  if (event.type === 'NON_RENEWING_PURCHASE' && BOOST_PRODUCT_IDS.includes(event.product_id ?? '')) {
    if (!event.transaction_id || !event.purchased_at_ms) {
      return jsonResponse({ skipped: 'Missing transaction_id or purchased_at_ms.' }, 200);
    }
    const { error } = await supabase.from('boost_purchases').insert({
      user_id: event.app_user_id,
      product_id: event.product_id,
      price: event.price_in_purchased_currency ?? null,
      currency: event.currency ?? null,
      transaction_id: event.transaction_id,
      purchased_at: new Date(event.purchased_at_ms).toISOString(),
    });
    if (error) {
      // Unique violation on transaction_id means this exact purchase was
      // already logged (a RevenueCat retry) — not a real failure.
      if (error.code === '23505') {
        return jsonResponse({ skipped: 'Already logged.' }, 200);
      }
      return jsonResponse({ error: error.message }, 500);
    }
    return jsonResponse({ logged: event.transaction_id }, 200);
  }

  const entitlementIds = event.entitlement_ids ?? (event.entitlement_id ? [event.entitlement_id] : []);
  if (!entitlementIds.includes(ENTITLEMENT_ID)) {
    return jsonResponse({ skipped: `Event does not involve the ${ENTITLEMENT_ID} entitlement.` }, 200);
  }

  const expiresAt = event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null;

  // Only the four lifecycle events the ad-free feature actually needs to
  // react to — RevenueCat sends others too (BILLING_ISSUE,
  // SUBSCRIPTION_PAUSED, TRANSFER, etc.) that this intentionally leaves
  // untouched for now rather than guessing at handling not yet needed.
  let update: { is_ad_free: boolean; ad_free_expires_at: string | null } | null = null;
  switch (event.type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION':
      update = { is_ad_free: true, ad_free_expires_at: expiresAt };
      break;
    case 'CANCELLATION':
      // Auto-renew was turned off, but the entitlement the user already
      // paid for is still active until expiration_at_ms — per the
      // architecture doc, is_ad_free staying true until the real
      // EXPIRATION event is what "check both the boolean and expiry, don't
      // trust a stale true alone" is guarding against on the read side.
      update = { is_ad_free: true, ad_free_expires_at: expiresAt };
      break;
    case 'EXPIRATION':
      update = { is_ad_free: false, ad_free_expires_at: expiresAt };
      break;
    default:
      return jsonResponse({ skipped: `Event type ${event.type} is not handled.` }, 200);
  }

  const { error } = await supabase.from('users').update(update).eq('id', event.app_user_id);
  if (error) {
    // A RevenueCat dashboard "send test event" uses a fake app_user_id that
    // won't match any real row — that's an expected no-op, not a real
    // failure worth a 500 (which would just make RevenueCat retry forever).
    if (error.code === 'PGRST116') {
      return jsonResponse({ skipped: 'No matching user for this app_user_id.' }, 200);
    }
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ updated: event.app_user_id, ...update }, 200);
});
