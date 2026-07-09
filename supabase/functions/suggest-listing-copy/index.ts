// GarageHunt — AI-assisted title/description suggestions for List a Sale /
// Edit Listing (feature spec Section 3). See
// supabase/migrations/0016_ai_listing_suggestions.sql for the rate-limit
// table this reads/writes, and the app's utils/ai-suggestions.ts for the
// client-side caller.
//
// HOW TO DEPLOY: Supabase Dashboard → Edge Functions → "Deploy a new
// function" → name it exactly `suggest-listing-copy` → paste this file's
// contents in the editor → Deploy. SUPABASE_URL and SUPABASE_ANON_KEY are
// already available to every Edge Function automatically — the only secret
// that needs adding by hand is ANTHROPIC_API_KEY (Dashboard → Edge
// Functions → Manage secrets → Add secret → name it ANTHROPIC_API_KEY,
// paste the key as the value). Never put it in a migration, the repo, or
// .env — it only ever lives in that one Edge Function secret.

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_REQUESTS_PER_HOUR = 5;
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

type RequestBody = {
  categories: string[];
  otherItems: string[];
  prompt?: string;
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

  // Scoped to the caller's own JWT (forwarded automatically by
  // supabase.functions.invoke), not the service role — every query below
  // runs under RLS as this specific user, same as a normal client request.
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

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from('ai_suggestion_requests')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', oneHourAgo);
  if (countError) {
    return jsonResponse({ error: 'Failed to check rate limit.' }, 500);
  }
  if ((count ?? 0) >= MAX_REQUESTS_PER_HOUR) {
    return jsonResponse(
      { error: `You've reached the limit of ${MAX_REQUESTS_PER_HOUR} suggestions per hour. Try again soon.` },
      429
    );
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid request body.' }, 400);
  }

  const categories = Array.isArray(body.categories) ? body.categories : [];
  const otherItems = Array.isArray(body.otherItems) ? body.otherItems : [];
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';

  if (categories.length === 0 && otherItems.length === 0 && !prompt) {
    return jsonResponse({ error: 'Add at least a category or a note before generating a suggestion.' }, 400);
  }

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) {
    return jsonResponse({ error: 'AI suggestions are not configured yet.' }, 500);
  }

  const itemsLine = [...categories, ...otherItems].filter(Boolean).join(', ') || 'a variety of household items';
  const userMessage = [
    `Items/categories for sale: ${itemsLine}.`,
    prompt ? `Seller's notes: ${prompt}` : null,
    'Write a short, catchy title (under 60 characters) and a friendly 2-3 sentence description for this garage sale listing. Respond with ONLY a JSON object with exactly two keys, "title" and "description" — no other text, no markdown code fences.',
  ]
    .filter(Boolean)
    .join('\n');

  let anthropicResponse: Response;
  try {
    anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 300,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
  } catch {
    return jsonResponse({ error: 'Could not reach the AI service. Please try again.' }, 502);
  }

  if (!anthropicResponse.ok) {
    return jsonResponse({ error: 'The AI service returned an error. Please try again.' }, 502);
  }

  const anthropicBody = await anthropicResponse.json();
  const text: string | undefined = anthropicBody?.content?.[0]?.text;
  if (!text) {
    return jsonResponse({ error: 'The AI service returned an unexpected response.' }, 502);
  }

  // Haiku doesn't always honor "respond with ONLY JSON" — it sometimes
  // wraps the object in a ```json fence or adds a stray sentence around it.
  // Extracting the first {...} block handles both cases without needing a
  // second round-trip to the model.
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  let suggestion: { title?: string; description?: string };
  try {
    suggestion = JSON.parse(jsonMatch ? jsonMatch[0] : text);
  } catch {
    return jsonResponse({ error: "Couldn't understand the AI's response. Please try again." }, 502);
  }

  if (!suggestion.title || !suggestion.description) {
    return jsonResponse({ error: "The AI's response was missing a title or description. Please try again." }, 502);
  }

  // Logged after a successful generation, not before — a request that fails
  // before reaching the (costly) Anthropic call shouldn't count against the
  // seller's hourly allowance.
  await supabase.from('ai_suggestion_requests').insert({});

  return jsonResponse({ title: suggestion.title, description: suggestion.description }, 200);
});
