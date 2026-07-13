-- GarageHunt — sale_listings.moderation_status (feature spec Section 9,
-- items 1/2/4/6). listing_photos already has its own moderation_status
-- column (photo_moderation_status enum: pending/approved/rejected, see
-- 0001_sale_listings_schema.sql) — this adds the equivalent concept at the
-- listing level, for text-content screening and the new-account trust
-- signal, distinct from photo-level screening.
--
-- Deliberately a different enum/set of values than photo_moderation_status:
-- a listing is either 'clean' (nothing flagged, the common case) or
-- 'pending_review' (flagged for a human to double-check — by text
-- moderation flagging borderline content, or by the new-account trust
-- signal) or 'rejected' (reserved for a human reviewer to set manually via
-- Table Editor after checking a pending_review listing — nothing
-- automated sets this directly, since clearly-bad text already blocks
-- submission before a row is ever created).
--
-- No index — reviewing "flagged content" is a direct, infrequent Table
-- Editor query at solo-reviewer scale (per spec Section 9, item 4), not a
-- hot path needing one.
--
-- HOW TO RUN THIS: paste into the Supabase Dashboard's SQL Editor and run.

create type listing_moderation_status as enum ('clean', 'pending_review', 'rejected');

alter table public.sale_listings
  add column moderation_status listing_moderation_status not null default 'clean';
