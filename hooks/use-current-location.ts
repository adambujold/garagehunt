import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

export type Coordinates = {
  latitude: number;
  longitude: number;
};

type LocationState = {
  coords: Coordinates | null;
  status: 'loading' | 'granted' | 'denied' | 'error';
};

const INITIAL_STATE: LocationState = { coords: null, status: 'loading' };

// Discover's map (which stays mounted in the background as a tab) plus
// screens like "I'm Looking For" and its Matches screen each call this hook
// independently. They used to each fire their own native location request —
// so a save on "I'm Looking For" that navigates straight to Matches while
// Discover is still mounted underneath meant 2-3 concurrent
// requestForegroundPermissionsAsync/getCurrentPositionAsync calls hitting
// expo-location's native module in the same instant. That's the likely
// cause of a native TurboModule crash seen in production crash logs at
// exactly that transition. Sharing one in-flight request (and caching the
// result) across every mounted instance means only one native call is ever
// made, no matter how many components use the hook at once.
let cachedState: LocationState | null = null;
let inFlightRequest: Promise<LocationState> | null = null;
const subscribers = new Set<(state: LocationState) => void>();

function notifySubscribers(state: LocationState) {
  cachedState = state;
  subscribers.forEach((listener) => listener(state));
}

function requestLocationOnce(): Promise<LocationState> {
  if (inFlightRequest) return inFlightRequest;

  inFlightRequest = (async () => {
    let result: LocationState;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        result = { coords: null, status: 'denied' };
      } else {
        const position = await Location.getCurrentPositionAsync({});
        result = {
          coords: { latitude: position.coords.latitude, longitude: position.coords.longitude },
          status: 'granted',
        };
      }
    } catch {
      result = { coords: null, status: 'error' };
    }
    inFlightRequest = null;
    notifySubscribers(result);
    return result;
  })();

  return inFlightRequest;
}

export function useCurrentLocation() {
  const [state, setState] = useState<LocationState>(cachedState ?? INITIAL_STATE);

  useEffect(() => {
    subscribers.add(setState);
    if (cachedState === null) {
      requestLocationOnce();
    }
    return () => {
      subscribers.delete(setState);
    };
  }, []);

  return state;
}
