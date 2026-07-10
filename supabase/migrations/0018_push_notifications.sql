-- GarageHunt — push notification infrastructure (technical architecture
-- doc Section 7). Scope of this pass: Matches only, via a Database Webhook
-- on `matches` insert calling a new Edge Function
-- (supabase/functions/send-match-notification). See that function's header
-- comment for the send flow, and utils/push-notifications.ts for the
-- client-side registration flow.
--
-- HOW TO RUN THIS: same as prior migrations — paste into the Supabase
-- Dashboard's SQL Editor and run.

-- users.notification_prefs --------------------------------------------------
-- A single push_enabled key for now — the Settings toggle built earlier
-- (utils/notification-prefs.ts) was a local-only AsyncStorage placeholder;
-- this makes it a real per-user preference that the send flow actually
-- checks. jsonb (not a plain boolean) so future preference types (e.g. a
-- digest-frequency setting) don't need a schema migration to add later —
-- the app only ever reads/writes the push_enabled key today.
alter table public.users
  add column notification_prefs jsonb not null default '{"push_enabled": true}'::jsonb;

-- push_tokens -----------------------------------------------------------

create type device_type as enum ('ios', 'android');

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  expo_push_token text not null,
  device_type device_type not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One user can have multiple tokens (e.g. testing on both iPhone and
  -- Android at once) — send to all of a user's active tokens, don't assume
  -- one device per account. This unique constraint is what makes the
  -- client's upsert-on-(user_id, expo_push_token) work: re-registering the
  -- same device on the same account updates its row (bumping updated_at)
  -- instead of accumulating duplicates.
  unique (user_id, expo_push_token)
);

create index push_tokens_user_id_idx on public.push_tokens (user_id);

create trigger push_tokens_set_updated_at
  before update on public.push_tokens
  for each row execute function public.set_updated_at();

alter table public.push_tokens enable row level security;

create policy "Users can view their own push tokens"
  on public.push_tokens for select
  using (auth.uid() = user_id);

create policy "Users can register their own push tokens"
  on public.push_tokens for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own push tokens"
  on public.push_tokens for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own push tokens"
  on public.push_tokens for delete
  using (auth.uid() = user_id);

-- No policy grants cross-user access here deliberately — the
-- send-match-notification Edge Function reads other users' tokens using the
-- service role key (auto-available to every Edge Function), which bypasses
-- RLS entirely rather than needing a security-definer bridge function like
-- candidate_saved_searches_for_listing did. That's appropriate here since
-- the Edge Function is only ever invoked by a Database Webhook, never
-- directly by a client.
