-- GarageHunt — Day-of Photos schema (feature spec Section 4f, technical
-- architecture Section 10). Two additive columns, no data migration:
--
--   1. listing_photos.photo_type — distinguishes the original "planning"
--      shots (taken whenever the listing was created, often days ahead) from
--      "day_of" shots snapped once the sale is actually set up. Day-of photos
--      are ADDITIVE — they never replace planning photos, they're just
--      featured first in the gallery/thumbnail on any day at least one exists
--      for (that "featured first" is derived at query/render time in
--      utils/sale-listings.ts, no stored "which photo is primary" flag).
--      Defaults to 'planning' so every existing row (and every normal List a
--      Sale / Edit Listing upload) keeps its current meaning untouched.
--
--   2. sale_listings_raw.day_of_photo_reminder_sent_date — the last calendar
--      date a "snap fresh photos" reminder was sent for this listing. A DATE,
--      not a boolean, on purpose: a multi-day sale should get this reminder
--      once per day it's actually open, not just once for the whole listing.
--      The scheduled job (0037_day_of_photo_reminders_cron.sql) compares this
--      against today's date to decide whether today's reminder has already
--      fired. Nullable — null means "never reminded".
--
--      NOTE the table name: `sale_listings` is a VIEW as of
--      0034_address_privacy_enforcement.sql (address fuzzing), so columns must
--      be added to the underlying `sale_listings_raw` table — "ALTER action
--      ADD COLUMN cannot be performed on relation sale_listings ... not
--      supported for views" otherwise. Deliberately NOT added to the view's
--      explicit column list: this is internal bookkeeping for the cron job,
--      and no client ever reads it.
--
-- RUN THIS FILE BY ITSELF — the SQL Editor runs an entire pasted script as one
-- transaction, so pasting this together with 0037 means any error there rolls
-- back these columns too (observed exactly that way once already).
--
-- HOW TO RUN THIS: same as prior migrations — paste into the Supabase
-- Dashboard's SQL Editor and run (or apply via `supabase db push`).

-- Guarded so this file stays re-runnable after a failed/rolled-back attempt.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'photo_type') then
    create type photo_type as enum ('planning', 'day_of');
  end if;
end $$;

alter table public.listing_photos
  add column if not exists photo_type photo_type not null default 'planning';

alter table public.sale_listings_raw
  add column if not exists day_of_photo_reminder_sent_date date;
