import { Coordinates } from '@/hooks/use-current-location';

// Live address type-ahead for List a Sale's address field. Calls Mapbox's
// Search Box API directly via fetch — the purpose-built successor to plain
// Geocoding for autocomplete UX (see mapbox-geocoding.ts's header comment on
// v5's POI data having moved here) — same "plain REST call, no native SDK"
// pattern as mapbox-directions.ts and mapbox-geocoding.ts.
// https://docs.mapbox.com/api/search/search-box/
//
// Two-step flow, both required: /suggest returns lightweight matches with no
// coordinates; /retrieve resolves one chosen suggestion to real
// coordinates. A session_token ties a suggest→retrieve sequence together for
// Mapbox's own billing purposes — generate one per typing session (see
// createSearchSessionToken), not per keystroke.

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

// Same reasoning as PROXIMITY_BBOX_DEGREES in mapbox-geocoding.ts — a
// garage sale address search is hyper-local to the seller's current position.
const PROXIMITY_BBOX_DEGREES = 0.5;

export type AddressSuggestion = {
  // Mapbox's id for this suggestion — passed to retrieveAddress, not a
  // stable identifier for anything else.
  id: string;
  label: string;
};

// Mapbox only requires this to be unique enough to group a session's
// requests together — Math.random is fine, this isn't security-sensitive.
export function createSearchSessionToken(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function suggestAddresses(
  query: string,
  sessionToken: string,
  proximityBias?: Coordinates
): Promise<AddressSuggestion[]> {
  if (!MAPBOX_TOKEN) {
    throw new Error('Missing EXPO_PUBLIC_MAPBOX_TOKEN — set it in a .env file at the project root.');
  }
  const trimmed = query.trim();
  if (!trimmed) return [];

  const params = new URLSearchParams({
    q: trimmed,
    access_token: MAPBOX_TOKEN,
    session_token: sessionToken,
    limit: '5',
    country: 'ca',
    // Restricts to individual street addresses — this field is for a sale's
    // location, not a region/place/POI lookup.
    types: 'address',
  });
  if (proximityBias) {
    params.set('proximity', `${proximityBias.longitude},${proximityBias.latitude}`);
    const d = PROXIMITY_BBOX_DEGREES;
    params.set(
      'bbox',
      [
        proximityBias.longitude - d,
        proximityBias.latitude - d,
        proximityBias.longitude + d,
        proximityBias.latitude + d,
      ].join(',')
    );
  }

  const response = await fetch(`https://api.mapbox.com/search/searchbox/v1/suggest?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Mapbox Search Box API request failed (${response.status}).`);
  }

  const data = await response.json();
  const suggestions = (data.suggestions ?? []) as {
    mapbox_id: string;
    name: string;
    full_address?: string;
    place_formatted?: string;
  }[];

  return suggestions.map((s) => ({
    id: s.mapbox_id,
    label: s.full_address ?? [s.name, s.place_formatted].filter(Boolean).join(', '),
  }));
}

export async function retrieveAddress(
  mapboxId: string,
  sessionToken: string
): Promise<{ address: string; coordinates: Coordinates }> {
  if (!MAPBOX_TOKEN) {
    throw new Error('Missing EXPO_PUBLIC_MAPBOX_TOKEN — set it in a .env file at the project root.');
  }

  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    session_token: sessionToken,
  });

  const response = await fetch(
    `https://api.mapbox.com/search/searchbox/v1/retrieve/${mapboxId}?${params.toString()}`
  );
  if (!response.ok) {
    throw new Error(`Mapbox Search Box API request failed (${response.status}).`);
  }

  const data = await response.json();
  const feature = data.features?.[0];
  if (!feature) {
    throw new Error("Couldn't load that address. Please try again.");
  }

  const [longitude, latitude] = feature.geometry.coordinates as [number, number];
  const address: string = feature.properties?.full_address ?? feature.properties?.name ?? '';
  return { address, coordinates: { latitude, longitude } };
}
