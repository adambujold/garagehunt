-- GarageHunt — SECURITY FIX: the sale_listings view's write path had no
-- authorization at all.
--
-- WHAT WAS WRONG. 0034_address_privacy_enforcement.sql turned sale_listings
-- into a view over sale_listings_raw and gave it INSTEAD OF insert/update/
-- delete triggers so it would stay writable. Those trigger functions are
-- `security definer` (they must be, to reach the raw table past its RLS) and
-- they write `where id = old.id` with **no check that the caller owns the
-- row**. Because a security definer function bypasses RLS, the "Sellers can
-- update their own listings" policy on sale_listings_raw never applied to
-- writes coming through the view — it only ever protected direct writes to
-- the raw table.
--
-- Net effect, confirmed by testing against the live project: a PATCH to
-- /rest/v1/sale_listings?id=eq.<any published listing> succeeded using only
-- the publishable key that ships in the website's JavaScript. Any visitor
-- could rewrite any published listing's title, description, dates, address,
-- coordinates, status, moderation_status, boost flags, or its view/favorite/
-- check-in counters. The same gap let anyone delete a listing, or insert one
-- attributed to another seller.
--
-- TWO INDEPENDENT HOLES, so this fixes both:
--
--   1. `anon` held INSERT/UPDATE/DELETE on the view. 0034 granted those to
--      `authenticated` only, but Supabase's default privileges had already
--      granted them to `anon` when the view was created, and an additive
--      GRANT never took them away. Revoked below.
--
--   2. `authenticated` legitimately holds those grants — so even with anon
--      revoked, ANY logged-in user could still edit ANY other seller's
--      listing. This is the more serious of the two, and no grant change can
--      fix it: the ownership check has to live inside the trigger functions.
--
-- Service-role callers are still allowed through, since they bypass RLS by
-- design elsewhere in this project. Nothing writes to the view with the
-- service role today (the Edge Functions only SELECT from it, and the cron
-- job in 0037 writes to sale_listings_raw directly), but the escape hatch
-- keeps that from becoming a surprise later.
--
-- ONE MORE THING THIS HAS TO HANDLE, or it breaks the app. Three existing
-- trigger functions legitimately update a listing the caller does NOT own:
-- sync_listing_favorite_count (a buyer hearts someone else's sale),
-- sync_listing_checkin_count (a buyer checks in), and sync_listing_event_id
-- (an organizer approves a join request). All three were written against
-- `public.sale_listings` back when it was a real table; after 0034's rename
-- they silently started routing through the view, so an ownership check here
-- would block favouriting, check-ins, and event joins outright. Section 3
-- repoints them at sale_listings_raw, which is where internal counter/system
-- updates belong anyway — they're already `security definer` specifically so
-- they can bypass the raw table's RLS.
--
-- HOW TO RUN THIS: paste into the Supabase Dashboard's SQL Editor and run.
-- Run it by itself — the SQL Editor executes a pasted script as one
-- transaction. No placeholders to replace.

-- 1. Take DML away from anonymous callers. SELECT stays: public browsing is
-- the whole point of the view, and its WHERE clause already limits anon to
-- published, non-rejected rows.
revoke insert, update, delete on public.sale_listings from anon;

-- 2. Ownership enforcement inside the triggers themselves.

-- True when the caller is the service role, which is trusted here. Written
-- against request.jwt.claims (with the missing_ok flag) so it returns false
-- rather than throwing when there's no JWT at all.
create or replace function public.is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) = 'service_role';
$$;

create or replace function public.sale_listings_view_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  -- A listing may only ever be created for yourself. Without this, any
  -- authenticated caller could publish a listing attributed to someone else.
  if not public.is_service_role() and new.seller_id is distinct from auth.uid() then
    raise exception 'Not authorized to create a listing for another seller'
      using errcode = '42501';
  end if;

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

create or replace function public.sale_listings_view_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The check this whole migration exists for. old.seller_id is the row as it
  -- currently stands in the database, so a caller can't slip past by sending a
  -- different seller_id in the payload.
  if not public.is_service_role() and old.seller_id is distinct from auth.uid() then
    raise exception 'Not authorized to modify this listing'
      using errcode = '42501';
  end if;

  -- seller_id is deliberately not in the SET list (unchanged from 0034) —
  -- ownership is not transferable through this path.
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

create or replace function public.sale_listings_view_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_service_role() and old.seller_id is distinct from auth.uid() then
    raise exception 'Not authorized to delete this listing'
      using errcode = '42501';
  end if;

  delete from public.sale_listings_raw where id = old.id;
  return old;
end;
$$;

-- 3. Repoint the internal counter/system triggers at the raw table, so the
-- ownership check above doesn't break them. Each is unchanged apart from the
-- target relation. Triggers reference these functions by name, so replacing
-- the bodies is enough — no trigger needs recreating.

-- Buyer hearts/unhearts someone else's listing.
create or replace function public.sync_listing_favorite_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update public.sale_listings_raw
      set favorite_count = favorite_count + 1
      where id = new.listing_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.sale_listings_raw
      set favorite_count = greatest(favorite_count - 1, 0)
      where id = old.listing_id;
    return old;
  end if;
  return null;
end;
$$;

-- Buyer checks in at someone else's sale.
create or replace function public.sync_listing_checkin_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sale_listings_raw
  set checkin_count = checkin_count + 1
  where id = new.listing_id;
  return new;
end;
$$;

-- Organizer approves (or later revokes) a seller's request to join an event.
create or replace function public.sync_listing_event_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' then
    update public.sale_listings_raw set event_id = new.event_id where id = new.listing_id;
  elsif tg_op = 'UPDATE' and old.status = 'approved' and new.status <> 'approved' then
    update public.sale_listings_raw set event_id = null where id = new.listing_id;
  end if;
  return new;
end;
$$;
