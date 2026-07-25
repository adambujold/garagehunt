-- GarageHunt — the "snap fresh photos" day-of reminder job (feature spec
-- Section 4f, technical architecture Section 10).
--
-- WHY A CRON JOB AT ALL (this is the one deliberate exception to the
-- project's "derive at query time, don't run background jobs" principle):
-- every other notification here fires off a real database event — a match
-- row inserted, favorite_count crossing a Hot tier, an organizer approval.
-- This one has no event to hook onto: nothing in the database changes when a
-- clock reaches a listing's daily_start_time, time simply passes. A small
-- scheduled poll is the honest answer for that one class of problem.
--
-- TIMEZONE — a real limitation, called out on purpose. The rest of the app
-- derives dates naive-device-local (see deriveDisplayStatus in
-- utils/sale-listings.ts) and there is no per-listing timezone column, so
-- daily_start_time is a bare `time` with no zone. pg_cron runs in the
-- database's UTC. To make "today" and "the current time of day" line up with
-- what a seller actually experiences, this job anchors both to
-- America/Toronto — correct for the London, Ontario launch market and every
-- other Eastern-time market. A truly multi-timezone-correct version needs a
-- per-listing timezone column (derivable from lat/lng) threaded through both
-- this job and deriveDisplayStatus; deliberately deferred, same as the app's
-- existing naive-local date handling.
--
-- PREREQUISITE — pg_cron must be enabled. Unlike pg_net (enabled by hand via
-- Database -> Extensions for the earlier trigger migrations), this migration
-- enables it itself in the statement below, so there's no separate dashboard
-- step to forget. Without it the whole script fails on the first `cron.`
-- reference with: ERROR 3F000: schema "cron" does not exist.
-- pg_net (schema `net`) is already enabled and is what actually calls the
-- Edge Function below.
--
-- RUN THIS FILE BY ITSELF — do not paste it into the same SQL Editor run as
-- another migration. The SQL Editor executes an entire pasted script as ONE
-- transaction, so an error anywhere rolls back *everything* in the box: run
-- 0036 and this file together and a failure here silently reverts 0036's
-- columns too (observed exactly that way once already).
--
-- HOW TO RUN THIS: paste into the Supabase Dashboard's SQL Editor and run.
-- Before running, replace <SERVICE_ROLE_KEY> below with the real service_role
-- secret (Project Settings -> API) — paste it directly into the SQL Editor
-- box, exactly like 0019/0026/0028/0030 did, so the real key never lands in
-- this committed file. Deploy the send-day-of-photos-reminder Edge Function
-- (supabase/functions/send-day-of-photos-reminder) before scheduling this, or
-- the first runs will just log a warning and no-op.

-- Creates the `cron` schema and its cron.job table. Safe to re-run, and safe
-- if it was already enabled via Database -> Extensions.
create extension if not exists pg_cron;

-- The worker the cron job calls each run. security definer so it can read/
-- write every seller's listings (RLS would otherwise scope it to nobody —
-- there's no authenticated user in a cron context).
create or replace function public.send_day_of_photo_reminders()
returns void
language plpgsql
security definer
as $$
declare
  -- Both anchored to the launch market's timezone — see header note. A single
  -- now() evaluated once so the date and time-of-day used below can't straddle
  -- a tick.
  now_local  timestamp := timezone('America/Toronto', now());
  today_local date     := (timezone('America/Toronto', now()))::date;
  rec record;
begin
  -- Claim-then-notify: the UPDATE stamps day_of_photo_reminder_sent_date =
  -- today FIRST (inside a data-modifying CTE) and only the rows it actually
  -- claimed come back via RETURNING. That makes the "once per day" guard
  -- atomic — even if two runs somehow overlap, a given listing is claimed by
  -- exactly one of them, so a seller can never get two reminders for the same
  -- day. A send that fails after this point simply isn't retried today, which
  -- is the right tradeoff for a nice-to-have nudge (mirrors the fire-and-forget
  -- posture of the existing pg_net notification triggers).
  for rec in
    with claimed as (
      -- sale_listings_raw, not sale_listings: the latter is a VIEW as of
      -- 0034_address_privacy_enforcement.sql, and its INSTEAD OF update
      -- trigger has a fixed column list that doesn't include this column.
      -- Writing to the raw table directly is also what 0035's trigger does.
      update public.sale_listings_raw sl
      set day_of_photo_reminder_sent_date = today_local
      where sl.status = 'published'
        -- Never nudge a listing moderation has pulled down — it isn't
        -- publicly visible, so "your sale is starting!" would be wrong.
        -- Mirrors the sale_listings view's own visibility condition.
        and sl.moderation_status <> 'rejected'
        -- currently within the sale's date range
        and sl.start_date <= today_local
        and sl.end_date >= today_local
        -- today's opening time has passed AND the sale hasn't closed for the
        -- day yet — "within the job's check window", so a missed morning run
        -- can still send later that day, but a closed sale never gets a
        -- spurious "your sale is starting!" ping.
        and sl.daily_start_time <= now_local::time
        and sl.daily_end_time >= now_local::time
        -- today's reminder hasn't already been sent
        and sl.day_of_photo_reminder_sent_date is distinct from today_local
      returning sl.id, sl.seller_id
    )
    select id, seller_id from claimed
  loop
    begin
      perform net.http_post(
        url := 'https://musrnxyygnqzbbpkuqip.supabase.co/functions/v1/send-day-of-photos-reminder',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
        ),
        body := jsonb_build_object(
          'listing_id', rec.id,
          'seller_id', rec.seller_id
        )
      );
    exception when others then
      -- A single listing's send failing must not abort the whole run (or roll
      -- back the sent-date stamps of the listings already claimed above).
      raise warning 'send_day_of_photo_reminders http_post failed for %: %', rec.id, sqlerrm;
    end;
  end loop;
end;
$$;

-- Every 15 minutes — comfortably inside the 10-15 min cadence the spec asks
-- for, and fine-grained enough that a reminder lands close to the sale's
-- actual start time in practice. Unschedule-then-schedule so re-running this
-- migration is idempotent (cron.schedule errors on a duplicate job name).
select cron.unschedule('day-of-photo-reminders')
where exists (select 1 from cron.job where jobname = 'day-of-photo-reminders');

select cron.schedule(
  'day-of-photo-reminders',
  '*/15 * * * *',
  $$ select public.send_day_of_photo_reminders(); $$
);
