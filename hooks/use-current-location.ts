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

export function useCurrentLocation() {
  const [state, setState] = useState<LocationState>({ coords: null, status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function requestLocation() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!cancelled) setState({ coords: null, status: 'denied' });
          return;
        }
        const position = await Location.getCurrentPositionAsync({});
        if (!cancelled) {
          setState({
            coords: { latitude: position.coords.latitude, longitude: position.coords.longitude },
            status: 'granted',
          });
        }
      } catch {
        if (!cancelled) setState({ coords: null, status: 'error' });
      }
    }

    requestLocation();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
