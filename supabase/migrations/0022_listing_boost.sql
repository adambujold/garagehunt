-- GarageHunt — listing boost, Phase 3 of monetization (technical
-- architecture doc Section 4, Monetization Data Model; feature spec
-- Section 10, "Boost a listing"). $2.99 one-time purchase, 48 hours,
-- priority placement in Discover's default browse order only — matching
-- ("I'm Looking For") stays entirely relevance-based, never touches these
-- fields.
--
-- HOW THIS FLOWS, deliberately different from the ad-free subscription:
-- boost is a one-time purchase tied to a *specific listing*, and
-- RevenueCat's SDK has no reliable way to carry "which listing" alongside a
-- purchase (no per-transaction metadata field on purchasePackage(), and
-- subscriber attributes race under back-to-back purchases). So unlike
-- is_ad_free (server-only, written exclusively by revenuecat-webhook), the
-- client applies the boost directly and immediately after
-- purchasePackage() resolves successfully — see utils/purchases.ts
-- (purchaseBoost) and utils/sale-listings.ts (applyListingBoost). The
-- existing "Sellers can update their own listings" policy from
-- 0001_sale_listings_schema.sql already scopes this correctly (a client can
-- only ever boost a listing where auth.uid() = seller_id), so no new RLS is
-- needed here — this is the "RLS to listings the buyer actually owns"
-- constraint the client-side approach depends on for safety.
--
-- TRADEOFF, stated plainly: since the client (not a server verifying an
-- Apple/Google receipt) is what flips is_boosted, a technically inclined
-- seller could in principle call this update directly without ever paying.
-- The blast radius is scoped to "free boost on your own listing" — nowhere
-- near the account-wide/revenue-wide exposure a forged is_ad_free would be
-- — and this tradeoff was made deliberately for reliability/simplicity per
-- product direction, not an oversight.
--
-- boost_purchases below is the "backend record" of the purchase itself —
-- logged by revenuecat-webhook on RevenueCat's NON_RENEWING_PURCHASE event
-- (consumable one-time products don't get INITIAL_PURCHASE/RENEWAL like the
-- subscription does). It's a record that a purchase happened, not what
-- actually triggers the boost, and deliberately carries no listing_id since
-- the webhook has no reliable way to know which listing was being boosted
-- either — same reasoning as above, just restated on the logging side.
--
-- HOW TO RUN THIS: paste into the Supabase Dashboard's SQL Editor and run.

alter table public.sale_listings add column is_boosted boolean not null default false;
alter table public.sale_listings add column boost_expires_at timestamptz;

create table public.boost_purchases (
  id uuid primary key default gen_random_uuid(),
  -- on delete set null (not cascade) — matches
  -- garagehunt-account-deletion.html's disclosed policy: purchase/
  -- subscription records are retained for financial recordkeeping,
  -- "disconnected from your deleted profile where possible."
  user_id uuid references public.users (id) on delete set null,
  product_id text not null,
  price numeric,
  currency text,
  -- Unique so a webhook retry (RevenueCat resends on a non-2xx response)
  -- can't log the same purchase twice.
  transaction_id text not null unique,
  purchased_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.boost_purchases enable row level security;

create policy "Users can view their own boost purchases"
  on public.boost_purchases for select
  using (auth.uid() = user_id);

-- No insert/update/delete policy for authenticated — only
-- revenuecat-webhook (service role) ever writes here.
