-- GarageHunt — AI-assisted title/description suggestions (feature spec
-- Section 3's "Description" step; technical architecture doc Section 6).
--
-- title is nullable and starts out unset for every existing listing —
-- display always falls back to the existing address-derived title
-- (deriveTitle in utils/sale-listings.ts) when null, so this is purely
-- additive and never breaks a listing that never touches the AI feature.
--
-- ai_suggestion_requests is a plain append-only log, not exposed to any
-- app screen — it exists solely so the Edge Function (supabase/functions/
-- suggest-listing-copy) can rate-limit regeneration per user (5/hour) by
-- counting a caller's own recent rows. user_id defaults to auth.uid() so
-- the function's insert doesn't need to know/pass it explicitly — it just
-- runs as the calling user's own JWT-scoped client, same as any other
-- authenticated request.
--
-- HOW TO RUN THIS: same as prior migrations — paste into the Supabase
-- Dashboard's SQL Editor and run.

alter table public.sale_listings add column title text;

create table public.ai_suggestion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now()
);

create index ai_suggestion_requests_user_id_created_at_idx
  on public.ai_suggestion_requests (user_id, created_at);

alter table public.ai_suggestion_requests enable row level security;

create policy "Users can view their own AI suggestion request log"
  on public.ai_suggestion_requests for select
  using (auth.uid() = user_id);

create policy "Users can log their own AI suggestion requests"
  on public.ai_suggestion_requests for insert
  with check (auth.uid() = user_id);
