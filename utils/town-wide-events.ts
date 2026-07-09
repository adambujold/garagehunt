import { Coordinates } from '@/hooks/use-current-location';
import { haversineDistanceKm } from '@/utils/haversine';
import { deriveTitle } from '@/utils/sale-listings';
import { supabase } from '@/utils/supabase';

// Mirrors town_wide_events / event_join_requests from
// supabase/migrations/0014_town_wide_events.sql — see that migration's
// header comment for the radius-instead-of-polygon and no-origin-column
// deviations from the architecture doc.

export type TownWideEvent = {
  id: string;
  organizerId: string;
  name: string;
  centerLatitude: number;
  centerLongitude: number;
  radiusKm: number;
  startDate: string;
  endDate: string;
  joinRequestsEnabled: boolean;
  createdAt: string;
};

type DbEventRow = {
  id: string;
  organizer_id: string;
  name: string;
  center_latitude: number;
  center_longitude: number;
  radius_km: number;
  start_date: string;
  end_date: string;
  join_requests_enabled: boolean;
  created_at: string;
};

function mapEventRow(row: DbEventRow): TownWideEvent {
  return {
    id: row.id,
    organizerId: row.organizer_id,
    name: row.name,
    centerLatitude: row.center_latitude,
    centerLongitude: row.center_longitude,
    radiusKm: row.radius_km,
    startDate: row.start_date,
    endDate: row.end_date,
    joinRequestsEnabled: row.join_requests_enabled,
    createdAt: row.created_at,
  };
}

const EVENT_SELECT =
  'id, organizer_id, name, center_latitude, center_longitude, radius_km, start_date, end_date, join_requests_enabled, created_at';

