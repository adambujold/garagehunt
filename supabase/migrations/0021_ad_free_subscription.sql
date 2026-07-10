-- GarageHunt — ad-free subscription entitlement (technical architecture doc
-- Section 4, Monetization Data Model). Phase 2 of monetization — the
-- listing boost fields in that same section aren't built yet, this pass is
-- scoped to the ad-free subscription only.
--
-- HOW THIS FLOWS: the client (utils/purchases.ts) drives the actual
-- purchase through RevenueCat's SDK, which sits on top of native App Store
-- billing. RevenueCat then calls supabase/functions/revenuecat-webhook on
-- every entitlement lifecycle event (purchase/renewal/cancellation/
-- expiration), which is what actually writes these two columns — never the
-- client directly. That's not just a convention here, it's enforced below:
-- the `authenticated` role's UPDATE grant is narrowed to exclude these two
-- columns specifically, the same column-level pattern
-- 0013_organizer_approval_sync_and_seen.sql used for seen_approval, so a
-- client can't just PATCH themselves into an entitlement they never paid
-- for.
--
-- HOW TO RUN THIS: paste into the Supabase Dashboard's SQL Editor and run.

alter table public.users add column is_ad_free boolean not null default false;
alter table public.users add column ad_free_expires_at timestamptz;

revoke update (is_ad_free, ad_free_expires_at) on public.users from authenticated;
