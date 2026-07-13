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
    '"decision", whose value is one of "approve", "flag", or "reject" — no other text, no markdown ' +
    'code fences. Use "reject" only for clearly inappropriate content (nudity/sexual content, graphic ' +
    'violence or gore, illegal items or weapons, hate symbols). Use "flag" for anything borderline or ' +
    'genuinely uncertain. Use "approve" for normal photos of household items, furniture, clothing, ' +
    'toys, tools, electronics, etc. — the vast majority of photos should be "approve".';

  let decision: Decision = 'flag';
  try {
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 50,
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
    });

    if (anthropicResponse.ok) {
      const anthropicBody = await anthropicResponse.json();
      const text: string | undefined = anthropicBody?.content?.[0]?.text;
      const jsonMatch = text?.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      if (parsed?.decision === 'approve' || parsed?.decision === 'flag' || parsed?.decision === 'reject') {
        decision = parsed.decision;
      }
    }
  } catch (err) {
    console.error('Photo moderation call failed, defaulting to flag', err);
  }

  return jsonResponse({ decision }, 200);
});
