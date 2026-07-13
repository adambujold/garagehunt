-- GarageHunt — records when/which version of the Terms of Service + Privacy
-- Policy a user accepted at sign up.
--
-- Both columns are nullable and this migration does NOT backfill existing
-- accounts — per product decision, only new signups going forward are
-- required to accept, existing accounts are left as-is (terms_accepted_at
-- null means "signed up before this existed," not "never agreed to
-- anything").
--
-- terms_accepted_at/terms_version are set via signup-screen.tsx passing them
-- through supabase.auth.signUp()'s options.data (stored in
-- auth.users.raw_user_meta_data immediately, regardless of whether email
-- confirmation is required) rather than a direct client-side update to
-- public.users — a direct update would silently fail under RLS for the
-- "check your email to confirm" signup path, since there's no active session
-- yet at that point. Reading the values back out of raw_user_meta_data here,
-- in the same security-definer trigger that already creates the row, works
-- correctly regardless of that timing.
--
-- HOW TO RUN THIS: paste into the Supabase Dashboard's SQL Editor and run.

alter table public.users add column terms_accepted_at timestamptz;
alter table public.users add column terms_version text;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, terms_accepted_at, terms_version)
  values (
    new.id,
    (new.raw_user_meta_data ->> 'terms_accepted_at')::timestamptz,
    new.raw_user_meta_data ->> 'terms_version'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
