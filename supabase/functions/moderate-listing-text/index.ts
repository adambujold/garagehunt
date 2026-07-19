// GarageHunt — automated text content screening (feature spec Section 9,
// item 2). Same Anthropic integration as suggest-listing-copy and
// moderate-listing-photo, with a distinct moderation-classification prompt
// (separate from the AI-suggestion prompt, per the spec's explicit call-out
// that these are different prompts on the same underlying integration).
//
// Called from utils/sale-listings.ts's publishSaleListing, on every attempt
// to transition a listing from draft to published (both the initial List a
// Sale publish and Edit Listing's "Publish sale" from an existing draft).
//
// Three-way decision:
//   "reject" — clearly bad (hate speech, obvious scam scripts like an
//               e-transfer/deposit-before-viewing request). Caller blocks
//               publishing synchronously with `reason` as the error shown
//               to the seller.
//   "flag"   — borderline. Caller still publishes, but sets
//               sale_listings.moderation_status = 'pending_review' — false
//               positives shouldn't block a legitimate seller.
//   "approve"— normal listing copy, publishes with moderation_status =
//               'clean' (unless the new-account trust signal overrides it).
// Same fail-safe behavior as moderate-listing-photo: an Anthropic call
// failure returns "flag", not an error — never blocks a publish over an
// infra hiccup, but still gets a human's eyes on the unclassified content.
//
// HOW TO DEPLOY: Supabase Dashboard → Edge Functions → "Deploy a new
// function" → name it exactly `moderate-listing-text` → paste this file's
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
  description: string;
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

  // An empty description is not this function's problem to flag — the form
  // itself already requires one before submission; nothing to classify here.
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (!description) {
    return jsonResponse({ decision: 'approve' satisfies Decision }, 200);
  }

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) {
    return jsonResponse({ decision: 'flag' satisfies Decision }, 200);
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

  let decision: Decision = 'flag';
  let reason = '';
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
        max_tokens: 200,
        messages: [{ role: 'user', content: userMessage }],
      }),
      // See moderate-listing-photo/index.ts's identical timeout for why —
      // fail safe to "flag" quickly on a slow Anthropic response instead of
      // leaving the publish attempt hanging on the platform's own timeout.
      signal: AbortSignal.timeout(20000),
    });

    if (anthropicResponse.ok) {
      const anthropicBody = await anthropicResponse.json();
      const text: string | undefined = anthropicBody?.content?.[0]?.text;
      const jsonMatch = text?.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      if (parsed?.decision === 'approve' || parsed?.decision === 'flag' || parsed?.decision === 'reject') {
        decision = parsed.decision;
        reason = typeof parsed.reason === 'string' ? parsed.reason : '';
      }
    }
  } catch (err) {
    console.error('Text moderation call failed, defaulting to flag', err);
  }

  return jsonResponse({ decision, reason }, 200);
});
