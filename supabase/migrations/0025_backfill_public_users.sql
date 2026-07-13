-- GarageHunt — re-backfill public.users after 0024's full test-data wipe.
--
-- 0024 truncated public.users but deliberately left auth.users untouched
-- (real login accounts aren't "test data" — see that migration's header
-- comment). The auto-create trigger (0008_reviews.sql's
-- handle_new_auth_user) only fires on NEW auth.users inserts, not for
-- existing accounts signing back in, so every pre-wipe account is now
-- missing its public.users row — surfaced as PGRST116 ("Cannot coerce the
-- result to a single JSON object") on any .single() read scoped to that
-- row (utils/ad-free.ts, utils/notification-prefs.ts,
-- utils/organizer-applications.ts all hit this; those three now use
-- .maybeSingle() with a graceful default instead, but the row should still
-- exist for real accounts rather than silently reading defaults forever).
--
-- This is the exact same statement 0008_reviews.sql ran once already for
-- the accounts that existed at that time — re-running it is safe and
-- idempotent (on conflict do nothing) even if run more than once.
--
-- HOW TO RUN THIS: paste into the Supabase Dashboard's SQL Editor and run.

insert into public.users (id)
select id from auth.users
on conflict (id) do nothing;

-- Verification — should return one row per real signed-up account.
select id, created_at from public.users order by created_at;
