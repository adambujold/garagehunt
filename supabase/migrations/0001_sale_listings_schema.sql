-- GarageHunt — sale_listings, categories, listing_categories, listing_photos
-- Mirrors docs/garage-sale-app-technical-architecture.md (Section 2), with
-- one deliberate deviation noted below.
--
-- HOW TO RUN THIS: paste into the Supabase Dashboard's SQL Editor for your
-- project and run it, or apply via `supabase db push` if you have the CLI
-- linked. This can't be applied automatically from the app — schema changes
-- need the DB password / service role key, which isn't exposed to the client.
--
-- DEVIATION FROM THE DOC: sale_listings.exact_location/fuzzed_location are
-- specified as PostGIS `geography(point)`. This migration uses plain
-- `latitude`/`longitude double precision` columns instead — round-tripping
-- PostGIS geography through PostgREST needs computed-column functions or a
-- view, which is real added complexity for radius/ST_DWithin queries nothing
-- in the app performs yet (Discover shows all listings unfiltered today).
-- Swap in real geography columns once radius search is actually built.
--
-- ALSO NOT ENFORCED HERE: the address-privacy fuzzing rule from feature spec
-- Section 8 (fuzzed location pre-reveal, exact address at midnight of
-- start_date). address_text is stored and returned as-is to any reader for
-- now — enforcing the reveal_at gate needs a security-definer view/RPC and
-- is a follow-up, not part of this pass.

create extension if not exists pgcrypto;

create type sale_status as enum ('draft', 'scheduled', 'live', 'ended', 'cancelled');
create type photo_moderation_status as enum ('pending', 'approved', 'rejected');

-- categories ------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon text,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;

create policy "Categories are viewable by everyone"
  on public.categories for select
  using (true);

-- Seed list matches constants/categories.ts exactly.
insert into public.categories (name, icon) values
  ('Furniture', 'bed-outline'),
  ('Kids & baby', 'happy-outline'),
  ('Clothing', 'shirt-outline'),
  ('Tools', 'construct-outline'),
  ('Electronics', 'hardware-chip-outline'),
  ('Sporting goods', 'basketball-outline'),
  ('Books & media', 'book-outline'),
  ('Kitchenware', 'restaurant-outline'),
  ('Antiques', 'time-outline'),
  ('Garden & outdoor', 'leaf-outline'),
  ('Other', 'ellipsis-horizontal-outline')
on conflict (name) do nothing;

-- sale_listings -----------------------------------------------------------

create table public.sale_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users (id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  address_text text not null,
  reveal_at timestamptz,
  immediate_reveal_opt_in boolean not null default false,
  start_date date not null,
  end_date date not null,
  daily_start_time time not null,
  daily_end_time time not null,
  status sale_status not null default 'scheduled',
  description text,
  other_items text[] not null default '{}',
  event_id uuid, -- FK to town_wide_events once that table exists
  view_count integer not null default 0,
  favorite_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sale_listings_end_date_after_start_date check (end_date >= start_date)
);

create index sale_listings_seller_id_idx on public.sale_listings (seller_id);
create index sale_listings_status_idx on public.sale_listings (status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger sale_listings_set_updated_at
  before update on public.sale_listings
  for each row execute function public.set_updated_at();

alter table public.sale_listings enable row level security;

create policy "Sale listings are viewable by everyone"
  on public.sale_listings for select
  using (true);

create policy "Sellers can insert their own listings"
  on public.sale_listings for insert
  with check (auth.uid() = seller_id);

create policy "Sellers can update their own listings"
  on public.sale_listings for update
  using (auth.uid() = seller_id)
  with check (auth.uid() = seller_id);

-- listing_categories ------------------------------------------------------

create table public.listing_categories (
  listing_id uuid not null references public.sale_listings (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  primary key (listing_id, category_id)
);

alter table public.listing_categories enable row level security;

create policy "Listing categories are viewable by everyone"
  on public.listing_categories for select
  using (true);

create policy "Sellers can tag their own listings with categories"
  on public.listing_categories for insert
  with check (
    exists (
      select 1 from public.sale_listings
      where sale_listings.id = listing_id
        and sale_listings.seller_id = auth.uid()
    )
  );

create policy "Sellers can remove categories from their own listings"
  on public.listing_categories for delete
  using (
    exists (
      select 1 from public.sale_listings
      where sale_listings.id = listing_id
        and sale_listings.seller_id = auth.uid()
    )
  );

-- listing_photos ------------------------------------------------------------
-- Table only for now — photo upload is still mock/placeholder in the app
-- until Supabase Storage is wired up as a separate follow-up task.

create table public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.sale_listings (id) on delete cascade,
  storage_key text not null,
  sort_order integer not null default 0,
  moderation_status photo_moderation_status not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.listing_photos enable row level security;

create policy "Listing photos are viewable by everyone"
  on public.listing_photos for select
  using (true);

create policy "Sellers can add photos to their own listings"
  on public.listing_photos for insert
  with check (
    exists (
      select 1 from public.sale_listings
      where sale_listings.id = listing_id
        and sale_listings.seller_id = auth.uid()
    )
  );
