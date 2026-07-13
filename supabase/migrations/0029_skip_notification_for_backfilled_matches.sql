-- GarageHunt — stop sending a push notification per row for backfilled
-- matches (a real crash root-cause fix, not just a nice-to-have).
--
-- matches_send_notification (0019) fires once per inserted row.
-- backfillMatchesForSavedSearch (utils/matches.ts) does a single bulk
-- .insert() of every newly-matched pre-existing listing at once when a
-- search is saved/edited — with a broad search (e.g. most/all categories
-- selected), that can be a dozen-plus rows in one statement, so Postgres
-- fires the notification trigger that many times in immediate succession.
-- Expo delivers all of those pushes to the same device in a tight burst,
-- which crashed expo-notifications' native foreground-notification handling
-- on a real device (confirmed via an on-device crash log: an uncaught
-- Objective-C exception thrown from inside a TurboModule "void method"
-- invocation, on com.meta.react.turbomodulemanager.queue).
--
-- The fix: a backfilled match doesn't need a push at all — the save flow
-- immediately navigates to Matches for You right after, so the user sees
-- these the moment they land there. Only a genuinely *new* listing
-- published later, matching an existing saved search while the user isn't
-- looking at the app (computeAndInsertMatches, in sale-listings.ts's
-- publish flow), is the "come back and check this out" case push
-- notifications are actually for.
--
-- HOW TO RUN THIS: paste into the Supabase Dashboard's SQL Editor and run.

alter table public.matches add column is_backfill boolean not null default false;

drop trigger if exists matches_send_notification on public.matches;

create trigger matches_send_notification
after insert on public.matches
for each row
when (new.is_backfill = false)
execute function public.notify_match_webhook();
