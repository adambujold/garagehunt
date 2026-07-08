-- GarageHunt — narrow sale_listings.status to a real 3-value lifecycle enum
--
-- DEVIATION FROM THE DOC: docs/garage-sale-app-technical-architecture.md
-- lists status as (draft, scheduled, live, ended, cancelled) — 5 stored
-- values. Per product decision, only 3 are actually stored going forward:
-- draft, published, cancelled. "Scheduled"/"Live"/"Ended" are never written
-- to the database — they're derived at display time (in the app layer) for
-- any `published` listing by comparing start_date/end_date to today. This
-- avoids needing a scheduled job to flip statuses as dates roll over, and
-- means extending a past end_date on a published listing makes it live
-- again automatically, with no status transition to manage.
--
-- Existing rows: 'scheduled' and 'live' and 'ended' all collapse into
-- 'published' (their derived display status is recomputed from dates at
-- read time anyway, so no information is lost). 'draft' and 'cancelled'
-- map straight across.
--
-- HOW TO RUN THIS: same as 0001/0002/0003 — paste into the Supabase
-- Dashboard's SQL Editor and run, or apply via `supabase db push`. Not
-- idempotent (like 0001/0002) — this is a one-time structural change.

create type sale_status_v2 as enum ('draft', 'published', 'cancelled');

alter table public.sale_listings add column status_v2 sale_status_v2;

update public.sale_listings
set status_v2 = case
  when status = 'draft' then 'draft'::sale_status_v2
  when status = 'cancelled' then 'cancelled'::sale_status_v2
  else 'published'::sale_status_v2
end;

alter table public.sale_listings alter column status_v2 set not null;
alter table public.sale_listings alter column status_v2 set default 'draft';

drop index if exists sale_listings_status_idx;
alter table public.sale_listings drop column status;
alter table public.sale_listings rename column status_v2 to status;

drop type sale_status;
alter type sale_status_v2 rename to sale_status;

create index sale_listings_status_idx on public.sale_listings (status);
