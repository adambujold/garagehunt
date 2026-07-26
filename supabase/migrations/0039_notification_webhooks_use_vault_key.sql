-- GarageHunt — move the four remaining notification webhooks off the
-- embedded <SERVICE_ROLE_KEY> placeholder and onto the Vault secret, the same
-- way 0037 was fixed.
--
-- WHY. 0019 (match alerts), 0026 (Hot Listing tiers), 0028 (organizer
-- approval) and 0030 (organizer application alert) each hardcode an
-- Authorization header that the operator is expected to hand-replace in the
-- SQL Editor before running. That has now failed silently twice: 0028 shipped
-- with the literal placeholder text, and so did the day-of reminder job in
-- 0037 — every call came back 401 UNAUTHORIZED_INVALID_JWT_FORMAT and nobody
-- noticed for a day.
--
-- It hides so well because pg_net is asynchronous: net.http_post only queues
-- the request and returns immediately, so the 401 lands long after the
-- trigger has committed. The surrounding `exception when others` block never
-- sees it, the trigger reports success, and cron.job_run_details says
-- "succeeded". The only place the failure is visible is net._http_response.
--
-- AUDITED 2026-07-26 BEFORE WRITING THIS: all four were checked with
--   select proname, prosrc like '%<SERVICE_ROLE_KEY>%' from pg_proc where ...
-- and every one came back false — the real key had been pasted in correctly
-- each time, and all four notifications have been working. So this migration
-- is HYGIENE, NOT A BUG FIX. What it actually buys:
--
--   * The service_role key currently sits in plaintext in four separate
--     function bodies, readable by anything that can query pg_proc. After
--     this it lives in Vault only.
--   * Rotating the key becomes one vault.create_secret call instead of
--     editing and re-running four migrations.
--   * There's no placeholder left for a future migration to copy and forget.
--
-- What it deliberately does NOT change: these sends stay best-effort. The
-- key lookup sits INSIDE each function's `exception when others` block on
-- purpose, so a missing Vault secret degrades to a warning rather than
-- blocking the insert/update that triggered it — a match must still be
-- recorded even if nobody can be notified about it. (0037's cron job is the
-- opposite case: nothing else depends on it, so there the check runs up front
-- and raises loudly.)
--
-- Each function body below is otherwise IDENTICAL to its original — same
-- conditions, same payloads, same best-effort exception handling. Only the
-- Authorization header changed. notify_hot_tier_webhook in particular still
-- sets new.highest_tier_notified as a BEFORE UPDATE trigger; that ratchet is
-- what stops a listing re-notifying for a tier it already crossed.
--
-- PREREQUISITE — the vault secret must exist. It already does if 0037 was run
-- as instructed. To confirm:
--   select count(*) from vault.decrypted_secrets where name = 'service_role_key';
-- If that returns 0, create it first (replacing only the first argument):
--   select vault.create_secret('<paste-the-key-here>', 'service_role_key');
--
-- HOW TO RUN THIS: paste into the Supabase Dashboard's SQL Editor and run, by
-- itself. No placeholders to replace.

-- Shared accessor, so the four functions below don't each repeat the lookup
-- and the "it's missing" failure mode is identical everywhere.
create or replace function public.service_role_key()
returns text
language plpgsql
stable
security definer
as $$
declare
  k text;
begin
  select decrypted_secret into k
  from vault.decrypted_secrets
  where name = 'service_role_key';

  if k is null or k = '' then
    raise exception 'vault secret ''service_role_key'' is missing — see 0039''s PREREQUISITE';
  end if;

  return k;
end;
$$;

-- 1. Match alerts (was 0019) ------------------------------------------------
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
        'Authorization', 'Bearer ' || public.service_role_key()
      ),
      body := jsonb_build_object(
        'type', 'INSERT',
        'table', 'matches',
        'record', row_to_json(new)
      )
    );
  exception when others then
    -- Best-effort: a notification-send failure must never block the matches
    -- insert (and by extension whatever publish/update flow triggered it).
    raise warning 'notify_match_webhook failed: %', sqlerrm;
  end;
  return new;
end;
$$;

-- 2. Hot Listing tiers (was 0026) -------------------------------------------
create or replace function public.notify_hot_tier_webhook()
returns trigger
language plpgsql
security definer
as $$
declare
  computed_tier hot_tier_notified;
begin
  if new.favorite_count >= 51 then
    computed_tier := 'inferno';
  elsif new.favorite_count >= 26 then
    computed_tier := 'blazing';
  elsif new.favorite_count >= 11 then
    computed_tier := 'hot';
  else
    computed_tier := 'none';
  end if;

  if public.hot_tier_rank(computed_tier) > public.hot_tier_rank(new.highest_tier_notified) then
    new.highest_tier_notified := computed_tier;

    begin
      perform net.http_post(
        url := 'https://musrnxyygnqzbbpkuqip.supabase.co/functions/v1/send-hot-tier-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || public.service_role_key()
        ),
        body := jsonb_build_object(
          'listing_id', new.id,
          'seller_id', new.seller_id,
          'tier', computed_tier
        )
      );
    exception when others then
      raise warning 'notify_hot_tier_webhook failed: %', sqlerrm;
    end;
  end if;

  return new;
end;
$$;

-- 3. Organizer approval (was 0028) ------------------------------------------
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
          'Authorization', 'Bearer ' || public.service_role_key()
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

-- 4. New organizer application alert (was 0030) -----------------------------
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
        'Authorization', 'Bearer ' || public.service_role_key()
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

-- Triggers reference these functions by name and are unchanged, so nothing
-- needs recreating. To confirm no placeholder survives anywhere afterwards:
--
--   select proname from pg_proc
--   where prosrc like '%<SERVICE_ROLE_KEY>%';
--
-- That should return zero rows.
