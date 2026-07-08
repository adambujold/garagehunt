-- GarageHunt — raise the listing-photos bucket's file size limit
--
-- 0005 set this to 5MB, which is unrealistically tight for real phone
-- camera photos (commonly 3-10MB even after expo-image-picker's quality:0.8
-- JPEG recompression) — sellers picking a normal photo were hitting
-- Storage's "The object exceeded the maximum allowed size" error when
-- publishing. Raised to 15MB, still bounded (not unlimited) but enough
-- headroom for a real photo.
--
-- HOW TO RUN THIS: same as prior migrations — paste into the Supabase
-- Dashboard's SQL Editor and run, or apply via `supabase db push`.

update storage.buckets
set file_size_limit = 15728640 -- 15MB
where id = 'listing-photos';
