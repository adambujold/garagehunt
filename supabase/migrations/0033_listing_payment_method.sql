-- GarageHunt — sale_listings.payment_method (feature spec Section 3's
-- "Payment accepted" field). Two values only: the vast majority of garage
-- sales are cash-only, so that's the default; a seller opts into showing
-- they'll also take e-Transfer, rather than the reverse (no "card" option —
-- physically tapping a card at a driveway sale isn't a realistic MVP case).
--
-- HOW TO RUN THIS: paste into the Supabase Dashboard's SQL Editor and run.

create type payment_method as enum ('cash_only', 'cash_and_etransfer');

alter table public.sale_listings
  add column payment_method payment_method not null default 'cash_only';
