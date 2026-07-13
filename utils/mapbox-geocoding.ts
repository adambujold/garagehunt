import { Coordinates } from '@/hooks/use-current-location';

// Calls the Mapbox Geocoding API (v6, the current recommended version — v5
// is soft-deprecated and had its POI data split out to a separate Search
// Box API) directly via fetch, same "plain REST call, no native SDK" pattern
// as utils/mapbox-directions.ts.
// https://docs.mapbox.com/api/search/geocoding-v6/

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

// A garage sale is inherently hyper-local — the seller is opening the app
// from at or very near the sale address itself, unlike e.g. a search query
// that could reasonably be anywhere. Constraining results to within roughly
// this many degrees (~50km) of the seller's current position is a real,
// justified assumption, not an arbitrary narrowing.
const PROXIMITY_BBOX_DEGREES = 0.5;

// Resolves a free-text address (e.g. "42 Maple Street, London, ON") to real
// coordinates. Fixes a real bug: sale_listings.latitude/longitude used to
// always come from the seller's live device GPS at publish time, completely
// ignoring whatever address they typed — accurate only if the seller
// happened to be standing at the sale address when they hit Publish.
//
// proximityBias (optional) — the seller's rough current location. Used two
// ways: as a soft ranking bias (Mapbox's own `proximity` param) AND as a
// hard bounding box — confirmed by direct testing that proximity alone
// still let an incomplete address ("42 Maple Street, London", no province)
// resolve to a same-named street in a different province entirely; adding
// the bbox keeps results within a plausible local radius even when the
// typed address is ambiguous or incomplete.
export async function geocodeAddress(address: string, proximityBias?: Coordinates): Promise<Coordinates> {
  if (!MAPBOX_TOKEN) {
    throw new Error(
      'Missing EXPO_PUBLIC_MAPBOX_TOKEN — set it in a .env file at the project root.'
    );
  }
  const trimmed = address.trim();
  if (!trimmed) {
    throw new Error('Enter an address so buyers can find this sale.');
  }

  const params = new URLSearchParams({
    q: trimmed,
    access_token: MAPBOX_TOKEN,
    limit: '1',
    country: 'ca', // this app is Canada-wide (technical architecture doc) — bias out non-Canadian false matches
    autocomplete: 'false', // one-shot resolve, not a type-ahead suggestion list — avoid partial-token matches
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

  const response = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Mapbox Geocoding API request failed (${response.status}).`);
  }

  const data = await response.json();
  // A non-matching address is a 200 with an empty features array, not an
  // error status — has to be checked explicitly.
  const feature = data.features?.[0];
  if (!feature) {
    throw new Error("Couldn't find that address. Please check it and try again.");
  }

  // GeoJSON order is [longitude, latitude] — confirmed to hold for Mapbox's
  // response too, easy to accidentally transpose.
  const [longitude, latitude] = feature.geometry.coordinates as [number, number];
  return { latitude, longitude };
}
