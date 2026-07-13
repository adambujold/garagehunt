-- GarageHunt — notify a seller when their listing crosses a new Hot Listing
-- tier (utils/hot-tier.ts's three-tier progression: Hot -> Blazing Hot ->
-- Inferno Hot, thresholds mirrored below from constants/brand.ts's
-- HOT_TIER_THRESHOLDS: hot >= 11, blazingHot >= 26, infernoHot >= 51).
--
-- Written as a raw trigger calling pg_net directly, same pattern (and same
-- reason) as 0019_matches_webhook_trigger.sql: Supabase's Database Webhooks
-- UI / supabase_functions.http_request wrapper isn't provisioned on this
-- project. pg_net itself (schema `net`) is already enabled project-wide via
-- Database -> Extensions -> pg_net — no `create extension` needed here.
--
-- highest_tier_notified is a high-water mark, not a live mirror of the
-- current tier: it only ever ratchets UP. This is what makes "only send on a
-- strict tier increase, never again for the same tier, never on a decrease"
-- work correctly with zero extra bookkeeping — an unfavorite that drops
-- favorite_count back down never un-sends the earlier notification, and
-- never re-notifies once it climbs back to a tier it already crossed.
--
-- BEFORE UPDATE (not AFTER): lets the trigger set NEW.highest_tier_notified
-- directly as part of the same UPDATE statement, instead of issuing a
-- second UPDATE from inside the trigger (which would also re-fire this same
-- trigger recursively).
--
-- HOW TO RUN THIS: paste into the Supabase Dashboard's SQL Editor and run.
-- Before running, replace <SERVICE_ROLE_KEY> below with the real
-- service_role secret (Project Settings -> API) — paste it directly into
-- the SQL Editor box, never commit the real key to this file.

create type hot_tier_notified as enum ('none', 'hot', 'blazing', 'inferno');

alter table public.sale_listings
  add column highest_tier_notified hot_tier_notified not null default 'none';

create or replace function public.hot_tier_rank(tier hot_tier_notified)
returns int
language sql
immutable
as $$
  select case tier
    when 'none' then 0
    when 'hot' then 1
    when 'blazing' then 2
    when 'inferno' then 3
  end;
$$;

create or replace function public.notify_hot_tier_webhook()
returns trigger
language plpgsql
security definer
as $$
declare
  computed_tier hot_tier_notified;
begin
  if new.favorite_count >= 51 then
    computed_tier := 'inferno';
  elsif new.favorite_count >= 26 then
    computed_tier := 'blazing';
  elsif new.favorite_count >= 11 then
    computed_tier := 'hot';
  else
    computed_tier := 'none';
  end if;

  if public.hot_tier_rank(computed_tier) > public.hot_tier_rank(new.highest_tier_notified) then
    new.highest_tier_notified := computed_tier;

    begin
      perform net.http_post(
        url := 'https://musrnxyygnqzbbpkuqip.supabase.co/functions/v1/send-hot-tier-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
        ),
        body := jsonb_build_object(
          'listing_id', new.id,
          'seller_id', new.seller_id,
          'tier', computed_tier
        )
      );
    exception when others then
      raise warning 'notify_hot_tier_webhook failed: %', sqlerrm;
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists sale_listings_notify_hot_tier on public.sale_listings;

create trigger sale_listings_notify_hot_tier
before update on public.sale_listings
for each row
when (new.favorite_count is distinct from old.favorite_count)
execute function public.notify_hot_tier_webhook();
