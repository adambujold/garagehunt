-- GarageHunt — Organizer application (Phase 1 of the organizer/events
-- feature — event creation itself is a separate, later phase)
--
-- Per feature spec Section 9, item 7 ("Organizer approval process"): at
-- launch/low volume this is handled by manual review rather than a paid
-- ID-verification service. The doc's full field list also includes an
-- SMS-verified phone number, but this app has no phone-verification flow
-- yet, so this migration only captures what's actually collectible today:
-- full name, neighborhood, and either a formal affiliation or informal
-- vouching (affiliation_notes covers both, per the doc's wording).
--
-- DELIBERATELY NO UPDATE POLICY on organizer_applications: approving or
-- denying an application is done by a person editing the row directly in
-- the Supabase Dashboard's Table Editor (running as postgres, which
-- bypasses RLS) — not through any client-facing path. This is the intended
-- manual-review workflow, not a gap to fill with an in-app admin UI.
--
-- HOW TO RUN THIS: same as prior migrations — paste into the Supabase
-- Dashboard's SQL Editor and run.

alter table public.users add column is_verified_organizer boolean not null default false;

create type organizer_application_status as enum ('pending', 'approved', 'denied');

create table public.organizer_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  full_name text not null,
  neighborhood text not null,
  affiliation_notes text not null,
  status organizer_application_status not null default 'pending',
  created_at timestamptz not null default now()
);

create index organizer_applications_user_id_idx on public.organizer_applications (user_id);

alter table public.organizer_applications enable row level security;

create policy "Users can view their own organizer applications"
  on public.organizer_applications for select
  using (auth.uid() = user_id);

create policy "Users can submit their own organizer application"
  on public.organizer_applications for insert
  with check (auth.uid() = user_id);
