-- GarageHunt — sale_listings.checkin_count: a per-listing seller-facing
-- foot-traffic tally ("14 people checked in"), distinct from
-- users.buyer_checkin_count (a buyer's cumulative total across all sales).
-- Mirrors docs/garage-sale-app-technical-architecture.md's sale_listings
-- table, same denormalized-counter pattern as favorite_count (0002) and
-- users.buyer_checkin_count (0009).
--
-- HOW TO RUN THIS: same as prior migrations — paste into the Supabase
-- Dashboard's SQL Editor and run, or apply via `supabase db push`.

alter table public.sale_listings add column checkin_count integer not null default 0;

-- security definer so a buyer checking in to someone else's listing can
-- still bump that listing's counter, same reasoning as favorites'
-- sync_listing_favorite_count and check_ins' increment_buyer_checkin_count.
create or replace function public.sync_listing_checkin_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sale_listings
  set checkin_count = checkin_count + 1
  where id = new.listing_id;
  return new;
end;
$$;

create trigger check_ins_sync_listing_checkin_count
  after insert on public.check_ins
  for each row execute function public.sync_listing_checkin_count();
