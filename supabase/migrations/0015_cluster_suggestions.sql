-- GarageHunt — Self-organized cluster detection and claiming, Phase 3 of the
-- organizer/events feature (feature spec Section 5a; technical architecture
-- doc's cluster_suggestions table).
--
-- DEVIATIONS FROM THE DOC: center_location is plain
-- center_latitude/center_longitude (double precision), same PostGIS-avoidance
-- reason as every other location column in this app. Detection is pull-based
-- (invoked as an RPC right after a listing publishes) rather than a scheduled
-- job — there's no cron infrastructure in this project, and the doc's own
-- job-based design and this RPC produce the same end state (a
-- cluster_suggestions row once the threshold is crossed), just triggered
-- differently. There's no push notification step either, for the same
-- reason notifications don't exist anywhere else yet in this app — sellers
-- discover a suggestion by opening Profile (pull, not push).
--
-- HOW TO RUN THIS: same as prior migrations — paste into the Supabase
-- Dashboard's SQL Editor and run.

-- town_wide_events.origin ---------------------------------------------------
-- Deliberately omitted in 0014 ("add when Section 5a is actually built" —
-- see that migration's header comment). Every existing/future
-- organizer-applied event defaults to 'association'; the claim function
-- below is the only thing that ever writes 'self_organized'.
alter table public.town_wide_events
  add column origin text not null default 'association' check (origin in ('association', 'self_organized'));

-- event_join_requests.initiated_by ------------------------------------------
-- Distinguishes "seller asked to join" (existing Phase 2 flow — only the
-- organizer may approve/deny) from "organizer invited this seller" (new
-- Phase 3 flow, via cluster-claiming — only the invited seller may
-- accept/decline). Without this distinction, a single "sellers can update
-- their own request" policy would let a seller self-approve a request they
-- submitted themselves, defeating the whole point of organizer review.
alter table public.event_join_requests
  add column initiated_by text not null default 'seller' check (initiated_by in ('seller', 'organizer'));

create policy "Invited sellers can accept or decline their own invitation"
  on public.event_join_requests for update
  using (auth.uid() = seller_id and initiated_by = 'organizer')
  with check (auth.uid() = seller_id and initiated_by = 'organizer');

-- cluster_suggestions ---------------------------------------------------

create type cluster_suggestion_status as enum ('suggested', 'claimed', 'dismissed', 'expired');

create table public.cluster_suggestions (
  id uuid primary key default gen_random_uuid(),
  center_latitude double precision not null,
  center_longitude double precision not null,
  radius_m integer not null,
  date_from date not null,
  date_to date not null,
  listing_ids uuid[] not null,
  status cluster_suggestion_status not null default 'suggested',
  claimed_by_user_id uuid references public.users (id) on delete set null,
  created_event_id uuid references public.town_wide_events (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.cluster_suggestions enable row level security;

-- No client-facing insert/update policy — both are only ever performed by
-- the two security-definer functions below, which need to write on behalf
-- of sellers who otherwise have no direct access to this table.
create policy "Sellers can view cluster suggestions involving their own listing"
  on public.cluster_suggestions for select
  using (
    exists (
      select 1 from public.sale_listings
      where sale_listings.id = any (cluster_suggestions.listing_ids)
        and sale_listings.seller_id = auth.uid()
    )
  );

-- detect_cluster_for_listing ----------------------------------------------
-- Called right after a listing publishes (see computeAndInsertMatches's
-- call sites in utils/sale-listings.ts — this runs alongside it, same
-- non-blocking-side-effect treatment). Finds other published listings
-- within ~750m with overlapping dates; if the combined count crosses the
-- threshold, creates a new 'suggested' row or merges into an existing one
-- that already shares a listing with this candidate set. Per this task's
-- explicit scope, this is intentionally simple: no attempt to split/merge
-- clusters precisely or recompute a true centroid — an existing
-- suggestion's center point is left as-is when merging.
create or replace function public.detect_cluster_for_listing(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_listing record;
  v_nearby_ids uuid[];
  v_existing_id uuid;
  -- Feature spec Section 5a: "500m-1000m" radius, "4+ houses" threshold.
  v_radius_m constant integer := 750;
  v_threshold constant integer := 4;
begin
  select id, latitude, longitude, start_date, end_date
  into v_listing
  from public.sale_listings
  where id = p_listing_id and status = 'published';

  if not found then
    return;
  end if;

  select array_agg(sl.id) into v_nearby_ids
  from public.sale_listings sl
  where sl.status = 'published'
    and sl.start_date <= v_listing.end_date
    and sl.end_date >= v_listing.start_date
    and (
      6371000 * acos(
        least(1, greatest(-1,
          cos(radians(v_listing.latitude)) * cos(radians(sl.latitude)) *
          cos(radians(sl.longitude) - radians(v_listing.longitude)) +
          sin(radians(v_listing.latitude)) * sin(radians(sl.latitude))
        ))
      )
    ) <= v_radius_m;

  if v_nearby_ids is null or array_length(v_nearby_ids, 1) < v_threshold then
    return;
  end if;

  select id into v_existing_id
  from public.cluster_suggestions
  where status = 'suggested'
    and listing_ids && v_nearby_ids
  limit 1;

  if v_existing_id is not null then
    update public.cluster_suggestions
    set listing_ids = (select array_agg(distinct x) from unnest(listing_ids || v_nearby_ids) as x),
        date_from = least(date_from, v_listing.start_date),
        date_to = greatest(date_to, v_listing.end_date)
    where id = v_existing_id;
  else
    insert into public.cluster_suggestions (
      center_latitude, center_longitude, radius_m, date_from, date_to, listing_ids, status
    ) values (
      v_listing.latitude, v_listing.longitude, v_radius_m, v_listing.start_date, v_listing.end_date, v_nearby_ids, 'suggested'
    );
  end if;
end;
$$;

grant execute on function public.detect_cluster_for_listing to authenticated;

-- claim_cluster_suggestion --------------------------------------------------
-- The claiming user becomes the event's organizer without going through the
-- Phase 1 manual-review flow (feature spec Section 5a, point 5: they're
-- already a phone-verified account with a real, live listing physically in
-- the cluster — a materially lower risk profile than a stranger applying
-- cold). Also flips is_verified_organizer so the existing Phase 2 organizer
-- dashboard/event screens work for them immediately with no separate UI —
-- that flag is what gates the Profile shortcut to /organizer-dashboard.
create or replace function public.claim_cluster_suggestion(p_cluster_id uuid, p_event_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cluster record;
  v_event_id uuid;
  v_other_listing record;
begin
  select * into v_cluster
  from public.cluster_suggestions
  where id = p_cluster_id and status = 'suggested';

  if not found then
    raise exception 'This suggestion is no longer available to claim.';
  end if;

  -- Authorization: the function is security definer (bypasses RLS), so it
  -- must verify for itself that the caller genuinely owns a listing in this
  -- cluster — never trust that just because it was called.
  if not exists (
    select 1 from public.sale_listings
    where id = any (v_cluster.listing_ids) and seller_id = auth.uid()
  ) then
    raise exception 'You do not have a listing in this cluster.';
  end if;

  insert into public.town_wide_events (
    organizer_id, name, center_latitude, center_longitude, radius_km, start_date, end_date, origin
  ) values (
    auth.uid(), p_event_name, v_cluster.center_latitude, v_cluster.center_longitude,
    v_cluster.radius_m / 1000.0, v_cluster.date_from, v_cluster.date_to, 'self_organized'
  )
  returning id into v_event_id;

  update public.users set is_verified_organizer = true where id = auth.uid();

  update public.cluster_suggestions
  set status = 'claimed', claimed_by_user_id = auth.uid(), created_event_id = v_event_id
  where id = p_cluster_id;

  -- Every other listing in the cluster gets a real, pending join request —
  -- an invitation the seller still has to accept themselves (see
  -- initiated_by above), not an automatic join.
  for v_other_listing in
    select id, seller_id from public.sale_listings
    where id = any (v_cluster.listing_ids) and seller_id <> auth.uid()
  loop
    insert into public.event_join_requests (event_id, listing_id, seller_id, initiated_by)
    values (v_event_id, v_other_listing.id, v_other_listing.seller_id, 'organizer')
    on conflict (event_id, listing_id) do nothing;
  end loop;

  return v_event_id;
end;
$$;

grant execute on function public.claim_cluster_suggestion to authenticated;
