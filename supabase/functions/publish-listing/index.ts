// GarageHunt — the server-side publish gate (feature spec Section 9, items
// 1/2/6).
//
// WHY THIS EXISTS. Publishing used to be decided entirely on the client:
// utils/sale-listings.ts's publishSaleListing called moderate-listing-text,
// counted the seller's published listings, worked out whether
// moderation_status should be 'clean' or 'pending_review', and then wrote
// status + moderation_status itself. Every one of those steps was advisory —
// a seller could skip the moderation call completely and write
// status='published', moderation_status='clean' directly, bypassing review.
//
// So the whole decision moves here, where the client can't influence it, and
// 0041_server_side_publish_gate.sql makes this the ONLY way a listing can
// reach 'published'.
//
// THE IMPORTANT DETAIL: the description that gets moderated is read from the
// database, never taken from the request body. Accepting it from the caller
// would recreate the same hole one level down — submit innocuous text for
// classification while the row itself holds something else.
//
// Identity comes from the caller's own JWT (so we know who is asking and can
// check they own the listing); the reads and the final write use the service
// role, because moderation_status and the transition into 'published' are no
// longer writable by anyone else.
//
// FAIL-SAFE, matching moderate-listing-text: if the Anthropic call errors or
// times out, the verdict is 'flag' (publishes, but marked pending_review) —
// never 'reject'. Our own infrastructure being down must not block a
// legitimate seller, but the content still gets a human's eyes.
//
// HOW TO DEPLOY: Supabase Dashboard → Edge Functions → "Deploy a new
// function" → name it exactly `publish-listing` → paste this file's contents
// → Deploy. Uses the existing ANTHROPIC_API_KEY secret; SUPABASE_URL,
// SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

type Decision = 'approve' | 'flag' | 'reject';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// Ported from moderate-listing-text rather than calling it over HTTP: that
// function authenticates the end user and takes the text as input, which is
// exactly the shape this needs to avoid. Same prompt, same fail-safe.
async function classifyDescription(description: string): Promise<{ decision: Decision; reason: string }> {
  if (!description.trim()) return { decision: 'approve', reason: '' };

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) {
    console.warn('ANTHROPIC_API_KEY not set — defaulting to flag.');
    return { decision: 'flag', reason: '' };
  }

  const userMessage =
    'You are a content moderator for a garage sale marketplace app. Classify this seller-written ' +
    'listing description. Respond with ONLY a JSON object with exactly two keys, "decision" (one of ' +
    '"approve", "flag", or "reject") and "reason" (a short, plain-language sentence explaining the ' +
    'issue if flag or reject, or an empty string if approve) — no other text, no markdown code fences. ' +
    'Use "reject" for clearly bad content: hate speech or slurs, or obvious scam scripts (e.g. asking ' +
    'a buyer to send an e-transfer deposit before viewing the item, requesting payment via gift cards, ' +
    'other advance-fee scam patterns). Use "flag" for anything borderline or genuinely uncertain. Use ' +
    '"approve" for normal, legitimate garage sale descriptions — the vast majority should be "approve".\n\n' +
    `Listing description:\n"""\n${description}\n"""`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 200,
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (res.ok) {
      const body = await res.json();
      const text: string | undefined = body?.content?.[0]?.text;
      const match = text?.match(/\{[\s\S]*\}/);
      const parsed = match ? JSON.parse(match[0]) : null;
      if (parsed?.decision === 'approve' || parsed?.decision === 'flag' || parsed?.decision === 'reject') {
        return { decision: parsed.decision, reason: typeof parsed.reason === 'string' ? parsed.reason : '' };
      }
    }
  } catch (err) {
    console.error('Text moderation call failed, defaulting to flag', err);
  }
  return { decision: 'flag', reason: '' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'Missing Authorization header.' }, 401);

  // Caller identity, from their own token.
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) return jsonResponse({ error: 'Not signed in.' }, 401);

  let listingId: string;
  try {
    const body = await req.json();
    listingId = typeof body?.listing_id === 'string' ? body.listing_id : '';
  } catch {
    return jsonResponse({ error: 'Invalid request body.' }, 400);
  }
  if (!listingId) return jsonResponse({ error: 'Missing listing_id.' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // sale_listings_raw, not the view: this needs the true row regardless of
  // fuzzing, and it is about to write columns the view no longer accepts.
  const { data: listing, error: listingError } = await admin
    .from('sale_listings_raw')
    .select('id, seller_id, status, description')
    .eq('id', listingId)
    .maybeSingle();
  if (listingError) return jsonResponse({ error: listingError.message }, 500);
  if (!listing) return jsonResponse({ error: 'Listing not found.' }, 404);

  // Ownership. Deliberately the same 404 as "not found", so listing ids can't
  // be probed for existence through this endpoint.
  if (listing.seller_id !== user.id) return jsonResponse({ error: 'Listing not found.' }, 404);

  if (listing.status === 'published') {
    return jsonResponse({ status: 'published', already: true }, 200);
  }
  if (listing.status === 'cancelled') {
    return jsonResponse({ error: 'This sale was cancelled and cannot be published.' }, 400);
  }

  // Photo gate (feature spec Section 9 item 1). Unchanged in substance from
  // the old client-side check, just no longer skippable.
  const { data: photos, error: photosError } = await admin
    .from('listing_photos')
    .select('moderation_status')
    .eq('listing_id', listingId);
  if (photosError) return jsonResponse({ error: photosError.message }, 500);
  if ((photos ?? []).some((p) => p.moderation_status !== 'approved')) {
    return jsonResponse(
      {
        error:
          "One or more of your photos was flagged for manual review and can't be auto-approved — publishing again won't change that. Your listing has been saved as a draft; remove/replace the flagged photo, or wait for it to be manually approved.",
      },
      400
    );
  }

  // The description comes from the row, not the request — see header.
  const { decision, reason } = await classifyDescription(listing.description ?? '');
  if (decision === 'reject') {
    return jsonResponse(
      { error: reason || 'Your listing description needs to be revised before publishing.' },
      400
    );
  }

  // New-account trust signal (Section 9 item 6): a seller's first-ever
  // published listing always gets a human look, whatever screening said.
  // Counts published only — abandoned drafts don't make an account proven.
  const { count: publishedCount, error: countError } = await admin
    .from('sale_listings_raw')
    .select('id', { count: 'exact', head: true })
    .eq('seller_id', listing.seller_id)
    .eq('status', 'published');
  if (countError) return jsonResponse({ error: countError.message }, 500);

  const isFirstListing = (publishedCount ?? 0) === 0;
  const moderationStatus: 'clean' | 'pending_review' =
    isFirstListing || decision === 'flag' ? 'pending_review' : 'clean';

  const { error: publishError } = await admin
    .from('sale_listings_raw')
    .update({ status: 'published', moderation_status: moderationStatus })
    .eq('id', listingId);
  if (publishError) return jsonResponse({ error: publishError.message }, 500);

  return jsonResponse({ status: 'published', moderation_status: moderationStatus }, 200);
});
