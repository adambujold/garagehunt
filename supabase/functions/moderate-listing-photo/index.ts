// GarageHunt — automated photo content screening (feature spec Section 9,
// item 1). Reuses the same Anthropic integration already paid for/wired up
// for AI-assisted listing descriptions (suggest-listing-copy), via Claude's
// vision capability, with a distinct moderation-classification prompt.
//
// THIS FUNCTION NOW OWNS THE WHOLE OPERATION — moderate, store, and record.
//
// It used to classify a photo and hand the verdict back for the client to
// apply: uploadListingPhoto called this, then uploaded to Storage itself, then
// INSERTed the listing_photos row with whatever moderation_status it felt like.
// Every part of that was advisory. A seller could skip this call entirely and
// insert a row with moderation_status='approved', putting unscreened images on
// a public page — and because publish-listing's photo gate just checks that
// every photo is 'approved', that also walked straight through the listing
// gate. Exactly the hole 0041 closed for listing text, one level down.
//
// So the decision and the write are now a single server-side operation the
// client cannot get between. This function authenticates the caller, checks
// they own the listing, classifies the image, uploads the bytes to Storage
// with service-role credentials, and inserts the listing_photos row with the
// verdict it computed. 0042_server_side_photo_moderation.sql removes the
// client's INSERT on both listing_photos and the bucket, so this is the only
// way a photo row can come into existence.
//
// Three-way decision, unchanged in meaning:
//   "reject" — clearly inappropriate. Nothing is stored and nothing is
//              recorded; the seller gets a clear error.
//   "flag"   — borderline/uncertain. Stored and recorded as 'pending' for
//              manual review, rather than auto-rejecting a false positive.
//   "approve"— normal photo. Stored and recorded as 'approved'.
// An Anthropic failure or unparseable reply still yields "flag", never an
// error — a seller shouldn't be blocked by an infra hiccup, but an
// unclassified photo still gets a human's eyes rather than auto-approval.
//
// HOW TO DEPLOY: Supabase Dashboard → Edge Functions → "Deploy a new
// function" → name it exactly `moderate-listing-photo` → paste this file's
// contents in the editor → Deploy. Reuses the same ANTHROPIC_API_KEY secret
// already set for suggest-listing-copy — no new secret needed.

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Tried switching this to a Sonnet model to address over-flagging — reverted.
// It hit a distinct, worse failure on a real test photo: Anthropic's API
// returned "invalid_request_error: Could not process image" for a photo
// Haiku had handled correctly (confirmed via logs — no error, a genuine
// "flag" JSON came back). Trading "sometimes overcautious" for "sometimes
// fails outright on a legitimate photo" isn't a net improvement, since a
// failed call falls back to "flag" anyway. Staying on Haiku; the prompt
// rewrite above/below (explicit examples, "if uncertain, approve") is
// doing the real calibration work instead.
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

type Decision = 'approve' | 'flag' | 'reject';

const PHOTO_BUCKET = 'listing-photos';

type RequestBody = {
  image_base64: string;
  media_type: string;
  // Added when this function took over storing and recording the photo. The
  // client no longer picks the storage key either — see randomStorageKey.
  listing_id: string;
  sort_order?: number;
  photo_type?: 'planning' | 'day_of';
};

