// GarageHunt — "Email me these directions" (companion website's Route
// Planner, Phase 3). Called directly by the signed-in website user via
// supabase.functions.invoke (not a database trigger), same invocation
// pattern as suggest-listing-copy/moderate-listing-*.
//
// The recipient is ALWAYS the caller's own authenticated email — resolved
// server-side from their JWT, never taken from the request body — so this
// can't be used to email arbitrary third parties.
//
// Uses the same Resend pattern as send-match-notification/
// send-organizer-application-alert: RESEND_API_KEY secret,
// api.resend.com/emails, sending from alerts@garagehunt.ca (verified
// sending domain, delivers to any real inbox).
//
// HOW TO DEPLOY: Supabase Dashboard → Edge Functions → "Deploy a new
// function" → name it exactly `send-route-email` → paste this file's
// contents → Deploy. SUPABASE_URL/SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY
// are already available automatically. RESEND_API_KEY is already set as a
// secret (shared with the other Resend-based functions).

import { createClient } from 'npm:@supabase/supabase-js@2';

type RouteStop = { id: string; title: string; addressLabel: string };

type RequestBody = {
  originLabel?: string;
  stops: RouteStop[];
};

const SITE_URL = 'https://garagehunt.ca';

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header.' }), { status: 401 });
  }

  const supabaseUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser();
  if (userError || !user?.email) {
    return new Response(JSON.stringify({ error: 'Could not identify the signed-in user.' }), { status: 401 });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }
  if (!Array.isArray(body.stops) || body.stops.length === 0) {
    return new Response(JSON.stringify({ error: 'No stops to email.' }), { status: 400 });
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY is not configured.' }), { status: 500 });
  }

  const stopsHtml = body.stops
    .map((stop) => `<li><a href="${SITE_URL}/sale/${stop.id}">${stop.title}</a> — ${stop.addressLabel}</li>`)
    .join('\n');

  try {
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'GarageHunt <alerts@garagehunt.ca>',
        to: [user.email],
        subject: 'Your garage sale route',
        html: `
          <p>Here's your planned route${body.originLabel ? ` starting from ${body.originLabel}` : ''}:</p>
          <ol>${stopsHtml}</ol>
        `,
      }),
    });

    const responseText = await emailResponse.text();
    console.log('Resend response', emailResponse.status, responseText);

    if (!emailResponse.ok) {
      return new Response(JSON.stringify({ error: `Resend API error: ${responseText}` }), { status: 502 });
    }
    return new Response(JSON.stringify({ sent: true }), { status: 200 });
  } catch (err) {
    console.error('Failed to call Resend', err);
    return new Response(JSON.stringify({ error: `Failed to call Resend: ${String(err)}` }), { status: 500 });
  }
});
