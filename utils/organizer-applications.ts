import { supabase } from '@/utils/supabase';

// Mirrors organizer_applications from
// supabase/migrations/0012_organizer_applications.sql. Status only ever
// moves from 'pending' via a manual edit in the Supabase dashboard — there
// is no client-side path to approve/deny, by design (see that migration's
// header comment).
export type OrganizerApplicationStatus = 'pending' | 'approved' | 'denied';

export type OrganizerApplication = {
  id: string;
  fullName: string;
  neighborhood: string;
  affiliationNotes: string;
  status: OrganizerApplicationStatus;
  createdAt: string;
  // Whether the user has already been shown the one-time "approved!"
  // banner (see markOrganizerApplicationSeen) — the only field on this row
  // a client can update; see 0013_organizer_approval_sync_and_seen.sql for
  // why status itself can't be touched the same way.
  seenApproval: boolean;
};

// Only the most recent application matters for gating the form — a prior
// 'denied' application doesn't block resubmission (only 'pending'/'approved'
// do, per the screen's own logic), so the caller just needs the latest row.
export async function fetchLatestOrganizerApplication(userId: string): Promise<OrganizerApplication | null> {
  const { data, error } = await supabase
    .from('organizer_applications')
    .select('id, full_name, neighborhood, affiliation_notes, status, created_at, seen_approval')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    fullName: data.full_name,
    neighborhood: data.neighborhood,
    affiliationNotes: data.affiliation_notes,
    status: data.status,
    createdAt: data.created_at,
    seenApproval: data.seen_approval,
  };
}

// Marks the approval banner as shown so it doesn't resurface on the next
// Profile visit. Fire-and-forget from the caller's perspective is fine —
// worst case (the update fails) the banner just shows once more.
export async function markOrganizerApplicationSeen(applicationId: string): Promise<void> {
  const { error } = await supabase
    .from('organizer_applications')
    .update({ seen_approval: true })
    .eq('id', applicationId);
  if (error) throw error;
}

export async function submitOrganizerApplication(input: {
  userId: string;
  fullName: string;
  neighborhood: string;
  affiliationNotes: string;
}): Promise<void> {
  const { error } = await supabase.from('organizer_applications').insert({
    user_id: input.userId,
    full_name: input.fullName,
    neighborhood: input.neighborhood,
    affiliation_notes: input.affiliationNotes,
  });
  if (error) throw error;
}

export async function fetchIsVerifiedOrganizer(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('users')
    .select('is_verified_organizer')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data.is_verified_organizer;
}
