-- GarageHunt — make moderate-listing-photo the only way a listing_photos row
-- (or a photo object) can come into existence.
--
-- THE GAP, identical in shape to the one 0041 closed for listing text. Photo
-- screening ran on the client: uploadListingPhoto called
-- moderate-listing-photo, got a verdict back, uploaded to Storage itself, and
-- INSERTed the listing_photos row with whatever moderation_status it chose.
-- The INSERT policy from 0001 only ever checked that the caller owns the
-- listing — nothing constrained moderation_status. So a seller could skip the
-- moderation call entirely and insert `approved`, putting completely
-- unscreened images on public, crawlable pages.
--
-- It compounded: publish-listing's photo gate passes a listing when every
-- photo is 'approved', so a self-approved photo also walked through the
-- listing gate 0041 had just secured.
--
-- WHY BOTH GRANTS GO, not just the table one. Revoking only the
-- listing_photos INSERT would still leave the client able to write objects
-- into the bucket. That matters because of a delete-and-replace race: a seller
-- could get a clean photo screened and recorded, then delete the stored object
-- (still permitted, and legitimate) and upload different bytes under the same
-- key, leaving an 'approved' row pointing at unscreened content. Removing
-- client INSERT on the bucket closes that — a seller may still delete their
-- own photo, they simply cannot put anything back except through the function,
-- which screens it.
--
-- WHAT STILL WORKS: viewing photos (public read), and a seller deleting their
-- own photo (both the row and the object). Only creation moves server-side.
--
-- PREREQUISITE: deploy the updated `moderate-listing-photo` Edge Function
-- BEFORE running this. Between running this and deploying that, photo upload
-- is impossible from any client.
--
-- HOW TO RUN THIS: paste into the Supabase Dashboard's SQL Editor and run, by
-- itself. No placeholders.

-- 1. listing_photos: only the service role may create rows --------------------
-- Dropping the policy is what does the work: RLS is enabled on this table, and
-- with no INSERT policy every non-service-role insert is denied. The Edge
-- Function uses the service role, which bypasses RLS entirely.
drop policy if exists "Sellers can add photos to their own listings" on public.listing_photos;

-- Belt and braces alongside the policy drop: even if a future migration adds a
-- permissive policy back without thinking about moderation_status, the grant
-- is gone too.
revoke insert on public.listing_photos from anon, authenticated;

-- 2. Storage: only the service role may create objects in the bucket ----------
drop policy if exists "Sellers can upload photos to their own listings" on storage.objects;

-- Deliberately NOT dropped (0005): "Public read access to listing photos" and
-- "Sellers can delete photos from their own listings". Reading is the point of
-- a public bucket, and delete-without-insert is safe — a seller can remove
-- their photo but cannot substitute new bytes for screened ones.

-- VERIFYING THIS (the anon key proves nothing — it's blocked earlier by the
-- 0038 grant revoke, so a "permission denied" there is a false pass).
-- Simulate a real authenticated seller instead:
--
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<seller uuid>","role":"authenticated"}';
--   insert into public.listing_photos (listing_id, storage_key, sort_order, moderation_status)
--   values ('<their listing>', 'test/forged.jpg', 0, 'approved');
--   rollback;
--
-- That insert must fail with a row-level-security violation. If it succeeds,
-- the lock is not in place.
