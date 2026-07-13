-- GarageHunt — profile photo upload (technical architecture doc Section 2,
-- users.avatar_url + its "Avatar storage" note). Mirrors
-- 0005_listing_photos_storage.sql's Storage bucket + RLS pattern, just
-- scoped by the uploader's own auth.uid() instead of a sale_listings
-- lookup — there's no separate ownership table for a user's own avatar,
-- the storage path's first folder segment IS the user id.
--
-- One avatar per user: uploads always target the same fixed key
-- "<user_id>/avatar" (no extension in the key itself — Content-Type is set
-- explicitly on upload, see utils/avatars.ts), with upsert:true so
-- re-uploading replaces the existing file instead of accumulating orphaned
-- old ones.
--
-- users.avatar_url itself needs no new RLS — the existing "Users can update
-- their own row" policy from 0008_reviews.sql (auth.uid() = id) already
-- covers this column, and "Users are viewable by everyone" already covers
-- reading it.
--
-- HOW TO RUN THIS: paste into the Supabase Dashboard's SQL Editor and run,
-- or apply via `supabase db push`.

alter table public.users add column avatar_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880, -- 5MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "Public read access to avatars"
on storage.objects for select
using (bucket_id = 'avatars');

create policy "Users can upload their own avatar"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can update their own avatar"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can delete their own avatar"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);