// Path shape is "<listing_id>/<random>", which the bucket's RLS policies were
// written around (0005). Generated here rather than accepted from the request
// so a caller can't aim a write at another listing's folder.
function randomStorageKey(listingId: string, mediaType: string): string {
  const ext = mediaType === 'image/png' ? 'png' : mediaType === 'image/webp' ? 'webp' : 'jpg';
  return `${listingId}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.${ext}`;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header.' }, 401);
  }

  // Only used to confirm the caller is a real signed-in user (keeps this
  // endpoint from being a free, unauthenticated way to burn Anthropic
  // spend) — no table reads/writes happen here at all.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return jsonResponse({ error: 'Not signed in.' }, 401);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid request body.' }, 400);
  }

  if (!body.image_base64 || !body.media_type) {
    return jsonResponse({ error: 'Missing image_base64/media_type.' }, 400);
  }
  if (!body.listing_id) {
    return jsonResponse({ error: 'Missing listing_id.' }, 400);
  }

  // Ownership, checked before spending anything on Anthropic. Uses the service
  // role because this function is about to write columns the caller can't, and
  // reads sale_listings_raw so a fuzzed view row can't confuse the comparison.
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: listing, error: listingError } = await admin
    .from('sale_listings_raw')
    .select('id, seller_id')
    .eq('id', body.listing_id)
    .maybeSingle();
  if (listingError) return jsonResponse({ error: listingError.message }, 500);
  // Same 404 for "missing" and "not yours", so listing ids can't be probed.
  if (!listing || listing.seller_id !== user.id) {
    return jsonResponse({ error: 'Listing not found.' }, 404);
  }

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) {
    // Fails safe: nothing classified, so treat as "flag" rather than block
    // every upload just because the key isn't configured yet.
    return jsonResponse({ decision: 'flag' satisfies Decision }, 200);
  }

  const instructions =
    'You are a content moderator for a garage sale marketplace app. Classify this photo of an item ' +
    'a seller uploaded for their listing. Respond with ONLY a JSON object with exactly one key, ' +
    '"decision", whose value is one of "approve", "flag", or "reject" — no preamble, no explanation, ' +
    'no markdown code fences, nothing before or after the JSON object. Use "reject" only for clearly ' +
    'inappropriate content (nudity/sexual content, graphic violence or gore, illegal items or weapons, ' +
    'hate symbols — meaning actual extremist/hate-group symbols, not skulls, skeletons, or other ' +
    'Halloween/spooky/goth-style imagery on costumes, decor, or furniture, which are ordinary and ' +
    'always fine). Use "flag" only when you genuinely cannot tell whether real policy-violating ' +
    'content is depicted — this should be rare. Ordinary photography issues (blur, bad lighting, ' +
    'clutter, an odd angle, a plain or low-quality photo) are never a reason to flag or reject on ' +
    'their own. Use "approve" for any ordinary, everyday item someone might sell at a garage sale — ' +
    'this covers far more than a short list, so judge by "is this a normal secondhand item," not by ' +
    'whether it matches a specific category. Examples of the huge range of "approve": furniture, ' +
    'clothing, toys, tools, electronics, kitchenware, books, sporting goods, seasonal/holiday ' +
    'decorations, vehicles and vehicle parts (e.g. a tire), instruments, artwork, collectibles, and ' +
    'children\'s toys or kids\' items with no people in them. The vast majority of photos should be ' +
    '"approve". If you are not immediately certain something is inappropriate, the correct answer is ' +
    '"approve", not "flag" — "flag" is reserved for genuine, real uncertainty about actual ' +
    'policy-violating content, never for an item simply being unusual or not on an example list.';

  let decision: Decision = 'flag';
  try {
    // Explicit timeout, not just relying on the platform's own function
    // timeout — without this, a slow/hung Anthropic response leaves the
    // caller's upload awaiting the full platform timeout (well over a
    // minute) instead of failing safe to "flag" quickly, same fail-safe
    // intent as the try/catch below already has for outright errors.
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        // Was 50 — too tight. Claude's vision responses sometimes add a
        // short preamble before the JSON even when told not to; at 50
        // tokens that preamble alone could exhaust the budget and cut the
        // response off before the JSON object ever closes, which silently
        // fails the parse below and falls through to the "flag" default —
        // confirmed as the real cause of a high false-flag rate, nothing to
        // do with actual photo content. 200 matches moderate-listing-text's
        // budget, which never showed this problem.
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: body.media_type, data: body.image_base64 } },
              { type: 'text', text: instructions },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (anthropicResponse.ok) {
      const anthropicBody = await anthropicResponse.json();
      const text: string | undefined = anthropicBody?.content?.[0]?.text;
      // Non-greedy — grabs the first complete {...} rather than potentially
      // spanning from the first "{" to the very last "}" in the whole
      // response if Claude adds any stray brace-containing text around it.
      const jsonMatch = text?.match(/\{[\s\S]*?\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      if (parsed?.decision === 'approve' || parsed?.decision === 'flag' || parsed?.decision === 'reject') {
        decision = parsed.decision;
        // Temporary — logs every classification (not just failures) while
        // recalibrating the prompt, so a still-wrong "flag"/"reject" call
        // can be told apart from a parsing bug instead of guessing at the
        // prompt again blind. Safe to remove once calibration settles —
        // logs only the model's short text reply, never the photo itself.
        console.log('Photo moderation decision:', decision, '| Raw response:', text);
      } else {
        // Was previously silent — a response that came back .ok but didn't
        // parse into a valid decision defaulted straight to "flag" with no
        // trace of why, which is exactly what made this bug invisible.
        console.error('Photo moderation response did not parse to a valid decision, defaulting to flag. Raw text:', text);
      }
    } else {
      const errorBody = await anthropicResponse.text().catch(() => '<could not read body>');
      console.error('Photo moderation Anthropic call returned non-ok status', anthropicResponse.status, errorBody);
    }
  } catch (err) {
    console.error('Photo moderation call failed, defaulting to flag', err);
  }

  // A rejected photo is never stored and never recorded — same as before,
  // except the client no longer has the option of storing it anyway.
  if (decision === 'reject') {
    return jsonResponse(
      { error: "That photo doesn't meet our content guidelines. Please choose a different photo." },
      400
    );
  }

  // Decode once for the upload. The bytes stored are the exact bytes just
  // classified — the client never gets a second chance to substitute a
  // different image against an approved verdict.
  let bytes: Uint8Array;
  try {
    const binary = atob(body.image_base64);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  } catch {
    return jsonResponse({ error: 'That photo could not be read. Please try again.' }, 400);
  }
  // Same guard both upload paths already had: a "successful" read that yields
  // a tiny file means the decode silently failed, and storing it would leave a
  // photo that renders as a stretched colour block.
  if (bytes.byteLength < 1000) {
    return jsonResponse({ error: 'That photo could not be read. Please try again.' }, 400);
  }

  const storageKey = randomStorageKey(body.listing_id, body.media_type);
  const { error: uploadError } = await admin.storage
    .from(PHOTO_BUCKET)
    .upload(storageKey, bytes, { contentType: body.media_type });
  if (uploadError) return jsonResponse({ error: uploadError.message }, 500);

  const moderationStatus = decision === 'approve' ? 'approved' : 'pending';

  const { data: row, error: insertError } = await admin
    .from('listing_photos')
    .insert({
      listing_id: body.listing_id,
      storage_key: storageKey,
      sort_order: typeof body.sort_order === 'number' ? body.sort_order : 0,
      moderation_status: moderationStatus,
      photo_type: body.photo_type === 'day_of' ? 'day_of' : 'planning',
    })
    .select('id, storage_key, sort_order, moderation_status, photo_type')
    .single();

  if (insertError) {
    // Best-effort cleanup — an unreferenced object is invisible and harmless,
    // so a failure here doesn't need surfacing.
    await admin.storage.from(PHOTO_BUCKET).remove([storageKey]).catch(() => {});
    return jsonResponse({ error: insertError.message }, 500);
  }

  return jsonResponse({ decision, photo: row }, 200);
});
