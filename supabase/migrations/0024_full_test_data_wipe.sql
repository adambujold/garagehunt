-- GarageHunt — one-time full test-data wipe. NOT a schema migration in the
-- usual sense (nothing here alters table structure) — this is a destructive
-- data-clearing script, kept in the migrations folder only so it's tracked
-- alongside the schema history, not because it should ever run again.
--
-- Deliberately does NOT use the account-deletion RPC
-- (supabase/migrations/0020_account_deletion.sql) — that path
-- anonymizes-and-preserves reviews for a real user's benefit (their
-- reputation stays intact for buyers who read it later). With no real users
-- yet, there's nothing worth preserving; this truncates every application
-- table outright for a genuinely blank slate.
--
-- Excludes public.categories on purpose — that's static seed/reference
-- data ("Seed list matches constants/categories.ts exactly", per
-- 0001_sale_listings_schema.sql), not user-generated content. Wiping it
-- would break the category picker with no re-seed path in this script.
--
-- NOTE ON auth.users: public.users.id references auth.users(id) with
-- "on delete cascade" — but that cascade direction only fires when a
-- row is deleted FROM auth.users, not the reverse. Truncating public.users
-- below does NOT touch auth.users, so any existing Supabase Auth accounts
-- (real login credentials) survive this script untouched. If you also want
-- those gone, do it separately via Dashboard -> Authentication -> Users
-- (or the auth admin API) — deliberately not folded into this script since
-- deleting real auth accounts is a separate, more sensitive action than
-- clearing app data tables.
--
-- NOTE ON STORAGE: Supabase blocks direct DELETE on storage.objects at the
-- platform level (a protect_delete() trigger — confirmed by trying it: "42501
-- Direct deletion from storage tables is not allowed. Use the Storage API
-- instead"). SQL genuinely cannot clear these buckets, full stop — the
-- listing-photos and avatars buckets must be emptied via the Dashboard's
-- Storage UI: open each bucket, select all, delete. The verification block
-- below still SELECTs (not DELETEs) storage.objects counts, since reads
-- aren't blocked — run this script first, then clear both buckets via the
-- UI, then re-run just the verification block to confirm both read 0.
--
-- HOW TO RUN THIS: paste into the Supabase Dashboard's SQL Editor and run.
-- The final SELECT block prints every table's row count — confirm every
-- row reads 0 before considering this done.

truncate table
  public.sale_listings,
  public.listing_categories,
  public.listing_photos,
  public.users,
  public.favorites,
  public.reviews,
  public.check_ins,
  public.buyer_ratings,
  public.saved_searches,
  public.matches,
  public.push_tokens,
  public.town_wide_events,
  public.event_join_requests,
  public.organizer_applications,
  public.cluster_suggestions,
  public.ai_suggestion_requests,
  public.boost_purchases
restart identity cascade;

-- Verification — every row below must read 0. The two storage.objects rows
-- will still show their real counts until you clear those buckets via the
-- Dashboard's Storage UI (see note above) — re-run just this SELECT block
-- afterward to confirm those reach 0 too.
select 'sale_listings' as table_name, count(*) from public.sale_listings
union all select 'listing_categories', count(*) from public.listing_categories
union all select 'listing_photos', count(*) from public.listing_photos
union all select 'users', count(*) from public.users
union all select 'favorites', count(*) from public.favorites
union all select 'reviews', count(*) from public.reviews
union all select 'check_ins', count(*) from public.check_ins
union all select 'buyer_ratings', count(*) from public.buyer_ratings
union all select 'saved_searches', count(*) from public.saved_searches
union all select 'matches', count(*) from public.matches
union all select 'push_tokens', count(*) from public.push_tokens
union all select 'town_wide_events', count(*) from public.town_wide_events
union all select 'event_join_requests', count(*) from public.event_join_requests
union all select 'organizer_applications', count(*) from public.organizer_applications
union all select 'cluster_suggestions', count(*) from public.cluster_suggestions
union all select 'ai_suggestion_requests', count(*) from public.ai_suggestion_requests
union all select 'boost_purchases', count(*) from public.boost_purchases
union all select 'storage.objects (listing-photos)', count(*) from storage.objects where bucket_id = 'listing-photos'
union all select 'storage.objects (avatars)', count(*) from storage.objects where bucket_id = 'avatars'
order by 1;
