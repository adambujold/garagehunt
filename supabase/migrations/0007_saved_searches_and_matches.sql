-- GarageHunt — saved_searches ("I'm Looking For") + matches
--
-- DEVIATION FROM THE DOC: saved_searches.center_location is specified as
-- PostGIS geography(point) — same deviation as sale_listings in 0001, for
-- the same reason: plain center_latitude/center_longitude columns, with
-- radius filtering done via a SQL haversine calc in the RPC below (mirrors
-- utils/haversine.ts's formula) rather than PostGIS operators.
--
-- MATCHING ARCHITECTURE NOTE: per product decision, the actual keyword/
-- category match *decision* happens in the app layer (TypeScript), reusing
-- the exact same case-insensitive substring function Discover's "Other"
-- filter uses (matchesOtherKeyword), rather than a second, parallel SQL
-- implementation of that logic. But saved_searches' RLS below (correctly)
-- makes one user's searches invisible to everyone else — including the
-- seller whose new listing needs to be checked against all of them. The
-- candidate_saved_searches_for_listing() function bridges that gap: it's
-- security definer (bypasses RLS, same pattern as favorites'
-- sync_listing_favorite_count trigger), but only ever returns the fields
-- needed to finish the match decision (keywords, category_ids) for
-- searches already confirmed in range — it never exposes another user's
-- location, identity, or full search record to the caller.
--
-- HOW TO RUN THIS: same as prior migrations — paste into the Supabase
-- Dashboard's SQL Editor and run, or apply via `supabase db push`.

create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  keywords text[] not null default '{}',
  category_ids uuid[] not null default '{}',
  center_latitude double precision not null,
  center_longitude double precision not null,
  radius_km integer not null,
  date_from date,
  date_to date,
  notify_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_searches_date_range check (date_to is null or date_from is null or date_to >= date_from)
);

create index saved_searches_user_id_idx on public.saved_searches (user_id);

create trigger saved_searches_set_updated_at
  before update on public.saved_searches
  for each row execute function public.set_updated_at();

alter table public.saved_searches enable row level security;

create policy "Users can view their own saved searches"
  on public.saved_searches for select
  using (auth.uid() = user_id);

create policy "Users can create their own saved searches"
  on public.saved_searches for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own saved searches"
  on public.saved_searches for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own saved searches"
  on public.saved_searches for delete
  using (auth.uid() = user_id);

-- matches ---------------------------------------------------------------

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  saved_search_id uuid not null references public.saved_searches (id) on delete cascade,
  listing_id uuid not null references public.sale_listings (id) on delete cascade,
  matched_at timestamptz not null default now(),
  notified_at timestamptz,
  unique (saved_search_id, listing_id)
);

create index matches_saved_search_id_idx on public.matches (saved_search_id);

alter table public.matches enable row level security;

create policy "Users can view matches for their own saved searches"
  on public.matches for select
  using (
    exists (
      select 1 from public.saved_searches
      where saved_searches.id = saved_search_id
        and saved_searches.user_id = auth.uid()
    )
  );

-- Match rows are inserted by whoever publishes the matching listing (the
-- seller), on behalf of every buyer whose saved_search it matches — not by
-- the search owner. So this can't be scoped to "caller owns the
-- saved_search" like the select policy above; instead it's scoped to "the
-- listing being referenced is real and published", which still prevents
-- fabricating matches against listings that don't exist or aren't public.
create policy "Anyone can record a match against a published listing"
  on public.matches for insert
  with check (
    exists (
      select 1 from public.sale_listings
      where sale_listings.id = listing_id
        and sale_listings.status = 'published'
    )
  );

-- candidate_saved_searches_for_listing -----------------------------------
-- See the architecture note at the top of this file. Only ever called
-- right after a listing is published, with that listing's own
-- lat/lng/dates — returns just enough (keywords, category_ids) for the
-- client to finish the match decision with matchesOtherKeyword.

create or replace function public.candidate_saved_searches_for_listing(
  p_latitude double precision,
  p_longitude double precision,
  p_start_date date,
  p_end_date date
)
returns table (
  id uuid,
  keywords text[],
  category_ids uuid[]
)
language sql
security definer
set search_path = public
stable
as $$
  select s.id, s.keywords, s.category_ids
  from public.saved_searches s
  where (s.date_from is null or p_end_date is null or s.date_from <= p_end_date)
    and (s.date_to is null or p_start_date is null or s.date_to >= p_start_date)
    and (
      6371 * acos(
        least(1, greatest(-1,
          cos(radians(s.center_latitude)) * cos(radians(p_latitude)) *
          cos(radians(p_longitude) - radians(s.center_longitude)) +
          sin(radians(s.center_latitude)) * sin(radians(p_latitude))
        ))
      )
    ) <= s.radius_km;
$$;

grant execute on function public.candidate_saved_searches_for_listing to authenticated;
