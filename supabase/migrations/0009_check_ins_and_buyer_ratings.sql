-- GarageHunt — buyer check-in + shopper tiers, and a lightweight seller-side
-- "thumbs-up" for buyers who showed up.
--
-- NOT IN EITHER DOC: neither garage-sale-app-feature-spec.md nor
-- garage-sale-app-technical-architecture.md defines check_ins, buyer_ratings,
-- or shopper tiers. In fact feature spec Section 4d explicitly calls GPS
-- check-in verification a "Phase 2/3 addition, not worth taking on for MVP."
-- This migration is that addition, built now on top of the just-shipped
-- reviews system (0008_reviews.sql). Schema/RLS below is new design, not
-- transcribed from either doc.
--
-- TRUST BOUNDARY: Postgres has no way to see a device's GPS — the ~150m
-- proximity gate is enforced client-side (app/sale/[id].tsx) before the
-- insert is even attempted. The DB-side insert policy below only enforces
-- caller identity and that the listing is actually live-by-date server side,
-- same class of "can't fully verify, only reduce abuse" trust boundary as
-- the reviews table's self-reported "did you visit?" honesty gate.
--
-- HOW TO RUN THIS: same as prior migrations — paste into the Supabase
-- Dashboard's SQL Editor and run, or apply via `supabase db push`.

-- buyer_checkin_count on public.users -----------------------------------

alter table public.users add column buyer_checkin_count integer not null default 0;

-- check_ins ---------------------------------------------------------------

create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.sale_listings (id) on delete cascade,
  buyer_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- One check-in per buyer per listing — matches the one-review-per-listing
  -- cap already established for reviews.
  constraint check_ins_listing_buyer_unique unique (listing_id, buyer_id)
);

create index check_ins_listing_id_idx on public.check_ins (listing_id);
create index check_ins_buyer_id_idx on public.check_ins (buyer_id);

alter table public.check_ins enable row level security;

-- A buyer can see their own check-ins; a seller can see who checked in to
-- their own listings (powers the "buyers who checked in" list).
create policy "Buyer or listing seller can view a check-in"
  on public.check_ins for select
  using (
    auth.uid() = buyer_id
    or exists (
      select 1 from public.sale_listings sl
      where sl.id = listing_id and sl.seller_id = auth.uid()
    )
  );

-- Requires the caller to be the buyer AND the listing to actually be
-- published and within its date range today — the GPS-proximity half of
-- "live" can't be checked here (see header comment), but this still blocks
-- checking in to someone else's account or to a draft/scheduled/ended/
-- cancelled listing.
create policy "Buyer can check in to a listing that is live today"
  on public.check_ins for insert
  with check (
    auth.uid() = buyer_id
    and exists (
      select 1 from public.sale_listings sl
      where sl.id = listing_id
        and sl.status = 'published'
        and current_date between sl.start_date and sl.end_date
    )
  );

-- Increment users.buyer_checkin_count on every check-in ---------------------
-- security definer for consistency with every other cross-cutting trigger in
-- this project (favorites' favorite_count, reviews' seller_avg_rating) even
-- though in practice a buyer checking in only ever updates their own
-- public.users row, which their existing self-update RLS policy already
-- permits.

create or replace function public.increment_buyer_checkin_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
  set buyer_checkin_count = buyer_checkin_count + 1
  where id = new.buyer_id;
  return new;
end;
$$;

create trigger check_ins_increment_buyer_checkin_count
  after insert on public.check_ins
  for each row execute function public.increment_buyer_checkin_count();

-- buyer_ratings -----------------------------------------------------------
-- A single-tap "thumbs-up" a seller can give a buyer who checked in — no
-- 5-star scale, no comment. Existence of a row IS the thumbs-up.

create table public.buyer_ratings (
  id uuid primary key default gen_random_uuid(),
  -- Ties the rating to a specific check-in rather than just (listing_id,
  -- buyer_id) directly — the unique constraint below then reuses check_ins'
  -- own uniqueness to cap this at one thumbs-up per buyer per listing.
  check_in_id uuid not null unique references public.check_ins (id) on delete cascade,
  -- Denormalized from the check-in so RLS/queries here don't need to join
  -- through check_ins for every read, same reasoning as reviews.seller_id.
  listing_id uuid not null references public.sale_listings (id) on delete cascade,
  buyer_id uuid not null references public.users (id) on delete cascade,
  seller_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index buyer_ratings_seller_id_idx on public.buyer_ratings (seller_id);
create index buyer_ratings_buyer_id_idx on public.buyer_ratings (buyer_id);

alter table public.buyer_ratings enable row level security;

create policy "Seller or rated buyer can view a buyer rating"
  on public.buyer_ratings for select
  using (auth.uid() = seller_id or auth.uid() = buyer_id);

-- Requires the caller to be the seller AND the referenced check-in to
-- actually belong to (this listing, this buyer) AND that listing to
-- actually belong to the caller — prevents a seller from thumbs-upping a
-- buyer on someone else's listing, or misattributing the rating.
create policy "Seller can thumbs-up a checked-in buyer on their own listing"
  on public.buyer_ratings for insert
  with check (
    auth.uid() = seller_id
    and exists (
      select 1 from public.check_ins ci
      where ci.id = check_in_id
        and ci.listing_id = listing_id
        and ci.buyer_id = buyer_id
    )
    and exists (
      select 1 from public.sale_listings sl
      where sl.id = listing_id and sl.seller_id = auth.uid()
    )
  );
