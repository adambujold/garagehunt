-- GarageHunt — closes a real, live privacy gap: sale_listings has always
-- granted `select using (true)` to literally everyone (see 0001's own
-- header comment: "the address-privacy fuzzing rule... is NOT ENFORCED
-- HERE... a follow-up, not part of this pass"), meaning exact
-- latitude/longitude/address_text has been readable by anyone — mobile app
-- included, any signed-in buyer looking at someone else's listing, not just
-- an anonymous caller — regardless of reveal_at. Harmless while the only
-- way to read it was querying Supabase directly; a real exposure once a
-- public, SEO-crawlable website (feature spec Section 13) exists, since
-- every seller's exact home address becomes search-engine-indexable.
--
-- Mechanism: rename the real table to sale_listings_raw, then rebuild
-- `sale_listings` as a VIEW in its place that computes the fuzzed/truncated
-- fields per-row — the "security-definer view" 0001 flagged as a future
-- follow-up. INSTEAD OF triggers forward inserts/updates/deletes to the raw
-- table, so every existing app query (List a Sale, Edit Listing, My
-- Listings, Discover, Matches, etc.) keeps saying `.from('sale_listings')`
-- completely unchanged — no mobile app code needs to change for this fix.
--
-- Rule (matches the technical architecture doc's "Address privacy
-- enforcement", Section 3): exact latitude/longitude/address_text are
-- visible only to (a) the listing's own seller, always, regardless of
-- status, or (b) anyone, once revealed (now() >= reveal_at, or
-- immediate_reveal_opt_in = true). Everyone else gets a stored fuzzed
-- coordinate and a truncated address ("Maple Street area" style). A null
-- reveal_at (shouldn't happen for new rows — see createSaleListing — but
-- could exist on old test data) is treated as "not revealed", the safe
-- default.
--
-- Row visibility: unchanged for the owner (sellers still see every one of
-- their own rows regardless of status). Everyone else now only sees
-- published, non-cancelled rows (status = 'published' already excludes
-- draft/cancelled per migration 0004) AND non-rejected ones — that second
-- part is a safety addition here, since a publicly-indexable website is
-- exactly the surface a human reviewer's rejection is meant to keep
-- content off of.
--
-- REQUIRED MANUAL FOLLOW-UP AFTER RUNNING THIS (Database Webhooks and Table
-- Editor both target the physical table by name, not the view):
--   1. Dashboard -> Database -> Webhooks: repoint the two webhooks that
--      currently watch `sale_listings` (hot-tier notifications, match
--      notifications) to watch `sale_listings_raw` instead. Left pointed
--      at the old name, both notification pipelines silently stop firing.
--   2. Use `sale_listings_raw` in Table Editor from now on for manual
--      moderation review (flipping a flagged listing to `rejected`, etc.)
--      — the view is filtered/computed, not the right place for that.
--
-- VERIFY AFTER RUNNING: reload the app and confirm Discover / Sale Detail /
-- My Listings still show listings with their categories and photos.
-- listing_categories/listing_photos embed via PostgREST's automatic
-- relationship detection (LISTING_SELECT's nested
-- `listing_categories(categories(name))` syntax), which needs to trace the
-- FK through the view back to sale_listings_raw — well-supported for a
-- plain single-table view like this one, but real DB behavior is the only
-- way to be certain. If embedding breaks, the fallback is querying
-- listing_categories/listing_photos as separate queries instead of nested
-- selects — a follow-up fix, not something to guess at now.
--
-- HOW TO RUN THIS: paste into the Supabase Dashboard's SQL Editor and run.
-- Do this during low-traffic — it briefly locks sale_listings while
-- renaming and backfilling.

-- 1. Fuzzed coordinates need to actually exist somewhere to fall back to —
-- generated once per listing (not re-randomized per query, so a map pin
-- never jitters between app opens).
alter table public.sale_listings add column if not exists fuzzed_latitude double precision;
alter table public.sale_listings add column if not exists fuzzed_longitude double precision;

-- Random point within ~120m of the real one — sqrt(random()) for the
-- radius keeps the distribution uniform by area (not clustered toward the
-- center). Degrees-per-meter: 111,320m per degree latitude everywhere;
-- longitude scales by cos(latitude) since meridians converge toward the
-- poles.
create or replace function public.compute_fuzzed_point(lat double precision, lng double precision)
returns table (fuzzed_lat double precision, fuzzed_lng double precision)
language sql
volatile
as $$
  select
    lat + (sqrt(random()) * 120 * sin(bearing)) / 111320.0,
    lng + (sqrt(random()) * 120 * cos(bearing)) / (111320.0 * cos(radians(lat)))
  from (select random() * 2 * pi() as bearing) b;
$$;

-- An UPDATE's own target table can't be correlated into its FROM clause at
-- all — not even with LATERAL, which only works between FROM-list items in
-- a plain SELECT. Routing through a CTE first sidesteps that entirely: the
-- CTE is a normal SELECT (LATERAL is fine there), and the outer UPDATE then
-- just does a plain equi-join against its precomputed results. bearing/
-- radius_m are each sampled exactly once per row and reused for both the
-- latitude and longitude formulas — sampling random() separately in each
-- formula would produce two unrelated offsets instead of one real point.
with fuzzed as (
  select
    id,
    latitude + (radius_m * sin(bearing)) / 111320.0 as new_lat,
    longitude + (radius_m * cos(bearing)) / (111320.0 * cos(radians(latitude))) as new_lng
  from public.sale_listings,
  lateral (select random() * 2 * pi() as bearing, sqrt(random()) * 120 as radius_m) r
  where fuzzed_latitude is null
)
update public.sale_listings sl
set fuzzed_latitude = fuzzed.new_lat, fuzzed_longitude = fuzzed.new_lng
from fuzzed
where fuzzed.id = sl.id;

alter table public.sale_listings alter column fuzzed_latitude set not null;
alter table public.sale_listings alter column fuzzed_longitude set not null;

-- New rows need this computed automatically too — the app never
-- computes/sends a fuzzed pair itself, so this can't be left for client
-- code to remember.
create or replace function public.set_fuzzed_location()
returns trigger
language plpgsql
as $$
begin
  if new.fuzzed_latitude is null or new.fuzzed_longitude is null then
    select fuzzed_lat, fuzzed_lng into new.fuzzed_latitude, new.fuzzed_longitude
    from public.compute_fuzzed_point(new.latitude, new.longitude);
  end if;
  return new;
end;
$$;

drop trigger if exists sale_listings_set_fuzzed_location on public.sale_listings;
create trigger sale_listings_set_fuzzed_location
  before insert on public.sale_listings
  for each row execute function public.set_fuzzed_location();

-- Best-effort truncation of a full address down to a "Street Name area"
-- shape — strips a leading house-number token, then keeps only the first
-- comma-separated segment. Good enough for the common "123 Street Name,
-- City, Province..." shape Mapbox's full_address returns; falls back to
-- the un-truncated first segment if there's no leading number to strip.
create or replace function public.fuzzed_address_text(full_address text)
returns text
language sql
immutable
as $$
  select regexp_replace(split_part(full_address, ',', 1), '^\s*\d+\s+', '') || ' area';
$$;

-- 2. Rename the real table out of the way, then rebuild `sale_listings` as
-- a view in its place — every existing .from('sale_listings') call in the
-- app (insert/update/select alike) keeps working unchanged. Existing RLS
-- policies, the set_updated_at trigger, and all foreign keys from other
-- tables (listing_categories, listing_photos, favorites, matches, reviews,
-- check_ins, boost_purchases, etc.) stay attached through the rename —
-- Postgres tracks these by OID, not by name.
-- Guarded so this whole file stays safe to paste and run again — a plain
-- rename would fail on a second run since `sale_listings` is a view by then.
do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'sale_listings' and c.relkind = 'r'
  ) then
    alter table public.sale_listings rename to sale_listings_raw;
  end if;
end $$;

create or replace view public.sale_listings as
select
  id,
  seller_id,
  case when (seller_id = auth.uid()) or (coalesce(now() >= reveal_at, false) or immediate_reveal_opt_in)
    then latitude else fuzzed_latitude end as latitude,
  case when (seller_id = auth.uid()) or (coalesce(now() >= reveal_at, false) or immediate_reveal_opt_in)
    then longitude else fuzzed_longitude end as longitude,
  case when (seller_id = auth.uid()) or (coalesce(now() >= reveal_at, false) or immediate_reveal_opt_in)
    then address_text else public.fuzzed_address_text(address_text) end as address_text,
  (seller_id = auth.uid()) or (coalesce(now() >= reveal_at, false) or immediate_reveal_opt_in) as is_revealed,
  reveal_at,
  immediate_reveal_opt_in,
  start_date,
  end_date,
  daily_start_time,
  daily_end_time,
  status,
  title,
  description,
  other_items,
  event_id,
  view_count,
  favorite_count,
  checkin_count,
  is_boosted,
  boost_expires_at,
  highest_tier_notified,
  moderation_status,
  payment_method,
  created_at,
  updated_at
from public.sale_listings_raw
where (status = 'published' and moderation_status != 'rejected') or seller_id = auth.uid();

-- 3. RLS moves to the raw table — the view itself doesn't need its own
-- policies (a plain view runs with its owner's privileges, not the
-- querying role's, so the WHERE clause above is what actually gates row
-- visibility; RLS on the raw table just needs to let that owner role
-- through, which the table creator already can).
alter table public.sale_listings_raw enable row level security;

drop policy if exists "Sale listings are viewable by everyone" on public.sale_listings_raw;
drop policy if exists "Sellers can view their own raw listing rows" on public.sale_listings_raw;

create policy "Sellers can view their own raw listing rows"
  on public.sale_listings_raw for select
  using (auth.uid() = seller_id);

-- Insert/update policies ("Sellers can insert their own listings", "Sellers
-- can update their own listings") already existed on the original table
-- and moved over automatically with the rename — no need to recreate them.

-- 4. Views need INSTEAD OF triggers to remain insertable/updatable/deletable
-- the same way the real table always was.
create or replace function public.sale_listings_view_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  insert into public.sale_listings_raw (
    seller_id, latitude, longitude, address_text, reveal_at, immediate_reveal_opt_in,
    start_date, end_date, daily_start_time, daily_end_time, status, title, description,
    other_items, event_id, payment_method
  ) values (
    new.seller_id, new.latitude, new.longitude, new.address_text, new.reveal_at, new.immediate_reveal_opt_in,
    new.start_date, new.end_date, new.daily_start_time, new.daily_end_time,
    coalesce(new.status, 'draft'), new.title, new.description,
    coalesce(new.other_items, '{}'), new.event_id, coalesce(new.payment_method, 'cash_only')
  )
  returning id into new_id;
  select * into new from public.sale_listings where id = new_id;
  return new;
end;
$$;

drop trigger if exists sale_listings_view_insert_trigger on public.sale_listings;
create trigger sale_listings_view_insert_trigger
  instead of insert on public.sale_listings
  for each row execute function public.sale_listings_view_insert();

create or replace function public.sale_listings_view_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sale_listings_raw set
    latitude = new.latitude,
    longitude = new.longitude,
    address_text = new.address_text,
    reveal_at = new.reveal_at,
    immediate_reveal_opt_in = new.immediate_reveal_opt_in,
    start_date = new.start_date,
    end_date = new.end_date,
    daily_start_time = new.daily_start_time,
    daily_end_time = new.daily_end_time,
    status = new.status,
    title = new.title,
    description = new.description,
    other_items = new.other_items,
    event_id = new.event_id,
    payment_method = new.payment_method,
    is_boosted = new.is_boosted,
    boost_expires_at = new.boost_expires_at,
    highest_tier_notified = new.highest_tier_notified,
    moderation_status = new.moderation_status,
    view_count = new.view_count,
    favorite_count = new.favorite_count,
    checkin_count = new.checkin_count
  where id = old.id;
  return new;
end;
$$;

drop trigger if exists sale_listings_view_update_trigger on public.sale_listings;
create trigger sale_listings_view_update_trigger
  instead of update on public.sale_listings
  for each row execute function public.sale_listings_view_update();

create or replace function public.sale_listings_view_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.sale_listings_raw where id = old.id;
  return old;
end;
$$;

drop trigger if exists sale_listings_view_delete_trigger on public.sale_listings;
create trigger sale_listings_view_delete_trigger
  instead of delete on public.sale_listings
  for each row execute function public.sale_listings_view_delete();

-- 5. Grants — the view needs its own explicit grants (views don't inherit
-- the base table's grants). This is what actually gives `anon` its first
-- ever real read access — previously anon had no Supabase session at all
-- in the mobile app, so this is specifically for the upcoming website.
grant select on public.sale_listings to anon, authenticated;
grant insert, update, delete on public.sale_listings to authenticated;
