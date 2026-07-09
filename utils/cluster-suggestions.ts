import { supabase } from '@/utils/supabase';

// Mirrors cluster_suggestions from supabase/migrations/0015_cluster_suggestions.sql.
// See that migration's header comment for the pull-based-detection and
// plain-lat/lng deviations from the architecture doc.
export type ClusterSuggestionStatus = 'suggested' | 'claimed' | 'dismissed' | 'expired';

export type ClusterSuggestion = {
  id: string;
  centerLatitude: number;
  centerLongitude: number;
  radiusM: number;
  dateFrom: string;
  dateTo: string;
  listingIds: string[];
  status: ClusterSuggestionStatus;
  claimedByUserId: string | null;
  createdEventId: string | null;
  createdAt: string;
};

type DbClusterSuggestionRow = {
  id: string;
  center_latitude: number;
  center_longitude: number;
  radius_m: number;
  date_from: string;
  date_to: string;
  listing_ids: string[];
  status: ClusterSuggestionStatus;
  claimed_by_user_id: string | null;
  created_event_id: string | null;
  created_at: string;
};

function mapClusterRow(row: DbClusterSuggestionRow): ClusterSuggestion {
  return {
    id: row.id,
    centerLatitude: row.center_latitude,
    centerLongitude: row.center_longitude,
    radiusM: row.radius_m,
    dateFrom: row.date_from,
    dateTo: row.date_to,
    listingIds: row.listing_ids,
    status: row.status,
    claimedByUserId: row.claimed_by_user_id,
    createdEventId: row.created_event_id,
    createdAt: row.created_at,
  };
}

const CLUSTER_SELECT =
  'id, center_latitude, center_longitude, radius_m, date_from, date_to, listing_ids, status, claimed_by_user_id, created_event_id, created_at';

// No user_id filter needed here — RLS itself only ever returns rows where
// one of the caller's own listings appears in listing_ids (see the
// migration's select policy), so this is just "the first active one," full
// stop. A seller could theoretically be in more than one cluster; MVP just
// surfaces whichever one comes back first.
export async function fetchActiveClusterForUser(): Promise<ClusterSuggestion | null> {
  const { data, error } = await supabase
    .from('cluster_suggestions')
    .select(CLUSTER_SELECT)
    .eq('status', 'suggested')
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? mapClusterRow(data as DbClusterSuggestionRow) : null;
}

export async function fetchClusterSuggestionById(id: string): Promise<ClusterSuggestion | null> {
  const { data, error } = await supabase
    .from('cluster_suggestions')
    .select(CLUSTER_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data ? mapClusterRow(data as DbClusterSuggestionRow) : null;
}

// Runs after a listing publishes (see utils/sale-listings.ts's call sites,
// same non-blocking-side-effect treatment as computeAndInsertMatches).
export async function detectClusterForListing(listingId: string): Promise<void> {
  const { error } = await supabase.rpc('detect_cluster_for_listing', { p_listing_id: listingId });
  if (error) throw error;
}

// Returns the new town_wide_events id — the caller navigates straight to
// the existing Phase 2 /organizer-event/[id] screen with it, reusing that
// screen rather than building a parallel one.
export async function claimClusterSuggestion(input: { clusterId: string; eventName: string }): Promise<string> {
  const { data, error } = await supabase.rpc('claim_cluster_suggestion', {
    p_cluster_id: input.clusterId,
    p_event_name: input.eventName,
  });
  if (error) throw error;
  return data as string;
}
