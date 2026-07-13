// GarageHunt — emails the app owner when a new organizer application is
// submitted. See supabase/migrations/0030_organizer_application_email_alert.sql
// for the trigger this is called from.
//
// Called directly by a pg_net trigger (not a Database Webhook), so the
// payload shape is whatever that trigger's net.http_post body is, not
// Supabase's standard {type, table, record} webhook envelope.
//
// Uses Resend's sandbox sender (onboarding@resend.dev), which works without
// domain verification as long as the recipient is the Resend account's own
// verified email — true here, since OWNER_EMAIL below is the same address
// the Resend account was signed up with.
//
// HOW TO DEPLOY: Supabase Dashboard → Edge Functions → "Deploy a new
// function" → name it exactly `send-organizer-application-alert` → paste
// this file's contents in the editor → Deploy. Requires the RESEND_API_KEY
// secret (Edge Functions → Manage secrets) — already set.

const OWNER_EMAIL = 'adambujold@gmail.com';

type TriggerPayload = {
  application_id: string;
  full_name: string;
  neighborhood: string;
  affiliation_notes: string;
  created_at: string;
};

Deno.serve(async (req) => {
  let payload: TriggerPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }

  const { application_id: applicationId, full_name: fullName, neighborhood, affiliation_notes: affiliationNotes } =
    payload;
  if (!applicationId || !fullName) {
    return new Response(JSON.stringify({ error: 'Missing application_id/full_name.' }), { status: 400 });
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY is not configured.' }), { status: 500 });
  }

  try {
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'GarageHunt <onboarding@resend.dev>',
        to: [OWNER_EMAIL],
        subject: `New organizer application from ${fullName}`,
        html: `
          <p><strong>${fullName}</strong> just applied to become a verified organizer.</p>
          <ul>
            <li><strong>Neighborhood:</strong> ${neighborhood}</li>
            <li><strong>Affiliation / vouching notes:</strong> ${affiliationNotes}</li>
          </ul>
          <p>Review and approve/deny in the Supabase Dashboard → Table Editor → organizer_applications (id: ${applicationId}).</p>
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
