-- GarageHunt — make the publish-listing Edge Function the only way a listing
-- can reach 'published', and take moderation_status away from clients.
--
-- THE GAP THIS CLOSES. Publishing was decided entirely on the client:
-- publishSaleListing called moderate-listing-text, counted the seller's
-- published listings, decided whether moderation_status should be 'clean' or
-- 'pending_review', and wrote status + moderation_status itself. All of it was
-- advisory. A seller could skip the moderation call outright and write
-- status='published', moderation_status='clean' directly — publishing
-- unreviewed content and marking it clean in one step. 0040 deliberately left
-- moderation_status writable because locking it alone would have broken
-- publishing; this migration lands the server-side replacement at the same
-- time, so nothing breaks.
--
-- TWO WAYS IN, both closed here:
--   1. UPDATE ... SET status='published'  — blocked below unless service role.
--   2. INSERT ... status='published'      — the view's INSERT trigger honoured
--      whatever status the client supplied, so a listing could be *created*
--      already published, never passing any gate at all. Non-privileged
--      inserts are now forced to 'draft'.
--
-- These RAISE rather than silently ignoring, unlike 0040's column locks. A
-- silently-ignored publish looks like success while the listing stays a draft,
-- which is a confusing bug to chase; a client attempting the old path should
-- fail loudly and obviously. Both apps are updated in the same commit to call
-- the Edge Function instead, and expo-updates means the mobile fix ships
-- without a build.
--
-- PREREQUISITE: deploy the `publish-listing` Edge Function BEFORE running
-- this. Between running this and deploying that, publishing is impossible from
-- any client.
--
-- HOW TO RUN THIS: paste into the Supabase Dashboard's SQL Editor and run, by
-- itself. No placeholders.

-- 1. INSERT: a client may never create an already-published listing ----------
create or replace function public.sale_listings_view_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  privileged boolean := public.is_service_role();
begin
  if not privileged and new.seller_id is distinct from auth.uid() then
    raise exception 'Not authorized to create a listing for another seller'
      using errcode = '42501';
  end if;

  -- Anything a client asks for that isn't 'draft' is refused outright rather
  -- than quietly downgraded, so a caller can't believe it published.
  if not privileged and coalesce(new.status, 'draft') <> 'draft' then
    raise exception 'New listings must be created as drafts; publish through the publish-listing function'
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

-- 2. UPDATE: block the transition into 'published', lock moderation_status ---
create or replace function public.sale_listings_view_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  privileged boolean := public.is_service_role();
begin
  if not privileged and old.seller_id is distinct from auth.uid() then
    raise exception 'Not authorized to modify this listing'
      using errcode = '42501';
  end if;

  -- Only the transition INTO published is gated. Editing a listing that is
  -- already published (status stays 'published') is untouched, and so are
  -- draft -> cancelled and published -> cancelled.
  if not privileged and new.status = 'published' and old.status is distinct from 'published' then
    raise exception 'Publishing goes through the publish-listing function, which runs content screening'
      using errcode = '42501';
  end if;

  update public.sale_listings_raw set
    -- Seller-editable.
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
    -- System-controlled. moderation_status joins this list as of 0041: it is
    -- now set only by publish-listing (service role) or a human reviewer in
    -- the dashboard. A seller can no longer declare their own content clean.
    moderation_status = case when privileged then new.moderation_status else old.moderation_status end,
    is_boosted = case when privileged then new.is_boosted else old.is_boosted end,
    boost_expires_at = case when privileged then new.boost_expires_at else old.boost_expires_at end,
    highest_tier_notified = case when privileged then new.highest_tier_notified else old.highest_tier_notified end,
    view_count = case when privileged then new.view_count else old.view_count end,
    favorite_count = case when privileged then new.favorite_count else old.favorite_count end,
    checkin_count = case when privileged then new.checkin_count else old.checkin_count end
  where id = old.id;
  return new;
end;
$$;

-- STILL OPEN, same class of problem one level down: listing_photos' INSERT
-- policy lets the client choose moderation_status, because photo screening is
-- also currently a client-side call (uploadListingPhoto asks
-- moderate-listing-photo, then inserts the row with whatever came back). A
-- seller could insert 'approved' directly and skip image screening entirely,
-- which then also satisfies the photo gate in publish-listing. Closing it
-- means the photo moderation Edge Function writing the row itself rather than
-- returning a verdict to be trusted. Worth doing before launch; deliberately
-- not bundled here to keep this migration reviewable.
