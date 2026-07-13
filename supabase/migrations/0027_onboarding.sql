-- First-time hybrid spotlight/concept-card tour (feature spec Section 2,
-- technical architecture doc line 51). Checked once at first Discover load
-- per signed-in user — never shown again once true, whether they finished
-- it or hit Skip.
alter table public.users
  add column has_completed_onboarding boolean not null default false;
