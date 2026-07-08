import { Coordinates } from '@/hooks/use-current-location';

// Calls the Mapbox Optimization API (v1) directly via fetch, per the
// technical architecture doc's decision to use Mapbox for routing. No native
// Mapbox SDK is installed — this is a plain REST call.
// https://docs.mapbox.com/api/navigation/optimization-v1/

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

export type OptimizedRoute = {
  // Stop order re-sorted into the optimized visiting order (excludes the
  // leading "current location" coordinate that anchors the trip).
  orderedStopIndexes: number[];
  distanceMeters: number;
  durationSeconds: number;
  // [longitude, latitude] pairs describing the route geometry, ready to hand
  // to a Polyline component.
  geometry: [number, number][];
};

export async function getOptimizedRoute(
  origin: Coordinates,
  stops: Coordinates[]
): Promise<OptimizedRoute> {
  if (!MAPBOX_TOKEN) {
    throw new Error(
      'Missing EXPO_PUBLIC_MAPBOX_TOKEN — set it in a .env file at the project root.'
    );
  }
  if (stops.length === 0) {
    throw new Error('At least one stop is required to plan a route.');
  }

  const coordinates = [origin, ...stops]
    .map((point) => `${point.longitude},${point.latitude}`)
    .join(';');

  const url =
    `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coordinates}` +
    `?roundtrip=false&source=first&destination=last&geometries=geojson&overview=full` +
    `&access_token=${MAPBOX_TOKEN}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Mapbox Optimization API request failed (${response.status}).`);
  }

  const data = await response.json();
  if (data.code !== 'Ok' || !data.trips?.[0]) {
    throw new Error(`Mapbox Optimization API returned no route (${data.code}).`);
  }

  const trip = data.trips[0];
  const orderedStopIndexes = (data.waypoints as { waypoint_index: number }[])
    .map((waypoint, originalIndex) => ({ waypoint, originalIndex }))
    // originalIndex 0 is the injected origin — drop it and shift stop indexes back to 0-based.
    .filter(({ originalIndex }) => originalIndex !== 0)
    .sort((a, b) => a.waypoint.waypoint_index - b.waypoint.waypoint_index)
    .map(({ originalIndex }) => originalIndex - 1);

  return {
    orderedStopIndexes,
    distanceMeters: trip.distance,
    durationSeconds: trip.duration,
    geometry: trip.geometry.coordinates as [number, number][],
  };
}
