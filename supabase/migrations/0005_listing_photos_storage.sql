-- GarageHunt — Supabase Storage bucket + policies for real listing photo
-- upload, plus the missing delete policy on listing_photos itself.
--
-- Mirrors docs/garage-sale-app-technical-architecture.md's note that photos
-- are the one large binary asset kept out of Postgres (object storage,
-- URL/key stored in listing_photos.storage_key). This replaces the
-- mock/placeholder photo grid noted in 0001's listing_photos comment.
--
-- Storage bucket creation + RLS on storage.objects can both be done via SQL
-- here — no dashboard-only step is required for this project.
--
-- HOW TO RUN THIS: same as 0001-0004 — paste into the Supabase Dashboard's
-- SQL Editor and run, or apply via `supabase db push`.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-photos',
  'listing-photos',
  true,
  5242880, -- 5MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Photos are uploaded to paths shaped "<listing_id>/<random-filename>" —
-- storage.foldername(name) splits the object path and returns the folder
-- segments, so (storage.foldername(name))[1] is the listing_id segment.
-- Matching that against sale_listings.seller_id is how these policies scope
-- writes to "your own listings" without needing a separate ownership table.

create policy "Public read access to listing photos"
on storage.objects for select
using (bucket_id = 'listing-photos');

create policy "Sellers can upload photos to their own listings"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'listing-photos'
  and exists (
    select 1 from public.sale_listings
    where sale_listings.id::text = (storage.foldername(name))[1]
      and sale_listings.seller_id = auth.uid()
  )
);

create policy "Sellers can delete photos from their own listings"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'listing-photos'
  and exists (
    select 1 from public.sale_listings
    where sale_listings.id::text = (storage.foldername(name))[1]
      and sale_listings.seller_id = auth.uid()
  )
);

-- listing_photos itself had select + insert policies from 0001 but no
-- delete policy — sellers removing a photo also need to delete its row.
create policy "Sellers can delete photos from their own listings"
  on public.listing_photos for delete
  using (
    exists (
      select 1 from public.sale_listings
      where sale_listings.id = listing_id
        and sale_listings.seller_id = auth.uid()
    )
  );
