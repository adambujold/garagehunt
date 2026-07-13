-- GarageHunt — push notification when an organizer application is approved.
--
-- Same raw pg_net trigger pattern as 0026_hot_tier_notifications.sql (no
-- Database Webhooks UI on this project). Fires once, exactly on the
-- transition into 'approved' — not on every update while already approved,
-- and not if a later review flips it back to 'denied' — mirroring how
-- 0013_organizer_approval_sync_and_seen.sql's sync_verified_organizer
-- trigger already scopes its own status-change logic. AFTER (not BEFORE,
-- unlike the hot-tier trigger): there's no ratchet/high-water-mark column to
-- set on NEW here, so there's nothing that needs to happen before the row
-- commits.
--
-- This is additive, not a replacement — Profile's existing "seen_approval"
-- banner (0013) stays as-is as a fallback for a declined/missing push
-- permission or an unregistered device; this trigger just means most users
-- find out immediately instead of only the next time Profile happens to
-- load.
--
-- HOW TO RUN THIS: paste into the Supabase Dashboard's SQL Editor and run.
-- Before running, replace <SERVICE_ROLE_KEY> below with the real
-- service_role secret (Project Settings -> API) — paste it directly into
-- the SQL Editor box, never commit the real key to this file.

create or replace function public.notify_organizer_approval_webhook()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    begin
      perform net.http_post(
        url := 'https://musrnxyygnqzbbpkuqip.supabase.co/functions/v1/send-organizer-approval-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
        ),
        body := jsonb_build_object(
          'user_id', new.user_id,
          'application_id', new.id
        )
      );
    exception when others then
      raise warning 'notify_organizer_approval_webhook failed: %', sqlerrm;
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists organizer_application_notify_approval on public.organizer_applications;

create trigger organizer_application_notify_approval
after update of status on public.organizer_applications
for each row
execute function public.notify_organizer_approval_webhook();
