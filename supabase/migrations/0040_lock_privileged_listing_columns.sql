-- GarageHunt — stop sellers from writing privileged columns on their own
-- listings through the sale_listings view.
--
-- BACKGROUND. 0038 fixed "anyone can edit anyone's listing". This fixes the
-- narrower thing it left behind: the *owner* of a listing could still set any
-- column the view's INSTEAD OF update trigger passes through, including ones
-- that are supposed to be system-controlled. Concretely, a seller could:
--
--   * set is_boosted / boost_expires_at  -> free Featured placement, no purchase
--   * set favorite_count / view_count / checkin_count -> fabricated social proof
--   * set highest_tier_notified -> replay or suppress Hot Listing notifications
--
-- The boost case was a deliberate, documented tradeoff in
-- 0022_listing_boost.sql: RevenueCat's SDK can't carry "which listing" with a
-- one-time purchase, so the client applied the boost itself right after
-- purchasePackage() resolved. That header called out the risk honestly ("a
-- technically inclined seller could in principle call this update directly
-- without ever paying"). This migration removes the tradeoff rather than
-- accepting it, because the missing piece already exists: the
-- revenuecat-webhook has been logging every real purchase into
-- boost_purchases all along. That's server-verified proof a purchase
-- happened — it just was never checked. Now a boost must consume one.
--
-- WHAT STAYS EDITABLE: everything a seller legitimately controls — dates,
-- title, description, categories, other_items, payment_method, status,
-- address fields. Editing a listing is unaffected.
--
-- STILL OPEN AFTER THIS, deliberately not fixed here: moderation_status is
-- left writable because publishSaleListing (both apps) computes it
-- client-side from the moderation result and the first-listing check, then
-- writes it as part of publishing. Locking it would break publishing outright.
-- Closing that properly means moving the whole publish decision server-side
-- into an Edge Function that runs the text check itself and writes the
-- verdict — a real refactor, not a column lock. Worth doing before launch;
-- see the note at the end of this file.
--
-- HOW TO RUN THIS: paste into the Supabase Dashboard's SQL Editor and run, by
-- itself. No placeholders. Deploy nothing first — the RPC and the trigger
-- change land together, and the mobile app keeps working either way (see the
-- app-side note at the end).

-- 1. Track which purchase paid for which boost -------------------------------
-- Nullable + no backfill: boosts applied before this migration simply have no
-- linked purchase, which is fine — this only gates NEW boosts.
alter table public.boost_purchases
  add column if not exists consumed_listing_id uuid references public.sale_listings_raw (id) on delete set null,
  add column if not exists consumed_at timestamptz;

create index if not exists boost_purchases_unconsumed_idx
  on public.boost_purchases (user_id)
  where consumed_at is null;

-- 2. The only supported way to boost a listing -------------------------------
-- security definer so it can write the now-locked columns on the raw table.
-- Returns the new expiry so the caller can update its UI, matching what the
-- old client-side update returned.
create or replace function public.apply_listing_boost(p_listing_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid;
  v_claimed uuid;
  v_expires timestamptz;
begin
  select seller_id into v_seller from public.sale_listings_raw where id = p_listing_id;
  if v_seller is null then
    raise exception 'Listing not found' using errcode = '42704';
  end if;
  if v_seller is distinct from auth.uid() then
    raise exception 'Not authorized to boost this listing' using errcode = '42501';
  end if;

  -- Claim exactly one unconsumed purchase belonging to this user. FOR UPDATE
  -- SKIP LOCKED so two concurrent boosts can't both claim the same row; the
  -- second either grabs a different purchase or correctly finds none.
  update public.boost_purchases
  set consumed_listing_id = p_listing_id,
      consumed_at = now()
  where id = (
    select id
    from public.boost_purchases
    where user_id = auth.uid()
      and consumed_at is null
    order by purchased_at asc
    limit 1
    for update skip locked
  )
  returning id into v_claimed;

  if v_claimed is null then
    -- Either they never purchased, or the webhook hasn't landed yet (it fires
    -- within seconds, but it IS asynchronous). The client surfaces this as a
    -- "we couldn't confirm your purchase, try again in a moment" message
    -- rather than silently doing nothing.
    raise exception 'No unused boost purchase found for this account'
      using errcode = 'P0002';
  end if;

  -- Always a fresh 48h from now, matching the previous behaviour: re-boosting
  -- an already-boosted listing restarts the window rather than stacking.
  v_expires := now() + interval '48 hours';

  update public.sale_listings_raw
  set is_boosted = true,
      boost_expires_at = v_expires
  where id = p_listing_id;

  return v_expires;
end;
$$;

revoke all on function public.apply_listing_boost(uuid) from public;
grant execute on function public.apply_listing_boost(uuid) to authenticated;

-- 3. Lock the privileged columns in the view's write path ---------------------
-- Same shape as 0038's version; the only change is that system-controlled
-- columns now carry OLD's value through unless the caller is the service role.
-- Writing to them becomes a silent no-op rather than an error, so an app that
-- still sends them in an update payload keeps working — it just can't change
-- them.
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
    -- Left seller-writable on purpose — see this file's header. Publishing
    -- currently depends on the client setting it.
    moderation_status = new.moderation_status,
    -- System-controlled from here down. Paid placement: only
    -- apply_listing_boost (which consumes a verified purchase) or the service
    -- role may change these.
    is_boosted = case when privileged then new.is_boosted else old.is_boosted end,
    boost_expires_at = case when privileged then new.boost_expires_at else old.boost_expires_at end,
    -- Set by the Hot Listing ratchet trigger only.
    highest_tier_notified = case when privileged then new.highest_tier_notified else old.highest_tier_notified end,
    -- Denormalised counters, maintained by their own triggers against the raw
    -- table (see 0038 section 3). A client writing these is always fabrication.
    view_count = case when privileged then new.view_count else old.view_count end,
    favorite_count = case when privileged then new.favorite_count else old.favorite_count end,
    checkin_count = case when privileged then new.checkin_count else old.checkin_count end
  where id = old.id;
  return new;
end;
$$;

-- APP-SIDE NOTE. utils/sale-listings.ts's applyListingBoost is updated in the
-- same commit to call apply_listing_boost() via rpc() instead of updating
-- is_boosted directly. An older build that still does the direct update will
-- no longer fail loudly — the write is silently ignored — so the boost simply
-- won't apply until that build is replaced. Worth knowing when reading a bug
-- report from a stale client.
--
-- FOLLOW-UP BEFORE LAUNCH: move publishSaleListing's moderation decision
-- server-side (an Edge Function that runs the text check and writes
-- moderation_status itself), then drop moderation_status out of the
-- seller-editable list above.
