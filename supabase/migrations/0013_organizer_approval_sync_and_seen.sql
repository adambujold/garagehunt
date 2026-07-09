-- GarageHunt — sync is_verified_organizer on approval + one-time approval banner
--
-- FIX 1: Profile's "Verified organizer" badge reads users.is_verified_organizer,
-- but the manual-review workflow only has the reviewer flip
-- organizer_applications.status in the Table Editor — two separate fields on
-- two separate tables, so approving an application never actually set the
-- flag the badge checks. This trigger keeps them in sync automatically: the
-- reviewer only ever needs to edit organizer_applications.status, same as
-- before, and is_verified_organizer follows it. Also backfills any
-- already-approved application from before this migration existed.
--
-- FIX 2: seen_approval lets the client mark that the user has already been
-- shown the one-time "approved!" banner. The actual enforcement that this
-- can't be abused to also change status is the column-level GRANT below —
-- an UPDATE RLS policy alone only gates which ROWS are visible to update,
-- not which COLUMNS, so restricting the grant to just this one column is
-- what stops a client from sneaking `status` into the same request.
--
-- HOW TO RUN THIS: same as prior migrations — paste into the Supabase
-- Dashboard's SQL Editor and run.

alter table public.organizer_applications add column if not exists seen_approval boolean not null default false;

drop policy if exists "Users can update their own application's seen_approval" on public.organizer_applications;
create policy "Users can update their own application's seen_approval"
  on public.organizer_applications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke update on public.organizer_applications from authenticated;
grant update (seen_approval) on public.organizer_applications to authenticated;

create or replace function public.sync_verified_organizer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' then
    update public.users set is_verified_organizer = true where id = new.user_id;
  elsif tg_op = 'UPDATE' and old.status = 'approved' and new.status <> 'approved' then
    update public.users set is_verified_organizer = false where id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists organizer_application_status_sync on public.organizer_applications;
create trigger organizer_application_status_sync
  after insert or update of status on public.organizer_applications
  for each row execute function public.sync_verified_organizer();

-- Backfill: sync any application already sitting at status='approved' from
-- testing before this trigger existed.
update public.users
set is_verified_organizer = true
where id in (select user_id from public.organizer_applications where status = 'approved');
