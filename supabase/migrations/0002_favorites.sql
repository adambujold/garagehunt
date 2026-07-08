-- GarageHunt — favorites table + denormalized favorite_count sync
-- Mirrors docs/garage-sale-app-technical-architecture.md's `favorites` table
-- (user_id, listing_id) and feeds the interest-signal behavior in
-- docs/garage-sale-app-feature-spec.md Section 4d.
--
-- HOW TO RUN THIS: same as 0001 — paste into the Supabase Dashboard's SQL
-- Editor and run, or apply via `supabase db push`.

create table public.favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  listing_id uuid not null references public.sale_listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create index favorites_listing_id_idx on public.favorites (listing_id);

alter table public.favorites enable row level security;

create policy "Users can view their own favorites"
  on public.favorites for select
  using (auth.uid() = user_id);

create policy "Users can add their own favorites"
  on public.favorites for insert
  with check (auth.uid() = user_id);

create policy "Users can remove their own favorites"
  on public.favorites for delete
  using (auth.uid() = user_id);

-- sale_listings.favorite_count sync ----------------------------------------
-- security definer + search_path pin so the function runs as its owner
-- (the migration-running role, which owns sale_listings and is therefore
-- exempt from its RLS) — otherwise a buyer favoriting someone else's
-- listing would be blocked by the "sellers can update their own listings"
-- policy when this trigger tries to bump the count on a row they don't own.

create or replace function public.sync_listing_favorite_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update public.sale_listings
      set favorite_count = favorite_count + 1
      where id = new.listing_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.sale_listings
      set favorite_count = greatest(favorite_count - 1, 0)
      where id = old.listing_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger favorites_sync_count
  after insert or delete on public.favorites
  for each row execute function public.sync_listing_favorite_count();
