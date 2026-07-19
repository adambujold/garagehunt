// GarageHunt — automated photo content screening (feature spec Section 9,
// item 1). Reuses the same Anthropic integration already paid for/wired up
// for AI-assisted listing descriptions (suggest-listing-copy), via Claude's
// vision capability, with a distinct moderation-classification prompt.
//
// Called from utils/listing-photos.ts's uploadListingPhoto, BEFORE the
// photo is uploaded to Storage — a rejected photo never gets stored at all.
//
// Three-way decision, not a boolean:
//   "reject" — clearly inappropriate content. Caller blocks the upload with
//               a clear error.
//   "flag"   — borderline/uncertain. Caller uploads the photo anyway but
//               sets listing_photos.moderation_status = 'pending' (the
//               schema's existing default) for manual review, rather than
//               auto-rejecting a false positive.
//   "approve"— normal photo. Caller sets moderation_status = 'approved'.
// If the Anthropic call itself fails or returns something unparseable,
// this returns "flag" (not an error) — a seller shouldn't be blocked from
// listing because of an infra hiccup, but an unclassified photo still gets
// a human's eyes on it rather than silently auto-approving.
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

type RequestBody = {
  image_base64: string;
  media_type: string;
};

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

  return jsonResponse({ decision }, 200);
});
