-- GarageHunt — email alert to the app owner when a new organizer
-- application is submitted, so it doesn't require manually checking Table
-- Editor to know one is waiting for review.
--
-- Same raw pg_net trigger pattern as 0026/0028 (no Database Webhooks UI on
-- this project). Fires once per new application — applications always start
-- at status 'pending' (see 0012's column default), so a plain AFTER INSERT
-- is enough; no status-transition check needed like 0028's approval trigger.
--
-- This is a separate Edge Function from send-organizer-approval-notification
-- (0028) — that one is a push notification to the *applicant* once approved;
-- this one is an email to the *app owner* the moment a new application comes
-- in. Different recipient, different channel, different trigger event.
--
-- HOW TO RUN THIS: paste into the Supabase Dashboard's SQL Editor and run.
-- Before running, replace <SERVICE_ROLE_KEY> below with the real
-- service_role secret (Project Settings -> API) — paste it directly into
-- the SQL Editor box, never commit the real key to this file.

create or replace function public.notify_new_organizer_application()
returns trigger
language plpgsql
security definer
as $$
begin
  begin
    perform net.http_post(
      url := 'https://musrnxyygnqzbbpkuqip.supabase.co/functions/v1/send-organizer-application-alert',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
      ),
      body := jsonb_build_object(
        'application_id', new.id,
        'full_name', new.full_name,
        'neighborhood', new.neighborhood,
        'affiliation_notes', new.affiliation_notes,
        'created_at', new.created_at
      )
    );
  exception when others then
    raise warning 'notify_new_organizer_application failed: %', sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists organizer_application_notify_new on public.organizer_applications;

create trigger organizer_application_notify_new
after insert on public.organizer_applications
for each row
execute function public.notify_new_organizer_application();
