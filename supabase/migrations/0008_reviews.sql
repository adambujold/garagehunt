-- GarageHunt — post-sale reviews + the minimal public.users table needed to
-- hold the denormalized seller_avg_rating/seller_review_count columns.
--
-- DEVIATION FROM THE DOC: docs/garage-sale-app-technical-architecture.md's
-- `users` table has email/display_name/home_location/role_flags/
-- notification_prefs — a full profile schema. None of that exists yet
-- (sale_listings.seller_id has always pointed straight at auth.users). This
-- migration creates only what THIS feature needs — seller_avg_rating and
-- seller_review_count — via the standard Supabase pattern of a public.users
-- table mirrored 1:1 from auth.users by trigger. Building out the rest of
-- the profile schema (display name, notification prefs, etc.) is a
-- separate, later task.
--
-- HOW TO RUN THIS: same as prior migrations — paste into the Supabase
-- Dashboard's SQL Editor and run, or apply via `supabase db push`.

-- public.users --------------------------------------------------------------

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  seller_avg_rating numeric(3, 2),
  seller_review_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;

create policy "Users are viewable by everyone"
  on public.users for select
  using (true);

create policy "Users can update their own row"
  on public.users for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Standard Supabase pattern: auto-create the public.users row the moment a
-- new auth.users row appears, so every real user always has one — the
-- reviews trigger below depends on that row existing to update it.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Backfill existing accounts (this project already has real signed-up test
-- users) — without this, reviews referencing them would fail their FK.
insert into public.users (id)
select id from auth.users
on conflict (id) do nothing;

-- reviews ---------------------------------------------------------------

create type review_moderation_status as enum ('pending', 'approved', 'rejected');

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.sale_listings (id) on delete cascade,
  reviewer_id uuid not null references public.users (id) on delete cascade,
  -- Denormalized from the listing at insert time (per the architecture doc)
  -- for fast seller-level aggregate queries without joining through
  -- sale_listings every time.
  seller_id uuid not null references public.users (id) on delete cascade,
  visited boolean not null,
  rating integer,
  comment text,
  moderation_status review_moderation_status not null default 'pending',
  created_at timestamptz not null default now(),
  constraint reviews_listing_reviewer_unique unique (listing_id, reviewer_id),
  constraint reviews_rating_range check (rating is null or (rating between 1 and 5)),
  constraint reviews_rating_requires_visited check (visited = true or rating is null)
);

create index reviews_seller_id_idx on public.reviews (seller_id);
create index reviews_reviewer_id_idx on public.reviews (reviewer_id);

alter table public.reviews enable row level security;

-- Only the reviewer and the reviewed seller can read a review row — there's
-- no public review-list UI yet (just the aggregate rating, which lives on
-- public.users and is viewable by everyone via the policy above), so
-- broader read access isn't needed and would just leak comments.
create policy "Reviewer and seller can view a review"
  on public.reviews for select
  using (auth.uid() = reviewer_id or auth.uid() = seller_id);

-- Requires the caller to be the reviewer AND the denormalized seller_id to
-- actually match the listing's real seller — prevents a client from
-- attributing a review (and thus rating points) to the wrong seller.
create policy "Reviewer can insert their own correctly-attributed review"
  on public.reviews for insert
  with check (
    auth.uid() = reviewer_id
    and exists (
      select 1 from public.sale_listings sl
      where sl.id = listing_id and sl.seller_id = seller_id
    )
  );

-- Recalculate seller_avg_rating/seller_review_count -------------------------
-- Fires on every review insert but only actually recalculates when the
-- review carries a rating (visited = true) — a "didn't visit" row logs the
-- prompt-dismissal (so it isn't asked again) without touching the aggregate.
-- security definer because a buyer reviewing someone else's sale needs to
-- update that seller's public.users row, same pattern as favorites'
-- sync_listing_favorite_count trigger.

create or replace function public.recalculate_seller_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.visited and new.rating is not null then
    update public.users
    set
      seller_avg_rating = (
        select avg(rating)::numeric(3, 2)
        from public.reviews
        where seller_id = new.seller_id and visited = true and rating is not null
      ),
      seller_review_count = (
        select count(*)
        from public.reviews
        where seller_id = new.seller_id and visited = true and rating is not null
      )
    where id = new.seller_id;
  end if;
  return new;
end;
$$;

create trigger reviews_recalculate_seller_rating
  after insert on public.reviews
  for each row execute function public.recalculate_seller_rating();
