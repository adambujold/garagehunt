-- GarageHunt — fix/harden favorites RLS + re-confirm the favorite_count trigger
--
-- Symptom this addresses: hearting a listing didn't persist. Root cause is
-- almost always that Supabase enables RLS on every new table by default, and
-- if the insert/delete policies from 0002 never actually landed (or landed
-- differently) in the live project, writes fail silently at the PostgREST
-- layer rather than throwing something obvious client-side.
--
-- This migration is idempotent — safe to run even if 0002 already applied
-- cleanly — so it can double as the "make sure this is really there" fix.
--
-- HOW TO RUN THIS: same as 0001/0002 — paste into the Supabase Dashboard's
-- SQL Editor and run, or apply via `supabase db push`.

alter table public.favorites enable row level security;

drop policy if exists "Users can view their own favorites" on public.favorites;
drop policy if exists "Users can add their own favorites" on public.favorites;
drop policy if exists "Users can remove their own favorites" on public.favorites;
drop policy if exists "Authenticated users can read favorites for counting" on public.favorites;

-- Any logged-in user can insert/delete only their own (user_id, listing_id)
-- row — this is the pair of policies that make the heart button actually
-- persist. Without these, RLS defaults to deny-all and every insert/delete
-- from the client fails.
create policy "Users can add their own favorites"
  on public.favorites for insert
  with check (auth.uid() = user_id);

create policy "Users can remove their own favorites"
  on public.favorites for delete
  using (auth.uid() = user_id);

-- Any authenticated user can read the full table (not just their own rows).
-- sale_listings.favorite_count is the source of truth the UI actually
-- displays, but counting/aggregating directly off `favorites` (e.g. for
-- future admin/debug views) needs broader read access than "own rows only".
create policy "Authenticated users can read favorites for counting"
  on public.favorites for select
  using (auth.role() = 'authenticated');

-- Re-confirm the denormalized counter sync trigger -------------------------
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

drop trigger if exists favorites_sync_count on public.favorites;

create trigger favorites_sync_count
  after insert or delete on public.favorites
  for each row execute function public.sync_listing_favorite_count();

-- Verification queries (run these manually in the SQL Editor after applying
-- to confirm everything actually landed):
--
--   select policyname, cmd, roles from pg_policies where tablename = 'favorites';
--   select tgname, tgenabled from pg_trigger where tgname = 'favorites_sync_count';
--
-- The first should list 3 rows (insert/delete/select policies above); the
-- second should list 1 row with tgenabled = 'O' (enabled).
