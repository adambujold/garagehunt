-- GarageHunt — self-service account deletion, per
-- garagehunt-account-deletion.html's disclosed policy: hard-delete the
-- profile/listings/photos/favorites/check-ins, anonymize (not delete)
-- reviews so other users' ratings stay intact, and there are currently no
-- purchase/subscription records anywhere in this schema to retain (nothing
-- to do for that row of the disclosure table until such a feature exists).
--
-- HOW THIS WORKS: a single `delete from auth.users` cascades correctly
-- through virtually the entire schema, verified against every migration in
-- this project:
--   sale_listings, favorites, saved_searches, push_tokens — reference
--     auth.users directly, on delete cascade
--   public.users — references auth.users, on delete cascade, which in turn
--     cascades to everything that references public.users: check_ins (and
--     transitively buyer_ratings, via check_ins on delete cascade),
--     organizer_applications, town_wide_events (and transitively
--     event_join_requests), ai_suggestion_requests — all on delete cascade
--   listing_categories, listing_photos, matches, event_join_requests —
--     cascade from their own parent row (sale_listings/saved_searches/
--     town_wide_events) being deleted, one level removed from auth.users
--   sale_listings.event_id, cluster_suggestions.claimed_by_user_id — already
--     on delete set null from earlier migrations (0014, 0015), so a deleted
--     organizer's event disappearing doesn't take other sellers' still-live
--     listings with it
-- reviews is the one deliberate exception: its reviewer_id/seller_id FKs are
-- changed below from on delete cascade to on delete set null, specifically
-- so a deleted user's past reviews survive (anonymized) instead of being
-- removed — otherwise every rating they ever left or received would vanish
-- along with their account, corrupting other users' aggregate ratings.
-- buyer_ratings is NOT given the same treatment: unlike reviews, it doesn't
-- feed any aggregate visible to other users (shopper tier is derived purely
-- from users.buyer_checkin_count, per utils/shopper-tier.ts) and it's
-- structurally anchored to a specific check-in, which the disclosure already
-- calls out as hard-deleted — so letting it cascade away is consistent with
-- that, not a gap.
--
-- Listing photo files in Storage are NOT deleted by this function — Storage
-- object deletion has to go through the Storage API (not a raw
-- storage.objects row delete) to reliably remove the underlying blob, and
-- that requires the caller's own session/RLS. See utils/account-deletion.ts:
-- it removes every one of the user's listing photos from Storage first,
-- while their session and sale_listings rows still exist to satisfy that
-- bucket's ownership policy, and only then calls this function.
--
-- HOW TO RUN THIS: paste into the Supabase Dashboard's SQL Editor and run.

-- reviews: anonymize instead of cascading away -----------------------------

do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'public.reviews'::regclass
      and contype = 'f'
      and conname like '%reviewer_id%'
  loop
    execute format('alter table public.reviews drop constraint %I', con.conname);
  end loop;

  for con in
    select conname from pg_constraint
    where conrelid = 'public.reviews'::regclass
      and contype = 'f'
      and conname like '%seller_id%'
  loop
    execute format('alter table public.reviews drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.reviews alter column reviewer_id drop not null;
alter table public.reviews alter column seller_id drop not null;

alter table public.reviews
  add constraint reviews_reviewer_id_fkey foreign key (reviewer_id) references public.users (id) on delete set null;
alter table public.reviews
  add constraint reviews_seller_id_fkey foreign key (seller_id) references public.users (id) on delete set null;

-- delete_own_account -------------------------------------------------------
-- security definer so it can delete from auth.users, which the authenticated
-- role has no direct grant on — this is exactly why a client can't just be
-- given a DELETE policy on auth.users (or public.users) directly. Scoped
-- entirely to auth.uid(), so a caller can only ever delete their own
-- account, never anyone else's.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not signed in.';
  end if;

  delete from auth.users where id = v_user_id;
end;
$$;

grant execute on function public.delete_own_account to authenticated;
