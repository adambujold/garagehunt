// GarageHunt — sends a seller the "snap fresh photos" reminder at the start
// of each day their sale is open (feature spec Section 4f, technical
// architecture Section 10). Delivers BOTH a push (Expo, mobile) and an email
// (Resend, for web-primary sellers who may not have the app installed) —
// day-of freshness is worth more than one channel's reach.
//
// Called directly by a pg_cron job (see
// supabase/migrations/0037_day_of_photo_reminders_cron.sql), which has
// already claimed this listing for today (stamped day_of_photo_reminder_sent_date)
// before calling — so this function just sends, it does no eligibility or
// dedupe logic of its own. Payload is that job's net.http_post body,
// { listing_id, seller_id }, not Supabase's {type, table, record} envelope.
//
// Mirrors send-hot-tier-notification (push: token lookup / notification-prefs
// gate / Expo send / stale-token cleanup) and send-match-notification (email:
// auth.admin.getUserById + Resend). Duplicated rather than shared because
// each Edge Function is its own Deno bundle.
//
// HOW TO DEPLOY: Supabase Dashboard → Edge Functions → "Deploy a new
// function" → name it exactly `send-day-of-photos-reminder` → paste this
// file's contents → Deploy. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are
// auto-available; RESEND_API_KEY is the shared secret already set for the
// other email functions.

import { createClient } from 'npm:@supabase/supabase-js@2';

type TriggerPayload = {
  listing_id: string;
  seller_id: string;
};

const PUSH_TITLE = 'Your sale is starting! 📸';
const PUSH_BODY = 'Snap a fresh photo to bring in more buyers today.';
// Web deep link for the email — the app's garagehunt:// scheme only resolves
// on a device with the app installed, whereas an email is most likely opened
// on desktop/web, so this points at the companion website's equivalent route.
const webAddPhotosUrl = (listingId: string) => `https://garagehunt.ca/day-of-photos/${listingId}`;

async function sendReminderEmail(
  supabase: ReturnType<typeof createClient>,
  sellerId: string,
  listingId: string,
  listingTitle: string
): Promise<void> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    console.warn('RESEND_API_KEY not set — skipping day-of photos email.');
    return;
  }

  // Email isn't in public.users (see 0008_reviews.sql's deviation note) — it
  // lives on auth.users, reachable only via the admin API with the service
  // role key this client already holds.
  const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(sellerId);
  if (authError || !authUser?.user?.email) {
    console.warn(`No email for seller ${sellerId} — skipping day-of photos email.`, authError?.message);
    return;
  }

  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'GarageHunt <alerts@garagehunt.ca>',
      to: [authUser.user.email],
      subject: `📸 ${listingTitle} is starting today — add a fresh photo`,
      html: `
        <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #2B1B4D; line-height: 1.5;">
          <h2 style="margin: 0 0 12px;">Your sale is starting! 📸</h2>
          <p style="margin: 0 0 16px;">
            Buyers love seeing the real scene — tables set up, everything laid out.
            Snap a fresh photo of <strong>${listingTitle}</strong> now to bring in more
            buyers today. It's added right alongside your original photos, and gets a
            <strong>📸 Fresh Photos</strong> badge on your listing for the rest of the day.
          </p>
          <p style="margin: 0 0 24px;">
            <a href="${webAddPhotosUrl(listingId)}"
               style="display: inline-block; background: #FF6B4A; color: #fff; text-decoration: none;
                      padding: 12px 20px; border-radius: 8px; font-weight: 600;">
              Add today's photos
            </a>
          </p>
          <p style="margin: 0; font-size: 13px; color: #6B6478;">
            You're getting this because you have a live sale on GarageHunt today.
          </p>
        </div>
      `,
    }),
  });

  if (!emailResponse.ok) {
    console.warn(`Resend day-of photos email failed: ${await emailResponse.text()}`);
  }
}

Deno.serve(async (req) => {
  let payload: TriggerPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }

  const { listing_id: listingId, seller_id: sellerId } = payload;
  if (!listingId || !sellerId) {
    return new Response(JSON.stringify({ error: 'Missing listing_id/seller_id.' }), { status: 400 });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: listing, error: listingError } = await supabase
    .from('sale_listings')
    .select('title, address_text')
    .eq('id', listingId)
    .maybeSingle();
  if (listingError) {
    return new Response(JSON.stringify({ error: listingError.message }), { status: 500 });
  }
  const listingTitle =
    (listing?.title as string | null) ??
    (listing?.address_text ? `${(listing.address_text as string).split(',')[0]} garage sale` : 'Your sale');

  // Email is independent of push prefs / device registration — a web-primary
  // seller may have neither a push token nor push_enabled, but should still
  // get the reminder. Best-effort: never let an email failure block the push.
  await sendReminderEmail(supabase, sellerId, listingId, listingTitle);

  // Push — gated on the seller's notification pref, same as the other senders.
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('notification_prefs')
    .eq('id', sellerId)
    .maybeSingle();
  if (userError) {
    return new Response(JSON.stringify({ error: userError.message }), { status: 500 });
  }
  if (user?.notification_prefs?.push_enabled === false) {
    return new Response(JSON.stringify({ emailed: true, skipped: 'push_enabled is false.' }), { status: 200 });
  }

  const { data: tokens, error: tokensError } = await supabase
    .from('push_tokens')
    .select('expo_push_token, device_type')
    .eq('user_id', sellerId);
  if (tokensError) {
    return new Response(JSON.stringify({ error: tokensError.message }), { status: 500 });
  }
  if (!tokens || tokens.length === 0) {
    return new Response(JSON.stringify({ emailed: true, skipped: 'No registered devices.' }), { status: 200 });
  }

  const messages = tokens.map((token) => ({
    to: token.expo_push_token,
    sound: 'default',
    title: PUSH_TITLE,
    body: PUSH_BODY,
    // Tapped → hooks/use-notification-deep-link.ts routes 'day_of_photos' to
    // the add-photos screen for this listing.
    data: { type: 'day_of_photos', listingId },
    // Android channel — must match the 'day-of-photo-alerts' channel created
    // in utils/push-notifications.ts, or Android silently posts to its own
    // generic default channel. A distinct channel from match/hot-tier since a
    // channel's importance and label are locked once created on a device.
    channelId: 'day-of-photo-alerts',
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

  return new Response(JSON.stringify({ emailed: true, sent: messages.length, tickets }), { status: 200 });
});