export async function createTownWideEvent(input: {
  organizerId: string;
  name: string;
  centerLatitude: number;
  centerLongitude: number;
  radiusKm: number;
  startDate: string;
  endDate: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from('town_wide_events')
    .insert({
      organizer_id: input.organizerId,
      name: input.name,
      center_latitude: input.centerLatitude,
      center_longitude: input.centerLongitude,
      radius_km: input.radiusKm,
      start_date: input.startDate,
      end_date: input.endDate,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

export async function fetchOrganizerEvents(organizerId: string): Promise<TownWideEvent[]> {
  const { data, error } = await supabase
    .from('town_wide_events')
    .select(EVENT_SELECT)
    .eq('organizer_id', organizerId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as DbEventRow[]).map(mapEventRow);
}

export async function fetchEventById(id: string): Promise<TownWideEvent | null> {
  const { data, error } = await supabase.from('town_wide_events').select(EVENT_SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? mapEventRow(data as DbEventRow) : null;
}

// Counts a listing toward an event once its join request is approved (the
// same signal sale_listings.event_id being non-null already relies on), so
// this is just a plain count of sale_listings rows — see
// fetchListingsForEvent in sale-listings.ts for the fuller listing shape.
export async function fetchEventParticipantCount(eventId: string): Promise<number> {
  const { count, error } = await supabase
    .from('sale_listings')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('status', 'published');

  if (error) throw error;
  return count ?? 0;
}

// The "join a town-wide event?" step in List a Sale — matching happens in
// two passes, same philosophy as computeAndInsertMatches (SQL pre-filters
// what it can cheaply, e.g. date-overlap; the actual radius circle-distance
// check happens in the app layer, reusing haversineDistanceKm, rather than
// a second PostGIS-dependent implementation). Events are expected to be a
// small table, so fetching date-overlapping candidates and filtering
// client-side is simple and fine at this scale.
export async function findNearbyEvent(input: {
  latitude: number;
  longitude: number;
  startDate: string;
  endDate: string;
}): Promise<TownWideEvent | null> {
  const { data, error } = await supabase
    .from('town_wide_events')
    .select(EVENT_SELECT)
    .lte('start_date', input.endDate)
    .gte('end_date', input.startDate)
    .eq('join_requests_enabled', true);

  if (error) throw error;

  const candidates = ((data ?? []) as DbEventRow[]).map(mapEventRow);
  const origin: Coordinates = { latitude: input.latitude, longitude: input.longitude };
  const match = candidates.find(
    (event) =>
      haversineDistanceKm(origin, { latitude: event.centerLatitude, longitude: event.centerLongitude }) <=
      event.radiusKm
  );
  return match ?? null;
}

// Same date/radius matching as findNearbyEvent, but for Discover's buyer-
// facing event card(s) — returns every currently-relevant event near the
// buyer, not just the first one, since a buyer isn't choosing just one to
// join.
export async function findNearbyEventsForBuyer(origin: Coordinates): Promise<TownWideEvent[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase.from('town_wide_events').select(EVENT_SELECT).gte('end_date', today);

  if (error) throw error;

  const candidates = ((data ?? []) as DbEventRow[]).map(mapEventRow);
  return candidates.filter(
    (event) =>
      haversineDistanceKm(origin, { latitude: event.centerLatitude, longitude: event.centerLongitude }) <=
      event.radiusKm
  );
}

export type EventJoinRequest = {
  id: string;
  listingId: string;
  listingTitle: string;
  listingAddress: string;
  status: 'pending' | 'approved' | 'denied';
  createdAt: string;
};

type DbJoinRequestRow = {
  id: string;
  listing_id: string;
  status: 'pending' | 'approved' | 'denied';
  created_at: string;
  sale_listings: { address_text: string; title: string | null } | null;
};

export async function submitEventJoinRequest(input: {
  eventId: string;
  listingId: string;
  sellerId: string;
}): Promise<void> {
  const { error } = await supabase.from('event_join_requests').insert({
    event_id: input.eventId,
    listing_id: input.listingId,
    seller_id: input.sellerId,
  });
  if (error) throw error;
}

export async function fetchJoinRequestsForEvent(eventId: string): Promise<EventJoinRequest[]> {
  const { data, error } = await supabase
    .from('event_join_requests')
    .select('id, listing_id, status, created_at, sale_listings(address_text, title)')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return ((data ?? []) as unknown as DbJoinRequestRow[]).map((row) => ({
    id: row.id,
    listingId: row.listing_id,
    listingTitle: row.sale_listings
      ? row.sale_listings.title ?? deriveTitle(row.sale_listings.address_text)
      : 'Listing',
    listingAddress: row.sale_listings?.address_text ?? '',
    status: row.status,
    createdAt: row.created_at,
  }));
}

export async function updateEventJoinRequestStatus(
  requestId: string,
  status: 'approved' | 'denied'
): Promise<void> {
  const { error } = await supabase.from('event_join_requests').update({ status }).eq('id', requestId);
  if (error) throw error;
}

// An organizer-initiated invitation for a specific listing — surfaced on
// Edit Listing (see 0015_cluster_suggestions.sql's initiated_by column):
// unlike the seller-initiated "request to join" flow in List a Sale, this
// is something the seller didn't ask for and needs to actively accept or
// decline, via updateEventJoinRequestStatus above (the same function works
// for both flows — RLS is what distinguishes who's allowed to call it).
export type PendingInvitation = {
  id: string;
  eventId: string;
  eventName: string;
};

type DbPendingInvitationRow = {
  id: string;
  event_id: string;
  town_wide_events: { name: string } | null;
};

export async function fetchPendingInvitationForListing(listingId: string): Promise<PendingInvitation | null> {
  const { data, error } = await supabase
    .from('event_join_requests')
    .select('id, event_id, town_wide_events(name)')
    .eq('listing_id', listingId)
    .eq('initiated_by', 'organizer')
    .eq('status', 'pending')
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as DbPendingInvitationRow;
  return {
    id: row.id,
    eventId: row.event_id,
    eventName: row.town_wide_events?.name ?? 'a nearby event',
  };
}
