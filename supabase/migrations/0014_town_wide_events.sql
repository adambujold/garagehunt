-- GarageHunt — Town-Wide Sale Events, Phase 2 of the organizer feature
-- (Phase 1 was organizer_applications — see 0012/0013)
--
-- DEVIATIONS FROM THE DOC: docs/garage-sale-app-technical-architecture.md
-- specs town_wide_events.boundary as geography(polygon) (drawn area) and
-- start_at/end_at as timestamps. Per this build's explicit scope, real
-- polygon-drawing is deferred — MVP uses a simple center point + radius_km
-- instead (center_latitude/center_longitude/radius_km, same fuzzing-free
-- plain-columns approach sale_listings and saved_searches already use for
-- the same PostGIS-avoidance reason). start_date/end_date are plain dates
-- (not timestamps) to match sale_listings' own date-range convention rather
-- than introducing a different shape for what's conceptually the same kind
-- of range. The doc's `origin` column (association vs self_organized) is
-- also omitted — self-organized/cluster-claimed events (feature spec
-- Section 5a) are explicitly out of scope for this build; every event
-- created here is the formal/association-applied kind. Add `origin` when
-- Section 5a is actually built, rather than carrying an unused column now.
--
-- HOW TO RUN THIS: same as prior migrations — paste into the Supabase
-- Dashboard's SQL Editor and run.

create table public.town_wide_events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  center_latitude double precision not null,
  center_longitude double precision not null,
  radius_km double precision not null,
  start_date date not null,
  end_date date not null,
  join_requests_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  constraint town_wide_events_date_range check (end_date >= start_date)
);

alter table public.town_wide_events enable row level security;

create policy "Events are viewable by everyone"
  on public.town_wide_events for select
  using (true);

-- Enforced at the database layer, not just by the app hiding the "create
-- event" button — see the technical architecture doc's own stated principle
-- that role flags must gate access at the API layer.
create policy "Verified organizers can create events"
  on public.town_wide_events for insert
  with check (
    auth.uid() = organizer_id
    and exists (select 1 from public.users where id = auth.uid() and is_verified_organizer = true)
  );

-- event_join_requests -----------------------------------------------------

create type event_join_request_status as enum ('pending', 'approved', 'denied');

create table public.event_join_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.town_wide_events (id) on delete cascade,
  listing_id uuid not null references public.sale_listings (id) on delete cascade,
  -- Denormalized (rather than joining through sale_listings for every RLS
  -- check) so the INSERT policy below is a plain column comparison, not a
  -- cross-table EXISTS inside a WITH CHECK — the exact pattern that turned
  -- out to misbehave under upsert/ON CONFLICT (see
  -- 0011_fix_matches_insert_policy.sql). This table only ever uses plain
  -- INSERT, so that specific bug wouldn't apply either way, but avoiding
  -- the pattern entirely here is simpler and one less thing to reason about.
  seller_id uuid not null references public.users (id) on delete cascade,
  status event_join_request_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique (event_id, listing_id)
);

alter table public.event_join_requests enable row level security;

create policy "Sellers and organizers can view their own join requests"
  on public.event_join_requests for select
  using (
    auth.uid() = seller_id
    or exists (select 1 from public.town_wide_events where id = event_id and organizer_id = auth.uid())
  );

-- "for their own listing" is enforced by actually checking sale_listings'
-- real seller_id, not just trusting a client-supplied seller_id column that
-- happens to match auth.uid() while listing_id points at someone else's sale.
create policy "Sellers can request to join an event for their own listing"
  on public.event_join_requests for insert
  with check (
    auth.uid() = seller_id
    and exists (select 1 from public.sale_listings where id = listing_id and seller_id = auth.uid())
  );

create policy "Organizers can approve or deny join requests for their events"
  on public.event_join_requests for update
  using (exists (select 1 from public.town_wide_events where id = event_id and organizer_id = auth.uid()))
  with check (exists (select 1 from public.town_wide_events where id = event_id and organizer_id = auth.uid()));

-- Approving a join request needs to flip sale_listings.event_id so the
-- listing shows up as town-wide (Discover's "Town-wide" filter already
-- checks event_id per its original comment) and so the event page can just
-- query sale_listings directly. The organizer approving it has no RLS path
-- to update sale_listings themselves (its UPDATE policy is seller-only), so
-- this has to be a security-definer trigger, same pattern as
-- sync_verified_organizer in 0013.
create or replace function public.sync_listing_event_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' then
    update public.sale_listings set event_id = new.event_id where id = new.listing_id;
  elsif tg_op = 'UPDATE' and old.status = 'approved' and new.status <> 'approved' then
    update public.sale_listings set event_id = null where id = new.listing_id;
  end if;
  return new;
end;
$$;

create trigger event_join_request_status_sync
  after insert or update of status on public.event_join_requests
  for each row execute function public.sync_listing_event_id();

-- Finally wire up the FK sale_listings.event_id has been carrying since
-- 0001, unconstrained, waiting for this table to exist.
alter table public.sale_listings
  add constraint sale_listings_event_id_fkey foreign key (event_id) references public.town_wide_events (id) on delete set null;
