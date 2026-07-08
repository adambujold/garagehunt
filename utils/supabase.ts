import AsyncStorage from '@react-native-async-storage/async-storage';
import { SupportedStorage, createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import 'react-native-url-polyfill/auto';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — set them in a .env file at the project root.'
  );
}

// Expo Router's web output pre-renders on Node (no `window`) before hydrating
// in the browser. React Native's own polyfills alias `global.window` on both
// native and in-browser web, so this check isolates just that SSR pass and
// swaps in inert no-op storage there instead of letting AsyncStorage crash.
const isServer = typeof window === 'undefined';

const storage: SupportedStorage = isServer
  ? {
      getItem: async () => null,
      setItem: async () => {},
      removeItem: async () => {},
    }
  : AsyncStorage;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Pauses/resumes the session auto-refresh timer with app foreground state,
// per Supabase's React Native guidance.
if (!isServer) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
