-- GarageHunt — Database Webhook equivalent for matches insert, written as a
-- raw trigger calling pg_net directly rather than going through Supabase's
-- Database Webhooks UI / supabase_functions.http_request wrapper — that
-- wrapper's schema wasn't provisioned on this project (confirmed via a
-- "schema supabase_functions does not exist" error from the Dashboard's own
-- webhook creation flow, not just this SQL). pg_net itself (schema `net`)
-- is the only dependency here, enabled via Database -> Extensions -> pg_net.
--
-- The notification send is wrapped in its own begin/exception block so a
-- failure here (bad URL, network error, Edge Function down) can never
-- propagate up and block the actual matches insert — confirmed necessary
-- after an earlier version of this trigger (with an unreplaced placeholder
-- URL) caused "Failed to compute matches for new listing" to block
-- publishing a sale listing entirely, since matches are inserted as part of
-- that same publish flow.
--
-- HOW TO RUN THIS: paste into the Supabase Dashboard's SQL Editor, but
-- BEFORE running, replace the placeholder below:
--   <SERVICE_ROLE_KEY>    — Project Settings -> API -> service_role secret
--                           (the legacy JWT-format one, starts with "eyJ")
-- Make this substitution directly in the SQL Editor's query box, not in
-- this file on disk — this file should stay with the placeholder so the
-- real service_role key never ends up committed to git.

create or replace function public.notify_match_webhook()
returns trigger
language plpgsql
security definer
as $$
begin
  begin
    perform net.http_post(
      url := 'https://musrnxyygnqzbbpkuqip.supabase.co/functions/v1/send-match-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
      ),
      body := jsonb_build_object(
        'type', 'INSERT',
        'table', 'matches',
        'record', row_to_json(new)
      )
    );
  exception when others then
    -- Best-effort: a notification-send failure must never block the
    -- matches insert (and by extension, whatever publish/update flow
    -- triggered it) from succeeding.
    raise warning 'notify_match_webhook failed: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists matches_send_notification on public.matches;

create trigger matches_send_notification
after insert on public.matches
for each row
execute function public.notify_match_webhook();
